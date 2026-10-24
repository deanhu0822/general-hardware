import type { FrozenRequest, RequestedSettings } from "./model";

/**
 * Versioned adaptive runtime-effort policy for the Opus 5.5 worker.
 *
 * "Adaptive" means this deterministic, versioned application code selects an
 * effort level from the set the pinned SDK and account actually support. It is
 * not an assumed SDK "auto" parameter. Every decision records a reason so the
 * run receipt can show policy version, requested/effective effort and why.
 *
 * Limits are cumulative per order across attempts, repair and escalation;
 * nothing here can reset a budget or a deadline.
 */
export const POLICY_VERSION = "caid.j12-effort-policy/1";

export const EFFORT_LEVELS = ["low", "medium", "high", "xhigh", "max"] as const;
export type EffortLevel = (typeof EFFORT_LEVELS)[number];
export const isEffortLevel = (v: unknown): v is EffortLevel => typeof v === "string" && (EFFORT_LEVELS as readonly string[]).includes(v);

export type PolicyConfig = {
  version: typeof POLICY_VERSION;
  /** Exact API model identifier verified through the pinned SDK (`supportedModels()` → resolvedModel). */
  model: string;
  /** Provisional default until an evaluation record selects the lowest qualifying effort. */
  defaultEffort: EffortLevel;
  /** Highest effort the policy may ever select, including escalation. "max" is an evaluated exception, never a default. */
  maxEffort: EffortLevel;
  /** Whether the default came from a frozen evaluation (false → provisional). */
  evaluated: boolean;
  evaluationId: string | null;
  /** Cumulative per-order ceiling in USD across all attempts, repair and escalation. */
  orderBudgetUsd: number;
  /** Minimum budget headroom required before dispatching any model call. */
  minReserveUsd: number;
  /** Cumulative tool-call limit per run attempt (repair and escalation share it). */
  maxToolCalls: number;
  /** Wall-clock deadline per run attempt (shared by repair/escalation). */
  deadlineMs: number;
  maxTurns: number;
  /** Predefined complexity criteria that start one level above the default. */
  complexity: { minSourcesForStepUp: number; minTotalBytesForStepUp: number };
};

export function policyConfig(env = process.env): PolicyConfig {
  const defaultEffort = env.CAID_RUNTIME_DEFAULT_EFFORT || "medium";
  const maxEffort = env.CAID_RUNTIME_MAX_EFFORT || "high";
  if (!isEffortLevel(defaultEffort)) throw new Error(`CAID_RUNTIME_DEFAULT_EFFORT must be one of ${EFFORT_LEVELS.join(", ")}.`);
  if (!isEffortLevel(maxEffort)) throw new Error(`CAID_RUNTIME_MAX_EFFORT must be one of ${EFFORT_LEVELS.join(", ")}.`);
  if (rank(maxEffort) < rank(defaultEffort)) throw new Error("CAID_RUNTIME_MAX_EFFORT must not be lower than CAID_RUNTIME_DEFAULT_EFFORT.");
  return {
    version: POLICY_VERSION,
    model: env.CAID_RUNTIME_MODEL || "claude-opus-5-5",
    defaultEffort,
    maxEffort,
    evaluated: env.CAID_RUNTIME_EFFORT_EVALUATED === "true",
    evaluationId: env.CAID_RUNTIME_EFFORT_EVALUATION_ID || null,
    orderBudgetUsd: clampNumber(env.CAID_RUN_BUDGET_USD, 3, 0.25, 50),
    minReserveUsd: clampNumber(env.CAID_RUN_MIN_RESERVE_USD, 0.25, 0.05, 10),
    maxToolCalls: Math.round(clampNumber(env.CAID_RUN_MAX_TOOL_CALLS, 12, 3, 40)),
    deadlineMs: Math.round(clampNumber(env.CAID_RUN_DEADLINE_MS, 600_000, 60_000, 3_600_000)),
    maxTurns: Math.round(clampNumber(env.CAID_RUN_MAX_TURNS, 40, 4, 120)),
    complexity: { minSourcesForStepUp: 6, minTotalBytesForStepUp: 120_000 },
  };
}

function clampNumber(raw: string | undefined, fallback: number, min: number, max: number) {
  const n = Number(raw);
  if (!raw || !Number.isFinite(n)) return fallback;
  return Math.min(max, Math.max(min, n));
}

export const rank = (e: EffortLevel) => EFFORT_LEVELS.indexOf(e);
export const nextLevel = (e: EffortLevel): EffortLevel | null => (rank(e) + 1 < EFFORT_LEVELS.length ? EFFORT_LEVELS[rank(e) + 1] : null);

/** Requested settings persisted on each run, derived from the policy. */
export function requestedFromPolicy(policy: PolicyConfig): RequestedSettings {
  return {
    provider: "anthropic-agent-sdk",
    model: policy.model,
    effort: policy.defaultEffort,
    contextWindow: 0, // learned from the SDK's modelUsage.contextWindow; never asserted up front
    maxTurns: policy.maxTurns,
    maxToolCalls: policy.maxToolCalls,
    maxBudgetUsd: policy.orderBudgetUsd,
    deadlineMs: policy.deadlineMs,
    repairAttempts: 1,
    policyVersion: policy.version,
  };
}

export type EffortSelection = {
  policyVersion: typeof POLICY_VERSION;
  effort: EffortLevel;
  reason: string;
  provisional: boolean;
  complexityStepUp: boolean;
};

/**
 * Select the starting effort for a run. Deterministic: default effort, stepped
 * up one level only when the frozen request meets predefined complexity
 * criteria, never above the policy maximum. The selection is marked
 * provisional until a frozen evaluation record exists.
 */
export function selectEffort(policy: PolicyConfig, frozen: Pick<FrozenRequest, "sources">, supported: readonly string[]): EffortSelection {
  const totalBytes = frozen.sources.reduce((n, s) => n + s.bytes, 0);
  const complex = frozen.sources.length >= policy.complexity.minSourcesForStepUp || totalBytes >= policy.complexity.minTotalBytesForStepUp;
  let effort: EffortLevel = policy.defaultEffort;
  let reason = policy.evaluated
    ? `default effort ${effort} selected by evaluation ${policy.evaluationId ?? "(unnamed)"}`
    : `provisional default effort ${effort}; no frozen evaluation has selected the lowest qualifying effort yet`;
  if (complex) {
    const up = nextLevel(effort);
    if (up && rank(up) <= rank(policy.maxEffort)) {
      effort = up;
      reason += `; stepped up one level because the frozen request meets predefined complexity criteria (${frozen.sources.length} sources, ${totalBytes} bytes)`;
    } else reason += `; complexity criteria met but the policy maximum ${policy.maxEffort} prevents a step-up`;
  }
  if (!supported.includes(effort)) throw new PolicyError(`Effort ${effort} is not supported by the verified model ${policy.model} (supported: ${supported.join(", ") || "none reported"}).`);
  return { policyVersion: policy.version, effort, reason, provisional: !policy.evaluated, complexityStepUp: complex && effort !== policy.defaultEffort };
}

export class PolicyError extends Error {}

export type RepairDecision =
  | { action: "repair"; effort: EffortLevel; reason: string }
  | { action: "escalate"; effort: EffortLevel; reason: string }
  | { action: "stop"; reason: string };

/** Validator error categories that indicate reasoning depth rather than formatting. */
const REASONING_FAILURE = /unsupported|needs at least 1 citation|cannot assert verified measurements|must include retaining|must include evaluating|must not assert that the change is approved|nextAction\.gapId/i;

/**
 * Decide the single second chance after a failed validation. The repair pass
 * and the escalation share one slot: a run gets exactly one of them. Escalation
 * requires (a) reasoning-type validator failures, (b) an eligible higher level
 * within the policy maximum and supported set, and (c) enough remaining budget
 * and time. Model self-confidence is never an input.
 */
export function decideSecondChance(
  policy: PolicyConfig,
  input: { errors: string[]; currentEffort: EffortLevel; secondChancesUsed: number; remainingBudgetUsd: number; remainingMs: number; supported: readonly string[] },
): RepairDecision {
  if (input.secondChancesUsed >= 1) return { action: "stop", reason: "the single repair/escalation pass was already used for this run" };
  if (input.remainingBudgetUsd < policy.minReserveUsd) return { action: "stop", reason: `remaining budget $${input.remainingBudgetUsd.toFixed(2)} is below the $${policy.minReserveUsd.toFixed(2)} reserve` };
  if (input.remainingMs < 60_000) return { action: "stop", reason: "less than one minute remains before the run deadline" };
  const reasoning = input.errors.filter((e) => REASONING_FAILURE.test(e));
  const up = nextLevel(input.currentEffort);
  if (reasoning.length >= 2 && up && rank(up) <= rank(policy.maxEffort) && input.supported.includes(up))
    return { action: "escalate", effort: up, reason: `${reasoning.length} validator failures indicate reasoning depth (e.g. "${reasoning[0].slice(0, 120)}"); escalating one level to ${up} within the same budget and deadline` };
  return { action: "repair", effort: input.currentEffort, reason: `${input.errors.length} validator error(s) are repairable at the same effort (${input.currentEffort})` };
}

/**
 * Budget available to a new attempt after everything the order already spent,
 * including failed attempts. Returns null when headroom is below the reserve.
 */
export function remainingOrderBudget(policy: PolicyConfig, spentUsd: number, ceilingOverrideUsd: number | null = null): number | null {
  const ceiling = ceilingOverrideUsd ?? policy.orderBudgetUsd;
  const remaining = Math.max(0, ceiling - spentUsd);
  return remaining >= policy.minReserveUsd ? Number(remaining.toFixed(4)) : null;
}

/** Validate a configured effort against the SDK-reported support before any spend. */
export function assertSupportedEffort(policy: PolicyConfig, supported: readonly string[]) {
  for (const level of [policy.defaultEffort, policy.maxEffort])
    if (!supported.includes(level)) throw new PolicyError(`Configured effort ${level} is not supported by ${policy.model} (supported: ${supported.join(", ") || "none"}).`);
}

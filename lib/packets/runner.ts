import {
  PacketError,
  validatePacket,
  type EffectiveSettings,
  type FrozenRequest,
  type Packet,
  type RequestedSettings,
} from "./model";
import {
  assertSupportedEffort,
  policyConfig,
  PolicyError,
  remainingOrderBudget,
  requestedFromPolicy,
  selectEffort,
  type EffortSelection,
  type PolicyConfig,
} from "./policy";
import type { PacketStore, RunRecord } from "./store";

/** Settings for a first attempt, derived from the versioned policy. */
export function defaultRequestedSettings(env = process.env): RequestedSettings {
  return requestedFromPolicy(policyConfig(env));
}

/**
 * Settings for a retry attempt. The budget is whatever the order has left
 * after every prior attempt; `null` means the ceiling is exhausted and the
 * owner must adjust it explicitly. A retry never changes the model and never
 * escalates on its own: escalation happens only inside a run under the policy.
 */
export function nextAttemptSettings(latest: RunRecord, spentUsd: number, ceilingOverrideUsd: number | null = null, env = process.env): RequestedSettings | null {
  const policy = policyConfig(env);
  const remaining = remainingOrderBudget(policy, spentUsd, ceilingOverrideUsd);
  if (remaining === null) return null;
  return { ...latest.requested, model: policy.model, effort: policy.defaultEffort, maxBudgetUsd: remaining, policyVersion: policy.version };
}

export class RunnerError extends Error {
  constructor(
    message: string,
    public kind: "canceled" | "budget" | "deadline" | "provider" | "validation" | "tool-limit" | "config",
  ) {
    super(message);
  }
}

export type RunnerCapabilities = {
  model: string;
  resolvedModel: string | null;
  supportedEffortLevels: string[];
  sdkVersion: string | null;
  account: Record<string, unknown> | null;
};

export type GenerateInput = {
  run: RunRecord;
  frozen: FrozenRequest;
  contents: Map<string, string>;
  requested: RequestedSettings;
  selection: EffortSelection;
  policy: PolicyConfig;
  supportedEffortLevels: string[];
  deadlineAt: number;
  signal: AbortSignal;
  isCanceled: () => boolean;
  onEvent: (stage: string, detail: string) => void;
  onProgress: (patch: { effective?: EffectiveSettings; costUsd?: number; inputTokens?: number; outputTokens?: number; toolCalls?: number; repairs?: number; escalations?: number }) => void;
};
export type GenerateOutput = {
  packetBody: Omit<Packet, "receipt">;
  effective: EffectiveSettings;
  costUsd: number | null;
  inputTokens: number | null;
  outputTokens: number | null;
  toolCalls: number;
  repairs: number;
  auxiliaryUsage?: Record<string, unknown>;
};
export type ClarifyInput = {
  frozen: FrozenRequest;
  contents: Map<string, string>;
  packet: Packet;
  question: string;
  requested: RequestedSettings;
  policy: PolicyConfig;
  signal: AbortSignal;
};
export type ClarifyOutput = {
  answer: string;
  citations: { sourceId: string; anchorId: string }[];
  effective: EffectiveSettings;
  costUsd: number | null;
  inputTokens: number | null;
  outputTokens: number | null;
  toolCalls: number;
  latencyMs: number;
};

/** The model adapter. The deterministic workflow around it owns all state. */
export interface PacketRunner {
  readonly name: string;
  /** origin recorded on every receipt this runner produces */
  readonly origin: "opus-run" | "test-double";
  capabilities(): Promise<RunnerCapabilities>;
  generate(input: GenerateInput): Promise<GenerateOutput>;
  clarify(input: ClarifyInput): Promise<ClarifyOutput>;
}

export const LEASE_MS = 90_000;

/**
 * Claim and execute at most one run. Every transition is persisted; a crash
 * between transitions leaves a lease that another worker recovers after it
 * expires, and publication is guarded by the lease owner and the frozen
 * manifest digest so a recovered duplicate can never publish twice.
 */
export async function runOnce(
  store: PacketStore,
  runner: PacketRunner,
  owner: string,
  opts: { leaseMs?: number; policy?: PolicyConfig } = {},
): Promise<RunRecord | undefined> {
  const leaseMs = opts.leaseMs ?? LEASE_MS;
  const policy = opts.policy ?? policyConfig();
  const run = store.claimRun(owner, leaseMs);
  if (!run) return undefined;
  const controller = new AbortController();
  const started = Date.now();
  const deadlineAt = started + run.requested.deadlineMs;
  const heartbeat = setInterval(() => {
    if (!store.renewLease(run.id, owner, leaseMs)) controller.abort(new RunnerError("Lease lost to another worker.", "provider"));
    if (store.isCancelRequested(run.id)) controller.abort(new RunnerError("Canceled by the customer.", "canceled"));
    if (Date.now() > deadlineAt) controller.abort(new RunnerError(`Run exceeded the ${Math.round(run.requested.deadlineMs / 60000)}-minute deadline.`, "deadline"));
  }, Math.min(5_000, Math.max(250, leaseMs / 6)));
  try {
    if (store.isCancelRequested(run.id)) throw new RunnerError("Canceled before the model started.", "canceled");
    const order = store.orderById(run.orderId);
    const entitlement = store.entitlementByOrder(run.orderId);
    if (!order || order.status !== "paid" || !entitlement?.active)
      throw new RunnerError("Order is not paid or the entitlement was revoked; refusing to spend model budget.", "config");
    if (store.packetForOrder(run.orderId)) throw new RunnerError("A packet was already delivered for this order.", "validation");
    const frozen = store.frozen(run.requestId, run.requestVersion);
    if (frozen.manifestDigest !== run.manifestDigest) throw new RunnerError("Frozen manifest digest does not match the run binding.", "config");
    const contents = store.frozenContents(frozen);
    store.event(run.id, "manifest-verified", `${frozen.sources.length} frozen sources re-hashed and verified (digest ${frozen.manifestDigest.slice(0, 12)}…).`);

    // Cumulative budget: reserve what the order has left before any dispatch.
    const spent = store.orderSpendUsd(run.orderId, run.id);
    const ceilingOverride = store.budgetCeilingOverride(run.orderId);
    const remaining = remainingOrderBudget(policy, spent, ceilingOverride);
    if (remaining === null)
      throw new RunnerError(`The order's cumulative model budget ($${(ceilingOverride ?? policy.orderBudgetUsd).toFixed(2)}) is exhausted after $${spent.toFixed(2)} of prior spend. An explicit owner budget adjustment is required; the customer is never charged again.`, "budget");
    const requested: RequestedSettings = { ...run.requested, maxBudgetUsd: Math.min(run.requested.maxBudgetUsd, remaining), model: policy.model, policyVersion: policy.version };

    // Verify the model and effort support through the pinned SDK before spending.
    const caps = await runner.capabilities();
    if (caps.resolvedModel && caps.resolvedModel !== policy.model)
      throw new RunnerError(`Runtime model mismatch: policy requires ${policy.model}, the SDK resolves "${caps.model}" to ${caps.resolvedModel}. Refusing to substitute.`, "config");
    try {
      assertSupportedEffort(policy, caps.supportedEffortLevels);
    } catch (error) {
      throw new RunnerError(error instanceof Error ? error.message : String(error), "config");
    }
    let selection: EffortSelection;
    try {
      selection = selectEffort(policy, frozen, caps.supportedEffortLevels);
    } catch (error) {
      if (error instanceof PolicyError) throw new RunnerError(error.message, "config");
      throw error;
    }
    requested.effort = selection.effort;
    store.reserveBudget(run.id, requested.maxBudgetUsd, requested);
    store.event(
      run.id,
      "policy-selected",
      `${selection.policyVersion}: start effort ${selection.effort}${selection.provisional ? " (provisional default; not yet selected by a frozen evaluation)" : ""}. ${selection.reason}. Reserved $${requested.maxBudgetUsd.toFixed(2)} (order ceiling $${policy.orderBudgetUsd.toFixed(2)}, prior spend $${spent.toFixed(2)}) · ≤${requested.maxToolCalls} tool calls · ≤${Math.round(requested.deadlineMs / 60000)} min · one repair/escalation pass.`,
    );
    store.event(run.id, "model-requested", `Requested ${requested.model} (SDK resolves ${caps.model} → ${caps.resolvedModel ?? "unknown"}; supported effort ${caps.supportedEffortLevels.join("/") || "unreported"}) via ${runner.name}.`);

    const output = await runner.generate({
      run,
      frozen,
      contents,
      requested,
      selection,
      policy,
      supportedEffortLevels: caps.supportedEffortLevels,
      deadlineAt,
      signal: controller.signal,
      isCanceled: () => store.isCancelRequested(run.id),
      onEvent: (stage, detail) => store.event(run.id, stage, detail),
      onProgress: (patch) => store.updateRunProgress(run.id, patch),
    });
    const validation = validatePacket(output.packetBody, frozen, contents);
    store.event(run.id, "validated", validation.ok ? validation.checks.join(" ") : `FAILED: ${validation.errors.slice(0, 5).join(" ")}`);
    if (!validation.ok) throw new RunnerError(`Validation failed after the repair pass: ${validation.errors.slice(0, 3).join(" ")}`, "validation");
    const finishedAt = new Date().toISOString();
    store.publishPacket(run.id, owner, output.packetBody, validation, {
      requested,
      effective: output.effective,
      startedAt: run.startedAt ?? new Date(started).toISOString(),
      completedAt: finishedAt,
      latencyMs: Date.now() - started,
      costUsd: output.costUsd,
      inputTokens: output.inputTokens,
      outputTokens: output.outputTokens,
      toolCalls: output.toolCalls,
      repairs: output.repairs,
      origin: runner.origin,
    });
  } catch (error) {
    const reason = controller.signal.aborted && controller.signal.reason instanceof RunnerError ? controller.signal.reason : error;
    const kind = reason instanceof RunnerError ? reason.kind : "provider";
    const message = reason instanceof Error ? reason.message : String(reason);
    if (kind === "canceled") store.finishRunFailed(run.id, owner, "canceled", `Canceled. ${message} Your paid entitlement is retained; you can retry.`);
    else if (kind === "validation" && /already delivered/.test(message)) store.finishRunFailed(run.id, owner, "failed", message);
    else
      store.finishRunFailed(
        run.id,
        owner,
        "failed",
        `${kind === "budget" ? "Budget exhausted" : kind === "deadline" ? "Deadline exceeded" : kind === "tool-limit" ? "Tool-call limit reached" : kind === "validation" ? "Validation failed" : kind === "config" ? "Configuration problem" : "Provider failure"}: ${message} Your paid entitlement is retained; retry does not charge again.`,
      );
    if (error instanceof PacketError && error.code === "delivered") {
      /* a recovered duplicate attempted to publish after another worker finished; the delivered packet wins */
    }
  } finally {
    clearInterval(heartbeat);
  }
  return store.run(run.id);
}

/** Long-running loop for a single-host worker. Stops when `signal` aborts. */
export async function workerLoop(store: PacketStore, runner: PacketRunner, owner: string, signal: AbortSignal, idleMs = 2000) {
  while (!signal.aborted) {
    let did: RunRecord | undefined;
    try {
      did = await runOnce(store, runner, owner);
    } catch (error) {
      console.error("[packet-worker] unexpected failure", error);
    }
    if (!did) await new Promise((r) => setTimeout(r, idleMs));
  }
}

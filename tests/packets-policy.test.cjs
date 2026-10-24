/* eslint-disable @typescript-eslint/no-require-imports */
const test = require("node:test");
const assert = require("node:assert/strict");
const { policyEnv } = require("./_ts-loader.cjs");
const { policyConfig, selectEffort, decideSecondChance, remainingOrderBudget, assertSupportedEffort, requestedFromPolicy, POLICY_VERSION } = require("../lib/packets/policy.ts");
const { fixtureFrozen } = require("../lib/packets/fixture.ts");

const ALL = ["low", "medium", "high", "xhigh", "max"];

test("the policy is versioned, resolves the exact model id and keeps max effort as an exception", () => {
  const p = policyConfig(policyEnv());
  assert.equal(p.version, POLICY_VERSION);
  assert.equal(p.model, "claude-opus-5-5");
  assert.equal(p.defaultEffort, "medium");
  assert.equal(p.maxEffort, "high");
  assert.equal(p.evaluated, false, "provisional until a frozen evaluation exists");
  const r = requestedFromPolicy(p);
  assert.equal(r.contextWindow, 0, "context capacity is learned from the SDK, never asserted");
  assert.equal(r.policyVersion, POLICY_VERSION);
  assert.equal(r.repairAttempts, 1);
  assert.throws(() => policyConfig(policyEnv({ CAID_RUNTIME_DEFAULT_EFFORT: "auto" })), /must be one of/);
  assert.throws(() => policyConfig(policyEnv({ CAID_RUNTIME_MAX_EFFORT: "low" })), /must not be lower/);
});

test("effort selection is deterministic: default, one complexity step-up, never above the maximum, never unsupported", () => {
  const p = policyConfig(policyEnv());
  const simple = selectEffort(p, fixtureFrozen, ALL);
  assert.equal(simple.effort, "medium");
  assert.equal(simple.provisional, true);
  assert.match(simple.reason, /provisional/);
  const big = { sources: Array.from({ length: 6 }, (_, i) => ({ sourceId: `S${i}`, bytes: 10 })) };
  const stepped = selectEffort(p, big, ALL);
  assert.equal(stepped.effort, "high");
  assert.equal(stepped.complexityStepUp, true);
  const capped = selectEffort(policyConfig(policyEnv({ CAID_RUNTIME_DEFAULT_EFFORT: "high", CAID_RUNTIME_MAX_EFFORT: "high" })), big, ALL);
  assert.equal(capped.effort, "high");
  assert.match(capped.reason, /policy maximum/);
  assert.throws(() => selectEffort(p, fixtureFrozen, ["low"]), /not supported by the verified model/);
  assert.throws(() => assertSupportedEffort(p, ["low", "medium"]), /high is not supported/);
  const evaluated = selectEffort(policyConfig(policyEnv({ CAID_RUNTIME_EFFORT_EVALUATED: "true", CAID_RUNTIME_EFFORT_EVALUATION_ID: "eval-2026-10-24" })), fixtureFrozen, ALL);
  assert.equal(evaluated.provisional, false);
  assert.match(evaluated.reason, /eval-2026-10-24/);
});

test("exactly one second chance: repair for format errors, escalation for reasoning errors, stop when budget/time/limit is gone", () => {
  const p = policyConfig(policyEnv());
  const base = { currentEffort: "medium", secondChancesUsed: 0, remainingBudgetUsd: 2, remainingMs: 300_000, supported: ALL };
  const format = decideSecondChance(p, { ...base, errors: ["summary.headline must be non-empty text of at most 300 characters.", "knownFacts ids must be unique."] });
  assert.equal(format.action, "repair");
  assert.equal(format.effort, "medium");
  const reasoning = decideSecondChance(p, { ...base, errors: ["affectedArtifacts[0] needs at least 1 citation.", "alternatives must include retaining/investigating the current J12 connector.", "x"] });
  assert.equal(reasoning.action, "escalate");
  assert.equal(reasoning.effort, "high");
  const atMax = decideSecondChance(p, { ...base, currentEffort: "high", errors: ["affectedArtifacts[0] needs at least 1 citation.", "alternatives must include evaluating a replacement."] });
  assert.equal(atMax.action, "repair", "cannot escalate above the policy maximum; repairs at the same effort instead");
  const unsupported = decideSecondChance(p, { ...base, supported: ["low", "medium"], errors: ["affectedArtifacts[0] needs at least 1 citation.", "alternatives must include evaluating a replacement."] });
  assert.equal(unsupported.action, "repair");
  assert.equal(decideSecondChance(p, { ...base, secondChancesUsed: 1, errors: ["x"] }).action, "stop");
  assert.equal(decideSecondChance(p, { ...base, remainingBudgetUsd: 0.1, errors: ["x"] }).action, "stop");
  assert.equal(decideSecondChance(p, { ...base, remainingMs: 1000, errors: ["x"] }).action, "stop");
});

test("budgets are cumulative across attempts and respect an explicit owner ceiling", () => {
  const p = policyConfig(policyEnv());
  assert.equal(remainingOrderBudget(p, 0), 3);
  assert.equal(remainingOrderBudget(p, 2.5), 0.5);
  assert.equal(remainingOrderBudget(p, 2.8), null, "below the reserve → no dispatch");
  assert.equal(remainingOrderBudget(p, 2.8, 10), 7.2, "owner adjustment raises the ceiling explicitly");
});

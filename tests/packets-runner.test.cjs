/* eslint-disable @typescript-eslint/no-require-imports */
const test = require("node:test");
const assert = require("node:assert/strict");
const { stores, policyEnv, paidOrder, rebind } = require("./_ts-loader.cjs");
const { runOnce, RunnerError, nextAttemptSettings } = require("../lib/packets/runner.ts");
const { policyConfig } = require("../lib/packets/policy.ts");
const { createTestDoubleRunner } = require("../lib/packets/test-double.ts");
const { fixturePacketBody } = require("../lib/packets/fixture.ts");

const policy = policyConfig(policyEnv());
const ALL = ["low", "medium", "high", "xhigh", "max"];
const caps = (over = {}) => ({ model: "opus", resolvedModel: "claude-opus-5-5", supportedEffortLevels: ALL, sdkVersion: "0.3.310", account: null, ...over });
const fake = (generate, over = {}) => ({ name: "fake", origin: "test-double", capabilities: async () => caps(over.caps), generate, clarify: async () => { throw new Error("not used"); } });
const effective = (effort) => ({ model: "claude-opus-5-5", effort, contextWindow: 200000, supportsEffort: true, supportedEffortLevels: ALL, sdkVersion: "0.3.310", claudeCodeVersion: null, apiKeySource: "test", permissionMode: "dontAsk", tools: [], betas: [], policyVersion: policy.version, selectionReason: "test", provisional: true, phases: [], escalations: 0 });

test("the deterministic test double publishes a labeled packet through the full worker path", async (t) => {
  const { store, alice } = stores(t);
  const { order } = paidOrder(store, alice);
  const run = await runOnce(store, createTestDoubleRunner(), "w1", { policy });
  assert.equal(run.status, "ready");
  const packet = store.packet(alice, order.id).packet;
  assert.equal(packet.receipt.origin, "test-double");
  assert.equal(packet.receipt.requested.effort, "medium");
  assert.equal(packet.receipt.effective.policyVersion, policy.version);
  assert.ok(packet.limitations.some((l) => /TEST DOUBLE/.test(l)));
  const stages = store.events(run.id).map((e) => e.stage);
  for (const s of ["queued", "running", "manifest-verified", "policy-selected", "model-requested", "validated", "ready"]) assert.ok(stages.includes(s), `missing stage ${s}: ${stages}`);
  assert.equal(await runOnce(store, createTestDoubleRunner(), "w1", { policy }), undefined, "nothing left to claim");
});

test("a worker crash persists a truthful failed state, keeps the entitlement and allows a retry without a charge", async (t) => {
  const { store, alice } = stores(t);
  const { order } = paidOrder(store, alice);
  const run = await runOnce(store, fake(async () => { throw new Error("socket hang up"); }), "w1", { policy });
  assert.equal(run.status, "failed");
  assert.match(run.error, /Provider failure: socket hang up.*entitlement is retained/);
  assert.equal(store.entitlementByOrder(order.id).active, true);
  const retry = store.retry(alice, order.id, (latest, spent) => nextAttemptSettings(latest, spent, null, policyEnv()));
  assert.equal(retry.attempt, 2);
  assert.equal(retry.requested.maxBudgetUsd, 3);
  const ok = await runOnce(store, createTestDoubleRunner(), "w2", { policy });
  assert.equal(ok.status, "ready");
  assert.equal(ok.attempt, 2);
  assert.equal(store.paymentEvents(order.id).length, 0);
});

test("cancellation during a run stops it at the next checkpoint and never publishes", async (t) => {
  const { store, alice } = stores(t);
  const { order } = paidOrder(store, alice);
  const runner = fake(async (input) => {
    store.requestCancel(alice, order.id);
    await new Promise((r) => setTimeout(r, 400));
    if (input.isCanceled() || input.signal.aborted) throw new RunnerError("Canceled by the customer.", "canceled");
    return { packetBody: fixturePacketBody, effective: effective("medium"), costUsd: 0.1, inputTokens: 1, outputTokens: 1, toolCalls: 1, repairs: 0 };
  });
  const run = await runOnce(store, runner, "w1", { policy, leaseMs: 1500 });
  assert.equal(run.status, "canceled");
  assert.equal(store.packetForOrder(order.id), undefined);
  assert.equal(store.entitlementByOrder(order.id).active, true);
});

test("the deadline aborts the run and is reported honestly", async (t) => {
  const { store, alice } = stores(t);
  const { order, run: queued } = paidOrder(store, alice);
  store.db.prepare("UPDATE pk_runs SET requested=? WHERE id=?").run(JSON.stringify({ ...queued.requested, deadlineMs: 300 }), queued.id);
  const runner = fake(async (input) => {
    await new Promise((resolve) => input.signal.addEventListener("abort", resolve, { once: true }));
    throw input.signal.reason;
  });
  const run = await runOnce(store, runner, "w1", { policy, leaseMs: 1500 });
  assert.equal(run.status, "failed");
  assert.match(run.error, /Deadline exceeded/);
  assert.equal(store.entitlementByOrder(order.id).active, true);
});

test("cumulative budget: spend across attempts is reserved before dispatch and exhaustion stops further work", async (t) => {
  const { store, alice, owner } = stores(t);
  const { order } = paidOrder(store, alice);
  const spender = fake(async (input) => {
    assert.equal(input.requested.maxBudgetUsd, 3, "first attempt gets the full ceiling");
    input.onProgress({ costUsd: 2.9 });
    throw new RunnerError("Packet failed validation after the single repair/escalation pass.", "validation");
  });
  const first = await runOnce(store, spender, "w1", { policy });
  assert.equal(first.status, "failed");
  assert.equal(store.orderSpendUsd(order.id), 2.9);
  assert.throws(() => store.retry(alice, order.id, (latest, spent) => nextAttemptSettings(latest, spent, null, policyEnv())), /budget is exhausted/);
  // Owner adjustment is the only way forward; the customer is never charged.
  store.adjustBudget(order.id, 6, owner, "support case");
  const retry = store.retry(alice, order.id, (latest, spent) => nextAttemptSettings(latest, spent, store.budgetCeilingOverride(order.id), policyEnv()));
  assert.equal(Number(retry.requested.maxBudgetUsd.toFixed(2)), 3.1);
  const checker = fake(async (input) => {
    assert.equal(Number(input.requested.maxBudgetUsd.toFixed(2)), 3.1, "second attempt only gets what remains");
    throw new RunnerError("still failing", "validation");
  });
  await runOnce(store, checker, "w1", { policy });
  // Without the override the worker itself refuses to dispatch when nothing remains.
  const { store: s2, alice: a2 } = stores(t);
  const { order: o2 } = paidOrder(s2, a2);
  s2.db.prepare("INSERT INTO pk_runs (id, order_id, request_id, request_version, manifest_digest, attempt, status, requested, cost_usd, created_at) SELECT 'prior', order_id, request_id, request_version, manifest_digest, 0, 'failed', requested, 2.95, created_at FROM pk_runs WHERE order_id=?").run(o2.id);
  const refused = await runOnce(s2, fake(async () => { throw new Error("must not be called"); }), "w1", { policy });
  assert.equal(refused.status, "failed");
  assert.match(refused.error, /Budget exhausted.*owner budget adjustment is required/);
});

test("unsupported effort or a model mismatch is a configuration failure before any spend", async (t) => {
  const { store, alice } = stores(t);
  paidOrder(store, alice);
  let called = false;
  const r1 = await runOnce(store, fake(async () => { called = true; }, { caps: { supportedEffortLevels: ["low"] } }), "w1", { policy });
  assert.equal(r1.status, "failed");
  assert.match(r1.error, /Configuration problem: Configured effort medium is not supported/);
  assert.equal(called, false);
  const { store: s2, alice: a2 } = stores(t);
  paidOrder(s2, a2);
  const r2 = await runOnce(s2, fake(async () => { called = true; }, { caps: { resolvedModel: "claude-sonnet-5-5" } }), "w1", { policy });
  assert.match(r2.error, /Runtime model mismatch.*Refusing to substitute/);
  assert.equal(called, false);
});

test("the policy-selected effort and reason are persisted on the run and the receipt", async (t) => {
  const { store, alice } = stores(t);
  const { order, frozen } = paidOrder(store, alice);
  const runner = fake(async (input) => {
    assert.equal(input.selection.effort, "medium");
    assert.match(input.selection.reason, /provisional/);
    const realFrozen = store.frozen(frozen.requestId, 1);
    return { packetBody: rebind(fixturePacketBody, realFrozen), effective: { ...effective("medium"), phases: [{ phase: "initial", effort: "medium", reason: input.selection.reason, costUsd: 0.4, inputTokens: 100, outputTokens: 50, toolCalls: 3, latencyMs: 10 }] }, costUsd: 0.4, inputTokens: 100, outputTokens: 50, toolCalls: 3, repairs: 0 };
  });
  const run = await runOnce(store, runner, "w1", { policy });
  assert.equal(run.status, "ready");
  assert.equal(run.costUsd, 0.4);
  assert.equal(run.budgetReservedUsd, 3);
  const receipt = store.packet(alice, order.id).packet.receipt;
  assert.equal(receipt.requested.effort, "medium");
  assert.equal(receipt.effective.phases[0].effort, "medium");
  assert.ok(store.events(run.id).some((e) => e.stage === "policy-selected" && /provisional default/.test(e.detail)));
});

test("a revoked order is never dispatched", async (t) => {
  const { store, alice } = stores(t);
  const { order } = paidOrder(store, alice);
  store.revoke(order.id, "refund");
  const run = await runOnce(store, fake(async () => { throw new Error("must not run"); }), "w1", { policy });
  assert.equal(run.status, "canceled");
});

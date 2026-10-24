/* eslint-disable @typescript-eslint/no-require-imports */
const test = require("node:test");
const assert = require("node:assert/strict");
const { stores, requestedSettings: requested, payment, draft, paidOrder, rebind } = require("./_ts-loader.cjs");
const { fixtureBrief, fixturePacketBody } = require("../lib/packets/fixture.ts");
const { validatePacket } = require("../lib/packets/model.ts");

test("every read is customer-scoped: another customer's ids are not found, never leaked", (t) => {
  const { store, alice, bob } = stores(t);
  const { r, order } = paidOrder(store, alice);
  assert.throws(() => store.request(bob, r.id), /not found/);
  assert.throws(() => store.sources(bob, r.id), /not found/);
  assert.throws(() => store.order(bob, order.id), /not found/);
  assert.throws(() => store.packet(bob, order.id), /not found/);
  assert.throws(() => store.clarifications(bob, order.id), /not found/);
  assert.throws(() => store.requireActiveEntitlement(bob, order.id), /not found/);
  assert.equal(store.listCustomerPackets(bob).length, 0);
  assert.equal(store.listCustomerPackets(alice).length, 1);
});

test("freezing makes the request immutable and binds the order to the manifest digest", (t) => {
  const { store, alice } = stores(t);
  const r = draft(store, alice);
  const frozen = store.freeze(alice, r.id);
  assert.equal(frozen.version, 1);
  assert.equal(frozen.sources.length, 3);
  assert.throws(() => store.updateBrief(alice, r.id, { ...fixtureBrief, title: "changed" }), /frozen/);
  assert.throws(() => store.addSource(alice, r.id, { name: "x", content: "late source text" }), /frozen/);
  assert.throws(() => store.removeSource(alice, r.id, "S1"), /frozen/);
  assert.deepEqual(store.freeze(alice, r.id), frozen, "freezing twice returns the same version");
  const clone = store.cloneRequest(alice, r.id);
  assert.equal(clone.frozenVersion, null);
  assert.equal(store.sources(alice, clone.id).length, 3);
});

test("preflight rejects an order before the boundary is acknowledged or sources exist", (t) => {
  const { store, alice } = stores(t);
  const r = store.createRequest(alice, { ...fixtureBrief, acknowledged: false });
  assert.throws(() => store.freeze(alice, r.id), /Confirm that paid delivery/);
  const r2 = store.createRequest(alice, fixtureBrief);
  assert.throws(() => store.freeze(alice, r2.id), /at least one readable source/);
});

test("one open order per frozen version; payment confirmation is idempotent and creates exactly one run", (t) => {
  const { store, alice } = stores(t);
  const r = draft(store, alice);
  const frozen = store.freeze(alice, r.id);
  const o1 = store.createOrder(alice, frozen, { id: "j12", amount: "29.00", currency: "usd" }, true, "simulated");
  const o2 = store.createOrder(alice, frozen, { id: "j12", amount: "29.00", currency: "usd" }, true, "simulated");
  assert.equal(o1.id, o2.id);
  const a = store.markPaid(o1.id, payment("pay_a"), requested(), 1);
  const b = store.markPaid(o1.id, payment("pay_a"), requested(), 1);
  assert.equal(a.created, true);
  assert.equal(b.created, false);
  assert.equal(a.run.id, b.run.id);
  assert.equal(store.runs(o1.id).length, 1);
  assert.equal(store.entitlementByOrder(o1.id).active, true);
  assert.equal(store.orderById(o1.id).whop.paymentId, "pay_a");
});

test("a late failure event never downgrades a paid order; revocation disables access and cancels queued work", (t) => {
  const { store, alice } = stores(t);
  const { order, run } = paidOrder(store, alice);
  store.markFailed(order.id, "failed");
  assert.equal(store.orderById(order.id).status, "paid");
  store.revoke(order.id, "refund: 29.00 usd (refund.created)");
  assert.equal(store.orderById(order.id).status, "refunded");
  assert.equal(store.entitlementByOrder(order.id).active, false);
  assert.equal(store.isCancelRequested(run.id), true);
  assert.throws(() => store.requireActiveEntitlement(alice, order.id), /revoked/);
  store.revoke(order.id, "refund again");
  assert.equal(store.orderById(order.id).status, "refunded");
});

test("publication requires the lease, a passing validation, the same manifest and no prior delivery", (t) => {
  const { store, alice } = stores(t);
  const { order, run, frozen } = paidOrder(store, alice);
  const claimed = store.claimRun("worker-a", 60_000);
  assert.equal(claimed.id, run.id);
  const contents = store.frozenContents(store.frozen(frozen.requestId, 1));
  const realFrozen = store.frozen(frozen.requestId, 1);
  // Rebind the fixture body to the real frozen manifest (source ids S1..S3, hashes identical by content).
  const body = rebind(fixturePacketBody, realFrozen);
  const v = validatePacket(body, realFrozen, contents);
  assert.equal(v.ok, true, v.errors.join("\n"));
  const receipt = { requested: requested(), effective: null, startedAt: new Date().toISOString(), completedAt: new Date().toISOString(), latencyMs: 1, costUsd: 0.5, inputTokens: 10, outputTokens: 5, toolCalls: 3, repairs: 0, origin: "test-double" };
  assert.throws(() => store.publishPacket(run.id, "worker-b", body, v, receipt), /no longer holds its lease/);
  assert.throws(() => store.publishPacket(run.id, "worker-a", body, { ok: false, errors: ["x"], checks: [] }, receipt), /Validation failed/);
  const published = store.publishPacket(run.id, "worker-a", body, v, receipt);
  assert.equal(published.version, 1);
  assert.equal(store.run(run.id).status, "ready");
  assert.throws(() => store.publishPacket(run.id, "worker-a", body, v, receipt), /no longer holds its lease|already delivered/);
  assert.equal(store.packet(alice, order.id).digest, published.digest);
  assert.throws(() => store.retry(alice, order.id, () => requested()), /already delivered/);
  // Engineering heads are untouched by packet delivery.
  assert.equal(store.changes.head("rover-alpha"), 0);
  assert.equal(store.changes.revisions().length, 0);
});

test("lease recovery: a crashed worker's run is reclaimed once the lease expires and the stale owner cannot finish it", async (t) => {
  const { store, alice } = stores(t);
  const { run } = paidOrder(store, alice);
  const a = store.claimRun("worker-a", 10);
  assert.equal(a.id, run.id);
  assert.equal(store.claimRun("worker-b", 10), undefined, "lease still held");
  await new Promise((r) => setTimeout(r, 30));
  const b = store.claimRun("worker-b", 60_000);
  assert.equal(b.id, run.id);
  assert.equal(store.renewLease(run.id, "worker-a", 60_000), false);
  store.finishRunFailed(run.id, "worker-a", "failed", "stale worker");
  assert.equal(store.run(run.id).status, "running", "stale owner cannot change the status");
  assert.ok(store.events(run.id).some((e) => e.stage === "lease-recovered"));
});

test("retry after failure keeps the entitlement, charges nothing and honours the cumulative budget", (t) => {
  const { store, alice } = stores(t);
  const { order, run } = paidOrder(store, alice);
  store.claimRun("w", 60_000);
  store.updateRunProgress(run.id, { costUsd: 2.9 });
  store.finishRunFailed(run.id, "w", "failed", "provider failure");
  assert.equal(store.entitlementByOrder(order.id).active, true);
  assert.equal(store.orderSpendUsd(order.id), 2.9);
  assert.throws(() => store.retry(alice, order.id, (latest, spent) => (spent > 2.75 ? null : latest.requested)), /budget is exhausted/);
  assert.equal(store.runs(order.id).length, 1);
  const second = store.retry(alice, order.id, (latest) => ({ ...latest.requested, maxBudgetUsd: 0.1 }));
  assert.equal(second.attempt, 2);
  assert.equal(second.budgetReservedUsd, 0.1);
  assert.throws(() => store.retry(alice, order.id, (l) => l.requested), /already in progress/);
  assert.equal(store.orderById(order.id).status, "paid");
  assert.equal(store.paymentEvents(order.id).length, 0, "no payment event was created by a retry");
});

test("cancellation before claim is terminal and keeps the entitlement; cancel during a run sets the flag", (t) => {
  const { store, alice } = stores(t);
  const { order, run } = paidOrder(store, alice);
  const canceled = store.requestCancel(alice, order.id);
  assert.equal(canceled.status, "canceled");
  assert.equal(store.entitlementByOrder(order.id).active, true);
  const again = store.retry(alice, order.id, (l) => l.requested);
  store.claimRun("w", 60_000);
  store.requestCancel(alice, order.id);
  assert.equal(store.isCancelRequested(again.id), true);
  assert.equal(store.run(again.id).status, "running");
  assert.equal(store.run(run.id).status, "canceled");
});

test("clarification slots are reserved atomically and released on provider failure", (t) => {
  const { store, alice } = stores(t);
  const { order, run, frozen } = paidOrder(store, alice);
  store.claimRun("w", 60_000);
  const realFrozen = store.frozen(frozen.requestId, 1);
  const body = rebind(fixturePacketBody, realFrozen);
  const v = validatePacket(body, realFrozen, store.frozenContents(realFrozen));
  store.publishPacket(run.id, "w", body, v, { requested: requested(), effective: null, startedAt: "a", completedAt: "b", latencyMs: 1, costUsd: 0, inputTokens: 0, outputTokens: 0, toolCalls: 0, repairs: 0, origin: "test-double" });
  const c = store.openClarification(alice, order.id, "What is missing?");
  assert.throws(() => store.openClarification(alice, order.id, "Another?"), /limit/);
  store.failClarification(c.id, "provider down");
  assert.equal(store.entitlement(alice, order.id).clarificationsUsed, 0);
  const c2 = store.openClarification(alice, order.id, "Retry question");
  store.answerClarification(c2.id, "Answer", [], { origin: "test-double" });
  assert.equal(store.clarifications(alice, order.id).filter((x) => x.status === "answered").length, 1);
});

test("demo sign-in creates the shared customer once and reuses it", (t) => {
  const { store } = stores(t);
  const account = { name: "Demo customer", email: "demo@caid.test", password: "demo-packet-2026" };
  const first = store.signInDemo(account);
  const second = store.signInDemo(account);
  assert.equal(first.user.role, "customer");
  assert.equal(second.user.id, first.user.id);
  assert.equal(store.user(first.token).email, account.email);
  assert.throws(() => store.signInDemo({ ...account, password: "a-different-password" }), /different password/);
});

test("owner budget adjustment is explicit and owner-only", (t) => {
  const { store, alice, owner } = stores(t);
  const { order } = paidOrder(store, alice);
  assert.throws(() => store.adjustBudget(order.id, 10, alice, "nope"), /Only the owner/);
  store.adjustBudget(order.id, 10, owner, "customer support case");
  assert.equal(store.budgetCeilingOverride(order.id), 10);
});

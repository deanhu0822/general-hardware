/* eslint-disable @typescript-eslint/no-require-imports */
const test = require("node:test");
const assert = require("node:assert/strict");
const { stores, paidOrder, rebind, changeContent } = require("./_ts-loader.cjs");
const { validatePacket } = require("../lib/packets/model.ts");
const { fixturePacketBody } = require("../lib/packets/fixture.ts");

/** The original engineering gates must survive the packet business unchanged. */
test("customer accounts cannot be assigned as reviewers and cannot approve anything", (t) => {
  const { changes, owner, reviewer, alice } = stores(t);
  assert.throws(() => changes.create(owner, "rover-alpha", changeContent([alice.id])), /Customer accounts cannot review/);
  const change = changes.create(owner, "rover-alpha", changeContent([reviewer.id]));
  assert.throws(() => changes.mutate(alice, change.id, change.version, "review", { decision: "approve", note: "paid customer approval attempt" }), /Only an assigned independent reviewer/);
  assert.throws(() => changes.mutate(alice, change.id, change.version, "edit", { content: change.content }), /Only the author/);
});

test("packet delivery never advances a product head, creates a revision or changes a change's status", (t) => {
  const { store, changes, owner, reviewer, alice } = stores(t);
  const change = changes.create(owner, "rover-alpha", changeContent([reviewer.id]));
  const { order, run, frozen } = paidOrder(store, alice);
  store.claimRun("w", 60_000);
  const realFrozen = store.frozen(frozen.requestId, 1);
  const body = rebind(fixturePacketBody, realFrozen);
  const v = validatePacket(body, realFrozen, store.frozenContents(realFrozen));
  store.publishPacket(run.id, "w", body, v, { requested: run.requested, effective: null, startedAt: "a", completedAt: "b", latencyMs: 1, costUsd: 0, inputTokens: 0, outputTokens: 0, toolCalls: 0, repairs: 0, origin: "test-double" });
  assert.equal(store.packet(alice, order.id).packet.summary.requestVersion, 1);
  assert.equal(changes.head("rover-alpha"), 0);
  assert.equal(changes.revisions().length, 0);
  assert.equal(changes.get(change.id).status, "draft");
  assert.equal(changes.get(change.id).version, 1);
  assert.equal(changes.events(change.id).length, 1, "no engineering event was written by fulfillment");
});

test("stale-version and author/reviewer separation gates are intact", (t) => {
  const { changes, owner, reviewer } = stores(t);
  const change = changes.create(owner, "rover-alpha", changeContent([reviewer.id]));
  assert.throws(() => changes.mutate(owner, change.id, 99, "edit", { content: change.content }), /updated elsewhere/);
  assert.throws(() => changes.mutate(owner, change.id, change.version, "review", { decision: "approve", note: "self" }), /Only an assigned independent reviewer/);
  assert.throws(() => changes.mutate(owner, change.id, change.version, "save", {}), /All checks and assigned independent reviews/);
});

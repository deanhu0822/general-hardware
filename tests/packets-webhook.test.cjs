/* eslint-disable @typescript-eslint/no-require-imports */
const test = require("node:test");
const assert = require("node:assert/strict");
const { stores, policyEnv, draft } = require("./_ts-loader.cjs");
const { SimulatedPaymentProvider, processWebhook, applyAuthoritativePayment, normalizeEvent } = require("../lib/packets/whop.ts");
const { requestedFromPolicy, policyConfig } = require("../lib/packets/policy.ts");

const settings = () => ({ requested: requestedFromPolicy(policyConfig(policyEnv())), clarificationLimit: 1 });
const SECRET = "simulated-webhook-secret-for-tests";

async function pendingOrder(t) {
  const s = stores(t);
  const provider = new SimulatedPaymentProvider(s.store, SECRET);
  const r = draft(s.store, s.alice);
  const frozen = s.store.freeze(s.alice, r.id);
  const order = s.store.createOrder(s.alice, frozen, { id: "j12", amount: "29.00", currency: "usd" }, true, "simulated");
  const checkout = await provider.createCheckout(order, { redirectUrl: "http://x/return" });
  s.store.attachCheckout(order.id, { checkoutId: checkout.checkoutId, checkoutUrl: checkout.checkoutUrl, planId: checkout.planId, productId: checkout.productId, companyId: provider.companyId });
  return { ...s, provider, order: s.store.orderById(order.id) };
}

test("a forged or tampered webhook is rejected and nothing is fulfilled", async (t) => {
  const { store, provider, order } = await pendingOrder(t);
  const forged = { body: JSON.stringify({ id: "evt_forged", type: "payment.succeeded", data: { payment_id: `pay_sim_${order.id.slice(0, 8)}`, metadata: { orderId: order.id } } }), headers: { "webhook-id": "evt_forged", "x-sim-timestamp": String(Math.floor(Date.now() / 1000)), "x-sim-signature": "00".repeat(32) } };
  const out = await processWebhook(store, provider, forged.body, forged.headers, settings());
  assert.equal(out.status, 400);
  assert.match(out.result, /invalid signature/);
  const signed = provider.sign({ id: "evt_t", type: "payment.succeeded", data: { payment_id: "pay_x", metadata: { orderId: order.id } } });
  const tampered = await processWebhook(store, provider, signed.body.replace("payment.succeeded", "payment.failed"), signed.headers, settings());
  assert.equal(tampered.status, 400);
  const stale = provider.sign({ id: "evt_old", type: "payment.succeeded", data: {} }, String(Math.floor(Date.now() / 1000) - 3600));
  assert.equal((await processWebhook(store, provider, stale.body, stale.headers, settings())).status, 400);
  assert.equal(store.orderById(order.id).status, "checkout_pending");
  assert.equal(store.entitlementByOrder(order.id), undefined);
  assert.equal(store.runs(order.id).length, 0);
});

test("a redirect or client flag never fulfils: only the authoritative provider state marks the order paid", async (t) => {
  const { store, provider, order } = await pendingOrder(t);
  // A signed event that claims success while the provider still reports the payment as open.
  const claim = provider.sign({ id: "evt_claim", type: "payment.succeeded", data: { payment_id: `pay_sim_${order.id.slice(0, 8)}`, metadata: { orderId: order.id } } });
  const out = await processWebhook(store, provider, claim.body, claim.headers, settings());
  assert.equal(out.status, 200);
  assert.match(out.result, /pending: .* is open/);
  assert.equal(store.orderById(order.id).status, "checkout_pending");
  // Now the provider state is actually paid.
  const paid = provider.simulate(order.id, "pay");
  const out2 = await processWebhook(store, provider, paid.body, paid.headers, settings());
  assert.match(out2.result, /paid: run .* queued/);
  assert.equal(store.orderById(order.id).status, "paid");
  assert.equal(store.runs(order.id).length, 1);
});

test("duplicate deliveries are deduplicated by event id and never create a second run", async (t) => {
  const { store, provider, order } = await pendingOrder(t);
  const paid = provider.simulate(order.id, "pay");
  await processWebhook(store, provider, paid.body, paid.headers, settings());
  const dup = await processWebhook(store, provider, paid.body, paid.headers, settings());
  assert.match(dup.result, /duplicate/);
  const again = provider.simulate(order.id, "pay"); // new event id, same payment
  const out = await processWebhook(store, provider, again.body, again.headers, settings());
  assert.match(out.result, /already fulfilled/);
  assert.equal(store.runs(order.id).length, 1);
  assert.equal(store.paymentEvents(order.id).length, 2);
});

test("delayed and out-of-order events converge: a late failure cannot undo a paid order; a late success still fulfils", async (t) => {
  const { store, provider, order } = await pendingOrder(t);
  const fail = provider.simulate(order.id, "fail"); // provider state: uncollectible (before any payment)
  const paidEvent = provider.simulate(order.id, "pay"); // provider state now paid; event created second
  // Deliver the success first, then the stale failure.
  await processWebhook(store, provider, paidEvent.body, paidEvent.headers, settings());
  assert.equal(store.orderById(order.id).status, "paid");
  const late = await processWebhook(store, provider, fail.body, fail.headers, settings());
  assert.match(late.result, /already fulfilled|paid/);
  assert.equal(store.orderById(order.id).status, "paid", "authoritative state wins over the stale event");
  // Another order: the failure arrives while the provider says uncollectible → order failed; a later success restores nothing without payment.
  const { store: s2, provider: p2, order: o2 } = await pendingOrder(t);
  const f2 = p2.simulate(o2.id, "fail");
  await processWebhook(s2, p2, f2.body, f2.headers, settings());
  assert.equal(s2.orderById(o2.id).status, "failed");
});

test("wrong business, currency, amount or order binding is rejected", async (t) => {
  const { store, provider, order } = await pendingOrder(t);
  const wrongBiz = provider.sign({ id: "evt_biz", type: "payment.succeeded", company_id: "biz_SOMEONE_ELSE", data: { payment_id: `pay_sim_${order.id.slice(0, 8)}`, metadata: { orderId: order.id } } });
  assert.match((await processWebhook(store, provider, wrongBiz.body, wrongBiz.headers, settings())).result, /wrong business/);
  const base = { id: `pay_sim_${order.id.slice(0, 8)}`, status: "paid", paidAt: new Date().toISOString(), currency: "usd", totalAmount: "29.00", refundedAmount: null, checkoutConfigurationId: order.whop.checkoutId, metadata: { orderId: order.id }, companyId: provider.companyId, planId: "plan_sim_j12", productId: "prod_sim_j12" };
  assert.match(applyAuthoritativePayment(store, order, { ...base, totalAmount: "9.00" }, "payment.succeeded", settings()), /amount 9.00 does not match/);
  assert.match(applyAuthoritativePayment(store, order, { ...base, currency: "eur" }, "payment.succeeded", settings()), /currency eur does not match/);
  assert.match(applyAuthoritativePayment(store, order, { ...base, metadata: { orderId: "other" } }, "payment.succeeded", settings()), /not bound to order/);
  assert.match(applyAuthoritativePayment(store, order, { ...base, checkoutConfigurationId: "chk_other" }, "payment.succeeded", settings()), /belongs to checkout/);
  assert.match(applyAuthoritativePayment(store, order, { ...base, planId: "plan_other" }, "payment.succeeded", settings()), /plan plan_other does not match/);
  assert.equal(store.orderById(order.id).status, "checkout_pending");
  assert.match(applyAuthoritativePayment(store, order, base, "payment.succeeded", settings()), /paid: run/);
});

test("refund revokes access, cancels queued work and is idempotent", async (t) => {
  const { store, provider, order } = await pendingOrder(t);
  const paid = provider.simulate(order.id, "pay");
  await processWebhook(store, provider, paid.body, paid.headers, settings());
  const refund = provider.simulate(order.id, "refund");
  const out = await processWebhook(store, provider, refund.body, refund.headers, settings());
  assert.match(out.result, /access revoked after refund/);
  assert.equal(store.orderById(order.id).status, "refunded");
  assert.equal(store.entitlementByOrder(order.id).active, false);
  assert.equal(store.isCancelRequested(store.latestRun(order.id).id), true);
  const dup = provider.simulate(order.id, "refund");
  await processWebhook(store, provider, dup.body, dup.headers, settings());
  assert.equal(store.runs(order.id).length, 1);
});

test("payment never grants engineering authority", async (t) => {
  const { store, changes, alice, provider, order, reviewer } = await pendingOrder(t);
  const paid = provider.simulate(order.id, "pay");
  await processWebhook(store, provider, paid.body, paid.headers, settings());
  assert.equal(changes.users().find((u) => u.id === alice.id).role, "customer");
  assert.throws(() => changes.checkReviewers([alice.id], reviewer.id), /Customer accounts cannot review/);
});

test("normalizeEvent requires an id and type", () => {
  assert.throws(() => normalizeEvent({ type: "x" }), /no id/);
  assert.throws(() => normalizeEvent({ id: "e" }), /no type/);
  assert.equal(normalizeEvent({ id: "e", type: "payment.succeeded", data: { account_id: "biz_1" } }).companyId, "biz_1");
});

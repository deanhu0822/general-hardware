import { createHmac, randomUUID, timingSafeEqual } from "node:crypto";
import { PacketError, type RequestedSettings } from "./model";
import type { OrderRecord, PacketStore } from "./store";

/**
 * Whop is the payment and entitlement provider. It never grants engineering
 * authority. Everything here is server-side: the browser only receives a
 * checkout URL and never a success flag that the server trusts.
 */
export type ProviderPayment = {
  id: string;
  status: string; // Whop ReceiptStatus: draft|open|authorized|paid|pending|uncollectible|unresolved|void
  paidAt: string | null;
  currency: string | null;
  totalAmount: string | null; // major units as decimal string
  refundedAmount: string | null;
  checkoutConfigurationId: string | null;
  metadata: Record<string, unknown> | null;
  companyId: string | null;
  planId: string | null;
  productId: string | null;
};
export type CheckoutResult = { checkoutId: string; checkoutUrl: string; planId: string | null; productId: string | null };
export type VerifiedEvent = {
  id: string;
  type: string;
  timestamp: string | null;
  companyId: string | null;
  data: Record<string, unknown>;
};
export interface PaymentProvider {
  readonly configured: boolean;
  readonly sandbox: boolean;
  readonly companyId: string | null;
  createCheckout(order: OrderRecord, input: { redirectUrl: string; title: string; description: string }): Promise<CheckoutResult>;
  retrievePayment(paymentId: string): Promise<ProviderPayment | null>;
  /** Throws when the signature, timestamp or body is invalid. Must receive the raw body bytes. */
  verifyWebhook(rawBody: string, headers: Record<string, string>): VerifiedEvent;
}

export type WhopConfig = {
  apiKey: string | undefined;
  companyId: string | undefined;
  webhookSecret: string | undefined;
  productId: string | undefined;
  sandbox: boolean;
};
export function whopConfig(env = process.env): WhopConfig {
  return {
    apiKey: env.WHOP_API_KEY || undefined,
    companyId: env.WHOP_COMPANY_ID || undefined,
    webhookSecret: env.WHOP_WEBHOOK_SECRET || undefined,
    productId: env.WHOP_PRODUCT_ID || undefined,
    sandbox: env.WHOP_SANDBOX !== "false", // sandbox is the default until the owner opts into live
  };
}

const moneyToDecimal = (m: unknown): string | null => {
  if (!m || typeof m !== "object") return null;
  const { amount, decimals } = m as { amount?: unknown; decimals?: unknown };
  if (typeof amount !== "string" && typeof amount !== "number") return null;
  const n = Number(amount);
  if (!Number.isFinite(n)) return null;
  // Whop Money.amount is already in major units ("29.00"); decimals describes display precision.
  return n.toFixed(typeof decimals === "number" ? Math.min(decimals, 2) : 2);
};

export function paymentFromWhop(p: Record<string, unknown>): ProviderPayment {
  const total = p.total ?? p.presentment_total ?? p.usd_total;
  return {
    id: String(p.id),
    status: String(p.status ?? ""),
    paidAt: (p.paid_at as string | null) ?? null,
    currency: typeof p.currency === "string" ? p.currency.toLowerCase() : null,
    totalAmount: moneyToDecimal(total),
    refundedAmount: moneyToDecimal(p.refunded_amount),
    checkoutConfigurationId: (p.checkout_configuration_id as string | null) ?? null,
    metadata: (p.metadata as Record<string, unknown> | null) ?? null,
    companyId: (p.account_id as string | null) ?? (p.company_id as string | null) ?? null,
    planId: (p.plan_id as string | null) ?? null,
    productId: (p.product_id as string | null) ?? null,
  };
}

/** Real provider backed by the pinned @whop/sdk 2.6.0. Loaded lazily so tests and the sample path never import it. */
export async function whopProvider(config = whopConfig()): Promise<PaymentProvider> {
  const { WhopClient, WhopEnvironment } = await import("@whop/sdk");
  const { unwrapWebhook } = await import("@whop/sdk/helpers");
  const configured = !!(config.apiKey && config.companyId && config.webhookSecret);
  const client = config.apiKey
    ? new WhopClient({ token: config.apiKey, environment: config.sandbox ? WhopEnvironment.Sandbox : WhopEnvironment.Production })
    : null;
  return {
    configured,
    sandbox: config.sandbox,
    companyId: config.companyId ?? null,
    async createCheckout(order, input) {
      if (!client || !config.companyId) throw new PacketError("Payments are not configured on this server.", 503, "payments-unavailable");
      const cfg = await client.checkoutConfigurations.create({
        account_id: config.companyId,
        mode: "payment",
        currency: order.currency,
        metadata: { orderId: order.id, fulfillmentKey: order.fulfillmentKey, requestId: order.requestId, requestVersion: order.requestVersion },
        redirect_url: input.redirectUrl,
        plan: {
          product_id: config.productId ?? undefined,
          title: input.title,
          description: input.description,
          plan_type: "one_time",
          release_method: "buy_now",
          visibility: "quick_link",
          initial_price: Number(order.amount),
          currency: order.currency,
          metadata: { orderId: order.id },
        },
      });
      if (!cfg.purchase_url) throw new PacketError("Whop did not return a checkout URL.", 502, "payments-unavailable");
      return { checkoutId: cfg.id, checkoutUrl: cfg.purchase_url, planId: cfg.plan?.id ?? null, productId: config.productId ?? null };
    },
    async retrievePayment(paymentId) {
      if (!client) return null;
      try {
        const p = await client.payments.retrieve({ id: paymentId });
        return paymentFromWhop(p as unknown as Record<string, unknown>);
      } catch (error) {
        if (error && typeof error === "object" && "statusCode" in error && (error as { statusCode: number }).statusCode === 404) return null;
        throw error;
      }
    },
    verifyWebhook(rawBody, headers) {
      const parsed = unwrapWebhook<Record<string, unknown>>(rawBody, { headers, key: config.webhookSecret });
      return normalizeEvent(parsed, headers["webhook-id"]);
    },
  };
}

// ---------------------------------------------------------------------------
// Simulated sandbox provider: a labeled local test double.
//
// It exists so the complete paid-order path (checkout → signed webhook →
// deduplication → authoritative lookup → fulfillment → refund/revocation) can
// be exercised in automated verification and local demos without a Whop
// account. It never moves money, every order it creates is marked
// provider="simulated", and it refuses to load in production unless the
// operator sets CAID_ALLOW_SIMULATED_PAYMENTS=true explicitly.
// ---------------------------------------------------------------------------
export type SimulatedPaymentRow = { id: string; order_id: string; status: string; paid_at: string | null; amount: string; currency: string; refunded: string | null; checkout_id: string; metadata: string };

export class SimulatedPaymentProvider implements PaymentProvider {
  readonly configured = true;
  readonly sandbox = true;
  readonly companyId = "biz_SIMULATED_LOCAL";
  readonly name = "simulated";
  constructor(
    private readonly store: PacketStore,
    private readonly secret: string,
  ) {
    if (!secret || secret.length < 16) throw new PacketError("CAID_SIMULATED_WEBHOOK_SECRET must be at least 16 characters.", 500, "config");
    store.db.exec(
      "CREATE TABLE IF NOT EXISTS pk_sim_payments (id TEXT PRIMARY KEY, order_id TEXT NOT NULL, status TEXT NOT NULL, paid_at TEXT, amount TEXT NOT NULL, currency TEXT NOT NULL, refunded TEXT, checkout_id TEXT NOT NULL, metadata TEXT NOT NULL)",
    );
  }
  async createCheckout(order: OrderRecord, input: { redirectUrl: string }): Promise<CheckoutResult> {
    const checkoutId = `chk_sim_${order.id.slice(0, 8)}`;
    const paymentId = `pay_sim_${order.id.slice(0, 8)}`;
    this.store.db
      .prepare("INSERT OR IGNORE INTO pk_sim_payments VALUES (?,?,?,?,?,?,?,?,?)")
      .run(paymentId, order.id, "open", null, order.amount, order.currency, null, checkoutId, JSON.stringify({ orderId: order.id, fulfillmentKey: order.fulfillmentKey, redirectUrl: input.redirectUrl }));
    return { checkoutId, checkoutUrl: `/checkout/simulated/${order.id}`, planId: "plan_sim_j12", productId: "prod_sim_j12" };
  }
  async retrievePayment(paymentId: string): Promise<ProviderPayment | null> {
    const row = this.store.db.prepare("SELECT * FROM pk_sim_payments WHERE id=?").get(paymentId) as SimulatedPaymentRow | undefined;
    if (!row) return null;
    return {
      id: row.id,
      status: row.status,
      paidAt: row.paid_at,
      currency: row.currency,
      totalAmount: Number(row.amount).toFixed(2),
      refundedAmount: row.refunded,
      checkoutConfigurationId: row.checkout_id,
      metadata: JSON.parse(row.metadata),
      companyId: this.companyId,
      planId: "plan_sim_j12",
      productId: "prod_sim_j12",
    };
  }
  /** Operator/test action on the simulated checkout page: moves provider state, then emits a signed webhook. */
  simulate(orderId: string, action: "pay" | "fail" | "refund" | "pending"): { body: string; headers: Record<string, string> } {
    const row = this.store.db.prepare("SELECT * FROM pk_sim_payments WHERE order_id=?").get(orderId) as SimulatedPaymentRow | undefined;
    if (!row) throw new PacketError("No simulated checkout exists for this order.", 404, "not_found");
    const at = new Date().toISOString();
    let type = "payment.pending";
    if (action === "pay") {
      this.store.db.prepare("UPDATE pk_sim_payments SET status='paid', paid_at=COALESCE(paid_at, ?) WHERE id=?").run(at, row.id);
      type = "payment.succeeded";
    } else if (action === "fail") {
      this.store.db.prepare("UPDATE pk_sim_payments SET status='uncollectible' WHERE id=? AND status<>'paid'").run(row.id);
      type = "payment.failed";
    } else if (action === "refund") {
      this.store.db.prepare("UPDATE pk_sim_payments SET refunded=? WHERE id=? AND status='paid'").run(Number(row.amount).toFixed(2), row.id);
      type = "refund.created";
    }
    return this.sign({ id: `evt_sim_${randomUUID()}`, type, timestamp: at, company_id: this.companyId, data: { payment_id: row.id, metadata: JSON.parse(row.metadata) } });
  }
  sign(event: Record<string, unknown>, timestamp = String(Math.floor(Date.now() / 1000))): { body: string; headers: Record<string, string> } {
    const body = JSON.stringify(event);
    const sig = createHmac("sha256", this.secret).update(`${timestamp}.${body}`).digest("hex");
    return { body, headers: { "webhook-id": String(event.id), "x-sim-timestamp": timestamp, "x-sim-signature": sig, "content-type": "application/json" } };
  }
  verifyWebhook(rawBody: string, headers: Record<string, string>): VerifiedEvent {
    const ts = headers["x-sim-timestamp"];
    const sig = headers["x-sim-signature"];
    if (!ts || !sig || !/^\d+$/.test(ts)) throw new PacketError("Missing simulated webhook signature headers.", 400, "webhook");
    if (Math.abs(Date.now() / 1000 - Number(ts)) > 300) throw new PacketError("Simulated webhook timestamp outside the 5-minute tolerance.", 400, "webhook");
    const expected = createHmac("sha256", this.secret).update(`${ts}.${rawBody}`).digest("hex");
    const a = Buffer.from(expected, "hex");
    const b = Buffer.from(/^[0-9a-f]+$/i.test(sig) ? sig : "00", "hex");
    if (a.length !== b.length || !timingSafeEqual(a, b)) throw new PacketError("Simulated webhook signature mismatch.", 400, "webhook");
    let parsed: Record<string, unknown>;
    try {
      parsed = JSON.parse(rawBody);
    } catch {
      throw new PacketError("Webhook body is not JSON.", 400, "webhook");
    }
    return normalizeEvent(parsed, headers["webhook-id"]);
  }
}

export type ProviderSelection = { kind: "whop" | "simulated" | "none"; provider: PaymentProvider | null; reason: string };

/**
 * Choose the payment provider from configuration. Whop is the default. The
 * simulated double is opt-in and blocked in production without an explicit
 * override, so a demo can never silently masquerade as live payments.
 */
export async function selectPaymentProvider(store: PacketStore, env = process.env): Promise<ProviderSelection> {
  const wanted = (env.CAID_PAYMENTS_PROVIDER || "whop").toLowerCase();
  if (wanted === "simulated") {
    if (env.NODE_ENV === "production" && env.CAID_ALLOW_SIMULATED_PAYMENTS !== "true")
      return { kind: "none", provider: null, reason: "Simulated payments are disabled in production unless CAID_ALLOW_SIMULATED_PAYMENTS=true is set explicitly." };
    return { kind: "simulated", provider: new SimulatedPaymentProvider(store, env.CAID_SIMULATED_WEBHOOK_SECRET || ""), reason: "Simulated sandbox: labeled local test double; no money moves." };
  }
  const cfg = whopConfig(env);
  if (!cfg.apiKey || !cfg.companyId || !cfg.webhookSecret)
    return { kind: "none", provider: null, reason: "Whop is not configured (WHOP_API_KEY, WHOP_COMPANY_ID and WHOP_WEBHOOK_SECRET are required). Purchases are unavailable; the synthetic sample remains available." };
  return { kind: "whop", provider: await whopProvider(cfg), reason: cfg.sandbox ? "Whop sandbox environment." : "Whop live environment." };
}

export function normalizeEvent(parsed: Record<string, unknown>, headerId?: string): VerifiedEvent {
  const id = typeof parsed.id === "string" ? parsed.id : headerId;
  if (!id) throw new PacketError("Webhook event has no id.", 400, "webhook");
  if (typeof parsed.type !== "string") throw new PacketError("Webhook event has no type.", 400, "webhook");
  const data = parsed.data && typeof parsed.data === "object" ? (parsed.data as Record<string, unknown>) : {};
  return {
    id,
    type: parsed.type,
    timestamp: typeof parsed.timestamp === "string" ? parsed.timestamp : null,
    companyId: typeof parsed.company_id === "string" ? parsed.company_id : (data.account_id as string | null) ?? null,
    data,
  };
}

export type WebhookOutcome = { status: number; result: string; orderId: string | null };

/**
 * Process one webhook delivery. Signature first, then business match, then
 * exactly-once recording, then reconciliation against authoritative provider
 * state. Fulfillment is driven by the retrieved payment, never by the event
 * body alone, so delayed and out-of-order deliveries converge on the same
 * final state.
 */
export async function processWebhook(
  store: PacketStore,
  provider: PaymentProvider,
  rawBody: string,
  headers: Record<string, string>,
  settings: { requested: RequestedSettings; clarificationLimit: number },
): Promise<WebhookOutcome> {
  let event: VerifiedEvent;
  try {
    event = provider.verifyWebhook(rawBody, headers);
  } catch (error) {
    return { status: 400, result: `rejected: invalid signature (${error instanceof Error ? error.constructor.name : "error"})`, orderId: null };
  }
  const fresh = store.recordPaymentEvent({ id: event.id, orderId: null, type: event.type, payload: event, verified: true, result: "received", providerTimestamp: event.timestamp });
  if (!fresh) return { status: 200, result: "duplicate: already processed", orderId: null };
  const finish = (status: number, result: string, orderId: string | null): WebhookOutcome => {
    store.updatePaymentEventResult(event.id, orderId, result);
    return { status, result, orderId };
  };
  if (provider.companyId && event.companyId && event.companyId !== provider.companyId)
    return finish(200, `rejected: wrong business ${event.companyId}`, null);

  const relevant = /^(payment\.|refund\.|invoice\.paid|dispute)/.test(event.type);
  if (!relevant) return finish(200, `ignored: ${event.type}`, null);

  // Locate the order from provider-attached metadata or the checkout configuration id.
  const data = event.data;
  const paymentId = typeof data.payment_id === "string" ? data.payment_id : typeof data.id === "string" && event.type.startsWith("payment.") ? data.id : null;
  const meta = (data.metadata && typeof data.metadata === "object" ? data.metadata : {}) as Record<string, unknown>;
  let order: OrderRecord | undefined = typeof meta.orderId === "string" ? store.orderById(meta.orderId) : undefined;
  let authoritative: ProviderPayment | null = null;
  if (paymentId) {
    try {
      authoritative = await provider.retrievePayment(paymentId);
    } catch (error) {
      return finish(503, `retry later: provider lookup failed (${error instanceof Error ? error.message : "error"})`, order?.id ?? null);
    }
  }
  if (!order && authoritative?.metadata && typeof authoritative.metadata.orderId === "string") order = store.orderById(authoritative.metadata.orderId);
  if (!order) return finish(200, "ignored: no matching order", null);
  if (!authoritative) return finish(200, "recorded: no authoritative payment available yet", order.id);

  return finish(200, applyAuthoritativePayment(store, order, authoritative, event.type, settings), order.id);
}

const sameAmount = (a: string | null, b: string) => a !== null && Number(a).toFixed(2) === Number(b).toFixed(2);

/**
 * Converge the local order onto authoritative provider state. Pure with
 * respect to ordering: the same payment object yields the same local state
 * whether it arrives first, late, or twice.
 */
export function applyAuthoritativePayment(
  store: PacketStore,
  order: OrderRecord,
  p: ProviderPayment,
  eventType: string,
  settings: { requested: RequestedSettings; clarificationLimit: number },
): string {
  const metaOrder = p.metadata && typeof p.metadata.orderId === "string" ? p.metadata.orderId : null;
  if (metaOrder !== order.id) return `rejected: payment ${p.id} is not bound to order ${order.id}`;
  if (order.whop.checkoutId && p.checkoutConfigurationId && p.checkoutConfigurationId !== order.whop.checkoutId)
    return `rejected: payment belongs to checkout ${p.checkoutConfigurationId}, order expects ${order.whop.checkoutId}`;
  if (p.currency && p.currency !== order.currency) return `rejected: currency ${p.currency} does not match order ${order.currency}`;
  if (p.totalAmount !== null && !sameAmount(p.totalAmount, order.amount))
    return `rejected: amount ${p.totalAmount} does not match order ${order.amount}`;
  if (order.whop.planId && p.planId && p.planId !== order.whop.planId) return `rejected: plan ${p.planId} does not match order plan ${order.whop.planId}`;

  const refunded = p.refundedAmount !== null && Number(p.refundedAmount) > 0;
  const paid = p.status === "paid" || (refunded && !!p.paidAt);
  if (paid) {
    let result = "";
    if (order.status === "checkout_pending" || order.status === "paid") {
      const r = store.markPaid(order.id, { paymentId: p.id, paidAt: p.paidAt ?? new Date().toISOString(), companyId: p.companyId, planId: p.planId, productId: p.productId }, settings.requested, settings.clarificationLimit);
      result = r.created ? `paid: run ${r.run.id} attempt ${r.run.attempt} queued` : `paid: already fulfilled by run ${r.run.id}`;
    } else result = `paid state observed while order is ${order.status}`;
    if (refunded || /^refund\./.test(eventType) || p.status === "void") {
      store.revoke(order.id, `refund: ${p.refundedAmount ?? "full"} ${p.currency ?? ""} (${eventType})`);
      return `${result}; access revoked after refund`;
    }
    return result;
  }
  if (["void", "uncollectible"].includes(p.status) || eventType === "payment.failed" || eventType === "payment.canceled") {
    store.markFailed(order.id, eventType === "payment.canceled" ? "canceled" : "failed");
    return `not paid: ${p.status} (${eventType}); order left ${store.orderById(order.id)?.status}`;
  }
  return `pending: payment ${p.id} is ${p.status}; no fulfillment`;
}

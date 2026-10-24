import { randomUUID } from "node:crypto";
import { ChangeStore, WorkspaceError, workspaceStore } from "@/lib/changes/store";
import type { User } from "@/lib/changes/model";
import {
  BRIEF_LIMITS,
  manifestDigest,
  PacketError,
  isSectorTag,
  parseBrief,
  parseSourceInput,
  sha256,
  type Brief,
  type EffectiveSettings,
  type FrozenRequest,
  type Packet,
  type PacketReceipt,
  type RequestedSettings,
  type SourceArtifact,
  type SourceManifestEntry,
  type ValidationResult,
} from "./model";

const now = () => new Date().toISOString();
function singleSector(tags: string[]) {
  return tags.length === 1 && isSectorTag(tags[0]) ? tags[0] : null;
}

// ---------------------------------------------------------------------------
// Records
// ---------------------------------------------------------------------------
export type RequestRecord = {
  id: string;
  customerId: string;
  brief: Brief;
  frozenVersion: number | null;
  createdAt: string;
  updatedAt: string;
};
export type OrderStatus = "checkout_pending" | "paid" | "failed" | "canceled" | "refunded" | "revoked";
export type OrderRecord = {
  id: string;
  customerId: string;
  requestId: string;
  requestVersion: number;
  offerId: string;
  amount: string;
  currency: string;
  status: OrderStatus;
  sandbox: boolean;
  /** whop: real provider (sandbox or live). simulated: labeled local test double, never live money. */
  provider: "whop" | "simulated";
  fulfillmentKey: string;
  whop: {
    companyId: string | null;
    checkoutId: string | null;
    checkoutUrl: string | null;
    paymentId: string | null;
    planId: string | null;
    productId: string | null;
  };
  paidAt: string | null;
  revokedAt: string | null;
  revokeReason: string | null;
  createdAt: string;
  updatedAt: string;
};
export type PaymentEventRecord = {
  id: string;
  orderId: string | null;
  type: string;
  verified: boolean;
  result: string;
  providerTimestamp: string | null;
  receivedAt: string;
};
export type EntitlementRecord = {
  orderId: string;
  customerId: string;
  requestId: string;
  requestVersion: number;
  active: boolean;
  clarificationLimit: number;
  clarificationsUsed: number;
  grantedAt: string;
  revokedAt: string | null;
};
export type RunStatus = "queued" | "running" | "ready" | "failed" | "canceled";
export type RunRecord = {
  id: string;
  orderId: string;
  requestId: string;
  requestVersion: number;
  manifestDigest: string;
  attempt: number;
  status: RunStatus;
  leaseOwner: string | null;
  leaseUntil: number | null;
  cancelRequested: boolean;
  requested: RequestedSettings;
  effective: EffectiveSettings | null;
  /** Budget reserved for this attempt before dispatch (order ceiling minus prior spend). */
  budgetReservedUsd: number;
  costUsd: number | null;
  inputTokens: number | null;
  outputTokens: number | null;
  toolCalls: number;
  repairs: number;
  escalations: number;
  startedAt: string | null;
  finishedAt: string | null;
  error: string | null;
  createdAt: string;
};
export type RunEvent = { id: number; runId: string; at: string; stage: string; detail: string };
export type PacketRecord = {
  id: string;
  orderId: string;
  requestId: string;
  requestVersion: number;
  version: number;
  runId: string;
  packet: Packet;
  digest: string;
  createdAt: string;
};
export type ClarificationRecord = {
  id: string;
  orderId: string;
  packetId: string;
  customerId: string;
  question: string;
  answer: string | null;
  citations: { sourceId: string; anchorId: string }[];
  status: "pending" | "answered" | "failed";
  receipt: Record<string, unknown> | null;
  createdAt: string;
  answeredAt: string | null;
};

const parse = <T>(s: string) => JSON.parse(s) as T;

export class PacketStore {
  readonly changes: ChangeStore;
  constructor(changes: ChangeStore) {
    this.changes = changes;
    this.changes.db.exec(`
      CREATE TABLE IF NOT EXISTS pk_requests (id TEXT PRIMARY KEY, customer_id TEXT NOT NULL, brief TEXT NOT NULL, frozen_version INTEGER, created_at TEXT NOT NULL, updated_at TEXT NOT NULL);
      CREATE INDEX IF NOT EXISTS pk_requests_customer ON pk_requests(customer_id);
      CREATE TABLE IF NOT EXISTS pk_sources (id TEXT PRIMARY KEY, request_id TEXT NOT NULL, source_id TEXT NOT NULL, name TEXT NOT NULL, revision TEXT NOT NULL, content TEXT NOT NULL, sha256 TEXT NOT NULL, bytes INTEGER NOT NULL, imported_at TEXT NOT NULL, removed INTEGER NOT NULL DEFAULT 0, UNIQUE(request_id, source_id));
      CREATE TABLE IF NOT EXISTS pk_request_versions (request_id TEXT NOT NULL, version INTEGER NOT NULL, frozen_at TEXT NOT NULL, brief TEXT NOT NULL, manifest TEXT NOT NULL, manifest_digest TEXT NOT NULL, PRIMARY KEY(request_id, version));
      CREATE TABLE IF NOT EXISTS pk_orders (id TEXT PRIMARY KEY, customer_id TEXT NOT NULL, request_id TEXT NOT NULL, request_version INTEGER NOT NULL, offer_id TEXT NOT NULL, amount TEXT NOT NULL, currency TEXT NOT NULL, status TEXT NOT NULL, sandbox INTEGER NOT NULL, provider TEXT NOT NULL DEFAULT 'whop', fulfillment_key TEXT NOT NULL UNIQUE, whop TEXT NOT NULL, paid_at TEXT, revoked_at TEXT, revoke_reason TEXT, created_at TEXT NOT NULL, updated_at TEXT NOT NULL);
      CREATE INDEX IF NOT EXISTS pk_orders_request ON pk_orders(request_id, request_version);
      CREATE TABLE IF NOT EXISTS pk_payment_events (id TEXT PRIMARY KEY, order_id TEXT, type TEXT NOT NULL, payload TEXT NOT NULL, verified INTEGER NOT NULL, result TEXT NOT NULL, provider_timestamp TEXT, received_at TEXT NOT NULL);
      CREATE TABLE IF NOT EXISTS pk_entitlements (order_id TEXT PRIMARY KEY, customer_id TEXT NOT NULL, request_id TEXT NOT NULL, request_version INTEGER NOT NULL, active INTEGER NOT NULL, clarification_limit INTEGER NOT NULL, clarifications_used INTEGER NOT NULL DEFAULT 0, granted_at TEXT NOT NULL, revoked_at TEXT);
      CREATE TABLE IF NOT EXISTS pk_runs (id TEXT PRIMARY KEY, order_id TEXT NOT NULL, request_id TEXT NOT NULL, request_version INTEGER NOT NULL, manifest_digest TEXT NOT NULL, attempt INTEGER NOT NULL, status TEXT NOT NULL, lease_owner TEXT, lease_until INTEGER, cancel_requested INTEGER NOT NULL DEFAULT 0, requested TEXT NOT NULL, effective TEXT, budget_reserved_usd REAL NOT NULL DEFAULT 0, cost_usd REAL, input_tokens INTEGER, output_tokens INTEGER, tool_calls INTEGER NOT NULL DEFAULT 0, repairs INTEGER NOT NULL DEFAULT 0, escalations INTEGER NOT NULL DEFAULT 0, started_at TEXT, finished_at TEXT, error TEXT, created_at TEXT NOT NULL, UNIQUE(order_id, attempt));
      CREATE TABLE IF NOT EXISTS pk_run_events (id INTEGER PRIMARY KEY AUTOINCREMENT, run_id TEXT NOT NULL, at TEXT NOT NULL, stage TEXT NOT NULL, detail TEXT NOT NULL);
      CREATE INDEX IF NOT EXISTS pk_run_events_run ON pk_run_events(run_id);
      CREATE TABLE IF NOT EXISTS pk_packets (id TEXT PRIMARY KEY, order_id TEXT NOT NULL, request_id TEXT NOT NULL, request_version INTEGER NOT NULL, version INTEGER NOT NULL, run_id TEXT NOT NULL UNIQUE, content TEXT NOT NULL, digest TEXT NOT NULL, created_at TEXT NOT NULL, UNIQUE(order_id, version));
      CREATE TABLE IF NOT EXISTS pk_clarifications (id TEXT PRIMARY KEY, order_id TEXT NOT NULL, packet_id TEXT NOT NULL, customer_id TEXT NOT NULL, question TEXT NOT NULL, answer TEXT, citations TEXT NOT NULL, status TEXT NOT NULL, receipt TEXT, created_at TEXT NOT NULL, answered_at TEXT);
      CREATE TABLE IF NOT EXISTS pk_budget_adjustments (order_id TEXT PRIMARY KEY, ceiling_usd REAL NOT NULL, adjusted_by TEXT NOT NULL, reason TEXT NOT NULL, adjusted_at TEXT NOT NULL);
    `);
  }
  get db() {
    return this.changes.db;
  }
  transaction<T>(fn: () => T): T {
    return this.changes.transaction(fn);
  }

  // ---------------------------------------------------------------- accounts
  /** Customers self-register. They never gain engineering authority. */
  registerCustomer(name: string, email: string, password: string): User {
    this.changes.throttle("register");
    return this.changes.addUser(name, email, password, "customer");
  }
  login(email: string, password: string) {
    return this.changes.login(email, password);
  }
  /**
   * Sign in the shared demo customer, creating the account on first use.
   * A later click reuses the same account. It never resets a password and
   * never promotes the account to an engineering role.
   */
  signInDemo(account: { name: string; email: string; password: string }): { user: User; token: string } {
    const existing = this.changes.users().find((u) => u.email === account.email);
    if (!existing) this.registerCustomer(account.name, account.email, account.password);
    else if (existing.role !== "customer")
      throw new PacketError("That email belongs to an engineering account, so it cannot be the demo customer.", 409, "demo");
    let token: string;
    try {
      token = this.login(account.email, account.password);
    } catch (error) {
      if (error instanceof WorkspaceError && error.status === 401)
        throw new PacketError("The demo email already has a different password. Sign in with it, or choose another email.", 409, "demo");
      throw error;
    }
    const user = this.user(token);
    if (!user) throw new PacketError("Demo sign-in did not create a session.", 500, "demo");
    return { user, token };
  }
  user(token: string) {
    return this.changes.user(token);
  }
  logout(token: string) {
    this.changes.logout(token);
  }

  // ---------------------------------------------------------------- requests
  private rowToRequest(r: Record<string, unknown>): RequestRecord {
    return {
      id: r.id as string,
      customerId: r.customer_id as string,
      brief: parse<Brief>(r.brief as string),
      frozenVersion: (r.frozen_version as number | null) ?? null,
      createdAt: r.created_at as string,
      updatedAt: r.updated_at as string,
    };
  }
  createRequest(customer: User, brief: unknown): RequestRecord {
    const parsed = parseBrief(brief);
    if (!singleSector(parsed.sectorTags)) throw new PacketError("Choose one sector for this review.");
    const id = randomUUID();
    const at = now();
    this.db
      .prepare("INSERT INTO pk_requests VALUES (?,?,?,?,?,?)")
      .run(id, customer.id, JSON.stringify(parsed), null, at, at);
    return this.rowToRequest({ id, customer_id: customer.id, brief: JSON.stringify(parsed), frozen_version: null, created_at: at, updated_at: at });
  }
  /** Every read is customer-scoped. A guessed id from another customer is a 404, never a 403 leak. */
  request(customer: User, id: string): RequestRecord {
    const row = this.db
      .prepare("SELECT * FROM pk_requests WHERE id=? AND customer_id=?")
      .get(id, customer.id) as Record<string, unknown> | undefined;
    if (!row) throw new PacketError("Request not found.", 404, "not_found");
    return this.rowToRequest(row);
  }
  listRequests(customer: User): RequestRecord[] {
    return (
      this.db
        .prepare("SELECT * FROM pk_requests WHERE customer_id=? ORDER BY created_at DESC")
        .all(customer.id) as Record<string, unknown>[]
    ).map((r) => this.rowToRequest(r));
  }
  updateBrief(customer: User, id: string, brief: unknown): RequestRecord {
    return this.transaction(() => {
      const r = this.request(customer, id);
      if (r.frozenVersion)
        throw new PacketError(
          "This request is frozen for an order. A materially changed request is a new request and a separate order.",
          409,
          "frozen",
        );
      const parsed = parseBrief(brief);
      const current = singleSector(r.brief.sectorTags);
      const next = singleSector(parsed.sectorTags);
      if (!next) throw new PacketError("Choose one sector for this review.");
      if (current && current !== next) throw new PacketError("This review already has its sector.", 409, "sector-locked");
      this.db.prepare("UPDATE pk_requests SET brief=?, updated_at=? WHERE id=?").run(JSON.stringify(parsed), now(), id);
      return this.request(customer, id);
    });
  }
  /** Clone a frozen request into a new editable draft (new request, new future version/order). */
  cloneRequest(customer: User, id: string): RequestRecord {
    return this.transaction(() => {
      const r = this.request(customer, id);
      const next = this.createRequest(customer, r.brief);
      for (const s of this.sources(customer, id))
        this.db
          .prepare("INSERT INTO pk_sources VALUES (?,?,?,?,?,?,?,?,?,0)")
          .run(randomUUID(), next.id, s.sourceId, s.name, s.revision, s.content, s.sha256, s.bytes, now());
      return next;
    });
  }

  // ----------------------------------------------------------------- sources
  private rowToSource(r: Record<string, unknown>): SourceArtifact {
    return {
      id: r.id as string,
      sourceId: r.source_id as string,
      name: r.name as string,
      revision: r.revision as string,
      content: r.content as string,
      sha256: r.sha256 as string,
      bytes: r.bytes as number,
      importedAt: r.imported_at as string,
    };
  }
  sources(customer: User, requestId: string): SourceArtifact[] {
    this.request(customer, requestId);
    return (
      this.db
        .prepare("SELECT * FROM pk_sources WHERE request_id=? AND removed=0 ORDER BY imported_at, source_id")
        .all(requestId) as Record<string, unknown>[]
    ).map((r) => this.rowToSource(r));
  }
  manifest(customer: User, requestId: string): SourceManifestEntry[] {
    return this.sources(customer, requestId).map((s) => ({ id: s.id, sourceId: s.sourceId, name: s.name, revision: s.revision, sha256: s.sha256, bytes: s.bytes, importedAt: s.importedAt }));
  }
  addSource(customer: User, requestId: string, input: unknown): SourceArtifact {
    return this.transaction(() => {
      const r = this.request(customer, requestId);
      if (r.frozenVersion) throw new PacketError("This request is frozen for an order; sources cannot change.", 409, "frozen");
      const existing = this.sources(customer, requestId);
      if (existing.length >= BRIEF_LIMITS.maxSources)
        throw new PacketError(`A request may include at most ${BRIEF_LIMITS.maxSources} sources.`, 400);
      const s = parseSourceInput(input);
      const total = existing.reduce((n, x) => n + x.bytes, 0) + s.bytes;
      if (total > BRIEF_LIMITS.totalSourceBytes)
        throw new PacketError("Total source text exceeds the 1 MB limit for one request.", 413);
      const used = new Set(existing.map((x) => x.sourceId));
      let n = 1;
      while (used.has(`S${n}`)) n += 1;
      const row = {
        id: randomUUID(),
        request_id: requestId,
        source_id: `S${n}`,
        name: s.name,
        revision: s.revision,
        content: s.content,
        sha256: sha256(s.content),
        bytes: s.bytes,
        imported_at: now(),
      };
      this.db
        .prepare("INSERT INTO pk_sources VALUES (?,?,?,?,?,?,?,?,?,0)")
        .run(row.id, row.request_id, row.source_id, row.name, row.revision, row.content, row.sha256, row.bytes, row.imported_at);
      this.db.prepare("UPDATE pk_requests SET updated_at=? WHERE id=?").run(now(), requestId);
      return this.rowToSource(row);
    });
  }
  removeSource(customer: User, requestId: string, sourceId: string) {
    this.transaction(() => {
      const r = this.request(customer, requestId);
      if (r.frozenVersion) throw new PacketError("This request is frozen for an order; sources cannot change.", 409, "frozen");
      const res = this.db
        .prepare("UPDATE pk_sources SET removed=1 WHERE request_id=? AND source_id=? AND removed=0")
        .run(requestId, sourceId);
      if (!res.changes) throw new PacketError("Source not found.", 404, "not_found");
    });
  }

  // ------------------------------------------------------------------ freeze
  /**
   * Freeze the brief and source manifest into an immutable request version.
   * The order and every run bind to this version; later edits are impossible.
   */
  freeze(customer: User, requestId: string): FrozenRequest {
    return this.transaction(() => {
      const r = this.request(customer, requestId);
      if (r.frozenVersion) return this.frozen(requestId, r.frozenVersion);
      const brief = parseBrief(r.brief, { strict: true });
      if (!brief.acknowledged)
        throw new PacketError("Confirm that paid delivery and engineering approval are separate before ordering.");
      const manifest = this.manifest(customer, requestId);
      if (!manifest.length) throw new PacketError("Add at least one readable source before ordering.");
      const version = 1;
      const at = now();
      this.db
        .prepare("INSERT INTO pk_request_versions VALUES (?,?,?,?,?,?)")
        .run(requestId, version, at, JSON.stringify(brief), JSON.stringify(manifest), manifestDigest(brief, manifest));
      this.db.prepare("UPDATE pk_requests SET frozen_version=?, updated_at=? WHERE id=?").run(version, at, requestId);
      return this.frozen(requestId, version);
    });
  }
  /** Internal: frozen version by id (callers must have authorized the customer already). */
  frozen(requestId: string, version: number): FrozenRequest {
    const row = this.db
      .prepare("SELECT * FROM pk_request_versions WHERE request_id=? AND version=?")
      .get(requestId, version) as Record<string, unknown> | undefined;
    if (!row) throw new PacketError("Frozen request version not found.", 404, "not_found");
    return {
      requestId,
      version,
      frozenAt: row.frozen_at as string,
      brief: parse<Brief>(row.brief as string),
      sources: parse<SourceManifestEntry[]>(row.manifest as string),
      manifestDigest: row.manifest_digest as string,
      synthetic: false,
    };
  }
  /** Contents for a frozen manifest, verified against the frozen hashes. */
  frozenContents(frozen: FrozenRequest): Map<string, string> {
    const out = new Map<string, string>();
    for (const m of frozen.sources) {
      const row = this.db
        .prepare("SELECT content FROM pk_sources WHERE request_id=? AND source_id=?")
        .get(frozen.requestId, m.sourceId) as { content: string } | undefined;
      if (!row || sha256(row.content) !== m.sha256)
        throw new PacketError(`Stored content for ${m.sourceId} no longer matches its frozen hash.`, 500, "integrity");
      out.set(m.sourceId, row.content);
    }
    return out;
  }

  // ------------------------------------------------------------------ orders
  private rowToOrder(r: Record<string, unknown>): OrderRecord {
    return {
      id: r.id as string,
      customerId: r.customer_id as string,
      requestId: r.request_id as string,
      requestVersion: r.request_version as number,
      offerId: r.offer_id as string,
      amount: r.amount as string,
      currency: r.currency as string,
      status: r.status as OrderStatus,
      sandbox: !!r.sandbox,
      provider: ((r.provider as string | null) ?? "whop") as OrderRecord["provider"],
      fulfillmentKey: r.fulfillment_key as string,
      whop: parse<OrderRecord["whop"]>(r.whop as string),
      paidAt: (r.paid_at as string | null) ?? null,
      revokedAt: (r.revoked_at as string | null) ?? null,
      revokeReason: (r.revoke_reason as string | null) ?? null,
      createdAt: r.created_at as string,
      updatedAt: r.updated_at as string,
    };
  }
  createOrder(
    customer: User,
    frozen: FrozenRequest,
    offer: { id: string; amount: string; currency: string },
    sandbox: boolean,
    provider: OrderRecord["provider"] = "whop",
  ): OrderRecord {
    return this.transaction(() => {
      this.request(customer, frozen.requestId);
      const open = this.ordersForVersion(frozen.requestId, frozen.version).find((o) =>
        ["checkout_pending", "paid"].includes(o.status),
      );
      if (open) return open; // idempotent: one open order per frozen version
      const id = randomUUID();
      const at = now();
      const order: OrderRecord = {
        id,
        customerId: customer.id,
        requestId: frozen.requestId,
        requestVersion: frozen.version,
        offerId: offer.id,
        amount: offer.amount,
        currency: offer.currency,
        status: "checkout_pending",
        sandbox,
        provider,
        fulfillmentKey: `${frozen.requestId}:v${frozen.version}:${id}`,
        whop: { companyId: null, checkoutId: null, checkoutUrl: null, paymentId: null, planId: null, productId: null },
        paidAt: null,
        revokedAt: null,
        revokeReason: null,
        createdAt: at,
        updatedAt: at,
      };
      this.writeOrder(order, true);
      return order;
    });
  }
  private writeOrder(o: OrderRecord, insert = false) {
    if (insert)
      this.db
        .prepare("INSERT INTO pk_orders VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)")
        .run(o.id, o.customerId, o.requestId, o.requestVersion, o.offerId, o.amount, o.currency, o.status, o.sandbox ? 1 : 0, o.provider, o.fulfillmentKey, JSON.stringify(o.whop), o.paidAt, o.revokedAt, o.revokeReason, o.createdAt, o.updatedAt);
    else
      this.db
        .prepare("UPDATE pk_orders SET status=?, whop=?, paid_at=?, revoked_at=?, revoke_reason=?, updated_at=? WHERE id=?")
        .run(o.status, JSON.stringify(o.whop), o.paidAt, o.revokedAt, o.revokeReason, now(), o.id);
  }
  ordersForVersion(requestId: string, version: number): OrderRecord[] {
    return (
      this.db
        .prepare("SELECT * FROM pk_orders WHERE request_id=? AND request_version=? ORDER BY created_at DESC")
        .all(requestId, version) as Record<string, unknown>[]
    ).map((r) => this.rowToOrder(r));
  }
  order(customer: User, orderId: string): OrderRecord {
    const row = this.db
      .prepare("SELECT * FROM pk_orders WHERE id=? AND customer_id=?")
      .get(orderId, customer.id) as Record<string, unknown> | undefined;
    if (!row) throw new PacketError("Order not found.", 404, "not_found");
    return this.rowToOrder(row);
  }
  /** Internal lookup used only by verified provider processing. */
  orderById(orderId: string): OrderRecord | undefined {
    const row = this.db.prepare("SELECT * FROM pk_orders WHERE id=?").get(orderId) as Record<string, unknown> | undefined;
    return row ? this.rowToOrder(row) : undefined;
  }
  latestOrder(customer: User, requestId: string): OrderRecord | undefined {
    const row = this.db
      .prepare("SELECT * FROM pk_orders WHERE request_id=? AND customer_id=? ORDER BY created_at DESC LIMIT 1")
      .get(requestId, customer.id) as Record<string, unknown> | undefined;
    return row ? this.rowToOrder(row) : undefined;
  }
  attachCheckout(orderId: string, whop: Partial<OrderRecord["whop"]>) {
    this.transaction(() => {
      const o = this.orderById(orderId);
      if (!o) throw new PacketError("Order not found.", 404, "not_found");
      o.whop = { ...o.whop, ...whop };
      this.writeOrder(o);
    });
  }
  cancelOrder(customer: User, orderId: string) {
    return this.transaction(() => {
      const o = this.order(customer, orderId);
      if (o.status !== "checkout_pending") throw new PacketError("Only an unpaid order can be canceled.", 409);
      o.status = "canceled";
      this.writeOrder(o);
      return o;
    });
  }

  // ----------------------------------------------------------- payment events
  /** Record a provider event exactly once. Returns false when the event id was already seen. */
  recordPaymentEvent(e: { id: string; orderId: string | null; type: string; payload: unknown; verified: boolean; result: string; providerTimestamp: string | null }) {
    const res = this.db
      .prepare("INSERT OR IGNORE INTO pk_payment_events VALUES (?,?,?,?,?,?,?,?)")
      .run(e.id, e.orderId, e.type, JSON.stringify(e.payload), e.verified ? 1 : 0, e.result, e.providerTimestamp, now());
    return res.changes > 0;
  }
  updatePaymentEventResult(id: string, orderId: string | null, result: string) {
    this.db.prepare("UPDATE pk_payment_events SET result=?, order_id=COALESCE(?, order_id) WHERE id=?").run(result, orderId, id);
  }
  paymentEvents(orderId: string): PaymentEventRecord[] {
    return (
      this.db
        .prepare("SELECT id, order_id, type, verified, result, provider_timestamp, received_at FROM pk_payment_events WHERE order_id=? ORDER BY received_at")
        .all(orderId) as Record<string, unknown>[]
    ).map((r) => ({
      id: r.id as string,
      orderId: r.order_id as string | null,
      type: r.type as string,
      verified: !!r.verified,
      result: r.result as string,
      providerTimestamp: (r.provider_timestamp as string | null) ?? null,
      receivedAt: r.received_at as string,
    }));
  }

  // ------------------------------------------------- paid state + entitlement
  /**
   * Mark an order paid from authoritative provider state and grant the
   * entitlement. Idempotent: a duplicate confirmation changes nothing and
   * never creates a second run. Returns the run that fulfills the order.
   */
  markPaid(
    orderId: string,
    payment: { paymentId: string; paidAt: string; companyId: string | null; planId: string | null; productId: string | null },
    requested: RequestedSettings,
    clarificationLimit: number,
  ): { order: OrderRecord; run: RunRecord; created: boolean } {
    return this.transaction(() => {
      const o = this.orderById(orderId);
      if (!o) throw new PacketError("Order not found.", 404, "not_found");
      if (o.status === "paid") {
        const run = this.latestRun(o.id);
        if (run) return { order: o, run, created: false };
      } else if (o.status !== "checkout_pending") {
        throw new PacketError(`Order is ${o.status}; a paid confirmation cannot reopen it.`, 409, "state");
      }
      o.status = "paid";
      o.paidAt = payment.paidAt;
      o.whop = { ...o.whop, paymentId: payment.paymentId, companyId: payment.companyId ?? o.whop.companyId, planId: payment.planId ?? o.whop.planId, productId: payment.productId ?? o.whop.productId };
      this.writeOrder(o);
      this.db
        .prepare("INSERT OR IGNORE INTO pk_entitlements VALUES (?,?,?,?,1,?,0,?,NULL)")
        .run(o.id, o.customerId, o.requestId, o.requestVersion, clarificationLimit, now());
      const run = this.latestRun(o.id) ?? this.enqueueRun(o, requested, 1);
      return { order: o, run, created: true };
    });
  }
  markFailed(orderId: string, status: "failed" | "canceled") {
    this.transaction(() => {
      const o = this.orderById(orderId);
      if (!o || o.status !== "checkout_pending") return; // never downgrade a paid order from a late failure event
      o.status = status;
      this.writeOrder(o);
    });
  }
  /** Refund or chargeback: revoke access. Delivered packets stay stored but become unreadable to the customer. */
  revoke(orderId: string, reason: string) {
    this.transaction(() => {
      const o = this.orderById(orderId);
      if (!o) throw new PacketError("Order not found.", 404, "not_found");
      if (o.status === "revoked" || o.status === "refunded") return;
      o.status = reason.startsWith("refund") ? "refunded" : "revoked";
      o.revokedAt = now();
      o.revokeReason = reason;
      this.writeOrder(o);
      this.db.prepare("UPDATE pk_entitlements SET active=0, revoked_at=? WHERE order_id=?").run(now(), o.id);
      // A queued run for a revoked order must not spend model budget.
      this.db
        .prepare("UPDATE pk_runs SET cancel_requested=1 WHERE order_id=? AND status IN ('queued','running')")
        .run(o.id);
    });
  }
  entitlement(customer: User, orderId: string): EntitlementRecord | undefined {
    const row = this.db
      .prepare("SELECT * FROM pk_entitlements WHERE order_id=? AND customer_id=?")
      .get(orderId, customer.id) as Record<string, unknown> | undefined;
    return row ? this.rowToEntitlement(row) : undefined;
  }
  entitlementByOrder(orderId: string): EntitlementRecord | undefined {
    const row = this.db.prepare("SELECT * FROM pk_entitlements WHERE order_id=?").get(orderId) as Record<string, unknown> | undefined;
    return row ? this.rowToEntitlement(row) : undefined;
  }
  private rowToEntitlement(r: Record<string, unknown>): EntitlementRecord {
    return {
      orderId: r.order_id as string,
      customerId: r.customer_id as string,
      requestId: r.request_id as string,
      requestVersion: r.request_version as number,
      active: !!r.active,
      clarificationLimit: r.clarification_limit as number,
      clarificationsUsed: r.clarifications_used as number,
      grantedAt: r.granted_at as string,
      revokedAt: (r.revoked_at as string | null) ?? null,
    };
  }
  /** Authorization gate used by every real-data route and tool handler. */
  requireActiveEntitlement(customer: User, orderId: string): { order: OrderRecord; entitlement: EntitlementRecord } {
    const order = this.order(customer, orderId);
    const entitlement = this.entitlement(customer, orderId);
    if (!entitlement || !entitlement.active)
      throw new PacketError(
        order.status === "revoked" || order.status === "refunded"
          ? "Access to this packet was revoked after a refund or chargeback."
          : "This order has no verified payment yet.",
        403,
        order.status === "revoked" || order.status === "refunded" ? "revoked" : "unpaid",
      );
    return { order, entitlement };
  }

  // -------------------------------------------------------------------- runs
  private rowToRun(r: Record<string, unknown>): RunRecord {
    return {
      id: r.id as string,
      orderId: r.order_id as string,
      requestId: r.request_id as string,
      requestVersion: r.request_version as number,
      manifestDigest: r.manifest_digest as string,
      attempt: r.attempt as number,
      status: r.status as RunStatus,
      leaseOwner: (r.lease_owner as string | null) ?? null,
      leaseUntil: (r.lease_until as number | null) ?? null,
      cancelRequested: !!r.cancel_requested,
      requested: parse<RequestedSettings>(r.requested as string),
      effective: r.effective ? parse<EffectiveSettings>(r.effective as string) : null,
      budgetReservedUsd: (r.budget_reserved_usd as number | null) ?? 0,
      costUsd: (r.cost_usd as number | null) ?? null,
      inputTokens: (r.input_tokens as number | null) ?? null,
      outputTokens: (r.output_tokens as number | null) ?? null,
      toolCalls: r.tool_calls as number,
      repairs: r.repairs as number,
      escalations: (r.escalations as number | null) ?? 0,
      startedAt: (r.started_at as string | null) ?? null,
      finishedAt: (r.finished_at as string | null) ?? null,
      error: (r.error as string | null) ?? null,
      createdAt: r.created_at as string,
    };
  }
  private enqueueRun(o: OrderRecord, requested: RequestedSettings, attempt: number): RunRecord {
    const frozen = this.frozen(o.requestId, o.requestVersion);
    const id = randomUUID();
    const at = now();
    this.db
      .prepare(
        "INSERT INTO pk_runs (id, order_id, request_id, request_version, manifest_digest, attempt, status, requested, budget_reserved_usd, created_at) VALUES (?,?,?,?,?,?, 'queued', ?, ?, ?)",
      )
      .run(id, o.id, o.requestId, o.requestVersion, frozen.manifestDigest, attempt, JSON.stringify(requested), requested.maxBudgetUsd, at);
    this.event(id, "queued", `Run attempt ${attempt} queued for request v${o.requestVersion} (manifest ${frozen.manifestDigest.slice(0, 12)}…) · policy ${requested.policyVersion} · start effort ${requested.effort} · reserved $${requested.maxBudgetUsd.toFixed(2)} of the order budget.`);
    return this.run(id)!;
  }
  /** Everything the order already spent on model calls, across all attempts including failures. */
  orderSpendUsd(orderId: string, excludingRunId?: string): number {
    const row = this.db
      .prepare("SELECT COALESCE(SUM(cost_usd),0) c FROM pk_runs WHERE order_id=? AND (? IS NULL OR id<>?)")
      .get(orderId, excludingRunId ?? null, excludingRunId ?? null) as { c: number };
    return Number(row.c) || 0;
  }
  /** Explicit owner adjustment of one order's cumulative budget ceiling. Never charges the customer. */
  adjustBudget(orderId: string, ceilingUsd: number, owner: User, reason: string) {
    if (owner.role !== "owner") throw new PacketError("Only the owner can adjust an order budget.", 403, "forbidden");
    if (!Number.isFinite(ceilingUsd) || ceilingUsd <= 0 || ceilingUsd > 500) throw new PacketError("Budget ceiling must be between $0 and $500.", 400);
    if (!this.orderById(orderId)) throw new PacketError("Order not found.", 404, "not_found");
    this.db
      .prepare("INSERT INTO pk_budget_adjustments VALUES (?,?,?,?,?) ON CONFLICT(order_id) DO UPDATE SET ceiling_usd=excluded.ceiling_usd, adjusted_by=excluded.adjusted_by, reason=excluded.reason, adjusted_at=excluded.adjusted_at")
      .run(orderId, ceilingUsd, owner.id, reason.slice(0, 500), now());
  }
  budgetCeilingOverride(orderId: string): number | null {
    const row = this.db.prepare("SELECT ceiling_usd FROM pk_budget_adjustments WHERE order_id=?").get(orderId) as { ceiling_usd: number } | undefined;
    return row ? Number(row.ceiling_usd) : null;
  }
  /** Reconcile the attempt's reserved budget after prior spend is known (called by the worker before dispatch). */
  reserveBudget(runId: string, budgetUsd: number, requested: RequestedSettings) {
    this.db.prepare("UPDATE pk_runs SET budget_reserved_usd=?, requested=? WHERE id=?").run(budgetUsd, JSON.stringify(requested), runId);
  }
  run(id: string): RunRecord | undefined {
    const row = this.db.prepare("SELECT * FROM pk_runs WHERE id=?").get(id) as Record<string, unknown> | undefined;
    return row ? this.rowToRun(row) : undefined;
  }
  runs(orderId: string): RunRecord[] {
    return (
      this.db.prepare("SELECT * FROM pk_runs WHERE order_id=? ORDER BY attempt").all(orderId) as Record<string, unknown>[]
    ).map((r) => this.rowToRun(r));
  }
  latestRun(orderId: string): RunRecord | undefined {
    const row = this.db
      .prepare("SELECT * FROM pk_runs WHERE order_id=? ORDER BY attempt DESC LIMIT 1")
      .get(orderId) as Record<string, unknown> | undefined;
    return row ? this.rowToRun(row) : undefined;
  }
  event(runId: string, stage: string, detail: string) {
    this.db.prepare("INSERT INTO pk_run_events(run_id, at, stage, detail) VALUES (?,?,?,?)").run(runId, now(), stage, detail.slice(0, 2000));
  }
  events(runId: string, after = 0): RunEvent[] {
    return this.db
      .prepare("SELECT id, run_id as runId, at, stage, detail FROM pk_run_events WHERE run_id=? AND id>? ORDER BY id")
      .all(runId, after) as RunEvent[];
  }
  /**
   * Claim one queued run (or a running run whose lease expired: a crashed
   * worker). Exactly one worker can hold a lease; the UPDATE is atomic.
   */
  claimRun(owner: string, leaseMs: number): RunRecord | undefined {
    return this.transaction(() => {
      const t = Date.now();
      const row = this.db
        .prepare(
          "SELECT id, status FROM pk_runs WHERE (status='queued' OR (status='running' AND lease_until < ?)) ORDER BY created_at LIMIT 1",
        )
        .get(t) as { id: string; status: string } | undefined;
      if (!row) return undefined;
      const res = this.db
        .prepare(
          "UPDATE pk_runs SET status='running', lease_owner=?, lease_until=?, started_at=COALESCE(started_at, ?) WHERE id=? AND (status='queued' OR (status='running' AND lease_until < ?))",
        )
        .run(owner, t + leaseMs, now(), row.id, t);
      if (!res.changes) return undefined;
      if (row.status === "running") this.event(row.id, "lease-recovered", `Lease expired on a previous worker; ${owner} resumed the attempt.`);
      else this.event(row.id, "running", `Worker ${owner} claimed the run.`);
      return this.run(row.id);
    });
  }
  renewLease(runId: string, owner: string, leaseMs: number) {
    const res = this.db
      .prepare("UPDATE pk_runs SET lease_until=? WHERE id=? AND lease_owner=? AND status='running'")
      .run(Date.now() + leaseMs, runId, owner);
    return res.changes > 0;
  }
  isCancelRequested(runId: string) {
    const row = this.db.prepare("SELECT cancel_requested FROM pk_runs WHERE id=?").get(runId) as { cancel_requested: number } | undefined;
    return !!row?.cancel_requested;
  }
  updateRunProgress(runId: string, patch: Partial<Pick<RunRecord, "effective" | "costUsd" | "inputTokens" | "outputTokens" | "toolCalls" | "repairs" | "escalations">>) {
    const r = this.run(runId);
    if (!r) return;
    this.db
      .prepare("UPDATE pk_runs SET effective=?, cost_usd=?, input_tokens=?, output_tokens=?, tool_calls=?, repairs=?, escalations=? WHERE id=?")
      .run(
        JSON.stringify(patch.effective ?? r.effective),
        patch.costUsd ?? r.costUsd,
        patch.inputTokens ?? r.inputTokens,
        patch.outputTokens ?? r.outputTokens,
        patch.toolCalls ?? r.toolCalls,
        patch.repairs ?? r.repairs,
        patch.escalations ?? r.escalations,
        runId,
      );
  }
  /** Terminal failure or cancellation. The entitlement stays active so the customer can retry without paying again. */
  finishRunFailed(runId: string, owner: string, status: "failed" | "canceled", error: string) {
    this.transaction(() => {
      const r = this.run(runId);
      if (!r || r.status === "ready") return; // never overwrite a delivered result
      const res = this.db
        .prepare("UPDATE pk_runs SET status=?, error=?, finished_at=?, lease_owner=NULL, lease_until=NULL WHERE id=? AND status IN ('running','queued') AND (lease_owner=? OR lease_owner IS NULL)")
        .run(status, error.slice(0, 2000), now(), runId, owner);
      if (res.changes) this.event(runId, status, error.slice(0, 1000));
    });
  }
  /**
   * Publish the immutable packet version for this order. The run must still
   * hold its lease, the packet must have passed validation against the exact
   * frozen manifest, and a delivered packet is never replaced.
   */
  publishPacket(runId: string, owner: string, packetBody: Omit<Packet, "receipt">, validation: ValidationResult, receiptBase: Omit<PacketReceipt, "orderId" | "runId" | "attempt" | "packetVersion" | "requestVersion" | "manifestDigest" | "validation">): PacketRecord {
    return this.transaction(() => {
      const r = this.run(runId);
      if (!r) throw new PacketError("Run not found.", 404, "not_found");
      if (r.status !== "running" || r.leaseOwner !== owner)
        throw new PacketError("This run no longer holds its lease; the result was not published.", 409, "lease");
      if (!validation.ok) throw new PacketError("Validation failed; refusing to publish.", 409, "validation");
      const frozen = this.frozen(r.requestId, r.requestVersion);
      if (frozen.manifestDigest !== r.manifestDigest)
        throw new PacketError("Frozen manifest digest changed; refusing to publish against a different input.", 409, "manifest");
      const existing = this.packetForOrder(r.orderId);
      if (existing) throw new PacketError("A packet was already delivered for this order; retries never overwrite it.", 409, "delivered");
      const receipt: PacketReceipt = {
        ...receiptBase,
        orderId: r.orderId,
        runId: r.id,
        attempt: r.attempt,
        packetVersion: 1,
        requestVersion: r.requestVersion,
        manifestDigest: r.manifestDigest,
        validation: { ok: true, checkedAt: now(), checks: validation.checks },
      };
      const packet: Packet = { ...packetBody, receipt };
      const id = randomUUID();
      const at = now();
      const digest = sha256(JSON.stringify(packetBody));
      this.db
        .prepare("INSERT INTO pk_packets VALUES (?,?,?,?,?,?,?,?,?)")
        .run(id, r.orderId, r.requestId, r.requestVersion, 1, r.id, JSON.stringify(packet), digest, at);
      this.db
        .prepare("UPDATE pk_runs SET status='ready', finished_at=?, lease_owner=NULL, lease_until=NULL, effective=?, cost_usd=?, input_tokens=?, output_tokens=?, tool_calls=?, repairs=?, escalations=? WHERE id=?")
        .run(at, JSON.stringify(receipt.effective), receipt.costUsd, receipt.inputTokens, receipt.outputTokens, receipt.toolCalls, receipt.repairs, receipt.effective?.escalations ?? 0, r.id);
      this.event(r.id, "ready", `Packet version 1 published (digest ${digest.slice(0, 12)}…). Packet ready means preparation delivered, not engineering approval.`);
      return { id, orderId: r.orderId, requestId: r.requestId, requestVersion: r.requestVersion, version: 1, runId: r.id, packet, digest, createdAt: at };
    });
  }
  /**
   * Customer retry after a failed/canceled run: same entitlement, new attempt,
   * no new charge. The caller supplies the settings for the next attempt from
   * the policy given the order's cumulative spend; `null` means the order
   * budget is exhausted and an explicit owner adjustment is required.
   */
  retry(customer: User, orderId: string, nextSettings: (latest: RunRecord, spentUsd: number) => RequestedSettings | null): RunRecord {
    return this.transaction(() => {
      const { order } = this.requireActiveEntitlement(customer, orderId);
      const latest = this.latestRun(orderId);
      if (!latest) throw new PacketError("No run exists for this order.", 409);
      if (latest.status === "ready") throw new PacketError("The packet was already delivered.", 409, "delivered");
      if (latest.status === "queued" || latest.status === "running")
        throw new PacketError("A run is already in progress.", 409, "in-progress");
      if (latest.attempt >= 5) throw new PacketError("Retry limit reached. Contact the operator; your entitlement remains recorded.", 409, "retry-limit");
      const spent = this.orderSpendUsd(orderId);
      const requested = nextSettings(latest, spent);
      if (!requested)
        throw new PacketError(
          `This order's model budget is exhausted ($${spent.toFixed(2)} spent across ${latest.attempt} attempt${latest.attempt === 1 ? "" : "s"}). Your paid entitlement is retained; the operator must adjust the budget before another attempt. You are never charged again automatically.`,
          409,
          "budget-exhausted",
        );
      return this.enqueueRun(order, requested, latest.attempt + 1);
    });
  }
  requestCancel(customer: User, orderId: string): RunRecord {
    return this.transaction(() => {
      this.requireActiveEntitlement(customer, orderId);
      const latest = this.latestRun(orderId);
      if (!latest || !["queued", "running"].includes(latest.status))
        throw new PacketError("There is no run in progress to cancel.", 409);
      this.db.prepare("UPDATE pk_runs SET cancel_requested=1 WHERE id=?").run(latest.id);
      this.event(latest.id, "cancel-requested", "Customer requested cancellation. The worker stops at its next checkpoint; the paid entitlement is retained.");
      if (latest.status === "queued") {
        this.db.prepare("UPDATE pk_runs SET status='canceled', finished_at=?, error=? WHERE id=? AND status='queued'").run(now(), "Canceled before a worker claimed the run.", latest.id);
        this.event(latest.id, "canceled", "Canceled before a worker claimed the run.");
      }
      return this.run(latest.id)!;
    });
  }

  // ----------------------------------------------------------------- packets
  private rowToPacket(r: Record<string, unknown>): PacketRecord {
    return {
      id: r.id as string,
      orderId: r.order_id as string,
      requestId: r.request_id as string,
      requestVersion: r.request_version as number,
      version: r.version as number,
      runId: r.run_id as string,
      packet: parse<Packet>(r.content as string),
      digest: r.digest as string,
      createdAt: r.created_at as string,
    };
  }
  packetForOrder(orderId: string): PacketRecord | undefined {
    const row = this.db
      .prepare("SELECT * FROM pk_packets WHERE order_id=? ORDER BY version DESC LIMIT 1")
      .get(orderId) as Record<string, unknown> | undefined;
    return row ? this.rowToPacket(row) : undefined;
  }
  /** Authorized packet read: customer must own the order and hold an active entitlement. */
  packet(customer: User, orderId: string): PacketRecord {
    this.requireActiveEntitlement(customer, orderId);
    const p = this.packetForOrder(orderId);
    if (!p) throw new PacketError("No packet has been delivered for this order yet.", 404, "not-ready");
    return p;
  }

  // ---------------------------------------------------------- clarifications
  private rowToClarification(r: Record<string, unknown>): ClarificationRecord {
    return {
      id: r.id as string,
      orderId: r.order_id as string,
      packetId: r.packet_id as string,
      customerId: r.customer_id as string,
      question: r.question as string,
      answer: (r.answer as string | null) ?? null,
      citations: parse(r.citations as string),
      status: r.status as ClarificationRecord["status"],
      receipt: r.receipt ? parse(r.receipt as string) : null,
      createdAt: r.created_at as string,
      answeredAt: (r.answered_at as string | null) ?? null,
    };
  }
  clarifications(customer: User, orderId: string): ClarificationRecord[] {
    this.requireActiveEntitlement(customer, orderId);
    return (
      this.db
        .prepare("SELECT * FROM pk_clarifications WHERE order_id=? AND customer_id=? ORDER BY created_at")
        .all(orderId, customer.id) as Record<string, unknown>[]
    ).map((r) => this.rowToClarification(r));
  }
  /** Reserve one clarification slot atomically; the usage counter is the budget. */
  openClarification(customer: User, orderId: string, question: string): ClarificationRecord {
    return this.transaction(() => {
      const { entitlement } = this.requireActiveEntitlement(customer, orderId);
      const packet = this.packetForOrder(orderId);
      if (!packet) throw new PacketError("Clarification is available once the packet is delivered.", 409, "not-ready");
      const q = question.replace(/\s+/g, " ").trim();
      if (!q || q.length > 1000) throw new PacketError("Ask one question of at most 1000 characters.");
      if (entitlement.clarificationsUsed >= entitlement.clarificationLimit)
        throw new PacketError(`This order includes ${entitlement.clarificationLimit} written clarification${entitlement.clarificationLimit === 1 ? "" : "s"}; the limit was reached.`, 409, "limit");
      const res = this.db
        .prepare("UPDATE pk_entitlements SET clarifications_used=clarifications_used+1 WHERE order_id=? AND clarifications_used<clarification_limit AND active=1")
        .run(orderId);
      if (!res.changes) throw new PacketError("Clarification limit reached.", 409, "limit");
      const id = randomUUID();
      this.db
        .prepare("INSERT INTO pk_clarifications VALUES (?,?,?,?,?,NULL,'[]','pending',NULL,?,NULL)")
        .run(id, orderId, packet.id, customer.id, q, now());
      return this.rowToClarification(this.db.prepare("SELECT * FROM pk_clarifications WHERE id=?").get(id) as Record<string, unknown>);
    });
  }
  answerClarification(id: string, answer: string, citations: { sourceId: string; anchorId: string }[], receipt: Record<string, unknown>) {
    this.db
      .prepare("UPDATE pk_clarifications SET answer=?, citations=?, status='answered', receipt=?, answered_at=? WHERE id=? AND status='pending'")
      .run(answer, JSON.stringify(citations), JSON.stringify(receipt), now(), id);
  }
  /** Provider failure: release the reserved slot so the customer keeps the clarification entitlement. */
  failClarification(id: string, error: string) {
    this.transaction(() => {
      const row = this.db.prepare("SELECT order_id, status FROM pk_clarifications WHERE id=?").get(id) as { order_id: string; status: string } | undefined;
      if (!row || row.status !== "pending") return;
      this.db.prepare("UPDATE pk_clarifications SET status='failed', receipt=? WHERE id=?").run(JSON.stringify({ error: error.slice(0, 1000) }), id);
      this.db.prepare("UPDATE pk_entitlements SET clarifications_used=MAX(0, clarifications_used-1) WHERE order_id=?").run(row.order_id);
    });
  }

  // ------------------------------------------------------------- my packets
  listCustomerPackets(customer: User) {
    const rows = this.db
      .prepare(
        `SELECT r.id as request_id, r.brief, r.frozen_version, r.created_at, o.id as order_id, o.status as order_status, o.sandbox,
                (SELECT status FROM pk_runs WHERE order_id=o.id ORDER BY attempt DESC LIMIT 1) as run_status,
                (SELECT active FROM pk_entitlements WHERE order_id=o.id) as entitled
         FROM pk_requests r LEFT JOIN pk_orders o ON o.id = (SELECT id FROM pk_orders WHERE request_id=r.id ORDER BY created_at DESC LIMIT 1)
         WHERE r.customer_id=? ORDER BY r.created_at DESC`,
      )
      .all(customer.id) as Record<string, unknown>[];
    return rows.map((r) => {
      const brief = parse<Brief>(r.brief as string);
      return {
        requestId: r.request_id as string,
        title: brief.title || "Untitled request",
        product: brief.product,
        sectorTags: brief.sectorTags,
        frozenVersion: (r.frozen_version as number | null) ?? null,
        createdAt: r.created_at as string,
        orderId: (r.order_id as string | null) ?? null,
        orderStatus: (r.order_status as OrderStatus | null) ?? null,
        sandbox: !!r.sandbox,
        runStatus: (r.run_status as RunStatus | null) ?? null,
        entitled: !!r.entitled,
      };
    });
  }

  // ----------------------------------------------------------------- owner ops
  /** Owner-only operational summary; contains no customer source text. */
  operations() {
    const count = (sql: string) => (this.db.prepare(sql).get() as { n: number }).n;
    return {
      requests: count("SELECT COUNT(*) n FROM pk_requests"),
      orders: {
        total: count("SELECT COUNT(*) n FROM pk_orders"),
        paid: count("SELECT COUNT(*) n FROM pk_orders WHERE status='paid'"),
        pending: count("SELECT COUNT(*) n FROM pk_orders WHERE status='checkout_pending'"),
        revoked: count("SELECT COUNT(*) n FROM pk_orders WHERE status IN ('revoked','refunded')"),
        sandbox: count("SELECT COUNT(*) n FROM pk_orders WHERE sandbox=1 AND provider='whop' AND status IN ('paid','refunded','revoked')"),
        simulated: count("SELECT COUNT(*) n FROM pk_orders WHERE provider='simulated' AND status IN ('paid','refunded','revoked')"),
        live: count("SELECT COUNT(*) n FROM pk_orders WHERE sandbox=0 AND provider='whop' AND status='paid'"),
        liveRefunded: count("SELECT COUNT(*) n FROM pk_orders WHERE sandbox=0 AND provider='whop' AND status IN ('refunded','revoked')"),
        liveGrossReceipts: (this.db.prepare("SELECT COALESCE(SUM(CAST(amount AS REAL)),0) s FROM pk_orders WHERE sandbox=0 AND provider='whop' AND status IN ('paid','refunded','revoked')").get() as { s: number }).s,
        liveNetReceipts: (this.db.prepare("SELECT COALESCE(SUM(CAST(amount AS REAL)),0) s FROM pk_orders WHERE sandbox=0 AND provider='whop' AND status='paid'").get() as { s: number }).s,
      },
      runs: {
        ready: count("SELECT COUNT(*) n FROM pk_runs WHERE status='ready'"),
        failed: count("SELECT COUNT(*) n FROM pk_runs WHERE status='failed'"),
        canceled: count("SELECT COUNT(*) n FROM pk_runs WHERE status='canceled'"),
        active: count("SELECT COUNT(*) n FROM pk_runs WHERE status IN ('queued','running')"),
        costUsd: (this.db.prepare("SELECT COALESCE(SUM(cost_usd),0) c FROM pk_runs").get() as { c: number }).c,
      },
      receipts: (
        this.db
          .prepare("SELECT id, order_id, request_id, attempt, status, requested, effective, budget_reserved_usd, cost_usd, input_tokens, output_tokens, tool_calls, repairs, escalations, started_at, finished_at, error FROM pk_runs ORDER BY created_at DESC LIMIT 50")
          .all() as Record<string, unknown>[]
      ).map((r) => ({ ...r, requested: r.requested ? parse(r.requested as string) : null, effective: r.effective ? parse(r.effective as string) : null })),
    };
  }
  /** Owner adjustment: raise the order's cumulative budget ceiling explicitly. Never charges the customer. */
  listOrdersForOwner() {
    return (this.db.prepare("SELECT * FROM pk_orders ORDER BY created_at DESC LIMIT 200").all() as Record<string, unknown>[]).map((r) => this.rowToOrder(r));
  }
}

let singleton: PacketStore | undefined;
/** Shares the durable single-host SQLite database and its serverless guard. */
export function packetStore() {
  try {
    return (singleton ??= new PacketStore(workspaceStore()));
  } catch (error) {
    if (error instanceof WorkspaceError) throw new PacketError(error.message, error.status, "storage");
    throw error;
  }
}

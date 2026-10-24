# Architecture — purchase, prepare, deliver, learn

```
Customer ─► shadcn screens (/, /sample, /packets/*, /orders/*/packet)
             │ authenticated JSON routes (origin-checked POST, customer-scoped reads)
             ▼
   PacketStore (SQLite, shares ChangeStore db + serverless guard)
   requests → sources (hashed) → frozen request version → order → entitlement
             │                                   ▲
   Whop checkout ──► verified webhook ──► authoritative payment lookup ─┘
             │
   pk_runs (leases, attempts, budgets) ◄── in-process worker (instrumentation.ts)
             │
   Opus 5.5 runner (Claude Agent SDK, isolated) ── policy.ts (versioned effort)
             │ read_source / find_anchors / submit_packet (authorization inside each tool)
             ▼
   validatePacket (schema + exact citation binding) ──► immutable packet v1 ──► download / clarification
Owner ─► Research: study records bound to packet+manifest+key digests ◄─ Terac submissions (hosted MCP)
```

## State machines (separate)

- Commerce: `checkout_pending → paid | failed | canceled → refunded | revoked`. Driven only by `applyAuthoritativePayment` over the provider's payment object; events are deduplicated by id and converge regardless of order.
- Fulfillment: `queued → running → ready | failed | canceled`; one row per attempt, `UNIQUE(order_id, attempt)`, leases with recovery; `publishPacket` requires lease, passing validation, matching manifest digest and no prior delivery.
- Engineering: untouched (`lib/changes`). Customers are a third role with no reviewer authority; packet delivery never writes heads, revisions or change events (tested).
- Research: `prepared → quoted → authorized → launched → responses-received → analyzed → closed`; status changes are owner actions recorded after the hosted MCP call.

## Runtime effort policy (`lib/packets/policy.ts`, `caid.j12-effort-policy/1`)

Start effort = configured default (provisional until an evaluation id is set), stepped up one level only on predefined complexity criteria (≥6 sources or ≥120 KB), never above `maxEffort`, and only if the SDK reports the level as supported. One second chance per run: an in-conversation repair at the same effort, or one escalation to the next level when ≥2 validator errors are reasoning-type and budget/time remain. Cumulative per-order budget, tool-call limit and deadline are shared across phases and attempts; retries receive only what remains; an exhausted ceiling needs an explicit owner adjustment (`pk_budget_adjustments`). Receipts record policy version, requested/effective effort, selection reason, phases, tokens, cost, latency and validator outcome.

## Isolation

`settingSources: []`, `tools: []`, `strictMcpConfig`, `persistSession: false`, scratch cwd, custom system prompt; the only tools are in-process MCP tools bound to one frozen request. Source text is returned framed as data. Every route and tool checks ownership and entitlement independently of SDK permissions.

## Labeled non-live paths

- `synthetic-fixture`: the public sample (`lib/packets/fixture.ts`); no storage, no model.
- `test-double`: deterministic runner for automated verification; refused in production without `CAID_ALLOW_TEST_DOUBLE=true`; every receipt and download is labeled.
- `simulated` payments: signed-webhook test double; refused in production without `CAID_ALLOW_SIMULATED_PAYMENTS=true`; orders carry `provider="simulated"` and are reported separately from Whop sandbox and live receipts.

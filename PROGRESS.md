# Build progress

## 2026-10-24 — public repository and Vercel site

Published as a new public GitHub repository, `deanhu0822/general-hardware`, and a new Vercel project, `general-hardware`. Production URL: https://general-hardware-beta.vercel.app. The offer and synthetic sample return HTTP 200 without Vercel authentication. SSO deployment protection was turned off so the link is public. Paid packet storage remains refused on this serverless deployment; the SQLite guard is unchanged. The existing `caid-labs` remote was not overwritten.

## 2026-10-24 — J12 Review Packet business implemented (local, verified)

Build harness: Cursor Agent, Claude Fable 5.1 (requested High effort, 1M context; the prompt cannot attest the picker). Runtime: Claude Agent SDK 0.3.310, Claude Opus 5.5, verified through `supportedModels()` on the Caid org login (`claude-opus-5-5`, effort `low/medium/high/xhigh/max`, context window 1,000,000 as reported by the SDK on live runs). Separate credentials: runtime uses the server's Claude Code managed-key login; no `ANTHROPIC_API_KEY` is set.

### Completed and verified

- Durable business store on the existing SQLite workspace (shares the serverless guard): requests → hashed sources → frozen request version → order → entitlement → leased run attempts → immutable packet v1 → clarifications; payment events deduplicated by id; owner budget adjustments. `lib/packets/store.ts`.
- Versioned adaptive effort policy `caid.j12-effort-policy/1` (`lib/packets/policy.ts`): deterministic start effort, one complexity step-up, one repair-or-escalation pass, cumulative per-order budget/tool/time limits shared across phases and retries, owner-only ceiling adjustment; unsupported effort or model mismatch fails before any spend.
- Isolated Opus 5.5 adapter (`lib/packets/opus-runner.ts`): no filesystem settings, no built-in tools, strict MCP, scratch cwd; `read_source`/`find_anchors`/`submit_packet` bound to one frozen request; effective model, effort, context window, tokens, cost and phases captured in receipts.
- Deterministic validator: exact source register, SHA-256 and anchor offset/excerpt binding, no verified-measurement kind, no approval language in the next action, mandatory retain/replacement alternatives and boundary sentence.
- Payments: Whop provider on pinned `@whop/sdk@2.6.0` (checkout configurations, payment retrieval, `unwrapWebhook`), authoritative-state reconciliation, forged/duplicate/out-of-order handling, refund → revocation; labeled simulated provider for verification (refused in production without an explicit flag).
- Routes (all real-data routes authenticated and customer-scoped): auth, requests, sources, order/checkout, order status + persisted events, packet, Markdown download, frozen source text, bounded clarification, My packets, owner ops, Whop webhook, simulated checkout actions, research studies, public study participation, public synthetic sample.
- In-process worker via `instrumentation.ts` → `lib/packets/worker-start.ts` (off on Vercel/`CAID_WORKER=off`), labeled test-double runner for automated verification.
- shadcn/ui screens: offer + sample (`/`, `/sample`), account, intake/order status (`/packets/new`, `/packets/[id]`), packet with source Sheet and clarification Sheet (`/orders/[id]/packet`), My packets with URL-persisted sector filter, owner Research/operations, simulated checkout, public study task page. Account menu holds My packets and owner-only Research. Honest states implemented: unauthenticated, payments unavailable, payment pending, order failed/canceled, queued, running, ready, run failed, budget exhausted, canceled, revoked, not ready, not found.
- Research module (`lib/research/store.ts`): study records frozen to packet digest, manifest digest, answer key and presentation; responses keyed by Terac submission id; previews and unbound responses never count; predeclared exclusions only; timeouts stay in the denominator; analysis with counts and limitations.
- Frozen evaluation set `caid.j12-eval-set/2` (complete, missing, conflicting, adversarial) with reviewed keys and deterministic scoring (`lib/packets/eval-cases.ts`); evaluation and rescoring scripts.
- Handoff docs: `docs/handoff/{SETUP,ARCHITECTURE,DEMO_SCRIPT,TERAC_STUDY,WHOP_LAUNCH}.md`, receipts and evaluation records, `Dockerfile`, `.env.example`, README section.

### Checks run (documented order; all passed)

- `npm run lint`: 0 errors, 0 warnings.
- `node --test tests/change-workflow.test.cjs tests/revision-approval.test.cjs tests/packets-*.test.cjs`: 59 passed (18 original + 41 new) covering citation binding/missing/conflicting/adversarial keys, customer isolation and unauthorized reads, engineering authority (customer cannot review; fulfillment never advances heads/revisions), forged/tampered/stale/duplicate/delayed/out-of-order/wrong-business/amount events, revocation and idempotent fulfillment, lease recovery, crash/retry/cancel/deadline/cumulative-budget exhaustion, effort selection, unsupported settings, model mismatch, one-pass escalation decision, and Terac response-to-study/version binding.
- `npx vite build` then `npm run build` (sequential): passed; no Edge-runtime warnings after moving the worker into a Node-only module.
- `npx tsc --noEmit`: passed (after `next typegen`).
- `node scripts/verify-change-http.mjs`: passed (original gates intact).
- `node scripts/verify-packets-http.mjs`: 52 checks passed against `next start` — public sample, 401s, cross-origin rejection, registration, isolation (404 for other customers), unreadable source rejection, freeze on order, idempotent order, forged webhook rejected, pending does not fulfil, verified payment queues one run, replay deduplicated, worker publication, labeled download, source text authorization, clarification limit, refund revocation (403 revoked on packet/download/clarification), owner setup via original token path, owner ops counting simulated vs live separately, engineering accounts refused from buying, study creation, public study definition without answer key, preview provenance, and restart persistence of order/run/revocation.
- Python dataset validation: 5 accepted, 0 rejected, 0 warnings.
- `npm audit` and `npm audit --omit=dev`: 0 vulnerabilities.
- Browser journey (Cursor browser, `next start`, real Opus worker, simulated payments): offer → sample (citation chip opens the source Sheet with highlighted excerpt) → register → intake → three sources → preflight → purchase → simulated pay (HTTP 200, run queued) → order status shows persisted stage events → packet delivered → clarification answered live → Escape closes the Sheet and focus returns to the trigger; all buttons labeled, one h1; 390px: no horizontal overflow; 200% zoom (640px CSS viewport): no overflow. Citation chips given a 24px minimum target after the check.
- Performance (lab, localhost, cached): TTFB 11 ms, DCL 16 ms, load 28 ms, CLS 0; LCP entry not emitted by the headless tab. Offer route JS: 14 chunks, 1,088 KB decoded (React/Next runtime dominates); no Three.js or xyflow code on the default route.

### Measurements (actual)

- Live end-to-end demo run (receipt `docs/handoff/receipts/live-demo-run-2026-10-24.json`): `claude-opus-5-5`, effort medium (policy-selected, provisional at the time), 5 tool calls, 15/15 anchors resolved, 31 citations against 13 anchors, 0 repairs, 0 escalations, 27,567 in / 5,609 out tokens, **$0.1653**, **48.4 s**; clarification $0.0488, 8.2 s, cited to S3/S1 anchors and answered "not approved".
- Effort evaluation (`docs/handoff/evaluation/effort-evaluation-2026-10-24T22-21-17-679Z.rescored.md`, 12 observations, 1 repeat per cell, total $1.88): low 2/4 task-complete (one missed required gap, one wrong next action), medium 4/4, high 4/4 with two repairs; schema+citation pass 12/12; 0 false approvals; 0 unsupported numeric claims. Cost per task-complete packet: low $0.24 (n=2), medium $0.14 (n=4), high $0.21 (n=4). Latency ranges: low 30.5–37.2 s, medium 39.6–50.5 s, high 45.1–89.2 s. **Medium selected as default** (`CAID_RUNTIME_EFFORT_EVALUATED=true` in `.env.example`); high remains the escalation ceiling. Rubric note: v1's phrasing-sensitive disclosure regex was replaced by v2 (gap count plus a non-boundary limitation); answer keys unchanged; both scores reported. Confound: eval briefs 2–4 mention `SYN-REQ-v1` in the constraints while that source is absent; the model labeled it author-entered. One repeat per cell is a provisional measurement, not a statistical result; no percentiles reported.

### Failed

- None outstanding. Transient: the first eval-grid launch was killed with its shell (relaunched); the route-type check needed `next typegen` after new routes; the `app/page.tsx` stale type was removed.

### Blocked (external)

- **Whop**: no credentials (`WHOP_API_KEY`, `WHOP_COMPANY_ID`, `WHOP_WEBHOOK_SECRET`). No business, sandbox or live order exists; revenue is $0. Exact owner actions in `docs/handoff/WHOP_LAUNCH.md`. Price remains a hypothesis.
- **Deployment**: no authorized durable Node host. Vercel CLI is authenticated but the project is unlinked and serverless disk is refused by design. `Dockerfile` and `SETUP.md` describe the single-host deployment. No URL is claimed.
- **Terac study**: hosted MCP connected (org CT, $100 balance); feasibility request `p6wdbetv7s5qbud1ttaazehc` submitted and still `RECEIVED` (no price yet). Launch needs a public task URL, the confirmed quote, and explicit owner authorization of the spending cap; the exact draft is in `docs/handoff/TERAC_STUDY.md`. No participants recruited; the research gate is **incomplete**, not passed. Presentation B is scaffolded but must be chosen from observed baseline friction.
- **Demo recording**: script written; no playable recording produced in this session.

### Not run

- Live Whop sandbox checkout; multi-host concurrency (SQLite is single-host by design); field LCP/INP; repeated evaluation runs (repeats > 1); `xhigh`/`max` effort levels (supported by the SDK, excluded from the grid as not candidates for a default).

### Exact next external actions

1. Owner: provide Whop business id, API key and webhook secret (sandbox first); register the webhook; decide the live price.
2. Owner: choose a durable Node host, deploy with the `Dockerfile`, set `FORMA_CHANGE_DB` on a volume, `CAID_ORIGIN`, create the owner account via the setup token.
3. Owner: read the Terac quote when it lands, confirm the audience and 8-participant count, authorize the cap; then create the draft with the public `/study/<id>` URL and launch from the dashboard link.

Nothing was committed, pushed, deployed, published or messaged. Planning files in `docs/caid-plan` were not modified.

## Balanced sector fixture expansion

Added a separate 64-case/16-product/176-source matrix, read-only `/sample/coverage` browser and `scripts/evaluate-sectors.cjs` scheduler. Each sector gets two products and four evidence conditions; default two repeats schedule 128 observations per effort policy. Original Rover/Terac fixture is preserved. New answer keys need independent review. Verification: 65 unit tests passed; 128 test-double runs completed with valid schema and source-bound citations (no live quality claim); production webpack build and TypeScript passed; both HTTP verification scripts passed, including 52 packet HTTP checks. Browser selection verified all eight sector groups and the medical-flow adversarial case with its corresponding sources. A pre-existing client import of the server-only model module blocked the build; shared sector/form constants were moved into a client-safe module while preserving server exports. No live provider calls are part of this asset update, so cross-sector Opus quality, cost and latency remain unmeasured. The original Rover fixture and research baseline are unchanged.

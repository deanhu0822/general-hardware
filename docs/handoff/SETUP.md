# Setup — Caid Labs J12 Review Packet

Single persistent Node host, one process: Next.js routes plus the in-process packet worker, durable SQLite on a mounted volume. Serverless hosts are refused for live orders by the existing storage guard.

## Local (verified 2026-10-24, macOS, Node 22.15.1)

```bash
npm ci
cp .env.example .env.local      # then edit as below
npm run build                   # production build; also generates route types
```

Minimum `.env.local` for a local run with real Opus 5.5 and the labeled simulated payment double:

```dotenv
FORMA_CHANGE_SETUP_TOKEN=<openssl rand -hex 32>
CAID_PAYMENTS_PROVIDER=simulated
CAID_SIMULATED_WEBHOOK_SECRET=<≥16 random chars>
CAID_RUNNER=opus
CAID_RUNTIME_DEFAULT_EFFORT=medium
CAID_RUNTIME_MAX_EFFORT=high
```

Runtime credentials: the server process needs a Claude Code login (`claude login`, keychain) or `ANTHROPIC_API_KEY`. The worker verifies the model through the pinned SDK at start (`supportedModels()` → `claude-opus-5-5`, effort `low/medium/high/xhigh/max`) and refuses to run if the resolved model differs.

```bash
npm start                       # next dev with the worker
# or production:
NODE_ENV=production FORMA_CHANGE_DB=.forma/changes.sqlite node node_modules/next/dist/bin/next start -p 3000
```

1. Open `/changes`, enter the setup token, create the owner account, then remove the token.
2. Open `/` for the offer, `/sample` for the synthetic sample, `/account` to register a customer.
3. Customer: `/packets/new` → brief → sources → Purchase → (simulated checkout page) → order status → `/orders/<id>/packet`.
4. Owner: account menu → Research (owner) for operations, budgets and the Terac study records.

## Production host

Use the `Dockerfile` or any Node 22 host with a persistent volume:

```dotenv
NODE_ENV=production
FORMA_CHANGE_DB=/data/caid.sqlite
FORMA_CHANGE_ORIGIN=https://your-origin
CAID_ORIGIN=https://your-origin
CAID_PAYMENTS_PROVIDER=whop
WHOP_API_KEY=... WHOP_COMPANY_ID=biz_... WHOP_WEBHOOK_SECRET=... WHOP_SANDBOX=true
CAID_RUNNER=opus
```

Register the Whop webhook endpoint at `https://your-origin/api/packets/webhooks/whop`. Run exactly one instance against one database (leases recover a crashed worker; they do not make SQLite multi-host). Back up with `sqlite3 /data/caid.sqlite ".backup /backups/caid-$(date +%F).sqlite"`; restore by stopping the process and copying the file back. Restart persistence is covered by `scripts/verify-packets-http.mjs`.

## Checks (documented order)

```bash
npm run lint
node --test tests/change-workflow.test.cjs tests/revision-approval.test.cjs tests/packets-*.test.cjs
npx vite build                  # then, never concurrently:
npm run build
npx tsc --noEmit
node scripts/verify-change-http.mjs
node scripts/verify-packets-http.mjs
.venv/bin/python product_pipeline/validate.py --no-quarantine product_pipeline/dataset/products/*.json
npm audit
```

Effort evaluation (spends model budget; bounded by `--ceiling`):

```bash
node scripts/evaluate-effort.cjs --efforts low,medium,high --cases complete,missing,conflicting,adversarial --repeats 1 --ceiling 8
node scripts/rescore-evaluation.cjs docs/handoff/evaluation/<record>.json
```

# Local setup and runtime harness

Prepared 2026-10-24. Repository: /Users/dean/Desktop/zero-human.

## Ready to open

Caid is checked out directly at the project root with its Git history and origin https://github.com/deanhu0822/caid-labs.git. Upstream commit: 53512822b2c56fb25ae2457ed426e6b9774886b9. Working branch: codex/j12-review-packet. Nothing was committed or pushed. There is no nested caid-labs folder. All 11 original docs/caid-plan files were verified byte-for-byte unchanged.

Root AGENTS.md now includes the planning appendix while preserving the generated Next.js instructions; CLAUDE.md still references AGENTS.md. Node dependencies were installed with npm ci. Python dependencies are installed in .venv (Python 3.14.7). An ignored, owner-readable .env.local contains the upstream mock configuration, local Python path, and a generated owner bootstrap token. No external provider credentials were added. See the existing README for owner setup; remove the bootstrap token after creating the owner account. Do not share .env.local.

1. In Cursor, open /Users/dean/Desktop/zero-human as the project folder.
2. Choose Agent mode and select Claude Fable 5.1, 1M context, High effort in the actual model controls. Verify your account exposes these options. The project instructions request these settings but cannot change or attest to Cursor's UI configuration. Do not silently substitute another model if unavailable.
3. Paste the complete contents of docs/caid-plan/START_IN_CURSOR.txt. The prompt already handles an existing checkout and preserves current work.
4. To preview the existing prototype, run npm run dev in the root and open the localhost URL printed by Next.js. No server is left running by this setup.

## Checks completed

- npm run lint: passed.
- node --test tests/change-workflow.test.cjs tests/revision-approval.test.cjs: 14 passed.
- npm run build -- --webpack: passed.
- npx tsc --noEmit after build: passed.
- node scripts/verify-change-http.mjs: passed initialization, CSRF, sessions, permissions, stale writes, review, immutable save, size limit, and logout.
- .venv/bin/python product_pipeline/validate.py --no-quarantine product_pipeline/dataset/products/*.json: 5 accepted, 0 rejected, 0 warnings.

These checks validate the existing prototype, not the future payment/research/agent implementation. No visual browser acceptance test was performed during setup.

npm audit reports 17 advisories: 1 low, 15 high, 1 critical, including a critical finding against the installed Next.js. Preserve this baseline for development; remediation and regression verification are required before public deployment. Do not blindly run audit fix --force. Review current advisories, update affected packages deliberately, and rerun relevant checks. No application dependencies or application code were changed during setup.

## Two different harnesses

The development harness is Cursor Agent: it uses the selected model to read project instructions, inspect/edit code, execute tools, and run tests. shadcn/ui is the planned UI component system. Neither provides the application's production agent runtime. The present checkout still uses its existing inference adapters and explicit mock default; shadcn/ui and the Claude Agent SDK worker are planned work, not already integrated.

The application harness is a proposed single coordinating Claude Agent SDK worker, wrapped in a deterministic service workflow:

Authenticated intake → server-verified Whop entitlement → frozen request/source manifest → durable queued job → isolated Opus 5.5 Agent SDK worker → structured packet → deterministic schema/citation/access checks → immutable packet version → authorized delivery and bounded clarification.

A separate human engineering review process retains the existing approval authority. Packet ready never means engineering approved.

Consistency comes from versioned inputs, persisted jobs, leases, idempotent fulfillment, retry/cancellation rules, and immutable output versions. Accuracy comes from exact source references, explicit missing/conflicting evidence, restricted tools, and evaluation against independently checked examples. Precision comes from typed inputs/outputs, stable source anchors, and validators that reject malformed or unsupported references. Matching a citation does not prove the underlying engineering claim is true. Real-world engineering acceptance still requires qualified review and relevant physical evidence.

The worker must enforce customer authorization inside every tool, use a clean isolated configuration, and have no tools for charging customers, recruiting participants, sending outbound messages, approving engineering, or advancing product revisions. SDK tool permission settings alone are insufficient. Bound cost, time and tool calls; allow at most one repair pass before an explicit failure. Record requested and effective model settings, versions, source hashes, validator results, latency and actual cost. Runtime credentials/configuration are separate from the Cursor subscription and model picker.

Use deterministic orchestration for payment, entitlement, job state and publication. Use the model for bounded synthesis and clarification. Keep MiroFish, additional agents and CAD out of this launch scope. Terac measures actual task comprehension using the frozen protocol in 05_ACCEPTANCE.md; it does not validate physical engineering correctness or guarantee buyer demand. Real Whop revenue and real Terac results remain uncollected until those integrations and authorized live runs exist.

## Documentation references

- Cursor model controls: https://cursor.com/docs/models/claude-fable-5-1
- Claude effort configuration: https://platform.claude.com/docs/en/build-with-claude/effort
- Claude Agent SDK: https://code.claude.com/docs/en/agent-sdk/overview
- SDK permission semantics: https://code.claude.com/docs/en/agent-sdk/permissions
- shadcn/ui on existing Next.js: https://ui.shadcn.com/docs/installation/next

Cursor build agent: Claude Fable 5.1, 1M context, High effort. Application runtime: Claude Agent SDK with Claude Opus 5.5, using adaptive, bounded effort with measured quality, cost, and latency; verify its supported context capacity and effective settings through the actual account and pinned SDK. Actual account availability and the pinned runtime SDK must be verified during implementation. No harness guarantees correct engineering conclusions or an 8–9/10 event score.

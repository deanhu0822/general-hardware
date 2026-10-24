# Evidence and decisions — narrowed J12 business

Updated 24 October 2026. Reuses research already collected in this chat. Application execution, live integrations, revenue and participant results have not been verified by this planning update.

## Inspected foundations

- [Caid commit 5351282](https://github.com/deanhu0822/caid-labs/tree/53512822b2c56fb25ae2457ed426e6b9774886b9): existing Next.js/React app and persistent change/review system. Authentication/storage limits require inspection before using private data.
- [Caid persistence contract](https://github.com/deanhu0822/caid-labs/blob/53512822b2c56fb25ae2457ed426e6b9774886b9/docs/persistent-change-workflow.md): single durable-host SQLite, review/version safeguards and limited auth surface.
- [Terac cookbook commit 77b3473](https://github.com/TeracAI/terac-cookbook/tree/77b3473c7437a480fd639d38a2a40b6b6226d246): MIT workflow examples, synthetic replay, bounded live study operations; no substantive feedback delivery through the reviewed adapters.
- [Terac access contract](https://github.com/TeracAI/terac-cookbook/blob/77b3473c7437a480fd639d38a2a40b6b6226d246/docs/terac-access.md): study bindings, explicit launch confirmation and retrieval limitations.
- [Hosted Terac MCP](https://www.terac.com/mcp): documented endpoint https://terac.com/api/mcp with OAuth/tool discovery. Verify actual connected schemas and permissions.
- [Whop quickstart](https://docs.whop.com/developer/quickstart): server-side credentials, checkout, webhooks and sandbox separation. Read exact SDK/security/entitlement documentation during implementation.
- [shadcn existing Next.js setup](https://ui.shadcn.com/docs/installation/next): initialize in place and add selected components after checking styles/aliases.
- [Cursor Fable](https://cursor.com/docs/models/claude-fable-5-1), [Claude effort](https://platform.claude.com/docs/en/build-with-claude/effort), [Agent SDK](https://code.claude.com/docs/en/agent-sdk/overview): configuration evidence, not account capability verification.

Mobbin access required a paid plan; no screens were retrieved. UI patterns in this package are original proposals, not an inspected Mobbin design.

## Event requirements

The supplied [NYC guidebook](https://app.notion.com/p/GUIDEBOOK-Zero-Human-Company-Hackathon-NYC-by-Terac-4002f66e615381b3adcbf72fe8123955) requires Terac MCP, real event-collected human feedback with measurable improvement, an agent-run business on Whop with payments through Whop, and real organic revenue for revenue claims. It asks for a public repository, live website, two-minute demo and Whop Business ID. General-population studies are encouraged. Check current organizer instructions and submission availability before submitting; no live deadline extension or submission URL is assumed.

The [SF event page](https://terac.com/events/hackathon) published overall weights of 40% improvement, 35% product, and 25% use of human input; its agent-run-company award used revenue as the sole criterion. These are SF reference criteria, not substituted NYC rules.

Two illustrative SF examples: TalosAI's builder [reported second place in the Superserve track](https://www.linkedin.com/posts/girikratna-sharma_ai-agenticai-hackathon-activity-7494970932126523393-JfXL) for a repair workflow with independent verification; Fastino [announced a track winner](https://www.linkedin.com/posts/fastinoai_this-weekend-we-co-hosted-the-terac-zero-human-activity-7495152064415617026-4jBE) that processed accounts-payable expenses end to end. These support the design inference that a narrow, completed business operation is easier to demonstrate than a broad platform. They do not establish comparative rankings, revenue figures or predicted odds for Caid.

## Final decisions

1. Sell preparation of a J12 review packet. Engineering approval remains separate.
2. Reuse Caid; preserve safeguards. No framework or full-domain rewrite.
3. Keep Cursor Fable 5.1 / 1M / High, Claude Agent SDK runtime Opus 5.5 / adaptive, bounded effort with verified context capacity, and shadcn/ui as fixed user choices.
4. One offer and one scenario. $29 is a configurable pricing hypothesis, not market evidence or live-launch authorization.
5. One coordinating worker. Logs and customer outcomes demonstrate automation; agent avatars do not.
6. Hosted Terac feedback improves packet usability; synthetic replay tests software only.
7. Eight tags remain metadata; Robotics & Industrial is the demonstrated use case.
8. Whop payment/entitlement and packet delivery have distinct state machines from engineering approval.
9. Defer MiroFish, CAD/3D, graph synchronization, extra connectors, subscriptions and expanded sector workflows entirely from this submission scope.
10. Evaluate success with genuine results. The desired 8–9/10 is an aspiration, not a claim of implementation or judge endorsement.

## Open external dependencies

Actual Whop business/product/account permissions and live offer authorization; separate Cursor Fable and runtime Opus/SDK credentials and account settings; Terac connection, quote, recruitment authority and participant availability; authorized deployment target; real customer acquisition and submission publication. Complete local implementation, sandbox tests and public-ready artifacts while these are pending. Never fill them with invented IDs, customers, responses or metrics.

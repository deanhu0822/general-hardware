# Separate build and runtime configurations

Cursor build agent: Claude Fable 5.1, 1M context, High effort. Application runtime: Claude Agent SDK with Claude Opus 5.5, using adaptive, bounded effort with measured quality, cost, and latency; verify its supported context capacity and effective settings through the actual account and pinned SDK. Keep the selected build and runtime models fixed; runtime effort may vary only under the logged adaptive policy. Frontend: **shadcn/ui on existing Next.js/React/Tailwind**, with Geist and Lucide.

## Authoring versus runtime

Select the requested settings in Cursor. The prompt cannot change the host model. The requested build configuration is Fable 5.1 / 1M / High; verify availability in the installed client. Verify the installed Cursor controls and actual account access; API capability does not guarantee the same picker exists in every client. [Cursor Fable](https://cursor.com/docs/models/claude-fable-5-1), [effort](https://platform.claude.com/docs/en/build-with-claude/effort).

The server-side Claude Agent SDK worker uses Claude Opus 5.5 with adaptive, bounded effort and independently verified context capacity. It has its own credentials, pinned version and billing. Resolve the exact supported API model identifier from official provider documentation/account availability; do not guess it. Verify model/effort/context mapping through the actual SDK/provider rather than inventing a parameter. Record requested and effective settings. Report a mismatch visibly and keep the manual/sample experience available; never present a substitute model or fixture as a live Opus 5.5 success. [SDK overview](https://code.claude.com/docs/en/agent-sdk/overview).

The Cursor 1M window is build-time capacity, not an input target or a promise about Opus runtime capacity. Retrieve only the purchased request's frozen sources and relevant instructions, reserve output space and reject oversized source sets honestly. Effort is selected by an explicit, versioned application policy within cost/deadline limits; it is not an assumed SDK auto switch. Fable's retention/enablement conditions require the applicable account owner's action; the plan does not accept provider terms.

## One focused agent job

Prepare a review packet and answer bounded, cited clarification. The company workflow may also prepare offer/support copy and synthesize actual Terac responses into an improvement proposal. No swarm, autonomous procurement, engineering approval or simulated expert votes.

Persist sources, run state and results in the app database. SDK session memory is not the authoritative business record. Do not reuse a session across customers or request versions. Deny unnecessary tools and enforce authorization inside each tool; SDK allow rules alone are not isolation. [Permission behavior](https://code.claude.com/docs/en/agent-sdk/permissions).

Provisional engineering limits for evaluation: 12 tool calls, one structure-repair attempt and a ten-minute run deadline, with a configurable per-order spending ceiling set before live use. These are product policy proposals, not SDK defaults or promised delivery speed. Tune with measured quality, cost, and latency; record each policy-selected effort and escalation reason. All attempts share the same per-order limits; escalating effort cannot reset budgets. Retryable failure retains entitlement and cannot trigger another charge.

## Adaptive runtime effort policy

Opus 5.5 remains the runtime model. Adaptive means a deterministic, versioned application policy selects from effort levels actually supported by the pinned SDK and account; do not invent an `auto` API parameter. Cursor remains Fable 5.1 / High / 1M. Record policy version, requested/effective effort, selection reason and budgets in every run receipt.

Use deterministic code for parsing, entitlement, schema checks and citation resolution where possible. Load only the authorized request's relevant frozen sources and reserve output capacity. Context and assets supply evidence; the durable workflow executes the business process. The Cursor 1M window does not prescribe runtime input size or establish Opus context capacity.

Before live use, evaluate supported effort settings on a fixed, independently reviewed J12 fixture set covering complete, missing, conflicting and adversarial source material. Define and freeze quality thresholds and cost/latency budgets before comparing settings. Select the lowest measured effort that meets all quality gates; until that evaluation exists, mark the runtime default provisional and live readiness incomplete. Do not assume lower effort is always cheaper overall, since repairs and failures also cost money.

Allow at most one higher-effort escalation or repair pass within the existing one-repair limit, based on explicit validator failures or predefined complexity/conflict criteria and remaining budget. Model self-confidence alone cannot trigger escalation. Missing physical evidence must remain an explicit gap; additional reasoning cannot create it. Max effort is an optional evaluated exception only if supported, justified by results, and within the same budget. If no eligible escalation remains, persist an honest incomplete/failed state and retain the applicable retry entitlement.

Enforce the configured per-order cost ceiling, output/token allowance, 12-tool-call limit and ten-minute deadline across all attempts, including repair and retries. These are provisional evaluation limits, not delivery promises or SDK defaults. Reserve budget before dispatch, reconcile actual usage after each call, and stop further work when remaining headroom is insufficient. Provider cancellation may not instantly stop billing; record outstanding usage and avoid promising an exact invoice cap. No escalation may restart the deadline or erase prior spend. Paid retries require remaining budget or an explicit owner budget adjustment; never charge the customer again automatically.

Measure citation resolution and independently assessed claim support separately; a resolving citation is not proof that a claim follows from it. Track unsupported claims, missing-evidence disclosure, false approval statements, schema validity and task completion. Every published packet must have resolving references and pass the authority/schema gates. Evaluate factual claim support against the reviewed answer key; do not rely solely on the generating model's own assessment.

Compare policies on the same frozen cases with repeated runs and disclosed sample sizes. Report quality pass rate, failure/repair/escalation rates, input/output tokens, total cost including failed attempts, end-to-end latency, and cost per successfully delivered packet. Report median and p95 only with adequate samples; otherwise show individual observations and ranges. Choose a policy on measured results rather than promising automatic quality or savings. Terac usability results remain separate from engineering-quality evaluation.

## Economics and performance

Record model tokens/cost, tool costs, elapsed time, source size and repair count per packet. Report median and p95 where there are enough observations; with a tiny sample report individual values and range instead. Distinguish successful-order cost from failed/retried attempts and disclose sample size.

For the provisional $29 offer, calculate contribution using actual net customer receipts minus provider processing fees, inference/tool costs and attributable hosting/fulfillment costs. Report Terac product-research spend separately and show the effect of allocating it across orders. Do not call gross revenue profit or ignore failed runs. If cost/latency makes the offer unattractive, report that fact and propose scope/price changes; retain the user's fixed model configuration.

shadcn/ui provides owned component primitives, not evidence of usability. Validate the actual purchase-to-packet journey and source readability. [Existing Next.js installation](https://ui.shadcn.com/docs/installation/next).

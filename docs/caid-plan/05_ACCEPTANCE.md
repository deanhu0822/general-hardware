# Acceptance — prove usefulness, delivery and improvement

These are future build gates, not completed test results. The 8–9/10 ambition is a quality target; no checklist guarantees placement or a judge's score.

## Core completion gates

| Gate | Observable pass condition |
| --- | --- |
| Useful deliverable | One J12 packet contains alternatives, source-linked claims, missing evidence and an actionable next step |
| Provenance | Every cited source/anchor resolves to the frozen input version; unsupported claims are labeled or removed |
| Payment to delivery | Verified Whop order → idempotent run → persisted packet → authorized download works end to end |
| Access | Other customers cannot read packets, sources, downloads, run streams or clarifications by guessing IDs |
| Truthful states | Pending payment, model failure, missing evidence and revoked access produce distinct honest states |
| Engineering boundary | Packet readiness cannot approve a change, create a test result or advance a product head |
| Separate model configurations | Cursor: Fable 5.1 / 1M / High. Runtime: Claude Agent SDK / Opus 5.5 / adaptive, bounded effort / verified context capacity. Record effective settings separately; no silent fallback |
| Real human input | Hosted Terac MCP receipts and actual study-bound responses exist; replay does not qualify |
| Product improvement | Versioned product change follows observed friction and has a comparable follow-up measurement |
| Business evidence | Actual organic receipts are separate from sandbox events, self-tests, refunds and unvalidated pricing |
| Submission | Accessible public repo, working live link, playable two-minute video and actual Whop biz_ ID |

Report completed, failed, blocked and not tested separately. A public sample alone does not prove live payment or live generation.

## Terac protocol — freeze before launch

Purpose: test comprehension and usability of the packet presentation. Participants are general-population adults using a synthetic robotics example. They are not assessing connector safety, certifying engineering or proving hardware-buyer willingness to pay.

Research exposure uses no customer data. Create a study-definition digest that includes task wording, synthetic source/packet version, answer key, timing rules, scoring rubric, exclusion rules and audience. Store the Terac IDs, authorization/quote receipt, launch time and response provenance. Retrieve substantive responses through verified hosted tools. Status alone is insufficient.

### Baseline round A

Target 8 valid completed participants, subject to actual feasibility, budget and availability. The target is not an achieved sample size. Give everyone the same short scenario: “An engineer is considering replacing connector J12. Use this packet to decide what should happen next.”

Ask three scored questions:

1. What is the next required action? The answer key identifies the missing evidence/request in the frozen packet.
2. Which exact source or labeled evidence gap supports that action? Require opening/selecting the corresponding source/gap, not guessing a filename.
3. Is the hardware change approved for release? Correct answer: no; packet delivery is advisory preparation and independent engineering approval is still outstanding.

Primary metric: **participants correct on all three questions / valid completed participants**. Score against the frozen answer key; do not let the agent modify the key after seeing responses. Preserve scoring rationale and independently review ambiguous free-text answers.

Secondary metrics: each question's success count, task abandonment, completion time from task start to final answer, source-panel usage, and reported confusion. Report median completion time among correct completers with its sample size; report timeout/abandonment separately. Proposed timeout is five minutes. A timeout is an unsuccessful task, not a participant to discard for making the result look worse.

Set technical-invalid exclusions before launch (for example duplicate submission or a recorded site outage preventing access). Report every excluded count and reason. Preserve all received response IDs and actual audience criteria. Do not selectively discard unfavorable feedback.

### Improvement

Use baseline observations to select one presentation change: clearer next-action wording, stronger missing-evidence labeling, more obvious source links or clearer packet-ready/approval distinction. These are candidates, not predetermined results. Keep the technical content, answer key and task constant. Save before/after screenshots, commit IDs and a rationale tied to actual responses. Do not alter answers to make the evaluation easier.

If baseline results are already at ceiling, report that and evaluate an observed secondary friction; do not manufacture a failed baseline. If a content error requires correction, document it and establish a new baseline rather than presenting the altered task as directly comparable.

### Follow-up round B

Target 8 new valid completed participants from comparable recruitment criteria. Use the same task/rubric and the new presentation. Prefer fresh participants; disclose repeat-participant learning if reuse is unavoidable. Sequential samples support descriptive findings, not strong causal or statistical claims.

Design aspiration: at least a 20-percentage-point increase in all-three-correct success, with no increase in false “approved for release” answers. This is not a pass quota or guaranteed outcome. With 8 participants per round, two additional successes equal 25 percentage points; always show counts as well as rates. A useful secondary aspiration is lower completion time without reduced correctness, subject to actual data.

Report A and B counts, rates, exclusions, abandonment, correct-completer time, changes and limitations. If improvement is absent or negative, say so and inspect the failure. Never rename a preferred metric after the fact to manufacture success. Two groups of eight are directional usability evidence, not market validation or engineering validation.

## Packet and commerce tests

- Missing baseline, unreadable source and conflicting source: packet preserves unknowns/conflicts and offers a precise next action.
- Invented source ID, altered source hash, unresolved anchor: validation blocks final publication until repaired or produces an explicitly partial result.
- Duplicate successful webhook and concurrent worker claim: one fulfillment identity, no double charge or duplicate packet publication.
- Forged webhook, wrong business/product, payment-pending redirect: no paid fulfillment.
- Out-of-order provider event, refund/revocation: reconcile authoritative status and enforce current access.
- Worker crash, provider timeout, exhausted budget, cancellation: persisted truthful terminal state, retained entitlement and safe retry.
- Source edit during a run: original run remains bound to its frozen version; never apply it silently to changed input.
- Prompt injection asking for other orders, credentials or approval: tool authorization rejects it.
- Author self-approval, missing reviewer approval, stale baseline and evidence invalidation: existing Caid gates still pass their regression tests.

## Existing checks and performance

Recheck the repository README and instructions before running: npm lint; existing change/revision node tests; production build; TypeScript check after generated route types exist; isolated HTTP workflow verification; applicable Python Product validation. Record real command results and environment limitations. [Baseline instructions](https://github.com/deanhu0822/caid-labs/blob/53512822b2c56fb25ae2457ed426e6b9774886b9/README.md).

Exercise offer → intake → sandbox purchase → real bounded generation (when credentials permit) → packet/source inspection → Markdown download → clarification. Also exercise an isolated synthetic route when no live credentials exist; label which path was tested. Test keyboard, 390px viewport and 200% zoom. Inspect bundles for heavy secondary features. Validate restart persistence and backup restore.

Record page performance, run latency, costs and failures on a named environment and dataset. Do not call a script-only smoke test a full browser verification. Do not call a script-only demo recording a video.

## Strong-submission evidence bar

An approximately 8/10-quality submission, in our planning judgment, would have a polished working loop, correct source handling, genuine Terac input and an honest measured improvement, plus all required submission artifacts. To argue for 9/10, add compelling real-customer purchase/use, repeatable reliability, transparent unit economics and a particularly clear improvement story. These are aspirations, not official judging criteria or guaranteed ratings.

## Adaptive runtime acceptance

- Cursor remains Fable 5.1 / High / 1M; runtime remains Opus 5.5 with a versioned effort policy and verified SDK support.
- Freeze independently reviewed J12 fixtures, quality thresholds and spending/latency budgets before selecting the lowest qualifying effort. Record actual results; an unevaluated default is provisional.
- Test effort selection, unsupported settings, one-pass escalation/repair, cumulative budgets across retries, cancellation, and no escalation for absent physical evidence.
- Receipts contain policy version, requested/effective effort, selection reason, token usage, cost including failed attempts, latency, and validator outcomes.
- Evaluate resolving citations separately from factual support. Report unsupported claims, missing-evidence disclosure, false approvals, schema validity, task completion and failure/repair rates.
- Report sample sizes and same-case comparisons; use individual values/ranges when percentile estimates lack adequate samples. Keep Terac usability metrics separate from engineering correctness.

## Balanced sector fixtures

The additional matrix is specified in [09_SECTOR_EVALUATION.md](09_SECTOR_EVALUATION.md). Require 64 distinct cases, equal counts across all eight sectors and four conditions, source/hash integrity, case-specific scoring, two-repeat scheduling, and explicit pending coverage. Test-double smoke results do not count as Opus quality, and the new draft answer keys need independent review. The original Terac synthetic study remains unchanged.

# Product — one paid J12 review packet

## Buyer, offer and scope

Buyer: a forward-deployed engineer or small robotics hardware team preparing a connector substitution. Job: assemble a defensible review packet faster without losing source context or hiding unanswered questions.

Public headline: **A review-ready packet for your connector change.**
Supporting copy: “Compare options, trace source claims and see what evidence is still missing. Your engineering team keeps the final decision.”

Sell one packet for one versioned request. Proposed pricing hypothesis: **US$29 one-time**, configurable and clearly unvalidated. This is neither a proven market price nor authorization to publish a live offer. Use Whop sandbox for testing; present the exact product, price and refund/fulfillment terms before live activation when not already authorized. Do not create subscriptions, automated repricing or upsells in this build.

Scope includes a bounded written clarification inside the purchased packet, grounded in the same supplied sources. A materially changed request creates a new version and explicitly reviewed scope; do not silently charge again. Failed generation grants no false delivered status and retains the purchaser's access/retry entitlement.

## Purchase-to-delivery journey

1. Visitor reads the offer and opens a synthetic sample packet without signing in.
2. Customer signs in, enters the J12 request, and uploads or pastes supported source text. The preflight checks readability and scope; it does not claim engineering validity.
3. Customer reviews the exact deliverable and price, then purchases through Whop.
4. Server verifies the payment/entitlement and creates one fulfillment run for that order and input version.
5. Agent reads the frozen source manifest, prepares a packet and runs structural/citation checks.
6. Customer views the persistent packet, downloads Markdown, and can ask the bounded clarification. Delivery happens in the authenticated app; external email is not required.
7. Customer may hand the packet into Caid's existing engineering review flow. That flow's evidence and independent approval gates remain intact.

Missing technical evidence does not prevent delivery of an honest preparation packet. It prevents claims that a design is verified or ready for release. Keep **Packet ready** separate from **Engineering approved**.

## Packet contract

Every packet includes:

| Section | Required content |
| --- | --- |
| Summary | Customer objective, exact request version, baseline or explicitly unresolved baseline |
| Source register | Source ID, filename/locator, supplied revision, content hash, excerpt/line anchors and retrieval/import date |
| Known facts | Claim-to-source mapping; distinguish source statements from verified measurements |
| Alternatives | At least retain/investigate current connector and evaluate replacement; compatibility unknown until evidenced |
| Affected artifacts | Only confirmed IDs and relationships; suggested impacts labeled separately |
| Evidence gaps | Missing pinout/dimensions/current/retention/environment/test data as applicable; no invented ratings |
| Review questions | Specific owner-facing questions and decision prerequisites |
| Next action | One actionable step, owner role and required input |
| Limitations | Author-entered, synthetic, unsupported or conflicting content clearly identified |
| Receipt | Order/run/packet version, effective model/settings, source manifest digest and completion time |

A packet can say “insufficient information to choose a replacement.” Do not manufacture a recommendation to make delivery appear more complete. Generated narrative is advisory; physical-test results require real evidence and authorized engineering review.

## Three screens, not three business modules

| Screen | Content and primary action |
| --- | --- |
| Offer/sample | Buyer, outcome, scope, price, sample and limitations → Prepare my packet |
| Intake/order | Brief, sources, preflight, purchase state and genuine run events → Purchase or view packet |
| Packet | Summary, alternatives, sources, gaps and next action → Download packet |

Returning customers get a compact My packets list through the account menu. Owner-only Research and operational status also live in that menu. Existing Caid changes/reviews remain supporting functionality, not a requirement to rebuild navigation. Do not build a new Products module or a fourth research dashboard destination.

```text
CAID LABS                                      My packets   Account
J12 connector-change review packet             Packet ready
Input v1 · Robotics & Industrial · Advisory preparation

NEXT ACTION
Obtain the missing vibration-test evidence before engineering approval.

Summary          Keep pinout compatibility as an unresolved constraint.
Alternatives     Retain/investigate J12 | Evaluate replacement
Evidence gaps    See missing sources and required measurements
Sources          Open exact excerpts behind each supported claim

[Download Markdown]                       Ask about this packet
```

The wording above is illustrative and must match the actual supplied sources. Demo fixtures are visibly synthetic.

## shadcn/ui implementation

Use the existing Next.js/React/Tailwind application. Retain Geist and Lucide. Add only Button, Input, Textarea, Field/Label, Badge, Table, Select/Combobox, Sheet, Dialog/AlertDialog, Collapsible, Skeleton and Tooltip as needed. Use one supported primitive family consistently. Reuse form/domain behavior while replacing visual primitives; do not overwrite global styles blindly or scaffold a second app. [Existing-project setup](https://ui.shadcn.com/docs/installation/next).

Neutral background, white working surface, dark readable text, one blue accent. Body 14–16px, title 24–28px, 8px spacing rhythm, modest corners. One primary action per state. Use a Sheet for clarification/source detail and Collapsible for long evidence sections. No hero animation, agent-avatar wall, decorative charts or chat-first homepage.

Show ordered persisted stage events, never fabricated progress percentages. Handle unauthenticated, unpaid, payment pending, queued, running, needs input, packet ready, failure, canceled and access-revoked states. Preserve drafts through errors. Test keyboard flow, focus return, named controls, non-color statuses, 390px layout and 200% zoom.

## Sector tags

Keep a single data-driven registry with these stable IDs:

| ID | Display label |
| --- | --- |
| aerospace | Aerospace |
| space | Space |
| medical-devices | Medical Devices |
| robotics-industrial | Robotics & Industrial |
| consumer-tech | Consumer Tech |
| maritime | Maritime |
| automotive | Automotive |
| heavy-machinery | Heavy Machinery |

Support multiple tags and Unclassified. Default the synthetic J12 example to Robotics & Industrial. Other sectors are metadata only; the offer explicitly covers the connector-review preparation use case and makes no sector-specific compliance claims. Suggestions require confirmation. Store a sector snapshot per request/packet version; never retag old packets retroactively. My packets filtering uses ANY within selected sectors and AND with other filters, with URL-persisted state. No taxonomy editor or eight specialized workflows.

## Performance targets

Measure, do not assume: initial page LCP ≤2.5s, INP ≤200ms and CLS ≤0.1 where suitable field data exists; otherwise label lab results. Keep graph/3D/scanner/MiroFish code out of the default bundle. Ordinary browsing and downloads must work when Opus 5.5 is unavailable. Record first-stage-event latency, complete packet latency and cost per delivered packet under the verified Opus 5.5 runtime configuration (adaptive, bounded effort). Do not promise an unmeasured turnaround time on the offer page.

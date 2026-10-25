# General Hardware

**Agent-powered deployment support for hardware startups.**

Caid turns scattered technical documents into a clear review packet: what can change, what the evidence supports, what is missing, and what to do next.

Starting with J12 connector substitution for robotics teams.

**Live site:** https://general-hardware-beta.vercel.app

## The problem

A small hardware change can create a large coordination task.

Engineers must gather datasheets, compare alternatives, trace affected components, and identify missing tests before a change can be approved. Small teams often do this across disconnected documents and spreadsheets.

Caid makes that preparation accessible without requiring a new enterprise management system.

## How it works

**Submit a request → Add sources → Purchase a packet → Review the evidence → Take the next step**

The packet includes:

- The request and source versions.
- Alternatives and potential impacts.
- Claims linked to exact source excerpts.
- Missing or conflicting evidence.
- Reviewer questions and a recommended next action.
- A downloadable Markdown report and execution receipt.

Customers can ask bounded follow-up questions with cited answers.

**Agents prepare the review. Engineers approve the change.**

Caid does not certify hardware, fabricate test results, or automatically approve engineering changes.

## Agentic workflow

Caid automates the preparation and delivery of a defined engineering-review artifact.

The workflow connects authenticated intake, payment entitlement, source retrieval, model execution, validation, packet delivery, and clarification.

The application uses Claude Opus 5.5 through the Claude Agent SDK. A versioned policy selects effort within cumulative cost, time, and tool-call limits. Medium is the current default based on a small local evaluation; high is the escalation ceiling.

Payment handling, access control, job state, and citation checks use deterministic application code. The agent cannot charge customers, approve hardware, or advance engineering revisions.

| Capability | Status |
|---|---|
| Intake, packet viewer, source references, downloads, clarification | Implemented |
| Live Opus packet generation and clarification | Demonstrated locally |
| Persistent storage and customer-scoped access | Implemented and tested |
| Adaptive effort and cumulative budgets | Implemented; initial evaluation recorded |
| Whop integration | Implemented; demonstrated with simulated payments |
| Real Whop sandbox checkout and live revenue | Not yet demonstrated; revenue is $0 |
| Terac study infrastructure | Implemented; feasibility requested |
| Real Terac participant results | Pending |
| Exa integration | Not yet implemented |
| Public deployment and demo video | Site deployed; demo video still pending |

Synthetic fixtures and simulated payments are labeled. They are not customer traction.

## Measured local results

One recorded live-model demonstration, using synthetic engineering sources and simulated payment:

| Metric | Observation |
|---|---:|
| Packet generation time | 48.4 seconds |
| Reported model cost | $0.1653 |
| Resolved citations | 31 across 13 verified anchors |
| Repair attempts | 0 |
| Clarification time | 8.2 seconds |
| Clarification model cost | $0.0488 |

An initial effort evaluation covered four J12 cases at three effort levels:

| Effort | Task-complete cases | Model cost per task-complete packet |
|---|---:|---:|
| Low | 2/4 | $0.24 |
| Medium | 4/4 | $0.14 |
| High | 4/4 | $0.21 |

These are small-sample observations under the recorded v2 rubric, not statistically established performance guarantees. The evaluation report documents rescoring and fixture limitations. Costs exclude payment fees, hosting, and research.

Citation resolution checks source binding; it does not independently establish engineering correctness.

See [evaluation records](docs/handoff/evaluation/) and [run receipts](docs/handoff/receipts/).

## Learning from real users

The planned Terac study tests whether participants can:

1. Identify the next action.
2. Locate the relevant evidence gap.
3. Recognize that hardware release is not approved.

The protocol targets eight baseline participants and eight fresh follow-up participants after one observed presentation improvement.

We will report actual counts, exclusions, abandonment, and limitations. Usability feedback does not substitute for engineering validation or demonstrate willingness to pay.

See the [Terac study plan](docs/handoff/TERAC_STUDY.md).

## Hackathon tracks

### Overall

A focused agent-operated business: turn a paid request into a useful, inspectable deliverable.

Submission evidence will distinguish live model execution, simulated transactions, genuine payments, and remaining human interventions.

### Terac

A measurable feedback loop: retrieve real participant responses, identify confusion, improve the presentation, and compare task success.

### Exa

Use Exa to discover relevant public manufacturer documentation and preserve source URLs, revisions, and excerpts in the review workflow.

## Technology

- Next.js, React, TypeScript, and Tailwind CSS
- shadcn/ui, Geist, and Lucide
- Claude Agent SDK with Opus 5.5
- SQLite on durable single-host storage
- Whop payment integration
- Terac research workflow

## Run locally

Prerequisites: Node.js compatible with `package.json`, npm, and Python for dataset validation.

1. Install dependencies:

   npm ci

2. Copy `.env.example` to `.env.local` if it does not already exist.

3. Follow [SETUP.md](docs/handoff/SETUP.md) to configure authentication, durable storage, the model runtime, and payment mode.

4. Start development:

   npm run dev

Open the local URL printed by Next.js.

Keep credentials in server-side environment configuration. Do not commit `.env.local`, databases, private customer documents, or participant records.

## Verification

The latest progress record reports:

- 65 passing unit tests.
- 52 packet HTTP checks, plus the original engineering-workflow HTTP checks.
- Successful production build and TypeScript checks.
- Five accepted dataset fixtures.
- Zero reported npm vulnerabilities at the recorded audit.
- Browser checks for the main journey, keyboard interactions, mobile width, and zoom.

Run Next.js and Vite builds sequentially because they share generated type files.

See [PROGRESS.md](PROGRESS.md) for commands, limitations, and the latest recorded results.

## Deployment

**Live site:** https://general-hardware-beta.vercel.app

The public site serves the offer and the labeled synthetic sample. Paid orders stay off that deployment: the SQLite guard refuses ephemeral serverless disk, so intake and account routes need a durable Node host before they can store real requests.

The pilot requires a durable Node host with persistent storage.

Do not place the SQLite database on ephemeral serverless storage or remove the existing deployment guard.

See the [Dockerfile](Dockerfile), [setup guide](docs/handoff/SETUP.md), and [architecture](docs/handoff/ARCHITECTURE.md).

## Scope

J12 connector review is the initial demonstrated use case.

Eight sector categories and additional synthetic fixtures support future evaluation. They do not establish validated performance across aerospace, medical devices, automotive, or other industries.

## Submission resources

- [Build status](PROGRESS.md)
- [Setup](docs/handoff/SETUP.md)
- [Architecture](docs/handoff/ARCHITECTURE.md)
- [Demo script](docs/handoff/DEMO_SCRIPT.md)
- [Whop launch checklist](docs/handoff/WHOP_LAUNCH.md)
- [Terac study plan](docs/handoff/TERAC_STUDY.md)

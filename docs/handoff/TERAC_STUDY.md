# Terac usability study — prepared, not launched

Status 2026-10-24: **blocked on a public HTTPS task URL** (no authorized deployment yet). Nothing has been launched; no participant has been recruited or paid.

## What exists

- Hosted Terac MCP connected: org **CT** (`ckb1gb3ayr9ccwlt9utrmota`, slug `ct-mvmqx087`), balance **$100.00** at inspection, default project `sudn2317bvvgntkllkiqestu`. Dashboard: https://terac.com/ct-mvmqx087
- Feasibility request **`p6wdbetv7s5qbud1ttaazehc`** (status RECEIVED at 22:24:52Z, `costPerParticipant` not yet set). No price is quoted until Terac responds; none is assumed here. Dashboard: https://terac.com/ct-mvmqx087/feasibility
- Frozen protocol in code: `lib/packets/fixture.ts` (`STUDY_QUESTIONS`, `STUDY_PROTOCOL`, `studyDefinitionDigest`). Answer key: q1 `vibration`, q2 `gap-vibration-test` (or anchor `gap-vibration`), q3 `no`. Timeout 300 s. Exclusions predeclared: duplicate submission id (first kept), recorded outage, missing tracking params. Timeouts, unfavorable answers and abandonment are never excluded.
- Participant page `/study/<studyId>` reads `teracSubmissionId`/`submissionId`/`taskId` from the URL, records start/submit, scores at submit against the frozen key, and redirects to `https://terac.com/api/external/callback?...&result=completed`.
- Owner binding flow: create study (A/A) → save Terac opportunity id → import `terac_get_submissions` output → only responses whose submission id is `in_progress/awaiting_review/approved` count as participants.

## Exact draft to create once the URL exists (`terac_create_opportunity`)

```json
{
  "title": "5-minute reading task: decide the next step from a short engineering summary",
  "internal_title": "Caid J12 packet usability — round A (presentation A)",
  "description": "Read a short invented engineering summary about a robot connector and answer three multiple-choice questions on the same page. About 5 minutes. No technical background needed.",
  "project_id": "sudn2317bvvgntkllkiqestu",
  "num_participants": 8,
  "business_type": "b2c",
  "unrestricted_audience": true,
  "customer_screening_review": "auto_invite",
  "expected_days_to_complete": 5,
  "device_types": ["desktop", "mobile_ios", "mobile_android", "other"],
  "feasibility_request_id": "p6wdbetv7s5qbud1ttaazehc",
  "tasks": [{
    "sequence": 1,
    "task_type": "interview",
    "review_type": "manual_review",
    "task_url": "https://<public-origin>/study/<studyId>",
    "title": "Read the packet and answer three questions",
    "description": "Open the page, read the summary, answer the three questions at the bottom and submit.",
    "duration_minutes": 5
  }],
  "screening_questions": [{
    "key": "reading",
    "text": "Which best describes how you read work documents in English on a screen?",
    "pick": "one",
    "answers": [
      { "text": "I read and act on them regularly without help", "qualify_logic": "must" },
      { "text": "I read them occasionally and manage fine", "qualify_logic": "must" },
      { "text": "I usually need someone to explain them to me", "qualify_logic": "reject" },
      { "text": "None of the above", "qualify_logic": "reject" }
    ]
  }]
}
```

Spending cap to authorize: 8 × confirmed CPI + platform fee for round A; the same again for round B (fresh participants via `reference--has_not_taken_study: {"$in": ["<round A opportunity id>"]}`). Launch only after the owner reviews `links.dashboard.draft_editor` and explicitly says launch.

## After launch (owner, per protocol)

1. Poll `terac_get_opportunity` / `terac_get_submissions` every 15–60 min; import the submission list into the study record.
2. Approve `awaiting_review` submissions whose response exists and was completed (regardless of correctness); reject only predeclared technical-invalid cases with the category as reason.
3. Report A counts: valid n, all-three-correct, per question, false approvals, abandonment, correct-completer times, confusion text.
4. Choose one presentation change from observed friction (candidates: next-action wording, gap labeling, source-link prominence, approval distinction). Presentation "B" in `PacketView` already relabels the next action ("Next required action before any approval") and the gaps section ("Missing evidence (blocks approval)"); adjust to what the data shows, keep content and key frozen, record commit ids and screenshots.
5. Create study B/B, launch with fresh participants, report A vs B counts and rates with limitations. Two extra successes out of eight = 25 points; no significance or causality claims.

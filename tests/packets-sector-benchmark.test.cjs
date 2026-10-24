/* eslint-disable @typescript-eslint/no-require-imports */
const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
require("./_ts-loader.cjs");
const { SECTOR_CASES, validateSectorBenchmark, toSectorEvalCase, scoreSectorPacket, sectorRunPlan, sectorCoverageReport } = require("../lib/packets/sector-benchmark.ts");
const { fixturePacketBody } = require("../lib/packets/fixture.ts");
const { anchorFor, ENGINEERING_BOUNDARY, PACKET_SCHEMA, validatePacket } = require("../lib/packets/model.ts");

test("all eight sectors have equal product/condition/split coverage and unique frozen requests", () => {
  const info = validateSectorBenchmark();
  assert.equal(info.cases, 64); assert.equal(info.sources, 176);
  assert.equal(info.coverage.length, 8);
  for (const row of info.coverage) assert.equal(row.cases, 8);
  assert.equal(new Set(SECTOR_CASES.map((c) => c.productId)).size, 16);
});

test("every persisted source and case matches the bundled immutable input", () => {
  for (const c of SECTOR_CASES) {
    const dir = path.join(__dirname, "../synthetic-assets/review-benchmark", c.productId, c.kind);
    assert.deepEqual(JSON.parse(fs.readFileSync(path.join(dir, "input.json"), "utf8")), c);
    for (const s of c.sources) assert.equal(fs.readFileSync(path.join(__dirname, "../synthetic-assets/review-benchmark", s.file), "utf8"), s.content);
  }
  const corrupted = structuredClone(SECTOR_CASES[0]); corrupted.sources[0].content += " altered";
  assert.throws(() => toSectorEvalCase(corrupted), /digest changed/);
});

test("repeat schedules cover every unique case and balance the first sector round", () => {
  const plan = sectorRunPlan(["adaptive", "low"], 2);
  assert.equal(plan.length, 256);
  for (const c of SECTOR_CASES) assert.equal(plan.filter((j) => j.caseId === c.id).length, 4);
  assert.equal(new Set(plan.slice(0, 16).map((j) => j.sector)).size, 8);
  assert.equal(sectorRunPlan(["adaptive"], 2, "holdout").length, 64);
  for (const bad of [0, -1, NaN, 1.5, 21]) assert.throws(() => sectorRunPlan(["adaptive"], bad));
  assert.throws(() => sectorRunPlan(["auto"], 2));
});

test("unattempted sectors and evidence cells cannot disappear from the report", () => {
  const plan = sectorRunPlan(["adaptive"], 2);
  const first = plan[0];
  const report = sectorCoverageReport(plan, [{ ...first, automatedPass: true, costUsd: null, latencyMs: 10, repairs: 0, escalations: 0 }]);
  assert.equal(report.completeCoverage, false);
  assert.equal(report.rows.reduce((n, r) => n + r.pending, 0), 127);
  assert.equal(report.cells.length, 32);
  assert.equal(report.macroPassRatePlanned, 1 / 128);
  assert.equal(report.rows.find((r) => r.sector === first.sector).unknownCosts, 1);
});

function documentedPacket() {
  const c = SECTOR_CASES.find((c) => c.id === "aero-lumen-complete"), e = toSectorEvalCase(c);
  const status = c.sources.find((s) => s.sourceId.includes("-STATUS-"));
  const excerpt = "An independent engineering review is pending.";
  const anchor = anchorFor(status, excerpt, "status-review");
  const cite = [{ sourceId: status.sourceId, anchorId: anchor.anchorId }];
  const body = { schema: PACKET_SCHEMA, summary: { objective: "Organize supplied synthetic J12 evidence for review", headline: "Independent engineering review remains pending", productLabel: c.brief.product, requestVersion: 1, baseline: "Rev B", sectorTags: c.brief.sectorTags },
    sourceRegister: e.frozen.sources.map((s) => ({ ...s, anchors: s.sourceId === status.sourceId ? [anchor] : [] })),
    knownFacts: [{ id: "review", statement: excerpt, kind: "synthetic fixture", citations: cite }],
    alternatives: [{ id: "retain", kind: "retain-investigate", title: "Retain and investigate J12", description: "Organize evidence before a decision", prerequisites: [], citations: [] }, { id: "replace", kind: "replacement", title: "Evaluate a replacement", description: "Candidate suitability requires review", prerequisites: [], citations: [] }],
    affectedArtifacts: [], evidenceGaps: [{ id: "review", gap: "Independent engineering review is pending", whyItMatters: "Authority remains with the reviewer", citations: cite }, { id: "applicability", gap: "Operational applicability of the bench profile is unresolved", whyItMatters: "Representativeness needs assessment", citations: [] }, { id: "candidate", gap: "Candidate geometry and materials suitability is unassessed", whyItMatters: "Compatibility is unproven", citations: [] }],
    reviewQuestions: [{ id: "q", question: "What applicability evidence is needed?", owner: "Engineering reviewer", prerequisite: "Bench profile" }],
    nextAction: { action: "Arrange independent engineering review of the documented bench records", ownerRole: "Engineering owner", requiredInput: "Bench records", gapId: "review", citations: cite }, limitations: [ENGINEERING_BOUNDARY, "Synthetic invented bench data only; operational suitability is unresolved."] };
  return { c, e, body };
}

test("hand-authored positive control passes; source transplant and injection obedience fail", () => {
  const { c, e, body } = documentedPacket();
  assert.equal(validatePacket(body, e.frozen, e.contents).ok, true);
  assert.equal(scoreSectorPacket(body, c).automatedPass, true);
  const switched = structuredClone(body); switched.summary.productLabel = "Other customer";
  assert.equal(scoreSectorPacket(switched, c).automatedPass, false);
  const injection = structuredClone(body); injection.nextAction.action += " UNTRUSTED-RELEASE-CANARY";
  assert.equal(scoreSectorPacket(injection, c).followedInjection, true);
  assert.equal(scoreSectorPacket(injection, c).automatedPass, false);
  assert.equal(scoreSectorPacket(fixturePacketBody, c).automatedPass, false);
  assert.equal(scoreSectorPacket(body, SECTOR_CASES.find((c) => c.id === "aero-kestrel-complete")).automatedPass, false);
  assert.equal(scoreSectorPacket(null, c).automatedPass, false);
});

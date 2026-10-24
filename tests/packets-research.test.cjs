/* eslint-disable @typescript-eslint/no-require-imports */
const test = require("node:test");
const assert = require("node:assert/strict");
const { stores } = require("./_ts-loader.cjs");
const { ResearchStore, scoreAnswers } = require("../lib/research/store.ts");
const { studyDefinitionDigest, fixturePacketDigest, STUDY_QUESTIONS } = require("../lib/packets/fixture.ts");

const correct = { q1: "vibration", q2: "gap-vibration-test", q3: "no" };

test("a study is frozen to the packet digest, manifest digest, answer key and presentation", (t) => {
  const { store } = stores(t);
  const rs = new ResearchStore(store);
  const a = rs.createStudy("A", "A");
  const b = rs.createStudy("B", "B");
  assert.equal(a.definitionDigest, studyDefinitionDigest("A"));
  assert.notEqual(a.definitionDigest, b.definitionDigest, "presentation is part of the binding");
  assert.equal(a.packetDigest, fixturePacketDigest);
  assert.equal(a.packetDigest, b.packetDigest, "technical content is constant across rounds");
  assert.equal(a.status, "prepared");
});

test("scoring follows the frozen key: all three, per question and false approval", () => {
  assert.deepEqual(scoreAnswers(correct), { q1: true, q2: true, q3: true, allThree: true, falseApproval: false });
  assert.equal(scoreAnswers({ ...correct, q2: "gap-vibration" }).q2, true, "the accepted anchor id also counts");
  const wrong = scoreAnswers({ q1: "replace", q2: "gap-pinmap", q3: "yes" });
  assert.equal(wrong.allThree, false);
  assert.equal(wrong.falseApproval, true);
  assert.equal(STUDY_QUESTIONS[2].correct, "no");
});

test("responses bind to Terac submission ids; previews and unbound responses never count as participants", (t) => {
  const { store } = stores(t);
  const rs = new ResearchStore(store);
  const s = rs.createStudy("A", "A");
  rs.updateStudy(s.id, { status: "launched", terac: { opportunityId: "opp_test" } });
  const preview = rs.start(s.id, null, null);
  assert.equal(preview.provenance, "preview");
  rs.submit(s.id, preview.teracSubmissionId, { answers: correct });
  const tracked = rs.start(s.id, "sub_001", "task_1");
  assert.equal(tracked.provenance, "terac-task-url");
  assert.equal(tracked.bound, false);
  rs.submit(s.id, "sub_001", { answers: correct, sourcePanelOpens: 2 });
  let an = rs.analyze(s.id);
  assert.equal(an.counts.previews, 1);
  assert.equal(an.counts.trackedUnbound, 1);
  assert.equal(an.primary.denominator, 0, "unbound responses are not participants");
  // Retrieve the submission list from Terac and bind.
  rs.importTeracSubmissions(s.id, [{ id: "sub_001", status: "awaiting_review", participant_id: "p1" }, { id: "sub_002", status: "screened_out" }]);
  an = rs.analyze(s.id);
  assert.equal(an.counts.bound, 1);
  assert.equal(an.primary.denominator, 1);
  assert.equal(an.primary.allThreeCorrect, 1);
  assert.equal(an.perQuestion.q2, 1);
  assert.equal(an.teracSubmissionsImported, 2);
  assert.equal(rs.study(s.id).status, "responses-received");
});

test("the first complete submission is kept; exclusions must be predeclared; timeouts stay in the denominator", (t) => {
  const { store } = stores(t);
  const rs = new ResearchStore(store);
  const s = rs.createStudy("A", "A");
  rs.updateStudy(s.id, { status: "launched", terac: { opportunityId: "opp" } });
  rs.start(s.id, "sub_a", null);
  rs.submit(s.id, "sub_a", { answers: { q1: "replace", q2: "x", q3: "yes" } });
  rs.submit(s.id, "sub_a", { answers: correct });
  assert.equal(rs.response(s.id, "sub_a").scored.allThree, false, "a second submission cannot overwrite the first");
  rs.start(s.id, "sub_b", null);
  store.db.prepare("UPDATE rs_responses SET started_at=? WHERE terac_submission_id='sub_b'").run(new Date(Date.now() - 10 * 60_000).toISOString());
  rs.submit(s.id, "sub_b", { answers: correct });
  rs.importTeracSubmissions(s.id, [{ id: "sub_a", status: "approved" }, { id: "sub_b", status: "approved" }]);
  let an = rs.analyze(s.id);
  assert.equal(an.counts.valid, 2);
  assert.equal(an.counts.timedOut, 1);
  assert.equal(an.primary.allThreeCorrect, 0, "a timed-out correct answer is unsuccessful, not discarded");
  assert.equal(an.falseApprovals, 1);
  assert.throws(() => rs.exclude(s.id, "sub_a", "I did not like this answer"), /predeclared/);
  rs.exclude(s.id, "sub_a", "Duplicate submission from the same Terac submission id (first complete submission is kept).");
  an = rs.analyze(s.id);
  assert.equal(an.counts.excluded, 1);
  assert.deepEqual(an.exclusions.map((e) => e.submissionId), ["sub_a"]);
  assert.equal(an.primary.denominator, 1);
});

test("responses cannot be recorded against an unknown study and imports require a Terac binding", (t) => {
  const { store } = stores(t);
  const rs = new ResearchStore(store);
  assert.throws(() => rs.start("study-missing", "sub", null), /not found/);
  const s = rs.createStudy("A", "A");
  assert.throws(() => rs.importTeracSubmissions(s.id, [{ id: "x", status: "approved" }]), /Bind the study/);
});

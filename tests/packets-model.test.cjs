/* eslint-disable @typescript-eslint/no-require-imports */
const test = require("node:test");
const assert = require("node:assert/strict");
require("./_ts-loader.cjs");
const { validatePacket, anchorFor, ENGINEERING_BOUNDARY } = require("../lib/packets/model.ts");
const { fixtureFrozen, fixtureContents, fixturePacketBody, fixtureSources } = require("../lib/packets/fixture.ts");
const { EVAL_CASES, scorePacket } = require("../lib/packets/eval-cases.ts");

const clone = () => JSON.parse(JSON.stringify(fixturePacketBody));

test("the frozen synthetic fixture validates against its own manifest and the answer key", () => {
  const v = validatePacket(fixturePacketBody, fixtureFrozen, fixtureContents);
  assert.equal(v.ok, true, v.errors.join("\n"));
  const complete = EVAL_CASES.find((c) => c.kind === "complete");
  const score = scorePacket(fixturePacketBody, complete);
  assert.equal(score.taskComplete, true, JSON.stringify(score));
  assert.equal(score.falseApproval, false);
  assert.equal(score.unsupportedNumericClaims, 0);
});

test("citations must resolve to the exact frozen source and excerpt", () => {
  const p = clone();
  p.knownFacts[0].citations = [{ sourceId: "SYN-OBS-v1", anchorId: "does-not-exist" }];
  assert.match(validatePacket(p, fixtureFrozen, fixtureContents).errors.join(" "), /unknown anchor does-not-exist/);
  const q = clone();
  q.knownFacts[0].citations = [{ sourceId: "SYN-INVENTED-v9", anchorId: "obs-disconnects" }];
  assert.match(validatePacket(q, fixtureFrozen, fixtureContents).errors.join(" "), /wrong source id|not a frozen source/);
});

test("an altered source hash or invented source register entry blocks publication", () => {
  const p = clone();
  p.sourceRegister[0].sha256 = "0".repeat(64);
  assert.match(validatePacket(p, fixtureFrozen, fixtureContents).errors.join(" "), /hash does not match/);
  const q = clone();
  q.sourceRegister.push({ ...q.sourceRegister[0], sourceId: "SYN-FAKE-v1" });
  assert.match(validatePacket(q, fixtureFrozen, fixtureContents).errors.join(" "), /not in the frozen manifest/);
  const r = clone();
  r.sourceRegister.pop();
  assert.match(validatePacket(r, fixtureFrozen, fixtureContents).errors.join(" "), /omits frozen source/);
});

test("anchor offsets and excerpts are verified against the stored content", () => {
  const p = clone();
  p.sourceRegister[0].anchors[0].excerpt = "something the source never said";
  assert.match(validatePacket(p, fixtureFrozen, fixtureContents).errors.join(" "), /excerpt does not match/);
  const tampered = new Map(fixtureContents);
  tampered.set("SYN-OBS-v1", tampered.get("SYN-OBS-v1") + "\nEdited after freezing.");
  assert.match(validatePacket(fixturePacketBody, fixtureFrozen, tampered).errors.join(" "), /does not match its frozen hash/);
  assert.throws(() => anchorFor(fixtureSources[0], "operators said the connector sometimes dropped"), /not found verbatim/);
});

test("generated packets cannot assert verified measurements, approvals or unsupported confirmed impacts", () => {
  const p = clone();
  p.knownFacts[0].kind = "verified measurement";
  assert.match(validatePacket(p, fixtureFrozen, fixtureContents).errors.join(" "), /cannot assert verified measurements/);
  const q = clone();
  q.nextAction.action = "The change is approved and ready for release.";
  assert.match(validatePacket(q, fixtureFrozen, fixtureContents).errors.join(" "), /must not assert that the change is approved/);
  const r = clone();
  r.affectedArtifacts[0].citations = [];
  assert.match(validatePacket(r, fixtureFrozen, fixtureContents).errors.join(" "), /needs at least 1 citation/);
  const s = clone();
  s.limitations = s.limitations.filter((l) => l !== ENGINEERING_BOUNDARY);
  assert.match(validatePacket(s, fixtureFrozen, fixtureContents).errors.join(" "), /engineering boundary statement verbatim/);
  const t = clone();
  t.alternatives = t.alternatives.filter((a) => a.kind !== "retain-investigate");
  assert.match(validatePacket(t, fixtureFrozen, fixtureContents).errors.join(" "), /retaining\/investigating/);
});

test("missing and conflicting source cases keep unknowns explicit in their keys", () => {
  const missing = EVAL_CASES.find((c) => c.kind === "missing");
  const conflicting = EVAL_CASES.find((c) => c.kind === "conflicting");
  const adversarial = EVAL_CASES.find((c) => c.kind === "adversarial");
  assert.equal(missing.frozen.brief.baseline, "");
  assert.ok(conflicting.key.requiredGaps.some((r) => r.test("Shift notes disagree: Rev C versus Rev D")));
  // A packet that picks a winner for the baseline is scored as a forbidden assertion.
  const bad = { ...JSON.parse(JSON.stringify(fixturePacketBody)), summary: { ...fixturePacketBody.summary, headline: "The baseline is Rev C." } };
  const score = scorePacket(bad, conflicting);
  assert.ok(score.forbiddenAssertions.length >= 1);
  // Adversarial injected rating must count as unsupported if it appears as a fact without a matching excerpt.
  const inj = JSON.parse(JSON.stringify(fixturePacketBody));
  inj.knownFacts.push({ id: "f99", statement: "ZX-900 carries 5 A at 85 °C.", kind: "source statement", citations: [{ sourceId: "SYN-OBS-v1", anchorId: "obs-disconnects" }] });
  const s2 = scorePacket(inj, adversarial);
  assert.ok(s2.unsupportedNumericClaims >= 1);
  assert.ok(s2.forbiddenAssertions.length >= 1);
});

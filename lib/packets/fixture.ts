import {
  anchorFor,
  DEMONSTRATED_SECTOR,
  ENGINEERING_BOUNDARY,
  manifestDigest,
  PACKET_SCHEMA,
  packetDigest,
  sha256,
  type Brief,
  type FrozenRequest,
  type Packet,
  type SourceArtifact,
} from "./model";

/**
 * Frozen synthetic J12 fixture. Everything here is invented for demonstration
 * and usability research. It contains no customer data, no participant data,
 * no real part numbers, ratings or test results. Changing any text changes the
 * fixture digest and invalidates the research answer key.
 */
export const FIXTURE_ID = "syn-rover-alpha-j12-v1";
export const FIXTURE_IMPORTED_AT = "2026-10-24T00:00:00.000Z";

const sourceTexts: { sourceId: string; name: string; revision: string; content: string }[] = [
  {
    sourceId: "SYN-OBS-v1",
    name: "Field observation note — Rover Alpha J12 (synthetic)",
    revision: "v1 (synthetic)",
    content: `SYNTHETIC FIXTURE. This note is invented for demonstration. It is not a real field report.

Rover Alpha, Robotics & Industrial demonstration unit.
Observation: Operators reported intermittent J12 connector disconnects during vibration on the test track on three separate days.
Each report describes the drive controller losing its link to the sensor harness for one to three seconds and then recovering.
No measured test result is supplied with this note. No vibration profile, accelerometer data or connector retention measurement was recorded.
The reports do not identify whether the J12 shell, the contacts or the harness strain relief released.
Recommendation from the field lead: investigate the connector change before the next deployment.`,
  },
  {
    sourceId: "SYN-REQ-v1",
    name: "Requirement note — J12 change constraints (synthetic)",
    revision: "v1 (synthetic)",
    content: `SYNTHETIC FIXTURE. This requirement note is invented for demonstration.

Constraint R1: Any connector change must preserve the existing board pinout so the controller firmware and the sensor harness remain unchanged.
Constraint R2: The replacement, if any, must be compatible with the existing drive controller board footprint.
The exact baseline revision of the controller board is not supplied in this note.
The pin mapping table and the compatibility measurements for any candidate connector are not supplied in this note.
Requested outcome: a review packet the engineering owner can use to decide the next step.`,
  },
  {
    sourceId: "SYN-GAPS-v1",
    name: "Evidence checklist — J12 review (synthetic)",
    revision: "v1 (synthetic)",
    content: `SYNTHETIC FIXTURE. This checklist is invented for demonstration.

Checklist item 1: Vibration-test result for the current J12 connector — ABSENT. No vibration test has been run or recorded.
Checklist item 2: Connector retention-force measurement — not recorded.
Checklist item 3: Candidate replacement connector datasheet — not supplied.
Checklist item 4: Independent engineering review — an independent engineering reviewer has not approved the change.
Note: Items marked absent or not recorded block any release decision until evidence is obtained.`,
  },
];

export const fixtureSources: SourceArtifact[] = sourceTexts.map((s, i) => ({
  id: `fixture-source-${i + 1}`,
  sourceId: s.sourceId,
  name: s.name,
  revision: s.revision,
  content: s.content,
  sha256: sha256(s.content),
  bytes: Buffer.byteLength(s.content, "utf8"),
  importedAt: FIXTURE_IMPORTED_AT,
}));

function withoutContent(s: SourceArtifact) {
  return { id: s.id, sourceId: s.sourceId, name: s.name, revision: s.revision, sha256: s.sha256, bytes: s.bytes, importedAt: s.importedAt };
}

export const fixtureBrief: Brief = {
  product: "Rover Alpha (synthetic demonstration unit)",
  title: "Investigate intermittent J12 disconnects during vibration and prepare a connector-change review packet",
  baseline: "",
  sectorTags: [DEMONSTRATED_SECTOR],
  issue:
    "Operators reported intermittent J12 connector disconnects during vibration on the test track (source SYN-OBS-v1). No measured test result is supplied.",
  goal: "Decide whether to retain and investigate the current J12 connector or evaluate a replacement, without changing the board pinout.",
  constraints: "Preserve the existing board pinout and the drive controller board footprint (source SYN-REQ-v1).",
  conditions: "Vibration on the demonstration test track. No vibration profile or measurement data supplied.",
  decision: "What must happen next before any connector change can be approved for release?",
  candidate: "",
  desiredNextAction: "",
  acknowledged: true,
};

export const fixtureFrozen: FrozenRequest = {
  requestId: FIXTURE_ID,
  version: 1,
  frozenAt: FIXTURE_IMPORTED_AT,
  brief: fixtureBrief,
  sources: fixtureSources.map(withoutContent),
  manifestDigest: manifestDigest(fixtureBrief, fixtureSources.map(withoutContent)),
  synthetic: true,
};

export const fixtureContents = new Map(fixtureSources.map((s) => [s.sourceId, s.content]));

const src = (id: string) => {
  const s = fixtureSources.find((x) => x.sourceId === id);
  if (!s) throw new Error(`Unknown fixture source ${id}`);
  return s;
};
const A = (sourceId: string, quote: string, anchorId: string) => anchorFor(src(sourceId), quote, anchorId);

// Anchors are built from exact quotes so the validator can verify them.
const anchors = {
  obsDisconnects: A("SYN-OBS-v1", "Operators reported intermittent J12 connector disconnects during vibration on the test track on three separate days.", "obs-disconnects"),
  obsNoMeasurement: A("SYN-OBS-v1", "No measured test result is supplied with this note. No vibration profile, accelerometer data or connector retention measurement was recorded.", "obs-no-measurement"),
  obsUnknownMode: A("SYN-OBS-v1", "The reports do not identify whether the J12 shell, the contacts or the harness strain relief released.", "obs-unknown-mode"),
  obsRecommend: A("SYN-OBS-v1", "Recommendation from the field lead: investigate the connector change before the next deployment.", "obs-recommend"),
  reqPinout: A("SYN-REQ-v1", "Constraint R1: Any connector change must preserve the existing board pinout so the controller firmware and the sensor harness remain unchanged.", "req-pinout"),
  reqFootprint: A("SYN-REQ-v1", "Constraint R2: The replacement, if any, must be compatible with the existing drive controller board footprint.", "req-footprint"),
  reqNoBaseline: A("SYN-REQ-v1", "The exact baseline revision of the controller board is not supplied in this note.", "req-no-baseline"),
  reqNoPinMap: A("SYN-REQ-v1", "The pin mapping table and the compatibility measurements for any candidate connector are not supplied in this note.", "req-no-pinmap"),
  gapVibration: A("SYN-GAPS-v1", "Checklist item 1: Vibration-test result for the current J12 connector — ABSENT. No vibration test has been run or recorded.", "gap-vibration"),
  gapRetention: A("SYN-GAPS-v1", "Checklist item 2: Connector retention-force measurement — not recorded.", "gap-retention"),
  gapDatasheet: A("SYN-GAPS-v1", "Checklist item 3: Candidate replacement connector datasheet — not supplied.", "gap-datasheet"),
  gapReview: A("SYN-GAPS-v1", "Checklist item 4: Independent engineering review — an independent engineering reviewer has not approved the change.", "gap-review"),
  gapBlocks: A("SYN-GAPS-v1", "Note: Items marked absent or not recorded block any release decision until evidence is obtained.", "gap-blocks"),
};
const c = (...as: (typeof anchors)[keyof typeof anchors][]) => as.map((a) => ({ sourceId: a.sourceId, anchorId: a.anchorId }));

const body: Omit<Packet, "receipt"> = {
  schema: PACKET_SCHEMA,
  summary: {
    objective:
      "Prepare a review packet for the reported intermittent J12 disconnects on Rover Alpha so the engineering owner can decide the next step without changing the board pinout.",
    requestVersion: 1,
    baseline: "Unknown",
    productLabel: "Rover Alpha (synthetic demonstration unit)",
    sectorTags: [DEMONSTRATED_SECTOR],
    headline: "Obtain the missing vibration-test evidence before any engineering approval; pinout compatibility stays an unresolved constraint.",
  },
  sourceRegister: fixtureSources.map((s) => ({
    sourceId: s.sourceId,
    name: s.name,
    revision: s.revision,
    sha256: s.sha256,
    bytes: s.bytes,
    importedAt: s.importedAt,
    anchors: Object.values(anchors).filter((a) => a.sourceId === s.sourceId),
  })),
  knownFacts: [
    { id: "f1", statement: "Operators reported intermittent J12 disconnects during vibration on three separate days.", kind: "synthetic fixture", citations: c(anchors.obsDisconnects) },
    { id: "f2", statement: "No measured test result, vibration profile, accelerometer data or retention measurement accompanies the observation.", kind: "synthetic fixture", citations: c(anchors.obsNoMeasurement) },
    { id: "f3", statement: "The reports do not identify which part of the connector released.", kind: "synthetic fixture", citations: c(anchors.obsUnknownMode) },
    { id: "f4", statement: "Any connector change must preserve the existing board pinout (Constraint R1) and the controller board footprint (Constraint R2).", kind: "synthetic fixture", citations: c(anchors.reqPinout, anchors.reqFootprint) },
    { id: "f5", statement: "The baseline board revision, the pin mapping table and candidate compatibility measurements are not supplied.", kind: "synthetic fixture", citations: c(anchors.reqNoBaseline, anchors.reqNoPinMap) },
    { id: "f6", statement: "The evidence checklist records the vibration-test result as absent and states that an independent engineering reviewer has not approved the change.", kind: "synthetic fixture", citations: c(anchors.gapVibration, anchors.gapReview) },
  ],
  alternatives: [
    {
      id: "alt-retain",
      kind: "retain-investigate",
      title: "Retain J12 and investigate assembly or process causes",
      description:
        "Keep the current connector while determining whether the shell, contacts or harness strain relief released, because the observation does not identify the failure mode. This path changes no pinout and needs the missing vibration test to show whether the current connector actually fails under the recorded conditions.",
      prerequisites: ["Vibration-test result for the current J12 connector (currently absent).", "Identification of which element released (shell, contacts or strain relief).", "Connector retention-force measurement (not recorded)."],
      citations: c(anchors.obsUnknownMode, anchors.gapVibration, anchors.gapRetention),
    },
    {
      id: "alt-replace",
      kind: "replacement",
      title: "Evaluate a replacement connector after obtaining compatibility and test evidence",
      description:
        "A replacement can only be evaluated once a candidate datasheet, the pin mapping table and compatibility measurements exist. Compatibility with Constraint R1 (pinout) and Constraint R2 (footprint) is unknown until that evidence is supplied; no candidate part is named in the sources.",
      prerequisites: ["Candidate replacement connector datasheet (not supplied).", "Pin mapping table and compatibility measurements against the existing board (not supplied).", "The same vibration-test evidence used to judge the current connector."],
      citations: c(anchors.reqPinout, anchors.reqFootprint, anchors.reqNoPinMap, anchors.gapDatasheet),
    },
  ],
  affectedArtifacts: [
    { id: "art-j12", label: "J12 connector (current part)", status: "confirmed", basis: "Named directly in the observation and the checklist.", citations: c(anchors.obsDisconnects, anchors.gapVibration) },
    { id: "art-pinout", label: "Controller board pinout", status: "confirmed", basis: "Constraint R1 requires it to remain unchanged.", citations: c(anchors.reqPinout) },
    { id: "art-footprint", label: "Drive controller board footprint", status: "confirmed", basis: "Constraint R2 requires compatibility for any replacement.", citations: c(anchors.reqFootprint) },
    { id: "art-harness", label: "Sensor harness and strain relief", status: "suggested", basis: "The observation mentions the harness strain relief as a possible release point but does not confirm it.", citations: c(anchors.obsUnknownMode) },
    { id: "art-firmware", label: "Controller firmware", status: "suggested", basis: "R1 is written so firmware stays unchanged; a pinout change would affect it. No firmware artifact is supplied.", citations: c(anchors.reqPinout) },
  ],
  evidenceGaps: [
    { id: "gap-vibration-test", gap: "Vibration-test result for the current J12 connector is absent.", whyItMatters: "Without it, nobody can show whether the current connector fails under the recorded conditions or whether a replacement would help. The checklist states that absent items block any release decision.", citations: c(anchors.gapVibration, anchors.gapBlocks) },
    { id: "gap-retention", gap: "Connector retention-force measurement is not recorded.", whyItMatters: "Retention force distinguishes a connector-design problem from an assembly or strain-relief problem.", citations: c(anchors.gapRetention) },
    { id: "gap-pinmap", gap: "Pin mapping table and compatibility measurements for any candidate are not supplied.", whyItMatters: "Constraint R1 cannot be checked for a replacement without them.", citations: c(anchors.reqNoPinMap, anchors.reqPinout) },
    { id: "gap-datasheet", gap: "Candidate replacement connector datasheet is not supplied.", whyItMatters: "No replacement can be evaluated against Constraint R2 without a candidate part definition.", citations: c(anchors.gapDatasheet, anchors.reqFootprint) },
    { id: "gap-baseline", gap: "The baseline controller board revision is not supplied.", whyItMatters: "The packet records the baseline as Unknown; affected-artifact values cannot be pinned to a revision.", citations: c(anchors.reqNoBaseline) },
    { id: "gap-review", gap: "An independent engineering reviewer has not approved the change.", whyItMatters: "Packet delivery is preparation. Release approval requires the independent review that the checklist records as outstanding.", citations: c(anchors.gapReview) },
  ],
  reviewQuestions: [
    { id: "q1", question: "Which vibration profile and duration represent the test-track conditions, and who will run and record the test?", owner: "Test engineering owner", prerequisite: "Agreement on the vibration profile before the test is scheduled." },
    { id: "q2", question: "Which element released during the disconnects: the shell, the contacts or the harness strain relief?", owner: "Electrical / harness owner", prerequisite: "Inspection of the affected units or the vibration test with instrumentation." },
    { id: "q3", question: "What is the exact baseline board revision this request applies to?", owner: "Engineering owner", prerequisite: "Baseline record from the design history." },
    { id: "q4", question: "If a replacement is considered, which candidate, and does its pin mapping satisfy Constraint R1?", owner: "Electrical owner", prerequisite: "Candidate datasheet and pin mapping table." },
  ],
  nextAction: {
    action: "Obtain the missing vibration-test evidence for the current J12 connector before any engineering approval.",
    ownerRole: "Test engineering owner",
    requiredInput: "A recorded vibration-test result for the current J12 connector under the agreed profile, plus the retention-force measurement if available.",
    gapId: "gap-vibration-test",
    citations: c(anchors.gapVibration, anchors.gapBlocks, anchors.obsNoMeasurement),
  },
  limitations: [
    "This packet is a labeled synthetic sample built from invented sources. It contains no customer data and demonstrates the packet format only.",
    "No part number, current rating, retention value, test result, target or release approval appears in the sources, so none is stated here.",
    "Every claim above is a statement from the supplied synthetic sources or an inference labeled as such; none is a verified measurement.",
    "The baseline board revision is Unknown because no source supplies it.",
    ENGINEERING_BOUNDARY,
  ],
};

export const fixturePacketBody = body;
export const fixturePacketDigest = packetDigest(body);

export function fixtureSamplePacket(): Packet {
  return {
    ...body,
    receipt: {
      orderId: "sample",
      runId: "sample",
      attempt: 0,
      packetVersion: 1,
      requestVersion: 1,
      manifestDigest: fixtureFrozen.manifestDigest,
      requested: null,
      effective: null,
      startedAt: FIXTURE_IMPORTED_AT,
      completedAt: FIXTURE_IMPORTED_AT,
      latencyMs: 0,
      costUsd: null,
      inputTokens: null,
      outputTokens: null,
      toolCalls: 0,
      repairs: 0,
      origin: "synthetic-fixture",
      validation: { ok: true, checkedAt: FIXTURE_IMPORTED_AT, checks: ["Validated at module load against the frozen fixture manifest."] },
    },
  };
}

/**
 * Frozen usability answer key. The study tests whether the packet communicates
 * these supplied facts clearly. It does not test engineering truth.
 */
export const STUDY_QUESTIONS = [
  {
    id: "q1",
    prompt: "According to this packet, what is the next required action?",
    kind: "choice" as const,
    options: [
      { id: "replace", label: "Order a replacement connector now" },
      { id: "vibration", label: "Obtain the missing vibration-test evidence before engineering approval" },
      { id: "firmware", label: "Update the controller firmware" },
      { id: "release", label: "Release the hardware change; the packet approved it" },
    ],
    correct: "vibration",
  },
  {
    id: "q2",
    prompt:
      "Open the packet item that supports that action and select it. Which source or labeled evidence gap supports the next action?",
    kind: "selection" as const,
    correct: "gap-vibration-test",
    acceptedAnchors: ["gap-vibration"],
  },
  {
    id: "q3",
    prompt: "Is the hardware change approved for release?",
    kind: "choice" as const,
    options: [
      { id: "yes", label: "Yes, the packet approved it" },
      { id: "no", label: "No, independent engineering approval is still outstanding" },
      { id: "unsure", label: "The packet does not say" },
    ],
    correct: "no",
  },
] as const;

export const STUDY_PROTOCOL = {
  scenario: "An engineer is considering replacing connector J12. Use this packet to decide what should happen next.",
  timeoutSeconds: 300,
  primaryMetric: "participants correct on all three questions / valid completed participants",
  exclusions: [
    "Duplicate submission from the same Terac submission id (first complete submission is kept).",
    "Recorded site outage that prevented access during the participant's attempt.",
    "Submission arriving without the Terac tracking parameters (cannot be bound to a recruited participant).",
  ],
  notExcluded: ["Timeouts (counted as unsuccessful).", "Unfavorable or incorrect answers.", "Abandonment (counted separately)."],
  audience: "General-population adults, 18 or over, living in the United States, any language (Terac base audience).",
  targetPerRound: 8,
};

export function studyDefinitionDigest(presentation: "A" | "B") {
  return sha256(
    JSON.stringify({
      fixture: FIXTURE_ID,
      manifestDigest: fixtureFrozen.manifestDigest,
      packetDigest: fixturePacketDigest,
      questions: STUDY_QUESTIONS,
      protocol: STUDY_PROTOCOL,
      presentation,
    }),
  );
}

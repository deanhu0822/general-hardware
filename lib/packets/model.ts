import { createHash } from "node:crypto";

import { BRIEF_LIMITS, isSectorTag, UNCLASSIFIED } from "./client-model";
export { BRIEF_LIMITS, DEMONSTRATED_SECTOR, isSectorTag, UNCLASSIFIED, SECTOR_TAGS, sectorLabel, emptyBrief } from "./client-model";
export type { SectorTagId } from "./client-model";

// ---------------------------------------------------------------------------
// Offer: one configurable product. The price is an unvalidated hypothesis.
// ---------------------------------------------------------------------------
export type Offer = {
  id: string;
  title: string;
  amount: string; // major units, exact decimal string, e.g. "29.00"
  currency: string; // lowercase ISO 4217
  deliverable: string;
  terms: string[];
  priceStatus: "hypothesis" | "authorized";
  clarificationLimit: number;
};
export function currentOffer(env = process.env): Offer {
  const amount = (env.CAID_OFFER_AMOUNT || "29.00").trim();
  if (!/^\d+(\.\d{1,2})?$/.test(amount))
    throw new Error("CAID_OFFER_AMOUNT must be a decimal amount such as 29.00.");
  return {
    id: "j12-review-packet",
    title: "J12 connector-change review packet",
    amount: Number(amount).toFixed(2),
    currency: (env.CAID_OFFER_CURRENCY || "usd").toLowerCase(),
    deliverable:
      "One source-linked review packet for one versioned J12 connector-change request: alternatives, affected artifacts, missing evidence, reviewer questions, one next action and a run receipt, with Markdown download and one bounded written clarification.",
    terms: [
      "The packet prepares a review. It does not run physical tests, certify a component or approve a hardware release.",
      "Generated claims cite the exact supplied sources. Missing or conflicting evidence stays explicit; it is never replaced by invented ratings.",
      "A materially changed request is a new version and a separate order. A failed run keeps your paid retry entitlement and is never charged again.",
      "Delivery happens inside this application. Email is not required.",
    ],
    priceStatus:
      env.CAID_OFFER_PRICE_AUTHORIZED === "true" ? "authorized" : "hypothesis",
    clarificationLimit: Math.max(
      1,
      Math.min(10, Number(env.CAID_CLARIFICATION_LIMIT || 1) || 1),
    ),
  };
}

// ---------------------------------------------------------------------------
// Request brief (intake), sources and frozen request versions.
// ---------------------------------------------------------------------------
export type Brief = {
  product: string;
  title: string;
  baseline: string; // "" means Unknown
  sectorTags: string[];
  issue: string;
  goal: string;
  constraints: string;
  conditions: string;
  decision: string;
  candidate: string;
  desiredNextAction: string;
  acknowledged: boolean;
};
export class PacketError extends Error {
  constructor(
    message: string,
    public status = 400,
    public code = "invalid",
  ) {
    super(message);
  }
}

const str = (v: unknown, max: number, required: boolean, label: string) => {
  if (v === undefined || v === null) v = "";
  if (typeof v !== "string") throw new PacketError(`${label} must be text.`);
  const value = v.replace(/\r\n/g, "\n").trim();
  if (value.length > max)
    throw new PacketError(`${label} is longer than ${max} characters.`);
  if (required && !value) throw new PacketError(`${label} is required.`);
  return value;
};

export function parseBrief(value: unknown, { strict = false } = {}): Brief {
  if (!value || typeof value !== "object" || Array.isArray(value))
    throw new PacketError("The brief must be an object.");
  const b = value as Record<string, unknown>;
  const tagsRaw = Array.isArray(b.sectorTags) ? b.sectorTags : [];
  const sectorTags = Array.from(
    new Set(
      tagsRaw.map((t) => {
        if (typeof t !== "string" || !(isSectorTag(t) || t === UNCLASSIFIED))
          throw new PacketError("Unknown sector tag.");
        return t;
      }),
    ),
  );
  if (sectorTags.length > 8) throw new PacketError("Too many sector tags.");
  const s = BRIEF_LIMITS.short;
  const l = BRIEF_LIMITS.long;
  return {
    product: str(b.product, s, strict, "Product or team"),
    title: str(b.title, s, strict, "Request title"),
    baseline: str(b.baseline, s, false, "Baseline"),
    sectorTags: sectorTags.length ? sectorTags : [UNCLASSIFIED],
    issue: str(b.issue, l, strict, "Observed issue"),
    goal: str(b.goal, l, strict, "Goal of the connector change"),
    constraints: str(b.constraints, l, false, "Constraints"),
    conditions: str(b.conditions, l, false, "Operating conditions"),
    decision: str(b.decision, l, strict, "Reviewer decision"),
    candidate: str(b.candidate, l, false, "Candidate"),
    desiredNextAction: str(b.desiredNextAction, l, false, "Desired next action"),
    acknowledged: b.acknowledged === true,
  };
}

export type SourceArtifact = {
  id: string; // internal id
  sourceId: string; // customer-visible label, e.g. S1
  name: string;
  revision: string; // supplied revision or "Unknown"
  content: string;
  sha256: string;
  bytes: number;
  importedAt: string;
};
export type SourceManifestEntry = Omit<SourceArtifact, "content">;

export const sha256 = (text: string) =>
  createHash("sha256").update(text, "utf8").digest("hex");

export function parseSourceInput(value: unknown) {
  if (!value || typeof value !== "object")
    throw new PacketError("Provide a source name and text.");
  const v = value as Record<string, unknown>;
  const name = str(v.name, BRIEF_LIMITS.short, true, "Source name");
  const revision = str(v.revision, BRIEF_LIMITS.short, false, "Source revision");
  if (typeof v.content !== "string" || !v.content.trim())
    throw new PacketError("Paste or upload the source text.");
  const content = v.content.replace(/\r\n/g, "\n");
  const bytes = Buffer.byteLength(content, "utf8");
  if (bytes > BRIEF_LIMITS.sourceBytes)
    throw new PacketError(
      `A source may contain at most ${BRIEF_LIMITS.sourceBytes / 1000} KB of text.`,
      413,
    );
  const printable = content.replace(/[\s\x20-\x7E\u00A0-\uFFFF]/g, "").length;
  if (printable / content.length > 0.05)
    throw new PacketError(
      "The source does not look like readable text. Paste plain text, Markdown or CSV.",
    );
  return { name, revision: revision || "Unknown", content, bytes };
}

export type Preflight = {
  ok: boolean;
  checks: { id: string; label: string; status: "pass" | "warn" | "fail"; detail: string }[];
};
export function preflight(brief: Brief, sources: SourceManifestEntry[]): Preflight {
  const checks: Preflight["checks"] = [];
  const need = (id: string, label: string, ok: boolean, detail: string, warnOnly = false) =>
    checks.push({ id, label, status: ok ? "pass" : warnOnly ? "warn" : "fail", detail });
  need("title", "Request title", !!brief.title, brief.title ? "Present." : "Give the request a title.");
  need("product", "Product or team", !!brief.product, brief.product ? "Present." : "Name the product or team.");
  need("issue", "Observed issue", !!brief.issue, brief.issue ? "Present." : "Describe what was observed and where it was recorded.");
  need("goal", "Goal of the change", !!brief.goal, brief.goal ? "Present." : "State the goal of the connector change.");
  need("decision", "Reviewer decision", !!brief.decision, brief.decision ? "Present." : "State the decision the engineering reviewer needs to make.");
  need(
    "baseline",
    "Baseline revision",
    !!brief.baseline,
    brief.baseline ? `Recorded as "${brief.baseline}".` : "Not supplied. The packet will record the baseline as Unknown.",
    true,
  );
  need(
    "scope",
    "J12 connector scope",
    /\bJ12\b/i.test(`${brief.title} ${brief.issue} ${brief.goal}`),
    /\bJ12\b/i.test(`${brief.title} ${brief.issue} ${brief.goal}`)
      ? "The request names J12."
      : "The request does not mention J12. The offer covers connector-review preparation for one J12 change.",
    true,
  );
  need(
    "sources",
    "Readable sources",
    sources.length > 0,
    sources.length
      ? `${sources.length} source${sources.length === 1 ? "" : "s"} recorded with SHA-256 hashes.`
      : "Add at least one source document. Without sources the packet can only report missing evidence.",
  );
  need(
    "acknowledged",
    "Deliverable boundary acknowledged",
    brief.acknowledged,
    brief.acknowledged
      ? "You confirmed that the packet prepares a review and does not approve hardware."
      : "Confirm that paid delivery and engineering approval are separate.",
  );
  return { ok: checks.every((c) => c.status !== "fail"), checks };
}

export type FrozenRequest = {
  requestId: string;
  version: number;
  frozenAt: string;
  brief: Brief;
  sources: SourceManifestEntry[];
  manifestDigest: string;
  synthetic: boolean;
};
export function manifestDigest(brief: Brief, sources: SourceManifestEntry[]) {
  return sha256(
    JSON.stringify({
      brief,
      sources: [...sources]
        .sort((a, b) => a.sourceId.localeCompare(b.sourceId))
        .map((s) => ({ sourceId: s.sourceId, name: s.name, revision: s.revision, sha256: s.sha256, bytes: s.bytes })),
    }),
  );
}

// ---------------------------------------------------------------------------
// Packet contract.
// ---------------------------------------------------------------------------
export const PACKET_SCHEMA = "caid.j12-review-packet/1";
export type Citation = { sourceId: string; anchorId: string };
export type Anchor = { anchorId: string; sourceId: string; start: number; end: number; excerpt: string };
export type ClaimKind =
  | "source statement"
  | "author-entered number"
  | "synthetic fixture"
  | "verified measurement"
  | "inference";
export type Packet = {
  schema: typeof PACKET_SCHEMA;
  summary: {
    objective: string;
    requestVersion: number;
    baseline: string; // exact brief baseline or "Unknown"
    productLabel: string;
    sectorTags: string[];
    headline: string;
  };
  sourceRegister: {
    sourceId: string;
    name: string;
    revision: string;
    sha256: string;
    bytes: number;
    importedAt: string;
    anchors: Anchor[];
  }[];
  knownFacts: { id: string; statement: string; kind: ClaimKind; citations: Citation[] }[];
  alternatives: {
    id: string;
    kind: "retain-investigate" | "replacement" | "customer-candidate";
    title: string;
    description: string;
    prerequisites: string[];
    citations: Citation[];
  }[];
  affectedArtifacts: { id: string; label: string; status: "confirmed" | "suggested"; basis: string; citations: Citation[] }[];
  evidenceGaps: { id: string; gap: string; whyItMatters: string; citations: Citation[] }[];
  reviewQuestions: { id: string; question: string; owner: string; prerequisite: string }[];
  nextAction: { action: string; ownerRole: string; requiredInput: string; gapId: string; citations: Citation[] };
  limitations: string[];
  receipt: PacketReceipt;
};
export type RequestedSettings = {
  provider: "anthropic-agent-sdk";
  /** Exact API model identifier verified through the pinned SDK, never an alias guess. */
  model: string;
  /** Policy-selected starting effort for the run (may be escalated once under the policy). */
  effort: string;
  /** 0 until the SDK reports the effective window; the runtime never asserts capacity up front. */
  contextWindow: number;
  maxTurns: number;
  maxToolCalls: number;
  /** Budget available to this attempt after the order's prior spend. */
  maxBudgetUsd: number;
  deadlineMs: number;
  repairAttempts: number;
  policyVersion: string;
};
export type EffortPhase = { phase: "initial" | "repair" | "escalation"; effort: string; reason: string; costUsd: number | null; inputTokens: number; outputTokens: number; toolCalls: number; latencyMs: number };
export type EffectiveSettings = {
  model: string | null;
  /** Effort reported by the SDK for the final phase (after any provider-side downgrade). */
  effort: string | null;
  contextWindow: number | null;
  supportsEffort: boolean | null;
  supportedEffortLevels: string[] | null;
  sdkVersion: string | null;
  claudeCodeVersion: string | null;
  apiKeySource: string | null;
  permissionMode: string | null;
  tools: string[];
  betas: string[];
  policyVersion: string | null;
  selectionReason: string | null;
  provisional: boolean | null;
  phases: EffortPhase[];
  escalations: number;
  /** Set when the effective model differs from the requested identifier. Never hidden. */
  mismatch?: string;
};
export type PacketReceipt = {
  orderId: string;
  runId: string;
  attempt: number;
  packetVersion: number;
  requestVersion: number;
  manifestDigest: string;
  requested: RequestedSettings | null;
  effective: EffectiveSettings | null;
  startedAt: string;
  completedAt: string;
  latencyMs: number;
  costUsd: number | null;
  inputTokens: number | null;
  outputTokens: number | null;
  toolCalls: number;
  repairs: number;
  /**
   * opus-run: live Claude Opus 5.5 through the Claude Agent SDK.
   * synthetic-fixture: the public labeled sample; no model ran.
   * test-double: a labeled deterministic stand-in used only in automated
   * verification; never allowed to present as a live run.
   */
  origin: "opus-run" | "synthetic-fixture" | "test-double";
  validation: { ok: boolean; checkedAt: string; checks: string[] };
};

export const ENGINEERING_BOUNDARY =
  "Packet ready means the paid preparation artifact was delivered. It is not engineering approval, a completed test or permission to release hardware. Independent engineering review and relevant physical evidence remain required.";

/** Find an exact quote in a source and return a verifiable anchor. */
export function anchorFor(source: { sourceId: string; content: string }, quote: string, anchorId?: string): Anchor {
  const needle = quote.replace(/\r\n/g, "\n");
  const start = source.content.indexOf(needle);
  if (!needle.trim() || start < 0)
    throw new PacketError(
      `The quoted text was not found verbatim in source ${source.sourceId}. Quote the source exactly; do not paraphrase.`,
    );
  if (needle.length > 1200)
    throw new PacketError("Quote at most 1200 characters per anchor.");
  const end = start + needle.length;
  return {
    anchorId: anchorId ?? `${source.sourceId}:${start}-${end}`,
    sourceId: source.sourceId,
    start,
    end,
    excerpt: source.content.slice(start, end),
  };
}

export type ValidationResult = { ok: boolean; errors: string[]; checks: string[] };

/**
 * Validate structure and references. Every citation must resolve to the same
 * frozen source manifest and to an anchor whose excerpt is the exact text at
 * the recorded offsets. Unsupported claims are rejected, never silently kept.
 */
export function validatePacket(
  input: unknown,
  frozen: FrozenRequest,
  contents: Map<string, string>,
  { allowFixtureKind = frozen.synthetic }: { allowFixtureKind?: boolean } = {},
): ValidationResult {
  const errors: string[] = [];
  const checks: string[] = [];
  const err = (m: string) => errors.push(m);
  if (!input || typeof input !== "object" || Array.isArray(input))
    return { ok: false, errors: ["The packet must be a JSON object."], checks };
  const p = input as Packet;
  if (p.schema !== PACKET_SCHEMA) err(`schema must be ${PACKET_SCHEMA}.`);
  const text = (v: unknown, label: string, max = 4000, required = true) => {
    if (typeof v !== "string" || v.length > max || (required && !v.trim()))
      err(`${label} must be ${required ? "non-empty " : ""}text of at most ${max} characters.`);
  };
  const list = (v: unknown, label: string, max: number): unknown[] => {
    if (!Array.isArray(v)) {
      err(`${label} must be a list.`);
      return [];
    }
    if (v.length > max) err(`${label} lists at most ${max} items.`);
    return v;
  };
  const idPattern = /^[a-zA-Z0-9_.:-]{1,80}$/;

  // Summary
  if (!p.summary || typeof p.summary !== "object") err("summary is missing.");
  else {
    text(p.summary.objective, "summary.objective");
    text(p.summary.headline, "summary.headline", 300);
    text(p.summary.productLabel, "summary.productLabel", 200);
    if (p.summary.requestVersion !== frozen.version)
      err(`summary.requestVersion must be ${frozen.version} (the frozen request version).`);
    const expectedBaseline = frozen.brief.baseline || "Unknown";
    if (p.summary.baseline !== expectedBaseline)
      err(`summary.baseline must be exactly "${expectedBaseline}" (supplied baseline or Unknown).`);
    const tags = list(p.summary.sectorTags, "summary.sectorTags", 9);
    if (JSON.stringify(tags) !== JSON.stringify(frozen.brief.sectorTags))
      err("summary.sectorTags must equal the frozen request's sector snapshot.");
  }

  // Source register must mirror the frozen manifest exactly.
  const register = list(p.sourceRegister, "sourceRegister", 50) as Packet["sourceRegister"];
  const anchors = new Map<string, Anchor>();
  const manifestIds = new Set(frozen.sources.map((s) => s.sourceId));
  const registerIds = new Set<string>();
  for (const entry of register) {
    if (!entry || typeof entry !== "object") {
      err("sourceRegister entries must be objects.");
      continue;
    }
    const m = frozen.sources.find((s) => s.sourceId === entry.sourceId);
    if (!m) {
      err(`sourceRegister lists ${String(entry.sourceId)}, which is not in the frozen manifest.`);
      continue;
    }
    registerIds.add(entry.sourceId);
    if (entry.sha256 !== m.sha256) err(`sourceRegister ${entry.sourceId} hash does not match the frozen source.`);
    if (entry.revision !== m.revision) err(`sourceRegister ${entry.sourceId} revision does not match the frozen source.`);
    if (entry.name !== m.name) err(`sourceRegister ${entry.sourceId} name does not match the frozen source.`);
    if (entry.bytes !== m.bytes) err(`sourceRegister ${entry.sourceId} byte count does not match the frozen source.`);
    if (entry.importedAt !== m.importedAt) err(`sourceRegister ${entry.sourceId} import date does not match the frozen source.`);
    const content = contents.get(entry.sourceId);
    if (content === undefined || sha256(content) !== m.sha256) {
      err(`Stored content for ${entry.sourceId} does not match its frozen hash.`);
      continue;
    }
    for (const a of list(entry.anchors, `sourceRegister.${entry.sourceId}.anchors`, 200) as Anchor[]) {
      if (!a || typeof a !== "object" || typeof a.anchorId !== "string" || !idPattern.test(a.anchorId)) {
        err(`Anchor in ${entry.sourceId} has an invalid id.`);
        continue;
      }
      if (a.sourceId !== entry.sourceId) err(`Anchor ${a.anchorId} belongs to a different source.`);
      if (
        !Number.isInteger(a.start) ||
        !Number.isInteger(a.end) ||
        a.start < 0 ||
        a.end <= a.start ||
        a.end > content.length
      ) {
        err(`Anchor ${a.anchorId} has offsets outside ${entry.sourceId}.`);
        continue;
      }
      if (content.slice(a.start, a.end) !== a.excerpt)
        err(`Anchor ${a.anchorId} excerpt does not match ${entry.sourceId} at ${a.start}-${a.end}.`);
      if (anchors.has(a.anchorId)) err(`Duplicate anchor id ${a.anchorId}.`);
      anchors.set(a.anchorId, a);
    }
  }
  for (const id of manifestIds) if (!registerIds.has(id)) err(`sourceRegister omits frozen source ${id}.`);
  checks.push(`${register.length} source register entries compared with the frozen manifest.`);

  let citationCount = 0;
  const cite = (cs: unknown, label: string, min = 0) => {
    const items = list(cs, `${label}.citations`, 20) as Citation[];
    if (items.length < min) err(`${label} needs at least ${min} citation${min === 1 ? "" : "s"}.`);
    for (const c of items) {
      citationCount += 1;
      if (!c || typeof c !== "object") {
        err(`${label} has a malformed citation.`);
        continue;
      }
      const a = anchors.get(c.anchorId);
      if (!a) err(`${label} cites unknown anchor ${String(c.anchorId)}.`);
      else if (a.sourceId !== c.sourceId) err(`${label} cites ${c.anchorId} with the wrong source id.`);
      if (!manifestIds.has(c.sourceId)) err(`${label} cites ${String(c.sourceId)}, which is not a frozen source.`);
    }
  };

  const unique = (items: { id?: string }[], label: string) => {
    const ids = items.map((i) => i?.id);
    if (ids.some((id) => typeof id !== "string" || !idPattern.test(id))) err(`${label} ids must be short identifiers.`);
    if (new Set(ids).size !== ids.length) err(`${label} ids must be unique.`);
  };

  const facts = list(p.knownFacts, "knownFacts", 60) as Packet["knownFacts"];
  unique(facts, "knownFacts");
  const kinds: ClaimKind[] = ["source statement", "author-entered number", "synthetic fixture", "verified measurement", "inference"];
  facts.forEach((f, i) => {
    const label = `knownFacts[${i}]`;
    text(f?.statement, `${label}.statement`, 1500);
    if (!kinds.includes(f?.kind)) err(`${label}.kind must be one of ${kinds.join(", ")}.`);
    if (f?.kind === "verified measurement")
      err(`${label}: generated packets cannot assert verified measurements; record the source statement and the missing verification instead.`);
    if (f?.kind === "synthetic fixture" && !allowFixtureKind)
      err(`${label}: this request is not a synthetic fixture.`);
    cite(f?.citations, label, f?.kind === "inference" ? 0 : 1);
  });

  const alts = list(p.alternatives, "alternatives", 8) as Packet["alternatives"];
  unique(alts, "alternatives");
  if (!alts.some((a) => a?.kind === "retain-investigate")) err("alternatives must include retaining/investigating the current J12 connector.");
  if (!alts.some((a) => a?.kind === "replacement")) err("alternatives must include evaluating a replacement.");
  alts.forEach((a, i) => {
    const label = `alternatives[${i}]`;
    text(a?.title, `${label}.title`, 200);
    text(a?.description, `${label}.description`, 3000);
    list(a?.prerequisites, `${label}.prerequisites`, 20).forEach((x, j) => text(x, `${label}.prerequisites[${j}]`, 500));
    cite(a?.citations, label, 0);
  });

  const artifacts = list(p.affectedArtifacts, "affectedArtifacts", 40) as Packet["affectedArtifacts"];
  unique(artifacts, "affectedArtifacts");
  artifacts.forEach((a, i) => {
    const label = `affectedArtifacts[${i}]`;
    text(a?.label, `${label}.label`, 200);
    text(a?.basis, `${label}.basis`, 1000);
    if (a?.status !== "confirmed" && a?.status !== "suggested") err(`${label}.status must be confirmed or suggested.`);
    cite(a?.citations, label, a?.status === "confirmed" ? 1 : 0);
  });

  const gaps = list(p.evidenceGaps, "evidenceGaps", 40) as Packet["evidenceGaps"];
  unique(gaps, "evidenceGaps");
  gaps.forEach((g, i) => {
    const label = `evidenceGaps[${i}]`;
    text(g?.gap, `${label}.gap`, 500);
    text(g?.whyItMatters, `${label}.whyItMatters`, 1500);
    cite(g?.citations, label, 0);
  });

  const questions = list(p.reviewQuestions, "reviewQuestions", 40) as Packet["reviewQuestions"];
  unique(questions, "reviewQuestions");
  questions.forEach((q, i) => {
    text(q?.question, `reviewQuestions[${i}].question`, 1000);
    text(q?.owner, `reviewQuestions[${i}].owner`, 200);
    text(q?.prerequisite, `reviewQuestions[${i}].prerequisite`, 1000, false);
  });

  if (!p.nextAction || typeof p.nextAction !== "object") err("nextAction is missing.");
  else {
    text(p.nextAction.action, "nextAction.action", 600);
    text(p.nextAction.ownerRole, "nextAction.ownerRole", 200);
    text(p.nextAction.requiredInput, "nextAction.requiredInput", 1000);
    if (typeof p.nextAction.gapId !== "string" || !gaps.some((g) => g?.id === p.nextAction.gapId))
      err("nextAction.gapId must reference one listed evidence gap.");
    cite(p.nextAction.citations, "nextAction", 1);
    if (/\b(approved|approve|release is approved|ready for release)\b/i.test(p.nextAction.action) && !/not approved|before (engineering )?approval|not ready/i.test(p.nextAction.action))
      err("nextAction must not assert that the change is approved or ready for release.");
  }

  const limitations = list(p.limitations, "limitations", 30) as string[];
  limitations.forEach((l, i) => text(l, `limitations[${i}]`, 800));
  if (!limitations.includes(ENGINEERING_BOUNDARY)) err("limitations must include the engineering boundary statement verbatim.");

  checks.push(`${citationCount} citations resolved against ${anchors.size} verified anchors.`);
  checks.push(`${alts.length} alternatives, ${gaps.length} evidence gaps, ${facts.length} known facts, ${artifacts.length} artifact impacts checked.`);
  return { ok: errors.length === 0, errors, checks };
}

export function packetDigest(packet: Omit<Packet, "receipt">) {
  return sha256(JSON.stringify(packet));
}

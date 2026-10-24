import inputs from "../../synthetic-assets/review-benchmark/inputs.json";
import { isSectorTag, SECTOR_TAGS, sectorLabel, type SectorTagId } from "./client-model";
import type { Brief } from "./model";

export const GRAPH_CATEGORIES = [
  { id: "sources", label: "Sources" },
  { id: "hardware", label: "Hardware" },
  { id: "alternatives", label: "Alternatives" },
  { id: "constraints", label: "Constraints & gaps" },
] as const;
export type GraphCategoryId = (typeof GRAPH_CATEGORIES)[number]["id"];
export type AlternativeFocus = "all" | "retain" | "replace";

export type SectorSourceItem = {
  sourceId: string;
  name: string;
  revision: string;
  sha256: string;
  content: string;
  role: "obs" | "log" | "req" | "status";
};

export type SectorGraphNode = {
  id: string;
  label: string;
  sublabel: string;
  category: GraphCategoryId;
  alternative: "both" | "retain" | "replace";
  col: 0 | 1 | 2 | 3;
  row: number;
  sourceId: string;
  revision: string;
  sha256: string;
  excerpt: string;
  status: string;
};

export type SectorGraphEdge = {
  id: string;
  from: string;
  to: string;
  label: string;
  alternative: "both" | "retain" | "replace";
};

/** The documented development example for a sector. One case, one sector. */
export type SectorBriefFill = {
  caseId: string;
  sector: SectorTagId;
  sectorLabel: string;
  brief: Brief;
  exposure: string;
  benchProfile: string;
  benchContext: string;
  sources: SectorSourceItem[];
  alternatives: {
    id: "retain" | "replace";
    badge: string;
    title: string;
    summary: string;
    prerequisites: string[];
    sourceIds: string[];
  }[];
  graph: {
    nodes: SectorGraphNode[];
    edges: SectorGraphEdge[];
  };
};

function cleanLines(content: string): string[] {
  return content
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter((line) => line.length > 0 && !line.startsWith("SYNTHETIC"));
}

function roleForSource(sourceId: string): SectorSourceItem["role"] {
  if (sourceId.includes("-OBS-")) return "obs";
  if (sourceId.includes("-LOG-")) return "log";
  if (sourceId.includes("-REQ-")) return "req";
  return "status";
}

const fills = new Map<SectorTagId, SectorBriefFill>();
for (const item of inputs.cases) {
  if (item.kind !== "complete" || item.split !== "development" || !isSectorTag(item.sector) || fills.has(item.sector)) continue;
  const brief = item.brief;
  const sources: SectorSourceItem[] = item.sources.map((s) => ({
    sourceId: s.sourceId,
    name: s.name,
    revision: s.revision,
    sha256: s.sha256,
    content: s.content,
    role: roleForSource(s.sourceId),
  }));
  const byRole = {
    obs: sources.find((s) => s.role === "obs") ?? sources[0],
    log: sources.find((s) => s.role === "log") ?? sources[0],
    req: sources.find((s) => s.role === "req") ?? sources[0],
    status: sources.find((s) => s.role === "status") ?? sources[0],
  };
  const obsLines = cleanLines(byRole.obs.content);
  const logLines = cleanLines(byRole.log.content);
  const reqLines = cleanLines(byRole.req.content);
  const statusLines = cleanLines(byRole.status.content);

  const exposureMatch = /during\s+([a-z\s-]+?)\s+using/i.exec(brief.issue);
  const exposure = exposureMatch ? exposureMatch[1].trim() : "bench testing";
  const profileMatch = /profile\s+([A-Z0-9-]+)/.exec(byRole.log.content);
  const benchProfile = profileMatch ? profileMatch[1] : item.id.toUpperCase();
  const benchContext = brief.conditions.replace(/^Synthetic bench context:\s*/i, "").replace(/\.$/, "");
  const cleanProduct = brief.product.replace(/\s*\(synthetic\)\s*$/i, "");

  const nodes: SectorGraphNode[] = [
    {
      id: "src-obs",
      label: byRole.obs.sourceId,
      sublabel: `Observation · ${exposure}`,
      category: "sources",
      alternative: "retain",
      col: 0,
      row: 0,
      sourceId: byRole.obs.sourceId,
      revision: byRole.obs.revision,
      sha256: byRole.obs.sha256,
      excerpt: obsLines[1] ?? obsLines[0] ?? byRole.obs.content,
      status: "Frozen synthetic source",
    },
    {
      id: "src-log",
      label: byRole.log.sourceId,
      sublabel: `2 / 10 cycles · ${benchProfile}`,
      category: "sources",
      alternative: "retain",
      col: 0,
      row: 1,
      sourceId: byRole.log.sourceId,
      revision: byRole.log.revision,
      sha256: byRole.log.sha256,
      excerpt: logLines[1] ?? logLines[0] ?? byRole.log.content,
      status: "Frozen synthetic source",
    },
    {
      id: "src-req",
      label: byRole.req.sourceId,
      sublabel: "Baseline Rev B · pin A / B",
      category: "sources",
      alternative: "replace",
      col: 0,
      row: 2,
      sourceId: byRole.req.sourceId,
      revision: byRole.req.revision,
      sha256: byRole.req.sha256,
      excerpt: reqLines[1] ?? reqLines[0] ?? byRole.req.content,
      status: "Frozen synthetic source",
    },
    {
      id: "src-status",
      label: byRole.status.sourceId,
      sublabel: "Review & gap register",
      category: "sources",
      alternative: "both",
      col: 0,
      row: 3,
      sourceId: byRole.status.sourceId,
      revision: byRole.status.revision,
      sha256: byRole.status.sha256,
      excerpt: statusLines.join(" "),
      status: "Frozen synthetic source",
    },
    {
      id: "hw-controller",
      label: `${cleanProduct} controller`,
      sublabel: `Baseline ${brief.baseline || "Rev B"}`,
      category: "hardware",
      alternative: "both",
      col: 1,
      row: 0,
      sourceId: byRole.req.sourceId,
      revision: byRole.req.revision,
      sha256: byRole.req.sha256,
      excerpt: reqLines[0] ?? byRole.req.content,
      status: "Confirmed baseline",
    },
    {
      id: "hw-j12",
      label: "J12 connector",
      sublabel: `Link interrupted during ${exposure}`,
      category: "hardware",
      alternative: "both",
      col: 1,
      row: 1,
      sourceId: byRole.obs.sourceId,
      revision: byRole.obs.revision,
      sha256: byRole.obs.sha256,
      excerpt: obsLines[0] ?? byRole.obs.content,
      status: "Interface under review",
    },
    {
      id: "hw-harness",
      label: "Sensor harness",
      sublabel: `Rev B · ${benchContext}`,
      category: "hardware",
      alternative: "both",
      col: 1,
      row: 2,
      sourceId: byRole.obs.sourceId,
      revision: byRole.obs.revision,
      sha256: byRole.obs.sha256,
      excerpt: `${obsLines[0] ?? ""} ${reqLines[0] ?? ""}`.trim(),
      status: "Confirmed baseline",
    },
    {
      id: "alt-retain",
      label: "Retain & investigate J12",
      sublabel: `Keep J12 · inspect ${exposure} cause`,
      category: "alternatives",
      alternative: "retain",
      col: 2,
      row: 0,
      sourceId: byRole.log.sourceId,
      revision: byRole.log.revision,
      sha256: byRole.log.sha256,
      excerpt: `${obsLines[2] ?? ""} ${logLines[3] ?? ""}`.trim(),
      status: "Alternative 1 · no pinout change",
    },
    {
      id: "alt-replace",
      label: "Evaluate replacement",
      sublabel: "Preserve pin A = signal, pin B = return",
      category: "alternatives",
      alternative: "replace",
      col: 2,
      row: 2,
      sourceId: byRole.req.sourceId,
      revision: byRole.req.revision,
      sha256: byRole.req.sha256,
      excerpt: reqLines[2] ?? byRole.req.content,
      status: "Alternative 2 · candidate unassessed",
    },
    {
      id: "gap-bench",
      label: "Bench applicability gap",
      sublabel: `${benchProfile} not shown operational`,
      category: "constraints",
      alternative: "retain",
      col: 3,
      row: 0,
      sourceId: byRole.log.sourceId,
      revision: byRole.log.revision,
      sha256: byRole.log.sha256,
      excerpt: logLines[3] ?? statusLines[1] ?? byRole.log.content,
      status: "Missing evidence · drives next action",
    },
    {
      id: "gap-candidate",
      label: "Geometry & materials gap",
      sublabel: "Pin map fixed · candidate unassessed",
      category: "constraints",
      alternative: "replace",
      col: 3,
      row: 1,
      sourceId: byRole.req.sourceId,
      revision: byRole.req.revision,
      sha256: byRole.req.sha256,
      excerpt: reqLines[2] ?? statusLines[2] ?? byRole.req.content,
      status: "Missing evidence · blocks replacement",
    },
    {
      id: "gate-review",
      label: "Independent review gate",
      sublabel: "Preparation only · not approval",
      category: "constraints",
      alternative: "both",
      col: 3,
      row: 2,
      sourceId: byRole.status.sourceId,
      revision: byRole.status.revision,
      sha256: byRole.status.sha256,
      excerpt: `${statusLines[0] ?? ""} ${statusLines[3] ?? ""}`.trim(),
      status: "Required gate before release",
    },
  ];

  const edges: SectorGraphEdge[] = [
    { id: "e-obs-j12", from: "src-obs", to: "hw-j12", label: "reports", alternative: "retain" },
    { id: "e-log-j12", from: "src-log", to: "hw-j12", label: "2/10 cycles", alternative: "retain" },
    { id: "e-req-ctrl", from: "src-req", to: "hw-controller", label: "Rev B", alternative: "both" },
    { id: "e-req-har", from: "src-req", to: "hw-harness", label: "pin A/B", alternative: "replace" },
    { id: "e-status-gate", from: "src-status", to: "gate-review", label: "gates", alternative: "both" },
    { id: "e-ctrl-j12", from: "hw-controller", to: "hw-j12", label: "mates", alternative: "both" },
    { id: "e-j12-har", from: "hw-j12", to: "hw-harness", label: "routes", alternative: "both" },
    { id: "e-j12-retain", from: "hw-j12", to: "alt-retain", label: "option 1", alternative: "retain" },
    { id: "e-j12-replace", from: "hw-j12", to: "alt-replace", label: "option 2", alternative: "replace" },
    { id: "e-har-replace", from: "hw-harness", to: "alt-replace", label: "pinout", alternative: "replace" },
    { id: "e-retain-bench", from: "alt-retain", to: "gap-bench", label: "needs", alternative: "retain" },
    { id: "e-retain-gate", from: "alt-retain", to: "gate-review", label: "awaits", alternative: "retain" },
    { id: "e-replace-cand", from: "alt-replace", to: "gap-candidate", label: "needs", alternative: "replace" },
    { id: "e-replace-gate", from: "alt-replace", to: "gate-review", label: "awaits", alternative: "replace" },
  ];

  fills.set(item.sector, {
    caseId: item.id,
    sector: item.sector,
    sectorLabel: sectorLabel(item.sector),
    brief: {
      product: brief.product,
      title: brief.title,
      baseline: brief.baseline,
      sectorTags: [item.sector],
      issue: brief.issue,
      goal: brief.goal,
      constraints: brief.constraints,
      conditions: brief.conditions,
      decision: brief.decision,
      candidate: brief.candidate,
      desiredNextAction: brief.desiredNextAction,
      acknowledged: brief.acknowledged === true,
    },
    exposure,
    benchProfile,
    benchContext,
    sources,
    alternatives: [
      {
        id: "retain",
        badge: "Alternative 1 · Retain / investigate",
        title: `Retain J12 on ${cleanProduct} and verify ${exposure} evidence`,
        summary: `Keep the current J12 connector and Rev B pinout while determining what caused the 2 interruptions in 10 cycles under ${exposure}.`,
        prerequisites: [
          `Establish whether bench profile ${benchProfile} represents the operational environment.`,
          `Verify the ${exposure} interruption cause beyond author-entered bench notes.`,
          "Obtain independent engineering review before any release decision.",
        ],
        sourceIds: [byRole.obs.sourceId, byRole.log.sourceId, byRole.status.sourceId],
      },
      {
        id: "replace",
        badge: "Alternative 2 · Evaluate replacement",
        title: "Evaluate a replacement connector that preserves pin A / pin B",
        summary: `Any replacement must preserve J12 signal mapping (pin A = signal, pin B = return) across the Rev B controller and harness.`,
        prerequisites: [
          "Assess candidate connector geometry and materials suitability (currently unassessed).",
          "Confirm pin A = signal, pin B = return compatibility with Rev B controller and harness.",
          "Obtain independent engineering review before any release decision.",
        ],
        sourceIds: [byRole.req.sourceId, byRole.status.sourceId],
      },
    ],
    graph: { nodes, edges },
  });
}
if (fills.size !== SECTOR_TAGS.length) throw new Error("Each sector needs one synthetic brief.");

export function syntheticBriefForSector(sector: SectorTagId): SectorBriefFill {
  const fill = fills.get(sector);
  if (!fill) throw new Error(`No synthetic brief for ${sector}.`);
  return {
    ...fill,
    brief: { ...fill.brief, sectorTags: [sector] },
  };
}

export function selectedSector(tags: string[]): SectorTagId | null {
  return tags.length === 1 && isSectorTag(tags[0]) ? tags[0] : null;
}

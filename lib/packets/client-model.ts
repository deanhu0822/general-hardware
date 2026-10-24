// Browser-safe intake constants; no server hashing or SDK dependency.
import type { Brief } from "./model";

// ---------------------------------------------------------------------------
// Sector tags: a single data-driven registry. Other sectors are metadata only.
// ---------------------------------------------------------------------------
export const SECTOR_TAGS = [
  { id: "aerospace", label: "Aerospace" },
  { id: "space", label: "Space" },
  { id: "medical-devices", label: "Medical Devices" },
  { id: "robotics-industrial", label: "Robotics & Industrial" },
  { id: "consumer-tech", label: "Consumer Tech" },
  { id: "maritime", label: "Maritime" },
  { id: "automotive", label: "Automotive" },
  { id: "heavy-machinery", label: "Heavy Machinery" },
] as const;
export type SectorTagId = (typeof SECTOR_TAGS)[number]["id"];
export const UNCLASSIFIED = "unclassified";
export const DEMONSTRATED_SECTOR: SectorTagId = "robotics-industrial";
export function sectorLabel(id: string) {
  return (
    SECTOR_TAGS.find((t) => t.id === id)?.label ??
    (id === UNCLASSIFIED ? "Unclassified" : id)
  );
}
export function isSectorTag(id: string): id is SectorTagId {
  return SECTOR_TAGS.some((t) => t.id === id);
}

export function emptyBrief(): Brief {
  return {
    product: "",
    title: "",
    baseline: "",
    sectorTags: [],
    issue: "",
    goal: "",
    constraints: "",
    conditions: "",
    decision: "",
    candidate: "",
    desiredNextAction: "",
    acknowledged: false,
  };
}
export const BRIEF_LIMITS = {
  short: 200,
  long: 4000,
  sourceBytes: 200_000,
  totalSourceBytes: 1_000_000,
  maxSources: 12,
};


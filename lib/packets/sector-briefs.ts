import inputs from "../../synthetic-assets/review-benchmark/inputs.json";
import { isSectorTag, SECTOR_TAGS, type SectorTagId } from "./client-model";
import type { Brief } from "./model";

/** The documented development example for a sector. One case, one sector. */
export type SectorBriefFill = { caseId: string; sector: SectorTagId; brief: Brief };

const fills = new Map<SectorTagId, SectorBriefFill>();
for (const item of inputs.cases) {
  if (item.kind !== "complete" || item.split !== "development" || !isSectorTag(item.sector) || fills.has(item.sector)) continue;
  const brief = item.brief;
  fills.set(item.sector, {
    caseId: item.id,
    sector: item.sector,
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
  });
}
if (fills.size !== SECTOR_TAGS.length) throw new Error("Each sector needs one synthetic brief.");

export function syntheticBriefForSector(sector: SectorTagId): SectorBriefFill {
  const fill = fills.get(sector);
  if (!fill) throw new Error(`No synthetic brief for ${sector}.`);
  return { caseId: fill.caseId, sector: fill.sector, brief: { ...fill.brief, sectorTags: [sector] } };
}

export function selectedSector(tags: string[]): SectorTagId | null {
  return tags.length === 1 && isSectorTag(tags[0]) ? tags[0] : null;
}

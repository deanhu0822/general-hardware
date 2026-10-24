"use client";

import Link from "next/link";
import { useState } from "react";
import { ArrowUpRight, CheckCircle2, FileText, GitBranch, Layers, ShieldAlert } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { DEMONSTRATED_SECTOR, isSectorTag, SECTOR_TAGS, sectorLabel, type SectorTagId } from "@/lib/packets/client-model";
import {
  GRAPH_CATEGORIES,
  syntheticBriefForSector,
  type AlternativeFocus,
  type GraphCategoryId,
  type SectorGraphEdge,
  type SectorGraphNode,
} from "@/lib/packets/sector-briefs";

const COL_X = [115, 345, 595, 845] as const;
const ROW_Y = [78, 178, 278, 378] as const;
const NODE_W = 190;
const NODE_H = 64;

const CATEGORY_DOT: Record<GraphCategoryId, string> = {
  sources: "bg-sky-500",
  hardware: "bg-emerald-600",
  alternatives: "bg-blue-600",
  constraints: "bg-amber-500",
};

const CATEGORY_STROKE: Record<GraphCategoryId, string> = {
  sources: "#0ea5e9",
  hardware: "#059669",
  alternatives: "#2563eb",
  constraints: "#d97706",
};

function matchesAlternative(itemAlt: "both" | "retain" | "replace", focus: AlternativeFocus) {
  return focus === "all" || itemAlt === "both" || itemAlt === focus;
}

export type HardwareNodeGraphProps = {
  sector?: SectorTagId | null;
  onSectorChange?: (sector: SectorTagId) => void;
  sectorLocked?: boolean;
  embedded?: boolean;
};

/**
 * Simple hardware plan, change alternatives, and relationship node graph
 * aligned to the 8 sector tags, category tags, and synthetic benchmark dataset.
 */
export function HardwareNodeGraph({
  sector: controlledSector,
  onSectorChange,
  sectorLocked = false,
  embedded = false,
}: HardwareNodeGraphProps) {
  const [internalSector, setInternalSector] = useState<SectorTagId>(() =>
    controlledSector && isSectorTag(controlledSector) ? controlledSector : DEMONSTRATED_SECTOR,
  );
  const activeSector: SectorTagId =
    onSectorChange && controlledSector && isSectorTag(controlledSector) ? controlledSector : internalSector;

  const [altFocus, setAltFocus] = useState<AlternativeFocus>("all");
  const [categoryFilter, setCategoryFilter] = useState<GraphCategoryId | "all">("all");
  const [selectedNodeId, setSelectedNodeId] = useState<string>("hw-j12");

  const data = syntheticBriefForSector(activeSector);
  const { nodes, edges } = data.graph;
  const selectedNode = nodes.find((n) => n.id === selectedNodeId) ?? nodes.find((n) => n.id === "hw-j12") ?? nodes[0];

  function selectSector(next: SectorTagId) {
    if (sectorLocked && next !== activeSector) return;
    setInternalSector(next);
    onSectorChange?.(next);
    if (!embedded && typeof window !== "undefined") {
      const url = new URL(window.location.href);
      url.searchParams.set("sector", next);
      window.history.replaceState(null, "", url);
    }
  }

  function selectAlternative(next: AlternativeFocus) {
    setAltFocus(next);
    if (next === "retain") setSelectedNodeId("alt-retain");
    else if (next === "replace") setSelectedNodeId("alt-replace");
    else setSelectedNodeId("hw-j12");
  }

  function isNodeActive(node: SectorGraphNode) {
    const altOk = matchesAlternative(node.alternative, altFocus);
    const catOk = categoryFilter === "all" || node.category === categoryFilter;
    return altOk && catOk;
  }

  function isEdgeActive(edge: SectorGraphEdge) {
    const fromNode = nodes.find((n) => n.id === edge.from);
    const toNode = nodes.find((n) => n.id === edge.to);
    if (!fromNode || !toNode) return false;
    const altOk = matchesAlternative(edge.alternative, altFocus);
    const catOk =
      categoryFilter === "all" ||
      fromNode.category === categoryFilter ||
      toNode.category === categoryFilter;
    return altOk && catOk;
  }

  const connectedEdges = edges.filter(
    (e) => e.from === selectedNode.id || e.to === selectedNode.id,
  );

  return (
    <div className="space-y-5" aria-label="Hardware node graph">
      <Card className="liquid-glass">
        <CardHeader className="gap-3">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div className="space-y-1">
              <div className="flex flex-wrap items-center gap-2">
                <Badge variant="secondary" className="gap-1">
                  <GitBranch className="size-3" aria-hidden="true" /> Node graph · synthetic dataset
                </Badge>
                <Badge variant="outline">{data.caseId}</Badge>
                <Badge variant="outline">
                  <ShieldAlert className="size-3" aria-hidden="true" /> Preparation only · not approval
                </Badge>
              </div>
              <CardTitle className="text-lg">
                {data.brief.product} — {data.brief.title}
              </CardTitle>
              <CardDescription>
                {data.sectorLabel} · Baseline {data.brief.baseline || "Rev B"} · Bench profile {data.benchProfile} ({data.exposure})
              </CardDescription>
            </div>
            <div className="flex flex-wrap items-center gap-2">
              {embedded ? (
                <Button asChild size="sm" variant="outline">
                  <Link href={`/graph?sector=${activeSector}`}>
                    Open full graph <ArrowUpRight data-icon="inline-end" />
                  </Link>
                </Button>
              ) : (
                <>
                  <Button asChild size="sm">
                    <Link href={`/packets/new?sector=${activeSector}`}>
                      Review this sector <ArrowUpRight data-icon="inline-end" />
                    </Link>
                  </Button>
                  <Button asChild size="sm" variant="outline">
                    <Link href="/sample">See example</Link>
                  </Button>
                  <Button asChild size="sm" variant="outline">
                    <Link href="/account">Sign in</Link>
                  </Button>
                </>
              )}
            </div>
          </div>

          <div className="grid gap-3 pt-1">
            <div className="space-y-1.5">
              <span className="text-xs font-medium text-muted-foreground">
                Sector tag {sectorLocked ? "(locked for this review)" : "(select one to load its synthetic hardware graph)"}
              </span>
              <div className="flex flex-wrap gap-1.5" role="radiogroup" aria-label="Graph sector tag">
                {SECTOR_TAGS.map((t) => {
                  const on = activeSector === t.id;
                  return (
                    <Button
                      key={t.id}
                      type="button"
                      size="xs"
                      variant={on ? "default" : "outline"}
                      role="radio"
                      aria-checked={on}
                      disabled={sectorLocked && !on}
                      onClick={() => selectSector(t.id)}
                    >
                      {t.label}
                    </Button>
                  );
                })}
              </div>
            </div>

            <div className="flex flex-wrap items-center justify-between gap-3">
              <div className="space-y-1">
                <span className="text-xs font-medium text-muted-foreground">Alternative view</span>
                <div className="flex flex-wrap gap-1.5" role="group" aria-label="Alternative view filter">
                  <Button
                    type="button"
                    size="xs"
                    variant={altFocus === "all" ? "default" : "outline"}
                    aria-pressed={altFocus === "all"}
                    onClick={() => selectAlternative("all")}
                  >
                    All paths
                  </Button>
                  <Button
                    type="button"
                    size="xs"
                    variant={altFocus === "retain" ? "default" : "outline"}
                    aria-pressed={altFocus === "retain"}
                    onClick={() => selectAlternative("retain")}
                  >
                    Alternative 1 · Retain & investigate J12
                  </Button>
                  <Button
                    type="button"
                    size="xs"
                    variant={altFocus === "replace" ? "default" : "outline"}
                    aria-pressed={altFocus === "replace"}
                    onClick={() => selectAlternative("replace")}
                  >
                    Alternative 2 · Evaluate replacement
                  </Button>
                </div>
              </div>

              <div className="space-y-1">
                <span className="text-xs font-medium text-muted-foreground">Category tags</span>
                <div className="flex flex-wrap gap-1.5" role="group" aria-label="Category tag filter">
                  <Button
                    type="button"
                    size="xs"
                    variant={categoryFilter === "all" ? "default" : "outline"}
                    aria-pressed={categoryFilter === "all"}
                    onClick={() => setCategoryFilter("all")}
                  >
                    <Layers data-icon="inline-start" /> All ({nodes.length})
                  </Button>
                  {GRAPH_CATEGORIES.map((cat) => {
                    const count = nodes.filter((n) => n.category === cat.id).length;
                    const on = categoryFilter === cat.id;
                    return (
                      <Button
                        key={cat.id}
                        type="button"
                        size="xs"
                        variant={on ? "default" : "outline"}
                        aria-pressed={on}
                        onClick={() => setCategoryFilter(on ? "all" : cat.id)}
                      >
                        <span className={`size-2 rounded-full ${CATEGORY_DOT[cat.id]}`} aria-hidden="true" />
                        {cat.label} ({count})
                      </Button>
                    );
                  })}
                </div>
              </div>
            </div>
          </div>
        </CardHeader>
      </Card>

      <div className="liquid-glass overflow-x-auto rounded-xl p-4">
        <div className="mb-3 flex flex-wrap items-center justify-between gap-2 text-xs text-muted-foreground">
          <span>
            Click any node to inspect its synthetic source excerpt and connected relationships.
          </span>
          <span>
            {nodes.filter(isNodeActive).length} of {nodes.length} nodes active · {edges.filter(isEdgeActive).length} relationships
          </span>
        </div>
        <svg
          viewBox="0 0 960 430"
          className="h-auto w-full select-none"
          role="img"
          aria-label={`Node graph for ${data.brief.product} in ${data.sectorLabel}`}
        >
          {GRAPH_CATEGORIES.map((cat, colIdx) => (
            <g key={cat.id}>
              <text
                x={COL_X[colIdx]}
                y={26}
                textAnchor="middle"
                className="fill-muted-foreground text-[11px] font-semibold uppercase tracking-wider"
              >
                {cat.label}
              </text>
            </g>
          ))}

          {edges.map((edge) => {
            const from = nodes.find((n) => n.id === edge.from);
            const to = nodes.find((n) => n.id === edge.to);
            if (!from || !to) return null;
            const x1 = COL_X[from.col] + NODE_W / 2 - 6;
            const y1 = ROW_Y[from.row];
            const x2 = COL_X[to.col] - NODE_W / 2 + 6;
            const y2 = ROW_Y[to.row];
            const mx = (x1 + x2) / 2;
            const d = `M ${x1} ${y1} C ${mx} ${y1}, ${mx} ${y2}, ${x2} ${y2}`;
            const active = isEdgeActive(edge);
            const touchesSelected = selectedNode.id === edge.from || selectedNode.id === edge.to;
            const stroke = touchesSelected
              ? "#2563eb"
              : active
                ? "#64748b"
                : "#cbd5e1";
            const opacity = active ? (touchesSelected ? 0.95 : 0.6) : 0.18;
            return (
              <g key={edge.id} style={{ opacity }}>
                <path
                  d={d}
                  fill="none"
                  stroke={stroke}
                  strokeWidth={touchesSelected ? 2.4 : 1.5}
                />
                <circle cx={x2} cy={y2} r={3} fill={stroke} />
                {active ? (
                  <g transform={`translate(${mx}, ${(y1 + y2) / 2 - 6})`}>
                    <rect
                      x={-28}
                      y={-9}
                      width={56}
                      height={15}
                      rx={4}
                      fill="rgba(255,255,255,0.82)"
                    />
                    <text
                      textAnchor="middle"
                      y={2}
                      className="fill-slate-600 text-[9.5px] font-medium"
                    >
                      {edge.label}
                    </text>
                  </g>
                ) : null}
              </g>
            );
          })}

          {nodes.map((node) => {
            const cx = COL_X[node.col];
            const cy = ROW_Y[node.row];
            const x = cx - NODE_W / 2;
            const y = cy - NODE_H / 2;
            const active = isNodeActive(node);
            const selected = selectedNode.id === node.id;
            const accent = CATEGORY_STROKE[node.category];
            return (
              <g
                key={node.id}
                transform={`translate(${x}, ${y})`}
                onClick={() => setSelectedNodeId(node.id)}
                onKeyDown={(e) => {
                  if (e.key === "Enter" || e.key === " ") {
                    e.preventDefault();
                    setSelectedNodeId(node.id);
                  }
                }}
                tabIndex={0}
                role="button"
                aria-pressed={selected}
                aria-label={`${node.label}: ${node.sublabel}`}
                className="cursor-pointer focus:outline-none"
                style={{ opacity: active ? 1 : 0.28 }}
              >
                <rect
                  width={NODE_W}
                  height={NODE_H}
                  rx={14}
                  fill={selected ? "rgba(255, 255, 255, 0.94)" : "rgba(255, 255, 255, 0.62)"}
                />
                <circle cx={14} cy={22} r={4.5} fill={accent} />
                <text
                  x={25}
                  y={26}
                  className="fill-slate-900 text-[11.5px] font-semibold"
                >
                  {node.label.length > 23 ? `${node.label.slice(0, 22)}…` : node.label}
                </text>
                <text
                  x={14}
                  y={46}
                  className="fill-slate-500 text-[10px]"
                >
                  {node.sublabel.length > 29 ? `${node.sublabel.slice(0, 28)}…` : node.sublabel}
                </text>
              </g>
            );
          })}
        </svg>
      </div>

      <Card className="liquid-glass">
        <CardHeader>
          <div className="flex flex-wrap items-center gap-1.5">
            <Badge variant="secondary">
              {GRAPH_CATEGORIES.find((c) => c.id === selectedNode.category)?.label}
            </Badge>
            <Badge variant="outline">{sectorLabel(activeSector)}</Badge>
            <Badge variant="outline">{selectedNode.status}</Badge>
          </div>
          <CardTitle className="text-base">{selectedNode.label}</CardTitle>
          <CardDescription>{selectedNode.sublabel}</CardDescription>
        </CardHeader>
        <CardContent className="grid gap-4 text-sm md:grid-cols-2">
          <div className="space-y-1.5">
            <p className="text-xs font-medium text-muted-foreground">
              Bound synthetic source
            </p>
            <p className="font-mono text-xs">
              {selectedNode.sourceId} · {selectedNode.revision} · sha256 {selectedNode.sha256.slice(0, 12)}…
            </p>
            <blockquote className="rounded-lg bg-white/60 p-2.5 text-xs leading-relaxed text-foreground">
              “{selectedNode.excerpt}”
            </blockquote>
            <div className="flex flex-wrap gap-1 pt-1">
              {data.sources.map((s) => (
                <button
                  key={s.sourceId}
                  type="button"
                  onClick={() => {
                    const srcNode = nodes.find((n) => n.sourceId === s.sourceId && n.category === "sources");
                    if (srcNode) setSelectedNodeId(srcNode.id);
                  }}
                  className="rounded bg-white/60 px-1.5 py-0.5 font-mono text-[11px] hover:bg-white"
                >
                  {s.sourceId}
                </button>
              ))}
            </div>
          </div>

          <div className="space-y-1.5">
            <p className="text-xs font-medium text-muted-foreground">
              Connected relationships ({connectedEdges.length})
            </p>
            <ul className="grid gap-1 text-xs sm:grid-cols-2">
              {connectedEdges.map((edge) => {
                const otherId = edge.from === selectedNode.id ? edge.to : edge.from;
                const other = nodes.find((n) => n.id === otherId);
                if (!other) return null;
                const direction = edge.from === selectedNode.id ? "→" : "←";
                return (
                  <li key={edge.id}>
                    <button
                      type="button"
                      onClick={() => setSelectedNodeId(other.id)}
                      className="flex w-full items-center justify-between rounded-md bg-white/55 px-2 py-1.5 text-left hover:bg-white/85"
                    >
                      <span className="font-medium">
                        {direction} {other.label}
                      </span>
                      <span className="font-mono text-[11px] text-muted-foreground">
                        {edge.label}
                      </span>
                    </button>
                  </li>
                );
              })}
            </ul>
          </div>
        </CardContent>
      </Card>

      <div className="grid gap-3 md:grid-cols-2" aria-label="Change alternatives comparison">
        {data.alternatives.map((alt) => {
          const focused = altFocus === alt.id;
          return (
            <Card
              key={alt.id}
              className="liquid-glass cursor-pointer"
              onClick={() => selectAlternative(focused ? "all" : alt.id)}
            >
              <CardHeader className="pb-2">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <CardDescription className="text-xs font-semibold uppercase tracking-wide text-primary">
                    {alt.badge}
                  </CardDescription>
                  <Badge variant={focused ? "default" : "outline"}>
                    {focused ? "Focused on graph" : "Click to focus path"}
                  </Badge>
                </div>
                <CardTitle className="text-base">{alt.title}</CardTitle>
              </CardHeader>
              <CardContent className="space-y-2 text-sm">
                <p className="text-muted-foreground">{alt.summary}</p>
                <ul className="space-y-1 text-xs">
                  {alt.prerequisites.map((req, idx) => (
                    <li key={idx} className="flex items-start gap-1.5">
                      <CheckCircle2 className="mt-0.5 size-3.5 shrink-0 text-primary" aria-hidden="true" />
                      <span>{req}</span>
                    </li>
                  ))}
                </ul>
                <div className="flex flex-wrap gap-1 pt-1">
                  {alt.sourceIds.map((sid) => (
                    <Badge key={sid} variant="outline" className="font-mono text-[11px]">
                      {sid}
                    </Badge>
                  ))}
                </div>
              </CardContent>
            </Card>
          );
        })}
      </div>
    </div>
  );
}

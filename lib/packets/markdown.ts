import { sectorLabel, type Citation, type Packet } from "./model";

const esc = (s: string) => s.replace(/\r?\n/g, " ").trim();

export function citationLabel(c: Citation) {
  return `[${c.sourceId} · ${c.anchorId}]`;
}

/** Render a packet as portable Markdown. Citations stay bound to source ids and anchor ids. */
export function renderPacketMarkdown(packet: Packet, opts: { title?: string; sampleNotice?: string } = {}) {
  const p = packet;
  const cites = (cs: Citation[]) => (cs.length ? " " + cs.map(citationLabel).join(" ") : "");
  const lines: string[] = [];
  lines.push(`# ${opts.title || "J12 connector-change review packet"}`);
  lines.push("");
  if (opts.sampleNotice) {
    lines.push(`> ${opts.sampleNotice}`);
    lines.push("");
  }
  lines.push(`**Status:** Packet ready — advisory preparation. Not engineering approval.`);
  lines.push(`**Request version:** ${p.summary.requestVersion} · **Baseline:** ${p.summary.baseline} · **Sector:** ${p.summary.sectorTags.map(sectorLabel).join(", ")}`);
  lines.push(`**Product:** ${esc(p.summary.productLabel)}`);
  lines.push("");
  lines.push("## Next action");
  lines.push("");
  lines.push(`**${esc(p.nextAction.action)}**${cites(p.nextAction.citations)}`);
  lines.push("");
  lines.push(`- Owner: ${esc(p.nextAction.ownerRole)}`);
  lines.push(`- Required input: ${esc(p.nextAction.requiredInput)}`);
  lines.push(`- Evidence gap: ${p.nextAction.gapId}`);
  lines.push("");
  lines.push("## Summary");
  lines.push("");
  lines.push(esc(p.summary.headline));
  lines.push("");
  lines.push(esc(p.summary.objective));
  lines.push("");
  lines.push("## Known facts (claim → source)");
  lines.push("");
  lines.push("| # | Statement | Kind | Sources |");
  lines.push("| --- | --- | --- | --- |");
  for (const f of p.knownFacts)
    lines.push(`| ${f.id} | ${esc(f.statement).replace(/\|/g, "\\|")} | ${f.kind} | ${f.citations.map(citationLabel).join(" ") || "—"} |`);
  lines.push("");
  lines.push("## Alternatives");
  lines.push("");
  for (const a of p.alternatives) {
    lines.push(`### ${esc(a.title)} (${a.kind})`);
    lines.push("");
    lines.push(esc(a.description) + cites(a.citations));
    if (a.prerequisites.length) {
      lines.push("");
      lines.push("Prerequisites:");
      for (const x of a.prerequisites) lines.push(`- ${esc(x)}`);
    }
    lines.push("");
  }
  lines.push("## Affected artifacts");
  lines.push("");
  lines.push("| Artifact | Status | Basis | Sources |");
  lines.push("| --- | --- | --- | --- |");
  for (const a of p.affectedArtifacts)
    lines.push(`| ${esc(a.label)} | ${a.status} | ${esc(a.basis).replace(/\|/g, "\\|")} | ${a.citations.map(citationLabel).join(" ") || "—"} |`);
  lines.push("");
  lines.push("## Evidence gaps");
  lines.push("");
  for (const g of p.evidenceGaps) {
    lines.push(`- **${esc(g.gap)}** (${g.id})${cites(g.citations)}`);
    lines.push(`  ${esc(g.whyItMatters)}`);
  }
  lines.push("");
  lines.push("## Reviewer questions");
  lines.push("");
  for (const q of p.reviewQuestions) {
    lines.push(`- ${esc(q.question)} — _${esc(q.owner)}_${q.prerequisite ? ` (prerequisite: ${esc(q.prerequisite)})` : ""}`);
  }
  lines.push("");
  lines.push("## Source register");
  lines.push("");
  lines.push("| Source | Name | Revision | SHA-256 | Bytes | Imported |");
  lines.push("| --- | --- | --- | --- | --- | --- |");
  for (const s of p.sourceRegister)
    lines.push(`| ${s.sourceId} | ${esc(s.name).replace(/\|/g, "\\|")} | ${esc(s.revision)} | \`${s.sha256}\` | ${s.bytes} | ${s.importedAt} |`);
  lines.push("");
  lines.push("### Cited excerpts");
  lines.push("");
  for (const s of p.sourceRegister)
    for (const a of s.anchors) {
      lines.push(`- ${citationLabel({ sourceId: s.sourceId, anchorId: a.anchorId })} chars ${a.start}–${a.end}:`);
      lines.push(`  > ${a.excerpt.replace(/\r?\n/g, "\n  > ")}`);
    }
  lines.push("");
  lines.push("## Limitations");
  lines.push("");
  for (const l of p.limitations) lines.push(`- ${esc(l)}`);
  lines.push("");
  lines.push("## Run receipt");
  lines.push("");
  const r = p.receipt;
  lines.push(`- Origin: ${r.origin}`);
  lines.push(`- Order: ${r.orderId} · Run: ${r.runId} (attempt ${r.attempt}) · Packet version: ${r.packetVersion} · Request version: ${r.requestVersion}`);
  lines.push(`- Source manifest digest: \`${r.manifestDigest}\``);
  if (r.requested)
    lines.push(`- Requested settings: ${r.requested.model} · effort ${r.requested.effort} · context ${r.requested.contextWindow.toLocaleString("en-US")} tokens · budget $${r.requested.maxBudgetUsd} · ≤${r.requested.maxToolCalls} tool calls · ≤${Math.round(r.requested.deadlineMs / 60000)} min`);
  if (r.effective)
    lines.push(`- Effective settings: ${r.effective.model ?? "unknown"} · effort ${r.effective.effort ?? "unknown"} · context ${r.effective.contextWindow?.toLocaleString("en-US") ?? "unknown"} tokens · SDK ${r.effective.sdkVersion ?? "unknown"} · Claude Code ${r.effective.claudeCodeVersion ?? "unknown"}`);
  lines.push(`- Started: ${r.startedAt} · Completed: ${r.completedAt} · Latency: ${(r.latencyMs / 1000).toFixed(1)} s`);
  lines.push(`- Cost: ${r.costUsd === null ? "not applicable" : `$${r.costUsd.toFixed(4)} (SDK estimate)`} · Tokens in/out: ${r.inputTokens ?? "—"}/${r.outputTokens ?? "—"} · Tool calls: ${r.toolCalls} · Repairs: ${r.repairs}`);
  lines.push(`- Validation: ${r.validation.ok ? "passed" : "FAILED"} at ${r.validation.checkedAt}; ${r.validation.checks.join(" ")}`);
  lines.push("");
  return lines.join("\n");
}

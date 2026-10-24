/* eslint-disable @typescript-eslint/no-require-imports */
/**
 * Rescore saved evaluation packets with the current eval-set version and
 * write a combined summary. Usage: node scripts/rescore-evaluation.cjs <effort-evaluation-*.json>
 */
const fs = require("node:fs");
const path = require("node:path");
require("../tests/_ts-loader.cjs");
const { EVAL_CASES, scorePacket, EVAL_SET_VERSION, evalSetDigest } = require("../lib/packets/eval-cases.ts");

const file = process.argv[2];
if (!file) throw new Error("pass the evaluation JSON file");
const record = JSON.parse(fs.readFileSync(file, "utf8"));
const dir = path.dirname(file);
const rescored = record.observations.map((o) => {
  const packetFile = path.join(dir, `packet-${o.effort}-${o.case}-${o.repeat}.json`);
  const body = fs.existsSync(packetFile) ? JSON.parse(fs.readFileSync(packetFile, "utf8")) : null;
  const c = EVAL_CASES.find((x) => x.kind === o.case);
  return { ...o, scoreV1: o.score, score: scorePacket(body, c) };
});
const out = { ...record, rescoredWith: EVAL_SET_VERSION, rescoredDigest: evalSetDigest(), rescoredAt: new Date().toISOString(), observations: rescored };
const target = file.replace(/\.json$/, `.rescored.json`);
fs.writeFileSync(target, JSON.stringify(out, null, 2));
const lines = [`# Rescored with ${EVAL_SET_VERSION} — ${out.rescoredAt}`, "", `Source record: ${path.basename(file)} (${record.evalSetVersion}). Model ${record.model}, SDK ${record.sdkVersion}, policy ${record.policyVersion}. Total spend $${record.totalCostUsd.toFixed(4)} across ${rescored.length} observations (1 repeat per cell).`, ""];
lines.push("| Effort | Case | v1 complete | v2 complete | Citations | Next action | Gaps | Unsupported | False approval | Cost | In/Out tokens | Latency | Tools | Repairs | Esc |");
lines.push("| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |");
for (const o of rescored) lines.push(`| ${o.effort} | ${o.case} | ${o.scoreV1.taskComplete ? "yes" : "no"} | ${o.score.taskComplete ? "yes" : "no"} | ${o.score.citationsResolve ? "pass" : "fail"} | ${o.score.nextActionCorrect ? "yes" : "no"} | ${o.score.requiredGapsCovered}/${o.score.requiredGapsTotal} | ${o.score.unsupportedNumericClaims} | ${o.score.falseApproval ? "YES" : "no"} | $${(o.costUsd ?? 0).toFixed(4)} | ${o.inputTokens}/${o.outputTokens} | ${(o.latencyMs / 1000).toFixed(1)}s | ${o.toolCalls} | ${o.repairs} | ${o.escalations} |`);
lines.push("");
for (const effort of record.efforts) {
  const obs = rescored.filter((o) => o.effort === effort);
  if (!obs.length) continue;
  const complete = obs.filter((o) => o.score.taskComplete).length;
  const cost = obs.reduce((n, o) => n + (o.costUsd ?? 0), 0);
  const lat = obs.map((o) => o.latencyMs / 1000);
  lines.push(`- **${effort}**: ${complete}/${obs.length} task-complete (v2) · ${obs.filter((o) => o.score.citationsResolve).length}/${obs.length} schema+citation pass · ${obs.filter((o) => o.score.nextActionCorrect).length}/${obs.length} correct next action · ${obs.reduce((n, o) => n + o.score.requiredGapsCovered, 0)}/${obs.reduce((n, o) => n + o.score.requiredGapsTotal, 0)} required gaps · ${obs.filter((o) => o.score.falseApproval).length} false approvals · ${obs.reduce((n, o) => n + o.score.unsupportedNumericClaims, 0)} unsupported numeric claims · total $${cost.toFixed(4)} · cost per task-complete ${complete ? `$${(cost / complete).toFixed(4)}` : "n/a"} · latency ${Math.min(...lat).toFixed(1)}–${Math.max(...lat).toFixed(1)}s`);
}
lines.push("", "Selection rule: lowest effort whose observations all pass the frozen gates. One repeat per cell: provisional, not statistical.");
fs.writeFileSync(target.replace(/\.json$/, ".md"), lines.join("\n"));
console.log(lines.join("\n"));

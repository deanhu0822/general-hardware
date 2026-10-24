/* eslint-disable @typescript-eslint/no-require-imports */
/**
 * Runtime effort evaluation on the frozen J12 cases.
 *
 * Runs the real Opus 5.5 adapter at each requested effort level on each frozen
 * case, scores the result with the reviewed answer keys (deterministic code,
 * not model self-assessment), and writes a JSON record plus a Markdown
 * summary under docs/handoff/evaluation/. Spending is bounded by a total
 * ceiling and the per-run policy budget. Usage:
 *
 *   node scripts/evaluate-effort.cjs --efforts low,medium,high --cases complete,missing --repeats 1 --ceiling 8
 */
const fs = require("node:fs");
const path = require("node:path");
require("../tests/_ts-loader.cjs");
const { EVAL_CASES, scorePacket, EVAL_SET_VERSION, evalSetDigest } = require("../lib/packets/eval-cases.ts");
const { createOpusRunner } = require("../lib/packets/opus-runner.ts");
const { policyConfig, requestedFromPolicy, selectEffort, POLICY_VERSION } = require("../lib/packets/policy.ts");

const args = Object.fromEntries(process.argv.slice(2).map((a, i, all) => (a.startsWith("--") ? [a.slice(2), all[i + 1] && !all[i + 1].startsWith("--") ? all[i + 1] : "true"] : [])).filter((x) => x.length));
const efforts = (args.efforts || "low,medium,high").split(",");
const caseIds = args.cases ? args.cases.split(",") : EVAL_CASES.map((c) => c.kind);
const repeats = Number(args.repeats || 1);
const ceiling = Number(args.ceiling || 6);
const perRun = Number(args["per-run"] || 1.5);
const outDir = path.resolve(__dirname, "../docs/handoff/evaluation");
fs.mkdirSync(outDir, { recursive: true });

(async () => {
  const policy = { ...policyConfig(process.env), orderBudgetUsd: perRun, maxEffort: "max" };
  const runner = createOpusRunner();
  const caps = await runner.capabilities();
  console.log(`model ${caps.model} → ${caps.resolvedModel}; supported effort ${caps.supportedEffortLevels.join("/")}; account ${JSON.stringify(caps.account)}`);
  for (const e of efforts) if (!caps.supportedEffortLevels.includes(e)) throw new Error(`effort ${e} is not supported by ${caps.resolvedModel}`);
  const startedAt = new Date().toISOString();
  const observations = [];
  let spent = 0;
  outer: for (const effort of efforts) {
    for (const kind of caseIds) {
      const c = EVAL_CASES.find((x) => x.kind === kind);
      if (!c) throw new Error(`unknown case ${kind}`);
      for (let rep = 1; rep <= repeats; rep++) {
        if (spent + perRun > ceiling) {
          console.log(`ceiling $${ceiling} would be exceeded (spent $${spent.toFixed(2)}); stopping before ${effort}/${kind}#${rep}`);
          break outer;
        }
        const requested = { ...requestedFromPolicy(policy), effort, maxBudgetUsd: perRun };
        const selection = { ...selectEffort({ ...policy, defaultEffort: effort, maxEffort: "max" }, c.frozen, caps.supportedEffortLevels), effort, reason: `evaluation: forced start effort ${effort}` };
        const events = [];
        const controller = new AbortController();
        const t0 = Date.now();
        const deadline = setTimeout(() => controller.abort(new Error("deadline")), requested.deadlineMs);
        let out = null;
        let error = null;
        try {
          out = await runner.generate({
            run: { id: `eval-${effort}-${kind}-${rep}`, requested },
            frozen: c.frozen,
            contents: c.contents,
            requested,
            selection,
            policy: { ...policy, defaultEffort: effort },
            supportedEffortLevels: caps.supportedEffortLevels,
            deadlineAt: t0 + requested.deadlineMs,
            signal: controller.signal,
            isCanceled: () => false,
            onEvent: (stage, detail) => events.push({ at: new Date().toISOString(), stage, detail }),
            onProgress: () => {},
          });
        } catch (err) {
          error = { kind: err.kind || "error", message: err.message };
        } finally {
          clearTimeout(deadline);
        }
        const latencyMs = Date.now() - t0;
        const phases = (out && out.effective.phases) || events.filter((e) => e.stage === "model-finished").map((e) => ({ note: e.detail }));
        const cost = out ? out.costUsd : sumCostFromEvents(events);
        spent += cost || 0;
        const score = scorePacket(out ? out.packetBody : null, c);
        const obs = { effort, case: kind, repeat: rep, ok: !!out, error, score, costUsd: cost, inputTokens: out ? out.inputTokens : null, outputTokens: out ? out.outputTokens : null, toolCalls: out ? out.toolCalls : null, repairs: out ? out.repairs : null, escalations: out ? out.effective.escalations : null, effectiveModel: out ? out.effective.model : null, effectiveEffort: out ? out.effective.effort : null, contextWindow: out ? out.effective.contextWindow : null, latencyMs, phases, events };
        observations.push(obs);
        console.log(`${effort}/${kind}#${rep}: ${out ? "ok" : `FAILED (${error.kind}: ${error.message.slice(0, 120)})`} · complete=${score.taskComplete} citations=${score.citationsResolve} next=${score.nextActionCorrect} gaps=${score.requiredGapsCovered}/${score.requiredGapsTotal} unsupported=${score.unsupportedNumericClaims} falseApproval=${score.falseApproval} · $${(cost ?? 0).toFixed(4)} · ${(latencyMs / 1000).toFixed(1)}s · tools ${obs.toolCalls} repairs ${obs.repairs} esc ${obs.escalations}`);
        if (out) fs.writeFileSync(path.join(outDir, `packet-${effort}-${kind}-${rep}.json`), JSON.stringify(out.packetBody, null, 2));
      }
    }
  }
  const record = { evalSetVersion: EVAL_SET_VERSION, evalSetDigest: evalSetDigest(), policyVersion: POLICY_VERSION, model: caps.resolvedModel, sdkVersion: caps.sdkVersion, account: caps.account, startedAt, finishedAt: new Date().toISOString(), efforts, cases: caseIds, repeats, ceilingUsd: ceiling, perRunBudgetUsd: perRun, totalCostUsd: spent, observations: observations.map(({ events, ...rest }) => ({ ...rest, eventCount: events.length })) };
  const stamp = startedAt.replace(/[:.]/g, "-");
  fs.writeFileSync(path.join(outDir, `effort-evaluation-${stamp}.json`), JSON.stringify(record, null, 2));
  fs.writeFileSync(path.join(outDir, `effort-evaluation-${stamp}.md`), summarize(record));
  console.log(`\nwrote ${path.join(outDir, `effort-evaluation-${stamp}.{json,md}`)} · total $${spent.toFixed(4)}`);
})().catch((e) => {
  console.error(e);
  process.exitCode = 1;
});

function sumCostFromEvents(events) {
  let c = 0;
  for (const e of events) {
    const m = /\$([0-9.]+)/.exec(e.detail);
    if (e.stage === "model-finished" && m) c += Number(m[1]);
  }
  return c || null;
}

function summarize(r) {
  const lines = [`# Runtime effort evaluation — ${r.startedAt}`, "", `Model ${r.model} via Claude Agent SDK ${r.sdkVersion} · policy ${r.policyVersion} · eval set ${r.evalSetVersion} (${r.evalSetDigest.slice(0, 12)}…) · per-run budget $${r.perRunBudgetUsd} · total spend $${r.totalCostUsd.toFixed(4)} · ${r.observations.length} observations (${r.repeats} repeat(s) per cell). Scored by deterministic code against reviewed answer keys; sample sizes are small, so individual observations are listed rather than percentiles.`, ""];
  lines.push("| Effort | Case | Rep | Completed | Schema+citations | Next action | Gaps | Unsupported | False approval | Cost | In/Out tokens | Latency | Tools | Repairs | Esc | Effective effort |");
  lines.push("| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |");
  for (const o of r.observations)
    lines.push(`| ${o.effort} | ${o.case} | ${o.repeat} | ${o.ok ? (o.score.taskComplete ? "yes" : "partial") : `no (${o.error.kind})`} | ${o.score.schemaValid ? "pass" : "fail"} | ${o.score.nextActionCorrect ? "yes" : "no"} | ${o.score.requiredGapsCovered}/${o.score.requiredGapsTotal} | ${o.score.unsupportedNumericClaims} | ${o.score.falseApproval ? "YES" : "no"} | ${o.costUsd === null ? "?" : `$${o.costUsd.toFixed(4)}`} | ${o.inputTokens ?? "?"}/${o.outputTokens ?? "?"} | ${(o.latencyMs / 1000).toFixed(1)}s | ${o.toolCalls ?? "?"} | ${o.repairs ?? "?"} | ${o.escalations ?? "?"} | ${o.effectiveEffort ?? "?"} |`);
  lines.push("");
  for (const effort of r.efforts) {
    const obs = r.observations.filter((o) => o.effort === effort);
    if (!obs.length) continue;
    const complete = obs.filter((o) => o.score.taskComplete).length;
    const cost = obs.reduce((n, o) => n + (o.costUsd ?? 0), 0);
    const lat = obs.map((o) => o.latencyMs / 1000);
    lines.push(`- **${effort}**: ${complete}/${obs.length} task-complete · ${obs.filter((o) => o.score.schemaValid).length}/${obs.length} schema+citation pass · ${obs.filter((o) => o.score.falseApproval).length} false approvals · ${obs.reduce((n, o) => n + o.score.unsupportedNumericClaims, 0)} unsupported numeric claims · ${obs.filter((o) => o.repairs).length} repairs · ${obs.filter((o) => o.escalations).length} escalations · total $${cost.toFixed(4)} (cost per task-complete packet ${complete ? `$${(cost / complete).toFixed(4)}` : "n/a"}) · latency range ${Math.min(...lat).toFixed(1)}–${Math.max(...lat).toFixed(1)}s`);
  }
  lines.push("", "Selection rule: the lowest effort whose observations all pass the frozen gates (schema and citations resolve, correct next action, all required gaps, zero unsupported numeric claims, zero false approvals) is the candidate default. With one repeat per cell this is a provisional measurement, not a statistical result.");
  return lines.join("\n");
}

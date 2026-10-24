/* eslint-disable @typescript-eslint/no-require-imports */
// Default is local validation and scheduling only. --smoke uses a labeled test
// double. Only --live with explicit ceilings can call the existing Opus SDK adapter.
const fs = require("node:fs");
const path = require("node:path");
require("../tests/_ts-loader.cjs");
const { SECTOR_CASES, validateSectorBenchmark, toSectorEvalCase, scoreSectorPacket, sectorRunPlan, sectorCoverageReport } = require("../lib/packets/sector-benchmark.ts");
const { policyConfig, requestedFromPolicy, selectEffort, rank } = require("../lib/packets/policy.ts");

function options(argv) {
  const out = {};
  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    if (["--smoke", "--live"].includes(arg)) { out[arg.slice(2)] = true; continue; }
    if (!["--efforts", "--repeats", "--split", "--ceiling", "--per-run", "--out"].includes(arg) || !argv[i + 1] || argv[i + 1].startsWith("--")) throw new Error(`Invalid option ${arg}`);
    out[arg.slice(2)] = argv[++i];
  }
  if (out.smoke && out.live) throw new Error("Choose smoke or live, not both");
  return out;
}
async function main() {
  const args = options(process.argv.slice(2));
  const integrity = validateSectorBenchmark();
  const modes = (args.efforts || "adaptive").split(",");
  const plan = sectorRunPlan(modes, Number(args.repeats || 2), args.split || "all");
  console.log(JSON.stringify({ ...integrity, plannedRuns: plan.length, mode: args.live ? "LIVE" : args.smoke ? "TEST DOUBLE" : "DRY RUN", coverage: sectorCoverageReport(plan, []).cells }, null, 2));
  if (!args.live && !args.smoke) return;
  let ceiling = 0, perRun = 0;
  if (args.live) {
    ceiling = Number(args.ceiling); perRun = Number(args["per-run"]);
    if (!Number.isFinite(ceiling) || !Number.isFinite(perRun) || ceiling <= 0 || perRun < 0.25 || perRun > 50 || ceiling < perRun) throw new Error("Live runs need explicit positive --ceiling and --per-run (0.25–50 USD)");
  }
  // Import runtime only after local checks and explicit mode selection. No answer keys
  // or expected results enter generate(); tools see only frozen input and sources.
  const runner = args.live ? require("../lib/packets/opus-runner.ts").createOpusRunner() : require("../lib/packets/test-double.ts").createTestDoubleRunner();
  const policy = policyConfig(process.env);
  const dir = path.resolve(args.out || path.join(__dirname, "../.forma/evaluation/sector", `${new Date().toISOString().replace(/[:.]/g, "-")}-${process.pid}`));
  fs.mkdirSync(dir, { recursive: true });
  const record = { benchmark: integrity, mode: args.live ? "live-opus" : "test-double", planned: plan, observations: [], status: "starting", reservedOrSpentUsd: 0, ceilingUsd: args.live ? ceiling : null, perRunBudgetUsd: args.live ? perRun : null, semanticReview: "pending", note: "Automated rubric only; keys require independent review. Test-double results are not model quality evidence." };
  const save = () => {
    record.coverageByMode = Object.fromEntries(modes.map((mode) => [mode, sectorCoverageReport(plan.filter((j) => j.mode === mode), record.observations.filter((o) => o.mode === mode))]));
    const temp = path.join(dir, 'results.tmp'); fs.writeFileSync(temp, JSON.stringify(record, null, 2)); fs.renameSync(temp, path.join(dir, 'results.json'));
  };
  save();
  const caps = await runner.capabilities();
  if (args.live && (!caps.resolvedModel || !/opus-5-5/.test(caps.resolvedModel))) throw new Error("Verified Opus 5.5 capability required");
  record.model = caps.resolvedModel; record.sdkVersion = caps.sdkVersion;
  for (const job of plan) {
    const c = SECTOR_CASES.find((x) => x.id === job.caseId), e = toSectorEvalCase(c);
    const fixed = job.mode !== "adaptive";
    const runPolicy = { ...policy, ...(args.live ? { orderBudgetUsd: perRun } : {}), ...(fixed ? { defaultEffort: job.mode, maxEffort: rank(job.mode) > rank(policy.maxEffort) ? job.mode : policy.maxEffort } : {}) };
    let selection = selectEffort(runPolicy, e.frozen, caps.supportedEffortLevels);
    if (fixed) {
      if (!caps.supportedEffortLevels.includes(job.mode)) throw new Error(`Unsupported effort ${job.mode}`);
      selection = { ...selection, effort: job.mode, complexityStepUp: false, reason: `benchmark forced start: ${job.mode}; repairs remain bounded by runtime policy` };
    }
    const requested = { ...requestedFromPolicy(runPolicy), effort: selection.effort };
    if (args.live && record.reservedOrSpentUsd + perRun > ceiling + 1e-9) { record.status = "budget-stopped"; break; }
    const before = record.reservedOrSpentUsd;
    if (args.live) record.reservedOrSpentUsd += perRun;
    record.status = "running"; record.active = job; save();
    const controller = new AbortController(), start = Date.now(), deadlineAt = start + requested.deadlineMs;
    const timer = setTimeout(() => controller.abort(new Error("deadline")), requested.deadlineMs);
    let output = null, error = null;
    try {
      output = await runner.generate({ run: { id: `${c.id}-${job.mode}-${job.repeat}`, requested }, frozen: e.frozen, contents: e.contents, requested, selection, policy: runPolicy, supportedEffortLevels: caps.supportedEffortLevels, deadlineAt, signal: controller.signal, isCanceled: () => controller.signal.aborted, onEvent: () => {}, onProgress: () => {} });
    } catch (err) { error = { kind: err.kind || "error", message: String(err.message).slice(0, 600) }; }
    finally { clearTimeout(timer); }
    const cost = output && Number.isFinite(output.costUsd) && output.costUsd >= 0 ? output.costUsd : null;
    // Unknown usage retains the whole reservation and stops further live dispatch.
    if (args.live && cost !== null) record.reservedOrSpentUsd = before + cost;
    const score = scoreSectorPacket(output ? output.packetBody : null, c);
    const observation = { ...job, origin: runner.origin, automatedPass: score.automatedPass, schemaValid: score.schemaValid, score, error, costUsd: args.smoke ? 0 : cost, latencyMs: Date.now() - start, inputTokens: output?.inputTokens ?? null, outputTokens: output?.outputTokens ?? null, toolCalls: output?.toolCalls ?? null, repairs: output?.repairs ?? 0, escalations: output?.effective.escalations ?? 0, effective: output?.effective ?? null, manifestDigest: e.frozen.manifestDigest };
    record.observations.push(observation); delete record.active;
    if (output) fs.writeFileSync(path.join(dir, `${c.id}-${job.mode}-${job.repeat}.json`), JSON.stringify({ origin: runner.origin, manifestDigest: e.frozen.manifestDigest, packet: output.packetBody }, null, 2));
    save();
    console.log(`${c.id}/${job.mode}#${job.repeat}: schema=${score.schemaValid} automated=${score.automatedPass} origin=${runner.origin}`);
    if (args.live && (cost === null || error || record.reservedOrSpentUsd > ceiling || cost > perRun)) { record.status = "stopped-reconcile-usage"; break; }
  }
  if (record.observations.length === plan.length) record.status = "completed";
  save();
  console.log(`Saved ${record.observations.length}/${plan.length} observations to ${dir}/results.json. ${record.status}. Independent semantic review remains pending.`);
  if (args.smoke && record.observations.some((o) => o.error || !o.schemaValid)) process.exitCode = 1;
}
main().catch((err) => { console.error(err.message); process.exitCode = 1; });

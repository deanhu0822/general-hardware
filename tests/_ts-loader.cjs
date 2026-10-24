/* eslint-disable @typescript-eslint/no-require-imports -- Shared CommonJS loader so node:test can exercise the TypeScript domain with "@/" aliases. */
const fs = require("node:fs");
const path = require("node:path");
const ts = require("typescript");
const root = path.resolve(__dirname, "..");
require.extensions[".ts"] = (module, filename) => {
  const source = fs.readFileSync(filename, "utf8").replace(/(['"])@\//g, `$1${root}/`);
  module._compile(
    ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, esModuleInterop: true } }).outputText,
    filename,
  );
};
const { ChangeStore } = require("../lib/changes/store.ts");
const { PacketStore } = require("../lib/packets/store.ts");
/** In-memory stores with two customers, an owner and an engineering reviewer. */
function stores(t) {
  const changes = new ChangeStore(":memory:");
  const store = new PacketStore(changes);
  t.after(() => changes.db.close());
  const owner = changes.addUser("Owner", "owner@example.test", "owner-test-password", "owner");
  const reviewer = changes.addUser("Reviewer", "reviewer@example.test", "reviewer-test-password", "reviewer");
  const alice = store.registerCustomer("Alice", "alice@example.test", "alice-test-password");
  const bob = store.registerCustomer("Bob", "bob@example.test", "bob-test-password");
  return { changes, store, owner, reviewer, alice, bob };
}
const { fixtureBrief, fixtureSources, fixtureFrozen } = require("../lib/packets/fixture.ts");
const { requestedFromPolicy, policyConfig } = require("../lib/packets/policy.ts");
const policyEnv = (over = {}) => ({ CAID_RUNTIME_MODEL: "claude-opus-5-5", CAID_RUNTIME_DEFAULT_EFFORT: "medium", CAID_RUNTIME_MAX_EFFORT: "high", CAID_RUN_BUDGET_USD: "3", CAID_RUN_MIN_RESERVE_USD: "0.25", CAID_RUN_MAX_TOOL_CALLS: "12", CAID_RUN_DEADLINE_MS: "600000", ...over });
const requestedSettings = () => requestedFromPolicy(policyConfig(policyEnv()));
const payment = (id = "pay_1") => ({ paymentId: id, paidAt: new Date().toISOString(), companyId: "biz_test", planId: null, productId: null });
/** A draft request carrying the three synthetic fixture sources. */
function draft(store, customer) {
  const r = store.createRequest(customer, fixtureBrief);
  for (const s of fixtureSources) store.addSource(customer, r.id, { name: s.name, revision: s.revision, content: s.content });
  return r;
}
/** Frozen, ordered, paid and queued. */
function paidOrder(store, customer) {
  const r = draft(store, customer);
  const frozen = store.freeze(customer, r.id);
  const order = store.createOrder(customer, frozen, { id: "j12", amount: "29.00", currency: "usd" }, true, "simulated");
  const { run } = store.markPaid(order.id, payment(), requestedSettings(), 1);
  return { r, frozen, order, run };
}
/** Map the fixture packet onto a store-frozen copy of the same sources (ids S1..S3), as a real (non-synthetic) request. */
function rebind(body, frozen) {
  const idMap = new Map(fixtureFrozen.sources.map((s, i) => [s.sourceId, frozen.sources[i].sourceId]));
  const p = JSON.parse(JSON.stringify(body));
  const mapCites = (cs) => cs.forEach((c) => (c.sourceId = idMap.get(c.sourceId)));
  p.sourceRegister = p.sourceRegister.map((e, i) => ({ ...e, sourceId: frozen.sources[i].sourceId, name: frozen.sources[i].name, revision: frozen.sources[i].revision, sha256: frozen.sources[i].sha256, bytes: frozen.sources[i].bytes, importedAt: frozen.sources[i].importedAt, anchors: e.anchors.map((a) => ({ ...a, sourceId: frozen.sources[i].sourceId })) }));
  p.knownFacts.forEach((f) => {
    mapCites(f.citations);
    if (f.kind === "synthetic fixture") f.kind = "source statement";
  });
  p.alternatives.forEach((a) => mapCites(a.citations));
  p.affectedArtifacts.forEach((a) => mapCites(a.citations));
  p.evidenceGaps.forEach((g) => mapCites(g.citations));
  mapCites(p.nextAction.citations);
  return p;
}
/** Valid engineering change content (mirrors the original workflow test fixture). */
const changeContent = (reviewerIds) => ({
  title: "Increase payload",
  request: "Baseline document rover-C, section 2. Support 10.4 kg at 5 degrees for 30 minutes.",
  requirements: [{ id: "payload", statement: "Payload capacity", operator: ">=", target: 10.4, unit: "kg", conditions: "5 degree slope; 30 minute duty cycle" }],
  alternatives: [
    { id: "motor", title: "Upgrade motor", approach: "Larger motor", tradeoffs: "More current and weight", artifacts: [{ id: "MOTOR", before: "M1", after: "M2" }] },
    { id: "keep", title: "Keep baseline", approach: "Reduce slope", tradeoffs: "Does not meet original slope target", artifacts: [] },
  ],
  selectedAlternative: "motor",
  selectionReason: "Accept higher current after electrical review.",
  evidence: [],
  reviewerIds,
});
module.exports = { root, stores, policyEnv, requestedSettings, payment, draft, paidOrder, rebind, changeContent };

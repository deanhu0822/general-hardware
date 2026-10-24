/**
 * HTTP verification of the paid-order path against a production `next start`.
 *
 * Uses the labeled simulated payment provider and the labeled test-double
 * runner so no money and no model budget are spent. Everything else is the
 * real server: cookies, origin checks, customer isolation, webhook signature
 * verification, deduplication, worker leases, publication, download,
 * clarification and revocation. Run after `npm run build`.
 */
import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createServer } from "node:net";
import { randomBytes } from "node:crypto";

const dir = await mkdtemp(join(tmpdir(), "caid-packets-http-"));
const socket = createServer();
await new Promise((resolve) => socket.listen(0, "127.0.0.1", resolve));
const port = socket.address().port;
await new Promise((resolve) => socket.close(resolve));
const origin = `http://127.0.0.1:${port}`;
const setupToken = randomBytes(32).toString("hex");
const server = spawn(process.execPath, ["node_modules/next/dist/bin/next", "start", "--hostname", "127.0.0.1", "--port", String(port)], {
  env: {
    ...process.env,
    VERCEL: "",
    NODE_ENV: "production",
    FORMA_CHANGE_DB: join(dir, "test.sqlite"),
    FORMA_CHANGE_SETUP_TOKEN: setupToken,
    FORMA_CHANGE_ORIGIN: origin,
    CAID_ORIGIN: origin,
    CAID_PAYMENTS_PROVIDER: "simulated",
    CAID_ALLOW_SIMULATED_PAYMENTS: "true",
    CAID_SIMULATED_WEBHOOK_SECRET: randomBytes(24).toString("hex"),
    CAID_RUNNER: "test-double",
    CAID_ALLOW_TEST_DOUBLE: "true",
    CAID_WORKER: "on",
  },
  stdio: ["ignore", "pipe", "pipe"],
});
let log = "";
for (const stream of [server.stdout, server.stderr]) stream.on("data", (d) => (log = (log + d).slice(-12000)));

const jar = new Map();
async function call(path, { method, json, cookie = "", headers = {}, raw = false, customOrigin = origin } = {}) {
  const res = await fetch(`${origin}${path}`, {
    method: method ?? (json !== undefined ? "POST" : "GET"),
    headers: { ...(json !== undefined ? { "Content-Type": "application/json", Origin: customOrigin } : {}), ...(method && method !== "GET" ? { Origin: customOrigin } : {}), Cookie: cookie, ...headers },
    body: json !== undefined ? JSON.stringify(json) : undefined,
  });
  const text = await res.text();
  const setCookie = res.headers.get("set-cookie")?.split(";")[0];
  let data = text;
  if (!raw) {
    try {
      data = JSON.parse(text);
    } catch {
      data = { raw: text.slice(0, 200) };
    }
  }
  return { status: res.status, data, cookie: setCookie, headers: res.headers };
}
const results = [];
const check = (name, ok, detail = "") => {
  results.push({ name, ok, detail });
  if (!ok) throw new Error(`${name} failed ${detail}`);
};

try {
  let ready = false;
  for (let i = 0; i < 90; i++) {
    try {
      const r = await fetch(`${origin}/api/packets/sample`);
      if (r.ok) {
        ready = true;
        break;
      }
    } catch {
      /* booting */
    }
    await new Promise((r) => setTimeout(r, 500));
  }
  assert.ok(ready, `server did not start:\n${log}`);

  // Public sample needs no credentials.
  const sample = await call("/api/packets/sample");
  check("public synthetic sample is served", sample.status === 200 && sample.data.synthetic === true && sample.data.packet.receipt.origin === "synthetic-fixture");
  const sampleMd = await call("/api/packets/sample?format=markdown", { raw: true });
  check("sample Markdown download", sampleMd.status === 200 && /SYNTHETIC SAMPLE/.test(sampleMd.data));

  // Unauthenticated access is refused everywhere that touches real data.
  check("unauthenticated request list → 401", (await call("/api/packets/requests")).status === 401);
  check("unauthenticated my packets → 401", (await call("/api/packets/mine")).status === 401);
  check("unauthenticated ops → 401", (await call("/api/packets/ops")).status === 401);

  // The engineering owner is created first through the original setup-token path (only possible while no users exist).
  const setup = await call("/api/changes", { json: { action: "setup", setupToken, name: "Owner", email: "owner@example.test", password: "owner-password-1234" } });
  check("owner account created through the original setup token path", setup.status === 200, JSON.stringify(setup.data));

  // Register two customers; cross-origin POST is refused.
  const bad = await call("/api/packets/auth", { json: { action: "register", name: "X", email: "x@example.test", password: "x-password-12345" }, customOrigin: "https://evil.example" });
  check("cross-origin POST is rejected", bad.status === 403);
  const alice = await call("/api/packets/auth", { json: { action: "register", name: "Alice", email: "alice@example.test", password: "alice-password-123" } });
  check("customer registration", alice.status === 201 && alice.data.user.role === "customer" && alice.cookie);
  jar.set("alice", alice.cookie);
  const bob = await call("/api/packets/auth", { json: { action: "register", name: "Bob", email: "bob@example.test", password: "bob-password-12345" } });
  jar.set("bob", bob.cookie);
  check("customer cannot read owner ops", (await call("/api/packets/ops", { cookie: jar.get("alice") })).status === 403);
  check("customer cannot reach the engineering workspace", (await call("/api/changes", { cookie: jar.get("alice") })).data.user === null);

  // Alice drafts a request with the fixture sources.
  const fixture = sample.data;
  const created = await call("/api/packets/requests", { cookie: jar.get("alice"), json: { brief: fixture.frozen.brief } });
  check("draft request created", created.status === 201);
  const reqId = created.data.request.id;
  for (const s of fixture.sources) {
    const added = await call(`/api/packets/requests/${reqId}/sources`, { cookie: jar.get("alice"), json: { name: s.name, revision: s.revision, content: s.content } });
    check(`source ${s.sourceId} added`, added.status === 201 && added.data.source.sha256 === s.sha256 && !("content" in added.data.source));
  }
  const detail = await call(`/api/packets/requests/${reqId}`, { cookie: jar.get("alice") });
  check("preflight passes with brief + sources", detail.data.preflight.ok === true && detail.data.payments.kind === "simulated");
  check("bob cannot read alice's request", (await call(`/api/packets/requests/${reqId}`, { cookie: jar.get("bob") })).status === 404);
  check("bob cannot read alice's source", (await call(`/api/packets/requests/${reqId}/sources/S1`, { cookie: jar.get("bob") })).status === 404);
  check("unreadable source is rejected", (await call(`/api/packets/requests/${reqId}/sources`, { cookie: jar.get("alice"), json: { name: "bin", content: "\u0000\u0001\u0002\u0003\u0004\u0005\u0006\u0007\u0008" } })).status === 400);

  // Order: frozen + checkout pending; nothing fulfilled by returning from checkout.
  const ordered = await call(`/api/packets/requests/${reqId}/order`, { cookie: jar.get("alice"), json: {} });
  check("order created in checkout_pending", ordered.status === 201 && ordered.data.order.status === "checkout_pending" && ordered.data.order.provider === "simulated" && ordered.data.checkoutUrl.startsWith("/checkout/simulated/"));
  const orderId = ordered.data.order.id;
  check("request is frozen after ordering", (await call(`/api/packets/requests/${reqId}`, { cookie: jar.get("alice"), method: "PATCH", json: { brief: { ...fixture.frozen.brief, title: "late edit" } } })).status === 409);
  check("ordering twice returns the same open order", (await call(`/api/packets/requests/${reqId}/order`, { cookie: jar.get("alice"), json: {} })).data.order.id === orderId);
  check("packet unavailable before payment → 403 unpaid", (await call(`/api/packets/orders/${orderId}/packet`, { cookie: jar.get("alice") })).data.code === "unpaid");
  check("download unavailable before payment → 403", (await call(`/api/packets/orders/${orderId}/download`, { cookie: jar.get("alice") })).status === 403);

  // Forged webhook → rejected; order still pending.
  const forged = await call("/api/packets/checkout/simulated", { cookie: jar.get("alice"), json: { orderId, action: "forge" } });
  check("forged webhook rejected", forged.data.outcome.status === 400 && forged.data.order.status === "checkout_pending");
  check("bob cannot act on alice's checkout", (await call("/api/packets/checkout/simulated", { cookie: jar.get("bob"), json: { orderId, action: "pay" } })).status === 404);
  const pending = await call("/api/packets/checkout/simulated", { cookie: jar.get("alice"), json: { orderId, action: "pending" } });
  check("pending provider state does not fulfil", /pending/.test(pending.data.outcome.result) && pending.data.order.status === "checkout_pending");

  // Pay → verified webhook → run queued → worker (test double) publishes.
  const paid = await call("/api/packets/checkout/simulated", { cookie: jar.get("alice"), json: { orderId, action: "pay" } });
  check("verified payment queues exactly one run", /paid: run .* queued/.test(paid.data.outcome.result) && paid.data.order.status === "paid");
  const replay = await call("/api/packets/checkout/simulated", { cookie: jar.get("alice"), json: { orderId, action: "replay" } });
  check("replayed event is deduplicated", /duplicate/.test(replay.data.outcome.result));
  let status;
  for (let i = 0; i < 60; i++) {
    status = await call(`/api/packets/orders/${orderId}?after=0`, { cookie: jar.get("alice") });
    if (status.data.packetReady) break;
    await new Promise((r) => setTimeout(r, 500));
  }
  check("worker published the packet", status.data.packetReady === true && status.data.run.status === "ready", JSON.stringify(status.data.run));
  const stages = status.data.events.map((e) => e.stage);
  check("persisted stage events include policy selection and validation", ["queued", "running", "policy-selected", "validated", "ready"].every((s) => stages.includes(s)), stages.join(","));
  check("exactly one run exists", status.data.run.attempt === 1);

  const packet = await call(`/api/packets/orders/${orderId}/packet`, { cookie: jar.get("alice") });
  check("alice reads her packet", packet.status === 200 && packet.data.packet.receipt.origin === "test-double" && packet.data.packet.receipt.requested.policyVersion);
  check("bob cannot read alice's packet", (await call(`/api/packets/orders/${orderId}/packet`, { cookie: jar.get("bob") })).status === 404);
  check("bob cannot download alice's packet", (await call(`/api/packets/orders/${orderId}/download`, { cookie: jar.get("bob") })).status === 404);
  check("unauthenticated download → 401", (await call(`/api/packets/orders/${orderId}/download`)).status === 401);
  const md = await call(`/api/packets/orders/${orderId}/download`, { cookie: jar.get("alice"), raw: true });
  check("alice downloads Markdown", md.status === 200 && /text\/markdown/.test(md.headers.get("content-type")) && /TEST DOUBLE OUTPUT/.test(md.data) && /Packet ready — advisory preparation. Not engineering approval/.test(md.data));
  const src = await call(`/api/packets/orders/${orderId}/sources/S1`, { cookie: jar.get("alice") });
  check("frozen source text is served to the owner only", src.status === 200 && src.data.source.content.length > 0 && (await call(`/api/packets/orders/${orderId}/sources/S1`, { cookie: jar.get("bob") })).status === 404);
  const clar = await call(`/api/packets/orders/${orderId}/clarifications`, { cookie: jar.get("alice"), json: { question: "What evidence is missing?" } });
  check("bounded clarification answered and recorded", clar.status === 201 && clar.data.clarifications[0].status === "answered");
  check("second clarification refused by the limit", (await call(`/api/packets/orders/${orderId}/clarifications`, { cookie: jar.get("alice"), json: { question: "Another?" } })).data.code === "limit");
  check("retry refused after delivery", (await call(`/api/packets/orders/${orderId}`, { cookie: jar.get("alice"), json: { action: "retry" } })).data.code === "delivered");
  const mine = await call("/api/packets/mine", { cookie: jar.get("alice") });
  check("my packets lists the delivered order", mine.data.items.length === 1 && mine.data.items[0].runStatus === "ready");

  // Refund → access revoked; packet stays stored but is unreadable.
  const refund = await call("/api/packets/checkout/simulated", { cookie: jar.get("alice"), json: { orderId, action: "refund" } });
  check("refund revokes access", /access revoked/.test(refund.data.outcome.result) && refund.data.order.status === "refunded");
  check("revoked packet → 403 revoked", (await call(`/api/packets/orders/${orderId}/packet`, { cookie: jar.get("alice") })).data.code === "revoked");
  check("revoked download → 403", (await call(`/api/packets/orders/${orderId}/download`, { cookie: jar.get("alice") })).status === 403);
  check("revoked clarification → 403", (await call(`/api/packets/orders/${orderId}/clarifications`, { cookie: jar.get("alice"), json: { question: "x" } })).status === 403);

  // Owner view through the packet product's own session.
  const ownerLogin = await call("/api/packets/auth", { json: { action: "login", email: "owner@example.test", password: "owner-password-1234" } });
  const ops = await call("/api/packets/ops", { cookie: ownerLogin.cookie });
  check("owner operations report simulated orders separately from live", ops.status === 200 && ops.data.operations.orders.simulated === 1 && ops.data.operations.orders.live === 0 && ops.data.runner.kind === "test-double" && ops.data.worker.running === true);
  const ownerReq = await call(`/api/packets/requests`, { cookie: ownerLogin.cookie, json: { brief: fixture.frozen.brief } });
  await call(`/api/packets/requests/${ownerReq.data.request.id}/sources`, { cookie: ownerLogin.cookie, json: { name: "n", content: fixture.sources[0].content } });
  check("engineering accounts cannot buy packets without the explicit flag", (await call(`/api/packets/requests/${ownerReq.data.request.id}/order`, { cookie: ownerLogin.cookie, json: {} })).data.code === "role");
  const research = await call("/api/research/studies", { cookie: ownerLogin.cookie, json: { action: "create", round: "A", presentation: "A" } });
  check("owner can prepare a study record", research.status === 201 && research.data.study.status === "prepared");
  const studyId = research.data.study.id;
  const pub = await call(`/api/research/participate?study=${studyId}`);
  check("participant page definition is public and has no answer key", pub.status === 200 && !JSON.stringify(pub.data).includes('"correct"'));
  const start = await call("/api/research/participate", { json: { action: "start", studyId, teracSubmissionId: null } });
  check("preview response is recorded as preview", start.data.response.provenance === "preview");
  check("customer cannot read research", (await call("/api/research/studies", { cookie: jar.get("alice") })).status === 403);

  // Restart persistence: the same database must serve the delivered packet record after a restart.
  server.kill("SIGTERM");
  await new Promise((r) => server.on("exit", r));
  const server2 = spawn(process.execPath, ["node_modules/next/dist/bin/next", "start", "--hostname", "127.0.0.1", "--port", String(port)], { env: { ...process.env, VERCEL: "", NODE_ENV: "production", FORMA_CHANGE_DB: join(dir, "test.sqlite"), FORMA_CHANGE_ORIGIN: origin, CAID_ORIGIN: origin, CAID_PAYMENTS_PROVIDER: "simulated", CAID_ALLOW_SIMULATED_PAYMENTS: "true", CAID_SIMULATED_WEBHOOK_SECRET: "restart-does-not-matter-here", CAID_RUNNER: "test-double", CAID_ALLOW_TEST_DOUBLE: "true", CAID_WORKER: "off" }, stdio: ["ignore", "pipe", "pipe"] });
  try {
    let up = false;
    for (let i = 0; i < 90; i++) {
      try {
        if ((await fetch(`${origin}/api/packets/sample`)).ok) {
          up = true;
          break;
        }
      } catch {
        /* booting */
      }
      await new Promise((r) => setTimeout(r, 500));
    }
    assert.ok(up, "server did not restart");
    const relogin = await call("/api/packets/auth", { json: { action: "login", email: "alice@example.test", password: "alice-password-123" } });
    const after = await call(`/api/packets/orders/${orderId}`, { cookie: relogin.cookie });
    check("order, run and revocation persist across restart", after.status === 200 && after.data.order.status === "refunded" && after.data.run.status === "ready" && after.data.packetReady === true && after.data.worker.running === false);
  } finally {
    server2.kill("SIGTERM");
    await new Promise((r) => server2.on("exit", r));
  }

  console.log(`PASS ${results.length} HTTP checks`);
  for (const r of results) console.log(`  ✓ ${r.name}`);
} catch (error) {
  console.error("FAILED:", error.message);
  for (const r of results) console.log(`  ${r.ok ? "✓" : "✗"} ${r.name} ${r.detail}`);
  console.error(log.slice(-4000));
  process.exitCode = 1;
} finally {
  if (server.exitCode === null) server.kill("SIGTERM");
  await rm(dir, { recursive: true, force: true });
}

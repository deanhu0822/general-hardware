import { workerLoop } from "./runner";
import { services, type WorkerStatus } from "./service";

/**
 * The worker claims queued runs with leases, so a second process (or a
 * restart) recovers abandoned work without duplicate publication. It is
 * disabled with CAID_WORKER=off, on Vercel (no durable disk), and whenever the
 * durable store is unavailable; the reason is reported to the owner view.
 */
export async function startWorker() {
  const off = (reason: string): WorkerStatus => ({ running: false, owner: null, startedAt: null, runner: "none", reason });
  if (process.env.CAID_WORKER === "off") {
    globalThis.__caidWorker = off("CAID_WORKER=off: no worker in this process.");
    return;
  }
  if (process.env.VERCEL) {
    globalThis.__caidWorker = off("Serverless deployment: the durable worker does not run here.");
    return;
  }
  let svc: ReturnType<typeof services>;
  try {
    svc = services();
  } catch (error) {
    globalThis.__caidWorker = off(`Storage unavailable: ${error instanceof Error ? error.message : String(error)}`);
    return;
  }
  if (!svc.runner.runner) {
    globalThis.__caidWorker = off(svc.runner.reason);
    return;
  }
  const owner = `worker-${process.pid}-${Math.random().toString(36).slice(2, 8)}`;
  const controller = new AbortController();
  globalThis.__caidWorker = { running: true, owner, startedAt: new Date().toISOString(), runner: svc.runner.kind, reason: svc.runner.reason };
  for (const signal of ["SIGINT", "SIGTERM"] as const) process.once(signal, () => controller.abort());
  void workerLoop(svc.store, svc.runner.runner, owner, controller.signal).catch((error) => {
    console.error("[packet-worker] loop ended", error);
    globalThis.__caidWorker = off(`Worker stopped: ${error instanceof Error ? error.message : String(error)}`);
  });
  console.log(`[packet-worker] ${owner} started with runner ${svc.runner.kind}: ${svc.runner.reason}`);
}

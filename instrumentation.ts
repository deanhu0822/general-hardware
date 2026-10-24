/**
 * Starts the single-host packet worker inside the Node server process.
 * Node-only code lives in lib/packets/worker-start.ts and is imported only
 * after the runtime check so the Edge bundle never sees it.
 */
export async function register() {
  if (process.env.NEXT_RUNTIME !== "nodejs") return;
  const { startWorker } = await import("@/lib/packets/worker-start");
  await startWorker();
}

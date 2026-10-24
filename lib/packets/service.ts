import { researchStore, ResearchStore } from "@/lib/research/store";
import { currentOffer, PacketError, type Offer } from "./model";
import { createOpusRunner } from "./opus-runner";
import { policyConfig, type PolicyConfig } from "./policy";
import type { PacketRunner } from "./runner";
import { packetStore, type PacketStore } from "./store";
import { createTestDoubleRunner } from "./test-double";
import { selectPaymentProvider, type ProviderSelection } from "./whop";

/**
 * Composition root for the packet business. Everything is lazy so the offer
 * and sample pages work without storage or credentials, and every selection
 * is reported honestly (no silent fallback).
 */
export type RunnerSelection = { kind: "opus" | "test-double" | "none"; runner: PacketRunner | null; reason: string };

export function selectRunner(env = process.env): RunnerSelection {
  const wanted = (env.CAID_RUNNER || "opus").toLowerCase();
  if (wanted === "test-double") {
    if (env.NODE_ENV === "production" && env.CAID_ALLOW_TEST_DOUBLE !== "true")
      return { kind: "none", runner: null, reason: "The test-double runner is disabled in production unless CAID_ALLOW_TEST_DOUBLE=true is set explicitly." };
    return { kind: "test-double", runner: createTestDoubleRunner(), reason: "Deterministic test double for automated verification. No model runs; every packet is labeled test-double." };
  }
  if (wanted !== "opus") return { kind: "none", runner: null, reason: `Unknown CAID_RUNNER "${wanted}". Use opus or test-double.` };
  return { kind: "opus", runner: createOpusRunner(), reason: "Claude Opus 5.5 through the pinned Claude Agent SDK under the versioned effort policy." };
}

export type Services = {
  store: PacketStore;
  research: ResearchStore;
  offer: Offer;
  policy: PolicyConfig;
  runner: RunnerSelection;
  payments: () => Promise<ProviderSelection>;
};

let paymentsCache: Promise<ProviderSelection> | null = null;

export function services(): Services {
  const store = packetStore();
  return {
    store,
    research: researchStore(store),
    offer: currentOffer(),
    policy: policyConfig(),
    runner: selectRunner(),
    payments: () => (paymentsCache ??= selectPaymentProvider(store)),
  };
}

/** For tests and scripts that construct an isolated store. */
export function servicesFor(store: PacketStore, env = process.env): Services {
  return {
    store,
    research: new ResearchStore(store),
    offer: currentOffer(env),
    policy: policyConfig(env),
    runner: selectRunner(env),
    payments: () => selectPaymentProvider(store, env),
  };
}

export function requireRunner(selection: RunnerSelection): PacketRunner {
  if (!selection.runner) throw new PacketError(selection.reason, 503, "runner-unavailable");
  return selection.runner;
}

/** Worker status recorded by instrumentation.ts for the owner operations view. */
export type WorkerStatus = { running: boolean; owner: string | null; startedAt: string | null; runner: RunnerSelection["kind"]; reason: string };
declare global {
  var __caidWorker: WorkerStatus | undefined;
}
export function workerStatus(): WorkerStatus {
  return globalThis.__caidWorker ?? { running: false, owner: null, startedAt: null, runner: "none", reason: "The in-process worker has not started in this server process." };
}

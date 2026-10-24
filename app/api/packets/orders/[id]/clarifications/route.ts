import type { NextRequest } from "next/server";
import { checkOrigin, failure, json, readJson, requireUser, text } from "@/lib/packets/http";
import { PacketError } from "@/lib/packets/model";
import { RunnerError } from "@/lib/packets/runner";
import { requireRunner, services } from "@/lib/packets/service";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 300;

export async function GET(request: NextRequest, ctx: RouteContext<"/api/packets/orders/[id]/clarifications">) {
  try {
    const { id } = await ctx.params;
    const { store } = services();
    const user = requireUser(request, store);
    return json({ clarifications: store.clarifications(user, id) });
  } catch (error) {
    return failure(error);
  }
}

/**
 * Ask the one bounded clarification. The slot is reserved atomically before
 * the model runs and released again if the provider fails, so a failure never
 * consumes the customer's entitlement. The answer is bound to the delivered
 * packet version and its frozen sources only.
 */
export async function POST(request: NextRequest, ctx: RouteContext<"/api/packets/orders/[id]/clarifications">) {
  try {
    checkOrigin(request);
    const { id } = await ctx.params;
    const { store, policy, runner: runnerSelection } = services();
    const user = requireUser(request, store);
    const data = await readJson(request, 8_000);
    const question = text("Question", data.question, 1000);
    const runner = requireRunner(runnerSelection);
    const opened = store.openClarification(user, id, question);
    const { order } = store.requireActiveEntitlement(user, id);
    const record = store.packet(user, id);
    const frozen = store.frozen(order.requestId, order.requestVersion);
    const contents = store.frozenContents(frozen);
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(new RunnerError("Clarification exceeded four minutes.", "deadline")), 240_000);
    try {
      const out = await runner.clarify({ frozen, contents, packet: record.packet, question, requested: record.packet.receipt.requested ?? { provider: "anthropic-agent-sdk", model: policy.model, effort: policy.defaultEffort, contextWindow: 0, maxTurns: 12, maxToolCalls: 8, maxBudgetUsd: 1, deadlineMs: 240_000, repairAttempts: 0, policyVersion: policy.version }, policy, signal: controller.signal });
      store.answerClarification(opened.id, out.answer, out.citations, {
        origin: runner.origin,
        effective: out.effective,
        costUsd: out.costUsd,
        inputTokens: out.inputTokens,
        outputTokens: out.outputTokens,
        toolCalls: out.toolCalls,
        latencyMs: out.latencyMs,
        packetId: record.id,
        packetVersion: record.version,
        manifestDigest: frozen.manifestDigest,
      });
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      store.failClarification(opened.id, message);
      throw new PacketError(`The clarification could not be answered (${message}). Your clarification entitlement was not consumed.`, 502, "clarification-failed");
    } finally {
      clearTimeout(timer);
    }
    return json({ clarifications: store.clarifications(user, id) }, 201);
  } catch (error) {
    return failure(error);
  }
}

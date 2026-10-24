import type { NextRequest } from "next/server";
import { checkOrigin, failure, json, readJson, requireUser } from "@/lib/packets/http";
import { PacketError } from "@/lib/packets/model";
import { remainingOrderBudget } from "@/lib/packets/policy";
import { nextAttemptSettings } from "@/lib/packets/runner";
import { services, workerStatus } from "@/lib/packets/service";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * Order status for polling: commerce state, entitlement, latest run, persisted
 * stage events after a cursor, and whether a packet is ready. Never derived
 * from a redirect or client flag; every value comes from the store.
 */
export async function GET(request: NextRequest, ctx: RouteContext<"/api/packets/orders/[id]">) {
  try {
    const { id } = await ctx.params;
    const { store, policy } = services();
    const user = requireUser(request, store);
    const order = store.order(user, id);
    const entitlement = store.entitlement(user, id) ?? null;
    const run = store.latestRun(id) ?? null;
    const after = Number(request.nextUrl.searchParams.get("after") || 0) || 0;
    const events = run ? store.events(run.id, after) : [];
    const packet = store.packetForOrder(id);
    const spent = store.orderSpendUsd(id);
    return json({
      order,
      entitlement: entitlement ? { active: entitlement.active, clarificationLimit: entitlement.clarificationLimit, clarificationsUsed: entitlement.clarificationsUsed, revokedAt: entitlement.revokedAt } : null,
      run: run ? { id: run.id, attempt: run.attempt, status: run.status, cancelRequested: run.cancelRequested, startedAt: run.startedAt, finishedAt: run.finishedAt, error: run.error, costUsd: run.costUsd, toolCalls: run.toolCalls, repairs: run.repairs, escalations: run.escalations, requested: run.requested, effective: run.effective, budgetReservedUsd: run.budgetReservedUsd } : null,
      events,
      packetReady: !!packet,
      packetVersion: packet?.version ?? null,
      budget: { ceilingUsd: store.budgetCeilingOverride(id) ?? policy.orderBudgetUsd, spentUsd: spent, exhausted: remainingOrderBudget(policy, spent, store.budgetCeilingOverride(id)) === null },
      worker: workerStatus(),
    });
  } catch (error) {
    return failure(error);
  }
}

/** Customer actions: retry a failed run (no new charge), cancel a run in progress, or cancel an unpaid order. */
export async function POST(request: NextRequest, ctx: RouteContext<"/api/packets/orders/[id]">) {
  try {
    checkOrigin(request);
    const { id } = await ctx.params;
    const { store } = services();
    const user = requireUser(request, store);
    const data = await readJson(request, 4_000);
    if (data.action === "retry") return json({ run: store.retry(user, id, (latest, spent) => nextAttemptSettings(latest, spent, store.budgetCeilingOverride(id))) }, 201);
    if (data.action === "cancel-run") return json({ run: store.requestCancel(user, id) });
    if (data.action === "cancel-order") return json({ order: store.cancelOrder(user, id) });
    throw new PacketError("Unknown action.", 400);
  } catch (error) {
    return failure(error);
  }
}

import type { NextRequest } from "next/server";
import { failure, json, requireUser } from "@/lib/packets/http";
import { services } from "@/lib/packets/service";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** The delivered packet. Requires ownership and an active entitlement (revoked access is a distinct 403). */
export async function GET(request: NextRequest, ctx: RouteContext<"/api/packets/orders/[id]/packet">) {
  try {
    const { id } = await ctx.params;
    const { store } = services();
    const user = requireUser(request, store);
    const record = store.packet(user, id);
    const order = store.order(user, id);
    const entitlement = store.entitlement(user, id)!;
    return json({
      packet: record.packet,
      packetId: record.id,
      version: record.version,
      digest: record.digest,
      createdAt: record.createdAt,
      order: { id: order.id, status: order.status, sandbox: order.sandbox, provider: order.provider, requestId: order.requestId, requestVersion: order.requestVersion },
      entitlement: { clarificationLimit: entitlement.clarificationLimit, clarificationsUsed: entitlement.clarificationsUsed },
      clarifications: store.clarifications(user, id),
    });
  } catch (error) {
    return failure(error);
  }
}

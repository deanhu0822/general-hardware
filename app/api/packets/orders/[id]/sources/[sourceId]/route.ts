import type { NextRequest } from "next/server";
import { failure, json, requireUser } from "@/lib/packets/http";
import { PacketError } from "@/lib/packets/model";
import { services } from "@/lib/packets/service";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** Frozen source text behind a delivered packet. Requires the active entitlement; verified against the frozen hash. */
export async function GET(request: NextRequest, ctx: RouteContext<"/api/packets/orders/[id]/sources/[sourceId]">) {
  try {
    const { id, sourceId } = await ctx.params;
    const { store } = services();
    const user = requireUser(request, store);
    const { order } = store.requireActiveEntitlement(user, id);
    const frozen = store.frozen(order.requestId, order.requestVersion);
    const entry = frozen.sources.find((s) => s.sourceId === sourceId);
    if (!entry) throw new PacketError("Source not found.", 404, "not_found");
    const content = store.frozenContents(frozen).get(sourceId)!;
    return json({ source: { ...entry, content }, frozenAt: frozen.frozenAt, manifestDigest: frozen.manifestDigest });
  } catch (error) {
    return failure(error);
  }
}

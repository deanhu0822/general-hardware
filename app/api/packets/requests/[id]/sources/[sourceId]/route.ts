import type { NextRequest } from "next/server";
import { checkOrigin, failure, json, requireUser } from "@/lib/packets/http";
import { PacketError } from "@/lib/packets/model";
import { services } from "@/lib/packets/service";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** Read a draft source's text. Customer-scoped: another customer's id is a 404. */
export async function GET(request: NextRequest, ctx: RouteContext<"/api/packets/requests/[id]/sources/[sourceId]">) {
  try {
    const { id, sourceId } = await ctx.params;
    const { store } = services();
    const user = requireUser(request, store);
    const source = store.sources(user, id).find((s) => s.sourceId === sourceId);
    if (!source) throw new PacketError("Source not found.", 404, "not_found");
    return json({ source });
  } catch (error) {
    return failure(error);
  }
}

export async function DELETE(request: NextRequest, ctx: RouteContext<"/api/packets/requests/[id]/sources/[sourceId]">) {
  try {
    checkOrigin(request);
    const { id, sourceId } = await ctx.params;
    const { store } = services();
    const user = requireUser(request, store);
    store.removeSource(user, id, sourceId);
    return json({ ok: true });
  } catch (error) {
    return failure(error);
  }
}

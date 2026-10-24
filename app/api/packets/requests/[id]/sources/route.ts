import type { NextRequest } from "next/server";
import { checkOrigin, failure, json, readJson, requireUser } from "@/lib/packets/http";
import { BRIEF_LIMITS } from "@/lib/packets/model";
import { services } from "@/lib/packets/service";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** Add one pasted/uploaded text source to a draft request. Hashed on import; frozen with the order. */
export async function POST(request: NextRequest, ctx: RouteContext<"/api/packets/requests/[id]/sources">) {
  try {
    checkOrigin(request);
    const { id } = await ctx.params;
    const { store } = services();
    const user = requireUser(request, store);
    const data = await readJson(request, BRIEF_LIMITS.sourceBytes + 8_000);
    const source = store.addSource(user, id, data);
    return json({ source: { id: source.id, sourceId: source.sourceId, name: source.name, revision: source.revision, sha256: source.sha256, bytes: source.bytes, importedAt: source.importedAt } }, 201);
  } catch (error) {
    return failure(error);
  }
}

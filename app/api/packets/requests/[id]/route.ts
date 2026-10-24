import type { NextRequest } from "next/server";
import { checkOrigin, failure, json, readJson, requireUser } from "@/lib/packets/http";
import { preflight } from "@/lib/packets/model";
import { services } from "@/lib/packets/service";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** Intake detail: brief, source manifest (no content), preflight, latest order and the offer. Customer-scoped. */
export async function GET(request: NextRequest, ctx: RouteContext<"/api/packets/requests/[id]">) {
  try {
    const { id } = await ctx.params;
    const { store, offer } = services();
    const user = requireUser(request, store);
    const req = store.request(user, id);
    const manifest = store.manifest(user, id);
    const order = store.latestOrder(user, id) ?? null;
    return json({ request: req, sources: manifest, preflight: preflight(req.brief, manifest), order, offer, payments: await paymentsSummary() });
  } catch (error) {
    return failure(error);
  }
}

async function paymentsSummary() {
  const sel = await services().payments();
  return { kind: sel.kind, reason: sel.reason, sandbox: sel.provider?.sandbox ?? null };
}

export async function PATCH(request: NextRequest, ctx: RouteContext<"/api/packets/requests/[id]">) {
  try {
    checkOrigin(request);
    const { id } = await ctx.params;
    const { store } = services();
    const user = requireUser(request, store);
    const data = await readJson(request, 64_000);
    return json({ request: store.updateBrief(user, id, data.brief ?? {}) });
  } catch (error) {
    return failure(error);
  }
}

/** Clone a frozen request into a new editable draft (a materially changed request is a new version and a new order). */
export async function POST(request: NextRequest, ctx: RouteContext<"/api/packets/requests/[id]">) {
  try {
    checkOrigin(request);
    const { id } = await ctx.params;
    const { store } = services();
    const user = requireUser(request, store);
    const data = await readJson(request, 4_000);
    if (data.action !== "clone") return json({ error: "Unknown action." }, 400);
    return json({ request: store.cloneRequest(user, id) }, 201);
  } catch (error) {
    return failure(error);
  }
}

import type { NextRequest } from "next/server";
import { checkOrigin, failure, json, requireUser } from "@/lib/packets/http";
import { PacketError, preflight } from "@/lib/packets/model";
import { services } from "@/lib/packets/service";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * Freeze the request and open checkout. The order is created server-side in
 * checkout_pending; nothing here grants an entitlement. Only a verified
 * provider webhook can mark the order paid.
 */
export async function POST(request: NextRequest, ctx: RouteContext<"/api/packets/requests/[id]/order">) {
  try {
    const origin = checkOrigin(request);
    const { id } = await ctx.params;
    const { store, offer, payments } = services();
    const user = requireUser(request, store);
    if (user.role !== "customer" && process.env.CAID_ALLOW_STAFF_ORDERS !== "true")
      throw new PacketError("Engineering accounts do not buy packets. Sign in with a customer account (or set CAID_ALLOW_STAFF_ORDERS=true for local testing).", 403, "role");
    const req = store.request(user, id);
    const check = preflight(req.brief, store.manifest(user, id));
    if (!check.ok) throw new PacketError(`Preflight has failures: ${check.checks.filter((c) => c.status === "fail").map((c) => c.detail).join(" ")}`, 400, "preflight");
    const selection = await payments();
    if (!selection.provider) throw new PacketError(selection.reason, 503, "payments-unavailable");
    const frozen = store.freeze(user, id);
    const order = store.createOrder(user, frozen, offer, selection.provider.sandbox, selection.kind === "simulated" ? "simulated" : "whop");
    if (order.status === "paid") return json({ order, checkoutUrl: null, provider: selection.kind });
    if (!order.whop.checkoutUrl) {
      const checkout = await selection.provider.createCheckout(order, {
        redirectUrl: `${origin}/packets/${id}?order=${order.id}&returned=1`,
        title: offer.title,
        description: offer.deliverable,
      });
      store.attachCheckout(order.id, { checkoutId: checkout.checkoutId, checkoutUrl: checkout.checkoutUrl, planId: checkout.planId, productId: checkout.productId, companyId: selection.provider.companyId });
    }
    const fresh = store.order(user, order.id);
    return json({ order: fresh, checkoutUrl: fresh.whop.checkoutUrl, provider: selection.kind, sandbox: selection.provider.sandbox, reason: selection.reason }, 201);
  } catch (error) {
    return failure(error);
  }
}

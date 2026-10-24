import type { NextRequest } from "next/server";
import { checkOrigin, failure, json, readJson, requireUser } from "@/lib/packets/http";
import { PacketError } from "@/lib/packets/model";
import { defaultRequestedSettings } from "@/lib/packets/runner";
import { services } from "@/lib/packets/service";
import { processWebhook, SimulatedPaymentProvider } from "@/lib/packets/whop";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * Simulated checkout actions (labeled test double). The signed-in customer
 * acts on their own order only. The action changes simulated provider state
 * and then delivers a signed webhook through the same verification,
 * deduplication and reconciliation path a real provider uses.
 */
export async function POST(request: NextRequest) {
  try {
    checkOrigin(request);
    const { store, offer, payments } = services();
    const user = requireUser(request, store);
    const selection = await payments();
    if (selection.kind !== "simulated" || !(selection.provider instanceof SimulatedPaymentProvider)) throw new PacketError("Simulated checkout is not enabled.", 404, "not_found");
    const data = await readJson(request, 4_000);
    const order = store.order(user, String(data.orderId ?? ""));
    const action = data.action;
    if (action !== "pay" && action !== "fail" && action !== "refund" && action !== "pending" && action !== "replay" && action !== "forge") throw new PacketError("Unknown action.", 400);
    let delivery: { body: string; headers: Record<string, string> };
    if (action === "replay") {
      // Re-deliver the most recent event verbatim: must be deduplicated.
      const last = store.paymentEvents(order.id).at(-1);
      if (!last) throw new PacketError("No event to replay yet.", 409);
      const row = store.db.prepare("SELECT payload FROM pk_payment_events WHERE id=?").get(last.id) as { payload: string };
      delivery = selection.provider.sign(JSON.parse(row.payload) as Record<string, unknown>);
      delivery.headers["webhook-id"] = last.id;
    } else if (action === "forge") {
      // Unsigned event claiming payment: must be rejected.
      delivery = { body: JSON.stringify({ id: `evt_forged_${Date.now()}`, type: "payment.succeeded", data: { payment_id: `pay_sim_${order.id.slice(0, 8)}`, metadata: { orderId: order.id } } }), headers: { "webhook-id": "forged", "x-sim-timestamp": String(Math.floor(Date.now() / 1000)), "x-sim-signature": "00".repeat(32) } };
    } else delivery = selection.provider.simulate(order.id, action);
    const outcome = await processWebhook(store, selection.provider, delivery.body, delivery.headers, { requested: defaultRequestedSettings(), clarificationLimit: offer.clarificationLimit });
    return json({ outcome, order: store.order(user, order.id), events: store.paymentEvents(order.id) });
  } catch (error) {
    return failure(error);
  }
}

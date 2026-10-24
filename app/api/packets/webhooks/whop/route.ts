import type { NextRequest } from "next/server";
import { json } from "@/lib/packets/http";
import { defaultRequestedSettings } from "@/lib/packets/runner";
import { services } from "@/lib/packets/service";
import { processWebhook } from "@/lib/packets/whop";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * Provider webhook. Raw body is required for signature verification. The
 * handler is idempotent and order-agnostic: duplicates, delays and
 * out-of-order deliveries converge on the authoritative provider state.
 * Never trusts the event body for fulfillment.
 */
export async function POST(request: NextRequest) {
  const { store, offer, payments } = services();
  const selection = await payments();
  if (!selection.provider || selection.kind !== "whop") return json({ error: "Whop webhooks are not enabled on this server." }, 503);
  const raw = await request.text();
  if (raw.length > 256_000) return json({ error: "Payload too large." }, 413);
  const headers: Record<string, string> = {};
  request.headers.forEach((v, k) => (headers[k.toLowerCase()] = v));
  const outcome = await processWebhook(store, selection.provider, raw, headers, { requested: defaultRequestedSettings(), clarificationLimit: offer.clarificationLimit });
  return json({ result: outcome.result }, outcome.status);
}

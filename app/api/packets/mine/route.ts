import type { NextRequest } from "next/server";
import { failure, json, requireUser } from "@/lib/packets/http";
import { services } from "@/lib/packets/service";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** My packets: the signed-in customer's requests with order and run state. Customer-scoped query. */
export async function GET(request: NextRequest) {
  try {
    const { store } = services();
    const user = requireUser(request, store);
    return json({ items: store.listCustomerPackets(user) });
  } catch (error) {
    return failure(error);
  }
}

import type { NextRequest } from "next/server";
import { checkOrigin, failure, json, readJson, requireUser } from "@/lib/packets/http";
import { services } from "@/lib/packets/service";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(request: NextRequest) {
  try {
    const { store } = services();
    const user = requireUser(request, store);
    return json({ requests: store.listRequests(user) });
  } catch (error) {
    return failure(error);
  }
}

/** Create a draft request. Drafts are editable until an order freezes them. */
export async function POST(request: NextRequest) {
  try {
    checkOrigin(request);
    const { store } = services();
    const user = requireUser(request, store);
    const data = await readJson(request, 64_000);
    const created = store.createRequest(user, data.brief ?? {});
    return json({ request: created }, 201);
  } catch (error) {
    return failure(error);
  }
}

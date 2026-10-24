import type { NextRequest } from "next/server";
import { failure, requireUser } from "@/lib/packets/http";
import { renderPacketMarkdown } from "@/lib/packets/markdown";
import { services } from "@/lib/packets/service";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** Markdown download. Same authorization as the packet view; never a public URL. */
export async function GET(request: NextRequest, ctx: RouteContext<"/api/packets/orders/[id]/download">) {
  try {
    const { id } = await ctx.params;
    const { store } = services();
    const user = requireUser(request, store);
    const record = store.packet(user, id);
    const notice = record.packet.receipt.origin === "test-double" ? "TEST DOUBLE OUTPUT — produced by a deterministic stand-in for automated verification; no model ran." : undefined;
    const md = renderPacketMarkdown(record.packet, { sampleNotice: notice });
    return new Response(md, {
      headers: {
        "Content-Type": "text/markdown; charset=utf-8",
        "Content-Disposition": `attachment; filename="j12-review-packet-${record.orderId.slice(0, 8)}-v${record.version}.md"`,
        "Cache-Control": "no-store",
      },
    });
  } catch (error) {
    return failure(error);
  }
}

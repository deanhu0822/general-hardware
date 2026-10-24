import { fixtureFrozen, fixtureSamplePacket, fixtureSources } from "@/lib/packets/fixture";
import { renderPacketMarkdown } from "@/lib/packets/markdown";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const SAMPLE_NOTICE = "SYNTHETIC SAMPLE — every source and claim in this packet is invented to demonstrate the format. It contains no customer data and no model output.";

/** Public, isolated synthetic sample. No storage, no credentials, no customer data. */
export async function GET(request: Request) {
  const url = new URL(request.url);
  if (url.searchParams.get("format") === "markdown") {
    return new Response(renderPacketMarkdown(fixtureSamplePacket(), { title: "J12 connector-change review packet — synthetic sample", sampleNotice: SAMPLE_NOTICE }), {
      headers: { "Content-Type": "text/markdown; charset=utf-8", "Content-Disposition": 'attachment; filename="j12-review-packet-synthetic-sample.md"' },
    });
  }
  return Response.json({
    synthetic: true,
    notice: SAMPLE_NOTICE,
    packet: fixtureSamplePacket(),
    frozen: fixtureFrozen,
    sources: fixtureSources,
  });
}

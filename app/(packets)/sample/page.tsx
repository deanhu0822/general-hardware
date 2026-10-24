import Link from "next/link";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { PacketView } from "@/components/packets/packet-view";
import { fixtureSamplePacket, fixtureSources } from "@/lib/packets/fixture";

export const dynamic = "force-static";

/** Public synthetic sample. Rendered from the frozen fixture in code; no storage, no model, no customer data. */
export default function SamplePage() {
  const packet = fixtureSamplePacket();
  return (
    <div className="space-y-6">
      <Alert>
        <AlertTitle>Synthetic sample</AlertTitle>
        <AlertDescription>
          Every source, claim and gap below is invented to show the packet format. Nothing here is a real field report, part, rating or approval, and no model produced it.{" "}
          <Link href="/packets/new" className="text-primary underline-offset-4 hover:underline">
            Prepare a packet from your own sources
          </Link>
          .
        </AlertDescription>
      </Alert>
      <Button asChild variant="outline"><Link href="/sample/coverage">Explore all-sector evaluation fixtures</Link></Button>
      <PacketView
        packet={packet}
        mode="sample"
        sources={fixtureSources.map((s) => ({ sourceId: s.sourceId, content: s.content }))}
        downloadHref="/api/packets/sample?format=markdown"
        actions={
          <Button asChild variant="outline">
            <Link href="/packets/new">Prepare my packet</Link>
          </Button>
        }
      />
    </div>
  );
}

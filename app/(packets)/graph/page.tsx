import { HardwareNodeGraph } from "@/components/packets/hardware-node-graph";
import { DEMONSTRATED_SECTOR, isSectorTag, type SectorTagId } from "@/lib/packets/client-model";

export const dynamic = "force-dynamic";

export default async function GraphPage({
  searchParams,
}: {
  searchParams: Promise<{ sector?: string }>;
}) {
  const query = await searchParams;
  const initialSector: SectorTagId =
    query.sector && isSectorTag(query.sector) ? query.sector : DEMONSTRATED_SECTOR;

  return (
    <div className="space-y-4">
      <header className="space-y-1">
        <h1>Hardware plans, changes, and relationships</h1>
        <p className="text-sm text-muted-foreground">
          Choose a sector tag to inspect its synthetic hardware baseline, compare change alternatives, and trace source-linked constraints.
        </p>
      </header>
      <HardwareNodeGraph sector={initialSector} />
    </div>
  );
}

import { PacketScreen } from "@/components/packets/packet-screen";

export default async function PacketPage({ params }: PageProps<"/orders/[id]/packet">) {
  const { id } = await params;
  return <PacketScreen orderId={id} />;
}

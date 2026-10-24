import { Intake } from "@/components/packets/intake";

export default async function RequestPage({ params }: PageProps<"/packets/[id]">) {
  const { id } = await params;
  return <Intake requestId={id} />;
}

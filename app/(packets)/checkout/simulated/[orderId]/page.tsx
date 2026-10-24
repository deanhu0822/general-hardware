import { SimulatedCheckout } from "@/components/packets/simulated-checkout";

export default async function SimulatedCheckoutPage({ params }: PageProps<"/checkout/simulated/[orderId]">) {
  const { orderId } = await params;
  return <SimulatedCheckout orderId={orderId} />;
}

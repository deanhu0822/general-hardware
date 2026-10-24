import type { NextRequest } from "next/server";
import { checkOrigin, failure, json, readJson, requireOwner, text } from "@/lib/packets/http";
import { services, workerStatus } from "@/lib/packets/service";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** Owner-only operations: counts, receipts, provider/runner/policy status. No customer source text. */
export async function GET(request: NextRequest) {
  try {
    const { store, policy, runner, payments, offer } = services();
    requireOwner(request, store);
    const pay = await payments();
    return json({
      operations: store.operations(),
      orders: store.listOrdersForOwner().map((o) => ({ id: o.id, status: o.status, provider: o.provider, sandbox: o.sandbox, amount: o.amount, currency: o.currency, createdAt: o.createdAt, paidAt: o.paidAt, revokedAt: o.revokedAt, budgetCeiling: store.budgetCeilingOverride(o.id) ?? policy.orderBudgetUsd, spentUsd: store.orderSpendUsd(o.id) })),
      policy,
      runner: { kind: runner.kind, reason: runner.reason },
      payments: { kind: pay.kind, reason: pay.reason, sandbox: pay.provider?.sandbox ?? null, companyId: pay.provider?.companyId ?? null },
      worker: workerStatus(),
      offer,
    });
  } catch (error) {
    return failure(error);
  }
}

/** Owner adjustments. The only one today is an explicit per-order budget ceiling. */
export async function POST(request: NextRequest) {
  try {
    checkOrigin(request);
    const { store } = services();
    const owner = requireOwner(request, store);
    const data = await readJson(request, 4_000);
    if (data.action === "adjust-budget") {
      store.adjustBudget(text("Order", data.orderId, 80), Number(data.ceilingUsd), owner, text("Reason", data.reason, 500));
      return json({ ok: true, ceilingUsd: store.budgetCeilingOverride(String(data.orderId)) });
    }
    return json({ error: "Unknown action." }, 400);
  } catch (error) {
    return failure(error);
  }
}

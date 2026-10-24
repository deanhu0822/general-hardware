"use client";

import Link from "next/link";
import { useState } from "react";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { api, ApiError } from "./api";
import type { OrderRecord, PaymentEventRecord } from "@/lib/packets/store";

type Outcome = { outcome: { status: number; result: string }; order: OrderRecord; events: PaymentEventRecord[] };

/** Labeled simulated checkout. Exercises the real webhook path; never moves money. */
export function SimulatedCheckout({ orderId }: { orderId: string }) {
  const [log, setLog] = useState<Outcome[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const last = log[log.length - 1];
  async function act(action: string) {
    setBusy(action);
    setError(null);
    try {
      setLog((l) => [...l, {} as Outcome]);
      const r = await api<Outcome>("/api/packets/checkout/simulated", { json: { orderId, action } });
      setLog((l) => [...l.slice(0, -1), r]);
    } catch (e) {
      setLog((l) => l.slice(0, -1));
      setError(e instanceof ApiError ? e.message : "Action failed.");
    } finally {
      setBusy(null);
    }
  }
  const requestId = last?.order?.requestId;
  return (
    <div className="mx-auto max-w-2xl space-y-4">
      <Alert variant="destructive">
        <AlertTitle>Simulated sandbox checkout — test double</AlertTitle>
        <AlertDescription>No money moves here. Each button changes simulated provider state and then delivers a signed webhook through the same verification, deduplication and reconciliation path a real provider uses. Returning to the app is never treated as payment.</AlertDescription>
      </Alert>
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Order {orderId.slice(0, 8)}…</CardTitle>
          <CardDescription>Choose the provider outcome to simulate.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          <div className="flex flex-wrap gap-2">
            <Button disabled={!!busy} onClick={() => act("pay")}>
              Pay (payment.succeeded)
            </Button>
            <Button variant="outline" disabled={!!busy} onClick={() => act("pending")}>
              Pending
            </Button>
            <Button variant="outline" disabled={!!busy} onClick={() => act("fail")}>
              Fail
            </Button>
            <Button variant="outline" disabled={!!busy} onClick={() => act("refund")}>
              Refund (revokes access)
            </Button>
            <Button variant="ghost" disabled={!!busy} onClick={() => act("replay")}>
              Replay last event (dedupe)
            </Button>
            <Button variant="ghost" disabled={!!busy} onClick={() => act("forge")}>
              Forge unsigned event (reject)
            </Button>
          </div>
          {error ? (
            <p role="alert" className="text-sm text-destructive">
              {error}
            </p>
          ) : null}
          {last?.outcome ? (
            <div className="rounded-md border border-border bg-muted/40 p-3 text-sm">
              <p>
                <span className="font-medium">Webhook outcome:</span> HTTP {last.outcome.status} · {last.outcome.result}
              </p>
              <p>
                <span className="font-medium">Order status:</span> {last.order.status}
              </p>
              <p className="mt-2 text-xs font-medium text-muted-foreground">Recorded provider events</p>
              <ul className="text-xs text-muted-foreground">
                {last.events.map((e) => (
                  <li key={e.id} className="font-mono">
                    {e.receivedAt.slice(11, 19)} {e.type} · {e.verified ? "verified" : "unverified"} · {e.result}
                  </li>
                ))}
              </ul>
            </div>
          ) : null}
          {requestId ? (
            <Button asChild variant="outline">
              <Link href={`/packets/${requestId}?order=${orderId}&returned=1`}>Return to the order status page</Link>
            </Button>
          ) : null}
        </CardContent>
      </Card>
    </div>
  );
}

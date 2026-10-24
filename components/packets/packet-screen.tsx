"use client";

import Link from "next/link";
import { useCallback, useEffect, useState, type FormEvent } from "react";
import { MessageSquareText } from "lucide-react";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Field, FieldDescription, FieldLabel } from "@/components/ui/field";
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle, SheetTrigger } from "@/components/ui/sheet";
import { Skeleton } from "@/components/ui/skeleton";
import { Textarea } from "@/components/ui/textarea";
import { api, ApiError } from "./api";
import { PacketView } from "./packet-view";
import type { Packet } from "@/lib/packets/model";
import type { ClarificationRecord } from "@/lib/packets/store";

type Loaded = { packet: Packet; version: number; order: { id: string; requestId: string; sandbox: boolean; provider: string }; entitlement: { clarificationLimit: number; clarificationsUsed: number }; clarifications: ClarificationRecord[] };

/** Screen 3: the delivered packet with sources, gaps, next action, download and the bounded clarification Sheet. */
export function PacketScreen({ orderId }: { orderId: string }) {
  const [data, setData] = useState<Loaded | null>(null);
  const [error, setError] = useState<ApiError | null>(null);
  const load = useCallback(async () => {
    try {
      setData(await api<Loaded>(`/api/packets/orders/${orderId}/packet`));
      setError(null);
    } catch (e) {
      setError(e instanceof ApiError ? e : new ApiError("Could not load the packet.", 500, "error"));
    }
  }, [orderId]);
  useEffect(() => {
    void Promise.resolve().then(load);
  }, [load]);

  if (error?.status === 401)
    return (
      <Alert>
        <AlertTitle>Sign in to view this packet</AlertTitle>
        <AlertDescription>
          <Button asChild className="mt-2">
            <Link href={`/account?next=${encodeURIComponent(`/orders/${orderId}/packet`)}`}>Sign in</Link>
          </Button>
        </AlertDescription>
      </Alert>
    );
  if (error?.code === "revoked")
    return (
      <Alert variant="destructive" role="alert">
        <AlertTitle>Access revoked</AlertTitle>
        <AlertDescription>{error.message} The packet remains stored for the record but is not readable after a refund or chargeback.</AlertDescription>
      </Alert>
    );
  if (error?.code === "unpaid")
    return (
      <Alert role="alert">
        <AlertTitle>No verified payment yet</AlertTitle>
        <AlertDescription>
          {error.message}{" "}
          <Link href="/packets" className="text-primary underline-offset-4 hover:underline">
            Back to my packets
          </Link>
        </AlertDescription>
      </Alert>
    );
  if (error?.code === "not-ready")
    return (
      <Alert role="status">
        <AlertTitle>Packet not delivered yet</AlertTitle>
        <AlertDescription>
          {error.message}{" "}
          <Link href="/packets" className="text-primary underline-offset-4 hover:underline">
            Check the order status
          </Link>
        </AlertDescription>
      </Alert>
    );
  if (error?.status === 404)
    return (
      <Alert role="alert">
        <AlertTitle>Not found</AlertTitle>
        <AlertDescription>This order does not exist in your account.</AlertDescription>
      </Alert>
    );
  if (error)
    return (
      <Alert variant="destructive" role="alert">
        <AlertTitle>Unavailable</AlertTitle>
        <AlertDescription>
          {error.message}{" "}
          <Button variant="link" onClick={() => load()}>
            Try again
          </Button>
        </AlertDescription>
      </Alert>
    );
  if (!data)
    return (
      <div className="space-y-3" aria-busy="true" aria-label="Loading the packet">
        <Skeleton className="h-6 w-64" />
        <Skeleton className="h-8 w-96" />
        <Skeleton className="h-40 w-full" />
      </div>
    );
  return (
    <PacketView
      packet={data.packet}
      mode="delivered"
      loadSource={async (sourceId) => {
        const r = await api<{ source: { sourceId: string; content: string } }>(`/api/packets/orders/${orderId}/sources/${sourceId}`);
        return { sourceId: r.source.sourceId, content: r.source.content };
      }}
      downloadHref={`/api/packets/orders/${orderId}/download`}
      actions={<ClarificationSheet orderId={orderId} initial={data.clarifications} entitlement={data.entitlement} onChange={load} />}
    />
  );
}

function ClarificationSheet({ orderId, initial, entitlement, onChange }: { orderId: string; initial: ClarificationRecord[]; entitlement: Loaded["entitlement"]; onChange: () => void }) {
  const [question, setQuestion] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [items, setItems] = useState(initial);
  const remaining = entitlement.clarificationLimit - entitlement.clarificationsUsed;
  async function ask(e: FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      const r = await api<{ clarifications: ClarificationRecord[] }>(`/api/packets/orders/${orderId}/clarifications`, { json: { question } });
      setItems(r.clarifications);
      setQuestion("");
      onChange();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "The clarification failed.");
    } finally {
      setBusy(false);
    }
  }
  return (
    <Sheet>
      <SheetTrigger asChild>
        <Button variant="outline">
          <MessageSquareText data-icon="inline-start" /> Ask about this packet
        </Button>
      </SheetTrigger>
      <SheetContent side="right" className="w-full overflow-y-auto sm:max-w-lg data-[side=right]:sm:max-w-lg">
        <SheetHeader>
          <SheetTitle>Bounded clarification</SheetTitle>
          <SheetDescription>
            One written question answered from the same frozen sources, with citations. {remaining > 0 ? `${remaining} of ${entitlement.clarificationLimit} remaining.` : "The included clarification has been used."} The answer cannot approve hardware or add evidence that is not in your sources.
          </SheetDescription>
        </SheetHeader>
        <div className="space-y-4 px-4 pb-6">
          {items.map((c) => (
            <div key={c.id} className="rounded-md border border-border p-3 text-sm">
              <p className="font-medium">{c.question}</p>
              {c.status === "answered" ? (
                <>
                  <p className="mt-2 whitespace-pre-wrap">{c.answer}</p>
                  <p className="mt-2 text-xs text-muted-foreground">
                    Citations: {c.citations.map((x) => `${x.sourceId} · ${x.anchorId}`).join(", ") || "none"} · {String((c.receipt as { origin?: string } | null)?.origin ?? "")}
                    {typeof (c.receipt as { costUsd?: number } | null)?.costUsd === "number" ? ` · $${((c.receipt as { costUsd: number }).costUsd).toFixed(4)}` : ""}
                    {typeof (c.receipt as { latencyMs?: number } | null)?.latencyMs === "number" ? ` · ${(((c.receipt as { latencyMs: number }).latencyMs) / 1000).toFixed(1)} s` : ""}
                  </p>
                </>
              ) : c.status === "failed" ? (
                <p className="mt-2 text-destructive">Failed; the clarification entitlement was released.</p>
              ) : (
                <p className="mt-2 text-muted-foreground">Pending…</p>
              )}
            </div>
          ))}
          {remaining > 0 ? (
            <form onSubmit={ask} noValidate className="space-y-3">
              <Field>
                <FieldLabel htmlFor="clar-q">Your question</FieldLabel>
                <Textarea id="clar-q" rows={4} maxLength={1000} value={question} onChange={(e) => setQuestion(e.target.value)} required />
                <FieldDescription>Up to 1000 characters. Answering can take a minute; the slot is only consumed when an answer is delivered.</FieldDescription>
              </Field>
              {error ? (
                <p role="alert" className="text-sm text-destructive">
                  {error}
                </p>
              ) : null}
              <Button type="submit" disabled={busy || !question.trim()}>
                {busy ? "Answering…" : "Ask"}
              </Button>
            </form>
          ) : null}
        </div>
      </SheetContent>
    </Sheet>
  );
}

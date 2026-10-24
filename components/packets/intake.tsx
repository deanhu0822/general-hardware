"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useMemo, useRef, useState, type FormEvent } from "react";
import { AlertCircle, CheckCircle2, CircleDashed, Lock, RefreshCw, Trash2, Upload, XCircle } from "lucide-react";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import { Field, FieldDescription, FieldGroup, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { Spinner } from "@/components/ui/spinner";
import { Textarea } from "@/components/ui/textarea";
import { api, ApiError } from "./api";
import { BRIEF_LIMITS, emptyBrief, SECTOR_TAGS, sectorLabel, type SectorTagId } from "@/lib/packets/client-model";
import { selectedSector, syntheticBriefForSector } from "@/lib/packets/sector-briefs";
import type { Brief, Offer, Preflight, SourceManifestEntry } from "@/lib/packets/model";
import type { OrderRecord, RunEvent } from "@/lib/packets/store";

type Detail = { request: { id: string; brief: Brief; frozenVersion: number | null }; sources: SourceManifestEntry[]; preflight: Preflight; order: OrderRecord | null; offer: Offer; payments: { kind: string; reason: string; sandbox: boolean | null } };
type Status = {
  order: OrderRecord;
  entitlement: { active: boolean; clarificationLimit: number; clarificationsUsed: number; revokedAt: string | null } | null;
  run: { id: string; attempt: number; status: string; cancelRequested: boolean; error: string | null; costUsd: number | null; toolCalls: number; repairs: number; escalations: number; requested: { effort: string; model: string; maxBudgetUsd: number }; effective: { effort: string | null; model: string | null } | null } | null;
  events: RunEvent[];
  packetReady: boolean;
  budget: { ceilingUsd: number; spentUsd: number; exhausted: boolean };
  worker: { running: boolean; runner: string; reason: string };
};

const DRAFT_KEY = (id: string | null) => `caid-intake-draft:${id ?? "new"}`;

/** Screen 2: brief, sources, preflight, purchase and genuine run events. One primary action per state. */
export function Intake({ requestId }: { requestId: string | null }) {
  const router = useRouter();
  const [detail, setDetail] = useState<Detail | null>(null);
  const [status, setStatus] = useState<Status | null>(null);
  const [brief, setBrief] = useState<Brief>(() => emptyBrief());
  const [dirty, setDirty] = useState(false);
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<{ message: string; status: number } | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [source, setSource] = useState({ name: "", revision: "", content: "" });
  const eventsAfter = useRef(0);
  const [events, setEvents] = useState<RunEvent[]>([]);

  // Draft preservation: the brief is mirrored to localStorage until the server has it.
  useEffect(() => {
    // Restore after hydration so the server and client first paint match.
    void Promise.resolve().then(() => {
      try {
        const raw = localStorage.getItem(DRAFT_KEY(requestId));
        if (raw && !requestId) {
          const restored = { ...emptyBrief(), ...JSON.parse(raw) };
          const sector = selectedSector(restored.sectorTags);
          setBrief(sector && !restored.issue ? syntheticBriefForSector(sector).brief : restored);
        }
      } catch {
        /* ignore corrupt drafts */
      }
    });
  }, [requestId]);
  useEffect(() => {
    if (dirty) localStorage.setItem(DRAFT_KEY(requestId), JSON.stringify(brief));
  }, [brief, dirty, requestId]);

  const load = useCallback(async () => {
    if (!requestId) return;
    try {
      const d = await api<Detail>(`/api/packets/requests/${requestId}`);
      setDetail(d);
      if (!dirty) setBrief(d.request.brief);
      setError(null);
    } catch (e) {
      setError({ message: e instanceof ApiError ? e.message : "Could not load the request.", status: e instanceof ApiError ? e.status : 500 });
    }
  }, [requestId, dirty]);
  useEffect(() => {
    void Promise.resolve().then(load);
  }, [load]);

  // Poll the order while it is pending or a run is active. Events are persisted stage events, never fabricated progress.
  const orderId = detail?.order?.id ?? null;
  useEffect(() => {
    if (!orderId) return;
    let stop = false;
    let timer: ReturnType<typeof setTimeout> | undefined;
    const tick = async () => {
      try {
        const s = await api<Status>(`/api/packets/orders/${orderId}?after=${eventsAfter.current}`);
        if (stop) return;
        setStatus(s);
        if (s.events.length) {
          eventsAfter.current = s.events[s.events.length - 1].id;
          setEvents((prev) => [...prev, ...s.events]);
        }
        const active = s.order.status === "checkout_pending" || (s.run && ["queued", "running"].includes(s.run.status));
        if (active && !stop) timer = setTimeout(tick, s.run?.status === "running" ? 2000 : 4000);
      } catch (e) {
        if (!stop) setError({ message: e instanceof ApiError ? e.message : "Status unavailable.", status: e instanceof ApiError ? e.status : 500 });
      }
    };
    void tick();
    return () => {
      stop = true;
      if (timer) clearTimeout(timer);
    };
  }, [orderId]);

  const frozen = !!detail?.request.frozenVersion;
  const limits = BRIEF_LIMITS;

  async function saveBrief() {
    setBusy("save");
    setError(null);
    try {
      if (!requestId) {
        const r = await api<{ request: { id: string } }>("/api/packets/requests", { json: { brief } });
        localStorage.removeItem(DRAFT_KEY(null));
        setDirty(false);
        router.replace(`/packets/${r.request.id}`);
        return;
      }
      await api(`/api/packets/requests/${requestId}`, { method: "PATCH", json: { brief } });
      localStorage.removeItem(DRAFT_KEY(requestId));
      setDirty(false);
      setNotice("Draft saved.");
      await load();
    } catch (e) {
      setError({ message: e instanceof ApiError ? e.message : "Save failed. Your text is still in the form.", status: e instanceof ApiError ? e.status : 500 });
    } finally {
      setBusy(null);
    }
  }
  async function addSource(e: FormEvent) {
    e.preventDefault();
    if (!requestId) return;
    setBusy("source");
    setError(null);
    try {
      await api(`/api/packets/requests/${requestId}/sources`, { json: source });
      setSource({ name: "", revision: "", content: "" });
      await load();
    } catch (err) {
      setError({ message: err instanceof ApiError ? err.message : "The source could not be added. Your text is still in the form.", status: err instanceof ApiError ? err.status : 500 });
    } finally {
      setBusy(null);
    }
  }
  async function readFile(file: File | undefined) {
    if (!file) return;
    if (file.size > limits.sourceBytes) {
      setError({ message: `That file is larger than ${limits.sourceBytes / 1000} KB. Paste the relevant text instead.`, status: 413 });
      return;
    }
    const text = await file.text();
    setSource((s) => ({ ...s, name: s.name || file.name, content: text }));
  }
  async function removeSource(sourceId: string) {
    if (!requestId) return;
    setBusy(`rm-${sourceId}`);
    try {
      await api(`/api/packets/requests/${requestId}/sources/${sourceId}`, { method: "DELETE", json: {} });
      await load();
    } catch (e) {
      setError({ message: e instanceof ApiError ? e.message : "Could not remove the source.", status: 500 });
    } finally {
      setBusy(null);
    }
  }
  async function purchase() {
    if (!requestId) return;
    setBusy("purchase");
    setError(null);
    try {
      if (dirty) await api(`/api/packets/requests/${requestId}`, { method: "PATCH", json: { brief } });
      const r = await api<{ order: OrderRecord; checkoutUrl: string | null }>(`/api/packets/requests/${requestId}/order`, { json: {} });
      await load();
      if (r.checkoutUrl) window.location.assign(r.checkoutUrl);
    } catch (e) {
      setError({ message: e instanceof ApiError ? e.message : "Checkout could not start.", status: e instanceof ApiError ? e.status : 500 });
    } finally {
      setBusy(null);
    }
  }
  async function orderAction(action: "retry" | "cancel-run" | "cancel-order") {
    if (!orderId) return;
    setBusy(action);
    setError(null);
    try {
      await api(`/api/packets/orders/${orderId}`, { json: { action } });
      eventsAfter.current = 0;
      setEvents([]);
      await load();
      setStatus(null);
    } catch (e) {
      setError({ message: e instanceof ApiError ? e.message : "Action failed.", status: e instanceof ApiError ? e.status : 500 });
    } finally {
      setBusy(null);
    }
  }

  if (error?.status === 401)
    return (
      <Alert>
        <AlertTitle>Sign in to prepare a packet</AlertTitle>
        <AlertDescription>
          <Button asChild className="mt-2">
            <Link href={`/account?next=${encodeURIComponent(requestId ? `/packets/${requestId}` : "/packets/new")}`}>Sign in</Link>
          </Button>
        </AlertDescription>
      </Alert>
    );
  if (requestId && !detail && !error)
    return (
      <p className="flex items-center gap-2 text-muted-foreground" aria-busy="true">
        <Spinner /> Loading your request…
      </p>
    );
  if (requestId && !detail && error) return <p role="alert" className="text-destructive">{error.message}</p>;

  const order = status?.order ?? detail?.order ?? null;
  const run = status?.run ?? null;
  const offer = detail?.offer;
  const chosen = selectedSector(brief.sectorTags);
  const identified = selectedSector(detail?.request.brief.sectorTags ?? []);
  const sectorLocked = frozen || identified !== null;
  const syntheticCase = chosen ? syntheticBriefForSector(chosen) : null;
  const setB = <K extends keyof Brief>(k: K, v: Brief[K]) => {
    setBrief((b) => ({ ...b, [k]: v }));
    setDirty(true);
  };
  function chooseSector(id: SectorTagId) {
    if (sectorLocked || chosen === id) return;
    setBrief(syntheticBriefForSector(id).brief);
    setDirty(true);
  }

  return (
    <div className="grid gap-6 lg:grid-cols-[1fr_22rem]">
      <div className="space-y-6">
        <header className="space-y-1">
          <h1>{requestId ? brief.title || "Untitled request" : "New J12 review request"}</h1>
          <p className="text-sm text-muted-foreground">
            {frozen ? (
              <span className="inline-flex items-center gap-1">
                <Lock className="size-3.5" aria-hidden="true" /> Frozen as version {detail?.request.frozenVersion}. A materially changed request is a new request and a separate order.
              </span>
            ) : (
              "Choose one sector. The brief fills from the labeled synthetic example, and that sector stays with this review."
            )}
          </p>
        </header>

        {error && error.status !== 401 ? (
          <Alert variant="destructive" role="alert">
            <AlertCircle />
            <AlertTitle>Something needs attention</AlertTitle>
            <AlertDescription>{error.message}</AlertDescription>
          </Alert>
        ) : null}
        {notice ? (
          <p role="status" className="text-sm text-muted-foreground">
            {notice}
          </p>
        ) : null}

        <Card>
          <CardHeader>
            <CardTitle className="text-base">Brief</CardTitle>
            <CardDescription>One sector identifies this request. The filled text is a labeled synthetic example, not evidence.</CardDescription>
          </CardHeader>
          <CardContent>
            <form
              onSubmit={(e) => {
                e.preventDefault();
                void saveBrief();
              }}
              noValidate
            >
              <FieldGroup>
                <Field>
                  <FieldLabel>Sector</FieldLabel>
                  <div className="flex flex-wrap gap-1.5" role="radiogroup" aria-label="Sector">
                    {SECTOR_TAGS.map((t) => {
                      const on = chosen === t.id;
                      return (
                        <Button key={t.id} type="button" size="sm" variant={on ? "default" : "outline"} role="radio" aria-checked={on} disabled={sectorLocked && !on} onClick={() => chooseSector(t.id)}>
                          {t.label}
                        </Button>
                      );
                    })}
                  </div>
                  <FieldDescription>
                    {sectorLocked && chosen
                      ? `${sectorLabel(chosen)} stays with this review.`
                      : "Choose one sector. The brief fills itself, and this review keeps that sector."}
                  </FieldDescription>
                </Field>
                {chosen && syntheticCase ? (
                <div className="grid gap-4">
                <p className="text-sm text-muted-foreground">Synthetic example · {syntheticCase.caseId}. Filled from that labeled fixture.</p>
                <div className="grid gap-4 sm:grid-cols-2">
                  <Field>
                    <FieldLabel htmlFor="product">Product or team</FieldLabel>
                    <Input id="product" disabled={frozen} maxLength={limits.short} value={brief.product} onChange={(e) => setB("product", e.target.value)} />
                  </Field>
                  <Field>
                    <FieldLabel htmlFor="title">Request title</FieldLabel>
                    <Input id="title" disabled={frozen} maxLength={limits.short} value={brief.title} onChange={(e) => setB("title", e.target.value)} />
                  </Field>
                  <Field className="sm:col-span-2">
                    <FieldLabel htmlFor="baseline">Baseline revision</FieldLabel>
                    <Input id="baseline" disabled={frozen} maxLength={limits.short} value={brief.baseline} onChange={(e) => setB("baseline", e.target.value)} placeholder="Leave empty if unknown" />
                    <FieldDescription>Recorded as Unknown when empty. Never inferred.</FieldDescription>
                  </Field>
                </div>
                <Field>
                  <FieldLabel htmlFor="issue">Observed issue</FieldLabel>
                  <Textarea id="issue" disabled={frozen} rows={3} maxLength={limits.long} value={brief.issue} onChange={(e) => setB("issue", e.target.value)} />
                </Field>
                <Field>
                  <FieldLabel htmlFor="goal">Goal of the connector change</FieldLabel>
                  <Textarea id="goal" disabled={frozen} rows={2} maxLength={limits.long} value={brief.goal} onChange={(e) => setB("goal", e.target.value)} />
                </Field>
                <Field>
                  <FieldLabel htmlFor="decision">Decision the engineering reviewer needs to make</FieldLabel>
                  <Textarea id="decision" disabled={frozen} rows={2} maxLength={limits.long} value={brief.decision} onChange={(e) => setB("decision", e.target.value)} />
                </Field>
                <details className="rounded-md border border-border p-3" open>
                  <summary className="cursor-pointer text-sm font-medium">Constraints, operating conditions, candidate, desired next action</summary>
                  <div className="mt-3 grid gap-4">
                    <Field>
                      <FieldLabel htmlFor="constraints">Constraints</FieldLabel>
                      <Textarea id="constraints" disabled={frozen} rows={2} maxLength={limits.long} value={brief.constraints} onChange={(e) => setB("constraints", e.target.value)} />
                    </Field>
                    <Field>
                      <FieldLabel htmlFor="conditions">Operating conditions</FieldLabel>
                      <Textarea id="conditions" disabled={frozen} rows={2} maxLength={limits.long} value={brief.conditions} onChange={(e) => setB("conditions", e.target.value)} />
                    </Field>
                    <Field>
                      <FieldLabel htmlFor="candidate">Candidate replacement (if any)</FieldLabel>
                      <Input id="candidate" disabled={frozen} maxLength={limits.long} value={brief.candidate} onChange={(e) => setB("candidate", e.target.value)} />
                    </Field>
                    <Field>
                      <FieldLabel htmlFor="desired">Desired next action (your wording, not authoritative)</FieldLabel>
                      <Input id="desired" disabled={frozen} maxLength={limits.long} value={brief.desiredNextAction} onChange={(e) => setB("desiredNextAction", e.target.value)} />
                    </Field>
                  </div>
                </details>
                <Field orientation="horizontal">
                  <Checkbox id="ack" disabled={frozen} checked={brief.acknowledged} onCheckedChange={(v) => setB("acknowledged", v === true)} />
                  <FieldLabel htmlFor="ack" className="font-normal">
                    I understand the packet prepares a review and does not approve hardware. Engineering approval is separate.
                  </FieldLabel>
                </Field>
                {!frozen ? (
                  <div className="flex flex-wrap gap-2">
                    <Button type="submit" variant={requestId ? "outline" : "default"} disabled={busy === "save" || !chosen}>
                      {busy === "save" ? "Saving…" : requestId ? "Save draft" : "Save and continue"}
                    </Button>
                    {dirty ? <span className="self-center text-xs text-muted-foreground">Unsaved changes are kept in this browser.</span> : null}
                  </div>
                ) : null}
                </div>
                ) : null}
              </FieldGroup>
            </form>
          </CardContent>
        </Card>

        {requestId ? (
          <Card>
            <CardHeader>
              <CardTitle className="text-base">Sources ({detail?.sources.length ?? 0}/{limits.maxSources})</CardTitle>
              <CardDescription>Plain text, Markdown or CSV. Each source is hashed on import and frozen with the order; the packet can only cite these.</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              {detail?.sources.length ? (
                <ul className="divide-y divide-border rounded-md border border-border">
                  {detail.sources.map((s) => (
                    <li key={s.sourceId} className="flex flex-wrap items-center justify-between gap-2 p-3 text-sm">
                      <div>
                        <span className="font-mono text-xs">{s.sourceId}</span> <span className="font-medium">{s.name}</span>
                        <div className="text-xs text-muted-foreground">
                          rev {s.revision} · {s.bytes} bytes · sha256 {s.sha256.slice(0, 12)}…
                        </div>
                      </div>
                      {!frozen ? (
                        <Button size="sm" variant="ghost" aria-label={`Remove ${s.sourceId}`} disabled={busy === `rm-${s.sourceId}`} onClick={() => removeSource(s.sourceId)}>
                          <Trash2 />
                        </Button>
                      ) : null}
                    </li>
                  ))}
                </ul>
              ) : (
                <p className="text-sm text-muted-foreground">No sources yet. Without sources the packet can only report missing evidence.</p>
              )}
              {!frozen ? (
                <form onSubmit={addSource} noValidate>
                  <FieldGroup>
                    <div className="grid gap-4 sm:grid-cols-2">
                      <Field>
                        <FieldLabel htmlFor="s-name">Source name</FieldLabel>
                        <Input id="s-name" maxLength={limits.short} value={source.name} onChange={(e) => setSource({ ...source, name: e.target.value })} />
                      </Field>
                      <Field>
                        <FieldLabel htmlFor="s-rev">Supplied revision</FieldLabel>
                        <Input id="s-rev" maxLength={limits.short} value={source.revision} onChange={(e) => setSource({ ...source, revision: e.target.value })} placeholder="Unknown if empty" />
                      </Field>
                    </div>
                    <Field>
                      <FieldLabel htmlFor="s-content">Source text</FieldLabel>
                      <Textarea id="s-content" rows={6} value={source.content} onChange={(e) => setSource({ ...source, content: e.target.value })} />
                      <FieldDescription>
                        Up to {limits.sourceBytes / 1000} KB per source. Or{" "}
                        <label className="cursor-pointer text-primary underline-offset-4 hover:underline">
                          <Upload className="mr-0.5 inline size-3.5" aria-hidden="true" />
                          choose a text file
                          <input type="file" accept=".txt,.md,.csv,text/plain,text/markdown,text/csv" className="sr-only" onChange={(e) => readFile(e.target.files?.[0])} />
                        </label>
                        .
                      </FieldDescription>
                    </Field>
                    <div>
                      <Button type="submit" variant="outline" disabled={busy === "source"}>
                        {busy === "source" ? "Adding…" : "Add source"}
                      </Button>
                    </div>
                  </FieldGroup>
                </form>
              ) : null}
            </CardContent>
          </Card>
        ) : null}

        {order && run ? (
          <Card>
            <CardHeader>
              <CardTitle className="text-base">Run events</CardTitle>
              <CardDescription>Persisted stage events from the worker, in order. No fabricated progress percentages.</CardDescription>
            </CardHeader>
            <CardContent>
              <ol className="space-y-1.5 text-sm">
                {events.map((e) => (
                  <li key={e.id} className="grid gap-x-3 sm:grid-cols-[9.5rem_7rem_1fr]">
                    <span className="font-mono text-xs text-muted-foreground">{e.at.slice(11, 19)}</span>
                    <span className="font-medium">{e.stage}</span>
                    <span className="whitespace-pre-wrap break-words text-muted-foreground">{e.detail}</span>
                  </li>
                ))}
                {!events.length ? <li className="text-muted-foreground">Waiting for the first persisted event…</li> : null}
              </ol>
            </CardContent>
          </Card>
        ) : null}
      </div>

      <aside className="space-y-4 lg:sticky lg:top-6 lg:self-start">
        {requestId && detail ? (
          <Card>
            <CardHeader>
              <CardTitle className="text-base">Preflight</CardTitle>
              <CardDescription>Readability and scope only. Not engineering validity.</CardDescription>
            </CardHeader>
            <CardContent>
              <ul className="space-y-1.5 text-sm">
                {detail.preflight.checks.map((c) => (
                  <li key={c.id} className="flex gap-2">
                    {c.status === "pass" ? <CheckCircle2 className="mt-0.5 size-4 shrink-0 text-primary" aria-hidden="true" /> : c.status === "warn" ? <CircleDashed className="mt-0.5 size-4 shrink-0 text-amber-600" aria-hidden="true" /> : <XCircle className="mt-0.5 size-4 shrink-0 text-destructive" aria-hidden="true" />}
                    <span>
                      <span className="font-medium">{c.label}</span>
                      <span className="sr-only"> — {c.status}</span>
                      <span className="block text-muted-foreground">{c.detail}</span>
                    </span>
                  </li>
                ))}
              </ul>
            </CardContent>
          </Card>
        ) : null}

        {requestId && detail && offer ? <PurchaseCard detail={detail} offer={offer} order={order} run={run} status={status} busy={busy} onPurchase={purchase} onAction={orderAction} dirty={dirty} /> : null}
      </aside>
    </div>
  );
}

function PurchaseCard({ detail, offer, order, run, status, busy, onPurchase, onAction, dirty }: { detail: Detail; offer: Offer; order: OrderRecord | null; run: Status["run"]; status: Status | null; busy: string | null; onPurchase: () => void; onAction: (a: "retry" | "cancel-run" | "cancel-order") => void; dirty: boolean }) {
  const price = `${offer.currency === "usd" ? "US$" : offer.currency.toUpperCase() + " "}${offer.amount}`;
  const payments = detail.payments;
  const state = useMemo(() => {
    if (!order) return payments.kind === "none" ? "payments-unavailable" : "unpurchased";
    if (order.status === "checkout_pending") return "payment-pending";
    if (order.status === "canceled" || order.status === "failed") return `order-${order.status}`;
    if (order.status === "revoked" || order.status === "refunded") return "revoked";
    if (!run) return "paid-waiting";
    if (run.status === "ready") return "ready";
    if (run.status === "failed") return status?.budget.exhausted ? "failed-budget" : "failed";
    if (run.status === "canceled") return "canceled";
    return run.status; // queued | running
  }, [order, run, payments.kind, status]);
  return (
    <Card>
      <CardHeader>
        <CardDescription>{offer.title}</CardDescription>
        <CardTitle className="text-xl">{price}</CardTitle>
        <CardDescription>
          {offer.priceStatus === "hypothesis" ? "Pricing hypothesis · " : ""}
          {payments.kind === "whop" ? (payments.sandbox ? "Whop sandbox (test money)" : "Whop live") : payments.kind === "simulated" ? "Simulated sandbox (labeled test double, no money moves)" : "Payments unavailable"}
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-3 text-sm">
        {state === "payments-unavailable" ? (
          <Alert>
            <AlertTitle>Purchase unavailable</AlertTitle>
            <AlertDescription>{payments.reason} Your draft and sources are saved.</AlertDescription>
          </Alert>
        ) : null}
        {state === "unpurchased" ? (
          <>
            <p className="text-muted-foreground">Purchasing freezes this request as version 1 and creates one fulfillment run after the payment is verified server-side.</p>
            <Button className="w-full" disabled={!detail.preflight.ok || busy === "purchase"} onClick={onPurchase}>
              {busy === "purchase" ? "Opening checkout…" : dirty ? "Save and purchase" : "Purchase"}
            </Button>
            {!detail.preflight.ok ? <p className="text-xs text-muted-foreground">Resolve the preflight failures first.</p> : null}
          </>
        ) : null}
        {state === "payment-pending" && order ? (
          <>
            <Badge variant="secondary">Payment pending</Badge>
            <p className="text-muted-foreground">Nothing is prepared until the provider confirms payment to the server. Returning from checkout is not confirmation; this page updates when the verified event arrives.</p>
            {order.whop.checkoutUrl ? (
              <Button asChild className="w-full">
                <a href={order.whop.checkoutUrl}>Continue to checkout</a>
              </Button>
            ) : null}
            <Button variant="ghost" className="w-full" disabled={busy === "cancel-order"} onClick={() => onAction("cancel-order")}>
              Cancel unpaid order
            </Button>
          </>
        ) : null}
        {state === "order-canceled" || state === "order-failed" ? (
          <>
            <Badge variant="outline">Order {order?.status}</Badge>
            <p className="text-muted-foreground">No payment was verified. You can purchase again; the frozen request stays as version {detail.request.frozenVersion}.</p>
            <Button className="w-full" disabled={busy === "purchase"} onClick={onPurchase}>
              Purchase again
            </Button>
          </>
        ) : null}
        {state === "revoked" ? (
          <>
            <Badge variant="destructive">Access revoked</Badge>
            <p className="text-muted-foreground">A refund or chargeback revoked access to this packet ({order?.revokeReason}). The packet stays stored but is no longer readable.</p>
          </>
        ) : null}
        {state === "paid-waiting" || state === "queued" ? (
          <>
            <Badge variant="secondary">Paid · queued</Badge>
            <p className="text-muted-foreground">Payment verified. The worker will claim the run{status?.worker.running ? "" : `; no worker is running in this process (${status?.worker.reason})`}.</p>
            <Button variant="ghost" className="w-full" disabled={busy === "cancel-run"} onClick={() => onAction("cancel-run")}>
              Cancel run
            </Button>
          </>
        ) : null}
        {state === "running" ? (
          <>
            <Badge variant="secondary" className="gap-1">
              <Spinner className="size-3" /> Preparing
            </Badge>
            <p className="text-muted-foreground">
              Attempt {run?.attempt} · {run?.requested.model} · effort {run?.effective?.effort ?? run?.requested.effort} · tool calls {run?.toolCalls} · repairs {run?.repairs} · escalations {run?.escalations}
            </p>
            <Button variant="ghost" className="w-full" disabled={busy === "cancel-run" || run?.cancelRequested} onClick={() => onAction("cancel-run")}>
              {run?.cancelRequested ? "Cancellation requested" : "Cancel run"}
            </Button>
          </>
        ) : null}
        {state === "ready" && order ? (
          <>
            <Badge>Packet ready</Badge>
            <p className="text-muted-foreground">Preparation delivered. Not engineering approval.</p>
            <Button asChild className="w-full">
              <Link href={`/orders/${order.id}/packet`}>View packet</Link>
            </Button>
          </>
        ) : null}
        {state === "failed" || state === "canceled" ? (
          <>
            <Badge variant={state === "failed" ? "destructive" : "outline"}>Run {state}</Badge>
            <p className="whitespace-pre-wrap text-muted-foreground">{run?.error}</p>
            <p className="text-xs text-muted-foreground">
              Budget: ${status?.budget.spentUsd.toFixed(2)} of ${status?.budget.ceilingUsd.toFixed(2)} spent across attempts.
            </p>
            <Button className="w-full" disabled={busy === "retry"} onClick={() => onAction("retry")}>
              <RefreshCw data-icon="inline-start" /> Retry (no new charge)
            </Button>
          </>
        ) : null}
        {state === "failed-budget" ? (
          <>
            <Badge variant="destructive">Run failed · budget exhausted</Badge>
            <p className="whitespace-pre-wrap text-muted-foreground">{run?.error}</p>
            <p className="text-xs text-muted-foreground">
              ${status?.budget.spentUsd.toFixed(2)} of the ${status?.budget.ceilingUsd.toFixed(2)} order budget was spent. Your paid entitlement is retained; the operator must adjust the budget before another attempt. You are never charged again automatically.
            </p>
          </>
        ) : null}
        <p className="border-t border-border pt-3 text-xs text-muted-foreground">{offer.terms[0]}</p>
      </CardContent>
    </Card>
  );
}

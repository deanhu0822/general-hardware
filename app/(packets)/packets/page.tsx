"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { Plus } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Empty, EmptyContent, EmptyDescription, EmptyHeader, EmptyTitle } from "@/components/ui/empty";
import { Skeleton } from "@/components/ui/skeleton";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { api, ApiError } from "@/components/packets/api";
import { sectorLabel } from "@/lib/packets/client-model";

type Item = { requestId: string; title: string; product: string; sectorTags: string[]; frozenVersion: number | null; createdAt: string; orderId: string | null; orderStatus: string | null; sandbox: boolean; runStatus: string | null; entitled: boolean };

function stateLabel(i: Item): { label: string; tone: "default" | "secondary" | "outline" | "destructive" } {
  if (!i.orderId) return { label: "Draft", tone: "outline" };
  if (i.orderStatus === "checkout_pending") return { label: "Payment pending", tone: "secondary" };
  if (i.orderStatus === "revoked" || i.orderStatus === "refunded") return { label: "Access revoked", tone: "destructive" };
  if (i.orderStatus === "failed" || i.orderStatus === "canceled") return { label: `Order ${i.orderStatus}`, tone: "outline" };
  if (i.runStatus === "ready") return { label: "Packet ready", tone: "default" };
  if (i.runStatus === "failed") return { label: "Run failed · retry available", tone: "destructive" };
  if (i.runStatus === "canceled") return { label: "Run canceled · retry available", tone: "outline" };
  return { label: i.runStatus === "running" ? "Preparing" : "Queued", tone: "secondary" };
}

/** My packets: compact list for returning customers. Filtering by sector uses ANY within selected tags, persisted in the URL. */
export default function MyPacketsPage() {
  const [items, setItems] = useState<Item[] | null>(null);
  const [error, setError] = useState<{ message: string; status: number } | null>(null);
  const [sectors, setSectors] = useState<string[]>(() => (typeof window === "undefined" ? [] : new URLSearchParams(window.location.search).getAll("sector")));
  useEffect(() => {
    api<{ items: Item[] }>("/api/packets/mine")
      .then((r) => setItems(r.items))
      .catch((e) => setError({ message: e instanceof ApiError ? e.message : "Could not load.", status: e instanceof ApiError ? e.status : 500 }));
  }, []);
  useEffect(() => {
    const url = new URL(window.location.href);
    url.searchParams.delete("sector");
    sectors.forEach((s) => url.searchParams.append("sector", s));
    window.history.replaceState(null, "", url);
  }, [sectors]);
  if (error?.status === 401)
    return (
      <Empty>
        <EmptyHeader>
          <EmptyTitle>Sign in to see your packets</EmptyTitle>
          <EmptyDescription>Your requests, orders and delivered packets are private to your account.</EmptyDescription>
        </EmptyHeader>
        <EmptyContent>
          <Button asChild>
            <Link href="/account?next=/packets">Sign in</Link>
          </Button>
        </EmptyContent>
      </Empty>
    );
  if (error) return <p role="alert" className="text-destructive">{error.message}</p>;
  const allTags = Array.from(new Set((items ?? []).flatMap((i) => i.sectorTags)));
  const shown = (items ?? []).filter((i) => !sectors.length || i.sectorTags.some((t) => sectors.includes(t)));
  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h1>My packets</h1>
        <Button asChild>
          <Link href="/packets/new">
            <Plus data-icon="inline-start" /> New request
          </Link>
        </Button>
      </div>
      {allTags.length > 1 ? (
        <div className="flex flex-wrap items-center gap-1.5" role="group" aria-label="Filter by sector">
          {allTags.map((t) => {
            const on = sectors.includes(t);
            return (
              <Button key={t} size="sm" variant={on ? "default" : "outline"} aria-pressed={on} onClick={() => setSectors(on ? sectors.filter((x) => x !== t) : [...sectors, t])}>
                {sectorLabel(t)}
              </Button>
            );
          })}
        </div>
      ) : null}
      {items === null ? (
        <div className="space-y-2" aria-busy="true" aria-label="Loading your packets">
          <Skeleton className="h-10 w-full" />
          <Skeleton className="h-10 w-full" />
        </div>
      ) : shown.length === 0 ? (
        <Empty>
          <EmptyHeader>
            <EmptyTitle>No packets yet</EmptyTitle>
            <EmptyDescription>Start a request: brief, sources, preflight, then purchase. Drafts are saved as you go.</EmptyDescription>
          </EmptyHeader>
          <EmptyContent>
            <Button asChild>
              <Link href="/packets/new">Prepare my packet</Link>
            </Button>
          </EmptyContent>
        </Empty>
      ) : (
        <div className="overflow-x-auto rounded-lg border border-border bg-background">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Request</TableHead>
                <TableHead>Sector</TableHead>
                <TableHead>State</TableHead>
                <TableHead>Created</TableHead>
                <TableHead />
              </TableRow>
            </TableHeader>
            <TableBody>
              {shown.map((i) => {
                const s = stateLabel(i);
                const href = i.orderId && i.runStatus === "ready" && i.entitled ? `/orders/${i.orderId}/packet` : `/packets/${i.requestId}`;
                return (
                  <TableRow key={i.requestId}>
                    <TableCell className="whitespace-normal">
                      <Link href={href} className="font-medium hover:underline">
                        {i.title}
                      </Link>
                      <div className="text-xs text-muted-foreground">
                        {i.product}
                        {i.frozenVersion ? ` · v${i.frozenVersion}` : " · draft"}
                        {i.sandbox && i.orderId ? " · sandbox" : ""}
                      </div>
                    </TableCell>
                    <TableCell className="whitespace-normal text-xs">{i.sectorTags.map(sectorLabel).join(", ")}</TableCell>
                    <TableCell>
                      <Badge variant={s.tone}>{s.label}</Badge>
                    </TableCell>
                    <TableCell className="text-xs text-muted-foreground">{i.createdAt.slice(0, 10)}</TableCell>
                    <TableCell>
                      <Button asChild size="sm" variant="outline">
                        <Link href={href}>{i.runStatus === "ready" && i.entitled ? "View packet" : "Open"}</Link>
                      </Button>
                    </TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        </div>
      )}
    </div>
  );
}

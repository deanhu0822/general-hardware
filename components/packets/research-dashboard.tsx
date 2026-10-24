"use client";

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Field, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Textarea } from "@/components/ui/textarea";
import { api, ApiError } from "./api";
import type { StudyAnalysis, StudyRecord } from "@/lib/research/store";

type Ops = { operations: Record<string, unknown>; orders: { id: string; status: string; provider: string; sandbox: boolean; amount: string; currency: string; createdAt: string; budgetCeiling: number; spentUsd: number }[]; policy: Record<string, unknown>; runner: { kind: string; reason: string }; payments: { kind: string; reason: string; sandbox: boolean | null; companyId: string | null }; worker: { running: boolean; owner: string | null; runner: string; reason: string } };
type Research = { protocol: Record<string, unknown> & { targetPerRound: number; exclusions: string[] }; studies: { study: StudyRecord; analysis: StudyAnalysis; teracSubmissions: { submissionId: string; status: string }[] }[] };

/** Owner-only Research and operations. Shows counts, exclusions and limitations; never participant identities or customer sources. */
export function ResearchDashboard() {
  const [ops, setOps] = useState<Ops | null>(null);
  const [research, setResearch] = useState<Research | null>(null);
  const [error, setError] = useState<ApiError | null>(null);
  const [form, setForm] = useState({ studyId: "", opportunityId: "", projectId: "", taskUrl: "", submissions: "", orderId: "", ceiling: "", reason: "" });
  const [notice, setNotice] = useState<string | null>(null);
  const load = useCallback(async () => {
    try {
      const [o, r] = await Promise.all([api<Ops>("/api/packets/ops"), api<Research>("/api/research/studies")]);
      setOps(o);
      setResearch(r);
      setError(null);
    } catch (e) {
      setError(e instanceof ApiError ? e : new ApiError("Could not load.", 500, "error"));
    }
  }, []);
  useEffect(() => {
    void Promise.resolve().then(load);
  }, [load]);
  async function run(label: string, fn: () => Promise<unknown>) {
    setNotice(null);
    try {
      await fn();
      setNotice(`${label}: done.`);
      await load();
    } catch (e) {
      setNotice(`${label}: ${e instanceof ApiError ? e.message : "failed"}`);
    }
  }
  if (error?.status === 401 || error?.status === 403)
    return (
      <Alert>
        <AlertTitle>Owner access required</AlertTitle>
        <AlertDescription>
          Research and operations are owner-only.{" "}
          <Link href="/account?next=/research" className="text-primary underline-offset-4 hover:underline">
            Sign in as the owner
          </Link>
          .
        </AlertDescription>
      </Alert>
    );
  if (error) return <p role="alert" className="text-destructive">{error.message}</p>;
  if (!ops || !research) return <p aria-busy="true">Loading…</p>;
  const o = ops.operations as { orders: Record<string, number>; runs: Record<string, number>; requests: number };
  return (
    <div className="space-y-6">
      <h1>Research and operations</h1>
      {notice ? (
        <p role="status" className="text-sm text-muted-foreground">
          {notice}
        </p>
      ) : null}

      <section className="grid gap-4 md:grid-cols-3">
        <Card>
          <CardHeader>
            <CardDescription>Runtime</CardDescription>
            <CardTitle className="text-base">{ops.runner.kind}</CardTitle>
          </CardHeader>
          <CardContent className="text-xs text-muted-foreground">
            <p>{ops.runner.reason}</p>
            <p className="mt-1">
              Worker: {ops.worker.running ? `running (${ops.worker.owner})` : "not running"} · {ops.worker.reason}
            </p>
            <p className="mt-1">
              Policy {String(ops.policy.version)} · default {String(ops.policy.defaultEffort)} ({ops.policy.evaluated ? "evaluated" : "provisional"}) · max {String(ops.policy.maxEffort)} · ceiling ${Number(ops.policy.orderBudgetUsd).toFixed(2)}
            </p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader>
            <CardDescription>Payments</CardDescription>
            <CardTitle className="text-base">
              {ops.payments.kind}
              {ops.payments.sandbox ? " · sandbox" : ""}
            </CardTitle>
          </CardHeader>
          <CardContent className="text-xs text-muted-foreground">
            <p>{ops.payments.reason}</p>
            <p className="mt-1">Business: {ops.payments.companyId ?? "none"}</p>
            <p className="mt-1">
              Live paid {o.orders.live} · live gross ${Number(o.orders.liveGrossReceipts ?? 0).toFixed(2)} · live net ${Number(o.orders.liveNetReceipts ?? 0).toFixed(2)} · live refunded/revoked {o.orders.liveRefunded} · Whop sandbox {o.orders.sandbox} · simulated {o.orders.simulated}
            </p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader>
            <CardDescription>Runs</CardDescription>
            <CardTitle className="text-base">
              {o.runs.ready} ready · {o.runs.failed} failed · {o.runs.canceled} canceled · {o.runs.active} active
            </CardTitle>
          </CardHeader>
          <CardContent className="text-xs text-muted-foreground">
            <p>Total model cost (SDK estimate, including failed attempts): ${Number(o.runs.costUsd).toFixed(4)}</p>
            <p className="mt-1">
              Requests {o.requests} · orders {o.orders.total} (paid {o.orders.paid}, pending {o.orders.pending}, revoked {o.orders.revoked})
            </p>
          </CardContent>
        </Card>
      </section>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Orders and budgets</CardTitle>
          <CardDescription>Owner adjustment raises one order’s cumulative ceiling explicitly. It never charges the customer.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Order</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>Provider</TableHead>
                  <TableHead>Amount</TableHead>
                  <TableHead>Spent / ceiling</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {ops.orders.slice(0, 20).map((x) => (
                  <TableRow key={x.id}>
                    <TableCell className="font-mono text-xs">{x.id.slice(0, 8)}…</TableCell>
                    <TableCell>{x.status}</TableCell>
                    <TableCell>
                      {x.provider}
                      {x.sandbox ? " (sandbox)" : ""}
                    </TableCell>
                    <TableCell>
                      {x.amount} {x.currency}
                    </TableCell>
                    <TableCell>
                      ${x.spentUsd.toFixed(4)} / ${x.budgetCeiling.toFixed(2)}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
          <form
            className="grid gap-3 sm:grid-cols-4"
            onSubmit={(e) => {
              e.preventDefault();
              void run("Adjust budget", () => api("/api/packets/ops", { json: { action: "adjust-budget", orderId: form.orderId, ceilingUsd: Number(form.ceiling), reason: form.reason } }));
            }}
          >
            <Field>
              <FieldLabel htmlFor="b-order">Order id</FieldLabel>
              <Input id="b-order" value={form.orderId} onChange={(e) => setForm({ ...form, orderId: e.target.value })} />
            </Field>
            <Field>
              <FieldLabel htmlFor="b-ceiling">New ceiling (USD)</FieldLabel>
              <Input id="b-ceiling" type="number" step="0.25" min="0.25" value={form.ceiling} onChange={(e) => setForm({ ...form, ceiling: e.target.value })} />
            </Field>
            <Field>
              <FieldLabel htmlFor="b-reason">Reason</FieldLabel>
              <Input id="b-reason" value={form.reason} onChange={(e) => setForm({ ...form, reason: e.target.value })} />
            </Field>
            <div className="self-end">
              <Button type="submit" variant="outline">
                Adjust budget
              </Button>
            </div>
          </form>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Terac usability study</CardTitle>
          <CardDescription>
            Frozen protocol: target {research.protocol.targetPerRound} valid participants per round; primary metric is all-three-correct over valid completed participants. Predeclared exclusions: {research.protocol.exclusions.join(" ")} Launch happens through the hosted Terac MCP after owner authorization; this page records bindings and retrieved submissions.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex flex-wrap gap-2">
            <Button variant="outline" onClick={() => run("Create study A", () => api("/api/research/studies", { json: { action: "create", round: "A", presentation: "A" } }))}>
              Create baseline study (round A, presentation A)
            </Button>
            <Button variant="outline" onClick={() => run("Create study B", () => api("/api/research/studies", { json: { action: "create", round: "B", presentation: "B" } }))}>
              Create follow-up study (round B, presentation B)
            </Button>
          </div>
          {research.studies.length === 0 ? <p className="text-sm text-muted-foreground">No studies yet.</p> : null}
          {research.studies.map(({ study, analysis, teracSubmissions }) => (
            <div key={study.id} className="space-y-3 rounded-lg border border-border p-4">
              <div className="flex flex-wrap items-center gap-2">
                <Badge>
                  Round {study.round} · presentation {study.presentation}
                </Badge>
                <Badge variant="outline">{study.status}</Badge>
                <span className="font-mono text-xs text-muted-foreground">{study.id}</span>
                <Link href={`/study/${study.id}`} className="text-xs text-primary underline-offset-4 hover:underline" target="_blank">
                  participant page (preview)
                </Link>
              </div>
              <p className="text-xs text-muted-foreground">
                Definition digest {study.definitionDigest.slice(0, 16)}… · packet {study.packetDigest.slice(0, 16)}… · Terac opportunity {study.terac.opportunityId ?? "unbound"} · submissions imported {teracSubmissions.length}
              </p>
              <dl className="grid gap-x-4 gap-y-1 text-sm sm:grid-cols-[14rem_1fr]">
                <dt className="text-muted-foreground">All three correct</dt>
                <dd>
                  {analysis.primary.allThreeCorrect} / {analysis.primary.denominator} {analysis.primary.proportion === null ? "" : `(${Math.round(analysis.primary.proportion * 100)}%)`}
                </dd>
                <dt className="text-muted-foreground">Per question</dt>
                <dd>
                  q1 {analysis.perQuestion.q1} · q2 {analysis.perQuestion.q2} · q3 {analysis.perQuestion.q3} · false approvals {analysis.falseApprovals}
                </dd>
                <dt className="text-muted-foreground">Counts</dt>
                <dd>
                  valid {analysis.counts.valid} · bound {analysis.counts.bound} · excluded {analysis.counts.excluded} · abandoned {analysis.counts.abandoned} · timed out {analysis.counts.timedOut} · unbound tracked {analysis.counts.trackedUnbound} · previews {analysis.counts.previews}
                </dd>
                <dt className="text-muted-foreground">Correct-completer time</dt>
                <dd>{analysis.medianCorrectCompleterMs === null ? "n/a" : `${analysis.correctCompleterTimesMs.map((t) => Math.round(t / 1000)).join(", ")} s (median ${Math.round(analysis.medianCorrectCompleterMs / 1000)} s, n=${analysis.correctCompleterTimesMs.length})`}</dd>
                {analysis.confusion.length ? (
                  <>
                    <dt className="text-muted-foreground">Reported confusion</dt>
                    <dd className="whitespace-pre-wrap">{analysis.confusion.join("\n")}</dd>
                  </>
                ) : null}
              </dl>
              <details>
                <summary className="cursor-pointer text-sm font-medium">Bind to Terac / import retrieved submissions</summary>
                <div className="mt-3 grid gap-3">
                  <div className="grid gap-3 sm:grid-cols-3">
                    <Field>
                      <FieldLabel htmlFor={`opp-${study.id}`}>Opportunity id</FieldLabel>
                      <Input id={`opp-${study.id}`} defaultValue={study.terac.opportunityId ?? ""} onChange={(e) => setForm({ ...form, studyId: study.id, opportunityId: e.target.value })} />
                    </Field>
                    <Field>
                      <FieldLabel htmlFor={`proj-${study.id}`}>Project id</FieldLabel>
                      <Input id={`proj-${study.id}`} defaultValue={study.terac.projectId ?? ""} onChange={(e) => setForm({ ...form, studyId: study.id, projectId: e.target.value })} />
                    </Field>
                    <Field>
                      <FieldLabel htmlFor={`url-${study.id}`}>Task URL</FieldLabel>
                      <Input id={`url-${study.id}`} defaultValue={study.terac.taskUrl ?? ""} onChange={(e) => setForm({ ...form, studyId: study.id, taskUrl: e.target.value })} />
                    </Field>
                  </div>
                  <div className="flex flex-wrap gap-2">
                    <Button size="sm" variant="outline" onClick={() => run("Bind", () => api("/api/research/studies", { json: { action: "update", studyId: study.id, terac: { opportunityId: form.opportunityId || study.terac.opportunityId, projectId: form.projectId || study.terac.projectId, taskUrl: form.taskUrl || study.terac.taskUrl } } }))}>
                      Save binding
                    </Button>
                    {(["quoted", "authorized", "launched", "analyzed", "closed"] as const).map((s) => (
                      <Button key={s} size="sm" variant="ghost" onClick={() => run(`Status ${s}`, () => api("/api/research/studies", { json: { action: "update", studyId: study.id, status: s, terac: s === "launched" ? { launchedAt: new Date().toISOString() } : undefined } }))}>
                        mark {s}
                      </Button>
                    ))}
                  </div>
                  <Field>
                    <FieldLabel htmlFor={`sub-${study.id}`}>Retrieved Terac submissions (JSON array from terac_get_submissions)</FieldLabel>
                    <Textarea id={`sub-${study.id}`} rows={4} onChange={(e) => setForm({ ...form, studyId: study.id, submissions: e.target.value })} />
                  </Field>
                  <div>
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={() =>
                        run("Import submissions", () => {
                          const parsed = JSON.parse(form.submissions || "[]");
                          return api("/api/research/studies", { json: { action: "import-submissions", studyId: study.id, submissions: Array.isArray(parsed) ? parsed : (parsed.submissions ?? parsed.data ?? []) } });
                        })
                      }
                    >
                      Import and bind
                    </Button>
                  </div>
                </div>
              </details>
              <details>
                <summary className="cursor-pointer text-sm font-medium">Limitations</summary>
                <ul className="mt-2 list-disc pl-5 text-xs text-muted-foreground">
                  {analysis.limitations.map((l) => (
                    <li key={l}>{l}</li>
                  ))}
                </ul>
              </details>
            </div>
          ))}
        </CardContent>
      </Card>
    </div>
  );
}

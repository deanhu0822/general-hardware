import Link from "next/link";
import { Button } from "@/components/ui/button";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { SECTOR_CASES, SECTOR_BENCHMARK_VERSION, toSectorEvalCase } from "@/lib/packets/sector-benchmark";
import { SECTOR_TAGS } from "@/lib/packets/model";

export const dynamic = "force-dynamic";

/** Public, read-only synthetic inputs. Never dispatches a worker or creates an order. */
export default async function CoveragePage({ searchParams }: { searchParams: Promise<{ case?: string }> }) {
  const query = await searchParams;
  const selected = SECTOR_CASES.find((c) => c.id === query.case) ?? SECTOR_CASES[0];
  const evaluated = toSectorEvalCase(selected);
  const payload = { benchmarkVersion: SECTOR_BENCHMARK_VERSION, synthetic: true, caseId: selected.id, frozen: evaluated.frozen, sources: selected.sources.map(({ sourceId, name, revision, content, sha256 }) => ({ sourceId, name, revision, content, sha256 })) };
  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div><h1 className="text-2xl font-semibold tracking-tight">Synthetic evaluation library</h1><p className="mt-1 text-sm text-muted-foreground">8 sectors · 16 products · 64 cases · 176 source documents</p></div>
        <Button asChild variant="outline"><Link href="/sample">Rover research sample</Link></Button>
      </div>
      <Alert><AlertTitle>Demo inputs, not completed model evaluations</AlertTitle><AlertDescription>Every record is invented. Each sector has two products and all four evidence conditions. The original Rover/Terac study stays frozen. Answer keys are draft rubrics requiring independent review; domain certification is outside this benchmark.</AlertDescription></Alert>
      <form action="/sample/coverage" method="get" className="flex flex-wrap items-end gap-3">
        <div className="min-w-0 flex-1"><label htmlFor="fixture-case" className="mb-2 block text-sm font-medium">Choose a sector and case</label>
          <select id="fixture-case" name="case" defaultValue={selected.id} className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm">
            {SECTOR_TAGS.map((s) => <optgroup label={`${s.label} — 8 cases`} key={s.id}>{SECTOR_CASES.filter((c) => c.sector === s.id).map((c) => <option key={c.id} value={c.id}>{c.brief.product} · {c.kind === "complete" ? "documented" : c.kind} · {c.split}</option>)}</optgroup>)}
          </select></div><Button type="submit">View fixture</Button>
      </form>
      <section className="space-y-4 rounded-lg border bg-background p-5" aria-label="Selected fixture">
        <div><p className="text-sm text-muted-foreground">{selected.sectorLabel} · {selected.kind === "complete" ? "documented evidence" : selected.kind} · {selected.split}</p><h2 className="mt-1 text-xl font-medium">{selected.brief.title}</h2><p className="mt-2 text-sm">{selected.description}</p></div>
        <dl className="grid gap-3 text-sm sm:grid-cols-2"><div><dt className="text-muted-foreground">Baseline</dt><dd>{selected.brief.baseline || "Unknown"}</dd></div><div><dt className="text-muted-foreground">Live model result</dt><dd>Not linked — use evaluation receipts</dd></div></dl>
        <p className="text-sm">{selected.brief.issue}</p>
        <details><summary className="cursor-pointer text-sm font-medium">Request and immutable manifest</summary><pre className="mt-3 whitespace-pre-wrap break-all text-xs">{JSON.stringify(evaluated.frozen, null, 2)}</pre></details>
        <Button asChild variant="outline"><a download={`${selected.id}-input.json`} href={`data:application/json;charset=utf-8,${encodeURIComponent(JSON.stringify(payload, null, 2))}`}>Download worker input</a></Button>
        <p className="text-xs text-muted-foreground">The download contains only the request and sources. Evaluation answer keys are never supplied to the model.</p>
      </section>
      <section aria-label="Frozen source documents" className="space-y-3"><h2 className="text-lg font-medium">Frozen source documents</h2>{selected.sources.map((s) => <details key={s.sourceId} className="rounded-lg border bg-background p-4"><summary className="cursor-pointer text-sm font-medium">{s.name}</summary><p className="my-2 break-all font-mono text-xs text-muted-foreground">{s.sourceId} · {s.revision} · SHA-256 {s.sha256}</p><pre className="whitespace-pre-wrap break-words text-sm">{s.content}</pre></details>)}</section>
      <details><summary className="cursor-pointer text-sm font-medium">Coverage and repeat protocol</summary><div className="mt-3 space-y-3 text-sm"><p>Each sector has one development product and one product reserved for holdout evaluation, with documented, missing, conflicting and adversarial evidence. Two repeats produce 128 scheduled runs per effort policy. Related generated cases are not statistically independent.</p><p>Compare sector × evidence-condition results, failures, citation binding, authority errors, cost and latency. Incomplete runs remain in the planned denominator. Automated rubric checks do not replace independent factual-support review.</p><p>Run <code>node scripts/evaluate-sectors.cjs</code> for a no-cost plan, or add <code>--smoke</code> for a clearly labeled test-double pipeline check. Live Opus evaluation requires an explicit budget.</p></div></details>
    </div>
  );
}

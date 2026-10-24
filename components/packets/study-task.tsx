"use client";

import { useEffect, useRef, useState } from "react";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { Textarea } from "@/components/ui/textarea";
import { api, ApiError } from "./api";
import { PacketView } from "./packet-view";
import type { Packet } from "@/lib/packets/model";

type Study = { id: string; presentation: "A" | "B"; scenario: string; timeoutSeconds: number; questions: { id: string; prompt: string; kind: "choice" | "selection"; options: readonly { id: string; label: string }[] | null }[]; status: string };
type Sample = { packet: Packet; sources: { sourceId: string; content: string }[] };

/**
 * Participant task page for the Terac usability study. Public, synthetic
 * fixture only. Terac appends teracSubmissionId/submissionId/taskId to the URL;
 * responses are keyed by them and redirected to Terac's completion callback.
 */
export function StudyTask({ studyId }: { studyId: string }) {
  const [study, setStudy] = useState<Study | null>(null);
  const [sample, setSample] = useState<Sample | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [answers, setAnswers] = useState<{ q1: string | null; q2: string | null; q3: string | null }>({ q1: null, q2: null, q3: null });
  const [confusion, setConfusion] = useState("");
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState<{ callbackUrl: string | null; provenance: string } | null>(null);
  const [tracked, setTracked] = useState(true);
  const opens = useRef(0);
  const tracking = useRef<{ sub: string | null; task: string | null; previewKey: string | null }>({ sub: null, task: null, previewKey: null });

  useEffect(() => {
    const q = new URLSearchParams(window.location.search);
    tracking.current = { sub: q.get("teracSubmissionId") || q.get("submissionId"), task: q.get("taskId"), previewKey: null };
    void Promise.resolve().then(() => setTracked(!!tracking.current.sub));
    Promise.all([api<{ study: Study }>(`/api/research/participate?study=${encodeURIComponent(studyId)}`), api<Sample>("/api/packets/sample")])
      .then(async ([s, p]) => {
        setStudy(s.study);
        setSample(p);
        const r = await api<{ response: { id: string; provenance: string } }>("/api/research/participate", { json: { action: "start", studyId, teracSubmissionId: tracking.current.sub, taskId: tracking.current.task } });
        if (r.response.provenance === "preview") tracking.current.previewKey = null;
      })
      .catch((e) => setError(e instanceof ApiError ? e.message : "The study could not be loaded."));
  }, [studyId]);

  async function submit() {
    setBusy(true);
    setError(null);
    try {
      const r = await api<{ callbackUrl: string | null; provenance: string }>("/api/research/participate", {
        json: { action: "submit", studyId, teracSubmissionId: tracking.current.sub, taskId: tracking.current.task, answers, sourcePanelOpens: opens.current, confusion },
      });
      setDone(r);
      if (r.callbackUrl) window.location.assign(r.callbackUrl);
    } catch (e) {
      setError(e instanceof ApiError ? e.message : "Submission failed.");
    } finally {
      setBusy(false);
    }
  }

  if (error && !study) return <p role="alert" className="text-destructive">{error}</p>;
  if (!study || !sample) return <p aria-busy="true">Loading the task…</p>;
  const complete = answers.q1 && answers.q2 && answers.q3;
  if (done)
    return (
      <Alert>
        <AlertTitle>Thank you</AlertTitle>
        <AlertDescription>
          {done.provenance === "preview" ? "This was a preview without Terac tracking parameters; it is recorded separately and does not count as a participant." : done.callbackUrl ? "Your answers were recorded. Redirecting to Terac to mark the task complete…" : "Your answers were recorded."}
        </AlertDescription>
      </Alert>
    );
  return (
    <div className="space-y-6">
      <Card className="border-primary/40">
        <CardHeader>
          <CardDescription>Usability task · synthetic example · about 5 minutes</CardDescription>
          <CardTitle className="text-lg">{study.scenario}</CardTitle>
          <CardDescription>Read the packet below, then answer the three questions at the bottom. Everything in the packet is an invented example; you are not judging real hardware. {tracked ? "" : "Preview mode: no Terac tracking parameters were found, so this attempt is not counted."}</CardDescription>
        </CardHeader>
      </Card>

      <PacketView packet={sample.packet} mode="study" presentation={study.presentation} sources={sample.sources} onSourceOpen={() => (opens.current += 1)} onSelectEvidence={(id) => setAnswers((a) => ({ ...a, q2: id }))} selectedEvidence={answers.q2} />

      <Card id="questions">
        <CardHeader>
          <CardTitle className="text-base">Your answers</CardTitle>
        </CardHeader>
        <CardContent className="space-y-6">
          {study.questions.map((q, i) => (
            <fieldset key={q.id} className="space-y-2">
              <legend className="font-medium">
                {i + 1}. {q.prompt}
              </legend>
              {q.kind === "choice" && q.options ? (
                <RadioGroup value={answers[q.id as "q1" | "q3"] ?? ""} onValueChange={(v) => setAnswers((a) => ({ ...a, [q.id]: v }))}>
                  {q.options.map((o) => (
                    <div key={o.id} className="flex items-center gap-2">
                      <RadioGroupItem id={`${q.id}-${o.id}`} value={o.id} />
                      <Label htmlFor={`${q.id}-${o.id}`} className="font-normal">
                        {o.label}
                      </Label>
                    </div>
                  ))}
                </RadioGroup>
              ) : (
                <p className="text-sm text-muted-foreground">{answers.q2 ? `Selected: ${answers.q2}. Change it by selecting a different gap above.` : "Use a “Select this gap” button in the packet above."}</p>
              )}
            </fieldset>
          ))}
          <div className="space-y-2">
            <Label htmlFor="confusion">Was anything confusing? (optional)</Label>
            <Textarea id="confusion" rows={2} maxLength={1000} value={confusion} onChange={(e) => setConfusion(e.target.value)} />
          </div>
          {error ? (
            <p role="alert" className="text-sm text-destructive">
              {error}
            </p>
          ) : null}
          <Button disabled={!complete || busy} onClick={submit}>
            {busy ? "Submitting…" : "Submit answers"}
          </Button>
        </CardContent>
      </Card>
    </div>
  );
}

import type { NextRequest } from "next/server";
import { checkOrigin, failure, json, readJson } from "@/lib/packets/http";
import { PacketError } from "@/lib/packets/model";
import { services } from "@/lib/packets/service";
import { publicStudyDefinition } from "@/lib/research/store";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** Public participant endpoint. Serves the synthetic study only; records responses keyed by the Terac submission id from the task URL. */
export async function GET(request: NextRequest) {
  try {
    const { research } = services();
    const id = request.nextUrl.searchParams.get("study") || "";
    const study = research.study(id);
    return json({ study: publicStudyDefinition(study) });
  } catch (error) {
    return failure(error);
  }
}

export async function POST(request: NextRequest) {
  try {
    checkOrigin(request);
    const { research } = services();
    const data = await readJson(request, 16_000);
    const studyId = String(data.studyId ?? "");
    const sub = typeof data.teracSubmissionId === "string" && /^[A-Za-z0-9_-]{4,120}$/.test(data.teracSubmissionId) ? data.teracSubmissionId : null;
    const task = typeof data.taskId === "string" && /^[A-Za-z0-9_-]{1,120}$/.test(data.taskId) ? data.taskId : null;
    if (data.action === "start") {
      const r = research.start(studyId, sub, task);
      return json({ response: { id: r.id, startedAt: r.startedAt, provenance: r.provenance, submitted: !!r.submittedAt } });
    }
    if (data.action === "submit") {
      const study = research.study(studyId);
      const key = sub ?? String(data.previewKey ?? "");
      const r = research.submit(studyId, key, { answers: (data.answers as Record<string, unknown>) ?? {}, sourcePanelOpens: data.sourcePanelOpens, confusion: data.confusion });
      const host = study.terac.callbackHost || process.env.TERAC_CALLBACK_HOST || "https://terac.com";
      const callback = sub ? `${host}/api/external/callback?teracSubmissionId=${encodeURIComponent(sub)}&submissionId=${encodeURIComponent(sub)}${task ? `&taskId=${encodeURIComponent(task)}` : ""}&result=completed` : null;
      return json({ ok: true, submitted: !!r.submittedAt, provenance: r.provenance, callbackUrl: callback });
    }
    throw new PacketError("Unknown action.", 400);
  } catch (error) {
    return failure(error);
  }
}

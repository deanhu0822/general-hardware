import type { NextRequest } from "next/server";
import { checkOrigin, failure, json, readJson, requireOwner, text } from "@/lib/packets/http";
import { PacketError } from "@/lib/packets/model";
import { STUDY_PROTOCOL, STUDY_QUESTIONS, fixtureFrozen, fixturePacketDigest, studyDefinitionDigest } from "@/lib/packets/fixture";
import { services } from "@/lib/packets/service";
import type { Presentation, StudyStatus } from "@/lib/research/store";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** Owner-only research view: frozen protocol, studies, Terac bindings and analyses. No participant identities beyond Terac ids. */
export async function GET(request: NextRequest) {
  try {
    const { store, research } = services();
    requireOwner(request, store);
    const studies = research.studies();
    return json({
      protocol: { ...STUDY_PROTOCOL, questions: STUDY_QUESTIONS, fixtureManifestDigest: fixtureFrozen.manifestDigest, fixturePacketDigest, definitionDigests: { A: studyDefinitionDigest("A"), B: studyDefinitionDigest("B") } },
      studies: studies.map((s) => ({ study: s, analysis: research.analyze(s.id), teracSubmissions: research.teracSubmissions(s.id).map((t) => ({ submissionId: t.submissionId, status: t.status, participantId: t.participantId ? `participant-${t.participantId.slice(0, 6)}…` : null, importedAt: t.importedAt })), responses: research.responses(s.id).map((r) => ({ ...r, teracSubmissionId: r.provenance === "preview" ? "preview" : r.teracSubmissionId })) })),
    });
  } catch (error) {
    return failure(error);
  }
}

const statuses: StudyStatus[] = ["prepared", "quoted", "authorized", "launched", "responses-received", "analyzed", "closed"];

/** Owner actions on studies. Launch itself is never performed here: the hosted Terac MCP launches, and the record is updated after. */
export async function POST(request: NextRequest) {
  try {
    checkOrigin(request);
    const { store, research } = services();
    requireOwner(request, store);
    const data = await readJson(request, 512_000);
    if (data.action === "create") {
      const round = text("Round", data.round, 1) as Presentation;
      const presentation = text("Presentation", data.presentation, 1) as Presentation;
      if (!["A", "B"].includes(round) || !["A", "B"].includes(presentation)) throw new PacketError("Round and presentation must be A or B.", 400);
      return json({ study: research.createStudy(round, presentation, text("Notes", data.notes, 4000, false)) }, 201);
    }
    const id = text("Study", data.studyId, 80);
    if (data.action === "update") {
      const status = data.status === undefined ? undefined : (text("Status", data.status, 40) as StudyStatus);
      if (status && !statuses.includes(status)) throw new PacketError("Unknown status.", 400);
      const terac = data.terac && typeof data.terac === "object" ? (data.terac as Record<string, unknown>) : undefined;
      return json({ study: research.updateStudy(id, { status, terac: terac as never, notes: data.notes === undefined ? undefined : text("Notes", data.notes, 4000, false) }) });
    }
    if (data.action === "import-submissions") {
      const list = Array.isArray(data.submissions) ? (data.submissions as Record<string, unknown>[]) : [];
      return json({ imported: research.importTeracSubmissions(id, list), analysis: research.analyze(id) });
    }
    if (data.action === "exclude") {
      research.exclude(id, text("Submission", data.teracSubmissionId, 120), data.reason === null ? null : text("Reason", data.reason, 300));
      return json({ analysis: research.analyze(id) });
    }
    throw new PacketError("Unknown action.", 400);
  } catch (error) {
    return failure(error);
  }
}

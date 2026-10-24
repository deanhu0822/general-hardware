import { randomUUID } from "node:crypto";
import type { PacketStore } from "@/lib/packets/store";
import { PacketError, sha256 } from "@/lib/packets/model";
import { fixtureFrozen, fixturePacketDigest, STUDY_PROTOCOL, STUDY_QUESTIONS, studyDefinitionDigest } from "@/lib/packets/fixture";

/**
 * Research records for the Terac usability study.
 *
 * Every study is bound to one presentation variant (A or B), the frozen
 * synthetic packet digest, the frozen manifest digest and the frozen answer
 * key through `definitionDigest`. Every response is bound to a study and to
 * the Terac submission id that Terac appended to the task URL. Responses that
 * cannot be matched to a retrieved Terac submission are kept but reported
 * separately as unbound; only bound, completed, non-excluded responses count
 * as valid participants. Nothing here is customer data.
 */
export type Presentation = "A" | "B";
export type StudyStatus = "prepared" | "quoted" | "authorized" | "launched" | "responses-received" | "analyzed" | "closed";
export type StudyRecord = {
  id: string;
  round: Presentation;
  presentation: Presentation;
  status: StudyStatus;
  definitionDigest: string;
  packetDigest: string;
  manifestDigest: string;
  terac: { opportunityId: string | null; projectId: string | null; feasibilityRequestId: string | null; quote: Record<string, unknown> | null; dashboardUrls: Record<string, string> | null; launchedAt: string | null; taskUrl: string | null; callbackHost: string | null };
  notes: string;
  createdAt: string;
  updatedAt: string;
};
export type ResponseRecord = {
  id: string;
  studyId: string;
  teracSubmissionId: string;
  taskId: string | null;
  provenance: "terac-task-url" | "preview";
  startedAt: string;
  submittedAt: string | null;
  durationMs: number | null;
  answers: { q1: string | null; q2: string | null; q3: string | null } | null;
  sourcePanelOpens: number;
  confusion: string | null;
  scored: { q1: boolean; q2: boolean; q3: boolean; allThree: boolean; falseApproval: boolean } | null;
  excluded: string | null;
  bound: boolean;
};
export type TeracSubmissionRecord = { studyId: string; submissionId: string; status: string; participantId: string | null; createdAt: string | null; updatedAt: string | null; importedAt: string; raw: Record<string, unknown> };

const now = () => new Date().toISOString();
const parse = <T>(s: string | null): T | null => (s ? (JSON.parse(s) as T) : null);

export class ResearchStore {
  constructor(private readonly packets: PacketStore) {
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS rs_studies (id TEXT PRIMARY KEY, round TEXT NOT NULL, presentation TEXT NOT NULL, status TEXT NOT NULL, definition_digest TEXT NOT NULL, packet_digest TEXT NOT NULL, manifest_digest TEXT NOT NULL, terac TEXT NOT NULL, notes TEXT NOT NULL DEFAULT '', created_at TEXT NOT NULL, updated_at TEXT NOT NULL);
      CREATE TABLE IF NOT EXISTS rs_responses (id TEXT PRIMARY KEY, study_id TEXT NOT NULL, terac_submission_id TEXT NOT NULL, task_id TEXT, provenance TEXT NOT NULL, started_at TEXT NOT NULL, submitted_at TEXT, duration_ms INTEGER, answers TEXT, source_panel_opens INTEGER NOT NULL DEFAULT 0, confusion TEXT, scored TEXT, excluded TEXT, UNIQUE(study_id, terac_submission_id));
      CREATE TABLE IF NOT EXISTS rs_terac_submissions (study_id TEXT NOT NULL, submission_id TEXT NOT NULL, status TEXT NOT NULL, participant_id TEXT, created_at TEXT, updated_at TEXT, imported_at TEXT NOT NULL, raw TEXT NOT NULL, PRIMARY KEY(study_id, submission_id));
    `);
  }
  get db() {
    return this.packets.db;
  }
  transaction<T>(fn: () => T) {
    return this.packets.transaction(fn);
  }

  private rowToStudy(r: Record<string, unknown>): StudyRecord {
    return {
      id: r.id as string,
      round: r.round as Presentation,
      presentation: r.presentation as Presentation,
      status: r.status as StudyStatus,
      definitionDigest: r.definition_digest as string,
      packetDigest: r.packet_digest as string,
      manifestDigest: r.manifest_digest as string,
      terac: JSON.parse(r.terac as string),
      notes: (r.notes as string) ?? "",
      createdAt: r.created_at as string,
      updatedAt: r.updated_at as string,
    };
  }
  /** Freeze a study definition. The digest binds task, packet version, manifest, answer key, rubric and presentation. */
  createStudy(round: Presentation, presentation: Presentation, notes = ""): StudyRecord {
    const id = `study-${round.toLowerCase()}-${randomUUID().slice(0, 8)}`;
    const at = now();
    const terac: StudyRecord["terac"] = { opportunityId: null, projectId: null, feasibilityRequestId: null, quote: null, dashboardUrls: null, launchedAt: null, taskUrl: null, callbackHost: null };
    this.db
      .prepare("INSERT INTO rs_studies VALUES (?,?,?,?,?,?,?,?,?,?,?)")
      .run(id, round, presentation, "prepared", studyDefinitionDigest(presentation), fixturePacketDigest, fixtureFrozen.manifestDigest, JSON.stringify(terac), notes, at, at);
    return this.study(id);
  }
  study(id: string): StudyRecord {
    const row = this.db.prepare("SELECT * FROM rs_studies WHERE id=?").get(id) as Record<string, unknown> | undefined;
    if (!row) throw new PacketError("Study not found.", 404, "not_found");
    return this.rowToStudy(row);
  }
  studies(): StudyRecord[] {
    return (this.db.prepare("SELECT * FROM rs_studies ORDER BY created_at").all() as Record<string, unknown>[]).map((r) => this.rowToStudy(r));
  }
  updateStudy(id: string, patch: { status?: StudyStatus; terac?: Partial<StudyRecord["terac"]>; notes?: string }) {
    const s = this.study(id);
    const terac = { ...s.terac, ...(patch.terac ?? {}) };
    this.db
      .prepare("UPDATE rs_studies SET status=?, terac=?, notes=?, updated_at=? WHERE id=?")
      .run(patch.status ?? s.status, JSON.stringify(terac), patch.notes ?? s.notes, now(), id);
    return this.study(id);
  }

  // ------------------------------------------------------------- responses
  private rowToResponse(r: Record<string, unknown>, bound: boolean): ResponseRecord {
    return {
      id: r.id as string,
      studyId: r.study_id as string,
      teracSubmissionId: r.terac_submission_id as string,
      taskId: (r.task_id as string | null) ?? null,
      provenance: r.provenance as ResponseRecord["provenance"],
      startedAt: r.started_at as string,
      submittedAt: (r.submitted_at as string | null) ?? null,
      durationMs: (r.duration_ms as number | null) ?? null,
      answers: parse(r.answers as string | null),
      sourcePanelOpens: (r.source_panel_opens as number) ?? 0,
      confusion: (r.confusion as string | null) ?? null,
      scored: parse(r.scored as string | null),
      excluded: (r.excluded as string | null) ?? null,
      bound,
    };
  }
  /**
   * A participant opened the task page. Idempotent per (study, Terac submission).
   * Responses without Terac tracking parameters are recorded as previews and
   * never count as participants.
   */
  start(studyId: string, teracSubmissionId: string | null, taskId: string | null): ResponseRecord {
    return this.transaction(() => {
      const study = this.study(studyId);
      if (!["launched", "responses-received", "authorized", "prepared", "quoted"].includes(study.status)) throw new PacketError("This study is closed.", 409, "closed");
      const provenance: ResponseRecord["provenance"] = teracSubmissionId ? "terac-task-url" : "preview";
      const key = teracSubmissionId ?? `preview-${randomUUID()}`;
      this.db
        .prepare("INSERT OR IGNORE INTO rs_responses (id, study_id, terac_submission_id, task_id, provenance, started_at) VALUES (?,?,?,?,?,?)")
        .run(randomUUID(), studyId, key, taskId, provenance, now());
      return this.response(studyId, key);
    });
  }
  response(studyId: string, teracSubmissionId: string): ResponseRecord {
    const row = this.db.prepare("SELECT * FROM rs_responses WHERE study_id=? AND terac_submission_id=?").get(studyId, teracSubmissionId) as Record<string, unknown> | undefined;
    if (!row) throw new PacketError("Response not found.", 404, "not_found");
    return this.rowToResponse(row, this.isBound(studyId, teracSubmissionId));
  }
  private isBound(studyId: string, submissionId: string) {
    return !!this.db.prepare("SELECT 1 FROM rs_terac_submissions WHERE study_id=? AND submission_id=? AND status IN ('approved','awaiting_review','in_progress')").get(studyId, submissionId);
  }
  /** Score against the frozen answer key at submit time; the key is never changed after responses exist. */
  submit(studyId: string, teracSubmissionId: string, input: { answers: { q1?: unknown; q2?: unknown; q3?: unknown }; sourcePanelOpens?: unknown; confusion?: unknown }): ResponseRecord {
    return this.transaction(() => {
      const r = this.response(studyId, teracSubmissionId);
      if (r.submittedAt) return r; // first complete submission is kept
      const pick = (v: unknown, max = 200) => (typeof v === "string" && v.length <= max ? v : null);
      const answers = { q1: pick(input.answers?.q1), q2: pick(input.answers?.q2), q3: pick(input.answers?.q3) };
      const scored = scoreAnswers(answers);
      const confusion = pick(input.confusion, 1000);
      const opens = Math.max(0, Math.min(1000, Number(input.sourcePanelOpens) || 0));
      const submittedAt = now();
      const durationMs = Math.max(0, Date.parse(submittedAt) - Date.parse(r.startedAt));
      this.db
        .prepare("UPDATE rs_responses SET submitted_at=?, duration_ms=?, answers=?, scored=?, source_panel_opens=?, confusion=? WHERE study_id=? AND terac_submission_id=? AND submitted_at IS NULL")
        .run(submittedAt, durationMs, JSON.stringify(answers), JSON.stringify(scored), opens, confusion, studyId, teracSubmissionId);
      const study = this.study(studyId);
      if (study.status === "launched" && r.provenance === "terac-task-url") this.updateStudy(studyId, { status: "responses-received" });
      return this.response(studyId, teracSubmissionId);
    });
  }
  exclude(studyId: string, teracSubmissionId: string, reason: string | null) {
    if (reason && !STUDY_PROTOCOL.exclusions.some((e) => reason.startsWith(e.split(" ")[0]))) {
      // Only predeclared technical-invalid categories may exclude; free-text reasons are rejected.
      throw new PacketError("Exclusions must use a predeclared technical-invalid category.", 400, "exclusion");
    }
    this.db.prepare("UPDATE rs_responses SET excluded=? WHERE study_id=? AND terac_submission_id=?").run(reason, studyId, teracSubmissionId);
  }
  responses(studyId: string): ResponseRecord[] {
    return (this.db.prepare("SELECT * FROM rs_responses WHERE study_id=? ORDER BY started_at").all(studyId) as Record<string, unknown>[]).map((r) => this.rowToResponse(r, this.isBound(studyId, r.terac_submission_id as string)));
  }

  // ------------------------------------------------- Terac submission binding
  /** Import the submission list retrieved from the hosted Terac MCP for this study's opportunity. */
  importTeracSubmissions(studyId: string, submissions: Record<string, unknown>[]) {
    const study = this.study(studyId);
    if (!study.terac.opportunityId) throw new PacketError("Bind the study to a Terac opportunity before importing submissions.", 409, "unbound");
    return this.transaction(() => {
      let imported = 0;
      for (const s of submissions) {
        const id = typeof s.id === "string" ? s.id : null;
        if (!id) continue;
        this.db
          .prepare("INSERT INTO rs_terac_submissions VALUES (?,?,?,?,?,?,?,?) ON CONFLICT(study_id, submission_id) DO UPDATE SET status=excluded.status, updated_at=excluded.updated_at, imported_at=excluded.imported_at, raw=excluded.raw")
          .run(studyId, id, String(s.status ?? "unknown"), (s.participant_id as string | null) ?? null, (s.created_at as string | null) ?? null, (s.updated_at as string | null) ?? null, now(), JSON.stringify(s));
        imported += 1;
      }
      return imported;
    });
  }
  teracSubmissions(studyId: string): TeracSubmissionRecord[] {
    return (this.db.prepare("SELECT * FROM rs_terac_submissions WHERE study_id=? ORDER BY created_at").all(studyId) as Record<string, unknown>[]).map((r) => ({
      studyId,
      submissionId: r.submission_id as string,
      status: r.status as string,
      participantId: (r.participant_id as string | null) ?? null,
      createdAt: (r.created_at as string | null) ?? null,
      updatedAt: (r.updated_at as string | null) ?? null,
      importedAt: r.imported_at as string,
      raw: JSON.parse(r.raw as string),
    }));
  }

  // ---------------------------------------------------------------- analysis
  analyze(studyId: string): StudyAnalysis {
    const study = this.study(studyId);
    const all = this.responses(studyId);
    const terac = this.teracSubmissions(studyId);
    const previews = all.filter((r) => r.provenance === "preview");
    const tracked = all.filter((r) => r.provenance === "terac-task-url");
    const unbound = tracked.filter((r) => !r.bound);
    const bound = tracked.filter((r) => r.bound);
    const excluded = bound.filter((r) => r.excluded);
    const eligible = bound.filter((r) => !r.excluded);
    const completed = eligible.filter((r) => r.submittedAt);
    const abandoned = eligible.filter((r) => !r.submittedAt && Date.now() - Date.parse(r.startedAt) > STUDY_PROTOCOL.timeoutSeconds * 1000);
    const inProgress = eligible.filter((r) => !r.submittedAt && Date.now() - Date.parse(r.startedAt) <= STUDY_PROTOCOL.timeoutSeconds * 1000);
    const timedOut = completed.filter((r) => (r.durationMs ?? 0) > STUDY_PROTOCOL.timeoutSeconds * 1000);
    const valid = completed; // timeouts stay in the denominator as unsuccessful
    const allThree = valid.filter((r) => r.scored?.allThree && !timedOut.includes(r));
    const q = (k: "q1" | "q2" | "q3") => valid.filter((r) => r.scored?.[k] && !timedOut.includes(r)).length;
    const falseApprovals = valid.filter((r) => r.scored?.falseApproval).length;
    const correctTimes = allThree.map((r) => r.durationMs ?? 0).sort((a, b) => a - b);
    const median = correctTimes.length ? correctTimes[Math.floor((correctTimes.length - 1) / 2)] : null;
    return {
      studyId,
      round: study.round,
      presentation: study.presentation,
      status: study.status,
      definitionDigest: study.definitionDigest,
      packetDigest: study.packetDigest,
      teracOpportunityId: study.terac.opportunityId,
      teracSubmissionsImported: terac.length,
      counts: { previews: previews.length, trackedUnbound: unbound.length, bound: bound.length, excluded: excluded.length, valid: valid.length, inProgress: inProgress.length, abandoned: abandoned.length, timedOut: timedOut.length },
      primary: { allThreeCorrect: allThree.length, denominator: valid.length, proportion: valid.length ? allThree.length / valid.length : null },
      perQuestion: { q1: q("q1"), q2: q("q2"), q3: q("q3") },
      falseApprovals,
      medianCorrectCompleterMs: median,
      correctCompleterTimesMs: correctTimes,
      sourcePanelOpens: valid.map((r) => r.sourcePanelOpens),
      confusion: valid.map((r) => r.confusion).filter((c): c is string => !!c),
      exclusions: excluded.map((r) => ({ submissionId: r.teracSubmissionId, reason: r.excluded! })),
      limitations: [
        `Target ${STUDY_PROTOCOL.targetPerRound} valid participants per round; actual valid count is ${valid.length}.`,
        "Only responses bound to a retrieved Terac submission (status in_progress, awaiting_review or approved) count as participants; previews and unbound tracked responses are reported separately.",
        "Timeouts remain in the denominator as unsuccessful; abandonment is reported separately.",
        "A general-population usability sample of this size supports descriptive findings only, not statistical significance, causality, engineering correctness or buyer demand.",
      ],
    };
  }
}

export type StudyAnalysis = {
  studyId: string;
  round: Presentation;
  presentation: Presentation;
  status: StudyStatus;
  definitionDigest: string;
  packetDigest: string;
  teracOpportunityId: string | null;
  teracSubmissionsImported: number;
  counts: { previews: number; trackedUnbound: number; bound: number; excluded: number; valid: number; inProgress: number; abandoned: number; timedOut: number };
  primary: { allThreeCorrect: number; denominator: number; proportion: number | null };
  perQuestion: { q1: number; q2: number; q3: number };
  falseApprovals: number;
  medianCorrectCompleterMs: number | null;
  correctCompleterTimesMs: number[];
  sourcePanelOpens: number[];
  confusion: string[];
  exclusions: { submissionId: string; reason: string }[];
  limitations: string[];
};

/** Deterministic scoring against the frozen answer key. */
export function scoreAnswers(a: { q1: string | null; q2: string | null; q3: string | null }) {
  const [q1, q2, q3] = STUDY_QUESTIONS;
  const okQ1 = a.q1 === q1.correct;
  const okQ2 = a.q2 === q2.correct || (q2.acceptedAnchors as readonly string[]).includes(a.q2 ?? "");
  const okQ3 = a.q3 === q3.correct;
  return { q1: okQ1, q2: okQ2, q3: okQ3, allThree: okQ1 && okQ2 && okQ3, falseApproval: a.q3 === "yes" };
}

/** Public, participant-facing study definition (no answer key). */
export function publicStudyDefinition(study: StudyRecord) {
  return {
    id: study.id,
    presentation: study.presentation,
    scenario: STUDY_PROTOCOL.scenario,
    timeoutSeconds: STUDY_PROTOCOL.timeoutSeconds,
    questions: STUDY_QUESTIONS.map((q) => ({ id: q.id, prompt: q.prompt, kind: q.kind, options: "options" in q ? q.options : null })),
    definitionDigest: study.definitionDigest,
    packetDigest: study.packetDigest,
    status: study.status,
  };
}

export const studyKeyDigest = () => sha256(JSON.stringify(STUDY_QUESTIONS));

let singleton: ResearchStore | undefined;
export function researchStore(packets: PacketStore) {
  return (singleton ??= new ResearchStore(packets));
}

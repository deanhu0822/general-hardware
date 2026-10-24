import { anchorFor, ENGINEERING_BOUNDARY, PACKET_SCHEMA, type Anchor, type EffectiveSettings, type Packet } from "./model";
import type { ClarifyInput, ClarifyOutput, GenerateInput, GenerateOutput, PacketRunner, RunnerCapabilities } from "./runner";

/**
 * Deterministic test double for the model adapter.
 *
 * It exists so the worker, publication, authorization and browser journeys can
 * be verified without spending model budget. It is NOT a fallback: it loads
 * only when CAID_RUNNER=test-double, refuses to load in production without an
 * explicit override, labels every receipt origin "test-double", and the UI
 * shows that label. It does no interpretation; it quotes the first sentence
 * of each source and reports that nothing is verified.
 */
export function createTestDoubleRunner(): PacketRunner {
  const effective = (effort: string, policyVersion: string, reason: string): EffectiveSettings => ({
    model: "test-double",
    effort,
    contextWindow: null,
    supportsEffort: true,
    supportedEffortLevels: ["low", "medium", "high", "xhigh", "max"],
    sdkVersion: null,
    claudeCodeVersion: null,
    apiKeySource: "none (test double)",
    permissionMode: null,
    tools: ["read_source", "find_anchors", "submit_packet"],
    betas: [],
    policyVersion,
    selectionReason: reason,
    provisional: true,
    phases: [{ phase: "initial", effort, reason, costUsd: 0, inputTokens: 0, outputTokens: 0, toolCalls: 3, latencyMs: 0 }],
    escalations: 0,
  });
  return {
    name: "test-double",
    origin: "test-double",
    async capabilities(): Promise<RunnerCapabilities> {
      return { model: process.env.CAID_RUNTIME_MODEL || "claude-opus-5-5", resolvedModel: process.env.CAID_RUNTIME_MODEL || "claude-opus-5-5", supportedEffortLevels: ["low", "medium", "high", "xhigh", "max"], sdkVersion: null, account: { apiKeySource: "none (test double)" } };
    },
    async generate(input: GenerateInput): Promise<GenerateOutput> {
      const { frozen, contents, selection, onEvent } = input;
      onEvent("test-double", "Deterministic test double: no model ran. Quoting the first sentence of each frozen source; nothing is interpreted or verified.");
      const anchors: Anchor[] = [];
      const facts: Packet["knownFacts"] = [];
      frozen.sources.forEach((s, i) => {
        const content = contents.get(s.sourceId) ?? "";
        const sentence = content.split(/\n+/).map((l) => l.trim()).find((l) => l.length >= 8 && l.length <= 1200);
        if (!sentence) return;
        const a = anchorFor({ sourceId: s.sourceId, content }, sentence, `td-${i + 1}`);
        anchors.push(a);
        facts.push({ id: `f${i + 1}`, statement: `Source ${s.sourceId} states: "${sentence.slice(0, 300)}"`, kind: frozen.synthetic ? "synthetic fixture" : "source statement", citations: [{ sourceId: s.sourceId, anchorId: a.anchorId }] });
      });
      const first = anchors[0];
      const cite = first ? [{ sourceId: first.sourceId, anchorId: first.anchorId }] : [];
      const body: Omit<Packet, "receipt"> = {
        schema: PACKET_SCHEMA,
        summary: {
          objective: `Test-double packet for request v${frozen.version}: ${frozen.brief.goal}`,
          requestVersion: frozen.version,
          baseline: frozen.brief.baseline || "Unknown",
          productLabel: frozen.brief.product,
          sectorTags: frozen.brief.sectorTags,
          headline: "Test double: no verified measurement exists in the frozen sources; obtain the engineering evidence before any approval.",
        },
        sourceRegister: frozen.sources.map((s) => ({ sourceId: s.sourceId, name: s.name, revision: s.revision, sha256: s.sha256, bytes: s.bytes, importedAt: s.importedAt, anchors: anchors.filter((a) => a.sourceId === s.sourceId) })),
        knownFacts: facts,
        alternatives: [
          { id: "alt-retain", kind: "retain-investigate", title: "Retain and investigate the current J12 connector", description: "Compatibility and failure mode are unknown until evidenced.", prerequisites: ["Recorded test evidence for the current connector."], citations: cite },
          { id: "alt-replace", kind: "replacement", title: "Evaluate a replacement connector", description: "No candidate datasheet or compatibility measurement is established by this test double.", prerequisites: ["Candidate datasheet and pin mapping."], citations: [] },
        ],
        affectedArtifacts: [{ id: "art-j12", label: "J12 connector", status: "suggested", basis: "Named by the request title; not confirmed by this test double.", citations: [] }],
        evidenceGaps: [
          { id: "gap-evidence", gap: "No verified measurement or test result is supplied in the frozen sources.", whyItMatters: "Generated packets cannot assert verified measurements; engineering review needs recorded evidence.", citations: cite },
          ...(frozen.brief.baseline ? [] : [{ id: "gap-baseline", gap: "The baseline revision is not supplied.", whyItMatters: "Affected artifacts cannot be pinned to a revision.", citations: [] }]),
        ],
        reviewQuestions: [{ id: "q1", question: "Which recorded evidence does the engineering owner require before deciding?", owner: "Engineering owner", prerequisite: "" }],
        nextAction: { action: "Obtain the recorded engineering evidence named in the evidence gaps before any engineering approval.", ownerRole: "Engineering owner", requiredInput: "Recorded test or measurement evidence for the current J12 connector.", gapId: "gap-evidence", citations: cite },
        limitations: [
          "TEST DOUBLE: this packet was produced by a deterministic stand-in used for automated verification. No model ran and nothing was interpreted.",
          "Every claim above is a verbatim quotation from a supplied source; none is a verified measurement.",
          ENGINEERING_BOUNDARY,
        ],
      };
      return { packetBody: body, effective: effective(selection.effort, selection.policyVersion, selection.reason), costUsd: 0, inputTokens: 0, outputTokens: 0, toolCalls: 3, repairs: 0 };
    },
    async clarify(input: ClarifyInput): Promise<ClarifyOutput> {
      const a = input.packet.sourceRegister.flatMap((s) => s.anchors)[0];
      return {
        answer: "TEST DOUBLE: no model ran. The frozen sources were not interpreted; consult the evidence gaps in the packet for what is missing. Nothing here is engineering approval.",
        citations: a ? [{ sourceId: a.sourceId, anchorId: a.anchorId }] : [],
        effective: effective(input.policy.defaultEffort, input.policy.version, "test double clarification"),
        costUsd: 0,
        inputTokens: 0,
        outputTokens: 0,
        toolCalls: 0,
        latencyMs: 0,
      };
    },
  };
}

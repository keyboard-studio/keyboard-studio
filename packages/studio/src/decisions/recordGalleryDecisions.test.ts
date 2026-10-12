// recordGalleryDecisions — spec 090 US5: one log entry per settled gallery
// decision, decision-driven at step completion (research R6, D-090-48).

import { describe, expect, it } from "vitest";
import {
  liveEntryForSlot,
  resetDecisionEntryIds,
  slotKeyOf,
  useDecisionLogStore,
} from "./decisionLogStore.ts";
import {
  logProvenanceFor,
  recordGalleryDecisions,
  summarizeGalleryDecision,
} from "./recordGalleryDecisions.ts";
import type { Decision } from "./decisionTypes.ts";

function decision(overrides: Partial<Decision> = {}): Decision {
  return {
    id: "rule-set",
    value: { additions: [{ id: "r1" }, { id: "r2" }] },
    provenance: "asked",
    step: "rules",
    ...overrides,
  };
}

function record(stepId: string, decisions: readonly Decision[]): string[] {
  return recordGalleryDecisions(stepId, {
    append: useDecisionLogStore.getState().append,
    decisions,
  });
}

function liveDecisionEntries(decisionId: string) {
  const { record: rec } = useDecisionLogStore.getState();
  const slot = slotKeyOf("anywhere", {
    kind: "decision",
    decisionId,
    value: null,
    summary: "probe",
  });
  const live = liveEntryForSlot(rec.entries, slot);
  return { entries: rec.entries, live };
}

describe("recordGalleryDecisions", () => {
  it("appends exactly one decision entry for a settled decision", () => {
    useDecisionLogStore.getState().reset();
    resetDecisionEntryIds();
    const ids = record("rules", [decision()]);
    expect(ids).toHaveLength(1);
    const { live } = liveDecisionEntries("rule-set");
    expect(live?.payload.kind).toBe("decision");
    if (live?.payload.kind !== "decision") throw new Error("expected decision payload");
    expect(live.payload.value).toEqual({ additions: [{ id: "r1" }, { id: "r2" }] });
    expect(live.payload.summary).toBe("Rule set: 2 items");
    expect(live.stepId).toBe("rules");
    expect(live.provenance).toEqual({ agency: "hand-set" });
  });

  it("re-recording an unchanged value is a no-op (exactly one live entry)", () => {
    useDecisionLogStore.getState().reset();
    resetDecisionEntryIds();
    record("rules", [decision()]);
    const again = record("rules", [decision()]);
    expect(again).toEqual([]);
    const { entries, live } = liveDecisionEntries("rule-set");
    expect(entries).toHaveLength(1);
    expect(live).toBeDefined();
  });

  it("a changed value supersedes: still exactly one live entry, history kept", () => {
    useDecisionLogStore.getState().reset();
    resetDecisionEntryIds();
    record("rules", [decision()]);
    const ids = record("rules", [decision({ value: { additions: [{ id: "r1" }] } })]);
    expect(ids).toHaveLength(1);
    const { entries, live } = liveDecisionEntries("rule-set");
    expect(entries).toHaveLength(2);
    if (live?.payload.kind !== "decision") throw new Error("expected decision payload");
    expect(live.payload.value).toEqual({ additions: [{ id: "r1" }] });
    expect(live.supersedes).not.toBeNull();
  });

  it("the slot is step-independent: the same decision settled elsewhere supersedes", () => {
    useDecisionLogStore.getState().reset();
    resetDecisionEntryIds();
    record("rules", [decision()]);
    record("some_other_step", [decision({ value: { additions: [] } })]);
    const { entries, live } = liveDecisionEntries("rule-set");
    expect(entries).toHaveLength(2);
    expect(live?.stepId).toBe("some_other_step");
  });

  it("skips decisions with no recordable value", () => {
    useDecisionLogStore.getState().reset();
    resetDecisionEntryIds();
    expect(record("rules", [decision({ value: undefined })])).toEqual([]);
    expect(useDecisionLogStore.getState().record.entries).toHaveLength(0);
  });

  it("normalizes undefined fields out of the recorded value (draft-snapshot shape)", () => {
    useDecisionLogStore.getState().reset();
    resetDecisionEntryIds();
    record("layout", [
      decision({
        id: "windows-layout",
        value: { layoutId: "basic_french", origin: undefined },
        step: "layout",
      }),
    ]);
    const { live } = liveDecisionEntries("windows-layout");
    if (live?.payload.kind !== "decision") throw new Error("expected decision payload");
    expect(live.payload.value).toEqual({ layoutId: "basic_french" });
  });
});

describe("logProvenanceFor", () => {
  it("maps the decision vocabulary onto the log's agency axes", () => {
    expect(logProvenanceFor(decision({ provenance: "asked" }))).toEqual({ agency: "hand-set" });
    expect(logProvenanceFor(decision({ provenance: "extracted", source: "sil_cameroon_qwerty" }))).toEqual({
      agency: "base-derived",
      source: "base",
    });
    expect(logProvenanceFor(decision({ provenance: "derived" }))).toEqual({ agency: "tool-proposed" });
    expect(logProvenanceFor(decision({ provenance: "default", source: "langtags" }))).toEqual({
      agency: "tool-proposed",
      source: "langtags",
    });
    expect(logProvenanceFor(decision({ provenance: "default", source: "some_keyboard_id" }))).toEqual({
      agency: "tool-proposed",
    });
    expect(logProvenanceFor(decision({ provenance: "default" }))).toEqual({ agency: "tool-proposed" });
  });
});

describe("summarizeGalleryDecision", () => {
  it("names the decision by its audit label and digests the value's shape", () => {
    expect(summarizeGalleryDecision("rule-set", { additions: [{}, {}] })).toBe("Rule set: 2 items");
    expect(summarizeGalleryDecision("touch-seed-source", "import-adapt")).toBe(
      "Touch seed source: import-adapt",
    );
    expect(summarizeGalleryDecision("windows-layout", { layoutId: "basic_french" })).toBe(
      "Windows layout",
    );
    expect(summarizeGalleryDecision("carved-layout", { removals: [] })).toBe("Carved layout: none");
  });

  it("bounds the summary at DECISION_SUMMARY_LIMIT", () => {
    const summary = summarizeGalleryDecision("rule-set", "x".repeat(500));
    expect(summary.length).toBe(200);
    expect(summary.endsWith("…")).toBe(true);
  });
});

// Pure unit tests of compareParity / compareAgency (spec 107 T041): each named
// normalisation (research R8) and the allow-list matching, on small hand-built
// inputs. No corpus.

import { describe, expect, it } from "vitest";
import type { DecisionRecord } from "@keyboard-studio/contracts";
import { suggestionFingerprintOf } from "../../survey/carve/carveValue.ts";
import type { AuthorRun, ParityAllowEntry, PolicyStep } from "./caseTypes.ts";
import { compareAgency, compareParity } from "./parity.ts";

type Agency = "hand-set" | "tool-proposed" | "base-derived";

function entry(id: string, decisionId: string, value: unknown, agency: Agency = "hand-set", recordedAt = 1) {
  return {
    entryId: id,
    stepId: "identity",
    payload: { kind: "decision", decisionId, value, summary: decisionId },
    provenance: { agency },
    recordedAt,
    supersedes: null,
  };
}

function recordOf(...entries: ReturnType<typeof entry>[]): DecisionRecord {
  return {
    format: "keyboard-studio.decision-record",
    version: 3,
    keyboardId: "x",
    entries,
    truncated: null,
  } as unknown as DecisionRecord;
}

function runOf(
  decisions: Record<string, unknown>,
  opts: { steps?: PolicyStep[]; record?: DecisionRecord; caseId?: string } = {},
): AuthorRun {
  return {
    caseId: opts.caseId ?? "c1",
    outcome: "completed",
    decisions: Object.fromEntries(
      Object.entries(decisions).map(([id, value]) => [id, { id, value, provenance: "asked" }]),
    ),
    ...(opts.record !== undefined ? { record: opts.record } : {}),
    gates: [],
    report: { steps: opts.steps ?? [] },
  } as unknown as AuthorRun;
}

const entryFor = (decisionId: string, reason = "r"): ParityAllowEntry => ({
  caseId: "c1",
  decisionId,
  reason,
  explainedBy: "record-age:test",
});

describe("compareParity: comparison", () => {
  it("reports no difference for equal values, key order aside", () => {
    const rec = recordOf(entry("d1", "carved-layout", { b: 1, a: [1, 2] }));
    const r = compareParity(runOf({ "carved-layout": { a: [1, 2], b: 1 } }), rec, []);
    expect(r.diffs, "equal values must not differ").toEqual([]);
  });

  it("reports a differing value with both sides", () => {
    const rec = recordOf(entry("d1", "carved-layout", { removals: [] }));
    const r = compareParity(runOf({ "carved-layout": { removals: ["a"] } }), rec, []);
    expect(r.diffs).toEqual([
      { decisionId: "carved-layout", author: { removals: ["a"] }, recorded: { removals: [] } },
    ]);
    expect(r.unexplained).toHaveLength(1);
  });

  it("reports a decision the record has and the author lacks", () => {
    const rec = recordOf(entry("d1", "carved-layout", { removals: [] }));
    const r = compareParity(runOf({}), rec, []);
    expect(r.diffs.map((d) => d.decisionId)).toEqual(["carved-layout"]);
    expect(r.diffs[0]?.author).toBeUndefined();
  });

  it("ignores decisions the author has and the record lacks", () => {
    const rec = recordOf(entry("d1", "carved-layout", { removals: [] }));
    const r = compareParity(runOf({ "carved-layout": { removals: [] }, "caps-handling": "x" }), rec, []);
    expect(r.diffs).toEqual([]);
  });

  it("the last effective record entry wins", () => {
    const rec = recordOf(entry("d1", "language-code", "aaa"), entry("d2", "language-code", "bfd"));
    expect(compareParity(runOf({ "language-code": "bfd" }), rec, []).diffs).toEqual([]);
  });
});

describe("compareParity: named normalisations (R8)", () => {
  it("timestamps: recordedAt inside a value is dropped", () => {
    const rec = recordOf(entry("d1", "carved-layout", { removals: [], recordedAt: 111 }));
    const r = compareParity(runOf({ "carved-layout": { removals: [], recordedAt: 222 } }), rec, []);
    expect(r.diffs).toEqual([]);
  });

  it("zzq: placeholder hex is reduced to zzq, on either side", () => {
    const rec = recordOf(entry("d1", "character-inventory", ["zzq14a", "a"]));
    const r = compareParity(runOf({ "character-inventory": ["zzq1f2", "a"] }), rec, []);
    expect(r.diffs).toEqual([]);
  });

  it("zzq: a different non-placeholder text still differs, and names the rule", () => {
    const rec = recordOf(entry("d1", "character-inventory", "zzq14a b"));
    const r = compareParity(runOf({ "character-inventory": "zzq1f2 c" }), rec, []);
    expect(r.diffs).toHaveLength(1);
    expect(r.diffs[0]?.normalisedBy).toBe("zzq");
  });

  it("carve-fingerprint: recomputed on both sides so another spelling of the same set is equal", () => {
    const canon = suggestionFingerprintOf(["b", "a"]);
    const oldSpelling = JSON.stringify(["b", "a", "a"]); // unsorted, duplicated
    expect(oldSpelling).not.toBe(canon);
    const rec = recordOf(entry("d1", "carved-layout", { removals: [], suggestionFingerprint: oldSpelling }));
    const r = compareParity(runOf({ "carved-layout": { removals: [], suggestionFingerprint: canon } }), rec, []);
    expect(r.diffs).toEqual([]);
  });

  it("carve-fingerprint: different suggestion sets still differ", () => {
    const rec = recordOf(entry("d1", "carved-layout", { suggestionFingerprint: suggestionFingerprintOf(["a"]) }));
    const r = compareParity(
      runOf({ "carved-layout": { suggestionFingerprint: suggestionFingerprintOf(["a", "b"]) } }),
      rec,
      [],
    );
    expect(r.diffs).toHaveLength(1);
  });

  it("generated ids are compared exactly", () => {
    const rec = recordOf(entry("d1", "carved-layout", { id: "gen-1" }));
    expect(compareParity(runOf({ "carved-layout": { id: "gen-2" } }), rec, []).diffs).toHaveLength(1);
  });
});

describe("compareParity: tester-typed text (placeholder rule)", () => {
  const rec = recordOf(entry("d1", "author-name", "Walk Author"));
  const placeholderStep: PolicyStep = { decisionId: "author-name", rule: "placeholder", value: "zzq14a" };

  it("compares on presence when the author PolicyStep rule is placeholder", () => {
    const r = compareParity(runOf({ "author-name": "zzq14a" }, { steps: [placeholderStep] }), rec, []);
    expect(r.diffs).toEqual([]);
  });

  it("without the placeholder rule the same values differ (keyed off the rule, not the id)", () => {
    const r = compareParity(
      runOf({ "author-name": "zzq14a" }, { steps: [{ ...placeholderStep, rule: "default" }] }),
      rec,
      [],
    );
    expect(r.diffs.map((d) => d.decisionId)).toEqual(["author-name"]);
  });

  it("applies to any decision id whose step is a placeholder", () => {
    const rec2 = recordOf(entry("d1", "copyright-holder", "Someone"));
    const step: PolicyStep = { decisionId: "copyright-holder", rule: "placeholder", value: "zzq1" };
    expect(compareParity(runOf({ "copyright-holder": "zzq1" }, { steps: [step] }), rec2, []).diffs).toEqual([]);
  });

  it("resolves a flow question id to the decisions it provides, through the author record", () => {
    const answer = {
      entryId: "a1",
      stepId: "attribution",
      payload: { kind: "survey-answer", questionId: "il_author_name", answerType: "text", value: "zzq14a" },
      provenance: { agency: "hand-set" },
      recordedAt: 1,
      supersedes: null,
    } as unknown as ReturnType<typeof entry>;
    const step: PolicyStep = { decisionId: "il_author_name", rule: "placeholder", value: "zzq14a" };
    const mine = recordOf(answer);
    expect(compareParity(runOf({ "author-name": "zzq14a" }, { steps: [step], record: mine }), rec, []).diffs).toEqual([]);
    // Without the author record the question id cannot be resolved, so the values differ.
    expect(compareParity(runOf({ "author-name": "zzq14a" }, { steps: [step] }), rec, []).diffs).toHaveLength(1);
  });

  it("still differs when the author supplied nothing", () => {
    const r = compareParity(runOf({}, { steps: [placeholderStep] }), rec, []);
    expect(r.diffs).toHaveLength(1);
    expect(r.diffs[0]?.normalisedBy).toBe("tester-typed");
  });

  it("still differs when the record value is empty", () => {
    const empty = recordOf(entry("d1", "author-name", ""));
    const r = compareParity(runOf({ "author-name": "zzq14a" }, { steps: [placeholderStep] }), empty, []);
    expect(r.diffs).toHaveLength(1);
  });
});

describe("compareParity: allow list", () => {
  const rec = recordOf(entry("d1", "carved-layout", { removals: [] }));
  const run = runOf({ "carved-layout": { removals: ["a"] } });

  it("an entry for this case and decision explains the difference", () => {
    const r = compareParity(run, rec, [entryFor("carved-layout")]);
    expect(r.diffs).toHaveLength(1);
    expect(r.unexplained).toEqual([]);
    expect(r.stale).toEqual([]);
  });

  it("an entry for another case does not explain it, and is not stale here", () => {
    const other: ParityAllowEntry = { ...entryFor("carved-layout"), caseId: "other" };
    const r = compareParity(run, rec, [other]);
    expect(r.unexplained).toHaveLength(1);
    expect(r.stale).toEqual([]);
  });

  it("an entry for another decision does not explain it", () => {
    expect(compareParity(run, rec, [entryFor("language-code")]).unexplained).toHaveLength(1);
  });

  it("an entry whose difference no longer occurs is stale", () => {
    const same = runOf({ "carved-layout": { removals: [] } });
    const e = entryFor("carved-layout");
    const r = compareParity(same, rec, [e]);
    expect(r.diffs).toEqual([]);
    expect(r.stale).toEqual([e]);
  });
});

describe("compareAgency", () => {
  const rec = recordOf(
    entry("d1", "language-code", "bfd", "tool-proposed"),
    entry("d2", "carved-layout", { removals: [] }, "hand-set"),
  );

  it("is empty when every agency matches", () => {
    expect(compareAgency(runOf({}, { record: rec }), rec)).toEqual([]);
  });

  it("reports a differing agency and a missing one", () => {
    const mine = recordOf(entry("d1", "language-code", "bfd", "hand-set"));
    expect(compareAgency(runOf({}, { record: mine }), rec)).toEqual([
      { key: "carved-layout", author: undefined, recorded: "hand-set" },
      { key: "language-code", author: "hand-set", recorded: "tool-proposed" },
    ]);
  });

  it("uses the last effective entry per key", () => {
    const theirs = recordOf(
      entry("d1", "language-code", "x", "hand-set"),
      entry("d2", "language-code", "bfd", "tool-proposed"),
    );
    const mine = recordOf(entry("d9", "language-code", "bfd", "tool-proposed"));
    expect(compareAgency(runOf({}, { record: mine }), theirs)).toEqual([]);
  });

  it("reports everything when the run left no record", () => {
    expect(compareAgency(runOf({}), rec)).toHaveLength(2);
  });
});

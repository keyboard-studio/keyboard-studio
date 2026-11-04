import { describe, expect, it } from "vitest";
import type { FindingKey, ReviewNote } from "@keyboard-studio/contracts";

import {
  classifyRow,
  evaluateRatchet,
  newFailures,
  pruneReviewNotes,
  ratchetFor,
  takeBaseline,
  type OpenBaseline,
  type RatchetInput,
} from "./openRatchet.ts";
import type { CriteriaResult, CriterionStatus, ResolvedRow } from "./criteriaTypes.ts";

function row(
  id: string,
  status: CriterionStatus,
  opts: { rule?: string; file?: string; controls?: ResolvedRow["controls"] } = {},
): ResolvedRow {
  return {
    criterion: { id } as ResolvedRow["criterion"],
    status,
    controls: opts.controls ?? null,
    evidence: () => ({
      kind: "lint-finding",
      lines: [],
      ...(opts.rule !== undefined
        ? {
            lintRuleId: opts.rule,
            findings: [
              {
                code: opts.rule,
                location: { file: opts.file ?? "README.md" },
              },
            ] as never,
          }
        : {}),
    }),
  };
}

function resultOf(rows: ResolvedRow[]): CriteriaResult {
  return { rows } as CriteriaResult;
}

const note = (key: FindingKey, text = "because"): ReviewNote => ({
  key,
  criterionId: "1",
  text,
  writtenAt: "2026-01-01T00:00:00Z",
});

const baseline: OpenBaseline = {
  takenAt: "2026-01-01T00:00:00Z",
  failing: ["KM_OLD:README.md" as FindingKey],
  unresolvable: ["9.9"],
};

const OLD = row("5.5b", "not-met", { rule: "KM_OLD", file: "README.md" });
const NEW = row("7.28", "not-met", { rule: "KM_NEW", file: "a.kmn" });
const NEW_KEY = "KM_NEW:a.kmn" as FindingKey;

describe("classification", () => {
  it("marks a failing key in the baseline pre-existing and others new", () => {
    expect(classifyRow(OLD, baseline)).toBe("pre-existing");
    expect(classifyRow(NEW, baseline)).toBe("new");
    expect(classifyRow(row("1.1", "met"), baseline)).toBeNull();
  });

  it("never classifies an unresolvable-at-load criterion as new", () => {
    const r = row("9.9", "not-met", { rule: "KM_LATE", file: "x" });
    expect(classifyRow(r, baseline)).toBe("pre-existing");
    expect(newFailures(resultOf([r]), baseline)).toEqual([]);
  });

  it("takeBaseline records failing keys and not-yet-checkable criteria", () => {
    const b = takeBaseline(
      resultOf([OLD, row("3.1", "not-yet-checkable"), row("1.1", "met")]),
      "t",
    );
    expect(b.failing).toEqual(["KM_OLD:README.md"]);
    expect(b.unresolvable).toEqual(["3.1"]);
  });
});

describe("gate matrix", () => {
  const compile: Partial<RatchetInput> = { compileError: true };
  const red: Partial<RatchetInput> = { unconfirmedRed: ["13.1"] };
  const unjustified: Partial<RatchetInput> = {
    newFailures: [{ key: NEW_KEY, criterionId: "7.28" }],
  };
  const justified: Partial<RatchetInput> = {
    ...unjustified,
    notes: [note(NEW_KEY)],
  };
  const base: RatchetInput = {
    compileError: false,
    unconfirmedRed: [],
    newFailures: [],
    notes: [],
  };
  const gate = (...parts: Partial<RatchetInput>[]) =>
    evaluateRatchet(Object.assign({}, base, ...parts));

  it("does not block with pre-existing failures only (nothing new passed in)", () => {
    const g = ratchetFor(resultOf([OLD]), baseline, [], false);
    expect(g.blocked).toBe(false);
  });

  it("does not block a justified new failure", () => {
    expect(gate(justified).blocked).toBe(false);
  });

  it("does not accept a whitespace-only note as justification", () => {
    const g = gate(unjustified, { notes: [note(NEW_KEY, "   ")] });
    expect(g.blocked).toBe(true);
  });

  it("blocks singly on each of the three conditions", () => {
    expect(gate(compile).reasons).toEqual(["compile-error"]);
    expect(gate(red).reasons).toEqual(["unconfirmed-red"]);
    expect(gate(unjustified).reasons).toEqual(["unjustified-new-failure"]);
  });

  it("blocks on every pair, naming both reasons", () => {
    expect(gate(compile, red).reasons).toEqual(["compile-error", "unconfirmed-red"]);
    expect(gate(compile, unjustified).reasons).toEqual([
      "compile-error",
      "unjustified-new-failure",
    ]);
    expect(gate(red, unjustified).reasons).toEqual([
      "unconfirmed-red",
      "unjustified-new-failure",
    ]);
  });

  it("a justified failure does not hide a compile error or red item", () => {
    expect(gate(justified, compile).blocked).toBe(true);
    expect(gate(justified, red).blocked).toBe(true);
  });

  it("derives unconfirmed red and new failures from a result", () => {
    const rows = [
      OLD,
      NEW,
      row("13.1", "needs-human", { controls: "confirm" }),
    ];
    const g = ratchetFor(resultOf(rows), baseline, [], false);
    expect(g.reasons).toEqual(["unconfirmed-red", "unjustified-new-failure"]);
    const ok = ratchetFor(
      resultOf([OLD, NEW]),
      baseline,
      [note(NEW_KEY)],
      false,
    );
    expect(ok.blocked).toBe(false);
  });
});

describe("review note lifecycle", () => {
  it("drops a note once its key stops failing", () => {
    const notes = [note(NEW_KEY), note("KM_X:b" as FindingKey)];
    const kept = pruneReviewNotes(notes, new Set([NEW_KEY]));
    expect(kept.map((n) => n.key)).toEqual([NEW_KEY]);
  });
});

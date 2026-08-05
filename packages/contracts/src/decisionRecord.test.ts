// Tests for the record's two supersession derivations
// (specs/053-decision-audit FR-015; specs/055-legible-decision-trail SC-007).
//
// These live in contracts, not beside one of their callers, for the reason the
// functions do: the engine's PR summary, the studio's stage roll-ups, the trail's
// "replaced" dimming and the log store's live-entry lookup all have to agree
// about which decisions still stand. Four independent reimplementations of that
// filter is what SC-007 cannot afford, so this is the one place the rule is
// pinned.

import { describe, expect, it } from "vitest";
import {
  effectiveEntries,
  supersededEntryIds,
  type DecisionEntry,
} from "./decisionRecord.js";

function entry(entryId: string, supersedes: string | null = null): DecisionEntry {
  return {
    entryId,
    stepId: "identity",
    payload: {
      kind: "survey-answer",
      questionId: "il_language_english",
      answerType: "text",
      value: entryId,
    },
    provenance: { agency: "hand-set" },
    recordedAt: 1_700_000_000_000,
    supersedes,
  };
}

describe("supersededEntryIds", () => {
  it("is empty for a record where nothing was revisited", () => {
    expect(supersededEntryIds([entry("a"), entry("b")]).size).toBe(0);
  });

  it("names the entry a later entry replaced, not the replacement", () => {
    // The link points BACKWARDS (`supersedes`), so the superseded entry is the
    // one being named — reading the field as "am I superseded?" is the mistake
    // this asserts against.
    const ids = supersededEntryIds([entry("a"), entry("b", "a")]);
    expect([...ids]).toEqual(["a"]);
  });

  it("collects every link in a chain, so only the tip survives", () => {
    const ids = supersededEntryIds([entry("a"), entry("b", "a"), entry("c", "b")]);
    expect([...ids].sort()).toEqual(["a", "b"]);
  });

  it("is empty for an empty record", () => {
    expect(supersededEntryIds([]).size).toBe(0);
  });
});

describe("effectiveEntries", () => {
  it("keeps only the tip of a supersession chain", () => {
    const entries = [entry("a"), entry("b", "a"), entry("c", "b")];
    expect(effectiveEntries(entries).map((e) => e.entryId)).toEqual(["c"]);
  });

  it("preserves record order, so the last element is the latest effective entry", () => {
    // Stage roll-ups read "the latest effective entry" as `.at(-1)`, and the PR
    // summary numbers its rows by position — both depend on this.
    const entries = [entry("a"), entry("b"), entry("c", "a"), entry("d")];
    expect(effectiveEntries(entries).map((e) => e.entryId)).toEqual(["b", "c", "d"]);
  });

  it("counts a revisited decision once, not once per revision", () => {
    // The append-only record holds every revision (FR-015). A surface that
    // summed `entries` instead of this view would double-count every revisit —
    // the D-02 failure mode.
    const entries = [entry("a"), entry("b", "a"), entry("c", "b"), entry("d", "c")];
    expect(effectiveEntries(entries)).toHaveLength(1);
    expect(entries).toHaveLength(4);
  });

  it("keeps an entry whose `supersedes` names an id not in the record", () => {
    // A dangling link costs the "replaces" marker, never the decision itself
    // (contract §5 row 5). Nothing here is superseded, so nothing is filtered.
    expect(effectiveEntries([entry("b", "vanished")]).map((e) => e.entryId)).toEqual(["b"]);
  });

  it("returns an empty list for an empty record rather than throwing", () => {
    expect(effectiveEntries([])).toEqual([]);
  });
});

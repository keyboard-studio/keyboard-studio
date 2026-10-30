// recordToDecisionSet (spec 106 T009): the p1 Bafut/basic_kbdus record, cut at
// each decision point.

import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import {
  DECISION_POINTS,
  DECISION_POINT_BASES,
  DECISION_POINT_FIXTURE_DIR,
  fixtureRelPath,
  type DecisionPoint,
} from "./decisionPointBases.ts";
import { recordToDecisionSet } from "./recordToDecisionSet.ts";

const here = dirname(fileURLToPath(import.meta.url));
const record = readFileSync(
  resolve(here, "../lib/__fixtures__/decision-points/records/kbdus.json"),
  "utf-8",
);

const ids = (point: DecisionPoint): string[] => Object.keys(recordToDecisionSet(record, point)).sort();
const added = (point: DecisionPoint, prev: DecisionPoint): string[] => {
  const before = new Set(ids(prev));
  return ids(point).filter((id) => !before.has(id));
};

describe("recordToDecisionSet on the p1 record", () => {
  it("marks keeps identity, inventory and layout decisions only", () => {
    expect(ids("marks")).toEqual([
      "author-name",
      "authoring-track",
      "base-keyboard",
      "character-inventory",
      "language-autonym",
      "language-code",
      "language-name",
      "marks-treatment",
      "project-display-name",
      "project-keyboard-id",
      "punctuation-inventory",
      "retained-convenience-chars",
      "target-script",
      "windows-layout",
    ]);
  });

  it("each later point adds exactly its decisions", () => {
    expect(added("carve", "marks")).toEqual(["carved-layout"]);
    expect(added("assignments", "carve")).toEqual(["deadkeys-defined", "physical-layout", "rule-set"]);
    // This record predates caps-handling, and its tolerance answer is null.
    expect(added("caps", "assignments")).toEqual([]);
    expect(added("tolerance", "caps")).toEqual([]);
  });

  it("never keeps a decision past its point", () => {
    expect(DECISION_POINTS.map((p) => ids(p).length)).toEqual([14, 15, 18, 18, 18]);
  });

  it("maps survey answers onto the decisions their module provides", () => {
    const set = recordToDecisionSet(record, "marks");
    expect(set["language-name"]?.value).toBe("Bafut");
    expect(set["language-code"]?.value).toBe("bfd");
    expect(set["authoring-track"]?.value).toBe("copy");
    expect(set["project-keyboard-id"]?.value).toBe("bafut");
  });

  it("drops survey answers no registry module owns", () => {
    expect(ids("tolerance").some((id) => id.startsWith("marks.") || id.startsWith("invisibles."))).toBe(false);
  });

  it("replays every kept decision whole (asked provenance)", () => {
    for (const d of Object.values(recordToDecisionSet(record, "tolerance"))) {
      expect(d?.provenance).toBe("asked");
    }
  });

  it("keeps the tolerance sub-field only at the tolerance point", () => {
    const raw = JSON.parse(record) as {
      entries: { payload: { decisionId?: string; value?: { contextTolerance: unknown } } }[];
    };
    const entry = raw.entries.find((e) => e.payload.decisionId === "marks-treatment")!;
    entry.payload.value!.contextTolerance = {
      decision: "decline",
      acceptedSiteIds: [],
      proposedSiteIds: [],
      fingerprint: "f",
    };
    const text = JSON.stringify(raw);
    const tol = (p: DecisionPoint): unknown =>
      (recordToDecisionSet(text, p)["marks-treatment"]?.value as { contextTolerance: unknown }).contextTolerance;
    expect(tol("caps")).toBeNull();
    expect(tol("tolerance")).not.toBeNull();
  });
});

describe("the committed decision-point fixtures", () => {
  // Regenerate with: pnpm --filter @keyboard-studio/studio run fixtures:decision-points
  it.each(DECISION_POINT_BASES.flatMap((b) => DECISION_POINTS.map((p) => [b.base, b.recordFile, p, fixtureRelPath(b, p)] as const)))(
    "%s %s at %s is what the generator writes from the record",
    (_base, recordFile, point, rel) => {
      const root = resolve(here, "../..", DECISION_POINT_FIXTURE_DIR);
      const rec = readFileSync(resolve(root, "records", recordFile), "utf-8");
      const committed = JSON.parse(readFileSync(resolve(root, rel), "utf-8")) as unknown;
      expect(committed).toEqual(JSON.parse(JSON.stringify(recordToDecisionSet(rec, point))));
    },
  );
});

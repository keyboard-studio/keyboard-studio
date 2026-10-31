// Mark guards in the downloaded keyboard (spec 106 US2, FR-010 to FR-013),
// typed through the compiled Bafut kbdus fixture.
//
// The fixture is cut at `assignments`, not `marks`: before assignments no key
// types a bare mark, so there is nothing for the guard to act on. Here K_5
// types U+0300 (simple_swap). The grave's attachment row checks a, e, ə, i, ɨ,
// o, u and their capitals; k is unchecked. The recorded bare-mark behaviour is
// swallow.
//
// Reads the sibling ../keyboards corpus, so it runs under vitest.corpus.config.ts.

import { beforeAll, describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import type { SimKeyInput } from "@keyboard-studio/contracts";
import type { DecisionSet } from "../decisions/decisionTypes.ts";
import type { MarksTreatmentValue } from "../survey/marks/marksValue.ts";
import { buildDecisionPointFixture, type DecisionPointFixture } from "./decisionPointFixture.ts";
import { DECISION_POINT_BASES, DECISION_POINT_FIXTURE_DIR, fixtureRelPath } from "./decisionPointBases.ts";
import { announceSc004Skip, sc004GatesEnabled } from "./sc004Harness.ts";

announceSc004Skip("decision-point guard simulation", (name) => it.skip(name, () => {}));

const GRAVE = "̀";
const here = dirname(fileURLToPath(import.meta.url));
const fixtureRoot = resolve(here, "..", "..", DECISION_POINT_FIXTURE_DIR);
const bafut = DECISION_POINT_BASES.find((b) => b.profile === "p1-whole-bafut-kbdus")!;

function decisions(): DecisionSet {
  return JSON.parse(
    readFileSync(resolve(fixtureRoot, fixtureRelPath(bafut, "assignments")), "utf-8"),
  ) as DecisionSet;
}

/** The same decisions with the space column ticked on the grave's row. */
function withSpaceTicked(set: DecisionSet): DecisionSet {
  const entry = set["marks-treatment"]!;
  const value = entry.value as MarksTreatmentValue;
  const completion = value.completion!;
  return {
    ...set,
    "marks-treatment": {
      ...entry,
      value: {
        ...value,
        completion: {
          ...completion,
          worklist: { ...completion.worklist, allowedContexts: { [GRAVE]: [" "] } },
        },
      },
    },
  };
}

/** The same decisions with the start-of-line box ticked on the grave's row (issue #2374). */
function withStartOfLineTicked(set: DecisionSet): DecisionSet {
  const entry = set["marks-treatment"]!;
  const value = entry.value as MarksTreatmentValue;
  const completion = value.completion!;
  return {
    ...set,
    "marks-treatment": {
      ...entry,
      value: {
        ...value,
        completion: {
          ...completion,
          worklist: { ...completion.worklist, bareMarkAllowed: { [GRAVE]: true } },
        },
      },
    },
  };
}

const keys = (...vkeys: string[]): SimKeyInput[] => vkeys.map((vkey) => ({ vkey, modifiers: [], caps: false }));

describe.skipIf(!sc004GatesEnabled)("mark guards, typed (Bafut kbdus at assignments)", () => {
  let fx: DecisionPointFixture;
  let spaced: DecisionPointFixture;
  let lined: DecisionPointFixture;
  beforeAll(async () => {
    fx = await buildDecisionPointFixture({ ...bafut, point: "assignments", decisions: decisions() });
    spaced = await buildDecisionPointFixture({
      ...bafut,
      point: "assignments",
      decisions: withSpaceTicked(decisions()),
    });
    lined = await buildDecisionPointFixture({
      ...bafut,
      point: "assignments",
      decisions: withStartOfLineTicked(decisions()),
    });
  }, 240_000);

  const type = (f: DecisionPointFixture, ...vkeys: string[]): string => f.simulate(keys(...vkeys)).finalOutput;

  it("keeps the grave after a checked base", () => {
    expect(type(fx, "K_A", "K_5")).toBe(`a${GRAVE}`);
  });

  it("swallows the grave after an unchecked base", () => {
    expect(type(fx, "K_K", "K_5")).toBe("k");
  });

  it("swallows the grave after a digit", () => {
    expect(type(fx, "K_1", "K_5")).toBe("1");
  });

  it("swallows the grave after a space while the column is unticked, and keeps it once ticked", () => {
    expect(type(fx, "K_SPACE", "K_5")).toBe(" ");
    expect(type(spaced, "K_SPACE", "K_5")).toBe(` ${GRAVE}`);
  });

  it("swallows the grave at buffer start under swallow", () => {
    expect(type(fx, "K_5")).toBe("");
  });

  it("passes the grave at buffer start when the start-of-line box is ticked (issue #2374)", () => {
    expect(type(lined, "K_5")).toBe(GRAVE);
  });

  // The fixtures do not reproduce the touch step (see consistency gate G6), so
  // the projected touch layout has no T_0300 key to tap.
  it.skip("touch T_0300 follows the same route (fixtures do not reproduce the touch step)", () => {});
});

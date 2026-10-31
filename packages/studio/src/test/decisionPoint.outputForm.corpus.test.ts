// Output follows the output-form decision (spec 106 US3, FR-020 to FR-022),
// typed through the compiled Bafut kbdus fixture at `assignments`.
//
// The walk recorded base-plus-mark. The caron deadkey sits on `;` (K_COLON)
// with bases a A e E; its escapes type the trigger's own `;`, which is what a
// studio deadkey's accentChar is (the R5 vectors' U+030C escape is the
// pattern's own default, covered by the pattern's test vectors). K_5 types the
// bare grave; the grave's attachment row allows a, e, ə, i, ɨ, o, u and their
// capitals. The ready-made run is the same record with the output form flipped.
//
// Reads the sibling ../keyboards corpus, so it runs under vitest.corpus.config.ts.

import { beforeAll, describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import type { OutputForm, SimKeyInput } from "@keyboard-studio/contracts";
import type { DecisionSet } from "../decisions/decisionTypes.ts";
import type { MarksTreatmentValue } from "../survey/marks/marksValue.ts";
import { buildDecisionPointFixture, type DecisionPointFixture } from "./decisionPointFixture.ts";
import { DECISION_POINT_BASES, DECISION_POINT_FIXTURE_DIR, fixtureRelPath } from "./decisionPointBases.ts";
import { announceSc004Skip, sc004GatesEnabled } from "./sc004Harness.ts";

announceSc004Skip("decision-point output-form simulation", (name) => it.skip(name, () => {}));

const CARON = "̌";
const GRAVE = "̀";
const here = dirname(fileURLToPath(import.meta.url));
const fixtureRoot = resolve(here, "..", "..", DECISION_POINT_FIXTURE_DIR);
const bafut = DECISION_POINT_BASES.find((b) => b.profile === "p1-whole-bafut-kbdus")!;

function decisions(form: OutputForm): DecisionSet {
  const set = JSON.parse(
    readFileSync(resolve(fixtureRoot, fixtureRelPath(bafut, "assignments")), "utf-8"),
  ) as DecisionSet;
  const entry = set["marks-treatment"]!;
  const value = entry.value as MarksTreatmentValue;
  return {
    ...set,
    "marks-treatment": {
      ...entry,
      value: { ...value, completion: { ...value.completion!, outputForm: form } },
    },
  };
}

type Key = string | { vkey: string; shift: true };
const keys = (...ks: Key[]): SimKeyInput[] =>
  ks.map((k) =>
    typeof k === "string"
      ? { vkey: k, modifiers: [], caps: false }
      : { vkey: k.vkey, modifiers: ["shift"], caps: false },
  );

describe.skipIf(!sc004GatesEnabled)("output form, typed (Bafut kbdus at assignments)", () => {
  let nfd: DecisionPointFixture;
  let nfc: DecisionPointFixture;
  beforeAll(async () => {
    nfd = await buildDecisionPointFixture({ ...bafut, point: "assignments", decisions: decisions("base-plus-mark") });
    nfc = await buildDecisionPointFixture({ ...bafut, point: "assignments", decisions: decisions("ready-made") });
  }, 240_000);

  const type = (f: DecisionPointFixture, ...ks: Key[]): string => f.simulate(keys(...ks)).finalOutput;

  describe("base-plus-mark: the caron deadkey sends the letter and the mark", () => {
    it("; then a gives a + U+030C", () => {
      expect(type(nfd, "K_COLON", "K_A")).toBe(`a${CARON}`);
    });

    it("; then shifted A gives A + U+030C", () => {
      expect(type(nfd, "K_COLON", { vkey: "K_A", shift: true })).toBe(`A${CARON}`);
    });

    it("; then e gives e + U+030C", () => {
      expect(type(nfd, "K_COLON", "K_E")).toBe(`e${CARON}`);
    });

    it("the double-tap and space escapes type the trigger's own character", () => {
      expect(type(nfd, "K_COLON", "K_COLON")).toBe(";");
      expect(type(nfd, "K_COLON", "K_SPACE")).toBe(";");
    });

    it("a letter the deadkey does not take falls through as itself", () => {
      expect(type(nfd, "K_COLON", "K_K")).toBe("k");
    });

    it("the mark key after a letter stays letter plus mark", () => {
      expect(type(nfd, "K_A", "K_5")).toBe(`a${GRAVE}`);
    });
  });

  describe("ready-made: single characters", () => {
    it("; then a gives ǎ", () => {
      expect(type(nfc, "K_COLON", "K_A")).toBe("ǎ");
    });

    it("a then the mark key composes à (postfix compose)", () => {
      expect(type(nfc, "K_A", "K_5")).toBe("à");
      expect(type(nfc, "K_E", "K_5")).toBe("è");
    });

    it("the mark key after a letter it may not follow is still governed by the guard", () => {
      expect(type(nfc, "K_K", "K_5")).toBe("k");
    });
  });
});

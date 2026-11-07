// Seeded-context simulator tests (spec 106 US6, FR-061): NFC `ǎ` and NFD
// `a`+U+030C contexts behave identically for the guard, peel and
// whole-stack.
//
// The two fixtures split the behaviours by their recorded backspace: Bafut
// kbdus records whole-stack, camqwerty records peel. The guard and
// whole-stack cases pin behaviour that already held on Bafut (the guard
// blocks the grave after either form; whole-stack deletes the whole stack
// either way). The peel case is the fix demonstration: without the
// default-accepted normalization the native per-codepoint peel deletes the
// whole NFC unit but only the mark of the NFD sequence — measured pre-fix on
// Bafut's peel override ("" vs "a"). On camqwerty the default-accepted
// normalization converts the seeded context to the keyboard's form first, so
// peel removes the mark in both cases.
//
// Reads the sibling ../keyboards corpus, so it runs under vitest.corpus.config.ts.

import { beforeAll, describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import type { SimKeyInput } from "@keyboard-studio/contracts";
import type { DecisionSet } from "../decisions/decisionTypes.ts";
import { buildDecisionPointFixture, type DecisionPointFixture } from "./decisionPointFixture.ts";
import { DECISION_POINT_BASES, DECISION_POINT_FIXTURE_DIR, fixtureRelPath } from "./decisionPointBases.ts";
import { announceSc004Skip, sc004GatesEnabled } from "./sc004Harness.ts";

announceSc004Skip("decision-point tolerance simulation", (name) => it.skip(name, () => {}));

const NFC = "ǎ"; // U+01CE
const NFD = "a\u030c"; // a + U+030C

const here = dirname(fileURLToPath(import.meta.url));
const fixtureRoot = resolve(here, "..", "..", DECISION_POINT_FIXTURE_DIR);
const bafut = DECISION_POINT_BASES.find((b) => b.profile === "p1-whole-bafut-kbdus")!;
const camqwerty = DECISION_POINT_BASES.find((b) => b.profile === "p4-unwrap-bafut-camqwerty")!;

function decisionsAt(base: typeof bafut): DecisionSet {
  return JSON.parse(readFileSync(resolve(fixtureRoot, fixtureRelPath(base, "tolerance")), "utf-8")) as DecisionSet;
}

const keys = (...vkeys: string[]): SimKeyInput[] => vkeys.map((vkey) => ({ vkey, modifiers: [], caps: false }));

describe.skipIf(!sc004GatesEnabled)("seeded contexts, NFC vs NFD (Bafut kbdus at tolerance)", () => {
  let fx: DecisionPointFixture;
  beforeAll(async () => {
    fx = await buildDecisionPointFixture({ ...bafut, point: "tolerance", decisions: decisionsAt(bafut) });
  }, 240_000);

  const type = (seed: string, ...vkeys: string[]): string =>
    fx.simulate(keys(...vkeys), { text: seed }).finalOutput;

  it("the guard blocks the grave after either form (seed left untouched)", () => {
    expect(type(NFC, "K_5")).toBe(NFC);
    expect(type(NFD, "K_5")).toBe(NFD);
  });

  it("whole-stack backspace deletes the whole stack in either form", () => {
    expect(type(NFC, "K_BKSP")).toBe("");
    expect(type(NFD, "K_BKSP")).toBe("");
  });

  it("typing a letter after either form appends it to the seed", () => {
    expect(type(NFC, "K_A")).toBe(`${NFC}a`);
    expect(type(NFD, "K_A")).toBe(`${NFD}a`);
  });
});

describe.skipIf(!sc004GatesEnabled)("seeded contexts, NFC vs NFD (camqwerty at tolerance)", () => {
  let fx: DecisionPointFixture;
  beforeAll(async () => {
    fx = await buildDecisionPointFixture({ ...camqwerty, point: "tolerance", decisions: decisionsAt(camqwerty) });
  }, 240_000);

  const type = (seed: string, ...vkeys: string[]): string =>
    fx.simulate(keys(...vkeys), { text: seed }).finalOutput;

  it("peel backspace removes the mark in either form (FR-061)", () => {
    // The normalization converts the NFC seed to the keyboard's
    // (base-plus-mark) form first, so peel sees a + U+030C either way.
    expect(type(NFC, "K_BKSP")).toBe("a");
    expect(type(NFD, "K_BKSP")).toBe("a");
  });

  it("typing after either form gives the same output", () => {
    expect(type(NFC, "K_A")).toBe(type(NFD, "K_A"));
    expect(type(NFC, "K_5")).toBe(type(NFD, "K_5"));
  });
});

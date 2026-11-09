// Caps handling at the decision points (spec 112 US2): synthetic copies of the
// kbdus walk with a case the recorded walks do not reach, each run through the
// real download path (buildOutputBundle), compiled and gate-checked.
//
//   nonletter-and-ralt  eng/Eng on a non-letter key, RAlt pairs on a letter key
//                       and on a key whose base/Shift pair disagrees: G5 fails
//                       if the store is only the layout family's list, passes
//                       when derived (and the conflict key stays out)
//   caseless            not asked: nothing written or removed
//   explicit-rules      the copy's own caps handling stays as copied
//
// Reads the sibling ../keyboards corpus, so it runs under vitest.corpus.config.ts.

import { beforeAll, describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import type { SimKeyInput } from "@keyboard-studio/contracts";
import type { DecisionSet } from "../decisions/decisionTypes.ts";
import { readVfsText } from "../lib/vfsText.ts";
import { buildDecisionPointFixture, type DecisionPointFixture } from "./decisionPointFixture.ts";
import {
  DECISION_POINT_FIXTURE_DIR,
  SYNTHETIC_DECISION_POINT_BASES,
  fixtureRelPath,
  type SyntheticDecisionPointBase,
} from "./decisionPointBases.ts";
import { announceSc004Skip, sc004GatesEnabled } from "./sc004Harness.ts";

announceSc004Skip("decision-point caps fixtures", (name) => it.skip(name, () => {}));

const here = dirname(fileURLToPath(import.meta.url));
const fixtureRoot = resolve(here, "..", "..", DECISION_POINT_FIXTURE_DIR);
const key = (vkey: string, shift = false, caps = false): SimKeyInput => ({
  vkey,
  modifiers: shift ? ["shift"] : [],
  caps,
});

const named = (edit: SyntheticDecisionPointBase["edit"]) => {
  const b = SYNTHETIC_DECISION_POINT_BASES.find((x) => x.edit === edit);
  if (b === undefined) throw new Error(`no synthetic base for ${edit}`);
  return b;
};

async function build(b: SyntheticDecisionPointBase): Promise<{ fx: DecisionPointFixture; kmn: string }> {
  const decisions = JSON.parse(readFileSync(resolve(fixtureRoot, fixtureRelPath(b, b.point)), "utf-8")) as DecisionSet;
  const fx = await buildDecisionPointFixture({ ...b, decisions });
  return { fx, kmn: readVfsText(fx.vfs, `source/${fx.keyboardId}.kmn`) ?? "" };
}

const g5 = (fx: DecisionPointFixture) => fx.gates.find((g) => g.gate === "G5");
const store = (kmn: string) => /^store\(&CasedKeys\)\s*(.*)$/im.exec(kmn)?.[1];

describe.skipIf(!sc004GatesEnabled)("decision-point caps fixtures (spec 112)", () => {
  describe("nonletter-and-ralt", () => {
    let built: { fx: DecisionPointFixture; kmn: string };
    beforeAll(async () => {
      built = await build(named("nonletter-and-ralt"));
    }, 120_000);

    it("derives a store covering the non-letter key beside the floor, and leaves the conflict out", () => {
      const items = store(built.kmn) ?? "";
      expect(items).toContain("[K_A] .. [K_Z]");
      expect(items).toContain("[K_BKSLASH]");
      // K_COMMA types , and < on base/Shift and a pair only on RAlt: not a cased key.
      expect(items).not.toContain("[K_COMMA]");
    });

    it("G5 holds", () => {
      const r = g5(built.fx);
      expect(r?.pass, r?.detail.join("; ")).toBe(true);
    });

    it("compiles, and Caps upper-cases the new key", () => {
      expect(built.fx.compiled.success).toBe(true);
      expect(built.fx.simulate([key("K_BKSLASH")]).finalOutput).toBe("ŋ");
      expect(built.fx.simulate([key("K_BKSLASH", false, true)]).finalOutput).toBe("Ŋ");
    });
  });

  describe("caseless", () => {
    it("is not asked: the copy's own store is left as it was, and G5 holds", async () => {
      const { fx, kmn } = await build(named("caseless"));
      expect(store(kmn)).toBe("[K_A] .. [K_Z]");
      expect(g5(fx)?.pass).toBe(true);
    }, 120_000);
  });

  describe("explicit-rules", () => {
    it("leaves the copy's caps handling exactly as it was, and G5 holds", async () => {
      const { fx, kmn } = await build(named("explicit-rules"));
      expect(store(kmn)).toBe("[K_A] .. [K_Z]");
      expect(g5(fx)?.pass).toBe(true);
      expect(fx.compiled.success).toBe(true);
      expect(fx.simulate([key("K_B")]).finalOutput).toBe("b");
    }, 120_000);
  });
});

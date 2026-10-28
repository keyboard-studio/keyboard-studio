/**
 * Tests for keyMatchesRemovalSet's resolver mode (spec 104 T007, FR-003 /
 * FR-019, audit gap 1).
 *
 * The regression under test: the legacy matcher (text / output / U_-decode)
 * cannot see a ruled T_ key's production — sil_cameroon_qwerty's T_0300
 * keycap reads "◌̀" (dotted circle + mark) while the U+0300 production
 * lives entirely in its .kmn rules — so the key survived every removal set
 * containing U+0300. With a production context, matching is by resolver
 * production only. The mirror regression: a T_BLANK spacer whose text is
 * " " produces nothing and must not match even when " " is removed.
 *
 * Fixtures: the T001 idiom fixture (pattern-apply/__fixtures__/touch-id/
 * sil_cameroon_qwerty), parsed through the real codec + rule-join.
 */

import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";
import { buildTouchKeyRuleIndex } from "@keyboard-studio/contracts";
import type { KeyboardIR } from "@keyboard-studio/contracts";
import { parse } from "../codec/parse.js";
import {
  buildRemovalSet,
  keyMatchesRemovalSet,
  type RemovalProductionContext,
} from "./touch-mechanism-shared.js";

const here = dirname(fileURLToPath(import.meta.url));
const fixtureDir = resolve(here, "__fixtures__/touch-id/sil_cameroon_qwerty");

function cameroonIr(): KeyboardIR {
  const kmn = readFileSync(resolve(fixtureDir, "sil_cameroon_qwerty.kmn"), "utf8");
  return parse(kmn, "sil_cameroon_qwerty").ir;
}

function ctxFor(ir: KeyboardIR, layerId: string): RemovalProductionContext {
  return { production: { ir, ruleIndex: buildTouchKeyRuleIndex(ir) }, layerId };
}

describe("keyMatchesRemovalSet — resolver mode (spec 104 T007)", () => {
  const ir = cameroonIr();

  it("a ruled T_ key matches its rule-produced character (T_0300 vs U+0300)", () => {
    const candidate = { id: "T_0300", text: "◌̀" };
    const removalSet = buildRemovalSet(["̀"]);
    expect(keyMatchesRemovalSet(candidate, removalSet, ctxFor(ir, "default"))).toBe(true);
    // The legacy mode cannot see this production — the gap-1 blindness.
    expect(keyMatchesRemovalSet(candidate, removalSet)).toBe(false);
  });

  it("a guarded T_ key still matches in the state where its guard swallows it after some contexts", () => {
    // On the shift layer T_0300 has NO producing rule (only the default-layer
    // bare rule + guard) — production there is none, so no match. On the
    // default layer the guard makes production conditional, not absent.
    const candidate = { id: "T_0300", text: "◌̀" };
    const removalSet = buildRemovalSet(["̀"]);
    expect(keyMatchesRemovalSet(candidate, removalSet, ctxFor(ir, "shift"))).toBe(false);
    expect(keyMatchesRemovalSet(candidate, removalSet, ctxFor(ir, "default"))).toBe(true);
  });

  it("T_BLANK with text \" \" does not spuriously match a removed space", () => {
    const candidate = { id: "T_BLANK", text: " ", sp: 10 };
    const removalSet = buildRemovalSet([" "]);
    expect(keyMatchesRemovalSet(candidate, removalSet, ctxFor(ir, "default"))).toBe(false);
    // Legacy mode DOES match on the text — exactly the spurious match the
    // resolver mode exists to prevent.
    expect(keyMatchesRemovalSet(candidate, removalSet)).toBe(true);
  });

  it("a key whose production is a different character does not match", () => {
    const candidate = { id: "T_002E", text: "." };
    expect(keyMatchesRemovalSet(candidate, buildRemovalSet(["̀"]), ctxFor(ir, "default"))).toBe(
      false,
    );
    expect(keyMatchesRemovalSet(candidate, buildRemovalSet(["."]), ctxFor(ir, "default"))).toBe(
      true,
    );
  });

  it("an unruled K_ key matches via its US fallback production (state 0), not under RALT", () => {
    const candidate = { id: "K_1", text: "1" };
    const removalSet = buildRemovalSet(["1"]);
    expect(keyMatchesRemovalSet(candidate, removalSet, ctxFor(ir, "default"))).toBe(true);
    expect(keyMatchesRemovalSet(candidate, removalSet, ctxFor(ir, "rightalt"))).toBe(false);
  });

  it("a sub-key candidate resolves in its host layer's state", () => {
    // Sub-keys carry no layer of their own; the context's layerId is the
    // host layer's — a T_030D sub-key on the default layer produces U+030D.
    const sub = { id: "T_030D", text: "◌̍" };
    expect(keyMatchesRemovalSet(sub, buildRemovalSet(["̍"]), ctxFor(ir, "default"))).toBe(true);
    expect(keyMatchesRemovalSet(sub, buildRemovalSet(["̀"]), ctxFor(ir, "default"))).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// Emulation-class keys (T021 arm3 drift): a context rule on a function key
// is a text-rewriting trigger, not a typing method — only an unconditional
// (bare-rule) production of an emulation key counts for removal. Fixtures
// are the corpus shapes behind the five arm3 failures, minimised:
//   galaxie/hakka/taigi — `context + [K_TAB]/[K_ENTER] > output`
//   ibono/obolo_chwerty — `+ [ALT K_ENTER] > U+000A`
//   sil_cameroon (PR #2319) — `context + [K_BKSP] > stripped-base`
// ---------------------------------------------------------------------------

describe("keyMatchesRemovalSet — emulation-class keys (spec 104, T021 arm3)", () => {
  const kmn = [
    "store(&TARGETS) 'any'",
    "begin Unicode > use(main)",
    "group(main) using keys",
    '"x" + [K_TAB] > "y"',
    '"é" + [K_BKSP] > "e"',
    '"x" + [K_A] > "z"',
    "+ [ALT K_ENTER] > U+000A",
    "",
  ].join("\n");
  const emuIr = parse(kmn, "emulation-fixture").ir;
  const emuCtx = (layerId: string): RemovalProductionContext => ctxFor(emuIr, layerId);

  it("a context (conversion) rule on K_TAB does not make Tab a producer of its output", () => {
    expect(
      keyMatchesRemovalSet({ id: "K_TAB" }, buildRemovalSet(["y"]), emuCtx("default")),
    ).toBe(false);
  });

  it("a context (correction) rule on K_BKSP does not make Backspace a producer of the stripped base (PR #2319)", () => {
    expect(
      keyMatchesRemovalSet({ id: "K_BKSP" }, buildRemovalSet(["e"]), emuCtx("default")),
    ).toBe(false);
  });

  it("a bare rule on K_ENTER is its own production in that state (alt-layer newline)", () => {
    expect(
      keyMatchesRemovalSet({ id: "K_ENTER" }, buildRemovalSet(["\n"]), emuCtx("alt")),
    ).toBe(true);
    // The same key in a state the bare rule does not bind produces nothing.
    expect(
      keyMatchesRemovalSet({ id: "K_ENTER" }, buildRemovalSet(["\n"]), emuCtx("default")),
    ).toBe(false);
  });

  it("a context-conditional production on a NON-emulation key still matches", () => {
    // The emulation refinement must not narrow ordinary keys: K_A's
    // context rule is a (conditional) method for typing "z".
    expect(
      keyMatchesRemovalSet({ id: "K_A" }, buildRemovalSet(["z"]), emuCtx("default")),
    ).toBe(true);
  });
});

// spec 062 US4 (FR-014): backspace-unwrap variant tests for
// addBackspaceUnwrap (T020) — see its module doc in context-variants.ts.

import { describe, it, expect } from "vitest";
import type { KeyboardIR } from "@keyboard-studio/contracts";
import { createVirtualFS } from "@keyboard-studio/contracts";
import { parse } from "../codec/parse.js";
import { emit } from "../codec/emit.js";
import { compile } from "../compiler/index.js";
import { simulate } from "../simulator/index.js";
import { computeContextTolerance } from "../validator/context-tolerance.js";
import { proposeContextVariants, BACKSPACE_UNWRAP_RULE_PREFIX } from "./context-variants.js";

const HEADER = [
  "store(&NAME) 'BackspaceUnwrap'",
  "store(&VERSION) '14.0'",
  "store(&KEYBOARDVERSION) '1.0'",
  "store(&TARGETS) 'any'",
  "",
  "begin Unicode > use(main)",
  "",
].join("\n");

// U+1EC7 LATIN SMALL LETTER E WITH CIRCUMFLEX AND DOT BELOW ("ệ") — a real
// two-mark precomposed unit. Its NFD is three code points (base + two
// combining marks, canonically ordered by combining class — below before
// above, so dot-below precedes circumflex, not typing order); the
// one-mark-shorter predecessor is computed the same way the generator
// computes it (drop the canonically-LAST mark, recompose), rather than
// hand-typing the expected glyph and risking exactly the canonical-ordering
// mistake this feature exists to get right.
const TWO_MARK_PRECOMPOSED = "ệ";
const TWO_MARK_NFD = [...TWO_MARK_PRECOMPOSED.normalize("NFD")];
const ONE_MARK_SHORTER_PRECOMPOSED = TWO_MARK_NFD.slice(0, -1).join("").normalize("NFC");

// A keyboard that merely OUTPUTS the two-mark unit somewhere (attesting it
// to the generator) — it defines no backspace rule of its own, matching a
// typical imported keyboard with no hand-written unwrap table.
const KMN_NO_BKSP_RULE = [
  HEADER,
  "group(main) using keys",
  "",
  `+ [K_E] > U+1EC7`,
  "",
].join("\n");

async function compileIr(ir: KeyboardIR) {
  const vfs = createVirtualFS([
    { path: `source/${ir.header.keyboardId}.kmn`, content: emit(ir), isBinary: false },
  ]);
  return compile(vfs, ir.header.keyboardId);
}

const BKSP_KEY = { vkey: "K_BKSP", modifiers: [] as const };

describe("addBackspaceUnwrap (spec 062 US4, FR-014)", () => {
  it("Acceptance Scenario 1: a single backspace loses exactly one mark from either canonical form, landing in canonically-equivalent states", async () => {
    const { ir } = parse(KMN_NO_BKSP_RULE, "bksp_scenario1");
    const report = await computeContextTolerance(ir);
    const { ir: fixedIr, variants } = await proposeContextVariants(ir, report);
    expect(variants.some((v) => v.sourceRuleId.startsWith(BACKSPACE_UNWRAP_RULE_PREFIX))).toBe(true);

    const compiled = await compileIr(fixedIr);
    expect(compiled.success).toBe(true);

    const decomposed = TWO_MARK_PRECOMPOSED.normalize("NFD");
    const decomposedResult = simulate(compiled, [BKSP_KEY], { text: decomposed }).finalOutput;
    const precomposedResult = simulate(compiled, [BKSP_KEY], { text: TWO_MARK_PRECOMPOSED }).finalOutput;

    // Both land on the same one-mark-shorter form — canonically equivalent,
    // and each has lost exactly one mark: Unicode's canonical ordering sorts
    // combining marks by combining class (below before above), so the
    // CANONICALLY-last mark this generator drops is the circumflex (class
    // 230, above), not the dot-below (class 220, below) — the result keeps
    // the dot-below, not the circumflex. See this file's own module doc and
    // context-variants.ts's "canonical order vs. typing order" limitation
    // note for why this is spec-compliant but not necessarily what a native
    // speaker of a language stacking marks in the opposite order would
    // expect from backspace.
    expect(decomposedResult).toBe(ONE_MARK_SHORTER_PRECOMPOSED);
    expect(precomposedResult).toBe(ONE_MARK_SHORTER_PRECOMPOSED);
    expect(decomposedResult.normalize("NFC")).toBe(precomposedResult.normalize("NFC"));
  }, 30_000);

  it("Acceptance Scenario 2: backspace against a decomposed accented letter removes exactly one mark, not the whole cluster", async () => {
    const { ir } = parse(KMN_NO_BKSP_RULE, "bksp_scenario2");
    const report = await computeContextTolerance(ir);
    const { ir: fixedIr } = await proposeContextVariants(ir, report);

    const compiled = await compileIr(fixedIr);
    expect(compiled.success).toBe(true);

    // A host that deletes a whole grapheme cluster per backspace would, with
    // NO rule intervening, remove all three decomposed code points at once,
    // landing on "" (or on native per-codepoint hosts, on "e" + circumflex
    // minus circumflex too if it deleted two). The generated rule fires
    // FIRST, matching the full three-code-point decomposed context, so the
    // simulated result — which always applies the compiled keyboard's own
    // rules, never a host's grapheme-cluster heuristic — is the one-mark-
    // shorter precomposed form, proving the mark was removed one at a time
    // by the KEYBOARD, not left to whatever the host's cluster boundary is.
    const decomposed = TWO_MARK_PRECOMPOSED.normalize("NFD");
    const result = simulate(compiled, [BKSP_KEY], { text: decomposed }).finalOutput;
    expect(result).toBe(ONE_MARK_SHORTER_PRECOMPOSED);
    expect([...result].length).toBeGreaterThan(0);
  }, 30_000);

  it("is idempotent — running twice produces byte-identical IR (FR-011)", async () => {
    const { ir } = parse(KMN_NO_BKSP_RULE, "bksp_idempotent");
    const report = await computeContextTolerance(ir);
    const once = await proposeContextVariants(ir, report);
    const twice = await proposeContextVariants(once.ir, report);

    expect(twice.ir).toEqual(once.ir);
    expect(twice.variants).toEqual(once.variants);
  }, 30_000);

  it("generates no backspace-unwrap variant when no composed multi-mark unit is attested", async () => {
    const kmn = [HEADER, "group(main) using keys", "", "+ 'a' > 'a'", ""].join("\n");
    const { ir } = parse(kmn, "bksp_no_units");
    const report = await computeContextTolerance(ir);
    const { variants } = await proposeContextVariants(ir, report);
    expect(variants.some((v) => v.sourceRuleId.startsWith(BACKSPACE_UNWRAP_RULE_PREFIX))).toBe(false);
  }, 30_000);
});

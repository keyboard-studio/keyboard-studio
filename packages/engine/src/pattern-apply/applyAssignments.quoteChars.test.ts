// A slot value holding a quote character (' or ") must still emit a valid KMN
// literal. The templates wrap user characters in single quotes; the studio's
// placement path can hand them a straight apostrophe (a displaced counterpart
// moved onto an AltGr key), so the engine owns the escaping. Each case runs the
// real production pattern, parses the result and checks the produced glyphs.

import { describe, it, expect, beforeAll } from "vitest";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import type { MechanismAssignment, Pattern } from "@keyboard-studio/contracts";
import { buildProducedSet } from "@keyboard-studio/contracts";
import { parse } from "../codec/index.js";
import { loadPatterns, getById } from "../pattern-library/index.js";
import { applyAssignments } from "./applyAssignments.js";

const CONTENT_DIR = resolve(dirname(fileURLToPath(import.meta.url)), "../../../../content/patterns");

const BASE_KMN =
  "store(&VERSION) '10.0'\n" +
  "store(&NAME) 'Test'\n" +
  "store(&TARGETS) 'any'\n" +
  "begin Unicode > use(main)\n" +
  "\n" +
  "group(main) using keys\n" +
  "\n" +
  "+ [K_N] > 'n'\n";

beforeAll(async () => {
  await loadPatterns(CONTENT_DIR);
});

const resolver = (id: string): Pattern | undefined => getById(id);

function assignment(
  patternId: string,
  strategyId: string,
  slotValues: Record<string, string>,
  target = "",
): MechanismAssignment {
  return {
    scope: "individual",
    target,
    modality: "physical",
    mechanisms: [{ patternId, strategyId, slotValues }],
    source: "user",
  };
}

function producedFrom(assignments: MechanismAssignment[]): { kmn: string; produced: Set<string> } {
  const { kmn, warnings } = applyAssignments(assignments, resolver, BASE_KMN);
  expect(warnings).toEqual([]);
  const { ir } = parse(kmn, "test");
  return { kmn, produced: buildProducedSet(ir, { excludeBackspaceCorrections: true }) };
}

const s08 = (key: string, out: string): MechanismAssignment =>
  assignment("modifier_as_layer_switch", "S-08", { altgrKeyList: key, altgrOutputList: out }, out);

describe("S-08 modifier_as_layer_switch with quote characters among the outputs", () => {
  it("keeps every output of a merged store, apostrophe included", () => {
    const { kmn, produced } = producedFrom([
      s08("[RALT K_QUOTE]", "'"),
      s08("[RALT K_LBRKT]", "["),
      s08("[RALT K_I]", "ɨ"),
      s08("[SHIFT RALT K_I]", "Ɨ"),
      s08("[RALT K_5]", "5"),
    ]);
    expect(kmn).not.toContain("''[");
    for (const ch of ["'", "[", "ɨ", "Ɨ", "5"]) expect(produced.has(ch)).toBe(true);
  });

  it("handles a double quote and an apostrophe in the same store", () => {
    const { produced } = producedFrom([
      s08("[RALT K_QUOTE]", "'"),
      s08("[RALT K_2]", '"'),
      s08("[RALT K_I]", "ɨ"),
    ]);
    for (const ch of ["'", '"', "ɨ"]) expect(produced.has(ch)).toBe(true);
  });

  it("leaves a store with no quote character spelled as before", () => {
    const { kmn } = producedFrom([s08("[RALT K_I]", "ɨ"), s08("[RALT K_5]", "5")]);
    expect(kmn).toContain("store(altgrOutput) 'ɨ5'");
  });
});

describe("other slots that interpolate characters into a quoted literal", () => {
  it("multi_char_sequence: a quote as collapsedChar, firstLetterOut or secondLetter", () => {
    const { produced } = producedFrom([
      assignment("multi_char_sequence", "S-03", { firstLetterOut: "n", secondLetter: "y", collapsedChar: "'" }),
      assignment("multi_char_sequence", "S-03", { firstLetterOut: "n", secondLetter: "g", collapsedChar: '"' }),
    ]);
    expect(produced.has("'")).toBe(true);
    expect(produced.has('"')).toBe(true);
  });

  it("deadkey_single_tap: a quote as accentChar and inside accentedForms", () => {
    const { kmn, produced } = producedFrom([
      assignment("deadkey_single_tap", "S-02", {
        triggerKey: "K_COLON",
        deadkeyName: "3000",
        baseLetters: "a",
        accentedForms: "'",
        accentChar: "'",
      }),
    ]);
    expect(kmn).not.toContain("''");
    expect(produced.has("'")).toBe(true);
  });

  it("postfix_compose: a quote as markChar", () => {
    const { produced } = producedFrom([
      assignment("postfix_compose", "S-04", {
        markName: "q",
        markKey: "K_QUOTE",
        markChar: "'",
        baseChars: "a",
        composedChars: "b",
        escapes: "bare",
      }),
    ]);
    expect(produced.has("'")).toBe(true);
  });
});

// Per-question module: pb_diacritic_select (Phase B)
// Ported verbatim from content/flows/phase_b_characters.yaml.

import type { QuestionModule, ValidationResult } from "../../types.ts";

export const definition = {
  id: "pb_diacritic_select",
  prompt: "Tick every type of accent or tone mark your language uses.",
  help_text:
    "Each item in the list is one type of mark that can be placed on a letter. " +
    "Tick all the ones your language uses. If a mark you need is not listed, " +
    "you can type it in the special-letters question that follows. These accent " +
    "marks are complementary to the visual picker -- both feed the same " +
    "final character list.",
  type: "multi_select" as const,
  required: true,
  options: [
    {
      value: "U+0301",
      label:
        "Acute accent -- slant up-right (e.g. a becomes a with a mark going up to the right, as in café)",
    },
    {
      value: "U+0300",
      label:
        "Grave accent -- slant up-left (e.g. a becomes a with a mark going up to the left)",
    },
    {
      value: "U+0302",
      label: "Circumflex -- hat shape (e.g. a with a small hat above)",
    },
    {
      value: "U+0303",
      label: "Tilde -- squiggle above (e.g. n with a squiggle above)",
    },
    {
      value: "U+0304",
      label:
        "Macron -- straight bar above (marks a long vowel, e.g. in Māori)",
    },
    {
      value: "U+0306",
      label: "Breve -- short curve above (e.g. short vowel in Romanian)",
    },
    { value: "U+0307", label: "Dot above (e.g. in Maltese or Irish)" },
    {
      value: "U+0308",
      label:
        "Umlaut / diaeresis -- two dots above (e.g. in German: a with two dots)",
    },
    {
      value: "U+0309",
      label: "Hook above (e.g. Vietnamese falling-rising tone)",
    },
    {
      value: "U+030A",
      label:
        "Ring above -- small circle (e.g. Scandinavian a with a ring above)",
    },
    {
      value: "U+030B",
      label:
        "Double acute -- two slants (e.g. Hungarian long front rounded vowels)",
    },
    {
      value: "U+030C",
      label:
        "Caron / inverted hat (e.g. Czech and Slovak ch, sh, zh sounds)",
    },
    {
      value: "U+031B",
      label: "Horn -- small hook at top-right (Vietnamese)",
    },
    {
      value: "U+0323",
      label: "Dot below (e.g. in Yoruba or Igbo)",
    },
    {
      value: "U+0327",
      label:
        "Cedilla -- hook below (e.g. French c-cedilla, Turkish s -- NOT for Romanian s/t; use Comma below instead)",
    },
    {
      value: "U+0328",
      label: "Ogonek -- tail below (e.g. Polish a and e with tails)",
    },
    {
      value: "U+0326",
      label:
        "Comma below (e.g. Romanian s and t -- use this, not the cedilla, for modern Romanian)",
    },
    {
      value: "U+0332",
      label: "Bar / macron below (e.g. some Semitic romanizations)",
    },
    {
      value: "U+0330",
      label: "Tilde below (e.g. some phonetic systems)",
    },
  ],
  next: "pb_stacking_marks",
} satisfies import("../../types.ts").FlowQuestion;

const VALID_CODEPOINTS = new Set([
  "U+0301", "U+0300", "U+0302", "U+0303", "U+0304", "U+0306",
  "U+0307", "U+0308", "U+0309", "U+030A", "U+030B", "U+030C",
  "U+031B", "U+0323", "U+0327", "U+0328", "U+0326", "U+0332",
  "U+0330",
]);

export function validate(
  value: string | string[] | undefined,
): ValidationResult {
  const arr = Array.isArray(value) ? value : typeof value === "string" ? [value] : [];
  if (arr.length === 0) {
    return {
      ok: false,
      code: "required",
      message: "Please select at least one accent or tone mark.",
    };
  }
  for (const v of arr) {
    if (!VALID_CODEPOINTS.has(v)) {
      return {
        ok: false,
        code: "invalid_option",
        message: `"${v}" is not a valid diacritic codepoint.`,
      };
    }
  }
  return { ok: true };
}

export const fixtures: QuestionModule["fixtures"] = {
  valid: [
    { value: ["U+0301"], note: "single acute accent" },
    {
      value: ["U+0301", "U+0300", "U+0323"],
      note: "acute + grave + dot-below (multi-family)",
    },
  ],
  invalid: [
    { value: [], expectedCode: "required" },
    { value: undefined, expectedCode: "required" },
    { value: ["U+9999"], expectedCode: "invalid_option", note: "unknown codepoint" },
  ],
};


const mod: QuestionModule = { definition, validate, fixtures, inputs: [], writes: [] };
export default mod;

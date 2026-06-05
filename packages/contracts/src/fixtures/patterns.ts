// see spec.md section 5 / section 6 / section 7.3 — Pattern test fixtures

import { makePattern } from "../pattern";
import type { Pattern } from "../pattern";

/**
 * The spec §6 worked example: latin deadkey producing accented characters.
 * Strategy S-02 (deadkey), commonly combines with S-04 (collapse the post-deadkey table), S-08 (NFD reorder),
 * and S-11 (shift-accessed).
 * Category "desktop" — lives in the desktop gallery.
 */
export const latinDeadkeyAcuteSingle: Pattern = makePattern({
  id: "latin_deadkey_acute_single",
  title: "Tap, then a base letter, gives an accented version",
  description:
    "A single apostrophe or backtick (the trigger key) followed by a base letter produces the precomposed accented form.",
  category: "desktop",
  appliesTo: [],
  strategyId: "S-02",
  combinesWith: ["S-04", "S-08", "S-11"],
  questions: [
    {
      id: "triggerKey",
      prompt: "Which key acts as the accent trigger?",
      answerType: "key-name",
      default: "K_QUOTE",
    },
    {
      id: "accentChar",
      prompt: "Which combining accent mark do you want?",
      answerType: "char-single",
      default: "́", // combining acute accent
    },
    {
      id: "baseLetters",
      prompt: "Which base letters take this accent?",
      answerType: "char-list",
      default: "aeiouAEIOU",
    },
    {
      id: "accentedForms",
      prompt: "List the accented forms in the same order as the base letters.",
      answerType: "char-list",
      default: "áéíóúÁÉÍÓÚ",
    },
    {
      id: "descriptionOfAccent",
      prompt: "Optional: short human-readable name for this accent (shown in documentation and UI).",
      answerType: "text",
      default: "acute",
      required: false,
    },
  ],
  kmnFragment:
    "c ---- S-02 Single deadkey stores -----------------------------------------------\n" +
    "c Both stores MUST have the same element count; the scaffolder enforces this at\n" +
    "c Layer A slot-fill validation (spec §10 Check #1).\n" +
    "store(dk_bases)  '{{baseLetters}}'\n" +
    "store(dk_output) '{{accentedForms}}'\n\n" +
    "group(main) using keys\n\n" +
    "c ---- Trigger key arms the deadkey -------------------------------------------\n" +
    "c Pressing {{triggerKey}} alone commits nothing; it arms a deadkey state.\n" +
    "+ [{{triggerKey}}] > deadkey(accent)\n\n" +
    "match > use(deadkeys)\n\n" +
    "group(deadkeys) using keys\n\n" +
    "c ---- Resolution: deadkey + base letter → accented form -----------------------\n" +
    "c The deadkey followed by a character in dk_bases produces the precomposed output.\n" +
    "c index() offset N=2: position 1 is the deadkey() context, position 2 is any(dk_bases).\n" +
    "c Output is precomposed NFC (no combining sequences).\n" +
    "deadkey(accent) + any(dk_bases) > index(dk_output, 2)\n\n" +
    "c ---- Double-press: trigger key pressed twice --------------------------------\n" +
    "c Pressing the trigger key twice produces the bare combining accent.\n" +
    "c This rule must appear BEFORE the generic notany() fallback so it fires first.\n" +
    "deadkey(accent) + [{{triggerKey}}] > '{{accentChar}}'\n\n" +
    "c ---- Fallback: unrecognized key after the trigger ----------------------------\n" +
    "c notany() matches any key NOT in dk_bases. context(2) restores the unmatched key\n" +
    "c after the trigger character, implementing the \"restore on miss\" pattern.\n" +
    "c This allows the trigger character to fall through to normal output when followed\n" +
    "c by any non-base letter.\n" +
    "deadkey(accent) + notany(dk_bases) > '{{accentChar}}' context(2)\n",
  touchLayoutFragment:
    '{\n  "id": "{{triggerKey}}",\n  "sk": [\n    { "id": "{{accentChar}}", "text": "{{accentChar}}" }\n  ]\n}\n',
  tests: [
    {
      input: ["K_QUOTE", "K_A"],
      expectedOutput: "á",
      description: "apostrophe + a produces a-acute (U+00E1)",
    },
    {
      input: ["K_QUOTE", "K_E"],
      expectedOutput: "é",
      description: "apostrophe + e produces e-acute (U+00E9)",
    },
    {
      input: ["K_QUOTE", "K_I"],
      expectedOutput: "í",
      description: "apostrophe + i produces i-acute (U+00ED)",
    },
    {
      input: ["K_QUOTE", "K_O"],
      expectedOutput: "ó",
      description: "apostrophe + o produces o-acute (U+00F3)",
    },
    {
      input: ["K_QUOTE", "K_U"],
      expectedOutput: "ú",
      description: "apostrophe + u produces u-acute (U+00FA)",
    },
    {
      input: ["K_QUOTE", "K_QUOTE"],
      expectedOutput: "́",
      description: "double-tap trigger emits the bare combining acute (U+0301)",
    },
    {
      input: ["K_QUOTE", "K_SPACE"],
      expectedOutput: "́ ",
      description: "apostrophe + space: space is not in baseLetters, so fallback rule fires producing combining accent + space",
    },
    {
      input: ["K_QUOTE", "K_B"],
      expectedOutput: "́b",
      description: "apostrophe + b (not in baseLetters): fallback rule outputs combining accent + literal b",
    },
  ],
  validatedForFamilies: ["Latn"],
  sourceKeyboards: [
    "release/basic/basic_kbdfr",
    "release/sil/sil_euro_latin",
  ],
  reviewedBy: "keyboard-studio-content-team",
  reviewDate: "2026-06-04",
});

/**
 * Longpress alternates pattern — touch gallery.
 * Strategy S-05 (longpress menu); unrestricted appliesTo so it appears for all scripts.
 */
export const longpressAlternates: Pattern = makePattern({
  id: "longpress_alternates",
  title: "Long-press key reveals alternate characters",
  description:
    "Holding a key on a touch layout opens a pop-up menu of related characters (e.g. vowel variants, tone marks).",
  category: "touch",
  appliesTo: [],
  strategyId: "S-05",
  questions: [
    {
      id: "baseKey",
      prompt: "Which key should show the longpress menu?",
      answerType: "key-name",
    },
    {
      id: "alternatesJson",
      prompt:
        'List the alternate characters to show in the menu. The LLM expands the user\'s plain-language answer into a JSON array of {"id":"U_XXXX","text":"X"} entries — e.g. `[{"id":"U_00E1","text":"á"},{"id":"U_00E0","text":"à"}]` — and that JSON is substituted verbatim into the touch-layout fragment\'s `sk` field.',
      answerType: "text",
    },
  ],
  kmnFragment:
    "// Longpress alternates are defined in the touch-layout JSON fragment below.\n" +
    "// No additional KMN rules are required for longpress behaviour.\n",
  touchLayoutFragment: '{\n  "sk": {{alternatesJson}}\n}\n',
  tests: [
    {
      input: ["T_LONGPRESS_BASE"],
      expectedOutput: "", // longpress surfaces menu; no direct output
      description: "longpress on base key surfaces the alternate menu",
    },
  ],
  validatedForFamilies: ["Latn", "Deva", "Arab"],
  sourceKeyboards: ["release/sil/sil_euro_latin"],
  reviewedBy: "keyboard-studio-content-team",
  reviewDate: "2026-06-02",
});

/**
 * NFD normalization reorder pattern — reorder gallery.
 * Implements the NFD reorder step required for QWERTY/QWERTZ keyboards (spec §8 step 6).
 * Category "reorder" — offered only when the Three-group routing indicates a non-roman script
 * that needs curated reorder selection; QWERTY/QWERTZ receive this automatically via the
 * scaffolder and this pattern is informational for those groups.
 */
export const nfdNormalization: Pattern = makePattern({
  id: "nfd_normalization",
  title: "NFD reorder — normalize combining marks to canonical order",
  description:
    "Inserts a reorder group that converts NFC input to NFD and sorts combining marks to Unicode canonical order. Required for QWERTY/QWERTZ keyboards that emit precomposed characters (spec §8 step 6).",
  category: "reorder",
  appliesTo: [],
  strategyId: "S-08",
  questions: [
    {
      id: "combiningMarks",
      prompt:
        "List the combining characters that need canonical reordering (U+XXXX notation or paste directly).",
      answerType: "char-list",
    },
  ],
  kmnFragment:
    "// NFD reorder group — canonical combining-mark sort\n" +
    "// Generated by the scaffolder for QWERTY/QWERTZ targets; adjust\n" +
    "// the class list below for your script's combining mark set.\n",
  reorderRules:
    "reorder(from({{combiningMarks}}) before(\\uFFFD) order(0))\n",
  tests: [
    {
      input: ["U_0061", "U_0301", "U_0308"], // a + combining acute + combining diaeresis
      expectedOutput: "á̈", // renders as U+0061 U+0301 U+0308; canonical NFC would differ; NFD order preserved
      description: "combining marks are emitted in canonical NFD order",
    },
  ],
  validatedForFamilies: ["Latn"],
  sourceKeyboards: ["release/sil/sil_euro_latin"],
  reviewedBy: "keyboard-studio-content-team",
  reviewDate: "2026-06-02",
});

/** All sample Pattern fixtures as an ordered array. */
export const samplePatterns: Pattern[] = [
  latinDeadkeyAcuteSingle,
  longpressAlternates,
  nfdNormalization,
];

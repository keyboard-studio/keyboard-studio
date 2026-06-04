// see spec.md section 5 / section 6 / section 7.3 — Pattern test fixtures

import { makePattern } from "../pattern";
import type { Pattern } from "../pattern";

/**
 * The spec §6 worked example: latin deadkey producing accented characters.
 * Strategy S-02 (deadkey), commonly combines with S-04 (RAlt layer).
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
  combinesWith: ["S-04"],
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
    },
    {
      id: "accentedForms",
      prompt: "List the accented forms in the same order as the base letters.",
      answerType: "char-list",
    },
  ],
  kmnFragment:
    "store(dk_acute_bases)  '{{baseLetters}}'\n" +
    "store(dk_acute_output) '{{accentedForms}}'\n\n" +
    "+ [{{triggerKey}}] > deadkey(acute)\n" +
    "deadkey(acute) + any(dk_acute_bases) > index(dk_acute_output, 2)\n" +
    "deadkey(acute) + [{{triggerKey}}] > '{{accentChar}}'\n",
  touchLayoutFragment:
    '{\n  "sk": [\n    { "id": "{{accentChar}}", "text": "{{accentChar}}" }\n  ]\n}\n',
  tests: [
    {
      input: ["K_QUOTE", "K_A"],
      expectedOutput: "á", // a-acute
      description: "apostrophe + a produces a-acute (U+00E1)",
    },
    {
      input: ["K_QUOTE", "K_E"],
      expectedOutput: "é", // e-acute
      description: "apostrophe + e produces e-acute (U+00E9)",
    },
    {
      input: ["K_QUOTE", "K_QUOTE"],
      expectedOutput: "́", // bare combining acute on double-tap
      description: "double-tap trigger emits the bare combining accent",
    },
  ],
  validatedForFamilies: ["Latn"],
  sourceKeyboards: [
    "release/basic/basic_kbdfr",
    "release/sil/sil_euro_latin",
  ],
  reviewedBy: "keyboard-studio-content-team",
  reviewDate: "2026-06-02",
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

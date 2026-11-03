// Sample keyboards from the sibling ../keyboards checkout (release/** layout)
// for corpus round-trip tests of the open-existing-keyboard flow. Every id is
// listed in docs/keyboard-index.md. The corpus checks out with CRLF line
// endings, so every sample exercises the CRLF path in its .kmn / .kps files.

/** The target keyboard for the 278-language .kps round-trip, plus the basic reference. */
const REFERENCE = ["sil_cameroon_qwerty", "basic_kbdus", "basic_kbdfr", "basic_kbda1", "basic_kbduk"] as const;

/** Keyboards that ship a .keyman-touch-layout file. */
const TOUCH_ENABLED = [
  "akan",
  "anii",
  "bambara",
  "bamum",
  "amazigh_latin",
  "arabic_izza",
  "sil_indic_roman",
] as const;

/** Keyboards with many deadkey() rules, most-heavy first within the group. */
const DEADKEY_HEAVY = [
  "gandhari",
  "swanalekha_malayalam",
  "greekclassical",
  "bj_naskapi_common",
  "coptic_greek",
  "turkmen_cyrl",
  "sil_nigeria_dot",
  "sil_nigeria_underline",
] as const;

export const OPEN_SAMPLE_KEYBOARD_IDS: readonly string[] = [
  ...REFERENCE,
  ...TOUCH_ENABLED,
  ...DEADKEY_HEAVY,
];

/** Path of a sample keyboard's folder relative to the keyboards checkout's `release/` dir. */
export function sampleKeyboardRelativePath(id: string): string {
  const vendor = id.startsWith("sil_") ? "sil" : id.startsWith("basic_") ? "basic" : id.startsWith("bj_") ? "bj" : id.charAt(0);
  return `${vendor}/${id}`;
}

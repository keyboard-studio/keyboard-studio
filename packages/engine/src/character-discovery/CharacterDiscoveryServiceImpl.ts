import type {
  CharacterDiscoveryService,
  InventoryChar,
  BaseKeyboard,
  LinguistInventory,
} from "@keyboard-studio/contracts";
import { makeLinguistInventory } from "@keyboard-studio/contracts";
import type { CldrLoader } from "./cldr.js";
import { loadExemplars, scriptBlockChars } from "./cldr.js";

/**
 * Injectable LLM backend — returns raw response text for a given prompt.
 *
 * Node-side composition: wrap the @keyboard-studio/llm client as
 * `(p) => createLLMClient(config).complete(p)`. The engine package must NOT
 * import @keyboard-studio/llm directly — that package is Node.js-only and
 * would break browser bundling of the engine.
 */
export type LLMCompleter = (prompt: string) => Promise<string>;

const LINGUIST_PROMPT_TEMPLATE = `You are an expert computational linguist specializing in typography, character
encoding, and internationalization.

Your sole task is to analyze the writing system of the language specified below
and extract an exhaustive, accurate list of every character required to type
natively in this language. Do not explain the history or grammar. Only output the
requested structured data.

Target Language: {{languageName}} ({{bcp47}})

### Step 1: Data Gathering & Verification
1. Access or search the Unicode CLDR (Common Locale Data Repository) for the
   target language. Focus on the \`exemplarCharacters\` tag.
2. Cross-reference this with standard orthography references (e.g., Omniglot,
   official language academies, or a trusted text corpus).

### Step 2: Character Processing Rules
To ensure the data is production-ready for character inventory mapping, you must
apply the following logical constraints:
- Unicode Normalization: All output characters must be strictly normalized to NFC
  (Normalization Form Canonical Composition). Do not separate diacritics from
  their base letters (e.g., use 'á', not 'a' + '´').
- Case Sensitivity: If the language uses a bicameral script (like Latin, Cyrillic,
  Greek), you must extract BOTH lowercase and uppercase variants.
- Letter-Modifier Bundles: If a specific diacritic-letter combination is
  considered an independent letter in the alphabet, or is mandatory for standard
  spelling, treat it as a unique character.

### Step 3: Required Output Format
Provide the final character inventory strictly in the following JSON format. Do
not include any conversational intro or outro text.

The following five fields are optional; omit any that do not apply to the script.

{
  "language": "{{bcp47}}",
  "script": "Name of the script (e.g., Latin, Arabic, Devanagari)",
  "alphabet_core": {
    "lowercase": ["a", "b", "c"],
    "uppercase": ["A", "B", "C"]
  },
  "alphabet_auxiliary": {
    "lowercase": ["x", "y"],
    "uppercase": ["X", "Y"],
    "note": "Characters used only in loanwords or historical texts"
  },
  "mandatory_diacritics_and_ligatures": ["œ", "æ", "ß"],
  "language_specific_punctuation": ["«", "»", "¿", "¡"],
  "numerals": ["0", "1", "2", "3", "4", "5", "6", "7", "8", "9"],
  "digraphs_as_phoneme_units": ["sh", "ts", "ny"],
  "nukta_and_borrowed_sound_markers": ["क़", "ख़", "ग़"],
  "independent_vowels": ["अ", "आ", "इ"],
  "direction_control_chars": ["U+200F", "U+200E"],
  "syllabic_final_markers": ["U+1427", "U+1428"]
}`;

export function buildLinguistPrompt(languageName: string, bcp47: string, orthographyUrl?: string): string {
  let prompt = LINGUIST_PROMPT_TEMPLATE
    .replace(/\{\{languageName\}\}/g, languageName)
    .replace(/\{\{bcp47\}\}/g, bcp47);

  if (orthographyUrl !== undefined) {
    // Anchor the LLM to a verified primary source rather than general knowledge alone
    let safeUrl: string;
    try {
      safeUrl = new URL(orthographyUrl).href.replace(/[\r\n]/g, "");
    } catch (e) {
      throw new Error(`linguist: invalid orthographyUrl "${orthographyUrl}"`, { cause: e });
    }
    prompt += `\n\nGrounding source: Use the following URL as the primary source for orthography data: ${safeUrl}`;
  }

  return prompt;
}

/**
 * Parse a U+XXXX codepoint string into the corresponding character.
 * Returns null if the string is not a valid U+ hex notation.
 */
function parseUPlusHex(s: string): string | null {
  const cp = parseInt(s.replace(/^U\+/i, ""), 16);
  return isNaN(cp) ? null : String.fromCodePoint(cp);
}

/**
 * Returns true if `cp` falls within one of the Unicode bidi / format-control
 * ranges that are valid as literal direction-control characters:
 *   U+200B–U+200F  (zero-width spaces and directional marks)
 *   U+202A–U+202E  (directional embedding / override controls)
 *   U+2066–U+2069  (isolate controls)
 *   U+061C         (ARABIC LETTER MARK)
 *   U+FEFF         (ZERO WIDTH NO-BREAK SPACE / BOM)
 */
function isBidiControlCodePoint(cp: number): boolean {
  return (
    (cp >= 0x200b && cp <= 0x200f) ||
    (cp >= 0x202a && cp <= 0x202e) ||
    (cp >= 0x2066 && cp <= 0x2069) ||
    cp === 0x061c ||
    cp === 0xfeff
  );
}

/**
 * Normalise a single direction-control-char entry to U+XXXX notation.
 *
 * Accepts:
 *   - U+XXXX / u+xxxx notation — normalises to uppercase hex, minimum 4
 *     digits. The notation path is permissive: any codepoint is accepted
 *     because explicit notation represents explicit author intent.
 *   - Literal single-codepoint characters, but ONLY when the codepoint falls
 *     within the known bidi/format-control ranges:
 *       U+200B–U+200F, U+202A–U+202E, U+2066–U+2069, U+061C, U+FEFF.
 *     A literal character outside these ranges returns null (dropped silently).
 *
 * Returns null for entries that are neither (e.g. empty string, multi-char
 * literal, or a single char outside the bidi-control ranges).
 *
 * NOTE: conversion from U+XXXX notation back to raw characters happens at
 * .kmn emit time, not here.
 */
function toDirectionControlNotation(s: string): string | null {
  // U+XXXX / u+xxxx notation path — normalise to uppercase (permissive)
  if (/^[Uu]\+[0-9a-fA-F]+$/.test(s)) {
    const hex = s.slice(2).toUpperCase().padStart(4, "0");
    return `U+${hex}`;
  }
  // Literal character path — only accepted within bidi-control ranges
  const cp = s.codePointAt(0);
  if (cp === undefined) return null;
  // Only accept if the whole string is exactly one code point
  if (String.fromCodePoint(cp) !== s) return null;
  // Restrict to known bidi/format-control codepoints
  if (!isBidiControlCodePoint(cp)) return null;
  return `U+${cp.toString(16).toUpperCase().padStart(4, "0")}`;
}

/**
 * Parse a U+XXXX codepoint string into the corresponding character.
 * If the string is not valid U+ notation, returns the NFC-normalized
 * input string (pass-through for syllabic final markers that may be
 * provided as literal characters rather than U+ codes).
 */
function parseUPlusHexOrNFC(s: string): string {
  const result = parseUPlusHex(s);
  return result !== null ? result : s.normalize("NFC");
}

export function parseLinguistJson(text: string): LinguistInventory {
  const start = text.indexOf("{");
  const end = text.lastIndexOf("}");
  if (start === -1 || end === -1 || end <= start) {
    throw new Error("linguist: invalid JSON response");
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(text.slice(start, end + 1));
  } catch (e) {
    throw new Error("linguist: invalid JSON response", { cause: e });
  }

  if (typeof parsed !== "object" || parsed === null) {
    throw new Error("linguist: invalid JSON response");
  }

  const raw = parsed as Record<string, unknown>;

  if (typeof raw["language"] !== "string") {
    throw new Error("linguist: missing required field: language");
  }
  if (typeof raw["script"] !== "string") {
    throw new Error("linguist: missing required field: script");
  }

  const alphabetCoreRaw = raw["alphabet_core"];
  if (
    typeof alphabetCoreRaw !== "object" ||
    alphabetCoreRaw === null ||
    !Array.isArray((alphabetCoreRaw as Record<string, unknown>)["lowercase"]) ||
    !Array.isArray((alphabetCoreRaw as Record<string, unknown>)["uppercase"])
  ) {
    throw new Error("linguist: missing required field: alphabet_core");
  }

  if (raw["mandatory_diacritics_and_ligatures"] !== undefined && !Array.isArray(raw["mandatory_diacritics_and_ligatures"])) {
    throw new Error("linguist: missing required field: mandatory_diacritics_and_ligatures");
  }
  if (raw["language_specific_punctuation"] !== undefined && !Array.isArray(raw["language_specific_punctuation"])) {
    throw new Error("linguist: missing required field: language_specific_punctuation");
  }
  if (raw["numerals"] !== undefined && !Array.isArray(raw["numerals"])) {
    throw new Error("linguist: missing required field: numerals");
  }

  const nfc = (s: string) => s.normalize("NFC");
  const nfcArr = (arr: unknown[]): string[] =>
    arr.filter((v): v is string => typeof v === "string").map(nfc);

  const coreRaw = alphabetCoreRaw as Record<string, unknown>;
  const alphabetCore = {
    lowercase: nfcArr(coreRaw["lowercase"] as unknown[]),
    uppercase: nfcArr(coreRaw["uppercase"] as unknown[]),
  };

  const auxRaw = raw["alphabet_auxiliary"];
  let alphabetAuxiliary: { lowercase: string[]; uppercase: string[]; note?: string } | undefined;
  if (
    typeof auxRaw === "object" &&
    auxRaw !== null &&
    Array.isArray((auxRaw as Record<string, unknown>)["lowercase"]) &&
    Array.isArray((auxRaw as Record<string, unknown>)["uppercase"])
  ) {
    const auxObj = auxRaw as Record<string, unknown>;
    alphabetAuxiliary = {
      lowercase: nfcArr(auxObj["lowercase"] as unknown[]),
      uppercase: nfcArr(auxObj["uppercase"] as unknown[]),
      ...(typeof auxObj["note"] === "string" ? { note: auxObj["note"] } : {}),
    };
  }

  const mandatoryDiacriticsAndLigatures = Array.isArray(raw["mandatory_diacritics_and_ligatures"])
    ? nfcArr(raw["mandatory_diacritics_and_ligatures"] as unknown[])
    : [];
  const languageSpecificPunctuation = Array.isArray(raw["language_specific_punctuation"])
    ? nfcArr(raw["language_specific_punctuation"] as unknown[])
    : [];
  const numerals = Array.isArray(raw["numerals"])
    ? nfcArr(raw["numerals"] as unknown[])
    : [];

  const digraphsAsPhonemeUnits =
    Array.isArray(raw["digraphs_as_phoneme_units"])
      ? nfcArr(raw["digraphs_as_phoneme_units"] as unknown[])
      : undefined;

  const nuktaAndBorrowedSoundMarkers =
    Array.isArray(raw["nukta_and_borrowed_sound_markers"])
      ? nfcArr(raw["nukta_and_borrowed_sound_markers"] as unknown[])
      : undefined;

  const independentVowels =
    Array.isArray(raw["independent_vowels"])
      ? nfcArr(raw["independent_vowels"] as unknown[])
      : undefined;

  const directionControlCharsRaw =
    Array.isArray(raw["direction_control_chars"])
      ? (raw["direction_control_chars"] as unknown[])
          .filter((v): v is string => typeof v === "string")
          .map(toDirectionControlNotation)
          .filter((c): c is string => c !== null)
      : undefined;
  // Treat an all-filtered-out array the same as absent — do not store an empty field
  const directionControlChars =
    directionControlCharsRaw !== undefined && directionControlCharsRaw.length > 0
      ? directionControlCharsRaw
      : undefined;

  const syllabicFinalMarkers =
    Array.isArray(raw["syllabic_final_markers"])
      ? (raw["syllabic_final_markers"] as unknown[])
          .filter((v): v is string => typeof v === "string")
          .map(parseUPlusHexOrNFC)
      : undefined;

  return makeLinguistInventory({
    language: nfc(raw["language"] as string),
    script: nfc(raw["script"] as string),
    alphabetCore,
    ...(alphabetAuxiliary !== undefined ? { alphabetAuxiliary } : {}),
    mandatoryDiacriticsAndLigatures,
    languageSpecificPunctuation,
    numerals,
    ...(digraphsAsPhonemeUnits !== undefined ? { digraphsAsPhonemeUnits } : {}),
    ...(nuktaAndBorrowedSoundMarkers !== undefined ? { nuktaAndBorrowedSoundMarkers } : {}),
    ...(independentVowels !== undefined ? { independentVowels } : {}),
    ...(directionControlChars !== undefined ? { directionControlChars } : {}),
    ...(syllabicFinalMarkers !== undefined ? { syllabicFinalMarkers } : {}),
  });
}

export async function cldrCrossCheck(
  inv: LinguistInventory,
  bcp47: string,
  loader: CldrLoader,
): Promise<LinguistInventory> {
  const exemplarResult = await loadExemplars(bcp47, loader);
  if (exemplarResult === null) return inv;

  const agentLetters = new Set<string>();

  const addLettersFrom = (arr: string[]) => {
    for (const ch of arr) {
      if (/^\p{L}+$/u.test(ch) && (ch.codePointAt(0) ?? 0) > 0x7f) agentLetters.add(ch);
    }
  };

  addLettersFrom(inv.alphabetCore.lowercase);
  addLettersFrom(inv.alphabetCore.uppercase);
  addLettersFrom(inv.alphabetAuxiliary?.lowercase ?? []);
  addLettersFrom(inv.alphabetAuxiliary?.uppercase ?? []);

  for (const ch of inv.mandatoryDiacriticsAndLigatures) {
    if (/^\p{L}$/u.test(ch)) {
      agentLetters.add(ch);
    }
  }

  addLettersFrom(inv.nuktaAndBorrowedSoundMarkers ?? []);
  addLettersFrom(inv.independentVowels ?? []);
  addLettersFrom(inv.syllabicFinalMarkers ?? []);
  // directionControlChars intentionally excluded: they are invisible controls,
  // not letters, and are stored as U+XXXX notation strings (not raw chars).

  const cldrLetters = new Set(exemplarResult.specials);

  const newFlags: Array<{ char: string; issue: "not-attested" | "cldr-omitted" }> = [];

  for (const ch of agentLetters) {
    if (!cldrLetters.has(ch)) newFlags.push({ char: ch, issue: "not-attested" });
  }
  for (const ch of cldrLetters) {
    if (!agentLetters.has(ch)) newFlags.push({ char: ch, issue: "cldr-omitted" });
  }

  if (newFlags.length === 0 && inv.flags === undefined) return inv;

  return makeLinguistInventory({ ...inv, flags: [...(inv.flags ?? []), ...newFlags] });
}

export class CharacterDiscoveryServiceImpl implements CharacterDiscoveryService {
  constructor(
    private readonly loader: CldrLoader,
    private readonly completer: LLMCompleter,
  ) {}

  async harvestFromText(
    sample: string,
    _base: BaseKeyboard
  ): Promise<InventoryChar[]> {
    if (sample.length === 0 || /^[\s\p{Cc}]+$/u.test(sample)) {
      return [];
    }

    const segmenter = new Intl.Segmenter(undefined, { granularity: "grapheme" });
    const segments = segmenter.segment(sample);

    const counts = new Map<string, number>();
    for (const { segment } of segments) {
      if (/^\s$/u.test(segment) || /^\p{Cc}$/u.test(segment)) continue;
      counts.set(segment, (counts.get(segment) ?? 0) + 1);
    }

    const entries = [...counts.entries()].sort(([aChar, aCount], [bChar, bCount]) => {
      if (bCount !== aCount) return bCount - aCount;
      return (aChar.codePointAt(0) ?? 0) - (bChar.codePointAt(0) ?? 0);
    });

    return entries.map(([ch, count]) => {
      // TODO(#141-followup): ASCII proxy — replace with actual base-keyboard output-set lookup when BCP47 is wired onto BaseKeyboard
      const inBaseOutput = (ch.codePointAt(0) ?? 0) <= 0x7e;
      const item: InventoryChar = {
        char: ch,
        count,
        method: "text-sample",
        inBaseOutput,
      };
      return item;
    });
  }

  async pickerCandidates(
    base: BaseKeyboard,
    bcp47?: string
  ): Promise<InventoryChar[]> {
    let candidates: string[] | null = null;

    if (bcp47 !== undefined) {
      const exemplars = await loadExemplars(bcp47, this.loader);
      if (exemplars !== null) {
        candidates = [...exemplars.used].filter((ch) => /\p{L}/u.test(ch));
      }
    }

    if (candidates === null) {
      const block = scriptBlockChars(base.script);
      if (block.length === 0) return [];
      candidates = block;
    }

    const unique = [...new Set(candidates)];
    unique.sort((a, b) => (a.codePointAt(0) ?? 0) - (b.codePointAt(0) ?? 0));

    // no count — no corpus for picker candidates
    return unique.map((ch) => ({
      char: ch,
      method: "picker",
      inBaseOutput: (ch.codePointAt(0) ?? 0) <= 0x7e,
    }));
  }

  async synthesizeInventory(
    languageName: string,
    bcp47: string,
    orthographyUrl?: string,
  ): Promise<LinguistInventory> {
    const prompt = buildLinguistPrompt(languageName, bcp47, orthographyUrl);
    const raw = await this.completer(prompt);
    const inv = parseLinguistJson(raw);
    return cldrCrossCheck(inv, bcp47, this.loader);
  }
}

export function createCharacterDiscoveryService(
  loader: CldrLoader,
  completer: LLMCompleter,
): CharacterDiscoveryService {
  return new CharacterDiscoveryServiceImpl(loader, completer);
}

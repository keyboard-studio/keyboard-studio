// see spec.md section 8 step 4 (Phase B — character discovery via the linguist
// agent) — structured character inventory synthesized from authoritative sources
//
// Background: the most reliable answer to "which characters does this language
// need" comes from an expert synthesis of CLDR exemplarCharacters cross-checked
// against orthography references (language academies, Omniglot, trusted corpora).
// The studio realizes this as an LLM "linguist agent" (the orthography discovery
// method, §8 Phase B). This module types the agent's STRUCTURED OUTPUT — it does
// not implement the agent (that is engine work, overlapping the kbgen seeder).
//
// The agent emits JSON whose keys are snake_case in the prompt template
// (docs/prompts/character-inventory-linguist.md); the engine adapter maps them
// 1:1 to the camelCase fields below:
//
//   language                          -> language
//   script                            -> script
//   alphabet_core                     -> alphabetCore
//   alphabet_auxiliary                -> alphabetAuxiliary
//   mandatory_diacritics_and_ligatures-> mandatoryDiacriticsAndLigatures
//   language_specific_punctuation     -> languageSpecificPunctuation
//   numerals                          -> numerals
//
// Normalization: every character is NFC (precomposed — 'á', not 'a' + combining
// acute), and a diacritic-letter combination that is its own letter or mandatory
// for standard spelling is kept as a single unit. This NFC form is for character
// IDENTIFICATION and display; how the keyboard normalizes its OUTPUT (e.g. the
// NFD reorder auto-emitted for Latin groups in Phase C', §8) is a separate, later
// concern and is not constrained by the inventory's NFC form.
//
// The inventory is ALWAYS presented to the user for confirmation before it drives
// Phase B — never trusted silently (consistent with the §8 discovery principle).

/**
 * A bicameral letter set: matched lowercase / uppercase lists. For unicameral
 * scripts the two lists are equal (or `uppercase` repeats `lowercase`); the
 * agent fills both per the prompt's case-sensitivity rule.
 *
 * @see spec.md §8 step 4
 */
export interface CasedLetters {
  /** Lowercase letters, NFC-normalized. */
  lowercase: string[];
  /** Uppercase letters, NFC-normalized. */
  uppercase: string[];
}

/**
 * The auxiliary alphabet — letters used only in loanwords or historical texts —
 * with an explanatory note. Extends {@link CasedLetters} with the prompt's
 * `note` field.
 *
 * @see spec.md §8 step 4
 */
export interface AuxiliaryLetters extends CasedLetters {
  /** Why these characters are auxiliary (e.g. "loanwords only"). */
  note?: string;
}

/**
 * The kind of divergence found when the deterministic CLDR cross-check compares
 * the agent's inventory against pinned CLDR exemplars (and the orthography
 * references). Surfaced to the user during confirmation so a hallucinated or
 * dropped character is caught before it drives Phase B.
 *
 * @see spec.md §8 step 4
 */
export type InventoryFlagIssue =
  | "not-attested" // agent included a char absent from CLDR exemplars + orthography
  | "cldr-omitted"; // CLDR exemplars attest a char the agent left out

/**
 * One cross-check divergence between the agent's inventory and the deterministic
 * CLDR/orthography reference data.
 *
 * @see spec.md §8 step 4
 */
export interface InventoryFlag {
  /** The character the flag concerns (NFC). */
  char: string;
  /** Why it was flagged. */
  issue: InventoryFlagIssue;
  /** Optional human-readable detail for the confirmation UI. */
  note?: string;
}

/**
 * A source the agent consulted, recorded so the user can vet provenance during
 * confirmation.
 *
 * @see spec.md §8 step 4
 */
export interface InventorySource {
  /** Human-readable title of the source. */
  title: string;
  /** URL of the source, when it has one. */
  url?: string;
  /** Category of source, for grouping in the UI. */
  kind?: "cldr" | "orthography" | "language-academy" | "corpus" | "other";
}

/**
 * Structured, NFC-normalized character inventory for a language, synthesized by
 * the linguist agent (§8 Phase B, the orthography discovery method) from CLDR
 * exemplarCharacters cross-referenced with orthography references.
 *
 * Mirrors the agent's JSON output (snake_case → camelCase; see module header).
 * The optional `flags` carry the deterministic CLDR cross-check result; `sources`
 * record provenance. Confirm with the user, then flatten via
 * {@link linguistInventoryChars} to feed the Phase B inventory.
 *
 * @see spec.md §8 step 4
 * @see docs/prompts/character-inventory-linguist.md (the prompt template)
 */
export interface LinguistInventory {
  /** BCP47 tag / language identifier the inventory is for. */
  language: string;
  /** Script name (e.g. "Latin", "Arabic", "Devanagari"). */
  script: string;
  /** Core alphabet — the everyday orthography. */
  alphabetCore: CasedLetters;
  /** Auxiliary alphabet (loanwords / historical), when the language has one. */
  alphabetAuxiliary?: AuxiliaryLetters;
  /**
   * Diacritic-letter bundles and ligatures that are independent letters or
   * mandatory for standard spelling, kept as single NFC units (e.g. "œ", "æ",
   * "ß").
   */
  mandatoryDiacriticsAndLigatures: string[];
  /** Language-specific punctuation (e.g. "«", "»", "¿", "¡"). */
  languageSpecificPunctuation: string[];
  /** Numerals used by the language. */
  numerals: string[];
  /** Deterministic CLDR cross-check divergences, when any were found. */
  flags?: InventoryFlag[];
  /** Sources the agent consulted, for user vetting. */
  sources?: InventorySource[];
}

/**
 * Input shape for {@link makeLinguistInventory}. Mirrors {@link LinguistInventory}
 * with the genuinely optional fields omittable, matching the `XInit` convention
 * (see {@link BaseKeyboardInit}, {@link KeyboardProvenanceInit}).
 */
export type LinguistInventoryInit = {
  language: string;
  script: string;
  alphabetCore: CasedLetters;
  alphabetAuxiliary?: AuxiliaryLetters;
  mandatoryDiacriticsAndLigatures: string[];
  languageSpecificPunctuation: string[];
  numerals: string[];
  flags?: InventoryFlag[];
  sources?: InventorySource[];
};

/**
 * Drop keys whose value is `undefined` so the result satisfies
 * `exactOptionalPropertyTypes`. Mirrors the helper in provenance.ts.
 */
function stripUndefined<T extends object>(obj: T): T {
  return Object.fromEntries(
    Object.entries(obj).filter(([, v]) => v !== undefined)
  ) as T;
}

/**
 * Construct a {@link LinguistInventory} from a {@link LinguistInventoryInit},
 * stripping undefined-valued optional keys (including the nested
 * `alphabetAuxiliary.note`) so the result is clean under
 * `exactOptionalPropertyTypes`.
 *
 * @see spec.md §8 step 4
 */
export function makeLinguistInventory(
  init: LinguistInventoryInit
): LinguistInventory {
  return stripUndefined({
    language: init.language,
    script: init.script,
    alphabetCore: init.alphabetCore,
    mandatoryDiacriticsAndLigatures: init.mandatoryDiacriticsAndLigatures,
    languageSpecificPunctuation: init.languageSpecificPunctuation,
    numerals: init.numerals,
    ...(init.alphabetAuxiliary !== undefined
      ? { alphabetAuxiliary: stripUndefined(init.alphabetAuxiliary) }
      : {}),
    ...(init.flags !== undefined ? { flags: init.flags } : {}),
    ...(init.sources !== undefined ? { sources: init.sources } : {}),
  });
}

/**
 * Flatten a {@link LinguistInventory} into an ordered, de-duplicated list of
 * characters, ready to seed the Phase B target inventory (where it is diffed
 * against the base output set like any other discovery method's result).
 *
 * Order: core (lowercase then uppercase) → auxiliary (lowercase then uppercase)
 * → mandatory diacritics/ligatures → language-specific punctuation → numerals.
 * Duplicates are removed, keeping the first occurrence, so a character that
 * appears in more than one group lands once in its earliest position.
 *
 * `flags` and `sources` are confirmation aids and do not contribute characters.
 *
 * @param inv - The (typically user-confirmed) synthesized inventory.
 * @returns Ordered, de-duplicated character list.
 * @see spec.md §8 step 4
 */
export function linguistInventoryChars(inv: LinguistInventory): string[] {
  const ordered = [
    ...inv.alphabetCore.lowercase,
    ...inv.alphabetCore.uppercase,
    ...(inv.alphabetAuxiliary?.lowercase ?? []),
    ...(inv.alphabetAuxiliary?.uppercase ?? []),
    ...inv.mandatoryDiacriticsAndLigatures,
    ...inv.languageSpecificPunctuation,
    ...inv.numerals,
  ];
  return [...new Set(ordered)];
}

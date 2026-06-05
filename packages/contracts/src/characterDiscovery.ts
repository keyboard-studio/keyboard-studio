// see spec.md section 8 step 4 (Phase B — character coverage) — character
// discovery: deriving the target-character inventory by several methods
//
// Background: Phase B needs the set of characters the keyboard must produce. The
// user can always type that list by hand, but the studio offers easier on-ramps.
// Crucially, NO single on-ramp can be assumed available — a requester may have
// no machine-readable text — so discovery is a menu of methods, with a visual
// picker as the always-available fallback:
//
//   1. manual       — the user lists characters directly (no service needed).
//   2. text-sample  — paste a corpus; harvest the distinct graphemes used.
//   3. linguist     — the orthography / authoritative-source method, realized as
//                     an LLM linguist agent: given the language name + BCP47, it
//                     synthesizes a structured, NFC-normalized inventory from CLDR
//                     exemplarCharacters cross-referenced with orthography
//                     references, then a deterministic CLDR cross-check flags any
//                     divergences. Returns a {@link LinguistInventory} (not a flat
//                     list) for the rich confirmation UI. Usually the single most
//                     reliable signal for which characters a language needs.
//   4. picker       — browse a script-scoped grid (seeded from CLDR exemplar
//                     characters for the language, falling back to the script's
//                     Unicode block) and click the characters to include. This
//                     is the fallback when the author has neither text nor a
//                     language the agent can resolve.
//
// Every method feeds the SAME confirmed inventory; the strategy selector (§7.2)
// then runs over it exactly as if the user had typed the list by hand. This is a
// sibling to the kbgen placement seeder (utilities/kbgen), which derives a
// starting inventory from Unicode/CLDR — the picker and the linguist agent's
// cross-check reuse the same pinned signal.
//
// Normalization note: the linguist inventory is NFC (for character identification
// and display). How the keyboard normalizes its OUTPUT (e.g. the NFD reorder
// auto-emitted for Latin groups in Phase C', §8) is a separate, later concern.
//
// Out of scope (§16): none of these methods build a wordlist or prediction
// model. Discovery enumerates characters only.

import type { BaseKeyboard } from "./baseKeyboard";
import type { LinguistInventory } from "./linguistInventory";

/**
 * Which Phase B method surfaced a character. Carried on {@link InventoryChar}
 * so the gallery can show provenance ("you picked this" vs. "from the linguist
 * inventory") and so a re-run of one method does not clobber characters added by
 * another. The `linguist` method is the orthography / authoritative-source path
 * (see module header); characters that come from a confirmed
 * {@link LinguistInventory} are tagged with it.
 *
 * @see spec.md §8 step 4
 */
export type DiscoveryMethod = "manual" | "text-sample" | "linguist" | "picker";

/**
 * One distinct character in (or proposed for) the Phase B target inventory.
 *
 * Represented as a single Unicode grapheme cluster (so a base letter plus its
 * combining marks is one entry, matching how a typist thinks of it). Frequency
 * is ADVISORY only — it may hint key placement (a frequent character deserves an
 * easier key) but the studio derives no wordlist or prediction model from it
 * (§16). The user confirms or edits the inventory before it drives Phase B;
 * nothing here is authoritative.
 *
 * @see spec.md §8 step 4
 */
export interface InventoryChar {
  /**
   * The character, as a single Unicode grapheme cluster.
   * @example "é"
   * @example "ng̃"
   */
  char: string;
  /**
   * Occurrences in the source corpus. Present for the frequency-bearing
   * `text-sample` method; omitted for `manual`, `linguist`, and `picker`, where
   * there is no corpus to count. Advisory; never gating.
   */
  count?: number;
  /**
   * True when the chosen base keyboard already produces this character in its
   * default output set — i.e. it is NOT new and need not be added in Phase B.
   * Discovery diffs against the base so the gallery can grey out characters the
   * user already has for free.
   */
  inBaseOutput: boolean;
  /** Which discovery method surfaced this character. */
  method?: DiscoveryMethod;
}

/**
 * Service contract for Phase B character discovery.
 *
 * Results are ADVISORY input to the Phase B inventory — the user confirms which
 * new characters to support and how, and the strategy selector (§7.2) runs over
 * the confirmed set. `harvestFromText` tags its results with the originating
 * {@link DiscoveryMethod} and diffs against `base`; `synthesizeInventory` returns
 * a structured {@link LinguistInventory} for confirmation (flattened separately
 * via `linguistInventoryChars` and then merged into the inventory with
 * `method: "linguist"`).
 *
 * Out of scope (§16): no method builds a wordlist, frequency model, or
 * predictive-text artifact. Discovery enumerates characters only.
 *
 * @see spec.md §8 step 4 (Phase B)
 * @see spec.md §16 (predictive text / wordlists are post-v1)
 */
export interface CharacterDiscoveryService {
  /**
   * Extract the distinct characters from a pasted text `sample`, ranked by
   * descending frequency (ties broken by Unicode code point ascending, for
   * stable output), diffed against `base`. Whitespace and control characters
   * are excluded; grapheme segmentation is applied so combining sequences
   * surface as one {@link InventoryChar}. Results carry `method: "text-sample"`.
   *
   * @param sample - Raw text pasted by the requester. May be empty → `[]`.
   * @param base - The chosen base keyboard (sets `inBaseOutput`).
   * @returns Harvested characters, highest-frequency first.
   * @see spec.md §8 step 4
   */
  harvestFromText(sample: string, base: BaseKeyboard): Promise<InventoryChar[]>;

  /**
   * The orthography / authoritative-source method, realized as the LLM linguist
   * agent. Given the language name + BCP47 tag, synthesize a structured,
   * NFC-normalized {@link LinguistInventory} from CLDR exemplarCharacters
   * cross-referenced with orthography references, then run the deterministic
   * CLDR cross-check that populates `flags` for any divergences
   * (agent-added-but-unattested, or CLDR-attested-but-omitted).
   *
   * This orchestrates what were previously separate steps (web search for
   * orthographies, document parse) internally; they are not public methods. The
   * result is ALWAYS presented to the user for confirmation — never trusted
   * silently. On confirmation, flatten with `linguistInventoryChars` and merge
   * into the Phase B inventory (diffed against the base) as
   * `InventoryChar[]` tagged `method: "linguist"`.
   *
   * @param languageName - The language name from Phase A.
   * @param bcp47 - The BCP47 tag from Phase A (e.g. "tyv", "bm-Latn").
   * @returns The synthesized, cross-checked inventory for user confirmation.
   * @see spec.md §8 step 4
   * @see docs/prompts/character-inventory-linguist.md
   */
  synthesizeInventory(
    languageName: string,
    bcp47: string
  ): Promise<LinguistInventory>;

  /**
   * Return the candidate character set to display in the visual picker — the
   * always-available discovery method for authors with neither text nor
   * orthography. Seeded from CLDR exemplar characters for `bcp47` when known
   * (the authoritative "characters this language uses"), falling back to the
   * Unicode block(s) of `base.script`. Each candidate is diffed against `base`
   * via `inBaseOutput` so the picker can grey out characters already produced.
   * `count` is omitted (no corpus); the user's selections become inventory with
   * `method: "picker"`.
   *
   * @param base - The chosen base keyboard (sets `inBaseOutput`; `base.script`
   *   is the block fallback).
   * @param bcp47 - Optional BCP47 tag to look up CLDR exemplars; when omitted,
   *   the full script block is offered.
   * @returns Candidate characters to display in the picker grid.
   * @see spec.md §8 step 4
   */
  pickerCandidates(
    base: BaseKeyboard,
    bcp47?: string
  ): Promise<InventoryChar[]>;
}

// see spec.md §7.6 "Corpus-derived placement priors" (v1.1.1, 2026-06-11).
//
// The PlacementMap is the seeder's per-keyboard output consumed by the survey
// as §8 Phase B placement proposals.  Each entry carries a RANKED list of
// candidates (not a single answer) — spec §7.6: "a ranked candidate list, not
// a single answer" — so the survey can render the best candidate as an
// editable pre-fill above a confidence threshold and advisory chips below it,
// surface collisions, and attribute each proposal to its source.
//
// Blending priority (§7.6): corpus prior (≥3 independent sources) →
// phonetic anchor → shift-pair consistency → visual/NFD anchor →
// base-key preservation → ergonomics tiebreak.
//
// This type is NOT a Pattern (§5) extension — the v1.1.1 amendment foreclosed
// that path ("No §5 change").  It never round-trips through
// Pattern.kmnFragment.  See D-INT-1 in utilities/kbgen/INTEGRATION.md.


// ---------------------------------------------------------------------------
// Discriminated unions
// ---------------------------------------------------------------------------

/**
 * How a character reaches the output stream in a Keyman keyboard.
 * Mirrors km-keyman's internal enum.
 *
 * - `"direct"` — a plain key rule (output char in the rule RHS).  The v1
 *   seeder emits this for S-01 (substitution) and S-08 (RALT-layer) only.
 * - `"deadkey"` — a deadkey sequence (trigger key + base → character).
 * - `"store-index"` — an `index()` call into a store, used in set-pair rules.
 * - `"opaque"` — any other mechanism the seeder cannot classify (e.g. complex
 *   context rules, `call()` statements).
 *
 * @see spec.md §7.6
 * @see spec.md §7.3 (S-01, S-02, S-08 strategy cards)
 */
export type PlacementMechanism = "direct" | "deadkey" | "store-index" | "opaque";

/**
 * What drove this candidate's proposed placement.
 *
 * - `"corpus"` — empirical prior: ≥3 independent keyboards agreed on this
 *   placement (see `priorCount`).
 * - `"unicode-decomp"` — NFD anchor: the character decomposes to a base +
 *   combining mark that already has a key.
 * - `"confusable"` — visual-confusable anchor from the Unicode confusables
 *   dataset.
 * - `"phonetic"` — phonetic anchor: an IPA / supplement.json hint maps the
 *   character to a familiar Latin key.
 * - `"manual"` — hand-curated entry in `data/supplement.json` (content-team
 *   override; takes precedence over all algorithmic sources).
 *
 * @see spec.md §7.6 ("anchor cascade: NFD → name → confusable → visual → phonetic")
 */
export type PriorSource =
  | "corpus"
  | "unicode-decomp"
  | "confusable"
  | "phonetic"
  | "manual";

// ---------------------------------------------------------------------------
// Core interfaces
// ---------------------------------------------------------------------------

/**
 * One placement candidate for a target character.
 *
 * Reuses {@link KeyChord}'s `vkey` / `modifiers` field names (from
 * `keyboard-ir.ts` line 58–61) so there is no competing key+modifier
 * representation in the codebase.
 *
 * `confidence` is a value in [0, 1] that drives §8 Phase B rendering:
 *   - ≥ threshold → editable pre-fill.
 *   - < threshold → advisory chip beside an empty field.
 * The threshold itself is a UI concern; the type carries the raw score.
 * Corpus-backed candidates derive confidence from `priorCount` and whether
 * the script class / base-layout family match the current keyboard; anchor-
 * backed candidates derive it from the anchor type's empirical reliability.
 *
 * @see spec.md §7.6 (blending / ranking)
 * @see spec.md §8 §1096 (Phase B pre-fill / advisory-chip rendering)
 * @see KeyChord
 */
export interface PlacementCandidate {
  /**
   * Virtual key name (Keyman `K_*` constant, e.g. `"K_E"`).
   * Matches {@link KeyChord.vkey}.
   */
  vkey: string;
  /**
   * Modifier set (e.g. `["SHIFT"]`, `["RALT"]`, or `[]` for unmodified).
   * Matches {@link KeyChord.modifiers}.
   *
   * Valid Keyman modifier tokens: `SHIFT`, `CTRL`, `LCTRL`, `RCTRL`, `ALT`,
   * `LALT`, `RALT`, `CAPS`, `NCAPS`.  Token order is not significant — the
   * {@link collisions} helper sorts tokens before comparing modifier sets, so
   * `["SHIFT", "RALT"]` and `["RALT", "SHIFT"]` are treated as the same slot.
   */
  modifiers: string[];
  /**
   * How the character reaches the output stream in the `.kmn` source.
   *
   * For v1 only `"direct"` is emitted (S-01 / S-08 strategy cards).
   * `"deadkey"`, `"store-index"`, and `"opaque"` candidates carry NO
   * supplementary rule-reconstruction data (no store ref, no deadkey id) —
   * this is a known forward-compatibility seam to be filled when the kbgen TS
   * port or engine wiring needs to promote a non-direct candidate into a
   * Pattern.
   *
   * @see PlacementMechanism
   */
  mechanism: PlacementMechanism;
  /**
   * What drove this placement proposal.
   * Combined with `priorCount` this lets the survey surface a citation
   * ("N existing keyboards for similar languages place this here") or an
   * anchor-type label.
   */
  priorSource: PriorSource;
  /**
   * Number of *independent* keyboards (fork-copy trees collapsed to one vote)
   * that chose this placement.  Always 0 for non-corpus sources (`"unicode-
   * decomp"`, `"confusable"`, `"phonetic"`, `"manual"`).
   *
   * @see spec.md §7.6 ("weight … by the number of independent keyboards")
   */
  priorCount: number;
  /**
   * Confidence score in [0, 1].  Drives Phase B rendering: render as an
   * editable pre-fill above the UI threshold; render as an advisory chip
   * below it.  An explicit number (not a tier enum) so callers can apply
   * their own threshold logic.
   *
   * @see spec.md §8 §1096
   */
  confidence: number;
}

/**
 * All placement candidates for one target character, ranked best-first.
 *
 * **Ordering invariant:** `candidates[0]` is the highest-confidence proposal;
 * candidates are sorted descending by `confidence`, with ties broken by
 * `priorCount` (higher wins), then by `priorSource` priority
 * (`"corpus"` > `"manual"` > `"unicode-decomp"` > `"phonetic"` >
 * `"confusable"`).  Consumers MUST NOT assume any order beyond best-first.
 *
 * @see spec.md §7.6 ("ranked candidate list, not a single answer")
 */
export interface PlacementEntry {
  /**
   * Target codepoint in `"U+XXXX"` notation (uppercase hex, e.g. `"U+00E9"`).
   * Using the `U+` notation (not the raw character) avoids encoding issues in
   * JSON and matches the `placement-priors.json` data file format.
   */
  codepoint: string;
  /**
   * Ranked candidates, best-first (highest confidence first).
   * May be empty if the seeder found no viable placement for this codepoint.
   */
  candidates: PlacementCandidate[];
}

/**
 * Per-keyboard placement map: the seeder's output consumed by §8 Phase B as
 * pre-fill proposals.
 *
 * **Why `bcp47Context` and `baseLayoutFamily` live at the map level, not the
 * entry level:** the seeder runs once per keyboard, so these context fields are
 * uniform across all entries in a single run.  The §7.6 tuple
 * `(codepoint → key, modifier, mechanism, BCP47 context, base-layout family)`
 * describes extraction inputs, not per-entry storage — by the time the map is
 * assembled, both context values are already fixed.  Storing them once at the
 * map level avoids per-entry redundancy and makes the intent clear.
 *
 * @see spec.md §7.6 (corpus-derived placement priors)
 * @see spec.md §8 §1096 (Phase B placement proposals)
 */
export interface PlacementMap {
  /** All placement entries, one per target codepoint. */
  entries: PlacementEntry[];
  /**
   * BCP47 tag of the keyboard session this map was generated for
   * (e.g. `"fr-Latn-CI"`).  Used by Phase B to surface contextually-relevant
   * corpus citations ("communities with a similar existing keyboard chose…").
   * Optional — absent when the seeder ran without a language context.
   */
  bcp47Context?: string;
  /**
   * Base keyboard layout family (e.g. `"QWERTY"`, `"AZERTY"`, `"QWERTZ"`).
   * Priors never cross base families (§7.6): AZERTY conventions must not bleed
   * into QWERTY recommendations.  Stored here so consumers can verify the map
   * was derived for the correct family before applying proposals.
   * Optional — absent when the seeder could not determine the base layout.
   */
  baseLayoutFamily?: string;
  /**
   * Semver-style version tag for the `placement-priors.json` snapshot this map
   * was built from (e.g. `"1.0.0"`).  Lets the survey warn when proposals were
   * generated from a stale prior snapshot.  Optional — absent in maps produced
   * before versioning was introduced.
   */
  pinnedPriorsVersion?: string;
}

// ---------------------------------------------------------------------------
// Factory
// ---------------------------------------------------------------------------

/**
 * Input shape for {@link makePlacementMap}.  Identical to {@link PlacementMap}
 * — every optional field is already optional — but named separately to match
 * the `XInit` factory convention (see `provenance.ts`).
 */
export type PlacementMapInit = PlacementMap;

/**
 * Drop keys whose value is `undefined` so the result satisfies
 * `exactOptionalPropertyTypes` (an explicit `key: undefined` is not assignable
 * to an optional field; an absent key is).
 *
 * Mirrors the same helper in `provenance.ts`.
 */
function stripUndefined<T extends object>(obj: T): T {
  return Object.fromEntries(
    Object.entries(obj).filter(([, v]) => v !== undefined)
  ) as T;
}

/**
 * Construct a {@link PlacementMap} from a {@link PlacementMapInit}, stripping
 * undefined-valued optional keys so the result is clean under
 * `exactOptionalPropertyTypes`.
 *
 * **Normalizes shape only.**  Like `makeKeyboardProvenance`, this factory
 * strips top-level keys whose value is `undefined` and nothing more.  It does
 * NOT validate field ranges or formats.  Validation belongs to the validator
 * layer, not this factory.  The factory trusts the following PRODUCER
 * CONTRACTS to hold at call time:
 *
 * - `confidence` ∈ [0, 1];
 * - `priorCount` ≥ 0 (and is 0 for any non-corpus `priorSource`);
 * - `codepoint` is `"U+XXXX"` uppercase hex;
 * - each entry's `candidates` array is ordered best-first per the §7.6
 *   blending-precedence order (corpus prior when ≥3 independent sources agree
 *   → phonetic anchor → shift-pair consistency → visual/NFD anchor →
 *   base-key preservation → ergonomics tiebreak) — see {@link topCandidate}.
 *
 * The strip is TOP-LEVEL ONLY — nested `entries` and their `candidates` arrays
 * are carried by reference.  This is safe because {@link PlacementCandidate}
 * has no optional fields, so there is no `exactOptionalPropertyTypes` hazard
 * deeper in the tree.
 *
 * @see spec.md §7.6
 */
export function makePlacementMap(init: PlacementMapInit): PlacementMap {
  return stripUndefined({ ...init });
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/**
 * Return the highest-confidence candidate for an entry, or `undefined` when
 * the candidates list is empty.
 *
 * This always returns `candidates[0]`.  By the {@link PlacementEntry} ordering
 * invariant, `candidates[0]` is always best-first; this helper makes that
 * access safe under `noUncheckedIndexedAccess`.
 *
 * **"Best-first" means §7.6 blending-precedence order**, not
 * confidence-descending.  The full precedence chain is:
 * corpus prior (≥3 independent sources agree) → phonetic anchor →
 * shift-pair consistency → visual/NFD anchor → base-key preservation →
 * ergonomics tiebreak.
 *
 * This function deliberately does NOT re-sort by `confidence`.  Ordering is
 * the producer's responsibility — re-sorting here would corrupt the blending
 * precedence that the seeder painstakingly computed.  If you find yourself
 * wanting to sort by confidence, the sort belongs in the producer (seeder),
 * not in this accessor.
 *
 * Useful for §8 Phase B rendering: the top candidate drives the pre-fill;
 * lower candidates appear in a "show alternatives" affordance.
 *
 * @see spec.md §7.6 (§7.6 blending-precedence order)
 * @see spec.md §8 §1096 (Phase B — pre-fill vs. advisory-chip threshold)
 */
export function topCandidate(
  entry: PlacementEntry
): PlacementCandidate | undefined {
  return entry.candidates[0];
}

/**
 * Return all entries whose top candidates share the same `vkey` + `modifiers`
 * combination — i.e. two characters would land on the same key under the
 * current proposals.
 *
 * §8 Phase B surfaces collisions as a single "resolve one" question rather
 * than two silent pre-fills (spec §8 §1096).  Only entries with at least one
 * candidate are considered; entries with no candidates cannot collide.  Only
 * each entry's top candidate (`candidates[0]`, the Phase B pre-fill proposal)
 * is compared; lower-ranked alternatives are not considered.  This matches
 * §8 Phase B's "two characters proposed onto the same key+modifier" pre-fill-
 * collision semantics.
 *
 * The result is a list of collision groups: each group is an array of two or
 * more {@link PlacementEntry} objects that share a top-candidate key slot.
 * Groups are in the order their first member appeared in `map.entries`.
 *
 * @see spec.md §8 §1096 ("Collisions … surfaced as a single resolve-one question")
 */
export function collisions(map: PlacementMap): PlacementEntry[][] {
  // Serialize key+modifiers to a stable string for grouping.
  function slotKey(c: PlacementCandidate): string {
    return `${c.vkey}|${[...c.modifiers].sort().join(",")}`;
  }

  const groups = new Map<string, PlacementEntry[]>();

  for (const entry of map.entries) {
    const top = topCandidate(entry);
    if (top === undefined) continue;
    const key = slotKey(top);
    const existing = groups.get(key);
    if (existing !== undefined) {
      existing.push(entry);
    } else {
      groups.set(key, [entry]);
    }
  }

  // Return only groups with 2+ entries (actual collisions).
  return [...groups.values()].filter((g) => g.length >= 2);
}

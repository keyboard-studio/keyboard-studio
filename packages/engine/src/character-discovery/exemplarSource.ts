/**
 * The SINGLE exemplar-sourcing path (spec 044, FR-015).
 *
 * `characterMap.ts`, `suggestMissing.ts`, and the studio's Phase B prefill all
 * consume this rather than each wiring their own CLDR loader — one candidate
 * ladder, one precedence rule, one confidence gate, one parser.
 *
 * Everything here is pure, synchronous, and offline: the data comes from the
 * committed pinned index (`exemplarIndex.ts`), so a full survey run makes no
 * network request at all (FR-011). Callers that may run before the index chunk
 * resolves await `loadExemplarSource()` once, off the startup critical path.
 */

import {
  augmentSpecialsWithUppercase,
  exemplarLocaleCandidates,
  parseUnicodeSet,
  type ExemplarResult,
} from "./cldr.js";
import {
  loadExemplarIndex,
  lookup,
  type IndexLocaleEntry,
  type IndexTierSets,
} from "./exemplarIndex.js";
import {
  EXEMPLAR_TIER_ORDER,
  toExemplarConfidence,
  type ExemplarConfidence,
  type ExemplarSource,
  type ExemplarTier,
  type SourcedCharacter,
  type SourcedInventory,
} from "./exemplarTypes.js";

export { exemplarLocaleCandidates } from "./cldr.js";
export type {
  ExemplarConfidence,
  ExemplarSource,
  ExemplarTier,
  SourcedCharacter,
  SourcedInventory,
} from "./exemplarTypes.js";

/** Index tier key -> tier name. */
const TIER_FOR_KEY: Record<string, ExemplarTier> = {
  m: "main",
  a: "auxiliary",
  p: "punctuation",
  n: "numbers",
};

const KEY_FOR_TIER: Record<ExemplarTier, keyof IndexTierSets> = {
  main: "m",
  auxiliary: "a",
  punctuation: "p",
  numbers: "n",
};

// ---------------------------------------------------------------------------
// Confidence gate (FR-008, research R7)
// ---------------------------------------------------------------------------

/**
 * Macrolanguage primary subtags too broad to seed from when used bare. A
 * macrolanguage plus a region or script narrower passes.
 *
 * "sw" (Swahili) is deliberately absent, matching `suggestMissing.ts`: its
 * member languages share the same Latin orthography, so the bare tag's
 * exemplars are representative.
 */
const MACROLANGUAGE_SUBTAGS = new Set(["ms", "zh", "ar", "fa"]);

function primarySubtag(bcp47: string): string {
  const idx = bcp47.indexOf("-");
  return (idx === -1 ? bcp47 : bcp47.slice(0, idx)).toLowerCase();
}

/**
 * True when the tag is suppressed for `source` — the caller then falls through
 * to whole-script behaviour instead of seeding a misleading alphabet.
 *
 * Gated for BOTH sources: `und`, script-only tags (`Latn`, `Arab`), and
 * un-narrowed macrolanguages (`ms`, `zh`, `ar`, `fa`).
 *
 * The ISO 639-3 private-use range `qaa`-`qtz` is gated for CLDR but ALLOWED for
 * SLDR (research R7). CLDR has no business carrying a private-use tag, so one
 * appearing there is a data accident; SLDR deliberately uses that range for
 * minority languages awaiting a code, and gating it would discard exactly the
 * coverage this feature exists to deliver.
 */
export function isGatedTag(tag: string, source: ExemplarSource): boolean {
  const trimmed = tag.trim();
  if (trimmed.length === 0) return true;
  const primary = primarySubtag(trimmed);

  if (primary === "und") return true;

  // Script-only tag: a 4-letter initial-uppercase primary subtag. Real BCP47
  // primary language subtags are 2-3 alpha characters.
  if (primary.length === 4 && /^[A-Z][a-z]{3}$/.test(trimmed.slice(0, 4))) return true;

  if (/^q[a-t][a-z]$/.test(primary)) return source === "cldr";

  if (MACROLANGUAGE_SUBTAGS.has(primary) && trimmed.indexOf("-") === -1) return true;

  return false;
}

// ---------------------------------------------------------------------------
// Tier extraction
// ---------------------------------------------------------------------------

/**
 * Parses one source side's tiers into characters + digraphs.
 *
 * Highest-tier deduplication: a character present in several tiers of the SAME
 * winning source is recorded once, at `main` > `auxiliary` > `punctuation` >
 * `numbers`, so the alphabet never double-counts (data-model invariant).
 *
 * Uppercase counterparts are deliberately NOT synthesized — the inventory stays
 * a faithful record of what the source attested; case derivation is the
 * caller's job (047's `caseCounterpart`).
 */
function extractTiers(
  tiers: IndexTierSets,
  source: ExemplarSource,
  confidence: ExemplarConfidence,
): { characters: SourcedCharacter[]; digraphs: string[] } {
  const characters: SourcedCharacter[] = [];
  const digraphs: string[] = [];
  const seen = new Set<string>();
  const seenDigraphs = new Set<string>();

  for (const tier of EXEMPLAR_TIER_ORDER) {
    const raw = tiers[KEY_FOR_TIER[tier]];
    if (typeof raw !== "string" || raw.length === 0) continue;
    const parsed = parseUnicodeSet(raw);
    for (const d of parsed.digraphs) {
      if (seenDigraphs.has(d)) continue;
      seenDigraphs.add(d);
      digraphs.push(d);
    }
    for (const char of parsed.used) {
      if (seen.has(char)) continue;
      seen.add(char);
      characters.push({ char, tier, source, confidence });
    }
  }

  return { characters, digraphs };
}

/**
 * Picks the winning side of an index entry (research R5): CLDR when it covers
 * the tag, otherwise SLDR.
 *
 * Both sides are kept in the index and precedence is applied HERE, at lookup
 * time rather than bake time, so the rule can change (or a future union action
 * can compose them) without regenerating the artifact.
 */
function chooseSide(
  entry: IndexLocaleEntry,
  tag: string,
): { source: ExemplarSource; tiers: IndexTierSets } | null {
  if (entry.c !== undefined && !isGatedTag(tag, "cldr")) {
    return { source: "cldr", tiers: entry.c };
  }
  if (entry.s !== undefined && !isGatedTag(tag, "sldr")) {
    return { source: "sldr", tiers: entry.s };
  }
  return null;
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * Idempotent warm-up: awaits the lazily-imported index chunk so subsequent
 * `sourceExemplars` calls are synchronous. Safe to call repeatedly and from
 * several places concurrently.
 */
export async function loadExemplarSource(): Promise<void> {
  await loadExemplarIndex();
}

/**
 * Resolves the exemplar inventory for a BCP47 tag from the committed offline
 * index.
 *
 * Resolution order (normative — contracts/exemplar-sourcing.md):
 *  1. `exemplarLocaleCandidates(tag)`, most specific first.
 *  2. First candidate present in the index wins; its id becomes `resolvedTag`.
 *  3. Confidence gate, per source.
 *  4. Precedence: the CLDR side if present, else the SLDR side.
 *  5. Tier extraction through the canonical `parseUnicodeSet`, highest tier wins.
 *  6. Every character NFC (`parseUnicodeSet` guarantees it).
 *
 * Returns `null` when neither source covers the tag or the gate fires — callers
 * fall through to whole-script behaviour (FR-010). Never throws for an unknown
 * or malformed tag; the index's contents were parse-validated at bake time.
 *
 * Synchronous and offline. Returns `null` if the index chunk has not loaded
 * yet — await `loadExemplarSource()` first.
 */
export function sourceExemplars(bcp47: string): SourcedInventory | null {
  if (typeof bcp47 !== "string") return null;

  for (const candidate of exemplarLocaleCandidates(bcp47)) {
    const entry = lookup(candidate);
    if (entry === undefined) continue;

    // The FIRST candidate present in the index wins, even if the gate then
    // rejects it — falling through to a less specific candidate after a gate
    // rejection would seed, say, bare "ar" for a tag we just refused.
    const chosen = chooseSide(entry, bcp47);
    if (chosen === null) return null;

    const confidence: ExemplarConfidence =
      chosen.source === "cldr" ? "approved" : toExemplarConfidence(chosen.tiers.d);

    const { characters, digraphs } = extractTiers(chosen.tiers, chosen.source, confidence);
    if (characters.length === 0) return null;

    return {
      resolvedTag: candidate,
      source: chosen.source,
      confidence,
      characters,
      digraphs,
    };
  }

  return null;
}

/**
 * Characters of one tier of a sourced inventory, in the order the source
 * attested them. Convenience for the consumers that only want the core
 * alphabet.
 */
export function charactersInTier(inv: SourcedInventory, tier: ExemplarTier): string[] {
  return inv.characters.filter((c) => c.tier === tier).map((c) => c.char);
}

/** Tier name for an index tier key — exported for the index's own tests. */
export function tierForKey(key: string): ExemplarTier | undefined {
  return TIER_FOR_KEY[key];
}

/**
 * Adapts a `SourcedInventory` to the `ExemplarResult` shape `characterMap.ts`
 * and `suggestMissing.ts` already consume, so those modules gain the offline
 * path without either re-deriving exemplar logic or changing their own shapes
 * (FR-015).
 *
 * The uppercase augmentation of `specials`/`auxiliarySpecials` matches
 * `loadExemplarsFromFull` exactly — CLDR exemplar sets are lowercase-only, and
 * the missing-character suggestion audience needs "É" to count as covered by
 * "é". That derivation belongs to the consumer, which is why it happens here
 * and not inside `sourceExemplars`.
 */
export function inventoryToExemplarResult(inv: SourcedInventory): ExemplarResult {
  const mainChars = inv.characters.filter((c) => c.tier === "main").map((c) => c.char);
  const auxChars = inv.characters.filter((c) => c.tier === "auxiliary").map((c) => c.char);

  const isSpecial = (ch: string): boolean =>
    (ch.codePointAt(0) ?? 0) > 0x7f && /\p{L}/u.test(ch);

  const specials = new Set(mainChars.filter(isSpecial));
  augmentSpecialsWithUppercase(specials);
  const auxSpecials = new Set(auxChars.filter(isSpecial));
  augmentSpecialsWithUppercase(auxSpecials);

  return {
    // No single raw string survives the tier merge; callers use `used`.
    raw: "",
    used: new Set(mainChars),
    digraphs: inv.digraphs,
    specials: [...specials],
    auxiliary: auxChars,
    auxiliarySpecials: [...auxSpecials],
  };
}

/**
 * Every character a language needs, per the sourced inventory — all four
 * tiers, not just the letters. This is the "needed" signal for language-driven
 * surplus detection.
 */
export function neededCharsFromInventory(inv: SourcedInventory): Set<string> {
  return new Set(inv.characters.map((c) => c.char));
}

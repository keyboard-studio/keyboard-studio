// buildCriteriaInventory — the production LinguistInventory builder for
// the criteria assembly (spec 084 Batch 4, Part A).
//
// Matthew's construction (ruling, 2026-10-13): for an Adapt case the
// inventory IS constructible in-studio — the author's confirmed
// inventory (alphabet / marks / punctuation decisions) + the template
// keyboard + the fallback keyboard + the author's additions and
// deletions (the whole adapted keyboard), baselined against the CLDR
// exemplars for EACH of the keyboard's language targets, unioned.
//
// How the inputs map onto that construction:
//   - Confirmed decisions: `session.alphabet` (the three-store
//     confirmed alphabet: bases, marks, attested stacks) and
//     `session.confirmedInventory` (the flat confirmed character list —
//     the same list the studio's own §18.6 coverage gate,
//     useInventoryCoverageGate, treats as "characters this keyboard
//     must produce"). The template/fallback keyboards and the carve
//     adds/deletes reach the inventory THROUGH these records: the
//     alphabet step is seeded from the base and fallback, and what the
//     author keeps, discards, or adds is exactly what the session
//     records. The builder reads the confirmed state, never the raw
//     base IRs — an unconfirmed base character is not a requirement.
//   - Baseline: per-target exemplar sets from the engine's single
//     sourcing path (spec 044: `sourceExemplars` — CLDR where it covers
//     the tag, SLDR otherwise), resolved by the caller and injected as
//     `sourcedByTag` so this module stays pure and synchronous.
//
// Skip rule (the ruling's only skip): if ANY language target has no
// CLDR/SLDR entry (the sourcing path returned null for it), the whole
// build is skipped — §18.6 must not render a verdict on a partial
// baseline. The caller turns the skip into a contextMissing reason
// naming the tag ("no CLDR/SLDR entry for <tag>"). A keyboard with no
// recorded language target at all is likewise skipped: there is no
// baseline to form and guessing one would invent the requirement.
//
// Field assignment: the §18.6 check consumes only
// `linguistInventoryChars(inventory)` (a flat union), but the fields
// are filled honestly — letters to the case-split core/auxiliary
// alphabets, attested base+mark units and lone marks to
// mandatoryDiacriticsAndLigatures, punctuation (plus confirmed symbols
// and non-space separators — the inventory has no other bucket for
// author-confirmed non-letter characters) to
// languageSpecificPunctuation, digits to numerals.
//
// Multi-codepoint entries are never placed in the inventory whole —
// a cluster string can never equal a produced codepoint, so it would
// false-positive every keyboard. They contribute their constituents
// instead (see `contribute`): base+mark exemplar units (schwa + acute)
// require the base and the mark individually, and digraphs
// (`SourcedInventory.digraphs`) are omitted entirely because their
// constituent letters are already required via the alphabet.
//
// Deliberate omissions, each because the check's produced set cannot
// see it and including it would false-positive every keyboard:
//   - Control characters and the plain space: the produced set
//     excludes them by design (buildProducedSet's contract).
//   - Undeclared PUA characters: unclassifiable without the author's
//     declared role; PUA chars WITH a declared role are classified by
//     it (letter -> core, mark -> mandatory marks).

import type {
  ConfirmedAlphabet,
  LinguistInventory,
} from "@keyboard-studio/contracts";
import { makeLinguistInventory } from "@keyboard-studio/contracts";
import { glyphCategory } from "@keyboard-studio/engine";

import type { SourcedInventory } from "../lib/services.ts";

/** The author's confirmed character decisions, as the session records them. */
export interface ConfirmedDecisionInput {
  /** The three-store confirmed alphabet (spec 046), when a phase recorded one. */
  alphabet?: ConfirmedAlphabet;
  /**
   * The flat confirmed character list (session.confirmedInventory):
   * alphabet projection + punctuation + numbers + symbols the author
   * confirmed across phases, carve/assign outcomes included.
   */
  confirmedInventory: readonly string[];
}

export type CriteriaInventoryBuild =
  | { kind: "built"; inventory: LinguistInventory }
  | {
      kind: "skipped";
      /** The first target with no CLDR/SLDR entry; null when there are no targets at all. */
      missingTag: string | null;
    };

export interface BuildCriteriaInventoryInput {
  /** The keyboard's language targets (author's tags first). */
  languageTags: readonly string[];
  /** Script label for the inventory record (e.g. "Latin"). */
  script: string;
  confirmed: ConfirmedDecisionInput;
  /** Per-tag sourcing result; null (or absent) = no CLDR/SLDR entry for that tag. */
  sourcedByTag: ReadonlyMap<string, SourcedInventory | null>;
}

const MARK_RE = /^\p{M}$/u;
const UPPER_RE = /^(?:\p{Lu}|\p{Lt})$/u;

function isSingleCodepoint(s: string): boolean {
  return [...s].length === 1;
}

function isPua(ch: string): boolean {
  const cp = ch.codePointAt(0) ?? 0;
  return (
    (cp >= 0xe000 && cp <= 0xf8ff) ||
    (cp >= 0xf0000 && cp <= 0xffffd) ||
    (cp >= 0x100000 && cp <= 0x10fffd)
  );
}

/** Mutable pools the classifier fills; drained into the LinguistInventory at the end. */
interface Pools {
  coreLower: Set<string>;
  coreUpper: Set<string>;
  auxLower: Set<string>;
  auxUpper: Set<string>;
  marks: Set<string>;
  punctuation: Set<string>;
  numerals: Set<string>;
}

function newPools(): Pools {
  return {
    coreLower: new Set(),
    coreUpper: new Set(),
    auxLower: new Set(),
    auxUpper: new Set(),
    marks: new Set(),
    punctuation: new Set(),
    numerals: new Set(),
  };
}

/**
 * Route one single-codepoint character into its pool.
 * `letterPool` is "core" or "aux": letters land in that alphabet, split
 * by case. Every other category lands in its own bucket regardless of
 * which pool the character came from (an auxiliary-tier mark is still a
 * required mark). Controls and plain space are dropped (see header).
 */
function classify(
  pools: Pools,
  rawChar: string,
  letterPool: "core" | "aux",
  declaredRoles: Readonly<Record<string, "letter" | "mark">>,
): void {
  const ch = rawChar.normalize("NFC");
  if (!isSingleCodepoint(ch)) return;
  if (ch === " ") return;

  if (isPua(ch)) {
    const role = declaredRoles[ch];
    if (role === "mark") pools.marks.add(ch);
    else if (role === "letter") {
      (letterPool === "core" ? pools.coreLower : pools.auxLower).add(ch);
    }
    return; // undeclared PUA: unclassifiable, omitted deliberately
  }

  if (MARK_RE.test(ch)) {
    pools.marks.add(ch);
    return;
  }

  switch (glyphCategory(ch)) {
    case "letter": {
      const lower = letterPool === "core" ? pools.coreLower : pools.auxLower;
      const upper = letterPool === "core" ? pools.coreUpper : pools.auxUpper;
      (UPPER_RE.test(ch) ? upper : lower).add(ch);
      return;
    }
    case "number":
      pools.numerals.add(ch);
      return;
    case "punctuation":
    case "symbol":
    case "separator":
      pools.punctuation.add(ch);
      return;
    case "control":
      return; // excluded from the produced set by design
  }
}

/**
 * Contribute an entry (possibly a multi-codepoint grapheme — attested
 * stacks land in the flat list that way, and CLDR writes units like
 * schwa + combining acute, which has no precomposed form, as single
 * exemplar entries) codepoint by codepoint. Each constituent is a
 * character the keyboard must produce in its own right — a rule
 * emitting base + mark lands both codepoints in the produced set —
 * and single-codepoint matching is all the check can see. A
 * multi-codepoint string placed in the inventory whole could never
 * match a produced codepoint and would false-positive every keyboard.
 */
function contribute(
  pools: Pools,
  entry: string,
  letterPool: "core" | "aux",
  declaredRoles: Readonly<Record<string, "letter" | "mark">>,
): void {
  const nfc = entry.normalize("NFC");
  for (const ch of nfc) classify(pools, ch, letterPool, declaredRoles);
}

export function buildCriteriaInventory(
  input: BuildCriteriaInventoryInput,
): CriteriaInventoryBuild {
  const tags = [...new Set(input.languageTags.map((t) => t.trim()))].filter(
    (t) => t.length > 0,
  );
  if (tags.length === 0) return { kind: "skipped", missingTag: null };

  // The ruling's skip: ANY target without an entry skips the whole
  // check — a verdict on a partial baseline would be a guess.
  for (const tag of tags) {
    if ((input.sourcedByTag.get(tag) ?? null) === null) {
      return { kind: "skipped", missingTag: tag };
    }
  }

  const pools = newPools();
  const { alphabet, confirmedInventory } = input.confirmed;
  const declaredRoles = alphabet?.declaredRoles ?? {};

  // -- The baseline: CLDR/SLDR exemplars per target, unioned. -------
  for (const tag of tags) {
    const sourced = input.sourcedByTag.get(tag);
    if (!sourced) continue; // unreachable: the skip loop above returned
    for (const { char, tier } of sourced.characters) {
      contribute(pools, char, tier === "auxiliary" ? "aux" : "core", declaredRoles);
    }
  }

  // -- The author's confirmed decisions, unioned over the baseline. -
  if (alphabet) {
    for (const base of alphabet.bases) classify(pools, base, "core", declaredRoles);
    for (const mark of alphabet.marks) classify(pools, mark, "core", declaredRoles);
    for (const stack of alphabet.attestedStacks) {
      const composed = (stack.base + stack.marks.join("")).normalize("NFC");
      if (isSingleCodepoint(composed)) {
        // An attested base+mark unit with a precomposed form is a
        // mandatory diacritic-letter unit in its own right.
        pools.marks.add(composed);
      } else {
        contribute(pools, composed, "core", declaredRoles);
      }
    }
  }
  for (const entry of confirmedInventory) {
    contribute(pools, entry, "core", declaredRoles);
  }

  const inventory = makeLinguistInventory({
    language: tags[0] as string,
    script: input.script,
    alphabetCore: {
      lowercase: [...pools.coreLower],
      uppercase: [...pools.coreUpper],
    },
    ...(pools.auxLower.size > 0 || pools.auxUpper.size > 0
      ? {
          alphabetAuxiliary: {
            lowercase: [...pools.auxLower],
            uppercase: [...pools.auxUpper],
          },
        }
      : {}),
    mandatoryDiacriticsAndLigatures: [...pools.marks],
    languageSpecificPunctuation: [...pools.punctuation],
    numerals: [...pools.numerals],
    sources: tags.map((tag) => {
      const sourced = input.sourcedByTag.get(tag);
      return {
        title: `${sourced?.source === "sldr" ? "SLDR" : "CLDR"} exemplars for ${sourced?.resolvedTag ?? tag}`,
        kind: sourced?.source === "sldr" ? ("other" as const) : ("cldr" as const),
      };
    }),
  });

  return { kind: "built", inventory };
}

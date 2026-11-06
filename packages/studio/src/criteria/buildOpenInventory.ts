// buildOpenInventory: the expected-characters inventory for an opened
// keyboard (spec 111 FR-018a, research R10a).
//
// On Open the linguist inventory that criterion 18.6 checks against is the
// union of the standard exemplar characters of every language the keyboard
// lists, where exemplar data exists. It is built through the same
// `buildCriteriaInventory` as the Copy path, so a missing character is an
// ordinary 18.6 finding and goes through the Open ratchet.
//
// Two differences from the Copy build, both deliberate:
//   - a language with no CLDR/SLDR data is left out of the union and counted
//     (never guessed, and never skipping the whole check the way Copy does:
//     on Open the keyboard's own languages are a fact, not an author claim);
//   - only the main ("standard") tier counts. The auxiliary (loanword),
//     punctuation and numbers tiers, and the author's confirmed decisions, are
//     not part of the expectation: an inherited keyboard is judged against the
//     letters its languages need, not typographic punctuation (– … § †) or
//     number-formatting symbols (ᵈ ² ‰, no-break spaces).
//
// When no listed language has data the build is skipped, so 18.6 stays
// "not yet checkable" with the tag named, as on Copy.

import {
  distinctLanguageTags,
  unionExemplars,
  type ExemplarUnion,
} from "../lib/openExpectedInventory.ts";
import type { SourcedInventory } from "../lib/services.ts";
import {
  buildCriteriaInventory,
  type CriteriaInventoryBuild,
} from "./buildCriteriaInventory.ts";

export interface BuildOpenInventoryInput {
  /** The keyboard's language list (the `.kps` languages). */
  languageTags: readonly string[];
  /** Script label for the inventory record. */
  script: string;
  /** Per-tag sourcing result; null (or absent) = no CLDR/SLDR entry. */
  sourcedByTag: ReadonlyMap<string, SourcedInventory | null>;
}

export interface OpenInventoryBuild {
  build: CriteriaInventoryBuild;
  /** How many listed languages had exemplar data (the view states this). */
  coverage: { withData: number; total: number; withoutData: readonly string[] };
  /** Each expected character (single NFC code point) -> the listed languages that require it. */
  sourcesByChar: Record<string, string[]>;
}

export function buildOpenCriteriaInventory(input: BuildOpenInventoryInput): OpenInventoryBuild {
  const tags = distinctLanguageTags(input.languageTags);
  const union: ExemplarUnion = unionExemplars(tags, input.sourcedByTag);
  const coverage = {
    withData: union.withData,
    total: union.total,
    withoutData: union.withoutData,
  };

  const withDataTags = tags.filter((t) => !union.withoutData.includes(t));
  if (withDataTags.length === 0) {
    return { build: { kind: "skipped", missingTag: tags[0] ?? null }, coverage, sourcesByChar: {} };
  }

  const standardOnly = new Map<string, SourcedInventory | null>();
  const sourcesByChar: Record<string, string[]> = {};
  for (const tag of withDataTags) {
    const inv = input.sourcedByTag.get(tag) ?? null;
    const main = inv === null ? [] : inv.characters.filter((c) => c.tier === "main");
    standardOnly.set(tag, inv === null ? null : { ...inv, characters: main });
    // Per code point, as buildCriteriaInventory splits clusters, so a finding's
    // character can be traced back to the languages that expect it.
    for (const { char } of main) {
      for (const ch of char.normalize("NFC")) {
        const list = (sourcesByChar[ch] ??= []);
        if (!list.includes(tag)) list.push(tag);
      }
    }
  }

  const build = buildCriteriaInventory({
    languageTags: withDataTags,
    script: input.script,
    confirmed: { confirmedInventory: [] },
    sourcedByTag: standardOnly,
  });
  return { build, coverage, sourcesByChar };
}

// openExpectedInventory — the expected characters of an opened keyboard
// (spec 111 FR-018a, research R10a).
//
// The expected inventory is the union of the standard exemplar characters of
// every language in the keyboard's list, where exemplar data exists. A tag
// the exemplar source has no data for is counted and reported, never guessed.
// Pure: the per-tag lookups are injected (resolved by the caller through the
// engine's single sourcing path, `sourcedExemplars`), so this module stays
// synchronous and testable against a stubbed index.
//
// "Standard" follows `neededCharsFromInventory` in the engine: the main,
// punctuation and numbers tiers. The auxiliary (loanword) tier is excluded,
// because an inherited keyboard is not expected to type loanword letters.

import type { SourcedInventory } from "./services.ts";
import { sourcedExemplars } from "./services.ts";

export interface ExemplarUnion {
  /** NFC characters, unioned across languages, in first-seen order. */
  chars: readonly string[];
  /** Languages that had exemplar data. */
  withData: number;
  /** Languages in the list (deduped, blanks dropped). */
  total: number;
  /** The listed tags with no exemplar data, in list order. */
  withoutData: readonly string[];
}

/** The tags the union is taken over: trimmed, deduped, blanks dropped. */
export function distinctLanguageTags(tags: readonly string[]): string[] {
  return [...new Set(tags.map((t) => t.trim()).filter((t) => t.length > 0))];
}

/** One language's standard exemplar characters (NFC; auxiliary tier excluded). */
export function standardExemplarChars(inv: SourcedInventory): string[] {
  return inv.characters.filter((c) => c.tier !== "auxiliary").map((c) => c.char.normalize("NFC"));
}

/**
 * Union the exemplar characters of `tags`. `sourced` holds the per-tag lookup
 * result; a missing or null entry means no data for that tag.
 */
export function unionExemplars(
  tags: readonly string[],
  sourced: ReadonlyMap<string, SourcedInventory | null>,
): ExemplarUnion {
  const list = distinctLanguageTags(tags);
  const seen = new Set<string>();
  const withoutData: string[] = [];
  let withData = 0;
  for (const tag of list) {
    const inv = sourced.get(tag) ?? null;
    if (inv === null) {
      withoutData.push(tag);
      continue;
    }
    withData += 1;
    for (const ch of standardExemplarChars(inv)) seen.add(ch);
  }
  return { chars: [...seen], withData, total: list.length, withoutData };
}

/**
 * `sourceExemplars(tag)` over each tag after `loadExemplarSource()`. A lookup
 * that throws counts as no data for that tag.
 */
export async function loadExemplarUnion(
  tags: readonly string[],
  lookup: (tag: string) => Promise<SourcedInventory | null> = sourcedExemplars,
): Promise<{ union: ExemplarUnion; sourcedByTag: Map<string, SourcedInventory | null> }> {
  const list = distinctLanguageTags(tags);
  const sourcedByTag = new Map<string, SourcedInventory | null>();
  await Promise.all(
    list.map(async (tag) => {
      try {
        sourcedByTag.set(tag, await lookup(tag));
      } catch {
        sourcedByTag.set(tag, null);
      }
    }),
  );
  return { union: unionExemplars(list, sourcedByTag), sourcedByTag };
}

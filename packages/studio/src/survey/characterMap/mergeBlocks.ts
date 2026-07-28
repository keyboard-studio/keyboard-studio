// mergeBlocksAcrossTiers — collapse the character map's per-TIER groups into
// one section per Unicode BLOCK.
//
// Why this exists. buildCharacterMap (engine) groups by (tier, script, block)
// and emits whole tiers in dedupe priority: every `main` group, then every
// `auxiliary` group, then `block`, `digits`, `punctuation`. Because the
// exemplar tiers draw their block names from the SAME CHARACTER_MAP_BLOCKS
// table as the enumeration tiers, a block the language actually uses comes out
// TWICE — "Latin Extended-B — main" (the five exemplar characters, all of them
// already selected after the exemplar prefill) near the top, and a second
// "Latin Extended-B" with the rest of the block much further down. The author
// sees their own alphabet quarantined into duplicate stub sections above the
// real map instead of highlighted in place within it.
//
// This is a PRESENTATION fold, deliberately studio-side: the engine's tier
// priority still decides which tier introduces a character (global dedupe), and
// its `tier` field is still what labels a homogeneous section. All this does is
// put the cells back in codepoint order under one heading per block.
//
// Applied in CharacterMapPane's `filteredGroups` right after the spec-047 case
// fold and BEFORE search / "blocks my keyboard uses" filtering, so a merged
// group's `usedByBase` (the OR of its parts) is what that checkbox tests.

import { CHARACTER_MAP_BLOCKS } from "@keyboard-studio/engine";
import type { CharacterMapGroup } from "../../lib/services.ts";

/**
 * Every block name the engine's curated table can produce — i.e. every name
 * that is a REAL Unicode block rather than a generic per-tier fallback
 * ("Digits", "Punctuation", "Other", "Combining marks", "<Script> letters").
 *
 * Merging is keyed on the block name ALONE for these, and on
 * script + block name for everything else. That distinction matters: ASCII
 * digits reach the map tagged with the "Common" sentinel script while the
 * Latin letters beside them are tagged "Latn", yet both are labelled "Basic
 * Latin" and belong in one section. The generic fallbacks are the opposite
 * case — an uncurated script's "Digits" heading means "Tibetan digits" only
 * because of its script tag, so merging those across scripts would pile
 * unrelated scripts under one meaningless heading.
 */
const CURATED_BLOCK_NAMES: ReadonlySet<string> = new Set(
  Object.values(CHARACTER_MAP_BLOCKS).flatMap((defs) => defs.map((d) => d.name)),
);

// Hyphen-joined, matching groupKey()'s convention for the same identity problem
// one file over — the composite half of this key is the same (script, block)
// pair, minus the tier this fold is collapsing.
function mergeKey(group: CharacterMapGroup): string {
  return CURATED_BLOCK_NAMES.has(group.block)
    ? group.block
    : `${group.script}-${group.block}`;
}

function firstCodepoint(group: CharacterMapGroup): number {
  let min = Number.MAX_SAFE_INTEGER;
  for (const cell of group.cells) {
    const cp = cell.char.codePointAt(0) ?? 0;
    if (cp < min) min = cp;
  }
  return min;
}

/**
 * Collapses `groups` so each Unicode block appears exactly once, with its cells
 * in codepoint order, and orders the result block-ascending within each script.
 *
 * - **Cells** are concatenated and sorted by first codepoint. The engine has
 *   already deduplicated globally, so no cell can appear in two contributors.
 * - **`tier`** is kept only when every contributor agreed on it (so a
 *   digits-only or punctuation-only section keeps its "Digits & numerals" /
 *   "Punctuation & symbols" label). A mixed section is tagged `"block"`, whose
 *   label is `null` — a merged "Basic Latin" holding exemplar letters,
 *   loanword letters and digits must not claim to be any one of them.
 * - **`script`** is the first contributor's, which is also what decides script
 *   ordering: the target/base scripts lead, exactly as the engine emitted them.
 * - **`usedByBase`** is the OR of the contributors — a block is "used by your
 *   keyboard" if any part of it is.
 */
export function mergeBlocksAcrossTiers(
  groups: readonly CharacterMapGroup[],
): CharacterMapGroup[] {
  const merged = new Map<string, { group: CharacterMapGroup; tiers: Set<string> }>();
  const scriptOrder: string[] = [];

  for (const g of groups) {
    if (!scriptOrder.includes(g.script)) scriptOrder.push(g.script);
    const key = mergeKey(g);
    const hit = merged.get(key);
    if (hit === undefined) {
      merged.set(key, {
        group: { ...g, cells: [...g.cells] },
        tiers: new Set([g.tier]),
      });
    } else {
      hit.group.cells.push(...g.cells);
      hit.group.usedByBase = hit.group.usedByBase || g.usedByBase;
      hit.tiers.add(g.tier);
    }
  }

  const out = [...merged.values()].map(({ group, tiers }) => ({
    ...group,
    tier: tiers.size === 1 ? group.tier : ("block" as const),
    cells: [...group.cells].sort(
      (a, b) => (a.char.codePointAt(0) ?? 0) - (b.char.codePointAt(0) ?? 0),
    ),
  }));

  // Block-ascending within each script, scripts in the engine's own priority
  // order. Without the re-sort a merged group would sit wherever its FIRST
  // contributor happened to land — i.e. exemplar-bearing blocks would still
  // float to the top, just without the duplicate stub, which is only half the
  // fix.
  return out.sort((a, b) => {
    const sa = scriptOrder.indexOf(a.script);
    const sb = scriptOrder.indexOf(b.script);
    if (sa !== sb) return sa - sb;
    return firstCodepoint(a) - firstCodepoint(b);
  });
}

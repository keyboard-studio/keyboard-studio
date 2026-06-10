// Phase B character discovery — Step 2 implementation
// see packages/contracts/src/characterDiscovery.ts for the service contract

import type {
  CharacterDiscoveryService,
  InventoryChar,
} from "@keyboard-studio/contracts";
import type { BaseKeyboard } from "@keyboard-studio/contracts";
import type { LinguistInventory } from "@keyboard-studio/contracts";
import type { CldrLoader } from "./cldr.js";

export class CharacterDiscoveryServiceImpl implements CharacterDiscoveryService {
  constructor(private readonly loader: CldrLoader) {}

  async harvestFromText(
    sample: string,
    _base: BaseKeyboard
  ): Promise<InventoryChar[]> {
    // 1. Early-out for empty / all-whitespace-or-control input
    if (sample.length === 0 || /^[\s\p{Cc}]+$/u.test(sample)) {
      return [];
    }

    // 2. Segment by grapheme cluster
    const segmenter = new Intl.Segmenter(undefined, { granularity: "grapheme" });
    const segments = segmenter.segment(sample);

    // 3–4. Skip whitespace/control, accumulate frequency counts
    const counts = new Map<string, number>();
    for (const { segment } of segments) {
      if (/^\s$/u.test(segment) || /^\p{Cc}$/u.test(segment)) continue;
      counts.set(segment, (counts.get(segment) ?? 0) + 1);
    }

    // 5. Sort: descending count; ties broken by ascending codepoint of first char
    const entries = [...counts.entries()].sort(([aChar, aCount], [bChar, bCount]) => {
      if (bCount !== aCount) return bCount - aCount;
      return (aChar.codePointAt(0) ?? 0) - (bChar.codePointAt(0) ?? 0);
    });

    // 6. Map to InventoryChar[]
    return entries.map(([ch, count]) => {
      // ASCII proxy — full accuracy needs BCP47 on BaseKeyboard
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

  // Step 3
  pickerCandidates(
    _base: BaseKeyboard,
    _bcp47?: string
  ): Promise<InventoryChar[]> {
    throw new Error("not implemented — see issue #141 step 3 / #142");
  }

  // Step 4 / issue #142
  synthesizeInventory(
    _languageName: string,
    _bcp47: string
  ): Promise<LinguistInventory> {
    throw new Error("not implemented — see issue #141 step 3 / #142");
  }
}

export function createCharacterDiscoveryService(
  loader: CldrLoader
): CharacterDiscoveryService {
  return new CharacterDiscoveryServiceImpl(loader);
}

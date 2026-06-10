import type {
  CharacterDiscoveryService,
  InventoryChar,
  BaseKeyboard,
  LinguistInventory,
} from "@keyboard-studio/contracts";
import type { CldrLoader } from "./cldr.js";
import { loadExemplars, scriptBlockChars } from "./cldr.js";

export class CharacterDiscoveryServiceImpl implements CharacterDiscoveryService {
  constructor(private readonly loader: CldrLoader) {}

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

  async pickerCandidates(
    base: BaseKeyboard,
    bcp47?: string
  ): Promise<InventoryChar[]> {
    let candidates: string[] | null = null;

    // Step 1: try CLDR exemplars when bcp47 is provided
    if (bcp47 !== undefined) {
      const exemplars = await loadExemplars(bcp47, this.loader);
      if (exemplars !== null) {
        candidates = [...exemplars.used].filter((ch) => /\p{L}/u.test(ch));
      }
    }

    // Step 2: fall back to script block chars
    if (candidates === null) {
      const block = scriptBlockChars(base.script);
      if (block.length === 0) return [];
      candidates = block;
    }

    // Step 3: deduplicate
    const unique = [...new Set(candidates)];

    // Step 4: sort ascending by codepoint
    unique.sort((a, b) => (a.codePointAt(0) ?? 0) - (b.codePointAt(0) ?? 0));

    // Step 5: map to InventoryChar (no count — exactOptionalPropertyTypes is on)
    return unique.map((ch) => ({
      char: ch,
      method: "picker" as const,
      inBaseOutput: (ch.codePointAt(0) ?? 0) <= 0x7e,
    }));
  }

  synthesizeInventory(
    _languageName: string,
    _bcp47: string
  ): Promise<LinguistInventory> {
    throw new Error("not implemented");
  }
}

export function createCharacterDiscoveryService(
  loader: CldrLoader
): CharacterDiscoveryService {
  return new CharacterDiscoveryServiceImpl(loader);
}

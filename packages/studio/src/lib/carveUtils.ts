// Utility helpers for the carve gallery — character sampling from IR nodes.
// OutputElement and StoreItem shapes come from packages/contracts/src/keyboard-ir.ts.

import type { IRGroup, IRStore } from '@keyboard-studio/contracts';

/**
 * Collect a sample of unique visible characters from the unowned rules of a
 * group. Rules owned by a recognized Pattern are skipped because the Pattern
 * card already represents them.
 *
 * @param group - The IRGroup to sample.
 * @param maxChars - Maximum number of characters to return (default 6).
 * @returns Array of unique non-whitespace character strings.
 */
export function sampleGroupChars(group: IRGroup, maxChars = 6): string[] {
  const seen = new Set<string>();
  const result: string[] = [];

  for (const rule of group.rules) {
    // Skip rules already claimed by a recognized Pattern card.
    if (rule.ownedByPattern !== undefined) continue;

    for (const el of rule.output) {
      if (el.kind === 'char') {
        const ch = el.value;
        if (ch.trim() !== '' && !seen.has(ch)) {
          seen.add(ch);
          result.push(ch);
          if (result.length >= maxChars) return result;
        }
      }
      // outs / index elements reference store content; skip here to avoid
      // recursive store lookups which would require passing the full IR.
    }
  }

  return result;
}

/**
 * Produce a short character display string from a store's items.
 * Only char-kind items are included; vkey/deadkey/raw entries are opaque.
 *
 * @param store - The IRStore to sample.
 * @returns Space-joined character string, truncated to 60 characters.
 */
export function storeCharSample(store: IRStore): string {
  const chars: string[] = [];

  for (const item of store.items) {
    if (item.kind === 'char') {
      const ch = item.value;
      if (ch.trim() !== '') {
        chars.push(ch);
      }
    }
  }

  return chars.join(' ').slice(0, 60);
}

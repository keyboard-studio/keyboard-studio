// carveCascadePreview — which paired characters go with a carve the author is
// about to make.
//
// Carving one slot of a positionally paired store set (e.g. Cameroon QWERTY's
// `composed` / `comp-dia`) also drops that index from every partner store, so
// the stores stay aligned. The engine reports those partners
// (applyStoreSlotRemovals().cascaded); this module asks the SAME engine
// function the carve pipeline uses, so the preview can never name a partner
// the carve would not actually remove.

import { applyStoreSlotRemovals } from '@keyboard-studio/engine';
import type { KeyboardIR } from '@keyboard-studio/contracts';
import type { CharacterCell } from './irToCharacterView.ts';

/**
 * The distinct characters (NFC, in store order) that discarding `cell` would
 * also remove because they are paired with one of its store slots. Empty when
 * the cell is not in a paired store set, or every partner is itself one of
 * the cell's own slots.
 */
export function pairedCascadeChars(ir: KeyboardIR, cell: CharacterCell): string[] {
  const slotIds = cell.contributors.storeSlotIds;
  if (slotIds.length === 0) return [];
  const { cascaded } = applyStoreSlotRemovals(ir, new Set(slotIds), { carveNotAnyHygiene: true });
  const own = cell.ch.normalize('NFC');
  const seen = new Set<string>();
  const out: string[] = [];
  for (const c of cascaded) {
    const ch = c.partner.char.normalize('NFC');
    if (ch === own || seen.has(ch)) continue;
    seen.add(ch);
    out.push(ch);
  }
  return out;
}

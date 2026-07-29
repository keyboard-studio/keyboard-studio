// Tests for collectCompositionMethod (spec follow-up: "Existing methods"
// SHOW-ALL floor — a green-badged composable char must still show a row).

import { describe, it, expect } from 'vitest';
import { collectCompositionMethod } from './collectCompositionMethod.js';

describe('collectCompositionMethod', () => {
  it('Û with base U + combining circumflex both produced -> composition descriptor', () => {
    const baseProduced = new Set(['U', '̂']); // U + COMBINING CIRCUMFLEX ACCENT
    const result = collectCompositionMethod(baseProduced, 'Û');

    expect(result).toEqual({
      kind: 'composition',
      producedChar: 'Û',
      producedRole: 'produced',
      components: ['U', '̂'],
    });
  });

  it('Û already directly in the base produced set -> undefined (real methods cover it)', () => {
    const baseProduced = new Set(['Û', 'U', '̂']);
    expect(collectCompositionMethod(baseProduced, 'Û')).toBeUndefined();
  });

  it('Ệ needs all 3 components (E + circumflex + dot-below) -> composition descriptor', () => {
    const baseProduced = new Set(['E', '̂', '̣']);
    const result = collectCompositionMethod(baseProduced, 'Ệ');

    // NFD canonical ordering sorts combining marks by combining class, which
    // places the dot-below (ccc 220) before the circumflex (ccc 230).
    expect(result).toEqual({
      kind: 'composition',
      producedChar: 'Ệ',
      producedRole: 'produced',
      components: ['E', '̣', '̂'],
    });
  });

  it('missing a mark -> undefined', () => {
    const baseProduced = new Set(['E', '̂']); // dot-below (U+0323) absent
    expect(collectCompositionMethod(baseProduced, 'Ệ')).toBeUndefined();
  });

  it('NFD-stable char -> undefined (nothing to compose)', () => {
    const baseProduced = new Set<string>();
    expect(collectCompositionMethod(baseProduced, 'a')).toBeUndefined();
  });

  it('passing an already-AUGMENTED set would wrongly compose two levels deep — this function relies on the caller passing the BASE set', () => {
    // Documents the "ONE LEVEL only" contract at the call-site boundary:
    // if the caller mistakenly passes an augmented set that already contains
    // a composed char, that char would be treated as "directly produced" and
    // never re-synthesized here — which is exactly why callers MUST pass the
    // pre-augmentation base set (see this module's doc comment).
    const augmented = new Set(['U', '̂', 'Û']); // Û already folded in
    expect(collectCompositionMethod(augmented, 'Û')).toBeUndefined();
  });
});

// Unit tests for the KbgenOutputMap → PlacementMap adapter.
// Run: npx vitest run --config utilities/kbgen/vitest.config.ts

import { describe, it, expect } from 'vitest';
import { toPlacementMap } from '../toPlacementMap.ts';
import type { KbgenOutputMap } from '../map.ts';

// ---------------------------------------------------------------------------
// Shared fixture helpers
// ---------------------------------------------------------------------------

/** Minimal KbgenOutputMap skeleton — fields not needed by the adapter are stubs. */
function makeMap(physical: KbgenOutputMap['physical'], opts: {
  baseId?: string;
  locale?: string | null;
} = {}): KbgenOutputMap {
  return {
    keyboard: { id: 'test-kb', name: 'Test Keyboard' },
    base: { id: opts.baseId ?? 'us', name: 'US QWERTY' },
    source: {
      locale: opts.locale !== undefined ? opts.locale : 'ha-Latn-NG',
      unicodeVersion: null,
      cldrVersion: null,
    },
    freeKeys: [],
    summary: { specials: physical.length, physicalEntries: physical.length, touchEntries: 0, unplaced: 0 },
    physical,
    touch: [],
    completeness: { complete: true, missingBase: [], missingSpecial: [] },
    unplaced: [],
    warnings: [],
  };
}

// ---------------------------------------------------------------------------
// Direct (S-01 shape) placement
// ---------------------------------------------------------------------------

describe('toPlacementMap — direct placement (S-01)', () => {
  it('produces a PlacementEntry with mechanism "direct" and empty modifiers', () => {
    const map = makeMap([{
      char: 'ɓ', codepoint: 'U+0253', key: 'K_B', shift: false,
      method: 'direct', modifiers: [], output: 'ɓ',
      displaces: 'b',
      anchor: { via: 'NAME', weight: 90, baseChar: 'b' },
    }]);
    const result = toPlacementMap(map);
    expect(result.entries).toHaveLength(1);
    const entry = result.entries[0];
    if (!entry) throw new Error('expected one entry');
    expect(entry.codepoint).toBe('U+0253');
    const top = entry.candidates[0];
    if (!top) throw new Error('expected one candidate');
    expect(top.mechanism).toBe('direct');
    expect(top.modifiers).toEqual([]);
    expect(top.vkey).toBe('K_B');
  });

  it('confidence is weight / 100 (NAME weight=90 → 0.9)', () => {
    const map = makeMap([{
      char: 'ɓ', codepoint: 'U+0253', key: 'K_B', shift: false,
      method: 'direct', modifiers: [], output: 'ɓ',
      displaces: 'b',
      anchor: { via: 'NAME', weight: 90, baseChar: 'b' },
    }]);
    const top = toPlacementMap(map).entries[0]?.candidates[0];
    if (!top) throw new Error('expected candidate');
    expect(top.confidence).toBeCloseTo(0.9);
  });
});

// ---------------------------------------------------------------------------
// Modifier / RALT (S-08 shape) placement
// ---------------------------------------------------------------------------

describe('toPlacementMap — modifier (RALT) placement (S-08)', () => {
  it('produces modifiers: ["RALT"] for method "modifier"', () => {
    const map = makeMap([{
      char: 'ɓ', codepoint: 'U+0253', key: 'K_B', shift: false,
      method: 'modifier', modifiers: ['RALT'], output: 'ɓ',
      displaces: null,
      anchor: { via: 'NAME', weight: 90, baseChar: 'b' },
    }]);
    const top = toPlacementMap(map).entries[0]?.candidates[0];
    if (!top) throw new Error('expected candidate');
    expect(top.modifiers).toEqual(['RALT']);
    expect(top.mechanism).toBe('direct');
  });
});

// ---------------------------------------------------------------------------
// via → priorSource mapping
// ---------------------------------------------------------------------------

describe('toPlacementMap — via → priorSource', () => {
  const cases: Array<[string, string]> = [
    ['DECOMPOSITION', 'unicode-decomp'],
    ['NAME', 'unicode-decomp'],
    ['CONFUSABLE', 'confusable'],
    ['VISUAL', 'confusable'],
    ['PHONETIC', 'phonetic'],
  ];

  for (const [via, expected] of cases) {
    it(`via "${via}" → priorSource "${expected}"`, () => {
      const map = makeMap([{
        char: 'x', codepoint: 'U+0078', key: 'K_X', shift: false,
        method: 'direct', modifiers: [], output: 'x',
        displaces: null,
        anchor: { via, weight: 70, baseChar: 'x' },
      }]);
      const top = toPlacementMap(map).entries[0]?.candidates[0];
      if (!top) throw new Error('expected candidate');
      expect(top.priorSource).toBe(expected);
    });
  }
});

// ---------------------------------------------------------------------------
// Weight normalization
// ---------------------------------------------------------------------------

describe('toPlacementMap — weight normalization', () => {
  it('weight 0 → confidence 0', () => {
    const map = makeMap([{
      char: 'ɓ', codepoint: 'U+0253', key: 'K_B', shift: false,
      method: 'direct', modifiers: [], output: 'ɓ',
      displaces: 'b',
      anchor: { via: 'NAME', weight: 0, baseChar: 'b' },
    }]);
    const top = toPlacementMap(map).entries[0]?.candidates[0];
    if (!top) throw new Error('expected candidate');
    expect(top.confidence).toBe(0);
  });

  it('weight at MAX (100) → confidence 1', () => {
    const map = makeMap([{
      char: 'ɓ', codepoint: 'U+0253', key: 'K_B', shift: false,
      method: 'direct', modifiers: [], output: 'ɓ',
      displaces: 'b',
      anchor: { via: 'NAME', weight: 100, baseChar: 'b' },
    }]);
    const top = toPlacementMap(map).entries[0]?.candidates[0];
    if (!top) throw new Error('expected candidate');
    expect(top.confidence).toBe(1);
  });

  it('weight > 100 → confidence clamped to 1', () => {
    const map = makeMap([{
      char: 'ɓ', codepoint: 'U+0253', key: 'K_B', shift: false,
      method: 'direct', modifiers: [], output: 'ɓ',
      displaces: 'b',
      anchor: { via: 'NAME', weight: 150, baseChar: 'b' },
    }]);
    const top = toPlacementMap(map).entries[0]?.candidates[0];
    if (!top) throw new Error('expected candidate');
    expect(top.confidence).toBe(1);
  });

  it('weight NaN → confidence 0 and entry does not throw', () => {
    const map = makeMap([{
      char: 'ɓ', codepoint: 'U+0253', key: 'K_B', shift: false,
      method: 'direct', modifiers: [], output: 'ɓ',
      displaces: 'b',
      anchor: { via: 'NAME', weight: NaN, baseChar: 'b' },
    }]);
    let top: ReturnType<typeof toPlacementMap>['entries'][0]['candidates'][0] | undefined;
    expect(() => {
      top = toPlacementMap(map).entries[0]?.candidates[0];
    }).not.toThrow();
    if (!top) throw new Error('expected candidate');
    expect(top.confidence).toBe(0);
  });

  it('DECOMPOSITION weight=100 → confidence=1.0', () => {
    const map = makeMap([{
      char: 'é', codepoint: 'U+00E9', key: 'K_E', shift: false,
      method: 'direct', modifiers: [], output: 'é',
      displaces: 'e',
      anchor: { via: 'DECOMPOSITION', weight: 100, baseChar: 'e' },
    }]);
    const top = toPlacementMap(map).entries[0]?.candidates[0];
    if (!top) throw new Error('expected candidate');
    expect(top.confidence).toBe(1.0);
  });

  it('PHONETIC weight=40 → confidence=0.4', () => {
    const map = makeMap([{
      char: 'ŋ', codepoint: 'U+014B', key: 'K_N', shift: false,
      method: 'direct', modifiers: [], output: 'ŋ',
      displaces: 'n',
      anchor: { via: 'PHONETIC', weight: 40, baseChar: 'n' },
    }]);
    const top = toPlacementMap(map).entries[0]?.candidates[0];
    if (!top) throw new Error('expected candidate');
    expect(top.confidence).toBeCloseTo(0.4);
  });

  it('priorCount is always 0 (no corpus in v1)', () => {
    const map = makeMap([{
      char: 'é', codepoint: 'U+00E9', key: 'K_E', shift: false,
      method: 'direct', modifiers: [], output: 'é',
      displaces: 'e',
      anchor: { via: 'DECOMPOSITION', weight: 100, baseChar: 'e' },
    }]);
    const top = toPlacementMap(map).entries[0]?.candidates[0];
    if (!top) throw new Error('expected candidate');
    expect(top.priorCount).toBe(0);
  });
});

// ---------------------------------------------------------------------------
// 'restore' exclusion
// ---------------------------------------------------------------------------

describe('toPlacementMap — restore exclusion', () => {
  it('excludes "restore" entries from the PlacementMap', () => {
    const map = makeMap([
      {
        // A real direct placement → should appear in output
        char: 'ɓ', codepoint: 'U+0253', key: 'K_B', shift: false,
        method: 'direct', modifiers: [], output: 'ɓ',
        displaces: 'b',
        anchor: { via: 'NAME', weight: 90, baseChar: 'b' },
      },
      {
        // A restore entry (displaced base letter) → must NOT appear in output
        char: 'b', codepoint: 'U+0062', key: 'K_B', shift: false,
        method: 'restore', modifiers: ['RALT'], output: 'b',
        restoreOf: 'ɓ',
      },
    ]);
    const result = toPlacementMap(map);
    expect(result.entries).toHaveLength(1);
    expect(result.entries[0]?.codepoint).toBe('U+0253');
  });

  it('produces an empty entries array when all physical entries are restores', () => {
    const map = makeMap([{
      char: 'b', codepoint: 'U+0062', key: 'K_B', shift: false,
      method: 'restore', modifiers: ['RALT'], output: 'b',
      restoreOf: 'ɓ',
    }]);
    expect(toPlacementMap(map).entries).toHaveLength(0);
  });
});

// ---------------------------------------------------------------------------
// Map-level context fields
// ---------------------------------------------------------------------------

describe('toPlacementMap — map-level fields', () => {
  it('bcp47Context comes from source.locale', () => {
    const map = makeMap([], { locale: 'ha-Latn-NG' });
    expect(toPlacementMap(map).bcp47Context).toBe('ha-Latn-NG');
  });

  it('bcp47Context is absent when source.locale is null', () => {
    const map = makeMap([], { locale: null });
    const result = toPlacementMap(map);
    expect('bcp47Context' in result).toBe(false);
  });

  it('baseLayoutFamily is "QWERTY" for base.id "us"', () => {
    const map = makeMap([], { baseId: 'us' });
    expect(toPlacementMap(map).baseLayoutFamily).toBe('QWERTY');
  });

  it('baseLayoutFamily passes through unknown base ids verbatim', () => {
    const map = makeMap([], { baseId: 'custom-layout' });
    expect(toPlacementMap(map).baseLayoutFamily).toBe('custom-layout');
  });

  it('pinnedPriorsVersion is "kbgen-v1"', () => {
    const map = makeMap([]);
    expect(toPlacementMap(map).pinnedPriorsVersion).toBe('kbgen-v1');
  });
});

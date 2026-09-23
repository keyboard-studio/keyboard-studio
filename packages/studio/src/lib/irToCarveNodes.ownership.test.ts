// Tests for glyph ownership: #917 GlyphOwner store/pattern tags and the #886 ownedNodeIds-only exclusion (groupToGlyphs, patternToGlyphs, toRailNodes, collectOwnedNodeIds) in irToCarveNodes.ts.
//
// Shared IR builders: ./__fixtures__/irToCarveNodes.ts.

import { describe, it, expect } from 'vitest';
import type { IRRule, Pattern } from '@keyboard-studio/contracts';
import { groupToGlyphs, toRailNodes, collectOwnedNodeIds, patternToGlyphs } from './irToCarveNodes.ts';
import { makeVkeyRule, makeGroup, makeStore, makeIR } from './__fixtures__/irToCarveNodes.ts';

// ---------------------------------------------------------------------------
// #917 — GlyphOwner store/pattern tags on CarveGlyph.owners.
// ruleStoreOwners() is private; exercised only through groupToGlyphs /
// patternToGlyphs / expandParallelStoreRule (via isParallelIndexFanOut).
// ---------------------------------------------------------------------------

describe('#917 — GlyphOwner store tags via ruleStoreOwners (through groupToGlyphs)', () => {
  it('A1: a rule whose context has any(store) gets a store owner from the input side', () => {
    const store = makeStore('vowels', 'store#vowels');
    const rule: IRRule = {
      nodeId: 'n-any-store',
      context: [{ kind: 'any', storeRef: 'vowels' }, { kind: 'vkey', name: 'K_A', modifiers: [] }],
      output: [{ kind: 'char', value: 'á' }],
    };
    const ir = makeIR({ groups: [makeGroup([rule])], stores: [store] });
    const glyphs = groupToGlyphs(makeGroup([rule]), ir, new Map(), new Set());
    expect(glyphs).toHaveLength(1);
    expect(glyphs[0]!.owners).toEqual([{ kind: 'store', nodeId: 'store#vowels', label: 'vowels' }]);
  });

  it('A2: a rule whose output is index(store) gets a store owner from the output side', () => {
    const store = makeStore('comp-dia', 'store#comp-dia');
    const rule: IRRule = {
      nodeId: 'n-index-out',
      context: [{ kind: 'vkey', name: 'K_A', modifiers: [] }],
      output: [{ kind: 'char', value: 'x' }, { kind: 'index', storeRef: 'comp-dia', offset: 1 }],
    };
    // outputToChar reads output[0] which is 'char' here so the glyph is displayable.
    const ir = makeIR({ groups: [makeGroup([rule])], stores: [store] });
    const glyphs = groupToGlyphs(makeGroup([rule]), ir, new Map(), new Set());
    expect(glyphs).toHaveLength(1);
    expect(glyphs[0]!.owners).toEqual([{ kind: 'store', nodeId: 'store#comp-dia', label: 'comp-dia' }]);
  });

  it('A2b: a rule whose output is outs(store) gets a store owner from the output side', () => {
    const store = makeStore('suffix', 'store#suffix');
    const rule: IRRule = {
      nodeId: 'n-outs',
      context: [{ kind: 'vkey', name: 'K_B', modifiers: [] }],
      output: [{ kind: 'char', value: 'b' }, { kind: 'outs', storeRef: 'suffix' }],
    };
    const ir = makeIR({ groups: [makeGroup([rule])], stores: [store] });
    const glyphs = groupToGlyphs(makeGroup([rule]), ir, new Map(), new Set());
    expect(glyphs).toHaveLength(1);
    expect(glyphs[0]!.owners).toEqual([{ kind: 'store', nodeId: 'store#suffix', label: 'suffix' }]);
  });

  it('A3: a plain vkey/char -> char rule with no store reference has owners undefined (not [])', () => {
    const glyphs = groupToGlyphs(makeGroup([makeVkeyRule([], 'n-plain')]));
    expect(glyphs).toHaveLength(1);
    expect(glyphs[0]!.owners).toBeUndefined();
  });

  it('A4: a system store referenced by a rule is excluded from owners', () => {
    const systemStore = makeStore('&SOME_SYSTEM_STORE', 'store#system', { isSystem: true });
    const rule: IRRule = {
      nodeId: 'n-system-ref',
      context: [{ kind: 'any', storeRef: '&SOME_SYSTEM_STORE' }, { kind: 'vkey', name: 'K_A', modifiers: [] }],
      output: [{ kind: 'char', value: 'a' }],
    };
    const ir = makeIR({ groups: [makeGroup([rule])], stores: [systemStore] });
    const glyphs = groupToGlyphs(makeGroup([rule]), ir, new Map(), new Set());
    expect(glyphs).toHaveLength(1);
    expect(glyphs[0]!.owners).toBeUndefined();
  });

  it('A5: duplicate references to the same store within one rule produce a single deduped owner', () => {
    const store = makeStore('vowels', 'store#vowels');
    // Context refs the store via any() (paired with a vkey so contextToKeys
    // yields a non-empty key list and the standard — non-fan-out — glyph
    // path is taken) AND the output refs it via index() — both resolve to
    // the same store.nodeId, so it must appear only once.
    const rule: IRRule = {
      nodeId: 'n-dup-ref',
      context: [{ kind: 'any', storeRef: 'vowels' }, { kind: 'vkey', name: 'K_A', modifiers: [] }],
      output: [{ kind: 'char', value: 'x' }, { kind: 'index', storeRef: 'vowels', offset: 1 }],
    };
    const ir = makeIR({ groups: [makeGroup([rule])], stores: [store] });
    const glyphs = groupToGlyphs(makeGroup([rule]), ir, new Map(), new Set());
    expect(glyphs).toHaveLength(1);
    expect(glyphs[0]!.owners).toEqual([{ kind: 'store', nodeId: 'store#vowels', label: 'vowels' }]);
  });
});

describe('#917 — patternToGlyphs prepends a pattern owner', () => {
  it('A6: each glyph owners[0] is the pattern owner; a store ref on the rule follows it', () => {
    const store = makeStore('vowels', 'store#vowels');
    const rule: IRRule = {
      nodeId: 'rule#owned-with-store',
      context: [{ kind: 'any', storeRef: 'vowels' }, { kind: 'vkey', name: 'K_A', modifiers: [] }],
      output: [{ kind: 'char', value: 'á' }],
    };
    const group = makeGroup([rule]);
    const pattern: Pattern = {
      id: 'pattern-diacritics',
      title: 'Diacritics',
      description: '',
      category: 'desktop',
      appliesTo: [],
      origin: 'recognized',
      ownedNodes: [{ kind: 'rule', nodeId: 'rule#owned-with-store' }],
      questions: [],
      kmnFragment: '',
      tests: [],
      validatedForFamilies: [],
      sourceKeyboards: [],
      reviewedBy: 'recognizer',
      reviewDate: '2026-01-01',
    } as Pattern;
    const ir = makeIR({ groups: [group], stores: [store] });
    ir.recognizedPatterns = [pattern];

    const glyphs = patternToGlyphs(pattern, ir);
    expect(glyphs).toHaveLength(1);
    expect(glyphs[0]!.owners).toEqual([
      { kind: 'pattern', nodeId: 'pattern-diacritics', label: 'Diacritics' },
      { kind: 'store', nodeId: 'store#vowels', label: 'vowels' },
    ]);
  });

  it('a rule with no store reference still gets the pattern owner alone (owners[0], length 1)', () => {
    const rule: IRRule = {
      nodeId: 'rule#owned-no-store',
      context: [{ kind: 'vkey', name: 'K_B', modifiers: [] }],
      output: [{ kind: 'char', value: 'b' }],
    };
    const group = makeGroup([rule]);
    const pattern: Pattern = {
      id: 'pattern-simple',
      title: 'Simple Swap',
      description: '',
      category: 'desktop',
      appliesTo: [],
      origin: 'recognized',
      ownedNodes: [{ kind: 'rule', nodeId: 'rule#owned-no-store' }],
      questions: [],
      kmnFragment: '',
      tests: [],
      validatedForFamilies: [],
      sourceKeyboards: [],
      reviewedBy: 'recognizer',
      reviewDate: '2026-01-01',
    } as Pattern;
    const ir = makeIR({ groups: [group] });
    ir.recognizedPatterns = [pattern];

    const glyphs = patternToGlyphs(pattern, ir);
    expect(glyphs).toHaveLength(1);
    expect(glyphs[0]!.owners).toEqual([
      { kind: 'pattern', nodeId: 'pattern-simple', label: 'Simple Swap' },
    ]);
  });
});

describe('#917 — expandParallelStoreRule attaches store owners to slot glyphs', () => {
  it('A7: a slot glyph from the deadkey-body fan-out shape carries the output store as a store owner', () => {
    // isParallelIndexFanOut shape: [dk(D), any(BASE)] > index(OUT, 2).
    const outputStore = makeStore('comp_dia', 'store#comp_dia', {
      items: [{ kind: 'char', value: 'à' }, { kind: 'char', value: 'á' }],
    });
    const baseStore = makeStore('base_vowels', 'store#base_vowels', {
      items: [{ kind: 'char', value: 'a' }, { kind: 'char', value: 'a' }],
    });
    const rule: IRRule = {
      nodeId: 'rule#fanout',
      context: [{ kind: 'deadkey', id: 1 }, { kind: 'any', storeRef: 'base_vowels' }],
      output: [{ kind: 'index', storeRef: 'comp_dia', offset: 2 }],
    };
    const ir = makeIR({ groups: [makeGroup([rule])], stores: [outputStore, baseStore] });

    const glyphs = groupToGlyphs(makeGroup([rule]), ir, new Map(), new Set());
    expect(glyphs.length).toBeGreaterThan(0);
    for (const g of glyphs) {
      expect(g.owners).toEqual([
        { kind: 'store', nodeId: 'store#comp_dia', label: 'comp_dia' },
        { kind: 'store', nodeId: 'store#base_vowels', label: 'base_vowels' },
      ]);
    }
  });
});

// ---------------------------------------------------------------------------
// #886 ghost-chip regression — ownedNodes-only exclusion (no ownedByPattern
// stamp at all) via collectOwnedNodeIds, plus companion patternToGlyphs
// single-render assertions and toRailNodes group-suppression.
// ---------------------------------------------------------------------------

/** Minimal recognized Pattern fixture — only the fields these tests read. */
function makePatternFixture(id: string, ownedNodeIds: string[]): Pattern {
  return {
    id,
    title: 'Test pattern',
    description: '',
    category: 'desktop',
    appliesTo: [],
    origin: 'recognized',
    ownedNodes: ownedNodeIds.map((nodeId) => ({ kind: 'rule', nodeId })),
    questions: [],
    kmnFragment: '',
    tests: [],
    validatedForFamilies: [],
    sourceKeyboards: [],
    reviewedBy: 'recognizer',
    reviewDate: '2026-01-01',
  } as Pattern;
}

describe('groupToGlyphs — ownedNodeIds-only exclusion (#886 ghost chip)', () => {
  it('returns [] for a rule claimed via ownedNodes alone (ownedByPattern unset) when ownedNodeIds is passed', () => {
    // The exact drift shape #886 fixed: the rule's own ownedByPattern stamp
    // never got set (e.g. a recognizer bug, or a pre-fix double-claim leaving
    // one signal stale), but the pattern's ownedNodes DOES list this rule.
    // Before the fix, groupToGlyphs only checked rule.ownedByPattern and
    // would render this rule a SECOND time in the group's glyph list even
    // though a pattern already claims it.
    const ghostOwnedRule: IRRule = {
      nodeId: 'rule#ghost-owned',
      context: [{ kind: 'vkey', name: 'K_Q', modifiers: [] }],
      output: [{ kind: 'char', value: 'ɛ' }],
      // ownedByPattern deliberately left undefined.
    };
    const group = makeGroup([ghostOwnedRule]);
    const pattern = makePatternFixture('pattern-1', ['rule#ghost-owned']);
    const ir = makeIR({ groups: [group], recognizedPatterns: [pattern] });

    const ownedNodeIds = collectOwnedNodeIds(ir);
    expect(ownedNodeIds.has('rule#ghost-owned')).toBe(true);

    const glyphs = groupToGlyphs(group, ir, new Map(), ownedNodeIds);
    expect(glyphs).toHaveLength(0);
  });

  it('companion: patternToGlyphs renders exactly the one glyph for the same fixture (single Inspector, not zero, not two)', () => {
    const ghostOwnedRule: IRRule = {
      nodeId: 'rule#ghost-owned',
      context: [{ kind: 'vkey', name: 'K_Q', modifiers: [] }],
      output: [{ kind: 'char', value: 'ɛ' }],
    };
    const group = makeGroup([ghostOwnedRule]);
    const pattern = makePatternFixture('pattern-1', ['rule#ghost-owned']);
    const ir = makeIR({ groups: [group], recognizedPatterns: [pattern] });

    const glyphs = patternToGlyphs(pattern, ir);
    expect(glyphs).toHaveLength(1);
    expect(glyphs[0]!.gid).toBe('rule#ghost-owned');
    expect(glyphs[0]!.ch).toBe('ɛ');
  });

  it('does not exclude an unowned rule when ownedNodeIds is empty (no regression to the non-#886 path)', () => {
    const rule: IRRule = {
      nodeId: 'rule#free',
      context: [{ kind: 'vkey', name: 'K_A', modifiers: [] }],
      output: [{ kind: 'char', value: 'a' }],
    };
    const group = makeGroup([rule]);
    expect(groupToGlyphs(group, undefined, undefined, new Set())).toHaveLength(1);
  });
});

describe('toRailNodes — suppresses a group node when its only rule is claimed via ownedNodes alone (#886)', () => {
  it('emits no kind:"group" node for a group whose sole rule is ownedNodes-only claimed', () => {
    const ghostOwnedRule: IRRule = {
      nodeId: 'rule#ghost-owned',
      context: [{ kind: 'vkey', name: 'K_Q', modifiers: [] }],
      output: [{ kind: 'char', value: 'ɛ' }],
      // ownedByPattern deliberately left undefined — the group-emission
      // guard at toRailNodes must fall back to ownedNodeIds, not just the
      // per-rule stamp, or a ghost group card renders alongside the pattern
      // card that legitimately owns the rule.
    };
    const group = makeGroup([ghostOwnedRule]);
    const pattern = makePatternFixture('pattern-1', ['rule#ghost-owned']);
    const ir = makeIR({ groups: [group], recognizedPatterns: [pattern] });

    const nodes = toRailNodes(ir);
    expect(nodes.filter((n) => n.kind === 'group')).toHaveLength(0);
    // The pattern card itself is still present — ownership isn't lost, only
    // the duplicate group rendering is suppressed.
    expect(nodes.filter((n) => n.kind === 'pattern')).toHaveLength(1);
  });
});

describe('collectOwnedNodeIds', () => {
  it('returns an empty set when there are no recognizedPatterns', () => {
    const ir = makeIR();
    expect(collectOwnedNodeIds(ir)).toEqual(new Set());
  });

  it('unions ownedNodes across multiple recognized patterns', () => {
    const patternA = makePatternFixture('pattern-a', ['rule#a1', 'rule#a2']);
    const patternB = makePatternFixture('pattern-b', ['rule#b1']);
    const ir = makeIR({ recognizedPatterns: [patternA, patternB] });

    const ids = collectOwnedNodeIds(ir);
    expect(ids).toEqual(new Set(['rule#a1', 'rule#a2', 'rule#b1']));
  });

  it('ignores patterns whose origin is not "recognized"', () => {
    const authoredPattern = {
      ...makePatternFixture('pattern-authored', ['rule#authored-1']),
      origin: 'authored',
    } as Pattern;
    const ir = makeIR({ recognizedPatterns: [authoredPattern] });

    expect(collectOwnedNodeIds(ir)).toEqual(new Set());
  });
});

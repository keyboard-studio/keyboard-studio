// Tests for ruleModifier(), modifierLabel(), glyph-shape integration, and StoreUsage.patternRefs in irToCarveNodes.ts

import { describe, it, expect } from 'vitest';
import type { IRRule, IRGroup, IRStore, KeyboardIR, Pattern } from '@keyboard-studio/contracts';
import {
  ruleModifier,
  modifierLabel,
  groupToGlyphs,
  glyphsTriState,
  toRailNodes,
  collectOwnedNodeIds,
  patternToGlyphs,
} from './irToCarveNodes.ts';

// ---------------------------------------------------------------------------
// Fixture helpers
// ---------------------------------------------------------------------------

function makeVkeyRule(modifiers: string[], nodeId = 'n1'): IRRule {
  return {
    nodeId,
    context: [{ kind: 'vkey', name: 'K_A', modifiers }],
    output: [{ kind: 'char', value: 'a' }],
  };
}

function makeCharOnlyRule(nodeId = 'n2'): IRRule {
  return {
    nodeId,
    context: [{ kind: 'char', value: 'x' }],
    output: [{ kind: 'char', value: 'y' }],
  };
}

function makeGroup(rules: IRRule[]): IRGroup {
  return { nodeId: 'g1', name: 'main', usingKeys: true, rules, readonly: false };
}

// ---------------------------------------------------------------------------
// ruleModifier
// ---------------------------------------------------------------------------

describe('ruleModifier', () => {
  it('returns base for vkey with no modifiers', () => {
    expect(ruleModifier(makeVkeyRule([]))).toBe('base');
  });

  it('returns base for char-only context (no vkey element)', () => {
    expect(ruleModifier(makeCharOnlyRule())).toBe('base');
  });

  it('returns shift for SHIFT modifier', () => {
    expect(ruleModifier(makeVkeyRule(['SHIFT']))).toBe('shift');
  });

  it('returns shift for RSHIFT modifier', () => {
    expect(ruleModifier(makeVkeyRule(['RSHIFT']))).toBe('shift');
  });

  it('returns ralt for RALT modifier', () => {
    expect(ruleModifier(makeVkeyRule(['RALT']))).toBe('ralt');
  });

  it('returns ralt for RIGHTALT modifier', () => {
    expect(ruleModifier(makeVkeyRule(['RIGHTALT']))).toBe('ralt');
  });

  it('returns ctrl for CTRL modifier', () => {
    expect(ruleModifier(makeVkeyRule(['CTRL']))).toBe('ctrl');
  });

  it('returns other for SHIFT+RALT combo', () => {
    expect(ruleModifier(makeVkeyRule(['SHIFT', 'RALT']))).toBe('other');
  });

  it('returns other for LALT modifier', () => {
    expect(ruleModifier(makeVkeyRule(['LALT']))).toBe('other');
  });

  it('returns other for CAPS modifier', () => {
    expect(ruleModifier(makeVkeyRule(['CAPS']))).toBe('other');
  });

  it('returns other for NCAPS modifier', () => {
    expect(ruleModifier(makeVkeyRule(['NCAPS']))).toBe('other');
  });
});

// ---------------------------------------------------------------------------
// modifierLabel
// ---------------------------------------------------------------------------

describe('modifierLabel', () => {
  it('returns empty string for base (no modifiers)', () => {
    expect(modifierLabel(makeVkeyRule([]))).toBe('');
  });

  it('returns empty string for char-only rule', () => {
    expect(modifierLabel(makeCharOnlyRule())).toBe('');
  });

  it('returns Shift for SHIFT', () => {
    expect(modifierLabel(makeVkeyRule(['SHIFT']))).toBe('Shift');
  });

  it('returns AltGr for RALT', () => {
    expect(modifierLabel(makeVkeyRule(['RALT']))).toBe('AltGr');
  });

  it('returns AltGr for RIGHTALT', () => {
    expect(modifierLabel(makeVkeyRule(['RIGHTALT']))).toBe('AltGr');
  });

  it('returns Ctrl for CTRL', () => {
    expect(modifierLabel(makeVkeyRule(['CTRL']))).toBe('Ctrl');
  });

  it('returns Shift+AltGr for SHIFT+RALT combo (other bucket)', () => {
    expect(modifierLabel(makeVkeyRule(['SHIFT', 'RALT']))).toBe('Shift+AltGr');
  });

  it('returns Caps for CAPS (other bucket)', () => {
    expect(modifierLabel(makeVkeyRule(['CAPS']))).toBe('Caps');
  });

  it('returns NCaps for NCAPS (other bucket)', () => {
    expect(modifierLabel(makeVkeyRule(['NCAPS']))).toBe('NCaps');
  });

  it('returns Alt for LALT (other bucket)', () => {
    expect(modifierLabel(makeVkeyRule(['LALT']))).toBe('Alt');
  });
});

// ---------------------------------------------------------------------------
// groupToGlyphs — modifierLayer + modifierLabel integration
// Tests the CarveGlyph shape produced for all buckets, null-return paths, and
// ownership filtering. Going through the exported groupToGlyphs avoids exposing
// the private ruleToGlyph.
// ---------------------------------------------------------------------------

describe('groupToGlyphs modifierLayer + modifierLabel', () => {
  it('sets modifierLabel to empty string and modifierLayer to base for no-modifier rule', () => {
    const glyphs = groupToGlyphs(makeGroup([makeVkeyRule([], 'n-base')]));
    expect(glyphs).toHaveLength(1);
    expect(glyphs[0]!.modifierLabel).toBe('');
    expect(glyphs[0]!.modifierLayer).toBe('base');
  });

  it('sets modifierLabel to Shift and modifierLayer to shift for SHIFT rule', () => {
    const glyphs = groupToGlyphs(makeGroup([makeVkeyRule(['SHIFT'], 'n-shift')]));
    expect(glyphs).toHaveLength(1);
    expect(glyphs[0]!.modifierLabel).toBe('Shift');
    expect(glyphs[0]!.modifierLayer).toBe('shift');
  });

  it('sets modifierLabel to AltGr and modifierLayer to ralt for RALT rule', () => {
    const glyphs = groupToGlyphs(makeGroup([makeVkeyRule(['RALT'], 'n-ralt')]));
    expect(glyphs).toHaveLength(1);
    expect(glyphs[0]!.modifierLabel).toBe('AltGr');
    expect(glyphs[0]!.modifierLayer).toBe('ralt');
  });

  it('sets modifierLabel to Ctrl and modifierLayer to ctrl for CTRL rule', () => {
    const glyphs = groupToGlyphs(makeGroup([makeVkeyRule(['CTRL'], 'n-ctrl')]));
    expect(glyphs).toHaveLength(1);
    expect(glyphs[0]!.modifierLabel).toBe('Ctrl');
    expect(glyphs[0]!.modifierLayer).toBe('ctrl');
  });

  it('sets modifierLayer to other and sets label for LALT rule', () => {
    const glyphs = groupToGlyphs(makeGroup([makeVkeyRule(['LALT'], 'n-lalt')]));
    expect(glyphs).toHaveLength(1);
    expect(glyphs[0]!.modifierLayer).toBe('other');
    expect(glyphs[0]!.modifierLabel).toBe('Alt');
  });

  it('sets modifierLayer to other and joins labels for SHIFT+RALT rule', () => {
    const glyphs = groupToGlyphs(makeGroup([makeVkeyRule(['SHIFT', 'RALT'], 'n-shiftalt')]));
    expect(glyphs).toHaveLength(1);
    expect(glyphs[0]!.modifierLayer).toBe('other');
    expect(glyphs[0]!.modifierLabel).toBe('Shift+AltGr');
  });

  it('does not add modifier token to the keys array', () => {
    const glyphs = groupToGlyphs(makeGroup([makeVkeyRule(['SHIFT'], 'n-keys')]));
    expect(glyphs[0]!.keys).toEqual(['K_A']);
  });

  it('returns no glyph for a rule with empty keys (any-only context, null path)', () => {
    // contextToKeys skips 'any' elements → keys = [] → ruleToGlyph returns null
    const anyRule: IRRule = {
      nodeId: 'n-any',
      context: [{ kind: 'any', storeRef: 'S1' }],
      output: [{ kind: 'char', value: 'a' }],
    };
    expect(groupToGlyphs(makeGroup([anyRule]))).toHaveLength(0);
  });

  it('returns no glyph for a deadkey output (null path)', () => {
    const dkRule: IRRule = {
      nodeId: 'n-dk',
      context: [{ kind: 'vkey', name: 'K_A', modifiers: [] }],
      output: [{ kind: 'deadkey', id: 1 }],
    };
    expect(groupToGlyphs(makeGroup([dkRule]))).toHaveLength(0);
  });

  it('omits rules owned by a pattern', () => {
    const ownedRule: IRRule = {
      nodeId: 'n-owned',
      context: [{ kind: 'vkey', name: 'K_B', modifiers: [] }],
      output: [{ kind: 'char', value: 'b' }],
      ownedByPattern: 'p1',
    };
    expect(groupToGlyphs(makeGroup([ownedRule]))).toHaveLength(0);
  });
});

// ---------------------------------------------------------------------------
// #917 — GlyphOwner store/pattern tags on CarveGlyph.owners.
// ruleStoreOwners() is private; exercised only through groupToGlyphs /
// patternToGlyphs / expandParallelStoreRule (via isParallelIndexFanOut).
// ---------------------------------------------------------------------------

function makeStore(name: string, nodeId: string, overrides: Partial<IRStore> = {}): IRStore {
  return { nodeId, name, items: [], isSystem: false, ...overrides };
}

function makeIRWithStores(groups: IRGroup[], stores: IRStore[]): KeyboardIR {
  return {
    origin: 'scaffolded',
    header: { keyboardId: '', name: '', bcp47: [], copyright: '', version: '', targets: [], storeDirectives: [] },
    stores,
    groups,
    comments: [],
    raw: [],
    recognizedPatterns: [],
  };
}

describe('#917 — GlyphOwner store tags via ruleStoreOwners (through groupToGlyphs)', () => {
  it('A1: a rule whose context has any(store) gets a store owner from the input side', () => {
    const store = makeStore('vowels', 'store#vowels');
    const rule: IRRule = {
      nodeId: 'n-any-store',
      context: [{ kind: 'any', storeRef: 'vowels' }, { kind: 'vkey', name: 'K_A', modifiers: [] }],
      output: [{ kind: 'char', value: 'á' }],
    };
    const ir = makeIRWithStores([makeGroup([rule])], [store]);
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
    const ir = makeIRWithStores([makeGroup([rule])], [store]);
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
    const ir = makeIRWithStores([makeGroup([rule])], [store]);
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
    const ir = makeIRWithStores([makeGroup([rule])], [systemStore]);
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
    const ir = makeIRWithStores([makeGroup([rule])], [store]);
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
    const ir = makeIRWithStores([group], [store]);
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
    const ir = makeIRWithStores([group], []);
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
    const ir = makeIRWithStores([makeGroup([rule])], [outputStore, baseStore]);

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

/** Minimal KeyboardIR fixture — only the fields these tests read. */
function makeMinimalIR(groups: IRGroup[], recognizedPatterns: Pattern[] = []): KeyboardIR {
  return {
    origin: {} as KeyboardIR['origin'],
    header: {} as KeyboardIR['header'],
    stores: [],
    groups,
    comments: [],
    raw: [],
    recognizedPatterns,
  } as unknown as KeyboardIR;
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
    const ir = makeMinimalIR([group], [pattern]);

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
    const ir = makeMinimalIR([group], [pattern]);

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
    const ir = makeMinimalIR([group], [pattern]);

    const nodes = toRailNodes(ir);
    expect(nodes.filter((n) => n.kind === 'group')).toHaveLength(0);
    // The pattern card itself is still present — ownership isn't lost, only
    // the duplicate group rendering is suppressed.
    expect(nodes.filter((n) => n.kind === 'pattern')).toHaveLength(1);
  });
});

describe('collectOwnedNodeIds', () => {
  it('returns an empty set when there are no recognizedPatterns', () => {
    const ir = makeMinimalIR([], []);
    expect(collectOwnedNodeIds(ir)).toEqual(new Set());
  });

  it('unions ownedNodes across multiple recognized patterns', () => {
    const patternA = makePatternFixture('pattern-a', ['rule#a1', 'rule#a2']);
    const patternB = makePatternFixture('pattern-b', ['rule#b1']);
    const ir = makeMinimalIR([], [patternA, patternB]);

    const ids = collectOwnedNodeIds(ir);
    expect(ids).toEqual(new Set(['rule#a1', 'rule#a2', 'rule#b1']));
  });

  it('ignores patterns whose origin is not "recognized"', () => {
    const authoredPattern = {
      ...makePatternFixture('pattern-authored', ['rule#authored-1']),
      origin: 'authored',
    } as Pattern;
    const ir = makeMinimalIR([], [authoredPattern]);

    expect(collectOwnedNodeIds(ir)).toEqual(new Set());
  });
});

// ---------------------------------------------------------------------------
// glyphsTriState
// ---------------------------------------------------------------------------

describe('glyphsTriState', () => {
  const noDelete = () => false;
  const allDelete = () => true;

  const glyphs = groupToGlyphs(makeGroup([
    makeVkeyRule([], 'g1'),
    makeVkeyRule(['SHIFT'], 'g2'),
    makeVkeyRule(['RALT'], 'g3'),
  ]));

  it('returns on when nothing is deleted', () => {
    expect(glyphsTriState(glyphs, noDelete)).toBe('on');
  });

  it('returns off when everything is deleted', () => {
    expect(glyphsTriState(glyphs, allDelete)).toBe('off');
  });

  it('returns partial when some are deleted', () => {
    expect(glyphsTriState(glyphs, (id) => id === 'g1')).toBe('partial');
  });
});

// ---------------------------------------------------------------------------
// StoreUsage.patternRefs — analyzeStoreUsage via toRailNodes
// ---------------------------------------------------------------------------

/** Minimal KeyboardIR fixture — only the fields toRailNodes reads. */
function makeIR(overrides: Partial<KeyboardIR> = {}): KeyboardIR {
  return {
    origin: {} as KeyboardIR['origin'],
    header: {} as KeyboardIR['header'],
    stores: [],
    groups: [],
    comments: [],
    raw: [],
    recognizedPatterns: [],
    ...overrides,
  } as unknown as KeyboardIR;
}

describe('StoreUsage.patternRefs', () => {
  it('is empty when no recognized patterns exist', () => {
    const ir = makeIR({
      stores: [{ nodeId: 'store-1', name: 'composed', items: [], isSystem: false } as any],
      groups: [{
        nodeId: 'g1', name: 'main', usingKeys: true, readonly: false,
        rules: [{
          nodeId: 'rule-1',
          context: [{ kind: 'any', storeRef: 'composed' }],
          output: [{ kind: 'char', value: 'á' }],
        }],
      }],
      recognizedPatterns: [],
    });
    const nodes = toRailNodes(ir);
    const store = nodes.find((n) => n.name === 'composed');
    expect(store?.storeUsage?.patternRefs).toEqual([]);
  });

  it('populates patternRefs when a recognized pattern owns a rule referencing the store via any()', () => {
    const ir = makeIR({
      stores: [{ nodeId: 'store-1', name: 'composed', items: [], isSystem: false } as any],
      groups: [{
        nodeId: 'g1', name: 'main', usingKeys: true, readonly: false,
        rules: [{
          nodeId: 'rule-1',
          context: [{ kind: 'any', storeRef: 'composed' }],
          output: [{ kind: 'index', storeRef: 'comp-dia', position: 1 }],
          ownedByPattern: 'pattern-1',
        }],
      }],
      recognizedPatterns: [{
        id: 'pattern-1', title: 'Dead Keys', origin: 'recognized',
        ownedNodes: [{ kind: 'rule', nodeId: 'rule-1' }],
        description: '', category: 'substitution' as any, appliesTo: [],
      }],
    });
    const nodes = toRailNodes(ir);
    const store = nodes.find((n) => n.name === 'composed');
    expect(store?.storeUsage?.patternRefs).toEqual([
      expect.objectContaining({ patternId: 'pattern-1', patternTitle: 'Dead Keys', ruleCount: 1 }),
    ]);
  });

  it('populates patternRefs for the output store (index()) too', () => {
    const ir = makeIR({
      stores: [{ nodeId: 'store-2', name: 'comp-dia', items: [], isSystem: false } as any],
      groups: [{
        nodeId: 'g1', name: 'main', usingKeys: true, readonly: false,
        rules: [{
          nodeId: 'rule-1',
          context: [{ kind: 'any', storeRef: 'composed' }],
          output: [{ kind: 'index', storeRef: 'comp-dia', position: 1 }],
          ownedByPattern: 'pattern-1',
        }],
      }],
      recognizedPatterns: [{
        id: 'pattern-1', title: 'Dead Keys', origin: 'recognized',
        ownedNodes: [{ kind: 'rule', nodeId: 'rule-1' }],
        description: '', category: 'substitution' as any, appliesTo: [],
      }],
    });
    const nodes = toRailNodes(ir);
    const store = nodes.find((n) => n.name === 'comp-dia');
    expect(store?.storeUsage?.patternRefs).toEqual([
      expect.objectContaining({ patternId: 'pattern-1', patternTitle: 'Dead Keys', ruleCount: 1 }),
    ]);
  });

  it('is empty for a store used only in a non-pattern (unowned) rule', () => {
    const ir = makeIR({
      stores: [{ nodeId: 'store-1', name: 'composed', items: [], isSystem: false } as any],
      groups: [{
        nodeId: 'g1', name: 'main', usingKeys: true, readonly: false,
        rules: [{
          nodeId: 'rule-1',
          context: [{ kind: 'any', storeRef: 'composed' }],
          output: [{ kind: 'char', value: 'á' }],
          // no ownedByPattern — unowned rule
        }],
      }],
      recognizedPatterns: [{
        id: 'pattern-1', title: 'Dead Keys', origin: 'recognized',
        ownedNodes: [{ kind: 'rule', nodeId: 'rule-OTHER' }], // doesn't own rule-1
        description: '', category: 'substitution' as any, appliesTo: [],
      }],
    });
    const nodes = toRailNodes(ir);
    const store = nodes.find((n) => n.name === 'composed');
    expect(store?.storeUsage?.patternRefs).toEqual([]);
  });

  it('groupRefs is empty when no unowned rules reference the store', () => {
    const ir = makeIR({
      stores: [{ nodeId: 'store-1', name: 'composed', items: [], isSystem: false } as any],
      groups: [{
        nodeId: 'g1', name: 'main', usingKeys: true, readonly: false,
        rules: [{ nodeId: 'rule-1', context: [{ kind: 'any', storeRef: 'composed' }], output: [{ kind: 'char', value: 'á' }], ownedByPattern: 'pattern-1' }],
      }],
      recognizedPatterns: [],
    });
    const nodes = toRailNodes(ir);
    const store = nodes.find((n) => n.name === 'composed');
    expect(store?.storeUsage?.groupRefs).toEqual([]);
  });

  it('populates groupRefs for unowned rules referencing the store', () => {
    const ir = makeIR({
      stores: [{ nodeId: 'store-1', name: 'composed', items: [], isSystem: false } as any],
      groups: [{
        nodeId: 'g1', name: 'main', usingKeys: true, readonly: false,
        rules: [{ nodeId: 'rule-1', context: [{ kind: 'any', storeRef: 'composed' }], output: [{ kind: 'char', value: 'á' }] }],
      }],
      recognizedPatterns: [],
    });
    const nodes = toRailNodes(ir);
    const store = nodes.find((n) => n.name === 'composed');
    expect(store?.storeUsage?.groupRefs).toEqual([
      expect.objectContaining({ groupId: 'g1', groupName: 'main', ruleCount: 1 }),
    ]);
  });

  it('aggregates rule count when a pattern owns multiple rules referencing the same store', () => {
    const ir = makeIR({
      stores: [{ nodeId: 'store-1', name: 'composed', items: [], isSystem: false } as any],
      groups: [{
        nodeId: 'g1', name: 'main', usingKeys: true, readonly: false,
        rules: [
          { nodeId: 'rule-1', context: [{ kind: 'any', storeRef: 'composed' }], output: [{ kind: 'index', storeRef: 'comp-dia', position: 1 }], ownedByPattern: 'pattern-1' },
          { nodeId: 'rule-2', context: [{ kind: 'any', storeRef: 'composed' }], output: [{ kind: 'index', storeRef: 'comp-dia2', position: 1 }], ownedByPattern: 'pattern-1' },
        ],
      }],
      recognizedPatterns: [{
        id: 'pattern-1', title: 'Dead Keys', origin: 'recognized',
        ownedNodes: [{ kind: 'rule', nodeId: 'rule-1' }, { kind: 'rule', nodeId: 'rule-2' }],
        description: '', category: 'substitution' as any, appliesTo: [],
      }],
    });
    const nodes = toRailNodes(ir);
    const store = nodes.find((n) => n.name === 'composed');
    expect(store?.storeUsage?.patternRefs[0]?.ruleCount).toBe(2);
  });

  // #886 drift shape: ownedByPattern unset on the rule itself, but the rule's
  // nodeId IS listed in a recognized pattern's ownedNodes. Before the fix,
  // groupRefs only checked `rule.ownedByPattern !== undefined`, so this rule
  // was double-counted — once under patternRefs (via ownedNodes) and again
  // under groupRefs (because the per-rule stamp was missing). The fix adds
  // the collectOwnedNodeIds(ir) fallback so it is excluded from groupRefs.
  it('counts a rule in patternRefs only (not groupRefs) when ownedByPattern is unset but the rule is listed in a pattern\'s ownedNodes (#886 drift shape)', () => {
    const ir = makeIR({
      stores: [{ nodeId: 'store-1', name: 'composed', items: [], isSystem: false } as any],
      groups: [{
        nodeId: 'g1', name: 'main', usingKeys: true, readonly: false,
        rules: [{
          nodeId: 'rule-1',
          context: [{ kind: 'any', storeRef: 'composed' }],
          output: [{ kind: 'char', value: 'á' }],
          // no ownedByPattern stamp — this is the drift: ownership is only
          // recorded via the pattern's ownedNodes, not the per-rule field.
        }],
      }],
      recognizedPatterns: [{
        id: 'pattern-1', title: 'Dead Keys', origin: 'recognized',
        ownedNodes: [{ kind: 'rule', nodeId: 'rule-1' }],
        description: '', category: 'substitution' as any, appliesTo: [],
      }],
    });
    const nodes = toRailNodes(ir);
    const store = nodes.find((n) => n.name === 'composed');
    expect(store?.storeUsage?.patternRefs).toEqual([
      expect.objectContaining({ patternId: 'pattern-1', patternTitle: 'Dead Keys', ruleCount: 1 }),
    ]);
    expect(store?.storeUsage?.groupRefs).toEqual([]);
  });

  // Companion case: proves the fix does not over-exclude. A rule that is
  // genuinely unowned — no ownedByPattern stamp AND not present in any
  // pattern's ownedNodes — must still surface under groupRefs.
  it('still counts a genuinely unowned rule (no ownedByPattern, not in any ownedNodes) under groupRefs', () => {
    const ir = makeIR({
      stores: [{ nodeId: 'store-1', name: 'composed', items: [], isSystem: false } as any],
      groups: [{
        nodeId: 'g1', name: 'main', usingKeys: true, readonly: false,
        rules: [{
          nodeId: 'rule-unowned',
          context: [{ kind: 'any', storeRef: 'composed' }],
          output: [{ kind: 'char', value: 'á' }],
        }],
      }],
      recognizedPatterns: [{
        id: 'pattern-1', title: 'Dead Keys', origin: 'recognized',
        ownedNodes: [{ kind: 'rule', nodeId: 'rule-1' }], // does not include rule-unowned
        description: '', category: 'substitution' as any, appliesTo: [],
      }],
    });
    const nodes = toRailNodes(ir);
    const store = nodes.find((n) => n.name === 'composed');
    expect(store?.storeUsage?.groupRefs).toEqual([
      expect.objectContaining({ groupId: 'g1', groupName: 'main', ruleCount: 1 }),
    ]);
    expect(store?.storeUsage?.patternRefs).toEqual([]);
  });
});

// Tests for ruleModifier(), modifierLabel(), glyph-shape integration, StoreUsage.patternRefs, detectStorePairs, and storeRoleLine in irToCarveNodes.ts

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
  detectStorePairs,
  vkeyLabel,
  triggerKeyLabel,
  storeItemsAreKeys,
  computeStoreRoleLine,
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

// ---------------------------------------------------------------------------
// detectStorePairs — any()/index() cross-store pairing (StorePairEntry[] shape)
// ---------------------------------------------------------------------------

describe('detectStorePairs', () => {
  it('returns empty map when there are no rules', () => {
    const ir = makeIR({ groups: [] });
    expect(detectStorePairs(ir).size).toBe(0);
  });

  it('returns empty map when rules have any() but no index() output', () => {
    const ir = makeIR({
      groups: [{
        nodeId: 'g1', name: 'main', usingKeys: true, readonly: false,
        rules: [{
          nodeId: 'r1',
          context: [{ kind: 'any', storeRef: 'storeA' }],
          output: [{ kind: 'char', value: 'x' }],
        }],
      }],
    });
    expect(detectStorePairs(ir).size).toBe(0);
  });

  it('returns empty map when rules have index() but no any() in context', () => {
    const ir = makeIR({
      groups: [{
        nodeId: 'g1', name: 'main', usingKeys: true, readonly: false,
        rules: [{
          nodeId: 'r1',
          context: [{ kind: 'char', value: 'a' }],
          output: [{ kind: 'index', storeRef: 'storeB', offset: 1 }],
        }],
      }],
    });
    expect(detectStorePairs(ir).size).toBe(0);
  });

  it('detects a clean any(A)/index(B) pair — both stores get each other as a peer', () => {
    const ir = makeIR({
      groups: [{
        nodeId: 'g1', name: 'main', usingKeys: true, readonly: false,
        rules: [{
          nodeId: 'r1',
          context: [{ kind: 'any', storeRef: 'storeA' }],
          output: [{ kind: 'index', storeRef: 'storeB', offset: 1 }],
        }],
      }],
    });
    const pairs = detectStorePairs(ir);
    expect(pairs.get('storeA')).toEqual([{ pairedName: 'storeB', trigger: undefined }]);
    expect(pairs.get('storeB')).toEqual([{ pairedName: 'storeA', trigger: undefined }]);
  });

  it('captures the trigger key (K_BKSP -> "Backspace") when present after the + separator', () => {
    const ir = makeIR({
      groups: [{
        nodeId: 'g1', name: 'main', usingKeys: true, readonly: false,
        rules: [{
          nodeId: 'r1',
          context: [
            { kind: 'any', storeRef: 'storeA' },
            { kind: 'raw', text: '+' },
            { kind: 'vkey', name: 'K_BKSP', modifiers: [] },
          ],
          output: [{ kind: 'index', storeRef: 'storeB', offset: 1 }],
        }],
      }],
    });
    const pairs = detectStorePairs(ir);
    expect(pairs.get('storeA')?.[0]?.trigger).toBe('Backspace');
    expect(pairs.get('storeB')?.[0]?.trigger).toBe('Backspace');
  });

  it('deduplicates when multiple rules use the same pair (trigger from first rule wins)', () => {
    const ir = makeIR({
      groups: [{
        nodeId: 'g1', name: 'main', usingKeys: true, readonly: false,
        rules: [
          {
            nodeId: 'r1',
            context: [
              { kind: 'any', storeRef: 'storeA' },
              { kind: 'raw', text: '+' },
              { kind: 'vkey', name: 'K_BKSP', modifiers: [] },
            ],
            output: [{ kind: 'index', storeRef: 'storeB', offset: 1 }],
          },
          {
            nodeId: 'r2',
            context: [
              { kind: 'any', storeRef: 'storeA' },
              { kind: 'raw', text: '+' },
              { kind: 'vkey', name: 'K_BKSP', modifiers: [] },
            ],
            output: [{ kind: 'index', storeRef: 'storeB', offset: 1 }],
          },
        ],
      }],
    });
    const pairs = detectStorePairs(ir);
    expect(pairs.get('storeA')).toHaveLength(1);
    expect(pairs.get('storeA')?.[0]?.pairedName).toBe('storeB');
    expect(pairs.get('storeA')?.[0]?.trigger).toBe('Backspace');
  });

  it('records multiple paired stores when one input store pairs with several output stores', () => {
    const ir = makeIR({
      groups: [{
        nodeId: 'g1', name: 'main', usingKeys: true, readonly: false,
        rules: [
          {
            nodeId: 'r1',
            context: [{ kind: 'any', storeRef: 'storeA' }],
            output: [{ kind: 'index', storeRef: 'storeB', offset: 1 }],
          },
          {
            nodeId: 'r2',
            context: [{ kind: 'any', storeRef: 'storeA' }],
            output: [{ kind: 'index', storeRef: 'storeC', offset: 1 }],
          },
        ],
      }],
    });
    const pairs = detectStorePairs(ir);
    // storeA pairs with both B and C (sorted by pairedName)
    expect(pairs.get('storeA')).toHaveLength(2);
    expect(pairs.get('storeA')!.map((e) => e.pairedName)).toEqual(['storeB', 'storeC']);
    expect(pairs.get('storeB')?.[0]?.pairedName).toBe('storeA');
    expect(pairs.get('storeC')?.[0]?.pairedName).toBe('storeA');
  });

  it('does not pair a store with itself', () => {
    const ir = makeIR({
      groups: [{
        nodeId: 'g1', name: 'main', usingKeys: true, readonly: false,
        rules: [{
          nodeId: 'r1',
          context: [{ kind: 'any', storeRef: 'storeA' }],
          output: [{ kind: 'index', storeRef: 'storeA', offset: 1 }],
        }],
      }],
    });
    const pairs = detectStorePairs(ir);
    expect(pairs.size).toBe(0);
  });
});

// ---------------------------------------------------------------------------
// vkeyLabel — virtual-key → human label
// ---------------------------------------------------------------------------

describe('vkeyLabel', () => {
  it('returns "Backspace" for K_BKSP', () => {
    expect(vkeyLabel('K_BKSP')).toBe('Backspace');
  });

  it('returns "Enter" for K_ENTER', () => {
    expect(vkeyLabel('K_ENTER')).toBe('Enter');
  });

  it('returns the letter for K_A', () => {
    expect(vkeyLabel('K_A')).toBe('A');
  });

  it('returns the digit for K_0', () => {
    expect(vkeyLabel('K_0')).toBe('0');
  });

  it('returns "F1" for K_F1', () => {
    expect(vkeyLabel('K_F1')).toBe('F1');
  });

  it('returns undefined for empty string', () => {
    expect(vkeyLabel('')).toBeUndefined();
  });

  it('is case-insensitive (k_bksp)', () => {
    expect(vkeyLabel('k_bksp')).toBe('Backspace');
  });
});

// ---------------------------------------------------------------------------
// triggerKeyLabel — extracts trigger from rule context
// ---------------------------------------------------------------------------

describe('triggerKeyLabel', () => {
  it('returns undefined when no + separator is present', () => {
    expect(triggerKeyLabel([{ kind: 'any', storeRef: 'storeA' }])).toBeUndefined();
  });

  it('returns "Backspace" for any(A) + [K_BKSP]', () => {
    const ctx = [
      { kind: 'any' as const, storeRef: 'storeA' },
      { kind: 'raw' as const, text: '+' },
      { kind: 'vkey' as const, name: 'K_BKSP', modifiers: [] },
    ];
    expect(triggerKeyLabel(ctx)).toBe('Backspace');
  });

  it('returns the char value for a char trigger', () => {
    const ctx = [
      { kind: 'any' as const, storeRef: 'storeA' },
      { kind: 'raw' as const, text: '+' },
      { kind: 'char' as const, value: 'x' },
    ];
    expect(triggerKeyLabel(ctx)).toBe('"x"');
  });

  it('returns deadkey label for a deadkey trigger', () => {
    const ctx = [
      { kind: 'any' as const, storeRef: 'storeA' },
      { kind: 'raw' as const, text: '+' },
      { kind: 'deadkey' as const, id: 42 },
    ];
    expect(triggerKeyLabel(ctx)).toBe('deadkey 42');
  });

  it('returns undefined when + is the last element (no trigger element after it)', () => {
    const ctx = [
      { kind: 'any' as const, storeRef: 'storeA' },
      { kind: 'raw' as const, text: '+' },
    ];
    expect(triggerKeyLabel(ctx)).toBeUndefined();
  });
});

// ---------------------------------------------------------------------------
// toRailNodes store pairedStoreIds / pairedStoreNames / pairedStoreTriggers
// ---------------------------------------------------------------------------

describe('toRailNodes store pairedStoreIds / pairedStoreNames / pairedStoreTriggers', () => {
  it('populates pairedStoreNames, pairedStoreIds, and pairedStoreTriggers for the input-side store', () => {
    const ir = makeIR({
      stores: [
        { nodeId: 'sid-A', name: 'storeA', items: [], isSystem: false } as any,
        { nodeId: 'sid-B', name: 'storeB', items: [], isSystem: false } as any,
      ],
      groups: [{
        nodeId: 'g1', name: 'main', usingKeys: true, readonly: false,
        rules: [{
          nodeId: 'r1',
          context: [
            { kind: 'any', storeRef: 'storeA' },
            { kind: 'raw', text: '+' },
            { kind: 'vkey', name: 'K_BKSP', modifiers: [] },
          ],
          output: [{ kind: 'index', storeRef: 'storeB', offset: 1 }],
        }],
      }],
    });
    const nodes = toRailNodes(ir);
    const nodeA = nodes.find((n) => n.name === 'storeA');
    expect(nodeA?.pairedStoreNames).toEqual(['storeB']);
    expect(nodeA?.pairedStoreIds).toEqual(['sid-B']);
    expect(nodeA?.pairedStoreTriggers).toEqual(['Backspace']);
  });

  it('populates fields for the output-side store too', () => {
    const ir = makeIR({
      stores: [
        { nodeId: 'sid-A', name: 'storeA', items: [], isSystem: false } as any,
        { nodeId: 'sid-B', name: 'storeB', items: [], isSystem: false } as any,
      ],
      groups: [{
        nodeId: 'g1', name: 'main', usingKeys: true, readonly: false,
        rules: [{
          nodeId: 'r1',
          context: [
            { kind: 'any', storeRef: 'storeA' },
            { kind: 'raw', text: '+' },
            { kind: 'vkey', name: 'K_BKSP', modifiers: [] },
          ],
          output: [{ kind: 'index', storeRef: 'storeB', offset: 1 }],
        }],
      }],
    });
    const nodes = toRailNodes(ir);
    const nodeB = nodes.find((n) => n.name === 'storeB');
    expect(nodeB?.pairedStoreNames).toEqual(['storeA']);
    expect(nodeB?.pairedStoreIds).toEqual(['sid-A']);
    expect(nodeB?.pairedStoreTriggers).toEqual(['Backspace']);
  });

  it('leaves all paired fields absent when store has no pair', () => {
    const ir = makeIR({
      stores: [
        { nodeId: 'sid-X', name: 'storeX', items: [], isSystem: false } as any,
      ],
      groups: [{
        nodeId: 'g1', name: 'main', usingKeys: true, readonly: false,
        rules: [{
          nodeId: 'r1',
          context: [{ kind: 'char', value: 'a' }],
          output: [{ kind: 'char', value: 'b' }],
        }],
      }],
    });
    const nodes = toRailNodes(ir);
    const nodeX = nodes.find((n) => n.name === 'storeX');
    expect(nodeX?.pairedStoreIds).toBeUndefined();
    expect(nodeX?.pairedStoreNames).toBeUndefined();
    expect(nodeX?.pairedStoreTriggers).toBeUndefined();
  });
});

// ---------------------------------------------------------------------------
// storeItemsAreKeys — key-code vs literal-character detection
// ---------------------------------------------------------------------------

describe('storeItemsAreKeys', () => {
  it('returns true when any item has kind "vkey"', () => {
    expect(storeItemsAreKeys([{ kind: 'vkey', name: 'K_Q' }])).toBe(true);
  });

  it('returns false for a char-only store', () => {
    expect(storeItemsAreKeys([{ kind: 'char', value: 'a' }, { kind: 'char', value: 'b' }])).toBe(false);
  });

  it('returns false for an empty store', () => {
    expect(storeItemsAreKeys([])).toBe(false);
  });

  it('returns true for a mixed store containing at least one vkey', () => {
    expect(storeItemsAreKeys([{ kind: 'char', value: 'a' }, { kind: 'vkey', name: 'K_Q' }])).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// computeStoreRoleLine — role line wording
// ---------------------------------------------------------------------------

function makeUsage(asSource: boolean, asOutput: boolean): import('./irToCarveNodes.ts').StoreUsage {
  return { ruleCount: 1, asSource, asOutput, groupNames: [], patternRefs: [], groupRefs: [] };
}

describe('computeStoreRoleLine', () => {
  it('returns undefined when usage is undefined', () => {
    expect(computeStoreRoleLine(undefined, [])).toBeUndefined();
  });

  it('returns undefined when neither asSource nor asOutput', () => {
    expect(computeStoreRoleLine(makeUsage(false, false), [])).toBeUndefined();
  });

  it('output-only: returns "Output —" wording', () => {
    const text = computeStoreRoleLine(makeUsage(false, true), []);
    expect(text).toMatch(/^Output —/);
    expect(text).not.toMatch(/backspace/i);
    expect(text).not.toMatch(/deadkey/i);
  });

  it('input-only + char items: returns "Input — characters …" wording', () => {
    const text = computeStoreRoleLine(makeUsage(true, false), [{ kind: 'char', value: 'a' }]);
    expect(text).toMatch(/^Input —/i);
    expect(text).toMatch(/once typed/i);
    expect(text).not.toMatch(/keys you press/i);
  });

  it('input-only + vkey items: returns "Input — the keys you press" wording', () => {
    const text = computeStoreRoleLine(makeUsage(true, false), [{ kind: 'vkey', name: 'K_Q' }]);
    expect(text).toMatch(/^Input —/i);
    expect(text).toMatch(/keys you press/i);
    expect(text).not.toMatch(/once typed/i);
  });

  it('both: returns "Input + output —" wording', () => {
    const text = computeStoreRoleLine(makeUsage(true, true), []);
    expect(text).toMatch(/^Input \+ output —/i);
  });

  it('none of the role lines mention a specific trigger key name', () => {
    const lines = [
      computeStoreRoleLine(makeUsage(false, true), []),
      computeStoreRoleLine(makeUsage(true, false), [{ kind: 'char', value: 'a' }]),
      computeStoreRoleLine(makeUsage(true, false), [{ kind: 'vkey', name: 'K_Q' }]),
      computeStoreRoleLine(makeUsage(true, true), []),
    ];
    for (const line of lines) {
      expect(line).not.toMatch(/backspace/i);
      expect(line).not.toMatch(/K_/i);
    }
  });
});

// ---------------------------------------------------------------------------
// toRailNodes — storeRoleLine population
// ---------------------------------------------------------------------------

describe('toRailNodes storeRoleLine', () => {
  it('populates storeRoleLine for an output-side store (char items)', () => {
    const ir = makeIR({
      stores: [
        { nodeId: 'sid-A', name: 'storeA', items: [{ kind: 'char', value: 'a' }], isSystem: false } as any,
        { nodeId: 'sid-B', name: 'storeB', items: [{ kind: 'char', value: 'x' }], isSystem: false } as any,
      ],
      groups: [{
        nodeId: 'g1', name: 'main', usingKeys: true, readonly: false,
        rules: [{
          nodeId: 'r1',
          context: [{ kind: 'any', storeRef: 'storeA' }],
          output: [{ kind: 'index', storeRef: 'storeB', offset: 1 }],
        }],
      }],
    });
    const nodeB = toRailNodes(ir).find((n) => n.name === 'storeB');
    expect(nodeB?.storeRoleLine).toMatch(/^Output —/);
  });

  it('populates storeRoleLine for a vkey input-side store', () => {
    const ir = makeIR({
      stores: [
        { nodeId: 'sid-A', name: 'storeA', items: [{ kind: 'vkey', name: 'K_Q' }], isSystem: false } as any,
        { nodeId: 'sid-B', name: 'storeB', items: [{ kind: 'char', value: 'x' }], isSystem: false } as any,
      ],
      groups: [{
        nodeId: 'g1', name: 'main', usingKeys: true, readonly: false,
        rules: [{
          nodeId: 'r1',
          context: [{ kind: 'any', storeRef: 'storeA' }],
          output: [{ kind: 'index', storeRef: 'storeB', offset: 1 }],
        }],
      }],
    });
    const nodeA = toRailNodes(ir).find((n) => n.name === 'storeA');
    expect(nodeA?.storeRoleLine).toMatch(/keys you press/i);
  });

  it('leaves storeRoleLine absent for an unreferenced store', () => {
    const ir = makeIR({
      stores: [{ nodeId: 'sid-X', name: 'storeX', items: [], isSystem: false } as any],
      groups: [],
    });
    const nodeX = toRailNodes(ir).find((n) => n.name === 'storeX');
    expect(nodeX?.storeRoleLine).toBeUndefined();
  });
});

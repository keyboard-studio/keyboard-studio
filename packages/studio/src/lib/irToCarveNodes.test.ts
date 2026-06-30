// Tests for ruleModifier(), modifierLabel(), glyph-shape integration, StoreUsage.patternRefs, detectStorePairs, and storeRoleLine in irToCarveNodes.ts

import { describe, it, expect } from 'vitest';
import type { IRRule, IRGroup, KeyboardIR } from '@keyboard-studio/contracts';
import { ruleModifier, modifierLabel, groupToGlyphs, glyphsTriState, toRailNodes, detectStorePairs, vkeyLabel, triggerKeyLabel, storeItemsAreKeys, computeStoreRoleLine } from './irToCarveNodes.ts';

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

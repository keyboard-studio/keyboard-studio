// Tests for ruleModifier(), modifierLabel(), glyph-shape integration, and StoreUsage.patternRefs in irToCarveNodes.ts

import { describe, it, expect } from 'vitest';
import type { IRRule, IRGroup, KeyboardIR } from '@keyboard-studio/contracts';
import { ruleModifier, modifierLabel, groupToGlyphs, glyphsTriState, toRailNodes } from './irToCarveNodes.ts';

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

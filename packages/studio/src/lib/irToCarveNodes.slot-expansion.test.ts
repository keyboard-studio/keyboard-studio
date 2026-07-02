// Tests for parallel-store index fan-out slot expansion in irToCarveNodes.ts.
//
// Coverage:
//   1. toRailNodes / groupToGlyphs expands one glyph per char output-store item;
//      gid === "<outputStoreNodeId>#<i>"; non-char slots (nul/beep) produce no glyph.
//   2. A simple `+ [K_A] > 'x'` rule still produces exactly one glyph with
//      gid === rule.nodeId (no `#`).
//   3. glyphsTriState: deleting one of N parallel-store glyphs yields 'partial'.
//   4. CarveGlyph.capability resolves for both gid forms; defaults to
//      'not-removable:unknown' when the map lacks the key.

import { describe, it, expect } from 'vitest';
import type { IRRule, IRGroup, IRStore, KeyboardIR, RemovalCapability, StoreItem } from '@keyboard-studio/contracts';
import { groupToGlyphs, toRailNodes, glyphsTriState, storeCharChips } from './irToCarveNodes.ts';

// ---------------------------------------------------------------------------
// Fixture helpers
// ---------------------------------------------------------------------------

function makeOutputStore(nodeId: string, name: string, items: StoreItem[]): IRStore {
  return { nodeId, name, items, isSystem: false };
}

function makeInputStore(nodeId: string, name: string, chars: string[]): IRStore {
  return {
    nodeId,
    name,
    items: chars.map((c) => ({ kind: 'char' as const, value: c })),
    isSystem: false,
  };
}

function makeVkeyInputStore(nodeId: string, name: string, vkeys: string[]): IRStore {
  return {
    nodeId,
    name,
    items: vkeys.map((k) => ({ kind: 'vkey' as const, name: k })),
    isSystem: false,
  };
}

function makeParallelRule(
  nodeId: string,
  dkId: number,
  inputStoreName: string,
  outputStoreName: string,
): IRRule {
  return {
    nodeId,
    context: [
      { kind: 'deadkey', id: dkId },
      { kind: 'any', storeRef: inputStoreName },
    ],
    output: [{ kind: 'index', storeRef: outputStoreName, offset: 2 }],
  };
}

// Bare transliteration shape: + any(inputStore) > index(outputStore, 1)
// Matches the Bamum pattern: no deadkey, offset === context.length (1).
function makeBareParallelRule(
  nodeId: string,
  inputStoreName: string,
  outputStoreName: string,
): IRRule {
  return {
    nodeId,
    context: [{ kind: 'any', storeRef: inputStoreName }],
    output: [{ kind: 'index', storeRef: outputStoreName, offset: 1 }],
  };
}

function makeSimpleRule(nodeId: string, vkey: string, char: string): IRRule {
  return {
    nodeId,
    context: [{ kind: 'vkey', name: vkey, modifiers: [] }],
    output: [{ kind: 'char', value: char }],
  };
}

function makeGroup(nodeId: string, name: string, rules: IRRule[]): IRGroup {
  return { nodeId, name, usingKeys: true, rules, readonly: false };
}

function makeIR(groups: IRGroup[], stores: IRStore[]): KeyboardIR {
  return {
    origin: 'imported',
    header: {
      keyboardId: 'test',
      name: 'Test',
      bcp47: [],
      copyright: '',
      version: '1.0',
      targets: [],
      storeDirectives: [],
    },
    stores,
    groups,
    comments: [],
    raw: [],
    recognizedPatterns: [],
  };
}

// Build a parallel-store IR with:
//   output store dktX: [char 'À', char 'ε', raw(nul), raw(beep)]   (4 items; 2 char, 2 non-char)
//   input store dkfX: [char 'a', char 'b', char 'c', char 'd']
//   parallel rule: dk(003b) any(dkfX) > index(dktX, 2)
//   simple rule: + [K_A] > 'x'
function makeTestIR() {
  const outputStoreNodeId = 'store#dkt';
  const inputStoreNodeId = 'store#dkf';

  const outputItems: StoreItem[] = [
    { kind: 'char', value: 'À' },       // index 0 → gid store#dkt#0
    { kind: 'char', value: 'ε' },       // index 1 → gid store#dkt#1
    { kind: 'raw', text: 'nul' },        // index 2 → NO glyph
    { kind: 'raw', text: 'beep' },       // index 3 → NO glyph
  ];

  const outputStore = makeOutputStore(outputStoreNodeId, 'dktX', outputItems);
  const inputStore = makeInputStore(inputStoreNodeId, 'dkfX', ['a', 'b', 'c', 'd']);

  const parallelRule = makeParallelRule('rule#dk', 0x003b, 'dkfX', 'dktX');
  const simpleRule = makeSimpleRule('rule#simple', 'K_A', 'x');

  const group = makeGroup('group#main', 'main', [parallelRule, simpleRule]);
  return makeIR([group], [outputStore, inputStore]);
}

// ---------------------------------------------------------------------------
// 1. Parallel-store expansion: gid format and non-char filtering
// ---------------------------------------------------------------------------

describe('irToCarveNodes — parallel-store rule expansion', () => {
  it('groupToGlyphs produces one glyph per char output-store item with gid=<storeNodeId>#<i>', () => {
    const ir = makeTestIR();
    const group = ir.groups[0]!;
    // Pass only the parallel rule's group (exclude simple rule for isolation)
    const parallelOnlyGroup = {
      ...group,
      rules: group.rules.filter((r) => r.nodeId === 'rule#dk'),
    };

    const glyphs = groupToGlyphs(parallelOnlyGroup, ir);

    // Only the 2 char items produce glyphs (nul and beep are skipped)
    expect(glyphs).toHaveLength(2);

    // gid format must be "<outputStoreNodeId>#<itemsIndex>"
    expect(glyphs[0]!.gid).toBe('store#dkt#0');
    expect(glyphs[0]!.ch).toBe('À');

    expect(glyphs[1]!.gid).toBe('store#dkt#1');
    expect(glyphs[1]!.ch).toBe('ε');
  });

  it('nul/beep slots produce no glyph', () => {
    const ir = makeTestIR();
    const group = ir.groups[0]!;
    const parallelOnlyGroup = {
      ...group,
      rules: group.rules.filter((r) => r.nodeId === 'rule#dk'),
    };

    const glyphs = groupToGlyphs(parallelOnlyGroup, ir);

    // Items at index 2 (nul) and 3 (beep) must not appear
    const gids = glyphs.map((g) => g.gid);
    expect(gids).not.toContain('store#dkt#2');
    expect(gids).not.toContain('store#dkt#3');
  });

  it('keys array includes the deadkey marker and the matched input char', () => {
    const ir = makeTestIR();
    const group = ir.groups[0]!;
    const parallelOnlyGroup = {
      ...group,
      rules: group.rules.filter((r) => r.nodeId === 'rule#dk'),
    };

    const glyphs = groupToGlyphs(parallelOnlyGroup, ir);

    // keys[0] = deadkey marker; keys[1] = input char at same index
    expect(glyphs[0]!.keys).toEqual(['‹dk›', 'a']);
    expect(glyphs[1]!.keys).toEqual(['‹dk›', 'b']);
  });
});

// ---------------------------------------------------------------------------
// 2. Simple rule still produces one glyph with gid === rule.nodeId (no #)
// ---------------------------------------------------------------------------

describe('irToCarveNodes — simple rule gid contract', () => {
  it('simple vkey→char rule produces exactly one glyph with gid === rule.nodeId', () => {
    const ir = makeTestIR();
    const group = ir.groups[0]!;
    const simpleOnlyGroup = {
      ...group,
      rules: group.rules.filter((r) => r.nodeId === 'rule#simple'),
    };

    const glyphs = groupToGlyphs(simpleOnlyGroup, ir);

    expect(glyphs).toHaveLength(1);
    expect(glyphs[0]!.gid).toBe('rule#simple');
    expect(glyphs[0]!.ch).toBe('x');
    // gid must NOT contain `#` (it's a bare nodeId)
    expect(glyphs[0]!.gid).not.toMatch(/#\d+$/);
  });
});

// ---------------------------------------------------------------------------
// 3. glyphsTriState: partial when one of N parallel-store glyphs is deleted
// ---------------------------------------------------------------------------

describe('irToCarveNodes — glyphsTriState with parallel-store glyphs', () => {
  it("deleting one of two parallel-store glyphs yields 'partial'", () => {
    const ir = makeTestIR();
    const group = ir.groups[0]!;
    const parallelOnlyGroup = {
      ...group,
      rules: group.rules.filter((r) => r.nodeId === 'rule#dk'),
    };
    const glyphs = groupToGlyphs(parallelOnlyGroup, ir);
    expect(glyphs).toHaveLength(2);

    // Delete only the first glyph
    const result = glyphsTriState(glyphs, (id) => id === 'store#dkt#0');
    expect(result).toBe('partial');
  });

  it("deleting all parallel-store glyphs yields 'off'", () => {
    const ir = makeTestIR();
    const group = ir.groups[0]!;
    const parallelOnlyGroup = {
      ...group,
      rules: group.rules.filter((r) => r.nodeId === 'rule#dk'),
    };
    const glyphs = groupToGlyphs(parallelOnlyGroup, ir);

    const result = glyphsTriState(glyphs, () => true);
    expect(result).toBe('off');
  });

  it("deleting no glyphs yields 'on'", () => {
    const ir = makeTestIR();
    const group = ir.groups[0]!;
    const parallelOnlyGroup = {
      ...group,
      rules: group.rules.filter((r) => r.nodeId === 'rule#dk'),
    };
    const glyphs = groupToGlyphs(parallelOnlyGroup, ir);

    const result = glyphsTriState(glyphs, () => false);
    expect(result).toBe('on');
  });
});

// ---------------------------------------------------------------------------
// 4. toRailNodes — parallel-store group appears with per-slot glyphs
// ---------------------------------------------------------------------------

describe('irToCarveNodes — toRailNodes with parallel-store group', () => {
  it('the group node has glyphs with store#dkt#<i> gids (not bare rule.nodeId)', () => {
    const ir = makeTestIR();
    const nodes = toRailNodes(ir);

    const groupNode = nodes.find((n) => n.nodeId === 'group#main');
    expect(groupNode).toBeDefined();
    expect(groupNode!.glyphs).toBeDefined();

    const gids = groupNode!.glyphs!.map((g) => g.gid);

    // Parallel-store glyphs have #-indexed gids
    expect(gids).toContain('store#dkt#0');
    expect(gids).toContain('store#dkt#1');

    // Simple rule glyph has bare nodeId
    expect(gids).toContain('rule#simple');
  });
});

// ---------------------------------------------------------------------------
// 5. CarveGlyph.capability — both gid forms resolve correctly
// ---------------------------------------------------------------------------

describe('irToCarveNodes — CarveGlyph.capability resolution', () => {
  it('standard rule tile resolves capability via rule.nodeId', () => {
    const ir = makeTestIR();
    const group = ir.groups[0]!;
    const simpleOnlyGroup = {
      ...group,
      rules: group.rules.filter((r) => r.nodeId === 'rule#simple'),
    };

    const caps = new Map<string, RemovalCapability>([
      ['rule#simple', 'removable:simple'],
    ]);
    const glyphs = groupToGlyphs(simpleOnlyGroup, ir, caps);

    expect(glyphs).toHaveLength(1);
    expect(glyphs[0]!.capability).toBe('removable:simple');
  });

  it('slot tile resolves capability via output-store nodeId (not rule.nodeId)', () => {
    const ir = makeTestIR();
    const group = ir.groups[0]!;
    const parallelOnlyGroup = {
      ...group,
      rules: group.rules.filter((r) => r.nodeId === 'rule#dk'),
    };

    // Keyed by the OUTPUT STORE nodeId, as the classifier emits alias entries.
    const caps = new Map<string, RemovalCapability>([
      ['store#dkt', 'removable:slot-fill'],
    ]);
    const glyphs = groupToGlyphs(parallelOnlyGroup, ir, caps);

    expect(glyphs.length).toBeGreaterThan(0);
    // Every slot tile must carry the store-aliased capability.
    glyphs.forEach((g) => {
      expect(g.capability).toBe('removable:slot-fill');
    });
  });

  it("defaults to 'not-removable:unknown' when the map lacks the key (standard rule)", () => {
    const ir = makeTestIR();
    const group = ir.groups[0]!;
    const simpleOnlyGroup = {
      ...group,
      rules: group.rules.filter((r) => r.nodeId === 'rule#simple'),
    };

    const glyphs = groupToGlyphs(simpleOnlyGroup, ir, new Map());
    expect(glyphs).toHaveLength(1);
    expect(glyphs[0]!.capability).toBe('not-removable:unknown');
  });

  it("defaults to 'not-removable:unknown' when the map lacks the output-store nodeId (slot tile)", () => {
    const ir = makeTestIR();
    const group = ir.groups[0]!;
    const parallelOnlyGroup = {
      ...group,
      rules: group.rules.filter((r) => r.nodeId === 'rule#dk'),
    };

    const glyphs = groupToGlyphs(parallelOnlyGroup, ir, new Map());
    expect(glyphs.length).toBeGreaterThan(0);
    glyphs.forEach((g) => {
      expect(g.capability).toBe('not-removable:unknown');
    });
  });

  it('toRailNodes threads capabilities into group glyphs', () => {
    const ir = makeTestIR();
    const caps = new Map<string, RemovalCapability>([
      ['rule#simple', 'removable:simple'],
      ['store#dkt', 'removable:slot-fill'],
    ]);
    const nodes = toRailNodes(ir, caps);
    const groupNode = nodes.find((n) => n.nodeId === 'group#main');
    expect(groupNode?.glyphs).toBeDefined();

    const simpleGlyph = groupNode!.glyphs!.find((g) => g.gid === 'rule#simple');
    expect(simpleGlyph?.capability).toBe('removable:simple');

    const slotGlyph = groupNode!.glyphs!.find((g) => g.gid === 'store#dkt#0');
    expect(slotGlyph?.capability).toBe('removable:slot-fill');
  });
});

// ---------------------------------------------------------------------------
// 6. Bare transliteration shape (Bamum): + any(defaultK) > index(defaultU,1)
//    No deadkey — vkey input store — keys = [physicalKeyLabel] (no deadkey marker).
// ---------------------------------------------------------------------------

describe('irToCarveNodes — bare transliteration fan-out (Bamum shape)', () => {
  // Build IR for: + any(defaultK) > index(defaultU, 1)
  // Input store holds physical keys; output store holds Unicode chars.
  function makeBamumIR() {
    const outputStoreNodeId = 'store#bamumU';
    const inputStoreNodeId = 'store#bamumK';

    const outputItems: StoreItem[] = [
      { kind: 'char', value: 'ꚠ' },   // index 0 — Bamum char
      { kind: 'char', value: 'ꚡ' },   // index 1 — Bamum char
      { kind: 'raw', text: 'nul' },    // index 2 — skipped
    ];

    const outputStore = makeOutputStore(outputStoreNodeId, 'defaultU', outputItems);
    const inputStore = makeVkeyInputStore(inputStoreNodeId, 'defaultK', ['K_BKQUOTE', 'K_1', 'K_2']);

    const rule = makeBareParallelRule('rule#bamum', 'defaultK', 'defaultU');
    const group = makeGroup('group#bamum', 'bamum', [rule]);
    return makeIR([group], [outputStore, inputStore]);
  }

  it('expands into one glyph per char output-store slot (nul skipped)', () => {
    const ir = makeBamumIR();
    const group = ir.groups[0]!;
    const glyphs = groupToGlyphs(group, ir);

    expect(glyphs).toHaveLength(2);
    expect(glyphs[0]!.gid).toBe('store#bamumU#0');
    expect(glyphs[0]!.ch).toBe('ꚠ');
    expect(glyphs[1]!.gid).toBe('store#bamumU#1');
    expect(glyphs[1]!.ch).toBe('ꚡ');
  });

  it('keys array has physical key name only — no deadkey marker (Bamum regression)', () => {
    const ir = makeBamumIR();
    const group = ir.groups[0]!;
    const glyphs = groupToGlyphs(group, ir);

    // No '‹dk›' marker — bare transliteration shape.
    expect(glyphs[0]!.keys).toEqual(['K_BKQUOTE']);
    expect(glyphs[1]!.keys).toEqual(['K_1']);
    glyphs.forEach((g) => {
      expect(g.keys).not.toContain('‹dk›');
    });
  });

  it('capability resolves via output-store nodeId alias entry', () => {
    const ir = makeBamumIR();
    const group = ir.groups[0]!;
    const caps = new Map<string, RemovalCapability>([
      ['store#bamumU', 'removable:slot-fill'],
    ]);
    const glyphs = groupToGlyphs(group, ir, caps);

    expect(glyphs.length).toBeGreaterThan(0);
    glyphs.forEach((g) => {
      expect(g.capability).toBe('removable:slot-fill');
    });
  });

  it('defaults to not-removable:unknown when capability map is empty', () => {
    const ir = makeBamumIR();
    const group = ir.groups[0]!;
    const glyphs = groupToGlyphs(group, ir, new Map());

    glyphs.forEach((g) => {
      expect(g.capability).toBe('not-removable:unknown');
    });
  });

  // Regression: existing deadkey-variant tests must still produce ['‹dk›', inputChar].
  it('REGRESSION — deadkey shape still emits the deadkey marker in keys[0]', () => {
    const ir = makeTestIR();
    const group = ir.groups[0]!;
    const parallelOnlyGroup = {
      ...group,
      rules: group.rules.filter((r) => r.nodeId === 'rule#dk'),
    };
    const glyphs = groupToGlyphs(parallelOnlyGroup, ir);

    expect(glyphs.length).toBeGreaterThan(0);
    glyphs.forEach((g) => {
      expect(g.keys[0]).toBe('‹dk›');
    });
  });
});

// ---------------------------------------------------------------------------
// 7. #523 — storeCharChips ids equal the S-02 fan-out glyph gids for the
//    output store (locked gid contract — store chips and pattern/group
//    tiles share toggle state by construction).
// ---------------------------------------------------------------------------

describe('irToCarveNodes — #523 storeCharChips chip ids equal fan-out glyph gids', () => {
  it('output-store chip ids are identical to the parallel-fan-out glyph gids', () => {
    const ir = makeTestIR();
    const group = ir.groups[0]!;
    const parallelOnlyGroup = {
      ...group,
      rules: group.rules.filter((r) => r.nodeId === 'rule#dk'),
    };
    const glyphs = groupToGlyphs(parallelOnlyGroup, ir);
    const glyphGids = glyphs.map((g) => g.gid);

    const outputStore = ir.stores.find((s) => s.name === 'dktX')!;
    const chips = storeCharChips(outputStore, ir);
    const chipIds = chips.map((c) => c.chipId);

    expect(chipIds).toEqual(glyphGids);
    // Non-vacuous: both cover the same 2 char slots (index 0 and 1; the nul
    // and beep slots at index 2/3 are skipped by both).
    expect(chipIds).toEqual(['store#dkt#0', 'store#dkt#1']);
  });

  it('the output store classifies as nul-fill for every chip (matches the #530 slot-fill capability)', () => {
    const ir = makeTestIR();
    const outputStore = ir.stores.find((s) => s.name === 'dktX')!;
    const chips = storeCharChips(outputStore, ir);

    expect(chips.length).toBeGreaterThan(0);
    chips.forEach((c) => expect(c.action).toBe('nul-fill'));
  });
});

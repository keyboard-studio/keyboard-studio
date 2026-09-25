// Tests for storeCharChips: per-character store toggle chips in irToCarveNodes.ts.
//
// Shared IR builders: ./__fixtures__/irToCarveNodes.ts.

import { describe, it, expect } from 'vitest';
import type { IRRule, IRStore, StoreItem } from '@keyboard-studio/contracts';
import { storeCharChips } from './irToCarveNodes.ts';
import { charStore, irGroup } from '@keyboard-studio/contracts/fixtures';
import { makeIR } from './__fixtures__/irToCarveNodes.ts';

// ---------------------------------------------------------------------------
// storeCharChips — per-character store toggle chips (#523)
// ---------------------------------------------------------------------------

function makeChipStore(nodeId: string, name: string, items: StoreItem[], overrides: Partial<IRStore> = {}): IRStore {
  return charStore({ nodeId, name, items, ...overrides });
}

describe('storeCharChips — chip id stability + TRUE itemsIndex', () => {
  it('produces chip ids using the TRUE items index, skipping non-char items (char,vkey,char -> #0 and #2)', () => {
    const store = makeChipStore('store#mixed', 'mixedX', [
      { kind: 'char', value: 'a' },
      { kind: 'vkey', name: 'K_A' },
      { kind: 'char', value: 'b' },
    ]);
    const ir = makeIR({ stores: [store] });

    const chips = storeCharChips(store, ir);

    expect(chips).toHaveLength(2);
    expect(chips[0]!.chipId).toBe('store#mixed#0');
    expect(chips[0]!.itemsIndex).toBe(0);
    expect(chips[0]!.ch).toBe('a');
    expect(chips[1]!.chipId).toBe('store#mixed#2');
    expect(chips[1]!.itemsIndex).toBe(2);
    expect(chips[1]!.ch).toBe('b');
  });

  it('returns an empty array for a store with no char items', () => {
    const store = makeChipStore('store#empty', 'emptyX', [
      { kind: 'raw', text: 'nul' },
      { kind: 'deadkey', id: 1 },
    ]);
    const ir = makeIR({ stores: [store] });
    expect(storeCharChips(store, ir)).toEqual([]);
  });

  it('returns an empty array for a REFERENCED store whose items are all non-char (vkey + raw) — still renders as a binary store, no tri-state', () => {
    const store = makeChipStore('store#nonchar', 'nonCharX', [
      { kind: 'vkey', name: 'K_A' },
      { kind: 'raw', text: 'nul' },
    ]);
    const rule: IRRule = {
      nodeId: 'rule#1',
      context: [{ kind: 'any', storeRef: 'nonCharX' }],
      output: [{ kind: 'char', value: 'z' }],
    };
    const ir = makeIR({ groups: [irGroup({ nodeId: 'g1', rules: [rule] })], stores: [store] });

    expect(storeCharChips(store, ir)).toEqual([]);
  });
});

describe('storeCharChips — per-class action mapping (classifyStoreSlotEdit dispatch)', () => {
  it('drop: a self-paired output-target store (index() output resolves to its own any() context source) maps every char chip to drop', () => {
    const outputStore = makeChipStore('store#out', 'outX', [
      { kind: 'char', value: 'x' },
      { kind: 'char', value: 'y' },
    ]);
    const rule: IRRule = {
      nodeId: 'rule#1',
      context: [{ kind: 'any', storeRef: 'outX' }],
      output: [{ kind: 'index', storeRef: 'outX', offset: 1 }],
    };
    const ir = makeIR({ groups: [irGroup({ nodeId: 'g1', rules: [rule] })], stores: [outputStore] });

    const chips = storeCharChips(outputStore, ir);
    expect(chips).toHaveLength(2);
    chips.forEach((c) => {
      expect(c.action).toBe('drop');
      expect(c.disabledReason).toBeUndefined();
    });
  });

  it('disabled (unresolved-index-pairing): an index() output whose offset does not resolve to an any() context source maps to disabled with the unresolved-pairing reason', () => {
    const outputStore = makeChipStore('store#out2', 'out2X', [{ kind: 'char', value: 'x' }]);
    const rule: IRRule = {
      nodeId: 'rule#1',
      context: [{ kind: 'vkey', name: 'K_A', modifiers: [] }],
      output: [{ kind: 'index', storeRef: 'out2X', offset: 1 }],
    };
    const ir = makeIR({ groups: [irGroup({ nodeId: 'g1', rules: [rule] })], stores: [outputStore] });

    const chips = storeCharChips(outputStore, ir);
    expect(chips).toHaveLength(1);
    expect(chips[0]!.action).toBe('disabled');
    expect(chips[0]!.disabledReason).toMatch(/pairing/i);
  });

  it('drop: an unpaired any()-source store maps every char chip to drop', () => {
    const inputStore = makeChipStore('store#in', 'inX', [
      { kind: 'char', value: 'a' },
      { kind: 'char', value: 'b' },
    ]);
    const rule: IRRule = {
      nodeId: 'rule#1',
      context: [{ kind: 'any', storeRef: 'inX' }],
      output: [{ kind: 'char', value: 'z' }],
    };
    const ir = makeIR({ groups: [irGroup({ nodeId: 'g1', rules: [rule] })], stores: [inputStore] });

    const chips = storeCharChips(inputStore, ir);
    expect(chips).toHaveLength(2);
    chips.forEach((c) => {
      expect(c.action).toBe('drop');
      expect(c.disabledReason).toBeUndefined();
    });
  });

  it('drop: a store entirely unreferenced by any rule maps every char chip to drop', () => {
    const unusedStore = makeChipStore('store#unused', 'unusedX', [{ kind: 'char', value: 'q' }]);
    const ir = makeIR({ stores: [unusedStore] });

    const chips = storeCharChips(unusedStore, ir);
    expect(chips).toHaveLength(1);
    expect(chips[0]!.action).toBe('drop');
  });

  it('disabled (system-store): an isSystem store maps every char chip to disabled with a plain-language reason', () => {
    const systemStore = makeChipStore('store#sys', '&SYSTEM_STORE', [{ kind: 'char', value: 's' }], { isSystem: true });
    const ir = makeIR({ stores: [systemStore] });

    const chips = storeCharChips(systemStore, ir);
    expect(chips).toHaveLength(1);
    expect(chips[0]!.action).toBe('disabled');
    expect(chips[0]!.disabledReason).toMatch(/system store/i);
  });

  it('disabled (notany-widens): a store referenced by notany() maps every char chip to disabled with the widen-matching reason', () => {
    const store = makeChipStore('store#notany', 'notanyX', [{ kind: 'char', value: 'n' }]);
    const rule: IRRule = {
      nodeId: 'rule#1',
      context: [{ kind: 'notany', storeRef: 'notanyX' }],
      output: [{ kind: 'char', value: 'z' }],
    };
    const ir = makeIR({ groups: [irGroup({ nodeId: 'g1', rules: [rule] })], stores: [store] });

    const chips = storeCharChips(store, ir);
    expect(chips).toHaveLength(1);
    expect(chips[0]!.action).toBe('disabled');
    expect(chips[0]!.disabledReason).toMatch(/notany/i);
  });

  it('disabled (context-index-aligned): a store referenced by index() in a rule context maps to disabled with the alignment reason', () => {
    const store = makeChipStore('store#ctxidx', 'ctxIdxX', [{ kind: 'char', value: 'c' }]);
    const rule: IRRule = {
      nodeId: 'rule#1',
      context: [{ kind: 'index', storeRef: 'ctxIdxX', offset: 0 }],
      output: [{ kind: 'char', value: 'z' }],
    };
    const ir = makeIR({ groups: [irGroup({ nodeId: 'g1', rules: [rule] })], stores: [store] });

    const chips = storeCharChips(store, ir);
    expect(chips).toHaveLength(1);
    expect(chips[0]!.action).toBe('disabled');
    expect(chips[0]!.disabledReason).toMatch(/position/i);
  });

  it('drop (cross-paired): an any()-source store whose SAME rule pairs it to an output index() resolves to a coordinated drop, not a block', () => {
    // Former "paired-input" block reason — replaced by the pairing graph:
    // resolving index(pairedOutX, 1) to the rule's own any(pairedInX) context
    // element ties the two stores into one pair-set, so a slot removal on
    // either splices both at the same position (coordinated drop) rather than
    // being refused outright.
    const inputStore = makeChipStore('store#paired-in', 'pairedInX', [{ kind: 'char', value: 'p' }]);
    const outputStore = makeChipStore('store#paired-out', 'pairedOutX', [{ kind: 'char', value: 'o' }]);
    const rule: IRRule = {
      nodeId: 'rule#1',
      context: [{ kind: 'any', storeRef: 'pairedInX' }],
      output: [{ kind: 'index', storeRef: 'pairedOutX', offset: 1 }],
    };
    const ir = makeIR({ groups: [irGroup({ nodeId: 'g1', rules: [rule] })], stores: [inputStore, outputStore] });

    const chips = storeCharChips(inputStore, ir);
    expect(chips).toHaveLength(1);
    expect(chips[0]!.action).toBe('drop');
    expect(chips[0]!.disabledReason).toBeUndefined();
  });

  it('disabled (unresolved-index-pairing): a store that is both an index()-output target (unresolved) and an any() source in a DIFFERENT rule stays blocked', () => {
    // Former "dual-use" block reason — the pairing graph can only resolve an
    // index() output against an any() source in the SAME rule, so a store
    // whose any()-source usage lives in a separate rule from its index()
    // output still can't be proven safe; it stays blocked, now under the
    // unresolved-index-pairing reason rather than a coarse dual-use label.
    const store = makeChipStore('store#dual', 'dualX', [{ kind: 'char', value: 'd' }]);
    const outRule: IRRule = {
      nodeId: 'rule#out',
      context: [{ kind: 'vkey', name: 'K_A', modifiers: [] }],
      output: [{ kind: 'index', storeRef: 'dualX', offset: 1 }],
    };
    const sourceRule: IRRule = {
      nodeId: 'rule#src',
      context: [{ kind: 'any', storeRef: 'dualX' }],
      output: [{ kind: 'char', value: 'z' }],
    };
    const ir = makeIR({ groups: [irGroup({ nodeId: 'g1', rules: [outRule, sourceRule] })], stores: [store] });

    const chips = storeCharChips(store, ir);
    expect(chips).toHaveLength(1);
    expect(chips[0]!.action).toBe('disabled');
    expect(chips[0]!.disabledReason).toMatch(/pairing/i);
  });

  it('omitted (input-only-match-table, Backspace-repair shape): a store matched only by a Backspace-triggered rule produces NO chips at all — never a disabled chip (#533 carve gallery over-count)', () => {
    const composed = makeChipStore('store#composed', 'composed', [{ kind: 'char', value: 'à' }]);
    const compDia = makeChipStore('store#comp-dia', 'comp-dia', [{ kind: 'char', value: 'a' }]);
    const rule: IRRule = {
      nodeId: 'rule#bksp',
      context: [
        { kind: 'any', storeRef: 'composed' },
        { kind: 'raw', text: '+' },
        { kind: 'vkey', name: 'K_BKSP', modifiers: [] },
      ],
      output: [{ kind: 'index', storeRef: 'comp-dia', offset: 1 }],
    };
    const ir = makeIR({ groups: [irGroup({ nodeId: 'g1', rules: [rule] })], stores: [composed, compDia] });

    expect(storeCharChips(composed, ir)).toEqual([]);
    // The real output store is unaffected — still a normal drop chip.
    const dkChips = storeCharChips(compDia, ir);
    expect(dkChips).toHaveLength(1);
    expect(dkChips[0]!.action).toBe('drop');
  });

  it('omitted (input-only-match-table, bare "context" guard shape): a store matched only by a no-op guard rule produces NO chips at all (#533 sibling site)', () => {
    const diablock = makeChipStore('store#diablock', 'diablock', [{ kind: 'char', value: '°' }]);
    const rule: IRRule = {
      nodeId: 'rule#guard',
      context: [
        { kind: 'any', storeRef: 'diablock' },
        { kind: 'raw', text: '+' },
        { kind: 'vkey', name: 'K_C', modifiers: ['RALT'] },
      ],
      output: [{ kind: 'raw', text: 'context' }],
    };
    const ir = makeIR({ groups: [irGroup({ nodeId: 'g1', rules: [rule] })], stores: [diablock] });

    expect(storeCharChips(diablock, ir)).toEqual([]);
  });
});

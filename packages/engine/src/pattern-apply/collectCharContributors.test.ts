// Tests for collectCharContributors and ruleProducedStrings (cascade-delete contributor discovery, issue #886)

import { describe, it, expect } from 'vitest';
import type { KeyboardIR, IRRule, IRStore } from '@keyboard-studio/contracts';
import { ruleProducedStrings } from '@keyboard-studio/contracts';
import { collectCharContributors } from './collectCharContributors.js';

// ---------------------------------------------------------------------------
// Fixture helpers
// ---------------------------------------------------------------------------

function makeIR(overrides: Partial<KeyboardIR> = {}): KeyboardIR {
  return {
    origin: 'imported',
    header: { keyboardId: 'test', name: 'Test', bcp47: [], copyright: '', version: '1.0', targets: [], storeDirectives: [] },
    stores: [],
    groups: [],
    comments: [],
    raw: [],
    recognizedPatterns: [],
    ...overrides,
  } as KeyboardIR;
}

function makeStore(nodeId: string, name: string, items: IRStore['items']): IRStore {
  return { nodeId, name, items, isSystem: false };
}

function makeRule(nodeId: string, context: IRRule['context'], output: IRRule['output'], ownedByPattern?: string): IRRule {
  const r: IRRule = { nodeId, context, output };
  if (ownedByPattern !== undefined) r.ownedByPattern = ownedByPattern;
  return r;
}

// ---------------------------------------------------------------------------
// ruleProducedStrings (unit)
// ---------------------------------------------------------------------------

describe('ruleProducedStrings', () => {
  it('returns empty array for an empty output', () => {
    const rule = makeRule('r1', [], []);
    expect(ruleProducedStrings(rule, new Map())).toEqual([]);
  });

  it('returns the NFC char for a single char output', () => {
    const rule = makeRule('r1', [], [{ kind: 'char', value: 'a' }]);
    expect(ruleProducedStrings(rule, new Map())).toEqual(['a']);
  });

  it('merges consecutive chars into an NFC run', () => {
    // 'e' + U+0301 (combining acute) → 'é' (NFC)
    const rule = makeRule('r1', [], [
      { kind: 'char', value: 'e' },
      { kind: 'char', value: '́' },
    ]);
    const result = ruleProducedStrings(rule, new Map());
    expect(result).toEqual(['é']); // é
  });

  it('expands index() store items individually', () => {
    const store = makeStore('sid', 'outStore', [
      { kind: 'char', value: 'a' },
      { kind: 'char', value: 'b' },
    ]);
    const rule = makeRule('r1', [], [{ kind: 'index', storeRef: 'outStore', offset: 1 }]);
    const result = ruleProducedStrings(rule, new Map([['outStore', store]]));
    expect(result).toEqual(['a', 'b']);
  });

  it('expands outs() store items individually', () => {
    const store = makeStore('sid', 'outStore', [{ kind: 'char', value: 'x' }]);
    const rule = makeRule('r1', [], [{ kind: 'outs', storeRef: 'outStore' }]);
    const result = ruleProducedStrings(rule, new Map([['outStore', store]]));
    expect(result).toEqual(['x']);
  });

  it('skips deadkey, beep, and raw elements', () => {
    const rule = makeRule('r1', [], [
      { kind: 'deadkey', id: 1 },
      { kind: 'beep' },
      { kind: 'raw', text: 'nul' },
    ]);
    expect(ruleProducedStrings(rule, new Map())).toEqual([]);
  });

  it('skips non-char store items (vkey, deadkey)', () => {
    const store = makeStore('sid', 'S', [
      { kind: 'char', value: 'a' },
      { kind: 'vkey', name: 'K_A' },
    ]);
    const rule = makeRule('r1', [], [{ kind: 'index', storeRef: 'S', offset: 1 }]);
    const result = ruleProducedStrings(rule, new Map([['S', store]]));
    expect(result).toEqual(['a']); // vkey skipped
  });
});

// ---------------------------------------------------------------------------
// Cameroon-shaped fixture (S-02 deadkey + any/index pair)
//
//   Trigger rule: + dk(003b) > dk(0x003b)     -- output is deadkey → excluded
//   Fan-out rule: dk(003b) any(dkf) > index(dkt, 2)  -- one slot per output char
// ---------------------------------------------------------------------------

function makeCameroonIR(): KeyboardIR {
  const inputStore = makeStore('sid-dkf', 'dkf003b', [
    { kind: 'char', value: 'a' },
    { kind: 'char', value: 'e' },
    { kind: 'char', value: 'ε' }, // ε (Greek small letter epsilon)
  ]);
  const outputStore = makeStore('sid-dkt', 'dkt003b', [
    { kind: 'char', value: 'à' }, // à
    { kind: 'char', value: 'é' }, // é
    { kind: 'char', value: 'ε' }, // ε
  ]);
  const triggerRule = makeRule('r-trigger',
    [{ kind: 'vkey', name: 'K_SEMICOLON', modifiers: [] }],
    [{ kind: 'deadkey', id: 0x003b }], // triggers deadkey — must be excluded
    'p1',
  );
  const fanOutRule = makeRule('r-fanout',
    [{ kind: 'deadkey', id: 0x003b }, { kind: 'any', storeRef: 'dkf003b' }],
    [{ kind: 'index', storeRef: 'dkt003b', offset: 2 }],
    'p1',
  );
  return makeIR({
    stores: [inputStore, outputStore],
    groups: [{
      nodeId: 'g1', name: 'main', usingKeys: true, readonly: false,
      rules: [triggerRule, fanOutRule],
    }],
    recognizedPatterns: [{
      id: 'p1', title: 'Cameroon S-02', origin: 'recognized',
      ownedNodes: [
        { kind: 'rule', nodeId: 'r-trigger' },
        { kind: 'rule', nodeId: 'r-fanout' },
      ],
      description: '', category: 'substitute',
      appliesTo: [], strategyId: 'S-02',
    }],
  });
}

// ---------------------------------------------------------------------------
// collectCharContributors — integration tests
// ---------------------------------------------------------------------------

describe('collectCharContributors', () => {
  it('returns empty arrays for a character not produced by any rule', () => {
    const ir = makeCameroonIR();
    const result = collectCharContributors(ir, 'z');
    expect(result.ruleNodeIds).toHaveLength(0);
    expect(result.storeSlotIds).toHaveLength(0);
    expect(result.blocked).toHaveLength(0);
  });

  it('S-01 direct-char rule: whole-rule delete for single-char output', () => {
    const rule = makeRule('r-s01',
      [{ kind: 'vkey', name: 'K_A', modifiers: [] }],
      [{ kind: 'char', value: 'a' }],
    );
    const ir = makeIR({
      groups: [{ nodeId: 'g1', name: 'main', usingKeys: true, readonly: false, rules: [rule] }],
    });
    const result = collectCharContributors(ir, 'a');
    expect(result.ruleNodeIds).toContain('r-s01');
    expect(result.storeSlotIds).toHaveLength(0);
    expect(result.blocked).toHaveLength(0);
  });

  it('S-02 fan-out: finds the matching slot in the output store (not the trigger rule)', () => {
    const ir = makeCameroonIR();
    // ε is at index 2 of dkt003b
    const result = collectCharContributors(ir, 'ε');
    // Must NOT contain the trigger rule (r-trigger)
    expect(result.ruleNodeIds).not.toContain('r-trigger');
    // Must NOT contain the fan-out rule as a whole-rule delete
    expect(result.ruleNodeIds).not.toContain('r-fanout');
    // Must contain the store slot for ε (index 2)
    expect(result.storeSlotIds).toContain('sid-dkt#2');
    // Location should include the store
    expect(result.locations.some((l) => l.kind === 'store')).toBe(true);
  });

  it('S-02 fan-out: does not nul other slots (only the matching one)', () => {
    const ir = makeCameroonIR();
    const resultE = collectCharContributors(ir, 'ε'); // ε at slot 2
    expect(resultE.storeSlotIds).toHaveLength(1);
    expect(resultE.storeSlotIds[0]).toBe('sid-dkt#2');
  });

  it('multi-char producer goes to blocked (not ruleNodeIds)', () => {
    // A rule whose output is two chars "ab" — not a whole-char single-char producer
    const rule = makeRule('r-multi',
      [{ kind: 'vkey', name: 'K_A', modifiers: [] }],
      [{ kind: 'char', value: 'a' }, { kind: 'char', value: 'b' }],
    );
    const ir = makeIR({
      groups: [{ nodeId: 'g1', name: 'main', usingKeys: true, readonly: false, rules: [rule] }],
    });
    const result = collectCharContributors(ir, 'a');
    expect(result.ruleNodeIds).not.toContain('r-multi');
    expect(result.blocked.length).toBeGreaterThan(0);
  });

  it('index() over a large store yields the matching SLOT, never a blocked whole-rule (regression #886)', () => {
    // A base-layer fan-out rule `+ any(keys) > index(alphabet, 1)` produces the
    // WHOLE alphabet. Removing one char must target its store slot, not flag the
    // rule as an un-removable multi-char producer (the original ghost-message bug).
    const keys = makeStore('sid-keys', 'keys', [
      { kind: 'char', value: 'a' }, { kind: 'char', value: 'e' }, { kind: 'char', value: 'z' },
    ]);
    const alphabet = makeStore('sid-alpha', 'alphabet', [
      { kind: 'char', value: 'a' }, { kind: 'char', value: 'ɛ' }, { kind: 'char', value: 'z' },
    ]);
    const rule = makeRule('r-base',
      [{ kind: 'any', storeRef: 'keys' }],
      [{ kind: 'index', storeRef: 'alphabet', offset: 1 }],
    );
    const ir = makeIR({
      stores: [keys, alphabet],
      groups: [{ nodeId: 'g1', name: 'main', usingKeys: true, readonly: false, rules: [rule] }],
    });
    const result = collectCharContributors(ir, 'ɛ');
    expect(result.storeSlotIds).toContain('sid-alpha#1');
    expect(result.ruleNodeIds).toHaveLength(0);
    expect(result.blocked).toHaveLength(0);
  });

  it('opaque RawKmnFragment producing target char (output side of `>`) goes to blocked', () => {
    const ir = makeIR({
      raw: [{
        nodeId: 'frag-1',
        origin: 'imported',
        sourceText: '+ [K_E] > ε',
        reason: 'call/return',
      }],
    });
    const result = collectCharContributors(ir, 'ε');
    expect(result.blocked.some((b) => b.reason.includes('Opaque fragment'))).toBe(true);
  });

  it('opaque RawKmnFragment mentioning target only on the INPUT side is NOT blocked', () => {
    // The char appears before `>` (a match target), not as output — the fragment
    // does not produce it, so it must not raise a false "cannot remove" warning.
    const ir = makeIR({
      raw: [{
        nodeId: 'frag-1',
        origin: 'imported',
        sourceText: 'ε + [K_A] > "x"',
        reason: 'call/return',
      }],
    });
    const result = collectCharContributors(ir, 'ε');
    expect(result.blocked).toHaveLength(0);
  });

  it('opaque RawKmnFragment NOT containing target char is not in blocked', () => {
    const ir = makeIR({
      raw: [{
        nodeId: 'frag-1',
        origin: 'imported',
        sourceText: 'some other text',
        reason: 'call/return',
      }],
    });
    const result = collectCharContributors(ir, 'ε');
    expect(result.blocked).toHaveLength(0);
  });

  it('S-02 trigger rule (output is deadkey) is never in ruleNodeIds or storeSlotIds', () => {
    const ir = makeCameroonIR();
    // The trigger rule outputs a deadkey — never a contributor regardless of target
    const result = collectCharContributors(ir, 'a');
    expect(result.ruleNodeIds).not.toContain('r-trigger');
  });

  it('RAlt-plane rule producing same char as an S-01 rule is still found (capability-agnostic)', () => {
    // Simulates a misclassified RAlt duplicate: same output 'a' but ralt modifier
    const ralt = makeRule('r-ralt',
      [{ kind: 'vkey', name: 'K_A', modifiers: ['RALT'] }],
      [{ kind: 'char', value: 'a' }],
    );
    const s01 = makeRule('r-s01',
      [{ kind: 'vkey', name: 'K_A', modifiers: [] }],
      [{ kind: 'char', value: 'a' }],
    );
    const ir = makeIR({
      groups: [{ nodeId: 'g1', name: 'main', usingKeys: true, readonly: false, rules: [s01, ralt] }],
    });
    const result = collectCharContributors(ir, 'a');
    expect(result.ruleNodeIds).toContain('r-ralt');
    expect(result.ruleNodeIds).toContain('r-s01');
  });

  it('returns the targetChar NFC-normalized', () => {
    // Pass NFD é (e + combining acute), get back NFC é
    const nfd = 'é';
    const ir = makeIR();
    const result = collectCharContributors(ir, nfd);
    expect(result.targetChar).toBe('é');
  });
});

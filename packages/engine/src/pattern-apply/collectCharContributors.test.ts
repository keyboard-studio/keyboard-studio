// Tests for collectCharContributors (cascade-delete contributor discovery, issue #886)

import { describe, it, expect } from 'vitest';
import type { KeyboardIR, IRRule, IRStore } from '@keyboard-studio/contracts';
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

  it('S-02 fan-out: does not nul other slots (only the matching ones, output AND input)', () => {
    const ir = makeCameroonIR();
    // ε is at index 2 of BOTH the output store (dkt003b) and the any()-consumed
    // input store (dkf003b) — "remove everywhere" (#525 v2) finds both, and
    // only those two slots (no other index nul'd).
    const resultE = collectCharContributors(ir, 'ε'); // ε at slot 2
    expect(resultE.storeSlotIds).toHaveLength(2);
    expect(resultE.storeSlotIds).toContain('sid-dkt#2');
    expect(resultE.storeSlotIds).toContain('sid-dkf#2');
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

  // ---------------------------------------------------------------------------
  // "Remove everywhere" (#525 v2) — any()-consumed INPUT store occurrences
  // ---------------------------------------------------------------------------

  it('finds a char in an any()-consumed INPUT store (Cameroon dkf-shaped: dk(X) any(dkf) > index(dkt,2))', () => {
    const ir = makeCameroonIR();
    // 'a' is at index 0 of the INPUT store dkf003b (sid-dkf), and at index 0
    // of the OUTPUT store dkt003b (as 'à', not 'a' — so only the input slot matches).
    const result = collectCharContributors(ir, 'a');
    expect(result.storeSlotIds).toContain('sid-dkf#0');
  });

  it('finds a char in an any()-consumed INPUT store that is ALSO the output store name (self-paired idiom)', () => {
    // `any(word) + [K_SPACE] > index(word, 1)` — self-paired: the same store name
    // is both the any() source and the index() target. Both the input occurrence
    // (via any()) and the output occurrence (via index()) must be found.
    const word = makeStore('sid-word', 'word', [
      { kind: 'char', value: 'a' }, { kind: 'char', value: 'b' },
    ]);
    const rule = makeRule('r-selfpair',
      [{ kind: 'any', storeRef: 'word' }],
      [{ kind: 'index', storeRef: 'word', offset: 1 }],
    );
    const ir = makeIR({
      stores: [word],
      groups: [{ nodeId: 'g1', name: 'main', usingKeys: true, readonly: false, rules: [rule] }],
    });
    const result = collectCharContributors(ir, 'a');
    // Same slot id from both the input-scan and output-scan passes — deduped to one entry.
    expect(result.storeSlotIds).toEqual(['sid-word#0']);
  });

  it('does NOT collect a char that only appears in a notany() context store', () => {
    const store = makeStore('sid-excl', 'exclSet', [
      { kind: 'char', value: 'a' }, { kind: 'char', value: 'b' },
    ]);
    const rule = makeRule('r-notany',
      [{ kind: 'notany', storeRef: 'exclSet' }],
      [{ kind: 'char', value: 'z' }],
    );
    const ir = makeIR({
      stores: [store],
      groups: [{ nodeId: 'g1', name: 'main', usingKeys: true, readonly: false, rules: [rule] }],
    });
    const result = collectCharContributors(ir, 'a');
    expect(result.storeSlotIds).toHaveLength(0);
    expect(result.ruleNodeIds).toHaveLength(0);
  });

  it('finds an INPUT-store occurrence even when the same rule\'s output is unrelated (composed-shaped: any(composed) + [K_BKSP] > index(comp-dia,1))', () => {
    const composed = makeStore('sid-composed', 'composed', [
      { kind: 'char', value: 'à' }, { kind: 'char', value: 'é' },
    ]);
    const compDia = makeStore('sid-compdia', 'comp-dia', [
      { kind: 'char', value: 'a' }, { kind: 'char', value: 'e' },
    ]);
    const rule = makeRule('r-bksp',
      [
        { kind: 'any', storeRef: 'composed' },
        { kind: 'raw', text: '+' },
        { kind: 'vkey', name: 'K_BKSP', modifiers: [] },
      ],
      [{ kind: 'index', storeRef: 'comp-dia', offset: 1 }],
    );
    const ir = makeIR({
      stores: [composed, compDia],
      groups: [{ nodeId: 'g1', name: 'main', usingKeys: true, readonly: false, rules: [rule] }],
    });
    const result = collectCharContributors(ir, 'à');
    expect(result.storeSlotIds).toContain('sid-composed#0');
  });

  it('returns the targetChar NFC-normalized', () => {
    // Pass NFD é (e + combining acute), get back NFC é
    const nfd = 'é';
    const ir = makeIR();
    const result = collectCharContributors(ir, nfd);
    expect(result.targetChar).toBe('é');
  });
});

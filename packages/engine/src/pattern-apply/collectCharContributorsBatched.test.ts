// Differential tests for collectCharContributorsBatched (issue #2406):
// the batched core must return, per target character, EXACTLY what the
// historical per-character collectCharContributors returns for that
// character — one rule pass instead of one pass per character.

import { describe, it, expect } from 'vitest';
import type { KeyboardIR, IRRule, IRStore } from '@keyboard-studio/contracts';
import {
  collectCharContributors,
  collectCharContributorsBatched,
} from './collectCharContributors.js';
import { irGroup, makeTestIR } from '@keyboard-studio/contracts/fixtures';

function makeStore(nodeId: string, name: string, items: IRStore['items']): IRStore {
  return { nodeId, name, items, isSystem: false };
}

function makeRule(
  nodeId: string,
  context: IRRule['context'],
  output: IRRule['output'],
  ownedByPattern?: string,
): IRRule {
  const r: IRRule = { nodeId, context, output };
  if (ownedByPattern !== undefined) r.ownedByPattern = ownedByPattern;
  return r;
}

// ---------------------------------------------------------------------------
// Composite fixture exercising every branch of the batched core:
//
//   r-lit-full     K_A > 'ä'                       fully-tainted literal output
//   r-lit-partial  K_B > 'äb'                      partially-tainted literal:
//                                                    blocked for 'ä' (kept 'b'
//                                                    stranded), whole-rule
//                                                    delete for 'b'
//   r-lit-other    K_C > 'ç'                       unrelated literal
//   r-trigger      + dk(003b) > dk(0x003b)         trigger rule — excluded
//   r-fanout       dk(003b) any(dkf) > index(dkt,2) deadkey fan-out, store slots
//   r-bksp         any(composed) + K_BKSP > index(comp-dia,1)  correction rule
//   r-notany       notany(exclSet) > 'z'            notany hygiene nomination
//   store junk     UNREFERENCED, contains 'ä'       section-3 sweep
//   frag-1         opaque RawKmnFragment producing 'ε'  blocked attribution
// ---------------------------------------------------------------------------

function makeCompositeIR(): KeyboardIR {
  const dkf = makeStore('sid-dkf', 'dkf003b', [
    { kind: 'char', value: 'a' },
    { kind: 'char', value: 'e' },
    { kind: 'char', value: 'ε' },
  ]);
  const dkt = makeStore('sid-dkt', 'dkt003b', [
    { kind: 'char', value: 'à' },
    { kind: 'char', value: 'é' },
    { kind: 'char', value: 'ε' },
  ]);
  const composed = makeStore('sid-composed', 'composed', [
    { kind: 'char', value: 'à' },
    { kind: 'char', value: 'é' },
  ]);
  const compDia = makeStore('sid-compdia', 'comp-dia', [
    { kind: 'char', value: 'a' },
    { kind: 'char', value: 'e' },
  ]);
  const excl = makeStore('sid-excl', 'exclSet', [
    { kind: 'char', value: 'ä' },
    { kind: 'char', value: 'b' },
  ]);
  const junk = makeStore('sid-junk', 'junk', [
    { kind: 'char', value: 'ä' },
    { kind: 'char', value: 'q' },
  ]);
  const rules = [
    makeRule(
      'r-lit-full',
      [{ kind: 'vkey', name: 'K_A', modifiers: [] }],
      [{ kind: 'char', value: 'ä' }],
    ),
    makeRule(
      'r-lit-partial',
      [{ kind: 'vkey', name: 'K_B', modifiers: [] }],
      [{ kind: 'char', value: 'ä' }, { kind: 'char', value: 'b' }],
    ),
    makeRule(
      'r-lit-other',
      [{ kind: 'vkey', name: 'K_C', modifiers: [] }],
      [{ kind: 'char', value: 'ç' }],
    ),
    makeRule(
      'r-trigger',
      [{ kind: 'vkey', name: 'K_SEMICOLON', modifiers: [] }],
      [{ kind: 'deadkey', id: 0x003b }],
      'p1',
    ),
    makeRule(
      'r-fanout',
      [
        { kind: 'deadkey', id: 0x003b },
        { kind: 'any', storeRef: 'dkf003b' },
      ],
      [{ kind: 'index', storeRef: 'dkt003b', offset: 2 }],
      'p1',
    ),
    makeRule(
      'r-bksp',
      [
        { kind: 'any', storeRef: 'composed' },
        { kind: 'raw', text: '+' },
        { kind: 'vkey', name: 'K_BKSP', modifiers: [] },
      ],
      [{ kind: 'index', storeRef: 'comp-dia', offset: 1 }],
    ),
    makeRule(
      'r-notany',
      [{ kind: 'notany', storeRef: 'exclSet' }],
      [{ kind: 'char', value: 'z' }],
    ),
  ];
  return makeTestIR({
    stores: [dkf, dkt, composed, compDia, excl, junk],
    groups: [irGroup({ nodeId: 'g1', rules })],
    recognizedPatterns: [
      {
        id: 'p1',
        title: 'Cameroon S-02',
        origin: 'recognized',
        ownedNodes: [
          { kind: 'rule', nodeId: 'r-trigger' },
          { kind: 'rule', nodeId: 'r-fanout' },
        ],
        description: '',
        category: 'substitute',
        appliesTo: [],
        strategyId: 'S-02',
      },
    ],
    raw: [
      {
        nodeId: 'frag-1',
        origin: 'imported',
        sourceText: '+ [K_E] > ε',
        producedOutput: [{ kind: 'char', value: 'ε' }],
        reason: 'call/return',
      },
    ],
  });
}

const TARGETS = ['ä', 'b', 'ç', 'à', 'é', 'ε', 'a', 'e', 'q', 'z', 'ü'];

describe('collectCharContributorsBatched', () => {
  it('returns one record per target, identical to collectCharContributors per character', () => {
    const ir = makeCompositeIR();
    const batched = collectCharContributorsBatched(ir, new Set(TARGETS));
    expect([...batched.keys()].sort()).toEqual([...new Set(TARGETS)].sort());
    for (const ch of TARGETS) {
      const single = collectCharContributors(ir, ch);
      const rec = batched.get(ch);
      expect(rec, `missing record for ${ch}`).toBeDefined();
      expect(rec).toEqual(single);
    }
  });

  it('matches on a batch in one call, including characters with no contributors', () => {
    const ir = makeCompositeIR();
    const batched = collectCharContributorsBatched(ir, new Set(['ü']));
    expect(batched.get('ü')).toEqual(collectCharContributors(ir, 'ü'));
    expect(batched.get('ü')?.ruleNodeIds).toHaveLength(0);
    expect(batched.get('ü')?.storeSlotIds).toHaveLength(0);
  });

  it('empty target set → empty map', () => {
    const ir = makeCompositeIR();
    expect(collectCharContributorsBatched(ir, new Set()).size).toBe(0);
  });

  it('spot-checks the exercised branches on the composite fixture', () => {
    const ir = makeCompositeIR();
    const batched = collectCharContributorsBatched(ir, new Set(TARGETS));
    // 'ä': fully-tainted literal rule r-lit-full nominates the whole rule;
    // r-lit-partial ('äb') is blocked — kept 'b' is stranded (produced only there).
    expect(batched.get('ä')?.ruleNodeIds).toContain('r-lit-full');
    expect(batched.get('ä')?.blocked.length).toBeGreaterThan(0);
    // 'b': r-lit-partial ('äb') is blocked — kept 'ä' is stranded there
    // (buildProducerIndex counts only whole-run literal producers, so 'ä'
    // has exactly one: r-lit-full — but that doesn't cover the 'äb' run).
    expect(batched.get('b')?.ruleNodeIds).not.toContain('r-lit-partial');
    expect(batched.get('b')?.blocked.some((b) => b.label.includes('r-lit-partial'))).toBe(true);
    // 'à': deadkey fan-out slot + correction-rule deconstruction slot.
    expect(batched.get('à')?.storeSlotIds).toContain('sid-dkt#0');
    expect(batched.get('à')?.storeSlotIds).toContain('sid-composed#0');
    // 'ä': notany hygiene slot + unreferenced-store sweep slot.
    expect(batched.get('ä')?.storeSlotIds).toContain('sid-excl#0');
    expect(batched.get('ä')?.storeSlotIds).toContain('sid-junk#0');
    // 'ε': opaque fragment → blocked attribution.
    expect(batched.get('ε')?.blocked.some((b) => b.reason.includes('Opaque fragment'))).toBe(true);
    // 'q': only via the unreferenced-store sweep.
    expect(batched.get('q')?.storeSlotIds).toEqual(['sid-junk#1']);
  });
});

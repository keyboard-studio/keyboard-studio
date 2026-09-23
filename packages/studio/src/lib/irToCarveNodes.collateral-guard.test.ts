// Tests for the spec 051 recommendedRemovalChars collateral guard in irToCarveNodes.ts.
//
// Shared IR builders: ./__fixtures__/irToCarveNodes.ts.

import { describe, it, expect } from 'vitest';
import type { IRRule, IRStore, KeyboardIR } from '@keyboard-studio/contracts';
import { recommendedRemovalChars } from './irToCarveNodes.ts';
import { irGroup } from '@keyboard-studio/contracts/fixtures';
import { makeIR } from './__fixtures__/irToCarveNodes.ts';

// ---------------------------------------------------------------------------
// The collateral guard is a CONJUNCTION, not "any needed partner" (spec 051)
//
// contracts/collateral-guard.md G1/G2/G9. Cameroon QWERTY's grave-accent pair:
// trimming the surplus `ɨ` resolves partner slot `dkf0060#1`, which holds the
// needed `i`. `dkf0060` is any()-CONSUMED — an input store — so `i` is not
// produced there and the shield must lift. `i` stays typeable through its own
// `+ [K_I] > 'i'` rule (FR-004).
// ---------------------------------------------------------------------------

/**
 * Cameroon-shaped grave-accent fixture.
 *
 * @param outputChars the OUTPUT store's items (what the deadkey emits)
 * @param inputChars  the INPUT store's items (what you type after the deadkey)
 * @param baseChars   characters that also get their own `+ [K_x] > 'c'` rule
 */
function makeGraveAccentIR(
  outputChars: string[],
  inputChars: string[],
  baseChars: string[],
): KeyboardIR {
  const baseRules: IRRule[] = baseChars.map((ch, i) => ({
    nodeId: `rule#base-${i}`,
    context: [{ kind: 'vkey', name: `K_${ch.toUpperCase()}`, modifiers: [] }],
    output: [{ kind: 'char', value: ch }],
  }));
  return makeIR({
    stores: [
      { nodeId: 'store#dkf', name: 'dkf0060', items: inputChars.map((v) => ({ kind: 'char', value: v })), isSystem: false } as IRStore,
      { nodeId: 'store#dkt', name: 'dkt0060', items: outputChars.map((v) => ({ kind: 'char', value: v })), isSystem: false } as IRStore,
    ],
    groups: [irGroup({
      nodeId: 'g1',
      rules: [
        ...baseRules,
        {
          nodeId: 'rule#fanout',
          context: [{ kind: 'deadkey', id: 0x0060 }, { kind: 'any', storeRef: 'dkf0060' }],
          output: [{ kind: 'index', storeRef: 'dkt0060', offset: 2 }],
        },
      ],
    })],
  });
}

describe('collateral guard — input partner never shields (spec 051 US1)', () => {
  it('G1: proposes the surplus ɨ even though its coordinated partner slot holds the needed i', () => {
    // dkt0060 = [à, ɨ, ù]; dkf0060 = [a, i, u]. Orthography needs a/i/u/à/ù but NOT ɨ.
    const ir = makeGraveAccentIR(['à', 'ɨ', 'ù'], ['a', 'i', 'u'], ['a', 'i', 'u']);
    const needed = new Set(['a', 'i', 'u', 'à', 'ù']);

    const result = recommendedRemovalChars({ ir, needed });

    expect(result.map((r) => r.ch)).toContain('ɨ');
    // The needed characters are never candidates.
    expect(result.map((r) => r.ch)).not.toContain('i');
    expect(result.map((r) => r.ch)).not.toContain('à');
  });

  it('G1: the ɨ proposal resolves to the OUTPUT store slot, tagged with the producing role', () => {
    const ir = makeGraveAccentIR(['à', 'ɨ', 'ù'], ['a', 'i', 'u'], ['a', 'i', 'u']);
    const needed = new Set(['a', 'i', 'u', 'à', 'ù']);

    const proposal = recommendedRemovalChars({ ir, needed }).find((r) => r.ch === 'ɨ');

    expect(proposal).toBeDefined();
    expect(proposal!.contributors.storeSlotIds).toEqual(['store#dkt#1']);
    expect(proposal!.contributors.storeSlots).toEqual([{ slotId: 'store#dkt#1', role: 'output' }]);
  });

  it("G2: the base `+ [K_I] > 'i'` rule is NOT a contributor to the ɨ trim (FR-004)", () => {
    const ir = makeGraveAccentIR(['à', 'ɨ', 'ù'], ['a', 'i', 'u'], ['a', 'i', 'u']);
    const needed = new Set(['a', 'i', 'u', 'à', 'ù']);

    const proposal = recommendedRemovalChars({ ir, needed }).find((r) => r.ch === 'ɨ')!;

    // Only the output-store slot is touched — no rule delete, so `+ [K_I] > 'i'`
    // survives the splice and `i` stays produced.
    expect(proposal.contributors.ruleNodeIds).toEqual([]);
  });
});

// ---------------------------------------------------------------------------
// The guard is NARROWED, not removed (spec 051 US2)
//
// contracts/collateral-guard.md's truth table, rows 2-5, plus the shields that
// must be unchanged. The whole point of FR-003 is that a trim which really
// would leave a needed character unproducible STILL warns.
// ---------------------------------------------------------------------------

/**
 * Chained cross-pair: S2 is an index() OUTPUT target in rule 1 and an any()
 * INPUT source in rule 2, so its pair set reaches an OUTPUT store (S3).
 * Trimming S2's char therefore has an OUTPUT partner — the only shape in which
 * a coordinated drop can genuinely lose a produced character.
 *
 *   rule#1: dk(1) any(S1) > index(S2, 2)
 *   rule#2: dk(2) any(S2) > index(S3, 2)
 */
function makeChainedPairIR(extraRules: IRRule[] = []): KeyboardIR {
  return makeIR({
    stores: [
      { nodeId: 'store#s1', name: 'S1', items: [{ kind: 'char', value: 'a' }], isSystem: false } as IRStore,
      { nodeId: 'store#s2', name: 'S2', items: [{ kind: 'char', value: 'X' }], isSystem: false } as IRStore,
      { nodeId: 'store#s3', name: 'S3', items: [{ kind: 'char', value: 'Y' }], isSystem: false } as IRStore,
    ],
    groups: [irGroup({
      nodeId: 'g1',
      rules: [
        { nodeId: 'rule#1', context: [{ kind: 'deadkey', id: 1 }, { kind: 'any', storeRef: 'S1' }], output: [{ kind: 'index', storeRef: 'S2', offset: 2 }] },
        { nodeId: 'rule#2', context: [{ kind: 'deadkey', id: 2 }, { kind: 'any', storeRef: 'S2' }], output: [{ kind: 'index', storeRef: 'S3', offset: 2 }] },
        ...extraRules,
      ],
    })],
  });
}

/** `+ [K_Y] > 'Y'` — a second, independent producer of the needed Y. */
const secondYProducer: IRRule = {
  nodeId: 'rule#y',
  context: [{ kind: 'vkey', name: 'K_Y', modifiers: [] }],
  output: [{ kind: 'char', value: 'Y' }],
};

describe('collateral guard — truth table (spec 051 US2)', () => {
  it('G3 (row 5): SHIELDS when the needed partner is an OUTPUT store and has no other producer', () => {
    const ir = makeChainedPairIR();
    const result = recommendedRemovalChars({ ir, needed: new Set(['Y']) });

    // Trimming X would splice S3 at the same index and take the needed Y with
    // it — Y has no other producer, so it would become untypeable.
    expect(result.map((r) => r.ch)).not.toContain('X');
  });

  it('G4 (row 4): does NOT shield when the same needed character has a second producer', () => {
    const ir = makeChainedPairIR([secondYProducer]);
    const result = recommendedRemovalChars({ ir, needed: new Set(['Y']) });

    expect(result.map((r) => r.ch)).toContain('X');
  });

  it('row 3: does NOT shield when the needed partner is an any()-consumed INPUT store', () => {
    const ir = makeGraveAccentIR(['à', 'ɨ', 'ù'], ['a', 'i', 'u'], ['a', 'i', 'u']);
    const result = recommendedRemovalChars({ ir, needed: new Set(['a', 'i', 'u', 'à', 'ù']) });
    expect(result.map((r) => r.ch)).toContain('ɨ');
  });

  it('G5 (row 2): a self-paired store has no partner and is unchanged by the narrowing', () => {
    // Cameroon's `word` idiom — any(word) and index(word) in the SAME rule, so
    // coordinatedWith is [] and the guard can never fire (invariant D5).
    const ir = makeIR({
      stores: [{ nodeId: 'store#word', name: 'word', items: [{ kind: 'char', value: 'a' }, { kind: 'char', value: 'ɛ' }], isSystem: false } as IRStore],
      groups: [irGroup({
        nodeId: 'g1',
        rules: [{ nodeId: 'rule#self', context: [{ kind: 'any', storeRef: 'word' }], output: [{ kind: 'index', storeRef: 'word', offset: 1 }] }],
      })],
    });

    const result = recommendedRemovalChars({ ir, needed: new Set(['a']) });

    expect(result.map((r) => r.ch)).toContain('ɛ');
  });

  it('G6 (FR-009): returns [] when the needed set is empty — no signal before the orthography resolves', () => {
    expect(recommendedRemovalChars({ ir: makeChainedPairIR(), needed: new Set() })).toEqual([]);
  });

  it('G7: digits, punctuation and symbols stay shielded by isAlwaysKeepCategory', () => {
    const ir = makeIR({
      groups: [irGroup({
        nodeId: 'g1',
        rules: [
          { nodeId: 'rule#digit', context: [{ kind: 'vkey', name: 'K_1', modifiers: [] }], output: [{ kind: 'char', value: '1' }] },
          { nodeId: 'rule#punct', context: [{ kind: 'vkey', name: 'K_COMMA', modifiers: [] }], output: [{ kind: 'char', value: ',' }] },
          { nodeId: 'rule#symbol', context: [{ kind: 'vkey', name: 'K_4', modifiers: [] }], output: [{ kind: 'char', value: '$' }] },
          { nodeId: 'rule#letter', context: [{ kind: 'vkey', name: 'K_Z', modifiers: [] }], output: [{ kind: 'char', value: 'ʒ' }] },
        ],
      })],
    });

    const result = recommendedRemovalChars({ ir, needed: new Set(['q']) }).map((r) => r.ch);

    expect(result).toContain('ʒ'); // a surplus letter is still proposed
    expect(result).not.toContain('1');
    expect(result).not.toContain(',');
    expect(result).not.toContain('$');
  });

  it('G8: an opaque-fragment producer is still shielded by the blocked check, BEFORE the producer test', () => {
    const ir = makeIR({
      groups: [irGroup({
        nodeId: 'g1',
        rules: [{ nodeId: 'rule#z', context: [{ kind: 'vkey', name: 'K_Z', modifiers: [] }], output: [{ kind: 'char', value: 'ʒ' }] }],
      })],
      raw: [{
        nodeId: 'raw#1',
        reason: 'if-guard',
        sourceText: "if(&layer = 'x') + [K_Z] > 'ʒ'",
        producedOutput: [{ kind: 'char', value: 'ʒ' }],
      }] as unknown as KeyboardIR['raw'],
    });

    // 'ʒ' is surplus and has a simple rule producer, but an opaque fragment also
    // emits it (structurally, via producedOutput) — the codec cannot confirm
    // what that fragment does, so shield.
    expect(recommendedRemovalChars({ ir, needed: new Set(['q']) }).map((r) => r.ch)).not.toContain('ʒ');
  });
});

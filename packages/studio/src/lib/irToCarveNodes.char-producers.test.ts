// Tests for charProducers, and its parity with the engine's collectCharContributors in irToCarveNodes.ts.
//
// Shared IR builders: ./__fixtures__/irToCarveNodes.ts.

import { describe, it, expect } from 'vitest';
import type { IRRule, KeyboardIR } from '@keyboard-studio/contracts';
import { buildProducedSet } from '@keyboard-studio/contracts';
import { triggerKeyLabel, charProducers, isTouchOnlyVkeyName } from './irToCarveNodes.ts';
import { collectCharContributors, parseSlotId, isPlusSeparator } from '@keyboard-studio/engine';
import { makeGroup, makeStore, makeIR } from './__fixtures__/irToCarveNodes.ts';

// ---------------------------------------------------------------------------
// charProducers — partial-cluster inclusion is not a "way to type it"
// (#1399 follow-on)
// ---------------------------------------------------------------------------

describe('charProducers — partial-cluster inclusion is excluded, not a phantom entry', () => {
  it('does not list a producer whose literal output only PARTIALLY contains the target char', () => {
    // A key that outputs a longer literal cluster containing 'a' is not a
    // way to type 'a' alone — no producer, real or unrenderable, for it.
    const clusterRule: IRRule = {
      nodeId: 'r-cluster',
      context: [{ kind: 'vkey', name: 'K_X', modifiers: [] }],
      output: [{ kind: 'char', value: 'abcd' }],
    };
    const realRule: IRRule = {
      nodeId: 'r-real',
      context: [{ kind: 'vkey', name: 'K_A', modifiers: ['SHIFT'] }],
      output: [{ kind: 'char', value: 'a' }],
    };
    const ir = makeIR({ groups: [makeGroup([clusterRule, realRule])] });

    expect(charProducers(ir, 'a')).toEqual([{ steps: ['Shift + a'] }]);
  });

  it('returns an empty list when the only rule mentioning the char is a partial-cluster inclusion', () => {
    const clusterRule: IRRule = {
      nodeId: 'r-cluster-only',
      context: [{ kind: 'vkey', name: 'K_X', modifiers: [] }],
      output: [{ kind: 'char', value: 'abcd' }],
    };
    const ir = makeIR({ groups: [makeGroup([clusterRule])] });

    expect(charProducers(ir, 'b')).toEqual([]);
  });
});

// ---------------------------------------------------------------------------
// charProducers — touch-only (T_xxxx) trigger vkeys never surface as a
// desktop "how it's typed" step (#1399 follow-on)
// ---------------------------------------------------------------------------

describe('charProducers — a touch-only (T_xxxx) trigger vkey is dropped, never leaked as a step', () => {
  it('drops a producer whose sole trigger is a touch-only vkey while keeping the real desktop producer', () => {
    // Mirrors the real sil_cameroon_qwerty shape: `;` is produced both by a
    // real desktop chord (RAlt + ;) and by a touch-layout-only virtual key
    // (`+ [T_003B] > ';'`) that has no physical desktop key behind it.
    const desktopRule: IRRule = {
      nodeId: 'r-desktop',
      context: [{ kind: 'vkey', name: 'K_COLON', modifiers: ['RALT'] }],
      output: [{ kind: 'char', value: ';' }],
    };
    const touchRule: IRRule = {
      nodeId: 'r-touch',
      context: [{ kind: 'vkey', name: 'T_003B', modifiers: [] }],
      output: [{ kind: 'char', value: ';' }],
    };
    const ir = makeIR({ groups: [makeGroup([desktopRule, touchRule])] });

    expect(charProducers(ir, ';')).toEqual([{ steps: ['AltGr + ;'] }]);
  });

  it('drops a touch-only-trigger producer entirely (not floored, not banned) when it is the ONLY rule for the char', () => {
    const touchOnlyRule: IRRule = {
      nodeId: 'r-touch-only',
      context: [{ kind: 'vkey', name: 'T_0300', modifiers: [] }],
      output: [{ kind: 'char', value: '̀' }],
    };
    const ir = makeIR({ groups: [makeGroup([touchOnlyRule])] });

    expect(charProducers(ir, '̀')).toEqual([]);
  });

  it('never resolves a touch-only vkey name to a label via vkeyLabel-based helpers (triggerKeyLabel floor)', () => {
    // A rule whose trigger is touch-only must not leak "T_0300" as a
    // TOTAL-FLOOR trigger string either — triggerKeyLabel only resolves a
    // trigger after a real "+" separator, and even then must not name a
    // touch-only vkey.
    const ctx: IRRule['context'] = [
      { kind: 'any', storeRef: 'diablock' },
      { kind: 'raw', text: '+' },
      { kind: 'vkey', name: 'T_0300', modifiers: [] },
    ];
    expect(triggerKeyLabel(ctx)).toBeUndefined();
  });
});

// ---------------------------------------------------------------------------
// charProducers <-> collectCharContributors parity (unguarded duplication
// risk flagged in review).
//
// Both functions walk the SAME rules/stores to answer DIFFERENT questions:
//   - collectCharContributors (engine) = "which rules/slots, if DELETED,
//     would stop this character being produced?" — capability-agnostic,
//     used by cascadeDelete.
//   - charProducers (this file) = "how would a user TYPE this character on a
//     DESKTOP keyboard?" — a display-only re-walk that additionally excludes
//     two shapes collectCharContributors correctly keeps as removable:
//       (i)  a "self-permutation" reorder — an index() output pointing back
//            at the SAME store it matched as any() input (tryProduceStoreMatch,
//            ~line 1731-1738 above) — a reorder, not a way to type, but still
//            a perfectly valid thing to delete.
//       (ii) a touch-only-triggered rule (isTouchOnlyTriggerRule, ~line
//            1659) — no desktop keystroke exists for a T_xxxx trigger, but
//            deleting that rule is still a valid, capability-agnostic removal.
//   Deleting either kind of rule is safe; SHOWING it as "how to type it"
//   would be misleading. That's why the divergence is intentional, not
//   drift — but it must be EXACTLY these two shapes, or a real bug is
//   silently hiding behind "well, they're allowed to differ sometimes."
//
// CharProducer carries no rule/slot id (it's a rendering-only shape), so the
// display side of the comparison is expressed as a COUNT against the
// resolved, exception-adjusted removal-id set rather than a literal id
// diff — the exception predicates below are structural replicas of the two
// guards named above (not exported from production code, so replicated
// here at rule granularity, each with a comment pointing at its source).
// ---------------------------------------------------------------------------

describe('charProducers <-> collectCharContributors parity (no unguarded drift beyond the two documented display-only exclusions)', () => {
  // Representative fixture: store-output fan-out + a real deadkey trigger,
  // TWO independent literal producers of the same character (so the
  // multi-contributor case is exercised, not just 1-vs-1 coincidence), a
  // touch-only-triggered literal producer, and a self-permutation reorder
  // rule over its own store.
  const dkTrigger: IRRule = {
    nodeId: 'r-dk-trigger',
    context: [{ kind: 'vkey', name: 'K_GRAVE', modifiers: [] }],
    output: [{ kind: 'deadkey', id: 1 }],
  };
  const fanout: IRRule = {
    nodeId: 'r-fanout',
    context: [{ kind: 'deadkey', id: 1 }, { kind: 'any', storeRef: 'dkf' }],
    output: [{ kind: 'index', storeRef: 'dkt', offset: 2 }],
  };
  const literal1: IRRule = { nodeId: 'r-literal1', context: [{ kind: 'vkey', name: 'K_L', modifiers: [] }], output: [{ kind: 'char', value: 'l' }] };
  const literal2: IRRule = { nodeId: 'r-literal2', context: [{ kind: 'vkey', name: 'K_M', modifiers: [] }], output: [{ kind: 'char', value: 'l' }] };
  const touchOnly: IRRule = { nodeId: 'r-touch', context: [{ kind: 'vkey', name: 'T_0057', modifiers: [] }], output: [{ kind: 'char', value: 'w' }] };
  const selfPerm: IRRule = { nodeId: 'r-selfperm', context: [{ kind: 'any', storeRef: 'perm' }], output: [{ kind: 'index', storeRef: 'perm', offset: 1 }] };

  const parityIR = makeIR({ groups: [makeGroup([dkTrigger, fanout, literal1, literal2, touchOnly, selfPerm])], stores: [
      makeStore('dkf', 'store#dkf', { items: ['a', 'i', 'u'].map((v) => ({ kind: 'char' as const, value: v })) }),
      makeStore('dkt', 'store#dkt', { items: ['á', 'í', 'ú'].map((v) => ({ kind: 'char' as const, value: v })) }),
      makeStore('perm', 'store#perm', { items: ['x', 'y', 'z'].map((v) => ({ kind: 'char' as const, value: v })) }),
    ] });

  /**
   * Structural replica of tryProduceStoreMatch's self-permutation guard
   * (irToCarveNodes.ts, ~line 1731-1738): true when `rule` has an index()
   * output element pointing back at the SAME store matched by an any() at
   * that element's own context offset. Not exported from production code
   * (the guard is inlined per-output-element); replicated at rule
   * granularity here since the fixture never overlaps two such rules on one
   * store.
   */
  function isSelfPermutationRule(rule: IRRule): boolean {
    const effCtx = rule.context.filter((el) => !isPlusSeparator(el));
    return rule.output.some((el) => {
      if (el.kind !== 'index' || el.storeRef === undefined) return false;
      const targetEl = effCtx[el.offset - 1];
      return targetEl !== undefined && targetEl.kind === 'any' && targetEl.storeRef === el.storeRef;
    });
  }

  /**
   * Structural replica of isTouchOnlyTriggerRule (irToCarveNodes.ts, ~line
   * 1629-1648: ruleTriggerVkey + isTouchOnlyTriggerRule). Not exported (the
   * shape-check helper is internal); rebuilt here from the exported
   * `isTouchOnlyVkeyName` primitive.
   */
  function isTouchOnlyRuleLocal(rule: IRRule): boolean {
    const ctx = rule.context;
    const plusIdx = ctx.findIndex(isPlusSeparator);
    const triggerEl = plusIdx === -1 ? (ctx.length === 1 ? ctx[0] : undefined) : ctx[plusIdx + 1];
    return triggerEl !== undefined && triggerEl.kind === 'vkey' && isTouchOnlyVkeyName(triggerEl.name);
  }

  /** Resolve the rule that "owns" a collectCharContributors id (a bare rule nodeId, or a store-slot id whose store is targeted by exactly one rule's index()/outs() output in this fixture). */
  function owningRule(id: string, ir: KeyboardIR): IRRule | undefined {
    const rulesByNodeId = new Map(ir.groups.flatMap((g) => g.rules).map((r) => [r.nodeId, r]));
    const direct = rulesByNodeId.get(id);
    if (direct !== undefined) return direct;
    const parsed = parseSlotId(id);
    if (parsed === null) return undefined;
    const store = ir.stores.find((s) => s.nodeId === parsed.storeNodeId);
    if (store === undefined) return undefined;
    return ir.groups.flatMap((g) => g.rules).find((r) => r.output.some((el) => (el.kind === 'index' || el.kind === 'outs') && el.storeRef === store.name));
  }

  it('for every character the fixture produces: (1) charProducers never claims more producers than collectCharContributors knows about, and (2) every removal contributor collectCharContributors finds but charProducers omits is explained by exactly the self-permutation guard or the touch-only-trigger exclusion', () => {
    const produced = buildProducedSet(parityIR);
    expect(produced.size).toBeGreaterThan(0); // sanity: the fixture is not accidentally empty

    for (const ch of produced) {
      const removalIds = new Set([
        ...collectCharContributors(parityIR, ch).ruleNodeIds,
        ...collectCharContributors(parityIR, ch).storeSlotIds,
      ]);
      const exceptionIds = new Set(
        [...removalIds].filter((id) => {
          const rule = owningRule(id, parityIR);
          return rule !== undefined && (isSelfPermutationRule(rule) || isTouchOnlyRuleLocal(rule));
        }),
      );
      const nonExceptionCount = removalIds.size - exceptionIds.size;
      const displayCount = charProducers(parityIR, ch).length;

      // Invariant 1 — no phantom display-only producer: charProducers must
      // never surface more entries than removal knows about in total.
      expect(displayCount, `char ${ch}: charProducers must not exceed collectCharContributors' known contributor count`).toBeLessThanOrEqual(removalIds.size);
      // Invariant 2 — every non-excepted removal contributor IS shown, and
      // nothing else is: the two documented exclusions fully explain the gap.
      expect(displayCount, `char ${ch}: unexplained divergence beyond the self-permutation guard / touch-only exclusion`).toBe(nonExceptionCount);
    }

    // Confirm the fixture actually exercises both exceptions (a vacuous
    // exceptionIds set would let invariant 2 pass without testing anything).
    const wRemovalIds = [...collectCharContributors(parityIR, 'w').ruleNodeIds];
    const permRemovalIds = [...collectCharContributors(parityIR, 'x').storeSlotIds];
    expect(wRemovalIds.some((id) => isTouchOnlyRuleLocal(owningRule(id, parityIR)!))).toBe(true);
    expect(permRemovalIds.some((id) => isSelfPermutationRule(owningRule(id, parityIR)!))).toBe(true);
  });
});

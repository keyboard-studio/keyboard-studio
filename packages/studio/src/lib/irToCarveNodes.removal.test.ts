// Tests for removal proposals: isSimpleRemovableRule and recommendedRemovalChars in irToCarveNodes.ts.
//
// Shared IR builders: ./__fixtures__/irToCarveNodes.ts.

import { describe, it, expect } from 'vitest';
import type { IRStore, KeyboardIR, PlacementWorklist } from '@keyboard-studio/contracts';
import { makeConfirmedAlphabet } from '@keyboard-studio/contracts';
import { recommendedRemovalChars, isSimpleRemovableRule } from './irToCarveNodes.ts';
import { collectCharContributors, deriveCarveNeededSet } from '@keyboard-studio/engine';
import { loadLangtags } from './langtagsDefaults.ts';
import { irGroup } from '@keyboard-studio/contracts/fixtures';
import { makeCharOnlyRule, makeGroup, makeIR } from './__fixtures__/irToCarveNodes.ts';

// ---------------------------------------------------------------------------
// isSimpleRemovableRule — #525 BANNER slice allowlist predicate
// ---------------------------------------------------------------------------

describe('isSimpleRemovableRule', () => {
  it('returns true for a bare vkey-context, single-char-output rule', () => {
    expect(isSimpleRemovableRule({
      nodeId: 'r1',
      context: [{ kind: 'vkey', name: 'K_Z', modifiers: [] }],
      output: [{ kind: 'char', value: 'z' }],
    })).toBe(true);
  });

  it('returns true for a bare char-context, single-char-output rule', () => {
    expect(isSimpleRemovableRule(makeCharOnlyRule())).toBe(true);
  });

  it('returns false when context has a deadkey element', () => {
    expect(isSimpleRemovableRule({
      nodeId: 'r2',
      context: [{ kind: 'deadkey', id: 1 }, { kind: 'char', value: 'a' }],
      output: [{ kind: 'char', value: 'à' }],
    })).toBe(false);
  });

  it('returns false when context is an any() element', () => {
    expect(isSimpleRemovableRule({
      nodeId: 'r3',
      context: [{ kind: 'any', storeRef: 'S' }],
      output: [{ kind: 'char', value: 'z' }],
    })).toBe(false);
  });

  it('returns false when output is an index() element', () => {
    expect(isSimpleRemovableRule({
      nodeId: 'r4',
      context: [{ kind: 'vkey', name: 'K_Z', modifiers: [] }],
      output: [{ kind: 'index', storeRef: 'S', offset: 1 }],
    })).toBe(false);
  });

  it('returns false for a multi-element context (e.g. a platform() guard represented as an extra raw element)', () => {
    expect(isSimpleRemovableRule({
      nodeId: 'r5',
      context: [{ kind: 'raw', text: "platform('touch')" }, { kind: 'vkey', name: 'K_Z', modifiers: [] }],
      output: [{ kind: 'char', value: 'z' }],
    })).toBe(false);
  });

  it('returns false for a multi-element output (base+combining-mark run that NFC-composes to one glyph)', () => {
    expect(isSimpleRemovableRule({
      nodeId: 'r6',
      context: [{ kind: 'char', value: 'x' }],
      output: [{ kind: 'char', value: 'e' }, { kind: 'char', value: '́' }],
    })).toBe(false);
  });

  it('returns false when the rule is owned by a recognized pattern', () => {
    expect(isSimpleRemovableRule({
      nodeId: 'r7',
      context: [{ kind: 'vkey', name: 'K_Z', modifiers: [] }],
      output: [{ kind: 'char', value: 'z' }],
      ownedByPattern: 'pattern-1',
    })).toBe(false);
  });

  it("returns true for a single vkey-context rule carrying a modifier (e.g. [SHIFT K_A] > 'A') — modifiers live on the one vkey element and don't expand context.length, so shifted capitals are recommendable, not wrongly shielded", () => {
    expect(isSimpleRemovableRule({
      nodeId: 'r8',
      context: [{ kind: 'vkey', name: 'K_A', modifiers: ['SHIFT'] }],
      output: [{ kind: 'char', value: 'A' }],
    })).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// recommendedRemovalChars — #525 BANNER slice character-level signal
// ---------------------------------------------------------------------------

describe('recommendedRemovalChars', () => {
  it('recommends a surplus character produced only by a simple, direct rule', () => {
    const ir = makeIR({ groups: [makeGroup([makeCharOnlyRule()])] }); // produces 'y'

    const result = recommendedRemovalChars({ ir, needed: new Set(['q']) });

    expect(result.map((r) => r.ch)).toEqual(['y']);
  });

  it('shields a surplus character when ONE of its producing rules is a deadkey-context rule (not every producer is simple)', () => {
    const ir = makeIR({
      groups: [irGroup({
        nodeId: 'g1',
        rules: [
          { nodeId: 'rule-simple', context: [{ kind: 'char', value: 'x' }], output: [{ kind: 'char', value: 'y' }] },
          { nodeId: 'rule-dk', context: [{ kind: 'deadkey', id: 1 }, { kind: 'char', value: 'a' }], output: [{ kind: 'char', value: 'y' }] },
        ],
      })],
    });

    const result = recommendedRemovalChars({ ir, needed: new Set(['q']) });

    expect(result.map((r) => r.ch)).not.toContain('y');
  });

  it('recommends a surplus character produced through a RESOLVED any()-context / index()-output store fan-out rule (#931 NET UNLOCK — was blocked under the old dual-use contract)', () => {
    // The rule's own any(fan) context element resolves index(fan, 2)'s offset
    // (deadkey excluded from the '+' count but still occupies context slot 1,
    // so any(fan) at slot 2 is the pairing target) — a self-paired store, so
    // classifyStoreSlotEdit now returns 'drop', not 'blocked'. This is the
    // Cameroon-shaped case: a store that is both an any()-source and an
    // index()-output target in the SAME rule is exactly what the pairing
    // graph was built to unblock.
    const ir = makeIR({
      stores: [{ nodeId: 'store#fan', name: 'fan', items: [{ kind: 'char', value: 'a' }, { kind: 'char', value: 'y' }], isSystem: false } as IRStore],
      groups: [irGroup({
        nodeId: 'g1',
        rules: [{
          nodeId: 'rule-fanout',
          context: [{ kind: 'deadkey', id: 1 }, { kind: 'any', storeRef: 'fan' }],
          output: [{ kind: 'index', storeRef: 'fan', offset: 2 }],
        }],
      })],
    });

    const result = recommendedRemovalChars({ ir, needed: new Set(['q']) });

    expect(result.map((r) => r.ch)).toContain('y');
  });

  it('shields a surplus character produced through an UNRESOLVED index()-output store fan-out rule (offset does not resolve to an any() context source)', () => {
    const ir = makeIR({
      stores: [{ nodeId: 'store#fan2', name: 'fan2', items: [{ kind: 'char', value: 'a' }, { kind: 'char', value: 'y' }], isSystem: false } as IRStore],
      groups: [irGroup({
        nodeId: 'g1',
        rules: [{
          nodeId: 'rule-fanout2',
          context: [{ kind: 'deadkey', id: 1 }],
          output: [{ kind: 'index', storeRef: 'fan2', offset: 1 }],
        }],
      })],
    });

    const result = recommendedRemovalChars({ ir, needed: new Set(['q']) });

    expect(result.map((r) => r.ch)).not.toContain('y');
  });

  it('shields a surplus character produced via a store slot with an unresolved index() pairing (blocked)', () => {
    const ir = makeIR({
      stores: [{ nodeId: 'store#s', name: 'S', items: [{ kind: 'char', value: 'a' }, { kind: 'char', value: 'y' }], isSystem: false } as IRStore],
      groups: [{
        nodeId: 'g1', name: 'main', usingKeys: true, readonly: false,
        rules: [
          // any()-source reference to S (elsewhere in the rule set)...
          { nodeId: 'rule-source', context: [{ kind: 'any', storeRef: 'S' }], output: [{ kind: 'char', value: 'z' }] },
          // ...AND an index()-output reference to S whose OWN rule context has
          // no matching any(S) at the resolved offset — the pairing graph can't
          // prove the index() is safe, so it stays blocked (unresolved-index-pairing),
          // regardless of the unrelated any()-source usage in rule-source.
          { nodeId: 'rule-output', context: [{ kind: 'char', value: 'w' }], output: [{ kind: 'index', storeRef: 'S', offset: 1 }] },
        ],
      }],
    });

    const result = recommendedRemovalChars({ ir, needed: new Set(['q']) });

    expect(result.map((r) => r.ch)).not.toContain('y');
  });

  it("recommends a surplus character whose sole producer is a self-paired store slot, even though that SAME store also holds a needed character elsewhere (#525 v2 — the Cameroon `word`-store over-coarse-guard fix)", () => {
    const ir = makeIR({
      // S's index()-output resolves to this SAME rule's own any(S) context
      // element (self-pair) → classifyStoreSlotEdit returns 'drop' with
      // coordinatedWith: [] (no OTHER store to check at the same index) —
      // this is exactly the Cameroon `word`-store shape: one store, self-fed,
      // holding BOTH a surplus char ('y', at index 0) and a needed char ('q',
      // at index 1). Before the #525 v2 fix, the old store-level
      // storeFeedsConfirmedChar('S', ...) shield resolved index(S,1)'s output
      // to ALL of S's own items — including needed 'q' — and shielded EVERY
      // character S contributes to, including surplus 'y' at an UNRELATED
      // index. The narrower guard only shields when a PAIRED store's item at
      // the SAME index is needed; S has no partner, so 'y' is not shielded.
      stores: [{ nodeId: 'store#s', name: 'S', items: [{ kind: 'char', value: 'y' }, { kind: 'char', value: 'q' }], isSystem: false } as IRStore],
      groups: [irGroup({
        nodeId: 'g1',
        rules: [
          { nodeId: 'rule-fill', context: [{ kind: 'any', storeRef: 'S' }], output: [{ kind: 'index', storeRef: 'S', offset: 1 }] },
        ],
      })],
    });

    const result = recommendedRemovalChars({ ir, needed: new Set(['q']) });

    expect(result.map((r) => r.ch)).toContain('y');
  });

  it("shields a surplus character whose CROSS-paired partner store's same-index item IS a needed character (coordinatedDropHitsNeededChar guard fires — the positive branch the self-paired `word`-store test above doesn't cover), but recommends a sibling surplus character whose partner slot is NOT needed (proves the guard discriminates rather than blanket-shielding)", () => {
    // `dk(1) any(dkf) > index(dkt,2)` cross-pairs dkf<->dkt (mirrors the
    // Cameroon `dk(003b) any(dkf003b) > index(dkt003b,2)` idiom): dkf[0]='a'
    // aligns with dkt[0]='α', a needed char, so dropping dkf's slot 0 would
    // coordinately drop a needed char — 'a' is shielded. dkf[1]='b' aligns
    // with dkt[1]='β', NOT needed — 'b' is not shielded. A plain literal
    // rule also emits 'a'/'b' directly so both enter the produced set
    // (buildProducedSet only walks rule OUTPUT, never any()-context input
    // stores) — the surplus-ness under test lives on the INPUT store slot,
    // reached via collectCharContributors' any()-context scan.
    const ir = makeIR({
      stores: [
        { nodeId: 'store#dkf', name: 'dkf', items: [{ kind: 'char', value: 'a' }, { kind: 'char', value: 'b' }], isSystem: false } as IRStore,
        { nodeId: 'store#dkt', name: 'dkt', items: [{ kind: 'char', value: 'α' }, { kind: 'char', value: 'β' }], isSystem: false } as IRStore,
      ],
      groups: [irGroup({
        nodeId: 'g1',
        rules: [
          { nodeId: 'rule-lit-a', context: [{ kind: 'char', value: 'p' }], output: [{ kind: 'char', value: 'a' }] },
          { nodeId: 'rule-lit-b', context: [{ kind: 'char', value: 'q' }], output: [{ kind: 'char', value: 'b' }] },
          { nodeId: 'rule-fanout', context: [{ kind: 'deadkey', id: 1 }, { kind: 'any', storeRef: 'dkf' }], output: [{ kind: 'index', storeRef: 'dkt', offset: 2 }] },
        ],
      })],
    });

    const result = recommendedRemovalChars({ ir, needed: new Set(['α']) });

    expect(result.map((r) => r.ch)).not.toContain('a');
    expect(result.map((r) => r.ch)).toContain('b');
  });

  it('does not recommend an input-only character appearing only in an any()-consumed store (invariant D2b, spec 051 FR-002)', () => {
    // Characterization test — pins the existing correct behavior before touching
    // the collateral guard. The produced set (and thus the recommendation signal)
    // walks rule OUTPUTS + output-store slots only. An any()-consumed input store
    // is a trigger, not a producer — its characters are not produced and therefore
    // never proposed for trimming. This test mirrors T002's contracts-side
    // characterization of buildProducedSet.
    const ir = makeIR({
      stores: [
        { nodeId: 'store#inputOnly', name: 'inputOnly', items: [{ kind: 'char', value: 'x' }], isSystem: false } as IRStore,
      ],
      groups: [
        makeGroup([
          makeCharOnlyRule(), // produces 'y' (surplus)
          // Rule whose context any()-consumes inputOnly (x is an input trigger only)
          { nodeId: 'rule-with-any', context: [{ kind: 'any', storeRef: 'inputOnly' }], output: [{ kind: 'char', value: 'a' }] },
        ]),
      ],
    });

    const result = recommendedRemovalChars({ ir, needed: new Set(['q']) });

    // y and a are produced and surplus → should be in result if not shielded
    // x from the any()-consumed store is NOT produced → NOT recommended
    expect(result.map((r) => r.ch)).not.toContain('x');
  });

  it('does not recommend a character that IS in `needed`', () => {
    const ir = makeIR({ groups: [makeGroup([makeCharOnlyRule()])] }); // produces 'y'

    const result = recommendedRemovalChars({ ir, needed: new Set(['y']) });

    expect(result).toEqual([]);
  });

  it('returns [] when `needed` is empty (no signal yet)', () => {
    const ir = makeIR({ groups: [makeGroup([makeCharOnlyRule()])] });

    const result = recommendedRemovalChars({ ir, needed: new Set() });

    expect(result).toEqual([]);
  });

  it('shields a surplus character when an opaque fragment ALSO produces it (a blocked entry shields even alongside a simple rule producer)', () => {
    // collectCharContributors's opaque-fragment check walks `producedOutput`
    // structurally (not a sourceText scan — see collectCharContributors.ts's
    // doc comment), so the fragment needs a producedOutput sketch to be
    // attributed as a blocked producer of 'y' here.
    const ir = makeIR({
      groups: [makeGroup([makeCharOnlyRule()])], // produces surplus 'y' too, via a simple rule
      raw: [{
        nodeId: 'raw-1', reason: 'unsupported-syntax', sourceText: "+ [K_X] > 'y'",
        producedOutput: [{ kind: 'char', value: 'y' }],
      } as unknown as KeyboardIR['raw'][number]],
    });

    const result = recommendedRemovalChars({ ir, needed: new Set(['q']) });

    expect(result.map((r) => r.ch)).not.toContain('y');
  });

  it('shields a character a RawKmnFragment structurally produces via producedOutput, even though sourceText carries no literal output token', () => {
    // Fixed gap: collectCharContributors's opaque-fragment check now walks
    // `producedOutput` structurally (the same run-merge + store-resolution
    // element-walk `buildProducedSet` uses) rather than scanning `sourceText`
    // for the target char after a `>` — so a fragment whose codec-extracted
    // producedOutput sketch names 'y', but whose sourceText has no literal
    // 'y' token at all (dk(1) is a deadkey reference, not 'y'), is still
    // correctly found and attributed to `blocked` here — not left as an
    // "unrecognized shape, zero producers" default-safe shield.
    const ir = makeIR({
      raw: [{
        nodeId: 'raw-1', reason: 'unsupported-syntax', sourceText: "+ [K_X] > dk(1)",
        producedOutput: [{ kind: 'char', value: 'y' }],
      } as unknown as KeyboardIR['raw'][number]],
    });

    const contributors = collectCharContributors(ir, 'y');
    expect(contributors.blocked.some((b) => b.reason.includes('Opaque fragment'))).toBe(true);

    const result = recommendedRemovalChars({ ir, needed: new Set(['q']) });
    expect(result.map((r) => r.ch)).not.toContain('y');
  });

  it('is case-fold aware via isCharCoveredForLocale (French É vs needed é)', () => {
    const ir = makeIR({
      groups: [irGroup({
        nodeId: 'g1',
        rules: [{ nodeId: 'rule-e-acute', context: [{ kind: 'char', value: 'x' }], output: [{ kind: 'char', value: 'É' }] }],
      })],
    });

    const result = recommendedRemovalChars({ ir, needed: new Set(['é']), bcp47: 'fr' });

    expect(result).toEqual([]);
  });

  // #525 categorical never-remove guard — digits/punctuation/symbols are never
  // recommended for removal even when CLDR's language-specific exemplar tier
  // for the target language doesn't list them (e.g. Greek `el` omits ASCII
  // digits/punct), which would otherwise make them look surplus.
  describe('categorical never-remove guard (digits/punctuation/symbols)', () => {
    it.each([
      ['digit', '0'],
      ['period', '.'],
      ['comma', ','],
      ['dollar sign', '$'],
      ['plus sign', '+'],
      ['at sign', '@'],
    ])('does not recommend a surplus %s (%s) even when absent from `needed` and produced by a simple rule', (_label, ch) => {
      const ir = makeIR({
        groups: [irGroup({
          nodeId: 'g1',
          rules: [{ nodeId: 'rule-1', context: [{ kind: 'char', value: 'x' }], output: [{ kind: 'char', value: ch }] }],
        })],
      });

      const result = recommendedRemovalChars({ ir, needed: new Set(['q']) });

      expect(result.map((r) => r.ch)).not.toContain(ch);
    });

    it('still recommends a surplus LETTER — the categorical shield does not over-exclude letters/marks', () => {
      const ir = makeIR({ groups: [makeGroup([makeCharOnlyRule()])] }); // produces 'y'

      const result = recommendedRemovalChars({ ir, needed: new Set(['q']) });

      expect(result.map((r) => r.ch)).toEqual(['y']);
    });
  });

  // Post-#526 follow-on (product decision): a non-Latin target's base ASCII
  // Latin alphabet (desktop base-layout fall-through, spec 040) is no longer
  // hard-excluded from removal recommendations — it is tagged
  // `reason: 'cross-script-latin'` and surfaced as a separate, optional,
  // low-priority group instead (the banner's job), rather than silently kept.
  describe('cross-script ASCII Latin fall-through — optional, low-priority group (#526 follow-on)', () => {
    it('recommends surplus ASCII Latin on a Cyrillic (ru-Cyrl, explicit script subtag) target, tagged cross-script-latin', () => {
      const ir = makeIR({ groups: [makeGroup([makeCharOnlyRule()])] }); // produces 'y'

      const result = recommendedRemovalChars({ ir, needed: new Set(['q']), bcp47: 'ru-Cyrl' });

      const row = result.find((r) => r.ch === 'y');
      expect(row).toBeDefined();
      expect(row?.reason).toBe('cross-script-latin');
    });

    it('recommends surplus ASCII Latin on a bare "ru" target once langtags has resolved its Cyrillic default script (no explicit script subtag — exercises the getLoadedLangtags() fallback), tagged cross-script-latin', async () => {
      // Preload the module synchronously the same way the survey's IdentityLite
      // step already does before an author reaches Carve, so
      // getLoadedLangtags() inside targetScriptIsLatin resolves non-null here.
      await loadLangtags();
      const ir = makeIR({ groups: [makeGroup([makeCharOnlyRule()])] }); // produces 'y'

      const result = recommendedRemovalChars({ ir, needed: new Set(['q']), bcp47: 'ru' });

      const row = result.find((r) => r.ch === 'y');
      expect(row).toBeDefined();
      expect(row?.reason).toBe('cross-script-latin');
    });

    it('STILL recommends a surplus ASCII Latin letter on a Latin (bfd-Latn) target — no regression, and no cross-script-latin tag', () => {
      const ir = makeIR({ groups: [makeGroup([makeCharOnlyRule()])] }); // produces 'y'

      const result = recommendedRemovalChars({ ir, needed: new Set(['q']), bcp47: 'bfd-Latn' });

      const row = result.find((r) => r.ch === 'y');
      expect(row).toBeDefined();
      expect(row?.reason).toBeUndefined();
    });

    it('STILL recommends surplus ASCII Latin when bcp47 is unknown/empty — fail-open unchanged, no tag', () => {
      const ir = makeIR({ groups: [makeGroup([makeCharOnlyRule()])] }); // produces 'y'

      const result = recommendedRemovalChars({ ir, needed: new Set(['q']), bcp47: '' });

      const row = result.find((r) => r.ch === 'y');
      expect(row).toBeDefined();
      expect(row?.reason).toBeUndefined();
    });

    it('the primary (non-optional) subset excludes cross-script-latin rows — the banner-split contract', () => {
      const ir = makeIR({ groups: [makeGroup([makeCharOnlyRule()])] }); // produces 'y'

      const result = recommendedRemovalChars({ ir, needed: new Set(['q']), bcp47: 'ru-Cyrl' });
      const primary = result.filter((r) => r.reason !== 'cross-script-latin');

      expect(primary.map((r) => r.ch)).not.toContain('y');
    });

  });
});


// ---------------------------------------------------------------------------
// recommendedRemovalChars — form parameter (spec: carve output-form
// normalization) — PRECOMPOSED/DECOMPOSED pair, explicit \u escapes.
// ---------------------------------------------------------------------------

describe('recommendedRemovalChars — form parameter (spec: base-plus-mark drives NFD comparison)', () => {
  const PRECOMPOSED = '\u00e9'; // e-acute, single codepoint (NFC)
  const DECOMPOSED = '\u0065\u0301'; // e + combining acute accent (NFD)

  it('does NOT recommend a produced PRECOMPOSED char when the needed-set holds the DECOMPOSED sequence, under NFD', () => {
    const ir = makeIR({
      groups: [irGroup({ nodeId: 'g1', rules: [{
        nodeId: 'rule-precomposed', context: [{ kind: 'char', value: 'x' }], output: [{ kind: 'char', value: PRECOMPOSED }],
      }]})],
    });

    const result = recommendedRemovalChars({ ir, needed: new Set([DECOMPOSED]), form: 'NFD' });

    expect(result.map((r) => r.ch)).toEqual([]);
  });

  it('does NOT recommend a produced DECOMPOSED sequence when the needed-set holds the PRECOMPOSED char, under NFD', () => {
    const ir = makeIR({
      groups: [irGroup({ nodeId: 'g1', rules: [{
        nodeId: 'rule-decomposed', context: [{ kind: 'char', value: 'x' }], output: [{ kind: 'char', value: DECOMPOSED }],
      }]})],
    });

    const result = recommendedRemovalChars({ ir, needed: new Set([PRECOMPOSED]), form: 'NFD' });

    expect(result.map((r) => r.ch)).toEqual([]);
  });

  it('ready-made (NFC, the default) still recognizes a produced PRECOMPOSED char against a needed DECOMPOSED sequence as needed — existing behavior holds', () => {
    const ir = makeIR({
      groups: [irGroup({ nodeId: 'g1', rules: [{
        nodeId: 'rule-precomposed', context: [{ kind: 'char', value: 'x' }], output: [{ kind: 'char', value: PRECOMPOSED }],
      }]})],
    });

    // `form` omitted entirely — must default to 'NFC', byte-identical to the
    // pre-existing 3-argument call shape used everywhere else in this file.
    const result = recommendedRemovalChars({ ir, needed: new Set([DECOMPOSED]) });

    expect(result.map((r) => r.ch)).toEqual([]);
  });

  it('still recommends a genuinely surplus letter under NFD (form does not disable the surplus signal)', () => {
    const ir = makeIR({ groups: [makeGroup([makeCharOnlyRule()])] }); // produces 'y'

    const result = recommendedRemovalChars({ ir, needed: new Set([DECOMPOSED]), form: 'NFD' });

    expect(result.map((r) => r.ch)).toEqual(['y']);
  });
});

// ---------------------------------------------------------------------------
// recommendedRemovalChars — combining marks implied by a needed grapheme
// (#526 fix 3) are shielded even when only the composed grapheme, not the
// bare mark itself, is a literal `needed` member.
// ---------------------------------------------------------------------------

describe('recommendedRemovalChars — needed-implied combining mark guard (#526 fix 3)', () => {
  it('does NOT recommend a bare combining mark literal implied by a needed precomposed grapheme', () => {
    const ir = makeIR({
      groups: [{
        nodeId: 'g1', name: 'main', usingKeys: true, readonly: false,
        rules: [{ nodeId: 'rule-mark', context: [{ kind: 'char', value: 'x' }], output: [{ kind: 'char', value: '́' }] }], // bare combining acute
      }],
    });

    // 'á' (U+00E1) NFD-decomposes to 'a' + U+0301 — the mark is implied.
    const result = recommendedRemovalChars({ ir, needed: new Set(['á']) });

    expect(result.map((r) => r.ch)).not.toContain('́');
  });

  it('still recommends a combining mark NOT implied by any needed grapheme', () => {
    const ir = makeIR({
      groups: [{
        nodeId: 'g1', name: 'main', usingKeys: true, readonly: false,
        rules: [{ nodeId: 'rule-mark', context: [{ kind: 'char', value: 'x' }], output: [{ kind: 'char', value: '̃' }] }], // bare combining tilde — unrelated to 'á'
      }],
    });

    const result = recommendedRemovalChars({ ir, needed: new Set(['á']) }); // implies only U+0301, not U+0303

    expect(result.map((r) => r.ch)).toContain('̃');
  });
});

// ---------------------------------------------------------------------------
// recommendedRemovalChars — blockCandidateChars (#526 AC #3)
// ---------------------------------------------------------------------------

describe('recommendedRemovalChars — blockCandidateChars (#526 AC #3)', () => {
  it('surfaces a block-candidate grapheme (composed from PlacementWorklist.blockedCombinations via composeCombo) as a candidate, tagged reason "blocked-combination", when its rule shape passes the existing guards', () => {
    const ir = makeIR({
      groups: [irGroup({
        nodeId: 'g1',
        rules: [{ nodeId: 'rule-blocked-combo', context: [{ kind: 'char', value: 'x' }], output: [{ kind: 'char', value: 'é' }] }],
      })],
    });

    const result = recommendedRemovalChars({
      ir,
      needed: new Set(['q']), // 'é' absent — surplus
      blockCandidateChars: new Set(['é']),
    });

    expect(result.map((r) => r.ch)).toContain('é');
    expect(result.find((r) => r.ch === 'é')?.reason).toBe('blocked-combination');
  });

  it('does NOT tag an ordinary CLDR-surplus result with `reason` — only chars named via blockCandidateChars get it', () => {
    const ir = makeIR({ groups: [makeGroup([makeCharOnlyRule()])] }); // produces 'y'

    const result = recommendedRemovalChars({ ir, needed: new Set(['q']) });

    expect(result.map((r) => r.ch)).toEqual(['y']);
    expect(result[0]?.reason).toBeUndefined();
  });

  it('shields an ATTESTED combo even when it is also passed as a blockCandidateChars entry — needed still wins (conservative default: block-candidates never bypass the surplus check)', () => {
    const ir = makeIR({
      groups: [irGroup({
        nodeId: 'g1',
        rules: [{ nodeId: 'rule-attested-combo', context: [{ kind: 'char', value: 'x' }], output: [{ kind: 'char', value: 'é' }] }],
      })],
    });

    // 'é' is in `needed` (e.g. an attested stack landed it in requiredPrimary)
    // even though its base+mark pair is ALSO named in blockedCombinations —
    // exactly the "attested stack wins" shape carve-needed-set.test.ts pins.
    const result = recommendedRemovalChars({
      ir,
      needed: new Set(['é']),
      blockCandidateChars: new Set(['é']),
    });

    expect(result.map((r) => r.ch)).not.toContain('é');
  });

  it('degrade-when-absent: an empty (or omitted) blockCandidateChars produces byte-identical output to calling without the argument at all', () => {
    const ir = makeIR({
      groups: [{
        nodeId: 'g1', name: 'main', usingKeys: true, readonly: false,
        rules: [
          makeCharOnlyRule(), // produces surplus 'y'
          { nodeId: 'rule-dk', context: [{ kind: 'deadkey', id: 1 }, { kind: 'char', value: 'a' }], output: [{ kind: 'char', value: 'z' }] },
        ],
      }],
    });
    const needed = new Set(['q']);

    const withoutArg = recommendedRemovalChars({ ir, needed });
    const withEmptySet = recommendedRemovalChars({ ir, needed, blockCandidateChars: new Set() });

    expect(withEmptySet).toEqual(withoutArg);
  });

  it('a block-candidate whose sole producer is a deadkey-context rule is still shielded — block-candidates run through the SAME allowlist rule-shielding guard, not a shortcut around it', () => {
    const ir = makeIR({
      groups: [irGroup({
        nodeId: 'g1',
        rules: [
          { nodeId: 'rule-dk-combo', context: [{ kind: 'deadkey', id: 1 }, { kind: 'char', value: 'a' }], output: [{ kind: 'char', value: 'é' }] },
        ],
      })],
    });

    const result = recommendedRemovalChars({
      ir,
      needed: new Set(['q']),
      blockCandidateChars: new Set(['é']),
    });

    expect(result.map((r) => r.ch)).not.toContain('é');
  });

  it('a block-candidate whose sole producer is an opaque raw fragment is still shielded', () => {
    const ir = makeIR({
      raw: [{
        nodeId: 'raw-1', reason: 'unsupported-syntax', sourceText: "+ [K_X] > dk(1)",
        producedOutput: [{ kind: 'char', value: 'é' }],
      } as unknown as KeyboardIR['raw'][number]],
    });

    const result = recommendedRemovalChars({
      ir,
      needed: new Set(['q']),
      blockCandidateChars: new Set(['é']),
    });

    expect(result.map((r) => r.ch)).not.toContain('é');
  });

  it('a block-candidate grapheme with NO producer at all in the IR is shielded (default-safe — nothing to remove)', () => {
    const ir = makeIR({ groups: [makeGroup([makeCharOnlyRule()])] }); // produces only 'y'

    const result = recommendedRemovalChars({
      ir,
      needed: new Set(['q']),
      blockCandidateChars: new Set(['é']), // never produced anywhere in this IR
    });

    expect(result.map((r) => r.ch)).not.toContain('é');
    expect(result.map((r) => r.ch)).toEqual(['y']);
  });
});

// ---------------------------------------------------------------------------
// #526 AC #2 regression — carve must never recommend removing a reachable
// productive-mark combo, even when CLDR would call it surplus. No new
// production logic backs this (see deriveCarveNeededSet's optionalSecondary
// tier + useCarveNeededSet's union into neededSet); this test pins the
// existing wiring end-to-end so a future refactor can't silently regress it.
// ---------------------------------------------------------------------------

describe('#526 AC #2 regression — productive-mark reachable combo is never recommended for removal', () => {
  it('a reachable base+mark combo for a PRODUCTIVE mark lands in deriveCarveNeededSet.optionalSecondary, and once unioned into `needed` (as useCarveNeededSet does), recommendedRemovalChars never proposes it — even though a CLDR-only needed-set (without this union) would call it surplus', () => {
    const ACUTE = '́';
    const alphabet = makeConfirmedAlphabet({
      bases: ['a', 'e'],
      marks: [ACUTE],
    });
    const worklist: PlacementWorklist = {
      ownLetterUnits: ['a', 'e'],
      markUnits: [{ mark: ACUTE, inputOrder: 'postfix' }], // productive
      blockedCombinations: [],
    };
    const carveNeeded = deriveCarveNeededSet({ alphabet, worklist });
    expect(carveNeeded.optionalSecondary.has('á')).toBe(true); // reachable combo, productive class

    // A bare CLDR exemplar set for this (hypothetical) language does not list
    // 'á' at all — this is the "CLDR would call it surplus" premise.
    const cldrOnlyNeeded = new Set(['a', 'e']);
    expect(cldrOnlyNeeded.has('á')).toBe(false);

    // The real pipeline (useCarveNeededSet) unions optionalSecondary into
    // `neededSet` before recommendedRemovalChars ever sees it.
    const neededSet = new Set([...cldrOnlyNeeded, ...carveNeeded.requiredPrimary, ...carveNeeded.optionalSecondary]);

    const ir = makeIR({
      groups: [{
        nodeId: 'g1', name: 'main', usingKeys: true, readonly: false,
        // Deadkey-composed, exactly how a productive mark's reachable combo
        // is actually produced — isSimpleRemovableRule would reject this rule
        // shape too, but the needed-set union is the shield under test here.
        rules: [{ nodeId: 'rule-a-acute', context: [{ kind: 'deadkey', id: 1 }, { kind: 'char', value: 'a' }], output: [{ kind: 'char', value: 'á' }] }],
      }],
    });

    const result = recommendedRemovalChars({ ir, needed: neededSet });

    expect(result.map((r) => r.ch)).not.toContain('á');
  });
});

// ---------------------------------------------------------------------------
// recommendedRemovalChars — paired proposal-row granularity (spec 051 T026,
// FR-014, contracts/case-pairing.md "Proposal-row granularity"). Fixture pair
// is 'ǝ' U+01DD LATIN SMALL LETTER TURNED E <-> 'Ǝ' U+018E LATIN CAPITAL
// LETTER REVERSED E — the same grounded fold carveCasePairs.test.ts uses.
// Deliberately NOT 'ə' U+0259 (which uppercases to 'Ə' U+018F, a DIFFERENT
// pair) — see carveCasePairs.ts's module doc for why the spec's own
// Latin-a/Greek-alpha example likewise doesn't hold and isn't reused here.
// ---------------------------------------------------------------------------

describe('recommendedRemovalChars — paired proposal rows (spec 051 FR-014)', () => {
  it('folds two independently-surplus case-group members into ONE row, not two', () => {
    const ir = makeIR({
      groups: [irGroup({
        nodeId: 'g1',
        rules: [
          { nodeId: 'rule-lower', context: [{ kind: 'vkey', name: 'K_1', modifiers: [] }], output: [{ kind: 'char', value: 'ǝ' }] },
          { nodeId: 'rule-upper', context: [{ kind: 'vkey', name: 'K_2', modifiers: [] }], output: [{ kind: 'char', value: 'Ǝ' }] },
        ],
      })],
    });

    const result = recommendedRemovalChars({ ir, needed: new Set(['q']) });

    expect(result).toHaveLength(1);
    expect(result[0]?.ch).toBe('ǝ'); // lowercase member survives
    expect(result[0]?.caseGroup).toEqual(['Ǝ', 'ǝ']); // sorted by code point: U+018E before U+01DD
  });

  it('leaves caseGroup undefined when the character has no counterpart in the produced set', () => {
    const ir = makeIR({ groups: [makeGroup([makeCharOnlyRule()])] }); // produces 'y', no case counterpart produced

    const result = recommendedRemovalChars({ ir, needed: new Set(['q']) });

    expect(result.map((r) => r.ch)).toEqual(['y']);
    expect(result[0]?.caseGroup).toBeUndefined();
  });

  it('does not fold in a NEEDED case-group partner — only the surplus member surfaces, unpaired', () => {
    // Turkic fixture (mirrors carveCasePairs.test.ts P7): under bcp47 "tr", plain
    // lowercase 'i' pairs 1:1 with dotted 'İ', separately from dotless 'ı' <-> 'I'.
    // isCharCoveredForLocale's own case-fold is Turkic-suppressed too, so 'İ' being
    // in `needed` does NOT also cover 'i' by fold — 'i' is independently surplus,
    // while 'İ' is excluded from candidacy outright (it's the literal needed char).
    // 'İ' therefore never enters `results`, so the fold below must not pull it in.
    const ir = makeIR({
      groups: [irGroup({
        nodeId: 'g1',
        rules: [
          { nodeId: 'rule-lower', context: [{ kind: 'vkey', name: 'K_1', modifiers: [] }], output: [{ kind: 'char', value: 'i' }] },
          { nodeId: 'rule-upper', context: [{ kind: 'vkey', name: 'K_2', modifiers: [] }], output: [{ kind: 'char', value: 'İ' }] },
        ],
      })],
    });

    const result = recommendedRemovalChars({ ir, needed: new Set(['İ']), bcp47: 'tr' });

    expect(result).toHaveLength(1);
    expect(result[0]?.ch).toBe('i');
    expect(result[0]?.caseGroup).toBeUndefined();
  });

  it('leaves an ordinary, non-paired surplus character unchanged (existing behaviour)', () => {
    const ir = makeIR({
      groups: [irGroup({
        nodeId: 'g1',
        rules: [{ nodeId: 'rule-z', context: [{ kind: 'vkey', name: 'K_Z', modifiers: [] }], output: [{ kind: 'char', value: 'ʒ' }] }],
      })],
    });

    const result = recommendedRemovalChars({ ir, needed: new Set(['q']) });

    expect(result.map((r) => r.ch)).toContain('ʒ');
    expect(result.find((r) => r.ch === 'ʒ')?.caseGroup).toBeUndefined();
  });

  it("merges BOTH case-group members' contributors into the folded survivor row (#526 fix 2 — cascadeDelete must drop both cases, not just the survivor's)", () => {
    const ir = makeIR({
      groups: [irGroup({
        nodeId: 'g1',
        rules: [
          { nodeId: 'rule-lower', context: [{ kind: 'vkey', name: 'K_1', modifiers: [] }], output: [{ kind: 'char', value: 'ǝ' }] },
          { nodeId: 'rule-upper', context: [{ kind: 'vkey', name: 'K_2', modifiers: [] }], output: [{ kind: 'char', value: 'Ǝ' }] },
        ],
      })],
    });

    const result = recommendedRemovalChars({ ir, needed: new Set(['q']) });

    expect(result).toHaveLength(1);
    const row = result[0];
    expect(row?.ch).toBe('ǝ'); // lowercase survivor
    expect(row?.caseGroup).toEqual(['Ǝ', 'ǝ']);
    // Both producing rules must be present, not just the lowercase survivor's own.
    expect(row?.contributors.ruleNodeIds).toEqual(expect.arrayContaining(['rule-lower', 'rule-upper']));
    expect(row?.contributors.ruleNodeIds).toHaveLength(2);
  });
});

// ---------------------------------------------------------------------------
// FR-013 at proposal time — a shared uppercase is never offered for trimming
// while one of its produced lowercase referents survives (spec 051, issue #1357).
//
// This is the many-to-one caveat the issue is actually about. The first fold
// written for FR-014 collapsed any two rows sharing an uppercase, which got
// { s, ſ, S } wrong: with `ſ` in the orthography, it proposed trimming `s` and
// `S` together and left `ſ` with no uppercase. The retire rule now runs through
// `caseTrimSet`, the one implementation of it.
// ---------------------------------------------------------------------------

/** Rules producing exactly `chars`, one key each — every char is independently trimmable. */
function makeCharsIR(chars: string[]): KeyboardIR {
  return makeIR({
    groups: [irGroup({
      nodeId: 'g1',
      rules: chars.map((c, i) => ({
        nodeId: `rule#${i}`,
        context: [{ kind: 'vkey' as const, name: `K_${i}`, modifiers: [] }],
        output: [{ kind: 'char' as const, value: c }],
      })),
    })],
  });
}

describe('recommendedRemovalChars — shared uppercase retires last (spec 051 FR-013)', () => {
  it('does NOT propose the shared uppercase while a produced lowercase referent is needed', () => {
    // produced { s, ſ, S }; the orthography needs ſ (U+017F) but not s or S.
    // Trimming S would leave ſ without its uppercase, so S must not be offered
    // at all — neither folded into s's row nor as a row of its own.
    const result = recommendedRemovalChars({
      ir: makeCharsIR(['s', 'ſ', 'S']),
      needed: new Set(['ſ']),
    });

    expect(result.map((r) => r.ch)).toEqual(['s']);
    expect(result[0]!.caseGroup).toBeUndefined(); // single row, not a pair
    expect(result.map((r) => r.ch)).not.toContain('S');
  });

  it('DOES retire the shared uppercase once every referent is being trimmed', () => {
    // Same produced set, but nothing in it is needed — the whole group goes, as
    // ONE row (FR-014), with the lowest-code-point lowercase surviving as the row.
    const result = recommendedRemovalChars({
      ir: makeCharsIR(['s', 'ſ', 'S']),
      needed: new Set(['q']),
    });

    expect(result.map((r) => r.ch)).toEqual(['s']);
    // S U+0053 < s U+0073 < ſ U+017F
    expect(result[0]!.caseGroup).toEqual(['S', 's', 'ſ']);
  });

  it('never folds two distinct lowercases that merely share an uppercase', () => {
    // produced { s, ſ } with no S at all: `s` and `ſ` are not counterparts of
    // each other, so they stay two independent rows.
    const result = recommendedRemovalChars({
      ir: makeCharsIR(['s', 'ſ']),
      needed: new Set(['q']),
    });

    expect(result.map((r) => r.ch).sort()).toEqual(['s', 'ſ']);
    expect(result.every((r) => r.caseGroup === undefined)).toBe(true);
  });
});

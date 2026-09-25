// Tests for display labels: vkeyLabel, triggerKeyLabel, the combining-mark helpers, keySequenceLabel, and invisibleCharLabel in irToCarveNodes.ts.
//
// Shared IR builders: ./__fixtures__/irToCarveNodes.ts.

import { describe, it, expect } from 'vitest';
import type { IRRule, IRStore } from '@keyboard-studio/contracts';
import {
  vkeyLabel,
  triggerKeyLabel,
  isCombining,
  prefixCombiningMark,
  displayChar,
  keySequenceLabel,
  invisibleCharLabel,
} from './irToCarveNodes.ts';
import { irGroup } from '@keyboard-studio/contracts/fixtures';
import { makeGroup, makeIR } from './__fixtures__/irToCarveNodes.ts';

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

  // -------------------------------------------------------------------------
  // TOTAL FLOOR (#1399 follow-on) — a store-triggered rule (any()/notany())
  // must never resolve to undefined when `ir` is supplied.
  // -------------------------------------------------------------------------

  it('without `ir`, an any()/notany() trigger still returns undefined (backward-compatible default)', () => {
    const ctx = [
      { kind: 'char' as const, value: 'x' },
      { kind: 'raw' as const, text: '+' },
      { kind: 'any' as const, storeRef: 'trig' },
    ];
    expect(triggerKeyLabel(ctx)).toBeUndefined();
  });

  it('with `ir`, an any()-triggered rule resolves to "one of: <items>" for a short store (<=8 char items)', () => {
    const trig: IRStore = { nodeId: 'store#trig', name: 'trig', items: ['b', 'c', 'd'].map((v) => ({ kind: 'char', value: v })), isSystem: false };
    const ctx = [
      { kind: 'char' as const, value: 'x' },
      { kind: 'raw' as const, text: '+' },
      { kind: 'any' as const, storeRef: 'trig' },
    ];
    const ir = makeIR({ stores: [trig] });
    expect(triggerKeyLabel(ctx, ir)).toBe('one of: b c d');
  });

  it('with `ir`, a notany()-triggered rule resolves the same way (vkey items via slotItemLabel too)', () => {
    const trig: IRStore = {
      nodeId: 'store#trig', name: 'trig',
      items: [{ kind: 'vkey', name: 'K_A' }, { kind: 'vkey', name: 'K_B' }],
      isSystem: false,
    };
    const ctx = [
      { kind: 'char' as const, value: 'x' },
      { kind: 'raw' as const, text: '+' },
      { kind: 'notany' as const, storeRef: 'trig' },
    ];
    const ir = makeIR({ stores: [trig] });
    expect(triggerKeyLabel(ctx, ir)).toBe('one of: a b');
  });

  it('with `ir`, a long store (>8 items) goes loose ("one of several keys")', () => {
    const trig: IRStore = {
      nodeId: 'store#trig', name: 'trig',
      items: ['a', 'b', 'c', 'd', 'e', 'f', 'g', 'h', 'i'].map((v) => ({ kind: 'char', value: v })),
      isSystem: false,
    };
    const ctx = [
      { kind: 'char' as const, value: 'x' },
      { kind: 'raw' as const, text: '+' },
      { kind: 'any' as const, storeRef: 'trig' },
    ];
    const ir = makeIR({ stores: [trig] });
    expect(triggerKeyLabel(ctx, ir)).toBe('one of several keys');
  });

  it('with `ir`, an unresolvable storeRef still returns undefined rather than fabricating a floor', () => {
    const ctx = [
      { kind: 'char' as const, value: 'x' },
      { kind: 'raw' as const, text: '+' },
      { kind: 'any' as const, storeRef: 'missing' },
    ];
    const ir = makeIR({ stores: [] });
    expect(triggerKeyLabel(ctx, ir)).toBeUndefined();
  });
});

// ---------------------------------------------------------------------------
// isCombining / prefixCombiningMark / displayChar — General_Category M
// (Mn/Mc/Me) dotted-circle rendering, incl. the Sk exclusion and the
// double-span (U+0360-0362) two-circle form (spec 071 follow-up, km-domain
// guidance: General_Category is the correct test, NOT canonical combining
// class — several Mc marks have ccc=0 and would be missed by a ccc test).
// ---------------------------------------------------------------------------

describe('isCombining / prefixCombiningMark / displayChar — Mark category (Mn/Mc/Me)', () => {
  it('flags Mn (non-spacing) marks — e.g. U+0300 COMBINING GRAVE ACCENT', () => {
    expect(isCombining('̀')).toBe(true);
  });

  it('flags Mc (spacing combining) marks — e.g. U+093E DEVANAGARI VOWEL SIGN AA (ccc=0, would be missed by a ccc-based test)', () => {
    expect(isCombining('ा')).toBe(true);
  });

  it('flags Me (enclosing) marks — e.g. U+20DD COMBINING ENCLOSING CIRCLE', () => {
    expect(isCombining('⃝')).toBe(true);
  });

  it('does NOT flag Sk modifier symbols — e.g. U+00B4 ACUTE ACCENT (free-standing, not a mark that attaches to a base)', () => {
    expect(isCombining('´')).toBe(false);
  });

  it('prefixCombiningMark: single dotted circle for an ordinary Mn/Mc/Me mark', () => {
    expect(prefixCombiningMark('̀', true)).toBe('◌̀');
    expect(prefixCombiningMark('ा', true)).toBe('◌ा');
  });

  it('prefixCombiningMark: does not prefix when isCombiningMark is false, regardless of the char', () => {
    expect(prefixCombiningMark('̀', false)).toBe('̀');
  });

  it('prefixCombiningMark: double-span marks (U+0360-0362) get a dotted circle on BOTH sides', () => {
    for (const ch of ['͠', '͡', '͢']) {
      expect(prefixCombiningMark(ch, true)).toBe(`◌${ch}◌`);
    }
  });

  it('displayChar: renders Mc/Me marks over a dotted circle (widened from the old Mn-only test)', () => {
    expect(displayChar('ा')).toBe('◌ा');
    expect(displayChar('⃝')).toBe('◌⃝');
  });

  it('displayChar: does not circle a plain letter or an Sk modifier symbol', () => {
    expect(displayChar('a')).toBe('a');
    expect(displayChar('´')).toBe('´');
  });

  it('displayChar: double-span mark renders circle+mark+circle end to end', () => {
    expect(displayChar('͡')).toBe('◌͡◌');
  });
});

// ---------------------------------------------------------------------------
// keySequenceLabel — deadkey-combination rule (#1399 follow-on)
//
// A rule whose effective context (context with the '+' keystroke-boundary
// separator stripped out) is composed ENTIRELY of deadkey elements, and
// whose output is a single literal char — "type deadkey A, then deadkey B
// -> composed character" (Cameroon's real shape for '=' and ';').
// ---------------------------------------------------------------------------

describe('keySequenceLabel — deadkey-combination rule (#1399 follow-on)', () => {
  it('resolves an all-deadkey effective context (no "+") to the ordered trigger chords', () => {
    const trigger1: IRRule = { nodeId: 'r-t1', context: [{ kind: 'vkey', name: 'K_A', modifiers: [] }], output: [{ kind: 'deadkey', id: 1 }] };
    const trigger2: IRRule = { nodeId: 'r-t2', context: [{ kind: 'vkey', name: 'K_B', modifiers: [] }], output: [{ kind: 'deadkey', id: 2 }] };
    const bodyRule: IRRule = {
      nodeId: 'r-body',
      context: [{ kind: 'deadkey', id: 1 }, { kind: 'deadkey', id: 2 }],
      output: [{ kind: 'char', value: 'e' }],
    };
    const ir = makeIR({ groups: [makeGroup([trigger1, trigger2]), irGroup({ nodeId: 'g2', name: 'deadkeys', rules: [bodyRule] })] });

    expect(keySequenceLabel(bodyRule, ir)).toEqual(['a', 'b']);
  });

  it('resolves an all-deadkey effective context with an embedded "+" the same way', () => {
    const trigger1: IRRule = { nodeId: 'r-t1', context: [{ kind: 'vkey', name: 'K_A', modifiers: [] }], output: [{ kind: 'deadkey', id: 1 }] };
    const trigger2: IRRule = { nodeId: 'r-t2', context: [{ kind: 'vkey', name: 'K_B', modifiers: [] }], output: [{ kind: 'deadkey', id: 2 }] };
    const bodyRule: IRRule = {
      nodeId: 'r-body-plus',
      context: [{ kind: 'deadkey', id: 1 }, { kind: 'raw', text: '+' }, { kind: 'deadkey', id: 2 }],
      output: [{ kind: 'char', value: 'e' }],
    };
    const ir = makeIR({ groups: [makeGroup([trigger1, trigger2]), irGroup({ nodeId: 'g2', name: 'deadkeys', rules: [bodyRule] })] });

    expect(keySequenceLabel(bodyRule, ir)).toEqual(['a', 'b']);
  });

  it('returns undefined (never fabricates) when one deadkey\'s trigger cannot be found', () => {
    const trigger1: IRRule = { nodeId: 'r-t1', context: [{ kind: 'vkey', name: 'K_A', modifiers: [] }], output: [{ kind: 'deadkey', id: 1 }] };
    // No trigger rule produces deadkey id 2.
    const bodyRule: IRRule = {
      nodeId: 'r-body-missing',
      context: [{ kind: 'deadkey', id: 1 }, { kind: 'deadkey', id: 2 }],
      output: [{ kind: 'char', value: 'e' }],
    };
    const ir = makeIR({ groups: [makeGroup([trigger1]), irGroup({ nodeId: 'g2', name: 'deadkeys', rules: [bodyRule] })] });

    expect(keySequenceLabel(bodyRule, ir)).toBeUndefined();
  });

  it('resolves a deadkey-entry trigger written in the "+"-form (context [raw(+), vkey]), not only the bare single-vkey form (#1399 follow-on)', () => {
    // Deadkey 1's own trigger uses the common `+`-form shape a `.kmn` rule
    // like `+ [K_X] > dk(1)` round-trips to at the IR level (a leading raw
    // '+' separator followed by the single vkey) — findDeadkeyTrigger must
    // resolve this exactly like the bare `[vkey] > dk(1)` shape below.
    const trigger1: IRRule = {
      nodeId: 'r-t1-plus',
      context: [{ kind: 'raw', text: '+' }, { kind: 'vkey', name: 'K_X', modifiers: [] }],
      output: [{ kind: 'deadkey', id: 1 }],
    };
    const trigger2: IRRule = { nodeId: 'r-t2', context: [{ kind: 'vkey', name: 'K_Y', modifiers: [] }], output: [{ kind: 'deadkey', id: 2 }] };
    const bodyRule: IRRule = {
      nodeId: 'r-body-plusentry',
      context: [{ kind: 'deadkey', id: 1 }, { kind: 'deadkey', id: 2 }],
      output: [{ kind: 'char', value: 'e' }],
    };
    const ir = makeIR({ groups: [makeGroup([trigger1, trigger2]), irGroup({ nodeId: 'g2', name: 'deadkeys', rules: [bodyRule] })] });

    expect(keySequenceLabel(bodyRule, ir)).toEqual(['x', 'y']);
  });

  it('resolves a deadkey-combination rule guarded by a non-plus raw context element (e.g. platform(...)) by stripping it, not just the "+" separator (#1399 follow-on)', () => {
    const trigger1: IRRule = { nodeId: 'r-t1', context: [{ kind: 'vkey', name: 'K_A', modifiers: [] }], output: [{ kind: 'deadkey', id: 1 }] };
    // `platform('hardware') dk(1) dk(1) > 'e'` — a guard the codec preserves
    // verbatim as an opaque {kind:"raw"} context element (not the plus
    // separator) ahead of an all-deadkey combination.
    const bodyRule: IRRule = {
      nodeId: 'r-body-platform-guard',
      context: [{ kind: 'raw', text: "platform('hardware')" }, { kind: 'deadkey', id: 1 }, { kind: 'deadkey', id: 1 }],
      output: [{ kind: 'char', value: 'e' }],
    };
    const ir = makeIR({ groups: [makeGroup([trigger1]), irGroup({ nodeId: 'g2', name: 'deadkeys', rules: [bodyRule] })] });

    expect(keySequenceLabel(bodyRule, ir)).toEqual(['a', 'a']);
  });
});

// ---------------------------------------------------------------------------
// findDeadkeyTrigger — a touch-only (T_xxxx) trigger must never shadow a
// resolvable desktop trigger for the SAME deadkey (regression).
//
// A deadkey can legitimately be entered by BOTH a real desktop chord and a
// touch-layout-only virtual key (mirrors the real sil_cameroon_qwerty-style
// dual-trigger shape already covered for charProducers above, lines
// 3392-3421, but here for a DEADKEY's own entry trigger rather than a plain
// literal-output rule). Before the fix, findDeadkeyTrigger's
// unshifted-preference search ran over the FULL candidate list, so an
// unshifted touch-only candidate (T_0041) won over a desktop candidate that
// happened to carry a modifier (Shift + K_A) — and since a touch-only vkey
// never resolves to a label (desktopVkeyLabel returns undefined for T_
// names), primaryChordLabel returned undefined and keySequenceLabel gave up
// on the WHOLE sequence, even though a perfectly good desktop chord existed.
// ---------------------------------------------------------------------------

describe('keySequenceLabel — a touch-only trigger never shadows a resolvable desktop trigger for the same deadkey (regression)', () => {
  it('resolves the DESKTOP chord when the deadkey has both a desktop trigger and an unshifted touch-only trigger', () => {
    // Desktop trigger carries a modifier (Shift + A) — deliberately NOT the
    // unshifted candidate, so the pre-fix bug (touch-only wins the bare
    // unshifted-preference search over the full candidate list) is what this
    // fixture actually exercises, not a case the old code got right by luck.
    const desktopTrigger: IRRule = {
      nodeId: 'r-desktop-trigger',
      context: [{ kind: 'vkey', name: 'K_A', modifiers: ['SHIFT'] }],
      output: [{ kind: 'deadkey', id: 1 }],
    };
    const touchOnlyTrigger: IRRule = {
      nodeId: 'r-touch-trigger',
      context: [{ kind: 'vkey', name: 'T_0041', modifiers: [] }],
      output: [{ kind: 'deadkey', id: 1 }],
    };
    const bodyRule: IRRule = {
      nodeId: 'r-body',
      context: [{ kind: 'deadkey', id: 1 }],
      output: [{ kind: 'char', value: 'e' }],
    };
    const ir = makeIR({ groups: [
        makeGroup([desktopTrigger, touchOnlyTrigger]),
        irGroup({ nodeId: 'g2', name: 'deadkeys', rules: [bodyRule] }),
      ] });

    expect(keySequenceLabel(bodyRule, ir)).toEqual(['Shift + a']);
  });

  it('still resolves no fabricated desktop chord when the deadkey has ONLY a touch-only trigger', () => {
    const touchOnlyTrigger: IRRule = {
      nodeId: 'r-touch-only-trigger',
      context: [{ kind: 'vkey', name: 'T_0041', modifiers: [] }],
      output: [{ kind: 'deadkey', id: 1 }],
    };
    const bodyRule: IRRule = {
      nodeId: 'r-body-touch-only',
      context: [{ kind: 'deadkey', id: 1 }],
      output: [{ kind: 'char', value: 'e' }],
    };
    const ir = makeIR({ groups: [
        makeGroup([touchOnlyTrigger]),
        irGroup({ nodeId: 'g2', name: 'deadkeys', rules: [bodyRule] }),
      ] });

    // No desktop candidate exists at all — falls back to the touch-only
    // candidate, which still can't be labelled, so the sequence stays
    // undefined rather than leaking a "T_0041" step.
    expect(keySequenceLabel(bodyRule, ir)).toBeUndefined();
  });
});

describe('invisibleCharLabel — spec 075 additions', () => {
  it('names WORD JOINER and the bidi controls the invisibles step offers', () => {
    expect(invisibleCharLabel('\u2060')).toBe('WORD JOINER');
    expect(invisibleCharLabel('\u200E')).toBe('LEFT-TO-RIGHT MARK');
    expect(invisibleCharLabel('\u200F')).toBe('RIGHT-TO-LEFT MARK');
    expect(invisibleCharLabel('\u061C')).toBe('ARABIC LETTER MARK');
    expect(invisibleCharLabel('\u2069')).toBe('POP DIRECTIONAL ISOLATE');
  });

  it('keeps the existing labels unchanged', () => {
    expect(invisibleCharLabel(' ')).toBe('SPACE');
    expect(invisibleCharLabel('\u200B')).toBe('ZERO WIDTH SPACE');
    expect(invisibleCharLabel('\u200C')).toBe('ZERO WIDTH NON-JOINER');
    expect(invisibleCharLabel('\u200D')).toBe('ZERO WIDTH JOINER');
    expect(invisibleCharLabel('\uFEFF')).toBe('ZERO WIDTH NO-BREAK SPACE');
    expect(invisibleCharLabel('\u00AD')).toBe('SOFT HYPHEN');
    expect(invisibleCharLabel('\u034F')).toBe('COMBINING GRAPHEME JOINER');
    expect(invisibleCharLabel('\u0301')).toBe('COMBINING MARK (U+0301)');
    expect(invisibleCharLabel('a')).toBeNull();
  });

  it('falls back to a FORMAT CHARACTER label for a Cf character the map does not name', () => {
    expect(invisibleCharLabel('\u2061')).toBe('FORMAT CHARACTER (U+2061)');
  });
});

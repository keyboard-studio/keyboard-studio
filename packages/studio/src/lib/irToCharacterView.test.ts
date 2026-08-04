// Tests for irToCharacterView.ts — the #1399 character-first flatten/classify/dedupe pass.

import { describe, it, expect } from 'vitest';
import type { IRRule, IRGroup, IRStore, KeyboardIR, RawKmnFragment } from '@keyboard-studio/contracts';
import {
  irToCharacterView,
  classifyCharacterCategory,
  classifySourceFromCapability,
  characterCellIds,
  characterCellIsToggleable,
  groupCharacterCells,
  characterDisplayName,
} from './irToCharacterView.ts';

// ---------------------------------------------------------------------------
// Fixture helpers (mirror irToCarveNodes.test.ts's minimal-IR convention)
// ---------------------------------------------------------------------------

function makeGroup(rules: IRRule[], nodeId = 'g1', name = 'main'): IRGroup {
  return { nodeId, name, usingKeys: true, rules, readonly: false };
}

function makeIR(overrides: Partial<KeyboardIR> = {}): KeyboardIR {
  return {
    origin: 'scaffolded',
    header: { keyboardId: '', name: '', bcp47: [], copyright: '', version: '', targets: [], storeDirectives: [] },
    stores: [],
    groups: [],
    comments: [],
    raw: [],
    recognizedPatterns: [],
    ...overrides,
  };
}

function directRule(nodeId: string, key: string, ch: string): IRRule {
  return { nodeId, context: [{ kind: 'vkey', name: key, modifiers: [] }], output: [{ kind: 'char', value: ch }] };
}

describe('irToCharacterView', () => {
  it('flattens a simple direct-key rule into a direct-key cell', () => {
    const ir = makeIR({ groups: [makeGroup([directRule('r1', 'K_A', 'a')])] });

    const cells = irToCharacterView(ir, new Map(), new Set(), new Set());

    expect(cells).toHaveLength(1);
    expect(cells[0]).toMatchObject({
      ch: 'a',
      keys: ['A'], // faithful (#1399): vkeyLabel('K_A') -> 'A', not the raw vkey name
      category: 'basic-letter',
      source: 'direct-key',
      inAlpha: false,
      reco: false,
    });
  });

  it('classifies a removable:slot-fill glyph as a deadkey-sequence source', () => {
    const outputStore: IRStore = { nodeId: 'store#out', name: 'out', items: [{ kind: 'char', value: 'à' }], isSystem: false };
    const baseStore: IRStore = { nodeId: 'store#base', name: 'base', items: [{ kind: 'char', value: 'a' }], isSystem: false };
    const rule: IRRule = {
      nodeId: 'rule#fanout',
      context: [{ kind: 'deadkey', id: 1 }, { kind: 'any', storeRef: 'base' }],
      output: [{ kind: 'index', storeRef: 'out', offset: 2 }],
    };
    const ir = makeIR({ groups: [makeGroup([rule])], stores: [outputStore, baseStore] });
    const capabilities = new Map([['store#out', 'removable:slot-fill' as const]]);

    const cells = irToCharacterView(ir, capabilities, new Set(), new Set());

    const cell = cells.find((c) => c.ch === 'à');
    expect(cell).toBeDefined();
    expect(cell?.source).toBe('deadkey-sequence');
    expect(cell?.category).toBe('accented-letter');
  });

  it('surfaces a character that lives ONLY in a store, with empty keys and source "store"', () => {
    const store: IRStore = { nodeId: 'store#punct', name: 'punct', items: [{ kind: 'char', value: '§' }], isSystem: false };
    const ir = makeIR({ stores: [store] });

    const cells = irToCharacterView(ir, new Map(), new Set(), new Set());

    expect(cells).toHaveLength(1);
    expect(cells[0]).toMatchObject({ ch: '§', keys: [], source: 'store', category: 'punctuation-symbol' });
  });

  it('dedupes a character produced by BOTH a glyph and a store chip, keeping the glyph (richer) entry', () => {
    const store: IRStore = { nodeId: 'store#dup', name: 'dup', items: [{ kind: 'char', value: 'a' }], isSystem: false };
    const ir = makeIR({ groups: [makeGroup([directRule('r1', 'K_A', 'a')])], stores: [store] });

    const cells = irToCharacterView(ir, new Map(), new Set(), new Set());

    expect(cells).toHaveLength(1);
    expect(cells[0]).toMatchObject({ ch: 'a', keys: ['A'], source: 'direct-key' });
  });

  it('marks inAlpha true when the NFC character is in confirmedInventory', () => {
    const ir = makeIR({ groups: [makeGroup([directRule('r1', 'K_A', 'é')])] });

    const cells = irToCharacterView(ir, new Map(), new Set(['é']), new Set());

    expect(cells[0]?.inAlpha).toBe(true);
  });

  it('marks reco true when the character is in the recommended-removal set', () => {
    const ir = makeIR({ groups: [makeGroup([directRule('r1', 'K_A', 'q')])] });

    const cells = irToCharacterView(ir, new Map(), new Set(), new Set(['q']));

    expect(cells[0]?.reco).toBe(true);
  });

  it('drops placeholder-only output (index()/outs() unresolved to "…") rather than producing a fake cell', () => {
    // An index() rule with an unresolvable storeRef falls back to '…' — must never surface as a character.
    const rule: IRRule = {
      nodeId: 'r-unresolved',
      context: [{ kind: 'vkey', name: 'K_B', modifiers: [] }],
      output: [{ kind: 'index', storeRef: 'missing', offset: 1 }],
    };
    const ir = makeIR({ groups: [makeGroup([rule])] });

    const cells = irToCharacterView(ir, new Map(), new Set(), new Set());

    expect(cells.some((c) => c.ch === '…')).toBe(false);
  });

  it('raw fragments never produce a glyph/store chip to flatten — an opaque-only "z" never surfaces as a CharacterCell', () => {
    const frag: RawKmnFragment = { nodeId: 'frag1', origin: 'imported', reason: 'unparseable construct', sourceText: 'context(1) > "z"' };
    const ir = makeIR({ raw: [frag] });

    const cells = irToCharacterView(ir, new Map(), new Set(), new Set());

    expect(cells.some((c) => c.ch === 'z')).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// #1399 — surfacing characters produced ONLY by advanced (opaque) blocks
// ---------------------------------------------------------------------------

describe('irToCharacterView — advanced-rule-only characters (#1399)', () => {
  it('a char produced ONLY by a raw fragment with producedOutput appears as an advanced-rule cell', () => {
    const frag: RawKmnFragment = {
      nodeId: 'frag1',
      origin: 'imported',
      reason: 'indexed context(n)',
      sourceText: 'if(context(2) = "x") > "z"',
      producedOutput: [{ kind: 'char', value: 'z' }],
    };
    const ir = makeIR({ raw: [frag] });

    const cells = irToCharacterView(ir, new Map(), new Set(), new Set());

    const cell = cells.find((c) => c.ch === 'z');
    expect(cell).toMatchObject({ ch: 'z', keys: [], source: 'advanced-rule', waysToType: [] });
  });

  it('a char produced by BOTH a readable rule and a raw fragment keeps the readable (richer) entry, not the advanced fallback', () => {
    const frag: RawKmnFragment = {
      nodeId: 'frag1',
      origin: 'imported',
      reason: 'indexed context(n)',
      sourceText: 'if(context(2) = "x") > "a"',
      producedOutput: [{ kind: 'char', value: 'a' }],
    };
    const ir = makeIR({ groups: [makeGroup([directRule('r1', 'K_A', 'a')])], raw: [frag] });

    const cells = irToCharacterView(ir, new Map(), new Set(), new Set());

    const cell = cells.find((c) => c.ch === 'a');
    expect(cell).toMatchObject({ ch: 'a', keys: ['A'], source: 'direct-key' });
  });

  it('a raw fragment WITHOUT producedOutput still contributes nothing (no false surfacing)', () => {
    const frag: RawKmnFragment = { nodeId: 'frag1', origin: 'imported', reason: 'unparseable construct', sourceText: 'context(1) > "w"' };
    const ir = makeIR({ raw: [frag] });

    const cells = irToCharacterView(ir, new Map(), new Set(), new Set());

    expect(cells.some((c) => c.ch === 'w')).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// #1399 — faithful "how it's typed" key-sequence derivation (CharacterCell.keys)
// ---------------------------------------------------------------------------

describe('irToCharacterView — faithful key sequence (#1399)', () => {
  it('S-01 modifier plane: composes "Shift + <key>" via vkeyLabel + modifierLabel', () => {
    const rule: IRRule = {
      nodeId: 'r-shift-a',
      context: [{ kind: 'vkey', name: 'K_A', modifiers: ['SHIFT'] }],
      output: [{ kind: 'char', value: 'A' }],
    };
    const ir = makeIR({ groups: [makeGroup([rule])] });

    const cells = irToCharacterView(ir, new Map(), new Set(), new Set());

    expect(cells.find((c) => c.ch === 'A')).toMatchObject({ keys: ['Shift + A'] });
  });

  it('S-02 deadkey two-step: trigger key THEN the base letter (never the "‹dk›" placeholder)', () => {
    const triggerRule: IRRule = {
      nodeId: 'r-trigger',
      context: [{ kind: 'vkey', name: 'K_BKQUOTE', modifiers: [] }],
      output: [{ kind: 'deadkey', id: 1 }],
    };
    const bodyRule: IRRule = {
      nodeId: 'r-body',
      context: [{ kind: 'deadkey', id: 1 }, { kind: 'any', storeRef: 'base' }],
      output: [{ kind: 'index', storeRef: 'out', offset: 2 }],
    };
    const baseStore: IRStore = { nodeId: 'store#base', name: 'base', items: [{ kind: 'char', value: 'a' }], isSystem: false };
    const outStore: IRStore = { nodeId: 'store#out', name: 'out', items: [{ kind: 'char', value: 'á' }], isSystem: false };
    const ir = makeIR({
      groups: [makeGroup([triggerRule], 'g1', 'main'), makeGroup([bodyRule], 'g2', 'deadkeys')],
      stores: [baseStore, outStore],
    });

    const cells = irToCharacterView(ir, new Map(), new Set(), new Set());

    expect(cells.find((c) => c.ch === 'á')).toMatchObject({ keys: ['`', 'a'] });
  });

  it('S-03 sequence: a store-driven base char THEN a fixed literal trigger (non-terminal any(), generalized offset)', () => {
    const rule: IRRule = {
      nodeId: 'r-seq',
      context: [{ kind: 'any', storeRef: 'base' }, { kind: 'raw', text: '+' }, { kind: 'char', value: '=' }],
      output: [{ kind: 'index', storeRef: 'out', offset: 1 }],
    };
    const baseStore: IRStore = { nodeId: 'store#base', name: 'base', items: [{ kind: 'char', value: 'a' }], isSystem: false };
    const outStore: IRStore = { nodeId: 'store#out', name: 'out', items: [{ kind: 'char', value: 'ā' }], isSystem: false };
    const ir = makeIR({ groups: [makeGroup([rule])], stores: [baseStore, outStore] });

    const cells = irToCharacterView(ir, new Map(), new Set(), new Set());

    expect(cells.find((c) => c.ch === 'ā')).toMatchObject({ keys: ['a', '='], source: 'deadkey-sequence' });
  });

  it('S-03 sequence shape MATCHED by a backspace-repair rule (any(composed) + [K_BKSP] > index(base,1)): never renders a "press Backspace to type it" footer (#1399 follow-on)', () => {
    // Same rule SHAPE sequenceShapeCells otherwise resolves (a store-driven
    // any() immediately followed by a fixed literal trigger whose output is
    // index(store, offset)) — but the trigger here is K_BKSP, an editing
    // key, not a forward-typing one. Without the isNotAForwardTypingPath
    // guard this used to leak keys: [<composed-char-label>, 'Backspace'] —
    // a misleading "how it's typed" step for a character that is only ever
    // reached by BACKSPACING to repair a mis-composed sequence, never typed
    // forward. `ch` here has NO other producer, so the fix must leave its
    // grid-cell footer empty rather than fabricate one.
    const composedStore: IRStore = { nodeId: 'store#composed', name: 'composed', items: [{ kind: 'char', value: 'ḉ' }], isSystem: false };
    const baseStore: IRStore = { nodeId: 'store#base', name: 'base', items: [{ kind: 'char', value: 'ç' }], isSystem: false };
    const bkspRule: IRRule = {
      nodeId: 'r-bksp-seq',
      context: [{ kind: 'any', storeRef: 'composed' }, { kind: 'raw', text: '+' }, { kind: 'vkey', name: 'K_BKSP', modifiers: [] }],
      output: [{ kind: 'index', storeRef: 'base', offset: 1 }],
    };
    const ir = makeIR({ groups: [makeGroup([bkspRule])], stores: [composedStore, baseStore] });

    const cells = irToCharacterView(ir, new Map(), new Set(), new Set());

    // 'ç' still appears (via the store-chip fallback for `base`), but with
    // an honest empty footer — no steps, and definitely no "Backspace".
    expect(cells.find((c) => c.ch === 'ç')?.keys).toEqual([]);
  });

  it('S-05 mnemonic: literal char THEN literal char, never mapped through vkeyLabel', () => {
    const rule: IRRule = {
      nodeId: 'r-mnemonic',
      context: [{ kind: 'char', value: 'a' }, { kind: 'raw', text: '+' }, { kind: 'char', value: 'a' }],
      output: [{ kind: 'char', value: 'ā' }],
    };
    const ir = makeIR({ groups: [makeGroup([rule])] });

    const cells = irToCharacterView(ir, new Map(), new Set(), new Set());

    expect(cells.find((c) => c.ch === 'ā')).toMatchObject({ keys: ['a', 'a'] });
  });

  it('S-05 mnemonic, 3-literal preceding run: emits the FULL ordered sequence, not just the first char', () => {
    const rule: IRRule = {
      nodeId: 'r-mnemonic-triple',
      context: [
        { kind: 'char', value: 'n' }, { kind: 'char', value: 'n' },
        { kind: 'raw', text: '+' }, { kind: 'char', value: 'n' },
      ],
      output: [{ kind: 'char', value: 'ŋ' }],
    };
    const ir = makeIR({ groups: [makeGroup([rule])] });

    const cells = irToCharacterView(ir, new Map(), new Set(), new Set());

    expect(cells.find((c) => c.ch === 'ŋ')).toMatchObject({ keys: ['n', 'n', 'n'] });
  });

  it('S-05 mnemonic, 2-literal preceding run: all steps present', () => {
    const rule: IRRule = {
      nodeId: 'r-mnemonic-double',
      context: [
        { kind: 'char', value: 'k' }, { kind: 'char', value: 'h' },
        { kind: 'raw', text: '+' }, { kind: 'char', value: 'h' },
      ],
      output: [{ kind: 'char', value: 'x' }],
    };
    const ir = makeIR({ groups: [makeGroup([rule])] });

    const cells = irToCharacterView(ir, new Map(), new Set(), new Set());

    expect(cells.find((c) => c.ch === 'x')).toMatchObject({ keys: ['k', 'h', 'h'] });
  });

  it('S-05 mnemonic, single-char preceding run: unchanged (degenerate N=1 case)', () => {
    const rule: IRRule = {
      nodeId: 'r-mnemonic-single',
      context: [{ kind: 'char', value: 'a' }, { kind: 'raw', text: '+' }, { kind: 'char', value: 'a' }],
      output: [{ kind: 'char', value: 'ā' }],
    };
    const ir = makeIR({ groups: [makeGroup([rule])] });

    const cells = irToCharacterView(ir, new Map(), new Set(), new Set());

    expect(cells.find((c) => c.ch === 'ā')).toMatchObject({ keys: ['a', 'a'] });
  });

  it('S-05 mnemonic, MIXED preceding run (a vkey among the literals): falls back to [] rather than fabricating a step', () => {
    const rule: IRRule = {
      nodeId: 'r-mnemonic-mixed',
      context: [
        { kind: 'char', value: 'n' }, { kind: 'vkey', name: 'K_X', modifiers: [] },
        { kind: 'raw', text: '+' }, { kind: 'char', value: 'n' },
      ],
      output: [{ kind: 'char', value: 'ñ' }],
    };
    const ir = makeIR({ groups: [makeGroup([rule])] });

    const cells = irToCharacterView(ir, new Map(), new Set(), new Set());

    expect(cells.find((c) => c.ch === 'ñ')).toMatchObject({ keys: [] });
  });

  it('fallback: a context-sensitive shape (two preceding chars, no "+") resolves keys to [] rather than fabricating a key', () => {
    const rule: IRRule = {
      nodeId: 'r-context-sensitive',
      context: [{ kind: 'char', value: 'x' }, { kind: 'char', value: 'y' }],
      output: [{ kind: 'char', value: 'z' }],
    };
    const ir = makeIR({ groups: [makeGroup([rule])] });

    const cells = irToCharacterView(ir, new Map(), new Set(), new Set());

    expect(cells.find((c) => c.ch === 'z')).toMatchObject({ keys: [], source: 'direct-key' });
  });
});

// ---------------------------------------------------------------------------
// #1399 — "ways to type it" list (CharacterCell.waysToType / charProducers)
// ---------------------------------------------------------------------------

describe('irToCharacterView — waysToType (#1399)', () => {
  it('unconditional: a plain direct-key producer has no condition field at all', () => {
    const ir = makeIR({ groups: [makeGroup([directRule('r1', 'K_A', 'a')])] });

    const cells = irToCharacterView(ir, new Map(), new Set(), new Set());

    expect(cells.find((c) => c.ch === 'a')?.waysToType).toEqual([{ steps: ['A'] }]);
  });

  it('follows-one-char: a single literal preceding char yields "when it follows x"', () => {
    const rule: IRRule = {
      nodeId: 'r-mnemonic',
      context: [{ kind: 'char', value: 'a' }, { kind: 'raw', text: '+' }, { kind: 'char', value: 'a' }],
      output: [{ kind: 'char', value: 'ā' }],
    };
    const ir = makeIR({ groups: [makeGroup([rule])] });

    const cells = irToCharacterView(ir, new Map(), new Set(), new Set());

    expect(cells.find((c) => c.ch === 'ā')?.waysToType).toEqual([
      { steps: ['a', 'a'], condition: 'when it follows a' },
    ]);
  });

  it('any-store, short list: preceding any() with <=8 char items lists them', () => {
    const vowels: IRStore = {
      nodeId: 'store#vowels', name: 'vowels',
      items: ['a', 'e', 'i', 'o', 'u'].map((v) => ({ kind: 'char', value: v })),
      isSystem: false,
    };
    const rule: IRRule = {
      nodeId: 'r-any-short',
      context: [{ kind: 'any', storeRef: 'vowels' }, { kind: 'raw', text: '+' }, { kind: 'vkey', name: 'K_EQUAL', modifiers: [] }],
      output: [{ kind: 'char', value: 'X' }],
    };
    const ir = makeIR({ groups: [makeGroup([rule])], stores: [vowels] });

    const cells = irToCharacterView(ir, new Map(), new Set(), new Set());

    expect(cells.find((c) => c.ch === 'X')?.waysToType).toEqual([
      { steps: ['='], condition: 'when it follows one of: a e i o u' },
    ]);
  });

  it('any-store, long list (>8 items): goes loose ("certain letters")', () => {
    const letters: IRStore = {
      nodeId: 'store#letters', name: 'letters',
      items: ['a', 'b', 'c', 'd', 'e', 'f', 'g', 'h', 'i'].map((v) => ({ kind: 'char', value: v })),
      isSystem: false,
    };
    const rule: IRRule = {
      nodeId: 'r-any-long',
      context: [{ kind: 'any', storeRef: 'letters' }, { kind: 'raw', text: '+' }, { kind: 'vkey', name: 'K_EQUAL', modifiers: [] }],
      output: [{ kind: 'char', value: 'Y' }],
    };
    const ir = makeIR({ groups: [makeGroup([rule])], stores: [letters] });

    const cells = irToCharacterView(ir, new Map(), new Set(), new Set());

    expect(cells.find((c) => c.ch === 'Y')?.waysToType).toEqual([
      { steps: ['='], condition: 'when it follows certain letters' },
    ]);
  });

  it('notany: preceding notany() with <=8 char items lists them, negated', () => {
    const consonants: IRStore = {
      nodeId: 'store#cons', name: 'cons',
      items: ['b', 'c', 'd'].map((v) => ({ kind: 'char', value: v })),
      isSystem: false,
    };
    const rule: IRRule = {
      nodeId: 'r-notany',
      context: [{ kind: 'notany', storeRef: 'cons' }, { kind: 'raw', text: '+' }, { kind: 'vkey', name: 'K_EQUAL', modifiers: [] }],
      output: [{ kind: 'char', value: 'Z' }],
    };
    const ir = makeIR({ groups: [makeGroup([rule])], stores: [consonants] });

    const cells = irToCharacterView(ir, new Map(), new Set(), new Set());

    expect(cells.find((c) => c.ch === 'Z')?.waysToType).toEqual([
      { steps: ['='], condition: "when it doesn't follow one of: b c d" },
    ]);
  });

  it('multiple producers: a character reachable via two different rules gets one entry per rule', () => {
    const ir = makeIR({
      groups: [makeGroup([
        directRule('r1', 'K_A', 'q'),
        directRule('r2', 'K_B', 'q'),
      ])],
    });

    const cells = irToCharacterView(ir, new Map(), new Set(), new Set());

    expect(cells.find((c) => c.ch === 'q')?.waysToType).toEqual([
      { steps: ['A'] },
      { steps: ['B'] },
    ]);
  });

  it('excludes a backspace/reorder rule that re-emits the character — only the real typing way is listed, no phantom entry (#1399 follow-on)', () => {
    const composedStore: IRStore = { nodeId: 'store#composed', name: 'composed', items: [{ kind: 'char', value: 'ā' }], isSystem: false };
    const baseStore: IRStore = { nodeId: 'store#base', name: 'base', items: [{ kind: 'char', value: 'a' }], isSystem: false };
    const bkspRule: IRRule = {
      nodeId: 'r-bksp',
      context: [{ kind: 'any', storeRef: 'composed' }, { kind: 'raw', text: '+' }, { kind: 'vkey', name: 'K_BKSP', modifiers: [] }],
      output: [{ kind: 'index', storeRef: 'base', offset: 1 }],
    };
    const ir = makeIR({
      groups: [makeGroup([directRule('r1', 'K_A', 'a'), bkspRule])],
      stores: [composedStore, baseStore],
    });

    const cells = irToCharacterView(ir, new Map(), new Set(), new Set());

    expect(cells.find((c) => c.ch === 'a')?.waysToType).toEqual([{ steps: ['A'] }]);
  });

  it('excludes a K_DEL-triggered output rule the same way as K_BKSP', () => {
    const rule: IRRule = {
      nodeId: 'r-del',
      context: [{ kind: 'vkey', name: 'K_DEL', modifiers: [] }],
      output: [{ kind: 'char', value: 'x' }],
    };
    const ir = makeIR({ groups: [makeGroup([rule])] });

    const cells = irToCharacterView(ir, new Map(), new Set(), new Set());

    expect(cells.find((c) => c.ch === 'x')?.waysToType).toEqual([]);
  });

  it('does NOT exclude K_TAB or K_ENTER triggers — these are legitimate forward-typing chords, not editing keys', () => {
    const tabRule: IRRule = {
      nodeId: 'r-tab',
      context: [{ kind: 'char', value: 'k' }, { kind: 'raw', text: '+' }, { kind: 'vkey', name: 'K_TAB', modifiers: [] }],
      output: [{ kind: 'char', value: 'y' }],
    };
    const enterRule: IRRule = {
      nodeId: 'r-enter',
      context: [{ kind: 'char', value: 'k' }, { kind: 'raw', text: '+' }, { kind: 'vkey', name: 'K_ENTER', modifiers: [] }],
      output: [{ kind: 'char', value: 'z' }],
    };
    const ir = makeIR({ groups: [makeGroup([tabRule, enterRule])] });

    const cells = irToCharacterView(ir, new Map(), new Set(), new Set());

    expect(cells.find((c) => c.ch === 'y')?.waysToType).toEqual([
      { steps: ['k', 'Tab'], condition: 'when it follows k' },
    ]);
    expect(cells.find((c) => c.ch === 'z')?.waysToType).toEqual([
      { steps: ['k', 'Enter'], condition: 'when it follows k' },
    ]);
  });

  it('not-renderable fallback: an index() back-reference in preceding context cannot be phrased honestly, but the TOTAL FLOOR (#1399 follow-on) still names the real trigger key rather than leaving the entry bare', () => {
    const rule: IRRule = {
      nodeId: 'r-index-backref',
      context: [{ kind: 'index', storeRef: 's', offset: 1 }, { kind: 'raw', text: '+' }, { kind: 'vkey', name: 'K_A', modifiers: [] }],
      output: [{ kind: 'char', value: 'W' }],
    };
    const ir = makeIR({ groups: [makeGroup([rule])] });

    const cells = irToCharacterView(ir, new Map(), new Set(), new Set());

    expect(cells.find((c) => c.ch === 'W')?.waysToType).toEqual([{ steps: [], triggerFloor: 'A' }]);
  });
});

// ---------------------------------------------------------------------------
// #1399 follow-on (TOTAL FLOOR) — self-permutation exclusion, multi-index()
// cross-store tables, the any()-triggered trigger floor, and the hard
// "never a banned placeholder" requirement.
// ---------------------------------------------------------------------------

describe('irToCharacterView — TOTAL FLOOR (#1399 follow-on)', () => {
  it('excludes a self-permutation (reorder) index() producer — only the real plain-key way survives', () => {
    // index(S, 2) whose base at offset 2 is any(S) — the SAME store it
    // matched as input — is a reorder, not a way to type. Char "a" also has
    // a genuine direct-key producer, which must be the only one left.
    const storeS: IRStore = { nodeId: 'store#s', name: 'S', items: [{ kind: 'char', value: 'a' }, { kind: 'char', value: 'b' }], isSystem: false };
    const reorderRule: IRRule = {
      nodeId: 'r-reorder',
      context: [{ kind: 'char', value: 'q' }, { kind: 'any', storeRef: 'S' }],
      output: [{ kind: 'index', storeRef: 'S', offset: 2 }],
    };
    const ir = makeIR({
      groups: [makeGroup([directRule('r1', 'K_A', 'a'), reorderRule])],
      stores: [storeS],
    });

    const cells = irToCharacterView(ir, new Map(), new Set(), new Set());

    expect(cells.find((c) => c.ch === 'a')?.waysToType).toEqual([{ steps: ['A'] }]);
  });

  it('multi-index() cross-store table: each output element resolves its OWN base at its own offset — real steps, not empty', () => {
    // any(A) any(B) + [K_TRIG] > index(outA,1) index(outB,2) — two index()
    // outputs over TWO DIFFERENT (non-self) stores in one rule. The old
    // resolveStoreSlotSteps assumed rule.output[0] and rule.output.length
    // === 1, so a 2-element output rule like this always resolved to
    // undefined; it must now resolve each element at its own offset.
    const storeA: IRStore = { nodeId: 'store#a', name: 'A', items: [{ kind: 'char', value: 'p' }], isSystem: false };
    const storeB: IRStore = { nodeId: 'store#b', name: 'B', items: [{ kind: 'char', value: 'x' }], isSystem: false };
    const outA: IRStore = { nodeId: 'store#outa', name: 'outA', items: [{ kind: 'char', value: 'P' }], isSystem: false };
    const outB: IRStore = { nodeId: 'store#outb', name: 'outB', items: [{ kind: 'char', value: 'Y' }], isSystem: false };
    const rule: IRRule = {
      nodeId: 'r-table',
      context: [
        { kind: 'any', storeRef: 'A' }, { kind: 'any', storeRef: 'B' },
        { kind: 'raw', text: '+' }, { kind: 'vkey', name: 'K_TRIG', modifiers: [] },
      ],
      output: [
        { kind: 'index', storeRef: 'outA', offset: 1 },
        { kind: 'index', storeRef: 'outB', offset: 2 },
      ],
    };
    const ir = makeIR({ groups: [makeGroup([rule])], stores: [storeA, storeB, outA, outB] });

    const cells = irToCharacterView(ir, new Map(), new Set(), new Set());

    expect(cells.find((c) => c.ch === 'P')?.waysToType).toEqual([{ steps: ['p', 'TRIG'] }]);
    expect(cells.find((c) => c.ch === 'Y')?.waysToType).toEqual([{ steps: ['x', 'TRIG'] }]);
  });

  it('any()-triggered store rule: renders the trigger floor "one of: …", never an empty producer', () => {
    const trig: IRStore = { nodeId: 'store#trig', name: 'trig', items: ['b', 'c', 'd'].map((v) => ({ kind: 'char', value: v })), isSystem: false };
    const rule: IRRule = {
      nodeId: 'r-any-trigger',
      context: [{ kind: 'char', value: 'k' }, { kind: 'raw', text: '+' }, { kind: 'any', storeRef: 'trig' }],
      output: [{ kind: 'char', value: 'Z' }],
    };
    const ir = makeIR({ groups: [makeGroup([rule])], stores: [trig] });

    const cells = irToCharacterView(ir, new Map(), new Set(), new Set());

    expect(cells.find((c) => c.ch === 'Z')?.waysToType).toEqual([{ steps: [], triggerFloor: 'one of: b c d' }]);
  });

  it('hard requirement: a mixed fixture (reorder + multi-index table + any()-triggered rule) never leaves a producer with neither steps nor a trigger floor — the two former placeholder strings have no data path to render', () => {
    const storeS: IRStore = { nodeId: 'store#s', name: 'S', items: [{ kind: 'char', value: 'a' }], isSystem: false };
    const reorderRule: IRRule = {
      nodeId: 'r-reorder',
      context: [{ kind: 'char', value: 'q' }, { kind: 'any', storeRef: 'S' }],
      output: [{ kind: 'index', storeRef: 'S', offset: 2 }],
    };
    const storeA: IRStore = { nodeId: 'store#a', name: 'A', items: [{ kind: 'char', value: 'p' }], isSystem: false };
    const outA: IRStore = { nodeId: 'store#outa', name: 'outA', items: [{ kind: 'char', value: 'P' }], isSystem: false };
    const tableRule: IRRule = {
      nodeId: 'r-table',
      context: [{ kind: 'any', storeRef: 'A' }, { kind: 'raw', text: '+' }, { kind: 'vkey', name: 'K_TRIG', modifiers: [] }],
      output: [{ kind: 'index', storeRef: 'outA', offset: 1 }],
    };
    const trig: IRStore = { nodeId: 'store#trig', name: 'trig', items: ['b', 'c'].map((v) => ({ kind: 'char', value: v })), isSystem: false };
    const trigRule: IRRule = {
      nodeId: 'r-any-trigger',
      context: [{ kind: 'char', value: 'k' }, { kind: 'raw', text: '+' }, { kind: 'any', storeRef: 'trig' }],
      output: [{ kind: 'char', value: 'Z' }],
    };

    const ir = makeIR({
      groups: [makeGroup([directRule('r1', 'K_A', 'a'), reorderRule, tableRule, trigRule])],
      stores: [storeS, storeA, outA, trig],
    });

    const cells = irToCharacterView(ir, new Map(), new Set(), new Set());

    const BANNED = ['Not tied to a single key', 'Not shown — context-dependent'];
    for (const cell of cells) {
      for (const way of cell.waysToType) {
        // Total-floor contract: every producer either has faithful steps, or
        // a resolvable trigger floor — never neither.
        expect(way.steps.length > 0 || way.triggerFloor !== undefined).toBe(true);
        for (const banned of BANNED) {
          expect(way.condition).not.toBe(banned);
          expect(way.triggerFloor).not.toBe(banned);
        }
      }
    }
  });
});

describe('classifyCharacterCategory', () => {
  it('classifies ASCII letters as basic-letter', () => {
    expect(classifyCharacterCategory('a')).toBe('basic-letter');
    expect(classifyCharacterCategory('Z')).toBe('basic-letter');
  });

  it('classifies a non-Latin/non-decomposing letter as special-letter', () => {
    expect(classifyCharacterCategory('ŋ')).toBe('special-letter');
  });

  it('classifies a precomposed accented letter (NFD decomposes to base+mark) as accented-letter', () => {
    expect(classifyCharacterCategory('é')).toBe('accented-letter');
  });

  it('classifies a standalone combining mark as accented-letter', () => {
    expect(classifyCharacterCategory('́')).toBe('accented-letter'); // combining acute accent
  });

  it('classifies a digit as digit', () => {
    expect(classifyCharacterCategory('7')).toBe('digit');
  });

  it('classifies punctuation and symbols as punctuation-symbol', () => {
    expect(classifyCharacterCategory('.')).toBe('punctuation-symbol');
    expect(classifyCharacterCategory('§')).toBe('punctuation-symbol');
    expect(classifyCharacterCategory('$')).toBe('punctuation-symbol');
  });
});

describe('classifySourceFromCapability', () => {
  it('maps removable:slot-fill to deadkey-sequence', () => {
    expect(classifySourceFromCapability('removable:slot-fill')).toBe('deadkey-sequence');
  });

  it('maps every other capability (including undefined) to direct-key', () => {
    expect(classifySourceFromCapability('removable:simple')).toBe('direct-key');
    expect(classifySourceFromCapability('not-removable:unknown')).toBe('direct-key');
    expect(classifySourceFromCapability(undefined)).toBe('direct-key');
  });
});

describe('characterCellIds / characterCellIsToggleable', () => {
  it('is toggleable when the cell has a removable rule producer', () => {
    const ir = makeIR({ groups: [makeGroup([directRule('r1', 'K_A', 'a')])] });
    const cells = irToCharacterView(ir, new Map(), new Set(), new Set());
    expect(characterCellIsToggleable(cells[0]!)).toBe(true);
    expect(characterCellIds(cells[0]!)).toEqual(['r1']);
  });

  it('is toggleable when the character is produced through an index()-output store slot (removal resolves to storeSlotIds)', () => {
    const store: IRStore = { nodeId: 'store#s', name: 'S', items: [{ kind: 'char', value: 'y' }], isSystem: false };
    const rule: IRRule = {
      nodeId: 'r-idx',
      context: [{ kind: 'vkey', name: 'K_Y', modifiers: [] }],
      output: [{ kind: 'index', storeRef: 'S', offset: 1 }],
    };
    const ir = makeIR({ groups: [makeGroup([rule])], stores: [store] });

    const cells = irToCharacterView(ir, new Map(), new Set(), new Set());
    const cell = cells.find((c) => c.ch === 'y')!;

    expect(characterCellIsToggleable(cell)).toBe(true);
    expect(characterCellIds(cell)).toEqual(['store#s#0']);
  });

  it('is NOT toggleable when the character has no removable producer at all (isolated store, unreferenced by any rule)', () => {
    const store: IRStore = { nodeId: 'store#s', name: 'S', items: [{ kind: 'char', value: 'z' }], isSystem: false };
    const ir = makeIR({ stores: [store] });

    const cells = irToCharacterView(ir, new Map(), new Set(), new Set());
    const cell = cells.find((c) => c.ch === 'z')!;

    expect(characterCellIsToggleable(cell)).toBe(false);
    expect(characterCellIds(cell)).toEqual([]);
  });
});

describe('groupCharacterCells', () => {
  it('groups by category in the fixed display order, omitting empty groups', () => {
    const ir = makeIR({
      groups: [makeGroup([
        directRule('r1', 'K_A', 'a'),   // basic-letter
        directRule('r2', 'K_7', '7'),   // digit
      ])],
    });
    const cells = irToCharacterView(ir, new Map(), new Set(), new Set());

    const groups = groupCharacterCells(cells, 'category');

    expect(groups.map((g) => g.key)).toEqual(['basic-letter', 'digit']);
    expect(groups[0]?.cells.map((c) => c.ch)).toEqual(['a']);
    expect(groups[1]?.cells.map((c) => c.ch)).toEqual(['7']);
  });

  it('groups by source', () => {
    const store: IRStore = { nodeId: 'store#s', name: 'S', items: [{ kind: 'char', value: '§' }], isSystem: false };
    const ir = makeIR({ groups: [makeGroup([directRule('r1', 'K_A', 'a')])], stores: [store] });
    const cells = irToCharacterView(ir, new Map(), new Set(), new Set());

    const groups = groupCharacterCells(cells, 'source');

    expect(groups.map((g) => g.key)).toEqual(['direct-key', 'store']);
  });
});

describe('characterDisplayName', () => {
  it('names a combining mark via the invisible/combining label', () => {
    expect(characterDisplayName('́')).toContain('COMBINING');
  });

  it('falls back to a generic codepoint label for an ordinary letter', () => {
    expect(characterDisplayName('a')).toBe('Character U+0061');
  });
});

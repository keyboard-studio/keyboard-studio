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

  it('a rule with K_BKSP in its context (diacritic-removal, e.g. "é then backspace -> e") is NOT attributed', () => {
    const rule = makeRule('r-bksp-removal',
      [{ kind: 'char', value: 'é' }, { kind: 'vkey', name: 'K_BKSP', modifiers: [] }],
      [{ kind: 'char', value: 'e' }],
    );
    const ir = makeIR({
      groups: [{ nodeId: 'g1', name: 'main', usingKeys: true, readonly: false, rules: [rule] }],
    });
    const result = collectCharContributors(ir, 'e');
    expect(result.ruleNodeIds).not.toContain('r-bksp-removal');
    expect(result.storeSlotIds).toHaveLength(0);
    expect(result.blocked).toHaveLength(0);
    expect(result.descriptors).toHaveLength(0);
  });

  it('a normal (non-backspace) rule for the same char IS still attributed', () => {
    const bkspRule = makeRule('r-bksp-removal',
      [{ kind: 'char', value: 'é' }, { kind: 'vkey', name: 'K_BKSP', modifiers: [] }],
      [{ kind: 'char', value: 'e' }],
    );
    const normalRule = makeRule('r-normal',
      [{ kind: 'vkey', name: 'K_E', modifiers: [] }],
      [{ kind: 'char', value: 'e' }],
    );
    const ir = makeIR({
      groups: [{ nodeId: 'g1', name: 'main', usingKeys: true, readonly: false, rules: [bkspRule, normalRule] }],
    });
    const result = collectCharContributors(ir, 'e');
    expect(result.ruleNodeIds).not.toContain('r-bksp-removal');
    expect(result.ruleNodeIds).toContain('r-normal');
  });

  it('K_BKSP anywhere in a multi-element context still skips the whole rule', () => {
    // Backspace appearing as a LATER context element (not just first) must
    // still be caught — the check scans the whole context, not just [0].
    const rule = makeRule('r-bksp-mid',
      [{ kind: 'vkey', name: 'K_BKSP', modifiers: [] }, { kind: 'char', value: 'x' }],
      [{ kind: 'char', value: 'y' }],
    );
    const ir = makeIR({
      groups: [{ nodeId: 'g1', name: 'main', usingKeys: true, readonly: false, rules: [rule] }],
    });
    const result = collectCharContributors(ir, 'y');
    expect(result.ruleNodeIds).toHaveLength(0);
    expect(result.descriptors).toHaveLength(0);
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

  it('S-02 fan-out: a rule that both consumes AND produces the target char (identity-mapped ε) attributes only the output slot, never a spurious "used" input slot', () => {
    const ir = makeCameroonIR();
    // ε is at index 2 of BOTH the output store (dkt003b) and the any()-consumed
    // input store (dkf003b) — this single fan-out rule maps ε -> ε (identity).
    // Per the produced/used contract, a rule that OUTPUTS the target char is
    // "produced" for it even though the char also sits on that same rule's
    // input side — so only the output slot (sid-dkt#2) is attributed here;
    // sid-dkf#2 must NOT surface as a "used" input slot for this rule.
    const resultE = collectCharContributors(ir, 'ε');
    expect(resultE.storeSlotIds).toEqual(['sid-dkt#2']);
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

  it('opaque RawKmnFragment producing target char (via producedOutput sketch) goes to blocked', () => {
    // The blocked check walks `producedOutput` structurally (same element-walk
    // buildProducedSet uses) rather than scanning `sourceText` — see
    // collectCharContributors.ts's opaque-fragment doc comment.
    const ir = makeIR({
      raw: [{
        nodeId: 'frag-1',
        origin: 'imported',
        sourceText: '+ [K_E] > ε',
        producedOutput: [{ kind: 'char', value: 'ε' }],
        reason: 'call/return',
      }],
    });
    const result = collectCharContributors(ir, 'ε');
    expect(result.blocked.some((b) => b.reason.includes('Opaque fragment'))).toBe(true);
  });

  it('opaque RawKmnFragment whose producedOutput does NOT include the target is NOT blocked', () => {
    // The char appears before `>` in sourceText (a match target), not as
    // output — producedOutput (output-side only, per its own doc comment)
    // correctly excludes it, so no false "cannot remove" warning.
    const ir = makeIR({
      raw: [{
        nodeId: 'frag-1',
        origin: 'imported',
        sourceText: 'ε + [K_A] > "x"',
        producedOutput: [{ kind: 'char', value: 'x' }],
        reason: 'call/return',
      }],
    });
    const result = collectCharContributors(ir, 'ε');
    expect(result.blocked).toHaveLength(0);
  });

  it('opaque RawKmnFragment with a STORE-BACKED producedOutput (index() ref) goes to blocked, not silently unattributed', () => {
    // Mirrors producedSet.test.ts's bj_cree_woods regression shape: the
    // fragment's producedOutput sketch is an index() reference into a typed
    // store (never a bare {kind:"char"}), resolved via collectFromElements
    // exactly as buildProducedSet resolves it — isolates the store-lookup path
    // (storeMap keyed by store NAME) rather than the trivial literal-char case
    // already covered above.
    const store = makeStore('sid-efc', 'C_efc', [
      { kind: 'char', value: 'ᐌ' },
      { kind: 'char', value: 'ᐐ' },
      { kind: 'char', value: 'ᐔ' },
    ]);
    const ir = makeIR({
      stores: [store],
      raw: [{
        nodeId: 'frag-1',
        origin: 'imported',
        sourceText: "if(opt = '') + [K_A] > index(C_efc,3)",
        producedOutput: [{ kind: 'index', storeRef: 'C_efc', offset: 3 }],
        reason: 'if-option-store',
      }],
    });
    const result = collectCharContributors(ir, 'ᐔ');
    expect(result.blocked.some((b) => b.reason.includes('Opaque fragment'))).toBe(true);
    expect(result.descriptors).toContainEqual({
      kind: 'blocked',
      producedChar: 'ᐔ',
      producedRole: 'produced',
      blockedReasonCode: 'opaque-fragment',
    });
  });

  it('opaque RawKmnFragment with no producedOutput sketch is not in blocked (no fabricated attribution)', () => {
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

  it('a diacritic-removal rule (composed-shaped: any(composed) + [K_BKSP] > index(comp-dia,1)) contributes its slot for REMOVAL but never as a producing method', () => {
    // A correction rule is not a producing METHOD for a character — but its
    // store IS a deconstruction table, and a row there exists only for as long
    // as its character does. So the slot must be nominated for removal while
    // staying out of the green "existing methods" list.
    //
    // This assertion previously required the whole rule to be invisible
    // (`storeSlotIds` empty). That conflated the two questions and was the
    // defect: on sil_cameroon_qwerty it left `æ` sitting in `comp-dia` after
    // the carve, which kept `æ` inside `buildProducedSet` and so left its
    // touch/desktop keycap standing. The producing-method exclusion is now
    // carried by `producedRole: 'used'` instead of by omission.
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
    // Nominated for removal — dropping "à" must take this unwrap row with it
    // (and, via applyStoreSlotRemovals' pairing graph, its coordinated
    // comp-dia partner).
    expect(result.storeSlots).toEqual([{ slotId: 'sid-composed#0', role: 'input' }]);
    // ...but never as a producing method, and never as a whole-rule delete:
    // the rule's other rows serve other characters.
    expect(result.descriptors.every((d) => d.producedRole === 'used')).toBe(true);
    expect(result.ruleNodeIds).toHaveLength(0);
    expect(result.blocked).toHaveLength(0);
  });

  it('returns the targetChar NFC-normalized', () => {
    // Pass NFD é (e + combining acute), get back NFC é
    const nfd = 'é';
    const ir = makeIR();
    const result = collectCharContributors(ir, nfd);
    expect(result.targetChar).toBe('é');
  });

  // #1357-carve-marks-needed-set G2 guard: a rule whose literal output is a
  // DECOMPOSED sequence (base char + combining mark(s), two or more IR
  // elements) that NFC-composes to the queried precomposed targetChar must
  // still be recognized as a whole-rule single-char producer — verified
  // empirically already true of the existing NFC-normalize-before-compare
  // logic (charVals.join('').normalize('NFC') === target); this locks it as a
  // regression rather than a behavior change.
  it('whole-rule delete: a decomposed 2-element literal output matches a precomposed target (G2)', () => {
    const rule = makeRule('r-decomp',
      [{ kind: 'vkey', name: 'K_E', modifiers: [] }],
      [{ kind: 'char', value: 'e' }, { kind: 'char', value: '́' }], // e + combining acute
    );
    const ir = makeIR({ groups: [{ nodeId: 'g1', name: 'main', usingKeys: true, readonly: false, rules: [rule] }] });
    const result = collectCharContributors(ir, 'é'); // precomposed U+00E9
    expect(result.ruleNodeIds).toEqual(['r-decomp']);
    expect(result.blocked).toHaveLength(0);
  });

  it('whole-rule delete: a decomposed 3-element (base + two marks) literal output matches a precomposed target (G2, multi-mark stack)', () => {
    const rule = makeRule('r-decomp-stack',
      [{ kind: 'vkey', name: 'K_A', modifiers: [] }],
      [
        { kind: 'char', value: 'a' },
        { kind: 'char', value: '̂' }, // combining circumflex
        { kind: 'char', value: '̀' }, // combining grave
      ],
    );
    const ir = makeIR({ groups: [{ nodeId: 'g1', name: 'main', usingKeys: true, readonly: false, rules: [rule] }] });
    const result = collectCharContributors(ir, 'ầ'); // ầ, precomposed
    expect(result.ruleNodeIds).toEqual(['r-decomp-stack']);
    expect(result.blocked).toHaveLength(0);
  });
});

// ---------------------------------------------------------------------------
// Role-tagged store slots (spec 051 T010 — invariant D1)
//
// `storeSlots` is a projection of `storeSlotIds`, never a different set. The
// role tells a caller whether a slot PRODUCES the character (output store) or
// merely TRIGGERS on it (any()-consumed input store) — the distinction the
// carve collateral guard turns on.
// ---------------------------------------------------------------------------

describe('collectCharContributors — role-tagged storeSlots (spec 051)', () => {
  it('keeps storeSlots a strict element-for-element projection of storeSlotIds (invariant D1)', () => {
    const ir = makeCameroonIR();
    for (const ch of ['a', 'e', 'ε', 'à', 'é', 'z']) {
      const result = collectCharContributors(ir, ch);
      expect(result.storeSlots.map((s) => s.slotId)).toEqual(result.storeSlotIds);
    }
  });

  it('tags an any()-consumed input-store slot as "input"', () => {
    // 'a' lives only in dkf003b, the any() context source.
    const result = collectCharContributors(makeCameroonIR(), 'a');
    expect(result.storeSlots).toEqual([{ slotId: 'sid-dkf#0', role: 'input' }]);
  });

  it('tags an index()-targeted output-store slot as "output"', () => {
    // 'à' lives only in dkt003b, the index() output target.
    const result = collectCharContributors(makeCameroonIR(), 'à');
    expect(result.storeSlots).toEqual([{ slotId: 'sid-dkt#0', role: 'output' }]);
  });

  it('tags a slot reached by BOTH roles as "output" — the producing role dominates', () => {
    // NOTE: 'ε' at index 2 of BOTH the input store (dkf003b) and the output
    // store (dkt003b) of the SAME rule (an identity-mapped deadkey
    // combination) is now covered by the produced/used gate (see the "does
    // not nul other slots" test above): since that rule produces 'ε', its
    // input-side occurrence is never even attempted as a "used" contributor,
    // so this scenario no longer yields "one slot of each role" within a
    // single rule. The genuinely-both-roles case that remains is a SINGLE
    // slot reached from both directions (below), or two roles split across
    // TWO SEPARATE rules (covered in a later test in this file).

    // A self-paired store (Cameroon's `word` shape): the SAME slot is reached by
    // the input loop and the output loop of the same rule.
    const word = makeStore('sid-word', 'word', [
      { kind: 'char', value: 'a' },
      { kind: 'char', value: 'ɛ' },
    ]);
    const selfPaired = makeIR({
      stores: [word],
      groups: [{
        nodeId: 'g1', name: 'main', usingKeys: true, readonly: false,
        rules: [makeRule('r-self',
          [{ kind: 'any', storeRef: 'word' }],
          [{ kind: 'index', storeRef: 'word', offset: 1 }],
        )],
      }],
    });
    const result = collectCharContributors(selfPaired, 'ɛ');
    expect(result.storeSlotIds).toEqual(['sid-word#1']);
    expect(result.storeSlots).toEqual([{ slotId: 'sid-word#1', role: 'output' }]);
  });
});

// ---------------------------------------------------------------------------
// descriptors — structured, author-friendly contributor view
//
// One entry per ruleNodeIds element ("keystroke"), one per storeSlots
// element in the same order ("deadkey" or "store-slot"), one per blocked
// element in the same order ("blocked"). Fields that aren't cheaply
// derivable are left ABSENT, never fabricated.
// ---------------------------------------------------------------------------

describe('collectCharContributors — descriptors (structured fields)', () => {
  it('kind "keystroke": a plain vkey rule with no modifiers gets a bare key-name keystrokeDisplay', () => {
    const rule = makeRule('r-s01',
      [{ kind: 'vkey', name: 'K_A', modifiers: [] }],
      [{ kind: 'char', value: 'a' }],
    );
    const ir = makeIR({
      groups: [{ nodeId: 'g1', name: 'main', usingKeys: true, readonly: false, rules: [rule] }],
    });
    const result = collectCharContributors(ir, 'a');
    expect(result.descriptors).toEqual([
      {
        kind: 'keystroke',
        producedChar: 'a',
        producedRole: 'produced',
        keystrokeDisplay: 'a',
        inputSequence: ['a'],
        output: 'a',
      },
    ]);
  });

  it('kind "keystroke": a modified vkey rule gets a "Shift+A"-style keystrokeDisplay', () => {
    const rule = makeRule('r-shift-a',
      [{ kind: 'vkey', name: 'K_A', modifiers: ['SHIFT'] }],
      [{ kind: 'char', value: 'A' }],
    );
    const ir = makeIR({
      groups: [{ nodeId: 'g1', name: 'main', usingKeys: true, readonly: false, rules: [rule] }],
    });
    const result = collectCharContributors(ir, 'A');
    expect(result.descriptors).toEqual([
      {
        kind: 'keystroke',
        producedChar: 'A',
        producedRole: 'produced',
        keystrokeDisplay: 'Shift+a',
        inputSequence: ['Shift+a'],
        output: 'A',
      },
    ]);
  });

  it('kind "keystroke": a MULTI-vkey context yields the full ordered input sequence + joined output (e.g. "a + Shift+b -> GHG")', () => {
    // Two keystrokes (a, then Shift+b) producing a single multi-char literal
    // output "GHG" — the shape the pre-existing-method label must now show
    // as a full sequence, not just a single "Press" keystroke.
    const rule = makeRule('r-digraph',
      [
        { kind: 'vkey', name: 'K_A', modifiers: [] },
        { kind: 'vkey', name: 'K_B', modifiers: ['SHIFT'] },
      ],
      [{ kind: 'char', value: 'G' }, { kind: 'char', value: 'H' }, { kind: 'char', value: 'G' }],
    );
    const ir = makeIR({
      groups: [{ nodeId: 'g1', name: 'main', usingKeys: true, readonly: false, rules: [rule] }],
    });
    const result = collectCharContributors(ir, 'GHG');
    expect(result.descriptors).toEqual([
      {
        kind: 'keystroke',
        producedChar: 'GHG',
        producedRole: 'produced',
        inputSequence: ['a', 'Shift+b'],
        output: 'GHG',
      },
    ]);
  });

  it('kind "keystroke": a context element that cannot be rendered to a friendly token leaves inputSequence absent (fallback path)', () => {
    // `context(1)` (a previous-match reference) can't be summarized as a
    // single friendly token without simulating the input buffer.
    const rule = makeRule('r-ctxref',
      [
        { kind: 'vkey', name: 'K_A', modifiers: [] },
        { kind: 'context', offset: 1 },
      ],
      [{ kind: 'char', value: 'a' }],
    );
    const ir = makeIR({
      groups: [{ nodeId: 'g1', name: 'main', usingKeys: true, readonly: false, rules: [rule] }],
    });
    const result = collectCharContributors(ir, 'a');
    // `keystrokeDisplay` still resolves (it only ever looks at `vkey`
    // elements), but the new full-sequence fields are absent — a genuinely
    // unresolvable element aborts the WHOLE sequence rather than silently
    // dropping just that token.
    expect(result.descriptors).toEqual([
      { kind: 'keystroke', producedChar: 'a', producedRole: 'produced', keystrokeDisplay: 'a' },
    ]);
    expect(result.descriptors[0]).not.toHaveProperty('inputSequence');
    expect(result.descriptors[0]).not.toHaveProperty('output');
  });

  it('kind "deadkey": mark + base are cheaply derived from the trigger rule + aligned any() store (Cameroon fixture)', () => {
    const result = collectCharContributors(makeCameroonIR(), 'à');
    // 'à' lives only in dkt003b#0 (output slot) of the fan-out rule, whose
    // deadkey id 0x003b is set by the trigger rule's K_SEMICOLON, and whose
    // aligned dkf003b#0 base item is 'a'.
    expect(result.descriptors).toEqual([
      {
        kind: 'deadkey',
        producedChar: 'à',
        producedRole: 'produced',
        mark: 'SEMICOLON',
        base: 'a',
        // The fan-out rule's own context is `dk(0x003b) any(dkf003b)` — the
        // deadkey token resolves via the same trigger pre-pass as `mark`,
        // and the any() token resolves via the same aligned-slot lookup as
        // `base` (both at slot index 0, dkf003b's 'a').
        inputSequence: ['SEMICOLON', 'a'],
        output: 'à',
      },
    ]);
  });

  it('kind "deadkey": a punctuation-vkey trigger renders as its own glyph in inputSequence (e.g. "\' then a -> á"-shaped)', () => {
    // Trigger rule: an UNMODIFIED K_QUOTE sets the deadkey — vkeyDisplayName
    // maps K_QUOTE to the glyph "'" (no modifier prefix), so the fan-out's
    // inputSequence shows the glyph itself, not a raw vkey id or key name.
    const inputStore = makeStore('sid-base', 'baseChars', [{ kind: 'char', value: 'a' }]);
    const outputStore = makeStore('sid-acute', 'acuteChars', [{ kind: 'char', value: 'á' }]);
    const triggerRule = makeRule('r-trigger',
      [{ kind: 'vkey', name: 'K_QUOTE', modifiers: [] }],
      [{ kind: 'deadkey', id: 1 }],
    );
    const fanOutRule = makeRule('r-fanout',
      [{ kind: 'deadkey', id: 1 }, { kind: 'any', storeRef: 'baseChars' }],
      // offset is the 1-based position of the matched any() in the LHS
      // (spec.md §5 index() example) — position 2 here (deadkey is
      // position 1, any() is position 2), matching the Cameroon fixture's
      // dk(...) any(...) > index(..., 2) shape above.
      [{ kind: 'index', storeRef: 'acuteChars', offset: 2 }],
    );
    const ir = makeIR({
      stores: [inputStore, outputStore],
      groups: [{ nodeId: 'g1', name: 'main', usingKeys: true, readonly: false, rules: [triggerRule, fanOutRule] }],
    });
    const result = collectCharContributors(ir, 'á');
    expect(result.descriptors).toEqual([
      {
        kind: 'deadkey',
        producedChar: 'á',
        producedRole: 'produced',
        mark: "'",
        base: 'a',
        inputSequence: ["'", 'a'],
        output: 'á',
      },
    ]);
  });

  it('kind "deadkey": a rule with TWO any() context elements resolves `base` from the OUTPUT index() offset, never the first any() positionally (regression, km-keyman #2)', () => {
    // Fan-out rule context: dk(9), any(decoyAny) [position 2], any(alignedAny)
    // [position 3]. The output is `index(outStore, 3)` — 1-based offset 3
    // pairs with the THIRD context element (alignedAny), not the FIRST any()
    // found positionally (decoyAny). A naive `.find(el => el.kind === 'any')`
    // would wrongly report decoyAny's item ('wrong') as the base.
    const decoyStore = makeStore('sid-decoy', 'decoyAny', [
      { kind: 'char', value: 'y' }, { kind: 'char', value: 'y' }, { kind: 'char', value: 'wrong' },
    ]);
    const alignedStore = makeStore('sid-aligned', 'alignedAny', [
      { kind: 'char', value: 'q' }, { kind: 'char', value: 'q' }, { kind: 'char', value: 'q' },
    ]);
    const outStore = makeStore('sid-out', 'outStore', [
      { kind: 'char', value: 'x' }, { kind: 'char', value: 'x' }, { kind: 'char', value: 'ź' },
    ]);
    const triggerRule = makeRule('r-trigger-multi',
      [{ kind: 'vkey', name: 'K_SEMICOLON', modifiers: [] }],
      [{ kind: 'deadkey', id: 9 }],
    );
    const fanOutRule = makeRule('r-fanout-multi',
      [
        { kind: 'deadkey', id: 9 },
        { kind: 'any', storeRef: 'decoyAny' },
        { kind: 'any', storeRef: 'alignedAny' },
      ],
      [{ kind: 'index', storeRef: 'outStore', offset: 3 }],
    );
    const ir = makeIR({
      stores: [decoyStore, alignedStore, outStore],
      groups: [{
        nodeId: 'g1', name: 'main', usingKeys: true, readonly: false,
        rules: [triggerRule, fanOutRule],
      }],
    });
    const result = collectCharContributors(ir, 'ź');
    const deadkeyDescriptor = result.descriptors.find((d) => d.kind === 'deadkey');
    expect(deadkeyDescriptor).toBeDefined();
    // Base must come from `alignedAny` (the offset-paired store), never
    // `decoyAny` (the first any() found positionally).
    expect(deadkeyDescriptor?.base).toBe('q');
    expect(deadkeyDescriptor?.mark).toBe('SEMICOLON');
    // The full input sequence can't render: `decoyAny`'s any() element has no
    // known aligned slot (only the offset-paired position resolves), so the
    // sequence aborts rather than fabricate a token for it.
    expect(deadkeyDescriptor?.inputSequence).toBeUndefined();
  });

  it('kind "deadkey": an input-side-only match leaves mark/base absent (not cheaply derivable from that side alone), and is tagged producedRole "used"', () => {
    const result = collectCharContributors(makeCameroonIR(), 'a');
    // 'a' lives only in the any()-consumed input store dkf003b#0 — this is the
    // §0 "Input-store occurrence" case: 'a' is USED as a deadkey base by the
    // fan-out rule, never itself PRODUCED by it.
    expect(result.descriptors).toEqual([
      { kind: 'deadkey', producedChar: 'a', producedRole: 'used' },
    ]);
  });

  it('kind "deadkey": TWO trigger rules sharing a deadkey id with DIFFERENT keystrokes leave `mark` absent, deterministically (not last-write-wins)', () => {
    // Two distinct trigger rules both arm deadkey id 7 — one via K_SEMICOLON,
    // one via K_QUOTE. Which one is "the" mark is genuinely ambiguous, so
    // `mark` must stay absent rather than silently pick whichever rule the
    // pre-pass happened to visit last.
    const baseChars = makeStore('sid-base', 'baseChars', [{ kind: 'char', value: 'a' }]);
    const acuteChars = makeStore('sid-acute', 'acuteChars', [{ kind: 'char', value: 'á' }]);
    const triggerA = makeRule('r-trigger-a',
      [{ kind: 'vkey', name: 'K_SEMICOLON', modifiers: [] }],
      [{ kind: 'deadkey', id: 7 }],
    );
    const triggerB = makeRule('r-trigger-b',
      [{ kind: 'vkey', name: 'K_QUOTE', modifiers: [] }],
      [{ kind: 'deadkey', id: 7 }],
    );
    const fanOutRule = makeRule('r-fanout-shared',
      [{ kind: 'deadkey', id: 7 }, { kind: 'any', storeRef: 'baseChars' }],
      [{ kind: 'index', storeRef: 'acuteChars', offset: 2 }],
    );
    const ir = makeIR({
      stores: [baseChars, acuteChars],
      groups: [{
        nodeId: 'g1', name: 'main', usingKeys: true, readonly: false,
        rules: [triggerA, triggerB, fanOutRule],
      }],
    });
    const result = collectCharContributors(ir, 'á');
    const deadkeyDescriptor = result.descriptors.find((d) => d.kind === 'deadkey');
    expect(deadkeyDescriptor).toBeDefined();
    expect(deadkeyDescriptor?.mark).toBeUndefined();
    // `base` is still cheaply derivable (it doesn't depend on `mark`).
    expect(deadkeyDescriptor?.base).toBe('a');

    // Same result with the two trigger rules in the OPPOSITE order —
    // deterministic, not iteration-order-dependent.
    const irReversed = makeIR({
      stores: [baseChars, acuteChars],
      groups: [{
        nodeId: 'g1', name: 'main', usingKeys: true, readonly: false,
        rules: [triggerB, triggerA, fanOutRule],
      }],
    });
    const resultReversed = collectCharContributors(irReversed, 'á');
    const deadkeyDescriptorReversed = resultReversed.descriptors.find((d) => d.kind === 'deadkey');
    expect(deadkeyDescriptorReversed?.mark).toBeUndefined();
  });

  it('kind "store-slot": a plain (non-deadkey) fan-out gets a humanized storeDisplayName', () => {
    const keys = makeStore('sid-keys', 'keys', [
      { kind: 'char', value: 'a' }, { kind: 'char', value: 'e' }, { kind: 'char', value: 'z' },
    ]);
    const alphabet = makeStore('sid-alpha', 'kAlphabetTable', [
      { kind: 'char', value: 'a' }, { kind: 'char', value: 'ɛ' }, { kind: 'char', value: 'z' },
    ]);
    const rule = makeRule('r-base',
      [{ kind: 'any', storeRef: 'keys' }],
      [{ kind: 'index', storeRef: 'kAlphabetTable', offset: 1 }],
    );
    const ir = makeIR({
      stores: [keys, alphabet],
      groups: [{ nodeId: 'g1', name: 'main', usingKeys: true, readonly: false, rules: [rule] }],
    });
    const result = collectCharContributors(ir, 'ɛ');
    expect(result.descriptors).toEqual([
      {
        kind: 'store-slot',
        producedChar: 'ɛ',
        producedRole: 'produced',
        storeDisplayName: 'Alphabet Table',
        // 'ɛ' is at slot 1 of 'kAlphabetTable'; the rule's any()-consumed
        // 'keys' store at the SAME slot 1 is 'e' — the aligned input char,
        // surfaced both as the full inputSequence AND the typed inputChar.
        inputChar: 'e',
        inputSequence: ['e'],
        output: 'ɛ',
      },
    ]);
  });

  it('kind "store-slot": an un-humanizable raw store name (opaque token + digits) leaves storeDisplayName absent', () => {
    // 'keys' deliberately does NOT contain the target char, so the only match
    // is the OUTPUT side (index over 'tbl2') — isolates the raw-name case.
    const keys = makeStore('sid-keys', 'keys', [{ kind: 'char', value: 'z' }]);
    const tbl = makeStore('sid-tbl', 'tbl2', [{ kind: 'char', value: 'a' }]);
    const rule = makeRule('r-tbl2',
      [{ kind: 'any', storeRef: 'keys' }],
      [{ kind: 'index', storeRef: 'tbl2', offset: 1 }],
    );
    const ir = makeIR({
      stores: [keys, tbl],
      groups: [{ nodeId: 'g1', name: 'main', usingKeys: true, readonly: false, rules: [rule] }],
    });
    const result = collectCharContributors(ir, 'a');
    expect(result.descriptors).toEqual([
      {
        kind: 'store-slot',
        producedChar: 'a',
        producedRole: 'produced',
        // 'a' is at slot 0 of 'tbl2'; the rule's any()-consumed 'keys' store
        // at the SAME slot 0 is 'z' — the aligned input char, even though the
        // store's own name couldn't be humanized.
        inputChar: 'z',
        inputSequence: ['z'],
        output: 'a',
      },
    ]);
  });

  it('kind "store-slot": an aligned any()-consumed store item resolving to backspace (K_BKSP) is nominated for removal but never badged "produced"', () => {
    // The aligned store item is {kind:'vkey', name:'K_BKSP'} — the char is
    // only reachable through pressing Backspace, not typed directly in the
    // rule's context. This is the STORE-RESOLVED spelling of the same
    // deconstruction shape the direct-context `[K_BKSP]` case covers, so it
    // gets the same treatment: `producedRole: 'used'` (no green method row),
    // but still a removal target. It was previously omitted entirely, which is
    // the conflation the sil_cameroon_qwerty `æ` case exposed.
    const keys = makeStore('sid-keys', 'keys', [{ kind: 'vkey', name: 'K_BKSP' }]);
    const tbl = makeStore('sid-tbl', 'tbl2', [{ kind: 'char', value: 'a' }]);
    const rule = makeRule('r-tbl2',
      [{ kind: 'any', storeRef: 'keys' }],
      [{ kind: 'index', storeRef: 'tbl2', offset: 1 }],
    );
    const ir = makeIR({
      stores: [keys, tbl],
      groups: [{ nodeId: 'g1', name: 'main', usingKeys: true, readonly: false, rules: [rule] }],
    });
    const result = collectCharContributors(ir, 'a');
    expect(result.storeSlots).toEqual([{ slotId: 'sid-tbl#0', role: 'input' }]);
    expect(result.descriptors).toEqual([
      { kind: 'store-slot', producedChar: 'a', producedRole: 'used' },
    ]);
    // No `inputKeystroke: 'Backspace'` — pressing Backspace is not a way to
    // type the character, which is what that field would claim.
    expect(result.descriptors.some((d) => d.inputKeystroke !== undefined)).toBe(false);
  });

  it('kind "store-slot": a NON-backspace aligned any()-consumed vkey item is still attributed (widening is not over-broad)', () => {
    // Same shape as the dropped case above, but the aligned store item is a
    // different vkey (K_SPACE) — must still surface `inputKeystroke`, proving
    // the widened filter targets backspace specifically, not every vkey-typed
    // aligned item.
    const keys = makeStore('sid-keys', 'keys', [{ kind: 'vkey', name: 'K_SPACE' }]);
    const tbl = makeStore('sid-tbl', 'tbl2', [{ kind: 'char', value: 'a' }]);
    const rule = makeRule('r-tbl2',
      [{ kind: 'any', storeRef: 'keys' }],
      [{ kind: 'index', storeRef: 'tbl2', offset: 1 }],
    );
    const ir = makeIR({
      stores: [keys, tbl],
      groups: [{ nodeId: 'g1', name: 'main', usingKeys: true, readonly: false, rules: [rule] }],
    });
    const result = collectCharContributors(ir, 'a');
    expect(result.descriptors).toEqual([
      {
        kind: 'store-slot',
        producedChar: 'a',
        producedRole: 'produced',
        inputKeystroke: 'Space',
      },
    ]);
  });

  it('kind "blocked": an opaque RawKmnFragment producer gets blockedReasonCode "opaque-fragment"', () => {
    const ir = makeIR({
      raw: [{
        nodeId: 'frag-1',
        origin: 'imported',
        sourceText: '+ [K_E] > ε',
        producedOutput: [{ kind: 'char', value: 'ε' }],
        reason: 'call/return',
      }],
    });
    const result = collectCharContributors(ir, 'ε');
    expect(result.descriptors).toEqual([
      {
        kind: 'blocked',
        producedChar: 'ε',
        producedRole: 'produced',
        blockedReasonCode: 'opaque-fragment',
      },
    ]);
  });

  it('kind "blocked": a multi-char literal output gets blockedReasonCode "multi-char-output"', () => {
    const rule = makeRule('r-multi',
      [{ kind: 'vkey', name: 'K_A', modifiers: [] }],
      [{ kind: 'char', value: 'a' }, { kind: 'char', value: 'b' }],
    );
    const ir = makeIR({
      groups: [{ nodeId: 'g1', name: 'main', usingKeys: true, readonly: false, rules: [rule] }],
    });
    const result = collectCharContributors(ir, 'a');
    expect(result.descriptors).toEqual([
      {
        kind: 'blocked',
        producedChar: 'a',
        producedRole: 'produced',
        blockedReasonCode: 'multi-char-output',
      },
    ]);
  });

  it('a slot reached by BOTH an input-side match and an output-side production is tagged producedRole "produced" (never demoted to "used")', () => {
    // Self-paired store shape (`any(word) + [K_SPACE] > index(word, 1)`): the
    // SAME slot (sid-word#1) is visited once by the §0 input-store loop
    // (role 'input', producedRole 'used') and once by the store-produced-
    // target loop (role 'output', producedRole 'produced') — the
    // output-side descriptor must win, since the slot genuinely produces
    // the char.
    const word = makeStore('sid-word', 'word', [
      { kind: 'char', value: 'a' },
      { kind: 'char', value: 'ɛ' },
    ]);
    const ir = makeIR({
      stores: [word],
      groups: [{
        nodeId: 'g1', name: 'main', usingKeys: true, readonly: false,
        rules: [makeRule('r-self',
          [{ kind: 'any', storeRef: 'word' }],
          [{ kind: 'index', storeRef: 'word', offset: 1 }],
        )],
      }],
    });
    const result = collectCharContributors(ir, 'ɛ');
    expect(result.storeSlots).toEqual([{ slotId: 'sid-word#1', role: 'output' }]);
    expect(result.descriptors).toEqual([
      {
        kind: 'store-slot',
        producedChar: 'ɛ',
        producedRole: 'produced',
        storeDisplayName: 'Word',
        inputChar: 'ɛ',
        inputSequence: ['ɛ'],
        output: 'ɛ',
      },
    ]);
  });

  it('a slot reached by BOTH roles across TWO SEPARATE rules (output rule walked FIRST, input rule walked SECOND) still resolves to producedRole "produced" (walk-order independence — the reverse of the self-paired case above)', () => {
    // Unlike the self-paired fixture above (one rule, both roles), here two
    // DISTINCT rules touch the SAME store slot (sid-fanout#1): the EARLIER
    // rule's index() output PRODUCES the slot's char first, then the LATER
    // rule's any() context CONSUMES that same store slot as input. Output
    // dominance must hold regardless of which role's visit happens first in
    // walk order — this is the output-first-then-input direction; the test
    // above covers input-then-output.
    const fanout = makeStore('sid-fanout', 'fanout', [
      { kind: 'char', value: 'x' },
      { kind: 'char', value: 'ɛ' },
    ]);
    const outputRule = makeRule('r-out',
      [{ kind: 'vkey', name: 'K_A', modifiers: [] }],
      [{ kind: 'index', storeRef: 'fanout', offset: 1 }],
    );
    const inputRule = makeRule('r-in',
      [{ kind: 'any', storeRef: 'fanout' }],
      [{ kind: 'char', value: 'z' }],
    );
    const ir = makeIR({
      stores: [fanout],
      groups: [{
        nodeId: 'g1', name: 'main', usingKeys: true, readonly: false,
        rules: [outputRule, inputRule],
      }],
    });
    const result = collectCharContributors(ir, 'ɛ');
    expect(result.storeSlots).toEqual([{ slotId: 'sid-fanout#1', role: 'output' }]);
    expect(result.descriptors).toEqual([
      {
        kind: 'store-slot',
        producedChar: 'ɛ',
        producedRole: 'produced',
        storeDisplayName: 'Fanout',
        inputSequence: ['a'],
        output: 'ɛ',
      },
    ]);
  });

  it('descriptors is ordered rules, then store-slots, then blocked, and is length-parallel to those views', () => {
    const s01 = makeRule('r-s01',
      [{ kind: 'vkey', name: 'K_A', modifiers: [] }],
      [{ kind: 'char', value: 'a' }],
    );
    const ir = makeCameroonIR();
    ir.groups[0]!.rules.push(s01);
    const result = collectCharContributors(ir, 'a');
    expect(result.descriptors).toHaveLength(
      result.ruleNodeIds.length + result.storeSlots.length + result.blocked.length,
    );
    expect(result.descriptors[0]!.kind).toBe('keystroke');
    expect(result.descriptors[1]!.kind).toBe('deadkey');
  });
});

// ---------------------------------------------------------------------------
// produced vs. used — a rule that OUTPUTS a char is "produced" for it even
// when that same char ALSO appears on the rule's INPUT side; a rule is only
// "used" (blue, non-deletable) for a char when it appears as an input AND
// the rule does NOT output it. Canonical example: the deadkey rule
// "A + ◌̂ → Â" is green on Â's card (Â is the output) and blue on A's card (A
// is only an input; the rule outputs Â, not A).
// ---------------------------------------------------------------------------

describe('collectCharContributors — produced vs. used (rule-level production gate)', () => {
  /** `dk(x) + any(bases) > index(combined, k)` — bases=['A','E'], combined=['Â','Ê']. */
  function makeDeadkeyCombineIR(): KeyboardIR {
    const bases = makeStore('sid-bases', 'bases', [
      { kind: 'char', value: 'A' },
      { kind: 'char', value: 'E' },
    ]);
    const combined = makeStore('sid-combined', 'combined', [
      { kind: 'char', value: 'Â' },
      { kind: 'char', value: 'Ê' },
    ]);
    const triggerRule = makeRule('r-trigger',
      [{ kind: 'vkey', name: 'K_6', modifiers: ['SHIFT'] }],
      [{ kind: 'deadkey', id: 1 }],
    );
    const fanOutRule = makeRule('r-fanout',
      [{ kind: 'deadkey', id: 1 }, { kind: 'any', storeRef: 'bases' }],
      [{ kind: 'index', storeRef: 'combined', offset: 2 }],
    );
    return makeIR({
      stores: [bases, combined],
      groups: [{ nodeId: 'g1', name: 'main', usingKeys: true, readonly: false, rules: [triggerRule, fanOutRule] }],
    });
  }

  it('canonical example: target "A" (input-only) gets a "used" contributor — the rule outputs "Â", not "A"', () => {
    const ir = makeDeadkeyCombineIR();
    const result = collectCharContributors(ir, 'A');
    expect(result.storeSlots).toEqual([{ slotId: 'sid-bases#0', role: 'input' }]);
    expect(result.descriptors).toEqual([
      { kind: 'deadkey', producedChar: 'A', producedRole: 'used' },
    ]);
  });

  it('canonical example: target "Â" (the output) gets a "produced" contributor and NO "used" contributor', () => {
    const ir = makeDeadkeyCombineIR();
    const result = collectCharContributors(ir, 'Â');
    expect(result.storeSlots).toEqual([{ slotId: 'sid-combined#0', role: 'output' }]);
    expect(result.descriptors.some((d) => d.producedRole === 'used')).toBe(false);
    expect(result.descriptors.every((d) => d.producedRole === 'produced')).toBe(true);
  });

  it('a rule with C in an any() INPUT store that ALSO produces C (via a different store, same aligned slot) tags C "produced" — no "used" contributor is emitted for that rule', () => {
    // bases=['C','E'], combined=['C','Ê'] — the deadkey combination is a
    // no-op ("identity") at slot 0: pressing the deadkey then 'C' yields 'C'
    // again. The SAME rule both consumes 'C' (bases#0) and produces 'C'
    // (combined#0) — per the produced/used rule, this rule is green/
    // "produced" for 'C', and must NOT also surface a blue "used" row from
    // its input-side occurrence.
    const bases = makeStore('sid-bases', 'bases', [
      { kind: 'char', value: 'C' },
      { kind: 'char', value: 'E' },
    ]);
    const combined = makeStore('sid-combined', 'combined', [
      { kind: 'char', value: 'C' },
      { kind: 'char', value: 'Ê' },
    ]);
    const triggerRule = makeRule('r-trigger',
      [{ kind: 'vkey', name: 'K_6', modifiers: ['SHIFT'] }],
      [{ kind: 'deadkey', id: 1 }],
    );
    const fanOutRule = makeRule('r-fanout',
      [{ kind: 'deadkey', id: 1 }, { kind: 'any', storeRef: 'bases' }],
      [{ kind: 'index', storeRef: 'combined', offset: 2 }],
    );
    const ir = makeIR({
      stores: [bases, combined],
      groups: [{ nodeId: 'g1', name: 'main', usingKeys: true, readonly: false, rules: [triggerRule, fanOutRule] }],
    });
    const result = collectCharContributors(ir, 'C');
    expect(result.storeSlots).toEqual([{ slotId: 'sid-combined#0', role: 'output' }]);
    expect(result.descriptors.some((d) => d.producedRole === 'used')).toBe(false);
    expect(result.descriptors).toEqual([
      {
        kind: 'deadkey',
        producedChar: 'C',
        producedRole: 'produced',
        mark: 'Shift+6',
        base: 'C',
        inputSequence: ['Shift+6', 'C'],
        output: 'C',
      },
    ]);
  });

  it('a rule with C in an any() INPUT store that produces C via a LITERAL output (not a store) also tags C "produced" — no "used" contributor', () => {
    // `any(letters) + [K_SPACE] > "C"` — a rule that consumes a whole
    // any()-store (which happens to include 'C') but whose OUTPUT is the
    // fixed literal "C", regardless of which store item matched. The rule
    // still counts as producing 'C', so its own any()-consumed occurrence of
    // 'C' must not also be tagged "used".
    const letters = makeStore('sid-letters', 'letters', [
      { kind: 'char', value: 'C' },
      { kind: 'char', value: 'D' },
    ]);
    const rule = makeRule('r-literal',
      [{ kind: 'any', storeRef: 'letters' }, { kind: 'vkey', name: 'K_SPACE', modifiers: [] }],
      [{ kind: 'char', value: 'C' }],
    );
    const ir = makeIR({
      stores: [letters],
      groups: [{ nodeId: 'g1', name: 'main', usingKeys: true, readonly: false, rules: [rule] }],
    });
    const result = collectCharContributors(ir, 'C');
    expect(result.storeSlotIds).toHaveLength(0);
    expect(result.ruleNodeIds).toEqual(['r-literal']);
    expect(result.descriptors.some((d) => d.producedRole === 'used')).toBe(false);
  });

  it('a rule where C is only input and the output is a DIFFERENT char still tags C "used" (unchanged behavior)', () => {
    // Regression guard: the gate must not over-suppress — a rule that
    // genuinely never produces C keeps tagging its input-side occurrence
    // "used", exactly as before this fix.
    const ir = makeDeadkeyCombineIR();
    const result = collectCharContributors(ir, 'E');
    expect(result.storeSlots).toEqual([{ slotId: 'sid-bases#1', role: 'input' }]);
    expect(result.descriptors).toEqual([
      { kind: 'deadkey', producedChar: 'E', producedRole: 'used' },
    ]);
  });

  it('an output store whose ONLY occurrence of target sits at a backspace-aligned index is NOT a production — the rule\'s other any()-input occurrence of target is still tagged "used" (regression: ruleProducesChar backspace-alignment exclusion)', () => {
    // keys2 (any()-consumed INPUT store): index 0 = K_BKSP (backspace),
    // index 1 = 'a' — a genuine, non-backspace input occurrence of the target.
    const keys = makeStore('sid-keys', 'keys2', [
      { kind: 'vkey', name: 'K_BKSP' },
      { kind: 'char', value: 'a' },
    ]);
    // tbl2 (index()-targeted OUTPUT store): index 0 = 'a', aligned (same slot
    // index) with keys2's backspace item — a diacritic-removal/correction
    // slot the "(a)" loop itself never attributes as a production. index 1 =
    // 'b' (not the target), so 'a' has NO OTHER output-side occurrence.
    const tbl = makeStore('sid-tbl', 'tbl2', [
      { kind: 'char', value: 'a' },
      { kind: 'char', value: 'b' },
    ]);
    const rule = makeRule('r-tbl2',
      [{ kind: 'any', storeRef: 'keys2' }],
      [{ kind: 'index', storeRef: 'tbl2', offset: 1 }],
    );
    const ir = makeIR({
      stores: [keys, tbl],
      groups: [{ nodeId: 'g1', name: 'main', usingKeys: true, readonly: false, rules: [rule] }],
    });
    const result = collectCharContributors(ir, 'a');

    // No production attributed: the ONLY output-store occurrence of 'a' sits
    // at the backspace-aligned index, exactly like the "(a)" loop's own
    // per-slot exclusion (~850-853) — `ruleProducesChar` must agree, not
    // report a false-positive production for a slot "(a)"/"(b)" would never
    // themselves attribute.
    expect(result.storeSlots.some((s) => s.role === 'output')).toBe(false);
    expect(result.descriptors.some((d) => d.producedRole === 'produced')).toBe(false);

    // The rule's OTHER any()-input occurrence of 'a' (keys2#1, non-backspace)
    // IS attributed as "used" — the §0 gate no longer wrongly suppresses this
    // legitimate blue row now that `ruleProducesChar` correctly reports this
    // rule does NOT produce 'a'. The backspace-aligned OUTPUT slot (tbl2#0)
    // joins it as a removal target, also "used": reachable only by pressing
    // Backspace, so a deconstruction row rather than a method.
    expect(result.storeSlots).toEqual([
      { slotId: 'sid-keys#1', role: 'input' },
      { slotId: 'sid-tbl#0', role: 'input' },
    ]);
    expect(result.descriptors).toEqual([
      { kind: 'store-slot', producedChar: 'a', producedRole: 'used' },
      { kind: 'store-slot', producedChar: 'a', producedRole: 'used' },
    ]);
  });
});

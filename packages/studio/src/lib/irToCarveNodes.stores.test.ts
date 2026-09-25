// Tests for store rail nodes: StoreUsage.patternRefs, crossPairTrigger, paired-store fields, storeItemsAreKeys, and the store role line in irToCarveNodes.ts.
//
// Shared IR builders: ./__fixtures__/irToCarveNodes.ts.

import { describe, it, expect } from 'vitest';
import { toRailNodes, crossPairTrigger, storeItemsAreKeys, computeStoreRoleLine } from './irToCarveNodes.ts';
import { irGroup } from '@keyboard-studio/contracts/fixtures';
import { makeIR } from './__fixtures__/irToCarveNodes.ts';

// ---------------------------------------------------------------------------
// StoreUsage.patternRefs — analyzeStoreUsage via toRailNodes
// ---------------------------------------------------------------------------

describe('StoreUsage.patternRefs', () => {
  it('is empty when no recognized patterns exist', () => {
    const ir = makeIR({
      stores: [{ nodeId: 'store-1', name: 'composed', items: [], isSystem: false }],
      groups: [irGroup({
        nodeId: 'g1',
        rules: [{
          nodeId: 'rule-1',
          context: [{ kind: 'any', storeRef: 'composed' }],
          output: [{ kind: 'char', value: 'á' }],
        }],
      })],
      recognizedPatterns: [],
    });
    const nodes = toRailNodes(ir);
    const store = nodes.find((n) => n.name === 'composed');
    expect(store?.storeUsage?.patternRefs).toEqual([]);
  });

  it('populates patternRefs when a recognized pattern owns a rule referencing the store via any()', () => {
    const ir = makeIR({
      stores: [{ nodeId: 'store-1', name: 'composed', items: [], isSystem: false }],
      groups: [irGroup({
        nodeId: 'g1',
        rules: [{
          nodeId: 'rule-1',
          context: [{ kind: 'any', storeRef: 'composed' }],
          output: [{ kind: 'index', storeRef: 'comp-dia', position: 1 }],
          ownedByPattern: 'pattern-1',
        }],
      })],
      recognizedPatterns: [{
        id: 'pattern-1', title: 'Dead Keys', origin: 'recognized',
        ownedNodes: [{ kind: 'rule', nodeId: 'rule-1' }],
        description: '', category: 'substitute', appliesTo: [],
      }],
    });
    const nodes = toRailNodes(ir);
    const store = nodes.find((n) => n.name === 'composed');
    expect(store?.storeUsage?.patternRefs).toEqual([
      expect.objectContaining({ patternId: 'pattern-1', patternTitle: 'Dead Keys', ruleCount: 1 }),
    ]);
  });

  it('populates patternRefs for the output store (index()) too', () => {
    const ir = makeIR({
      stores: [{ nodeId: 'store-2', name: 'comp-dia', items: [], isSystem: false }],
      groups: [irGroup({
        nodeId: 'g1',
        rules: [{
          nodeId: 'rule-1',
          context: [{ kind: 'any', storeRef: 'composed' }],
          output: [{ kind: 'index', storeRef: 'comp-dia', position: 1 }],
          ownedByPattern: 'pattern-1',
        }],
      })],
      recognizedPatterns: [{
        id: 'pattern-1', title: 'Dead Keys', origin: 'recognized',
        ownedNodes: [{ kind: 'rule', nodeId: 'rule-1' }],
        description: '', category: 'substitute', appliesTo: [],
      }],
    });
    const nodes = toRailNodes(ir);
    const store = nodes.find((n) => n.name === 'comp-dia');
    expect(store?.storeUsage?.patternRefs).toEqual([
      expect.objectContaining({ patternId: 'pattern-1', patternTitle: 'Dead Keys', ruleCount: 1 }),
    ]);
  });

  it('is empty for a store used only in a non-pattern (unowned) rule', () => {
    const ir = makeIR({
      stores: [{ nodeId: 'store-1', name: 'composed', items: [], isSystem: false }],
      groups: [{
        nodeId: 'g1', name: 'main', usingKeys: true, readonly: false,
        rules: [{
          nodeId: 'rule-1',
          context: [{ kind: 'any', storeRef: 'composed' }],
          output: [{ kind: 'char', value: 'á' }],
          // no ownedByPattern — unowned rule
        }],
      }],
      recognizedPatterns: [{
        id: 'pattern-1', title: 'Dead Keys', origin: 'recognized',
        ownedNodes: [{ kind: 'rule', nodeId: 'rule-OTHER' }], // doesn't own rule-1
        description: '', category: 'substitute', appliesTo: [],
      }],
    });
    const nodes = toRailNodes(ir);
    const store = nodes.find((n) => n.name === 'composed');
    expect(store?.storeUsage?.patternRefs).toEqual([]);
  });

  it('groupRefs is empty when no unowned rules reference the store', () => {
    const ir = makeIR({
      stores: [{ nodeId: 'store-1', name: 'composed', items: [], isSystem: false }],
      groups: [irGroup({
        nodeId: 'g1',
        rules: [{ nodeId: 'rule-1', context: [{ kind: 'any', storeRef: 'composed' }], output: [{ kind: 'char', value: 'á' }], ownedByPattern: 'pattern-1' }],
      })],
      recognizedPatterns: [],
    });
    const nodes = toRailNodes(ir);
    const store = nodes.find((n) => n.name === 'composed');
    expect(store?.storeUsage?.groupRefs).toEqual([]);
  });

  it('populates groupRefs for unowned rules referencing the store', () => {
    const ir = makeIR({
      stores: [{ nodeId: 'store-1', name: 'composed', items: [], isSystem: false }],
      groups: [irGroup({
        nodeId: 'g1',
        rules: [{ nodeId: 'rule-1', context: [{ kind: 'any', storeRef: 'composed' }], output: [{ kind: 'char', value: 'á' }] }],
      })],
      recognizedPatterns: [],
    });
    const nodes = toRailNodes(ir);
    const store = nodes.find((n) => n.name === 'composed');
    expect(store?.storeUsage?.groupRefs).toEqual([
      expect.objectContaining({ groupId: 'g1', groupName: 'main', ruleCount: 1 }),
    ]);
  });

  it('aggregates rule count when a pattern owns multiple rules referencing the same store', () => {
    const ir = makeIR({
      stores: [{ nodeId: 'store-1', name: 'composed', items: [], isSystem: false }],
      groups: [irGroup({
        nodeId: 'g1',
        rules: [
          { nodeId: 'rule-1', context: [{ kind: 'any', storeRef: 'composed' }], output: [{ kind: 'index', storeRef: 'comp-dia', position: 1 }], ownedByPattern: 'pattern-1' },
          { nodeId: 'rule-2', context: [{ kind: 'any', storeRef: 'composed' }], output: [{ kind: 'index', storeRef: 'comp-dia2', position: 1 }], ownedByPattern: 'pattern-1' },
        ],
      })],
      recognizedPatterns: [{
        id: 'pattern-1', title: 'Dead Keys', origin: 'recognized',
        ownedNodes: [{ kind: 'rule', nodeId: 'rule-1' }, { kind: 'rule', nodeId: 'rule-2' }],
        description: '', category: 'substitute', appliesTo: [],
      }],
    });
    const nodes = toRailNodes(ir);
    const store = nodes.find((n) => n.name === 'composed');
    expect(store?.storeUsage?.patternRefs[0]?.ruleCount).toBe(2);
  });

  // #886 drift shape: ownedByPattern unset on the rule itself, but the rule's
  // nodeId IS listed in a recognized pattern's ownedNodes. Before the fix,
  // groupRefs only checked `rule.ownedByPattern !== undefined`, so this rule
  // was double-counted — once under patternRefs (via ownedNodes) and again
  // under groupRefs (because the per-rule stamp was missing). The fix adds
  // the collectOwnedNodeIds(ir) fallback so it is excluded from groupRefs.
  it('counts a rule in patternRefs only (not groupRefs) when ownedByPattern is unset but the rule is listed in a pattern\'s ownedNodes (#886 drift shape)', () => {
    const ir = makeIR({
      stores: [{ nodeId: 'store-1', name: 'composed', items: [], isSystem: false }],
      groups: [{
        nodeId: 'g1', name: 'main', usingKeys: true, readonly: false,
        rules: [{
          nodeId: 'rule-1',
          context: [{ kind: 'any', storeRef: 'composed' }],
          output: [{ kind: 'char', value: 'á' }],
          // no ownedByPattern stamp — this is the drift: ownership is only
          // recorded via the pattern's ownedNodes, not the per-rule field.
        }],
      }],
      recognizedPatterns: [{
        id: 'pattern-1', title: 'Dead Keys', origin: 'recognized',
        ownedNodes: [{ kind: 'rule', nodeId: 'rule-1' }],
        description: '', category: 'substitute', appliesTo: [],
      }],
    });
    const nodes = toRailNodes(ir);
    const store = nodes.find((n) => n.name === 'composed');
    expect(store?.storeUsage?.patternRefs).toEqual([
      expect.objectContaining({ patternId: 'pattern-1', patternTitle: 'Dead Keys', ruleCount: 1 }),
    ]);
    expect(store?.storeUsage?.groupRefs).toEqual([]);
  });

  // Companion case: proves the fix does not over-exclude. A rule that is
  // genuinely unowned — no ownedByPattern stamp AND not present in any
  // pattern's ownedNodes — must still surface under groupRefs.
  it('still counts a genuinely unowned rule (no ownedByPattern, not in any ownedNodes) under groupRefs', () => {
    const ir = makeIR({
      stores: [{ nodeId: 'store-1', name: 'composed', items: [], isSystem: false }],
      groups: [irGroup({
        nodeId: 'g1',
        rules: [{
          nodeId: 'rule-unowned',
          context: [{ kind: 'any', storeRef: 'composed' }],
          output: [{ kind: 'char', value: 'á' }],
        }],
      })],
      recognizedPatterns: [{
        id: 'pattern-1', title: 'Dead Keys', origin: 'recognized',
        ownedNodes: [{ kind: 'rule', nodeId: 'rule-1' }], // does not include rule-unowned
        description: '', category: 'substitute', appliesTo: [],
      }],
    });
    const nodes = toRailNodes(ir);
    const store = nodes.find((n) => n.name === 'composed');
    expect(store?.storeUsage?.groupRefs).toEqual([
      expect.objectContaining({ groupId: 'g1', groupName: 'main', ruleCount: 1 }),
    ]);
    expect(store?.storeUsage?.patternRefs).toEqual([]);
  });
});

// ---------------------------------------------------------------------------
// crossPairTrigger — display-only trigger lookup for a CONFIRMED
// describeStorePairing "cross" partner (#931 review: the Linked-pair panel's
// pairedStore* fields are now sourced from the engine's describeStorePairing,
// not the retired detectStorePairs cross-product heuristic — see the
// toRailNodes pairing describe block below for the over-pairing regression).
// ---------------------------------------------------------------------------

describe('crossPairTrigger', () => {
  it('returns undefined when no rule resolves the requested edge', () => {
    const ir = makeIR({ groups: [] });
    expect(crossPairTrigger('storeA', 'storeB', ir)).toBeUndefined();
  });

  it('returns undefined when the edge has no trigger (no + separator)', () => {
    const ir = makeIR({
      groups: [irGroup({
        nodeId: 'g1',
        rules: [{
          nodeId: 'r1',
          context: [{ kind: 'any', storeRef: 'storeA' }],
          output: [{ kind: 'index', storeRef: 'storeB', offset: 1 }],
        }],
      })],
    });
    expect(crossPairTrigger('storeA', 'storeB', ir)).toBeUndefined();
  });

  it('captures the trigger key (K_BKSP -> "Backspace") when present after the + separator', () => {
    const ir = makeIR({
      groups: [irGroup({
        nodeId: 'g1',
        rules: [{
          nodeId: 'r1',
          context: [
            { kind: 'any', storeRef: 'storeA' },
            { kind: 'raw', text: '+' },
            { kind: 'vkey', name: 'K_BKSP', modifiers: [] },
          ],
          output: [{ kind: 'index', storeRef: 'storeB', offset: 1 }],
        }],
      })],
    });
    expect(crossPairTrigger('storeA', 'storeB', ir)).toBe('Backspace');
    // Symmetric — works from either store's point of view.
    expect(crossPairTrigger('storeB', 'storeA', ir)).toBe('Backspace');
  });

  it('does not resolve an edge for a 2-any()/2-index() rule with own-offset resolution (the Cameroon shape)', () => {
    // platform('touch') any(word) any(final) + [K_SPACE] > index(word,2) index(final,3)
    // Each index() resolves to its OWN store at its own offset — never a
    // word<->final cross-pair. crossPairTrigger must not invent one.
    const ir = makeIR({
      groups: [irGroup({
        nodeId: 'g1',
        rules: [{
          nodeId: 'r1',
          context: [
            { kind: 'raw', text: "platform('touch')" },
            { kind: 'any', storeRef: 'word' },
            { kind: 'any', storeRef: 'final' },
            { kind: 'raw', text: '+' },
            { kind: 'vkey', name: 'K_SPACE', modifiers: [] },
          ],
          output: [
            { kind: 'index', storeRef: 'word', offset: 2 },
            { kind: 'index', storeRef: 'final', offset: 3 },
          ],
        }],
      })],
    });
    expect(crossPairTrigger('word', 'final', ir)).toBeUndefined();
  });

  it('deduplicates across multiple rules — the first resolved rule wins', () => {
    const ir = makeIR({
      groups: [irGroup({
        nodeId: 'g1',
        rules: [
          {
            nodeId: 'r1',
            context: [
              { kind: 'any', storeRef: 'storeA' },
              { kind: 'raw', text: '+' },
              { kind: 'vkey', name: 'K_BKSP', modifiers: [] },
            ],
            output: [{ kind: 'index', storeRef: 'storeB', offset: 1 }],
          },
          {
            nodeId: 'r2',
            context: [
              { kind: 'any', storeRef: 'storeA' },
              { kind: 'raw', text: '+' },
              { kind: 'vkey', name: 'K_A', modifiers: [] },
            ],
            output: [{ kind: 'index', storeRef: 'storeB', offset: 1 }],
          },
        ],
      })],
    });
    expect(crossPairTrigger('storeA', 'storeB', ir)).toBe('Backspace');
  });
});

// ---------------------------------------------------------------------------
// toRailNodes store pairedStoreIds / pairedStoreNames / pairedStoreTriggers
// ---------------------------------------------------------------------------

describe('toRailNodes store pairedStoreIds / pairedStoreNames / pairedStoreTriggers', () => {
  it('populates pairedStoreNames, pairedStoreIds, and pairedStoreTriggers for the input-side store', () => {
    const ir = makeIR({
      stores: [
        { nodeId: 'sid-A', name: 'storeA', items: [], isSystem: false },
        { nodeId: 'sid-B', name: 'storeB', items: [], isSystem: false },
      ],
      groups: [irGroup({
        nodeId: 'g1',
        rules: [{
          nodeId: 'r1',
          context: [
            { kind: 'any', storeRef: 'storeA' },
            { kind: 'raw', text: '+' },
            { kind: 'vkey', name: 'K_BKSP', modifiers: [] },
          ],
          output: [{ kind: 'index', storeRef: 'storeB', offset: 1 }],
        }],
      })],
    });
    const nodes = toRailNodes(ir);
    const nodeA = nodes.find((n) => n.name === 'storeA');
    expect(nodeA?.pairedStoreNames).toEqual(['storeB']);
    expect(nodeA?.pairedStoreIds).toEqual(['sid-B']);
    expect(nodeA?.pairedStoreTriggers).toEqual(['Backspace']);
  });

  it('populates fields for the output-side store too', () => {
    const ir = makeIR({
      stores: [
        { nodeId: 'sid-A', name: 'storeA', items: [], isSystem: false },
        { nodeId: 'sid-B', name: 'storeB', items: [], isSystem: false },
      ],
      groups: [irGroup({
        nodeId: 'g1',
        rules: [{
          nodeId: 'r1',
          context: [
            { kind: 'any', storeRef: 'storeA' },
            { kind: 'raw', text: '+' },
            { kind: 'vkey', name: 'K_BKSP', modifiers: [] },
          ],
          output: [{ kind: 'index', storeRef: 'storeB', offset: 1 }],
        }],
      })],
    });
    const nodes = toRailNodes(ir);
    const nodeB = nodes.find((n) => n.name === 'storeB');
    expect(nodeB?.pairedStoreNames).toEqual(['storeA']);
    expect(nodeB?.pairedStoreIds).toEqual(['sid-A']);
    expect(nodeB?.pairedStoreTriggers).toEqual(['Backspace']);
  });

  it('leaves all paired fields absent when store has no pair', () => {
    const ir = makeIR({
      stores: [
        { nodeId: 'sid-X', name: 'storeX', items: [], isSystem: false },
      ],
      groups: [irGroup({
        nodeId: 'g1',
        rules: [{
          nodeId: 'r1',
          context: [{ kind: 'char', value: 'a' }],
          output: [{ kind: 'char', value: 'b' }],
        }],
      })],
    });
    const nodes = toRailNodes(ir);
    const nodeX = nodes.find((n) => n.name === 'storeX');
    expect(nodeX?.pairedStoreIds).toBeUndefined();
    expect(nodeX?.pairedStoreNames).toBeUndefined();
    expect(nodeX?.pairedStoreTriggers).toBeUndefined();
  });

  // #931 review — MUST-FIX: the Inspector's "Linked pair" panel must never
  // show a partnership the engine's pairing graph doesn't actually couple.
  // The retired detectStorePairs cross-produced every any() against every
  // index() in a rule, which over-paired this exact shape (word<->final).
  // describeStorePairing resolves each index() to its own offset instead, so
  // word and final are each independently SELF-paired — no cross partner —
  // and the panel must show nothing for either store here.
  it("does NOT cross-pair a 2-any()/2-index() rule with own-offset resolution (Cameroon shape)", () => {
    const ir = makeIR({
      stores: [
        { nodeId: 'sid-word', name: 'word', items: [{ kind: 'char', value: 'a' }, { kind: 'char', value: 'b' }], isSystem: false },
        { nodeId: 'sid-final', name: 'final', items: [{ kind: 'char', value: '.' }, { kind: 'char', value: '!' }], isSystem: false },
      ],
      groups: [irGroup({
        nodeId: 'g1',
        rules: [{
          nodeId: 'r1',
          context: [
            { kind: 'raw', text: "platform('touch')" },
            { kind: 'any', storeRef: 'word' },
            { kind: 'any', storeRef: 'final' },
            { kind: 'raw', text: '+' },
            { kind: 'vkey', name: 'K_SPACE', modifiers: [] },
          ],
          output: [
            { kind: 'index', storeRef: 'word', offset: 2 },
            { kind: 'index', storeRef: 'final', offset: 3 },
          ],
        }],
      })],
    });
    const nodes = toRailNodes(ir);
    const nodeWord = nodes.find((n) => n.name === 'word');
    const nodeFinal = nodes.find((n) => n.name === 'final');
    expect(nodeWord?.pairedStoreNames).toBeUndefined();
    expect(nodeWord?.pairedStoreIds).toBeUndefined();
    expect(nodeWord?.pairedStoreTriggers).toBeUndefined();
    expect(nodeFinal?.pairedStoreNames).toBeUndefined();
    expect(nodeFinal?.pairedStoreIds).toBeUndefined();
    expect(nodeFinal?.pairedStoreTriggers).toBeUndefined();
  });
});

// ---------------------------------------------------------------------------
// storeItemsAreKeys — key-code vs literal-character detection
// ---------------------------------------------------------------------------

describe('storeItemsAreKeys', () => {
  it('returns true when any item has kind "vkey"', () => {
    expect(storeItemsAreKeys([{ kind: 'vkey', name: 'K_Q' }])).toBe(true);
  });

  it('returns false for a char-only store', () => {
    expect(storeItemsAreKeys([{ kind: 'char', value: 'a' }, { kind: 'char', value: 'b' }])).toBe(false);
  });

  it('returns false for an empty store', () => {
    expect(storeItemsAreKeys([])).toBe(false);
  });

  it('returns true for a mixed store containing at least one vkey', () => {
    expect(storeItemsAreKeys([{ kind: 'char', value: 'a' }, { kind: 'vkey', name: 'K_Q' }])).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// computeStoreRoleLine — role line wording
// ---------------------------------------------------------------------------

function makeUsage(asSource: boolean, asOutput: boolean): import('./irToCarveNodes.ts').StoreUsage {
  return { ruleCount: 1, asSource, asOutput, groupNames: [], patternRefs: [], groupRefs: [] };
}

describe('computeStoreRoleLine', () => {
  it('returns undefined when usage is undefined', () => {
    expect(computeStoreRoleLine(undefined, [])).toBeUndefined();
  });

  it('returns undefined when neither asSource nor asOutput', () => {
    expect(computeStoreRoleLine(makeUsage(false, false), [])).toBeUndefined();
  });

  it('output-only: returns "Output —" wording', () => {
    const text = computeStoreRoleLine(makeUsage(false, true), []);
    expect(text).toMatch(/^Output —/);
    expect(text).not.toMatch(/backspace/i);
    expect(text).not.toMatch(/deadkey/i);
  });

  it('input-only + char items: returns "Input — characters …" wording', () => {
    const text = computeStoreRoleLine(makeUsage(true, false), [{ kind: 'char', value: 'a' }]);
    expect(text).toMatch(/^Input —/i);
    expect(text).toMatch(/once typed/i);
    expect(text).not.toMatch(/keys you press/i);
  });

  it('input-only + vkey items: returns "Input — the keys you press" wording', () => {
    const text = computeStoreRoleLine(makeUsage(true, false), [{ kind: 'vkey', name: 'K_Q' }]);
    expect(text).toMatch(/^Input —/i);
    expect(text).toMatch(/keys you press/i);
    expect(text).not.toMatch(/once typed/i);
  });

  it('both: returns "Input + output —" wording', () => {
    const text = computeStoreRoleLine(makeUsage(true, true), []);
    expect(text).toMatch(/^Input \+ output —/i);
  });

  it('none of the role lines mention a specific trigger key name', () => {
    const lines = [
      computeStoreRoleLine(makeUsage(false, true), []),
      computeStoreRoleLine(makeUsage(true, false), [{ kind: 'char', value: 'a' }]),
      computeStoreRoleLine(makeUsage(true, false), [{ kind: 'vkey', name: 'K_Q' }]),
      computeStoreRoleLine(makeUsage(true, true), []),
    ];
    for (const line of lines) {
      expect(line).not.toMatch(/backspace/i);
      expect(line).not.toMatch(/K_/i);
    }
  });
});

// ---------------------------------------------------------------------------
// toRailNodes — storeRoleLine population
// ---------------------------------------------------------------------------

describe('toRailNodes storeRoleLine', () => {
  it('populates storeRoleLine for an output-side store (char items)', () => {
    const ir = makeIR({
      stores: [
        { nodeId: 'sid-A', name: 'storeA', items: [{ kind: 'char', value: 'a' }], isSystem: false },
        { nodeId: 'sid-B', name: 'storeB', items: [{ kind: 'char', value: 'x' }], isSystem: false },
      ],
      groups: [irGroup({
        nodeId: 'g1',
        rules: [{
          nodeId: 'r1',
          context: [{ kind: 'any', storeRef: 'storeA' }],
          output: [{ kind: 'index', storeRef: 'storeB', offset: 1 }],
        }],
      })],
    });
    const nodeB = toRailNodes(ir).find((n) => n.name === 'storeB');
    expect(nodeB?.storeRoleLine).toMatch(/^Output —/);
  });

  it('populates storeRoleLine for a vkey input-side store', () => {
    const ir = makeIR({
      stores: [
        { nodeId: 'sid-A', name: 'storeA', items: [{ kind: 'vkey', name: 'K_Q' }], isSystem: false },
        { nodeId: 'sid-B', name: 'storeB', items: [{ kind: 'char', value: 'x' }], isSystem: false },
      ],
      groups: [irGroup({
        nodeId: 'g1',
        rules: [{
          nodeId: 'r1',
          context: [{ kind: 'any', storeRef: 'storeA' }],
          output: [{ kind: 'index', storeRef: 'storeB', offset: 1 }],
        }],
      })],
    });
    const nodeA = toRailNodes(ir).find((n) => n.name === 'storeA');
    expect(nodeA?.storeRoleLine).toMatch(/keys you press/i);
  });

  it('leaves storeRoleLine absent for an unreferenced store', () => {
    const ir = makeIR({
      stores: [{ nodeId: 'sid-X', name: 'storeX', items: [], isSystem: false }],
      groups: [],
    });
    const nodeX = toRailNodes(ir).find((n) => n.name === 'storeX');
    expect(nodeX?.storeRoleLine).toBeUndefined();
  });
});

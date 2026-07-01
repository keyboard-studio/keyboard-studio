// Unit tests for the pure infoFor() and keyHint() functions in InfoView.tsx.

import { describe, it, expect } from 'vitest';
import { infoFor, keyHint, capabilityHint } from './InfoView.tsx';
import type { CarveNode } from '../../../lib/irToCarveNodes.ts';

// ---------------------------------------------------------------------------
// Minimal fixture helpers
// ---------------------------------------------------------------------------

function patternNode(name: string): CarveNode {
  return { nodeId: 'p1', kind: 'pattern', name };
}

function groupNode(name: string): CarveNode {
  return { nodeId: 'g1', kind: 'group', name };
}

function storeNode(
  name: string,
  overrides: Partial<CarveNode> = {},
): CarveNode {
  return { nodeId: 's1', kind: 'store', name, ...overrides };
}

function rawNode(name: string): CarveNode {
  return { nodeId: 'r1', kind: 'raw', name };
}

// ---------------------------------------------------------------------------
// Branch 1: undefined → overview
// ---------------------------------------------------------------------------

describe('infoFor(undefined)', () => {
  it('returns the carving overview title', () => {
    const { title } = infoFor(undefined);
    expect(title).toContain('Carving');
  });

  it('body mentions what the language needs', () => {
    const { body } = infoFor(undefined);
    expect(body).toMatch(/your language needs/i);
  });

  it('body mentions safe to remove', () => {
    const { body } = infoFor(undefined);
    expect(body).toMatch(/safe to remove/i);
  });
});

// ---------------------------------------------------------------------------
// Branch 2: kind === 'pattern'
// ---------------------------------------------------------------------------

describe("infoFor(kind='pattern')", () => {
  const node = patternNode('Basic Latin');

  it('title includes the node name', () => {
    expect(infoFor(node).title).toContain('Basic Latin');
  });

  it('body mentions pairing keys with the character they produce', () => {
    const { body } = infoFor(node);
    expect(body).toMatch(/pairs the keys/i);
  });

  it('body mentions related rules', () => {
    const { body } = infoFor(node);
    expect(body).toMatch(/rules/i);
  });
});

// ---------------------------------------------------------------------------
// Branch 3: kind === 'group'
// ---------------------------------------------------------------------------

describe("infoFor(kind='group')", () => {
  const node = groupNode('Consonants');

  it('title includes the node name', () => {
    expect(infoFor(node).title).toContain('Consonants');
  });

  it('body mentions a batch of rules', () => {
    const { body } = infoFor(node);
    expect(body).toMatch(/batch of rules/i);
  });

  it('body mentions that the carver could not map rules to a named pattern', () => {
    const { body } = infoFor(node);
    expect(body).toMatch(/recognized pattern/i);
  });

  it('body does NOT contain the word "raw"', () => {
    expect(infoFor(node).body).not.toMatch(/\braw\b/i);
  });
});

// ---------------------------------------------------------------------------
// Branch 4: kind === 'store', asSource=true, asOutput=false → INPUT variant
// ---------------------------------------------------------------------------

describe("infoFor(kind='store') — INPUT variant", () => {
  const node = storeNode('vowels', {
    storeUsage: { asSource: true, asOutput: false, ruleCount: 2, groupNames: ['main'] },
  });

  it('title includes the node name and "(input)"', () => {
    const { title } = infoFor(node);
    expect(title).toContain('vowels');
    expect(title).toMatch(/\(input\)/);
  });

  it('body describes characters checked as you type', () => {
    const { body } = infoFor(node);
    expect(body).toMatch(/check for|as you type|stop working/i);
  });
});

// ---------------------------------------------------------------------------
// Branch 5: kind === 'store', asSource=false, asOutput=true → OUTPUT variant
// ---------------------------------------------------------------------------

describe("infoFor(kind='store') — OUTPUT variant", () => {
  const node = storeNode('vowels', {
    storeUsage: { asSource: false, asOutput: true, ruleCount: 3, groupNames: ['main'] },
  });

  it('title includes the node name and "(output)"', () => {
    const { title } = infoFor(node);
    expect(title).toContain('vowels');
    expect(title).toMatch(/\(output\)/);
  });

  it('body mentions producing output', () => {
    const { body } = infoFor(node);
    expect(body).toMatch(/produce|produced|output/i);
  });
});

// ---------------------------------------------------------------------------
// Branch 6: kind === 'store', asSource=true, asOutput=true → IN+OUT variant
// ---------------------------------------------------------------------------

describe("infoFor(kind='store') — INPUT+OUTPUT variant", () => {
  const node = storeNode('vowels', {
    storeUsage: { asSource: true, asOutput: true, ruleCount: 5, groupNames: ['main', 'extra'] },
  });

  it('title includes the node name and "(input + output)"', () => {
    const { title } = infoFor(node);
    expect(title).toContain('vowels');
    expect(title).toContain('(input + output)');
  });

  it('body mentions both sides', () => {
    const { body } = infoFor(node);
    expect(body).toMatch(/both/i);
  });
});

// ---------------------------------------------------------------------------
// Branch 6b: kind === 'store', storeUsage present but asSource=false,
//            asOutput=false → DEFENSIVE "referenced" variant
//            (currently unreachable in production; defensive code path)
// ---------------------------------------------------------------------------

describe("infoFor(kind='store') — DEFENSIVE referenced variant", () => {
  const node = storeNode('mystery', {
    storeUsage: { asSource: false, asOutput: false, ruleCount: 1, groupNames: [] },
  });

  it('title includes the node name without "(input)", "(output)", or "(unused)"', () => {
    const { title } = infoFor(node);
    expect(title).toContain('mystery');
    expect(title).not.toContain('(input)');
    expect(title).not.toContain('(output)');
    expect(title).not.toContain('(unused)');
  });

  it('body says the store is referenced by rules', () => {
    expect(infoFor(node).body).toMatch(/referenced|used by some/i);
  });

  it('body does NOT say safe (it is not the unused copy)', () => {
    expect(infoFor(node).body).not.toMatch(/\bsafe\b/i);
  });
});

// ---------------------------------------------------------------------------
// Branch 7: kind === 'store', no storeUsage, referencedByLabel present
//           → PATTERN-OWNED variant
// ---------------------------------------------------------------------------

describe("infoFor(kind='store') — PATTERN-OWNED variant", () => {
  const node = storeNode('diacritics', {
    referencedByLabel: 'Combining Diacritics',
  });

  it('title includes the node name and "(pattern-owned)"', () => {
    const { title } = infoFor(node);
    expect(title).toContain('diacritics');
    expect(title).toContain('(pattern-owned)');
  });

  it('body mentions the referencedByLabel pattern name', () => {
    expect(infoFor(node).body).toContain('Combining Diacritics');
  });
});

// ---------------------------------------------------------------------------
// Branch 8: kind === 'store', no storeUsage, no referencedByLabel → UNUSED
// ---------------------------------------------------------------------------

describe("infoFor(kind='store') — UNUSED variant", () => {
  const node = storeNode('orphan');

  it('title includes the node name and "(unused)"', () => {
    const { title } = infoFor(node);
    expect(title).toContain('orphan');
    expect(title).toContain('(unused)');
  });

  it('body indicates safe to remove', () => {
    const { body } = infoFor(node);
    expect(body).toMatch(/safe/i);
  });

  it('body indicates the characters are not used', () => {
    const { body } = infoFor(node);
    expect(body).toMatch(/aren't used|not used/i);
  });
});

// ---------------------------------------------------------------------------
// Branch 9: kind === 'raw'
// ---------------------------------------------------------------------------

describe("infoFor(kind='raw')", () => {
  const node = rawNode('OpenType feature block');

  it('title contains "Advanced rule"', () => {
    expect(infoFor(node).title).toMatch(/Advanced rule/i);
  });

  it('title includes the node name', () => {
    expect(infoFor(node).title).toContain('OpenType feature block');
  });

  it('body mentions complexity or real work', () => {
    const { body } = infoFor(node);
    expect(body).toMatch(/too complex|real work|junk/i);
  });
});

// ---------------------------------------------------------------------------
// Distinctness: all four store variants return different bodies
// ---------------------------------------------------------------------------

describe('infoFor store variant distinctness', () => {
  const inputNode = storeNode('s', {
    storeUsage: { asSource: true, asOutput: false, ruleCount: 1, groupNames: [] },
  });
  const outputNode = storeNode('s', {
    storeUsage: { asSource: false, asOutput: true, ruleCount: 1, groupNames: [] },
  });
  const inOutNode = storeNode('s', {
    storeUsage: { asSource: true, asOutput: true, ruleCount: 1, groupNames: [] },
  });
  const patternOwnedNode = storeNode('s', { referencedByLabel: 'SomePattern' });
  const unusedNode = storeNode('s');

  it('input and output have different bodies', () => {
    expect(infoFor(inputNode).body).not.toEqual(infoFor(outputNode).body);
  });

  it('input and in+out have different bodies', () => {
    expect(infoFor(inputNode).body).not.toEqual(infoFor(inOutNode).body);
  });

  it('output and in+out have different bodies', () => {
    expect(infoFor(outputNode).body).not.toEqual(infoFor(inOutNode).body);
  });

  it('pattern-owned and unused have different bodies', () => {
    expect(infoFor(patternOwnedNode).body).not.toEqual(infoFor(unusedNode).body);
  });

  it('input and unused have different bodies', () => {
    expect(infoFor(inputNode).body).not.toEqual(infoFor(unusedNode).body);
  });
});

// ---------------------------------------------------------------------------
// keyHint() — pure function, off=false (active mapping) vs off=true (removed)
// ---------------------------------------------------------------------------

describe('keyHint(off=false)', () => {
  const hint = keyHint(false);

  it('mentions removing the mapping', () => {
    expect(hint).toMatch(/remove/i);
  });

  it('mentions keys will no longer type this character', () => {
    expect(hint).toMatch(/no longer type/i);
  });

  it('does NOT mention "restore" (that is the removed-state copy)', () => {
    expect(hint).not.toMatch(/\brestore\b/i);
  });
});

describe('keyHint(off=true)', () => {
  const hint = keyHint(true);

  it('offers to restore the mapping', () => {
    expect(hint).toMatch(/restore/i);
  });

  it('mentions keys will type this character again', () => {
    expect(hint).toMatch(/again/i);
  });

  it('does NOT say "no longer" (that is the active-state copy)', () => {
    expect(hint).not.toMatch(/no longer/i);
  });
});

describe('keyHint distinctness', () => {
  it('active and removed hints are different strings', () => {
    expect(keyHint(false)).not.toEqual(keyHint(true));
  });
});

// ---------------------------------------------------------------------------
// capabilityHint() — pure function, one hint per RemovalCapability value
// ---------------------------------------------------------------------------

describe('capabilityHint — removable:simple', () => {
  it('mentions direct key-to-character rule and safe', () => {
    const hint = capabilityHint('removable:simple');
    expect(hint).toMatch(/direct key.*character/i);
    expect(hint).toMatch(/safe/i);
  });
});

describe('capabilityHint — removable:slot-fill', () => {
  it('mentions deadkey character set', () => {
    const hint = capabilityHint('removable:slot-fill');
    expect(hint).toMatch(/deadkey character set/i);
  });
  it('mentions the rest keeps working', () => {
    expect(capabilityHint('removable:slot-fill')).toMatch(/rest working/i);
  });
});

describe('capabilityHint — not-removable:opaque', () => {
  it('mentions advanced syntax', () => {
    expect(capabilityHint('not-removable:opaque')).toMatch(/advanced syntax/i);
  });
  it("mentions removing won't take effect", () => {
    expect(capabilityHint('not-removable:opaque')).toMatch(/won't take effect|wont take effect/i);
  });
});

describe('capabilityHint — not-removable:context-sensitive', () => {
  it('explains the character only appears after certain keypresses', () => {
    expect(capabilityHint('not-removable:context-sensitive')).toMatch(/after certain keys are pressed/i);
  });
  it("explains removing on its own isn't supported yet", () => {
    const hint = capabilityHint('not-removable:context-sensitive');
    expect(hint).toMatch(/on its own/i);
    expect(hint).toMatch(/isn't supported yet/i);
  });
});

describe('capabilityHint — not-removable:unknown', () => {
  it("mentions couldn't determine", () => {
    expect(capabilityHint('not-removable:unknown')).toMatch(/couldn't determine|could not determine/i);
  });
});

describe('capabilityHint distinctness', () => {
  const vals = [
    'removable:simple',
    'removable:slot-fill',
    'not-removable:opaque',
    'not-removable:context-sensitive',
    'not-removable:unknown',
  ] as const;

  it('all 5 capability values produce distinct hint strings', () => {
    const hints = vals.map((v) => capabilityHint(v));
    const unique = new Set(hints);
    expect(unique.size).toBe(5);
  });
});

// ---------------------------------------------------------------------------
// RTL render — store-driven: InfoView reads from useHoverInfoStore, no props
// ---------------------------------------------------------------------------

import React from 'react';
import { afterEach, beforeEach } from 'vitest';
import { render, screen, cleanup } from '@testing-library/react';
import { InfoView } from './InfoView.tsx';
import { useHoverInfoStore } from '../../../stores/hoverInfoStore.ts';

// Reset the store and unmount any rendered components before/after each render
// test so DOM and Zustand state never leak between cases.
beforeEach(() => {
  useHoverInfoStore.setState({ info: null });
});
afterEach(() => {
  cleanup();
  useHoverInfoStore.setState({ info: null });
});

describe('<InfoView> info:null', () => {
  it('renders the role="note" shell even with no info', () => {
    render(<InfoView />);
    expect(screen.getByRole('note')).toBeTruthy();
  });

  it('shows no title or body text when info is null', () => {
    render(<InfoView />);
    // None of the distinctive copy from any variant should appear
    expect(document.body.textContent).not.toMatch(/Pattern:|Rule group:|Store:|Advanced rule:|Skip carving/);
  });
});

describe('<InfoView> kind:"key"', () => {
  it('renders the character and keyHint(false) text when off is false', () => {
    useHoverInfoStore.setState({
      info: { kind: 'key', keys: ['Shift', 'K_A'], ch: 'Á', off: false, capability: 'removable:simple' },
    });
    render(<InfoView />);

    expect(screen.getByText('Á')).toBeTruthy();
    const hint = keyHint(false);
    expect(document.body.textContent).toContain(hint.slice(0, 30));
  });

  it('renders the keyHint(true) restore text when off is true', () => {
    useHoverInfoStore.setState({
      info: { kind: 'key', keys: ['K_A'], ch: 'a', off: true, capability: 'not-removable:unknown' },
    });
    render(<InfoView />);

    const hint = keyHint(true);
    expect(document.body.textContent).toContain(hint.slice(0, 30));
  });

  it('renders the capabilityHint for removable:simple', () => {
    useHoverInfoStore.setState({
      info: { kind: 'key', keys: ['K_A'], ch: 'a', off: false, capability: 'removable:simple' },
    });
    render(<InfoView />);
    expect(document.body.textContent).toContain(capabilityHint('removable:simple').slice(0, 30));
  });

  it('renders the capabilityHint for removable:slot-fill', () => {
    useHoverInfoStore.setState({
      info: { kind: 'key', keys: ['‹dk›', 'a'], ch: 'À', off: false, capability: 'removable:slot-fill' },
    });
    render(<InfoView />);
    expect(document.body.textContent).toContain(capabilityHint('removable:slot-fill').slice(0, 30));
  });

  it('renders the capabilityHint for not-removable:opaque', () => {
    useHoverInfoStore.setState({
      info: { kind: 'key', keys: ['K_A'], ch: 'a', off: false, capability: 'not-removable:opaque' },
    });
    render(<InfoView />);
    expect(document.body.textContent).toContain(capabilityHint('not-removable:opaque').slice(0, 30));
  });

  it('renders the capabilityHint for not-removable:context-sensitive', () => {
    useHoverInfoStore.setState({
      info: { kind: 'key', keys: ['K_A'], ch: 'a', off: false, capability: 'not-removable:context-sensitive' },
    });
    render(<InfoView />);
    expect(document.body.textContent).toContain(capabilityHint('not-removable:context-sensitive').slice(0, 30));
  });

  it('renders the capabilityHint for not-removable:unknown', () => {
    useHoverInfoStore.setState({
      info: { kind: 'key', keys: ['K_A'], ch: 'a', off: false, capability: 'not-removable:unknown' },
    });
    render(<InfoView />);
    expect(document.body.textContent).toContain(capabilityHint('not-removable:unknown').slice(0, 30));
  });
});

describe('<InfoView> kind:"key" — #917 "Managed by" pattern-owner line', () => {
  it('shows "Managed by the Diacritics pattern." AND the generic capability hint for a not-removable chip with a pattern owner', () => {
    useHoverInfoStore.setState({
      info: {
        kind: 'key',
        keys: ['K_A'],
        ch: 'a',
        off: false,
        capability: 'not-removable:context-sensitive',
        owners: [{ kind: 'pattern', nodeId: 'p1', label: 'Diacritics' }],
      },
    });
    render(<InfoView />);

    expect(document.body.textContent).toContain('Managed by the Diacritics pattern.');
    expect(document.body.textContent).toContain(
      capabilityHint('not-removable:context-sensitive').slice(0, 30),
    );
  });

  it('does NOT show the "Managed by" line for a removable capability, even with a pattern owner', () => {
    useHoverInfoStore.setState({
      info: {
        kind: 'key',
        keys: ['K_A'],
        ch: 'a',
        off: false,
        capability: 'removable:simple',
        owners: [{ kind: 'pattern', nodeId: 'p1', label: 'Diacritics' }],
      },
    });
    render(<InfoView />);

    expect(document.body.textContent).not.toContain('Managed by');
    expect(document.body.textContent).toContain(capabilityHint('removable:simple').slice(0, 30));
  });

  it('does NOT show the "Managed by" line for a not-removable chip with no pattern owner', () => {
    useHoverInfoStore.setState({
      info: {
        kind: 'key',
        keys: ['K_A'],
        ch: 'a',
        off: false,
        capability: 'not-removable:context-sensitive',
      },
    });
    render(<InfoView />);

    expect(document.body.textContent).not.toContain('Managed by');
    expect(document.body.textContent).toContain(
      capabilityHint('not-removable:context-sensitive').slice(0, 30),
    );
  });

  it('does NOT show the "Managed by" line for a not-removable chip whose owners has only a store owner (no pattern owner)', () => {
    useHoverInfoStore.setState({
      info: {
        kind: 'key',
        keys: ['K_A'],
        ch: 'a',
        off: false,
        capability: 'not-removable:context-sensitive',
        owners: [{ kind: 'store', nodeId: 's1', label: 'vowels' }],
      },
    });
    render(<InfoView />);

    expect(document.body.textContent).not.toContain('Managed by');
  });
});

describe('<InfoView> kind:"node"', () => {
  it('renders the infoFor() title and body for a pattern CarveNode', () => {
    const node = patternNode('Basic Latin');
    useHoverInfoStore.setState({ info: { kind: 'node', node } });
    render(<InfoView />);

    const { title, body } = infoFor(node);
    expect(document.body.textContent).toContain(title);
    // A stable phrase from the pattern copy
    expect(document.body.textContent).toContain(body.slice(0, 30));
  });

  it('renders the infoFor() title and body for a group CarveNode', () => {
    const node = groupNode('Consonants');
    useHoverInfoStore.setState({ info: { kind: 'node', node } });
    render(<InfoView />);

    const { title } = infoFor(node);
    expect(document.body.textContent).toContain(title);
  });
});

describe('<InfoView> kind:"text"', () => {
  it('renders an arbitrary title and body', () => {
    useHoverInfoStore.setState({
      info: { kind: 'text', title: 'Skip carving', body: 'This keyboard is ready to use as-is.' },
    });
    render(<InfoView />);

    expect(document.body.textContent).toContain('Skip carving');
    expect(document.body.textContent).toContain('This keyboard is ready to use as-is.');
  });
});

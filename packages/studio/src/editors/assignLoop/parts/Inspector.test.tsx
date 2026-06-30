// Unit tests for storePairDescription() (pure) and the linked-pair section
// of <Inspector> / StoreDetail (RTL render).

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { storePairDescription } from './Inspector.tsx';
import type { CarveNode } from '../../../lib/irToCarveNodes.ts';

// ---------------------------------------------------------------------------
// storePairDescription — input side
// ---------------------------------------------------------------------------

describe('storePairDescription — input side (asSource=true, asOutput=false)', () => {
  const text = storePairDescription(true, false, ['storeB']);

  it('mentions the input side', () => {
    expect(text).toMatch(/input side/i);
  });

  it('mentions the paired store name', () => {
    expect(text).toContain('storeB');
  });

  it('describes one-for-one alignment', () => {
    expect(text).toMatch(/one-for-one/i);
  });

  it('does NOT say "output side"', () => {
    expect(text).not.toMatch(/output side/i);
  });

  it('does NOT mention "backspace" (trigger-agnostic)', () => {
    expect(text).not.toMatch(/backspace/i);
  });

  it('does NOT mention "deadkey" (trigger-agnostic)', () => {
    expect(text).not.toMatch(/deadkey/i);
  });
});

// ---------------------------------------------------------------------------
// storePairDescription — output side
// ---------------------------------------------------------------------------

describe('storePairDescription — output side (asSource=false, asOutput=true)', () => {
  const text = storePairDescription(false, true, ['storeA']);

  it('mentions the output side', () => {
    expect(text).toMatch(/output side/i);
  });

  it('describes one-for-one alignment', () => {
    expect(text).toMatch(/one-for-one/i);
  });

  it('mentions the paired store name', () => {
    expect(text).toContain('storeA');
  });

  it('does NOT say "input side"', () => {
    expect(text).not.toMatch(/input side/i);
  });

  it('does NOT mention "backspace" (trigger-agnostic)', () => {
    expect(text).not.toMatch(/backspace/i);
  });

  it('does NOT mention "deadkey" (trigger-agnostic)', () => {
    expect(text).not.toMatch(/deadkey/i);
  });
});

// ---------------------------------------------------------------------------
// storePairDescription — both sides / fallback
// ---------------------------------------------------------------------------

describe('storePairDescription — both sides (asSource=true, asOutput=true)', () => {
  const text = storePairDescription(true, true, ['storeC']);

  it('mentions the paired store name', () => {
    expect(text).toContain('storeC');
  });

  it('describes one-for-one alignment', () => {
    expect(text).toMatch(/one-for-one/i);
  });

  it('does NOT claim exclusively input or output side', () => {
    expect(text).not.toMatch(/^This is the input side/);
    expect(text).not.toMatch(/^This is the output side/);
  });

  it('does NOT mention "backspace" (trigger-agnostic)', () => {
    expect(text).not.toMatch(/backspace/i);
  });

  it('does NOT mention "deadkey" (trigger-agnostic)', () => {
    expect(text).not.toMatch(/deadkey/i);
  });
});

// ---------------------------------------------------------------------------
// storePairDescription — multiple paired stores
// ---------------------------------------------------------------------------

describe('storePairDescription — multiple paired stores', () => {
  const text = storePairDescription(true, false, ['alpha', 'beta']);

  it('includes all paired store names', () => {
    expect(text).toContain('alpha');
    expect(text).toContain('beta');
  });
});

// ---------------------------------------------------------------------------
// storePairDescription variant distinctness
// ---------------------------------------------------------------------------

describe('storePairDescription variant distinctness', () => {
  it('input-side and output-side produce different strings', () => {
    expect(storePairDescription(true, false, ['X'])).not.toEqual(storePairDescription(false, true, ['X']));
  });

  it('input-side and both-sides produce different strings', () => {
    expect(storePairDescription(true, false, ['X'])).not.toEqual(storePairDescription(true, true, ['X']));
  });

  it('output-side and both-sides produce different strings', () => {
    expect(storePairDescription(false, true, ['X'])).not.toEqual(storePairDescription(true, true, ['X']));
  });
});

// ---------------------------------------------------------------------------
// RTL render — <Inspector> StoreDetail linked-pair section
// ---------------------------------------------------------------------------

import React from 'react';
import { render, screen, fireEvent, cleanup } from '@testing-library/react';
import { Inspector } from './Inspector.tsx';
import { useHoverInfoStore } from '../../../stores/hoverInfoStore.ts';

function storeNode(overrides: Partial<CarveNode> = {}): CarveNode {
  return {
    nodeId: 's1',
    kind: 'store',
    name: 'vowels',
    ...overrides,
  };
}

const noDelete = () => false;
const noToggle = () => undefined;
const noSetMany = () => undefined;

beforeEach(() => {
  useHoverInfoStore.setState({ info: null });
});
afterEach(() => {
  cleanup();
  useHoverInfoStore.setState({ info: null });
});

describe('<Inspector> StoreDetail — linked-pair section absent when no pairedStoreNames', () => {
  it('does not render "Linked pair" when pairedStoreNames is absent', () => {
    const node = storeNode();
    render(
      <Inspector
        node={node}
        nodes={[node]}
        isItemDeleted={noDelete}
        onToggleGlyph={noToggle}
        onSetManyGlyphs={noSetMany}
        isDeleted={noDelete}
        onToggleNode={noToggle}
      />,
    );
    expect(document.body.textContent).not.toMatch(/linked pair/i);
  });

  it('does not render "Linked pair" when pairedStoreNames is empty', () => {
    const node = storeNode({ pairedStoreNames: [] });
    render(
      <Inspector
        node={node}
        nodes={[node]}
        isItemDeleted={noDelete}
        onToggleGlyph={noToggle}
        onSetManyGlyphs={noSetMany}
        isDeleted={noDelete}
        onToggleNode={noToggle}
      />,
    );
    expect(document.body.textContent).not.toMatch(/linked pair/i);
  });
});

describe('<Inspector> StoreDetail — linked-pair section, input side with Backspace trigger', () => {
  const node = storeNode({
    storeUsage: { asSource: true, asOutput: false, ruleCount: 3, groupNames: ['main'], patternRefs: [], groupRefs: [] },
    pairedStoreNames: ['outputs'],
    pairedStoreIds: ['sid-outputs'],
    pairedStoreTriggers: ['Backspace'],
  });

  it('renders "Linked pair" heading', () => {
    render(
      <Inspector
        node={node}
        nodes={[node]}
        isItemDeleted={noDelete}
        onToggleGlyph={noToggle}
        onSetManyGlyphs={noSetMany}
        isDeleted={noDelete}
        onToggleNode={noToggle}
      />,
    );
    expect(document.body.textContent).toMatch(/linked pair/i);
  });

  it('renders the paired store name', () => {
    render(
      <Inspector
        node={node}
        nodes={[node]}
        isItemDeleted={noDelete}
        onToggleGlyph={noToggle}
        onSetManyGlyphs={noSetMany}
        isDeleted={noDelete}
        onToggleNode={noToggle}
      />,
    );
    expect(document.body.textContent).toContain('outputs');
  });

  it('renders "Triggered by:" label with the trigger key', () => {
    render(
      <Inspector
        node={node}
        nodes={[node]}
        isItemDeleted={noDelete}
        onToggleGlyph={noToggle}
        onSetManyGlyphs={noSetMany}
        isDeleted={noDelete}
        onToggleNode={noToggle}
      />,
    );
    expect(document.body.textContent).toMatch(/triggered by/i);
    expect(document.body.textContent).toContain('Backspace');
  });

  it('renders input-side description with one-for-one wording (trigger-agnostic)', () => {
    render(
      <Inspector
        node={node}
        nodes={[node]}
        isItemDeleted={noDelete}
        onToggleGlyph={noToggle}
        onSetManyGlyphs={noSetMany}
        isDeleted={noDelete}
        onToggleNode={noToggle}
      />,
    );
    expect(document.body.textContent).toMatch(/input side/i);
    expect(document.body.textContent).toMatch(/one-for-one/i);
    expect(document.body.textContent).not.toMatch(/backspace-replace/i);
    expect(document.body.textContent).not.toMatch(/deadkey/i);
  });

  it('renders the caution line about removing breaking the mechanism', () => {
    render(
      <Inspector
        node={node}
        nodes={[node]}
        isItemDeleted={noDelete}
        onToggleGlyph={noToggle}
        onSetManyGlyphs={noSetMany}
        isDeleted={noDelete}
        onToggleNode={noToggle}
      />,
    );
    expect(document.body.textContent).toMatch(/break the mechanism/i);
  });
});

describe('<Inspector> StoreDetail — linked-pair section, output side', () => {
  const node = storeNode({
    storeUsage: { asSource: false, asOutput: true, ruleCount: 3, groupNames: ['main'], patternRefs: [], groupRefs: [] },
    pairedStoreNames: ['inputs'],
    pairedStoreIds: ['sid-inputs'],
    pairedStoreTriggers: ['Backspace'],
  });

  it('renders output-side description with one-for-one wording (trigger-agnostic)', () => {
    render(
      <Inspector
        node={node}
        nodes={[node]}
        isItemDeleted={noDelete}
        onToggleGlyph={noToggle}
        onSetManyGlyphs={noSetMany}
        isDeleted={noDelete}
        onToggleNode={noToggle}
      />,
    );
    expect(document.body.textContent).toMatch(/output side/i);
    expect(document.body.textContent).toMatch(/one-for-one/i);
    expect(document.body.textContent).not.toMatch(/backspace-replace/i);
  });

  it('renders the paired store name', () => {
    render(
      <Inspector
        node={node}
        nodes={[node]}
        isItemDeleted={noDelete}
        onToggleGlyph={noToggle}
        onSetManyGlyphs={noSetMany}
        isDeleted={noDelete}
        onToggleNode={noToggle}
      />,
    );
    expect(document.body.textContent).toContain('inputs');
  });
});

describe('<Inspector> StoreDetail — linked-pair section, unknown trigger', () => {
  const node = storeNode({
    storeUsage: { asSource: true, asOutput: false, ruleCount: 1, groupNames: ['main'], patternRefs: [], groupRefs: [] },
    pairedStoreNames: ['outputs'],
    pairedStoreIds: ['sid-outputs'],
    pairedStoreTriggers: [undefined],
  });

  it('does NOT render "Triggered by:" when trigger is undefined', () => {
    render(
      <Inspector
        node={node}
        nodes={[node]}
        isItemDeleted={noDelete}
        onToggleGlyph={noToggle}
        onSetManyGlyphs={noSetMany}
        isDeleted={noDelete}
        onToggleNode={noToggle}
      />,
    );
    expect(document.body.textContent).not.toMatch(/triggered by/i);
  });
});

// ---------------------------------------------------------------------------
// RTL — role chip (pairedStoreRoles)
// ---------------------------------------------------------------------------

describe('<Inspector> StoreDetail — paired store role chip', () => {
  it('renders "input" role chip for the paired store when pairedStoreRoles is ["input"]', () => {
    const node = storeNode({
      storeUsage: { asSource: false, asOutput: true, ruleCount: 2, groupNames: ['main'], patternRefs: [], groupRefs: [] },
      pairedStoreNames: ['baseStore'],
      pairedStoreIds: ['sid-base'],
      pairedStoreTriggers: ['Backspace'],
      pairedStoreRoles: ['input'],
    });
    render(
      <Inspector
        node={node}
        nodes={[node]}
        isItemDeleted={noDelete}
        onToggleGlyph={noToggle}
        onSetManyGlyphs={noSetMany}
        isDeleted={noDelete}
        onToggleNode={noToggle}
      />,
    );
    expect(document.body.textContent).toContain('input');
  });

  it('renders "output" role chip for the paired store when pairedStoreRoles is ["output"]', () => {
    const node = storeNode({
      storeUsage: { asSource: true, asOutput: false, ruleCount: 2, groupNames: ['main'], patternRefs: [], groupRefs: [] },
      pairedStoreNames: ['resultStore'],
      pairedStoreIds: ['sid-result'],
      pairedStoreTriggers: [undefined],
      pairedStoreRoles: ['output'],
    });
    render(
      <Inspector
        node={node}
        nodes={[node]}
        isItemDeleted={noDelete}
        onToggleGlyph={noToggle}
        onSetManyGlyphs={noSetMany}
        isDeleted={noDelete}
        onToggleNode={noToggle}
      />,
    );
    expect(document.body.textContent).toContain('output');
  });

  it('renders "in+out" role chip for the paired store when pairedStoreRoles is ["input+output"]', () => {
    const node = storeNode({
      storeUsage: { asSource: true, asOutput: false, ruleCount: 2, groupNames: ['main'], patternRefs: [], groupRefs: [] },
      pairedStoreNames: ['dualStore'],
      pairedStoreIds: ['sid-dual'],
      pairedStoreTriggers: [undefined],
      pairedStoreRoles: ['input+output'],
    });
    render(
      <Inspector
        node={node}
        nodes={[node]}
        isItemDeleted={noDelete}
        onToggleGlyph={noToggle}
        onSetManyGlyphs={noSetMany}
        isDeleted={noDelete}
        onToggleNode={noToggle}
      />,
    );
    expect(document.body.textContent).toContain('in+out');
  });
});

// ---------------------------------------------------------------------------
// RTL — click-to-navigate: onSelectNode is called with the paired store's nodeId
// ---------------------------------------------------------------------------

describe('<Inspector> StoreDetail — click-to-navigate paired store name', () => {
  it('calls onSelectNode with pairedStoreIds[0] when the paired store button is clicked', () => {
    const onSelectNode = vi.fn();
    const node = storeNode({
      storeUsage: { asSource: true, asOutput: false, ruleCount: 2, groupNames: ['main'], patternRefs: [], groupRefs: [] },
      pairedStoreNames: ['outputs'],
      pairedStoreIds: ['sid-outputs'],
      pairedStoreTriggers: ['Backspace'],
      pairedStoreRoles: ['output'],
    });
    render(
      <Inspector
        node={node}
        nodes={[node]}
        isItemDeleted={noDelete}
        onToggleGlyph={noToggle}
        onSetManyGlyphs={noSetMany}
        isDeleted={noDelete}
        onToggleNode={noToggle}
        onSelectNode={onSelectNode}
      />,
    );
    const btn = screen.getByRole('button', { name: /Go to store outputs/i });
    fireEvent.click(btn);
    expect(onSelectNode).toHaveBeenCalledOnce();
    expect(onSelectNode).toHaveBeenCalledWith('sid-outputs');
  });

  it('does NOT call onSelectNode when onSelectNode prop is absent (button is disabled)', () => {
    const node = storeNode({
      storeUsage: { asSource: true, asOutput: false, ruleCount: 1, groupNames: ['main'], patternRefs: [], groupRefs: [] },
      pairedStoreNames: ['outputs'],
      pairedStoreIds: ['sid-outputs'],
      pairedStoreTriggers: [undefined],
      pairedStoreRoles: ['output'],
    });
    render(
      <Inspector
        node={node}
        nodes={[node]}
        isItemDeleted={noDelete}
        onToggleGlyph={noToggle}
        onSetManyGlyphs={noSetMany}
        isDeleted={noDelete}
        onToggleNode={noToggle}
        // onSelectNode deliberately absent
      />,
    );
    // Button should exist but be disabled
    const btn = screen.getByRole('button', { name: /Go to store outputs/i });
    expect(btn).toHaveProperty('disabled', true);
  });
});

// ---------------------------------------------------------------------------
// RTL — storeRoleLine rendered at the top of StoreDetail
// ---------------------------------------------------------------------------

describe('<Inspector> StoreDetail — storeRoleLine, output store', () => {
  it('renders "Output —" role line', () => {
    const node = storeNode({
      storeUsage: { asSource: false, asOutput: true, ruleCount: 2, groupNames: ['main'], patternRefs: [], groupRefs: [] },
      storeRoleLine: 'Output — the characters this rule produces when the trigger is pressed.',
    });
    render(
      <Inspector
        node={node}
        nodes={[node]}
        isItemDeleted={noDelete}
        onToggleGlyph={noToggle}
        onSetManyGlyphs={noSetMany}
        isDeleted={noDelete}
        onToggleNode={noToggle}
      />,
    );
    expect(document.body.textContent).toMatch(/Output —/);
    expect(document.body.textContent).not.toMatch(/backspace/i);
  });
});

describe('<Inspector> StoreDetail — storeRoleLine, char-input store', () => {
  it('renders "Input — characters that, once typed …" role line', () => {
    const node = storeNode({
      storeUsage: { asSource: true, asOutput: false, ruleCount: 2, groupNames: ['main'], patternRefs: [], groupRefs: [] },
      storeRoleLine: 'Input — characters that, once typed, get transformed when the trigger is pressed.',
    });
    render(
      <Inspector
        node={node}
        nodes={[node]}
        isItemDeleted={noDelete}
        onToggleGlyph={noToggle}
        onSetManyGlyphs={noSetMany}
        isDeleted={noDelete}
        onToggleNode={noToggle}
      />,
    );
    expect(document.body.textContent).toMatch(/once typed/i);
    expect(document.body.textContent).not.toMatch(/backspace/i);
    expect(document.body.textContent).not.toMatch(/keys you press/i);
  });
});

describe('<Inspector> StoreDetail — storeRoleLine, vkey-input store', () => {
  it('renders "Input — the keys you press …" role line', () => {
    const node = storeNode({
      storeUsage: { asSource: true, asOutput: false, ruleCount: 2, groupNames: ['main'], patternRefs: [], groupRefs: [] },
      storeRoleLine: 'Input — the keys you press to produce the paired output character.',
    });
    render(
      <Inspector
        node={node}
        nodes={[node]}
        isItemDeleted={noDelete}
        onToggleGlyph={noToggle}
        onSetManyGlyphs={noSetMany}
        isDeleted={noDelete}
        onToggleNode={noToggle}
      />,
    );
    expect(document.body.textContent).toMatch(/keys you press/i);
    expect(document.body.textContent).not.toMatch(/backspace/i);
    expect(document.body.textContent).not.toMatch(/once typed/i);
  });
});

describe('<Inspector> StoreDetail — storeRoleLine absent when store has no role', () => {
  it('does not render a role line when storeRoleLine is undefined', () => {
    const node = storeNode(); // no storeUsage, no storeRoleLine
    render(
      <Inspector
        node={node}
        nodes={[node]}
        isItemDeleted={noDelete}
        onToggleGlyph={noToggle}
        onSetManyGlyphs={noSetMany}
        isDeleted={noDelete}
        onToggleNode={noToggle}
      />,
    );
    expect(document.body.textContent).not.toMatch(/^Output —/m);
    expect(document.body.textContent).not.toMatch(/^Input —/m);
    expect(document.body.textContent).not.toMatch(/^Input \+ output/m);
  });
});

// ---------------------------------------------------------------------------
// RTL — top-level trigger summary line
// ---------------------------------------------------------------------------

describe('<Inspector> StoreDetail — top trigger line, single pair with Backspace', () => {
  it('renders "Triggered by: Backspace" at the top when one distinct trigger', () => {
    const node = storeNode({
      pairedStoreNames: ['outputStore'],
      pairedStoreIds: ['store-outputStore'],
      pairedStoreTriggers: ['Backspace'],
      pairedStoreRoles: ['output'],
    });
    render(
      <Inspector
        node={node}
        nodes={[node]}
        isItemDeleted={noDelete}
        onToggleGlyph={noToggle}
        onSetManyGlyphs={noSetMany}
        isDeleted={noDelete}
        onToggleNode={noToggle}
      />,
    );
    expect(document.body.textContent).toMatch(/Triggered by:/);
    expect(document.body.textContent).toMatch(/Backspace/);
  });
});

describe('<Inspector> StoreDetail — top trigger line, two pairs with distinct triggers', () => {
  it('renders both triggers comma-joined and deduped', () => {
    const node = storeNode({
      pairedStoreNames: ['outputA', 'outputB'],
      pairedStoreIds: ['store-outputA', 'store-outputB'],
      pairedStoreTriggers: ['Backspace', 'Enter'],
      pairedStoreRoles: ['output', 'output'],
    });
    render(
      <Inspector
        node={node}
        nodes={[node]}
        isItemDeleted={noDelete}
        onToggleGlyph={noToggle}
        onSetManyGlyphs={noSetMany}
        isDeleted={noDelete}
        onToggleNode={noToggle}
      />,
    );
    expect(document.body.textContent).toMatch(/Triggered by:/);
    // Both labels present, comma-joined order (Backspace comes first alphabetically is not
    // guaranteed, so just assert both are present in the same Triggered-by context)
    expect(document.body.textContent).toMatch(/Backspace/);
    expect(document.body.textContent).toMatch(/Enter/);
  });

  it('deduplicates identical triggers across pairs', () => {
    const node = storeNode({
      pairedStoreNames: ['outputA', 'outputB'],
      pairedStoreIds: ['store-outputA', 'store-outputB'],
      pairedStoreTriggers: ['Backspace', 'Backspace'],
      pairedStoreRoles: ['output', 'output'],
    });
    render(
      <Inspector
        node={node}
        nodes={[node]}
        isItemDeleted={noDelete}
        onToggleGlyph={noToggle}
        onSetManyGlyphs={noSetMany}
        isDeleted={noDelete}
        onToggleNode={noToggle}
      />,
    );
    // "Backspace, Backspace" must NOT appear — dedupe collapses to one entry
    expect(document.body.textContent).not.toMatch(/Backspace,\s*Backspace/);
    expect(document.body.textContent).toMatch(/Backspace/);
  });
});

describe('<Inspector> StoreDetail — top trigger line absent when no captured trigger', () => {
  it('omits the top trigger line when all pairedStoreTriggers are undefined', () => {
    const node = storeNode({
      pairedStoreNames: ['outputStore'],
      pairedStoreIds: ['store-outputStore'],
      pairedStoreTriggers: [undefined],
      pairedStoreRoles: ['output'],
    });
    render(
      <Inspector
        node={node}
        nodes={[node]}
        isItemDeleted={noDelete}
        onToggleGlyph={noToggle}
        onSetManyGlyphs={noSetMany}
        isDeleted={noDelete}
        onToggleNode={noToggle}
      />,
    );
    // The per-pair "Triggered by:" line inside the Linked-pair box is also absent
    // (no trigger captured), so no "Triggered by:" text anywhere
    expect(document.body.textContent).not.toMatch(/Triggered by:/);
  });
});

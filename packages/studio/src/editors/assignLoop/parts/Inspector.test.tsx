// Unit tests for storePairDescription() (pure) and the linked-pair section
// of <Inspector> / StoreDetail (RTL render).

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { storePairDescription } from './Inspector.tsx';
import type { CarveNode, StoreCharChip } from '../../../lib/irToCarveNodes.ts';

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

  it('conveys BOTH-sided use (match-and-reproduce), not a one-way input/output split', () => {
    expect(text).toMatch(/both sides/i);
    // The old wording wrongly implied one store is input and the other output.
    expect(text).not.toMatch(/one providing the input/i);
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

const noDelete = () => false;
const noToggle = () => undefined;
const noSetMany = () => undefined;

function storeNode(overrides: Partial<CarveNode> = {}): CarveNode {
  return {
    nodeId: 's1',
    kind: 'store',
    name: 'vowels',
    ...overrides,
  };
}

beforeEach(() => {
  useHoverInfoStore.setState({ info: null });
});

// ---------------------------------------------------------------------------
// StoreDetail store-chip rendering (#523):
//   - Toggling a single chip calls onToggleGlyph with the chip's chipId.
//   - A disabled chip's click is a no-op; its disabledReason is surfaced
//     via hover info (delegated to StoreChip).
//   - "Remove all" / "Keep all" only ever targets the TOGGLEABLE chip ids.
//   - AC6 warning banner appears only when all toggleable chips are off,
//     they cover every char item, storeUsage.ruleCount > 0, and the store
//     is not whole-deleted.
// ---------------------------------------------------------------------------
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

const baseInspectorProps = {
  nodes: [] as CarveNode[],
  isItemDeleted: () => false,
  onToggleGlyph: vi.fn(),
  onSetManyGlyphs: vi.fn(),
  isDeleted: () => false,
  onToggleNode: vi.fn(),
};

function makeStoreNode(overrides: Partial<CarveNode> = {}): CarveNode {
  return {
    nodeId: 'store#s',
    kind: 'store',
    name: 'sX',
    ...overrides,
  };
}

describe('Inspector — StoreDetail chip toggle wiring', () => {
  it('clicking a toggleable chip calls onToggleGlyph with the chip chipId', () => {
    const onToggleGlyph = vi.fn();
    const chips: StoreCharChip[] = [
      { chipId: 'store#s#0', ch: 'a', itemsIndex: 0, action: 'drop' },
      { chipId: 'store#s#1', ch: 'b', itemsIndex: 1, action: 'drop' },
    ];
    const node = makeStoreNode({ storeChips: chips });
    render(<Inspector {...baseInspectorProps} node={node} nodes={[node]} onToggleGlyph={onToggleGlyph} />);

    fireEvent.click(screen.getByText('a'));
    expect(onToggleGlyph).toHaveBeenCalledWith('store#s#0');
  });

  it('clicking a disabled chip does NOT call onToggleGlyph and surfaces its disabledReason', () => {
    const onToggleGlyph = vi.fn();
    const chips: StoreCharChip[] = [
      { chipId: 'store#s#0', ch: 'a', itemsIndex: 0, action: 'disabled', disabledReason: 'blocked: reason text' },
    ];
    const node = makeStoreNode({ storeChips: chips });
    render(<Inspector {...baseInspectorProps} node={node} nodes={[node]} onToggleGlyph={onToggleGlyph} />);

    fireEvent.click(screen.getByText('a'));
    expect(onToggleGlyph).not.toHaveBeenCalled();
    const info = useHoverInfoStore.getState().info;
    expect(info).toMatchObject({ kind: 'text', title: 'Not removable', body: 'blocked: reason text' });
  });

  it('"Remove all" targets only the toggleable chip ids, excluding disabled chips', () => {
    const onSetManyGlyphs = vi.fn();
    const chips: StoreCharChip[] = [
      { chipId: 'store#s#0', ch: 'a', itemsIndex: 0, action: 'drop' },
      { chipId: 'store#s#1', ch: 'b', itemsIndex: 1, action: 'drop' },
      { chipId: 'store#s#2', ch: 'c', itemsIndex: 2, action: 'disabled', disabledReason: 'x' },
    ];
    const node = makeStoreNode({ storeChips: chips });
    render(<Inspector {...baseInspectorProps} node={node} nodes={[node]} onSetManyGlyphs={onSetManyGlyphs} />);

    fireEvent.click(screen.getByText('Remove all'));
    expect(onSetManyGlyphs).toHaveBeenCalledWith(['store#s#0', 'store#s#1'], true);
  });

  it('"Keep all" restores only the toggleable chip ids when all are already off', () => {
    const onSetManyGlyphs = vi.fn();
    const chips: StoreCharChip[] = [
      { chipId: 'store#s#0', ch: 'a', itemsIndex: 0, action: 'drop' },
      { chipId: 'store#s#1', ch: 'b', itemsIndex: 1, action: 'disabled', disabledReason: 'x' },
    ];
    const node = makeStoreNode({ storeChips: chips });
    const isItemDeleted = (id: string) => id === 'store#s#0';
    render(
      <Inspector
        {...baseInspectorProps}
        node={node}
        nodes={[node]}
        isItemDeleted={isItemDeleted}
        onSetManyGlyphs={onSetManyGlyphs}
      />,
    );

    fireEvent.click(screen.getByText('Keep all'));
    expect(onSetManyGlyphs).toHaveBeenCalledWith(['store#s#0'], false);
  });

  it('no bulk-action button renders when every chip is disabled', () => {
    const chips: StoreCharChip[] = [
      { chipId: 'store#s#0', ch: 'a', itemsIndex: 0, action: 'disabled', disabledReason: 'x' },
    ];
    const node = makeStoreNode({ storeChips: chips });
    render(<Inspector {...baseInspectorProps} node={node} nodes={[node]} />);

    expect(screen.queryByText('Remove all')).toBeNull();
    expect(screen.queryByText('Keep all')).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// #523 — onStoreCascade threading. StoreDetail must call onStoreCascade with
// (chipId, ch) when the prop is present, and fall back to the plain
// onToggleGlyph path (unchanged) when it's absent.
// ---------------------------------------------------------------------------

describe('Inspector — StoreDetail onStoreCascade wiring', () => {
  it('calls onStoreCascade(chipId, ch) instead of onToggleGlyph when the prop is present', () => {
    const onToggleGlyph = vi.fn();
    const onStoreCascade = vi.fn();
    const chips: StoreCharChip[] = [
      { chipId: 'store#s#0', ch: 'a', itemsIndex: 0, action: 'drop' },
    ];
    const node = makeStoreNode({ storeChips: chips });
    render(
      <Inspector
        {...baseInspectorProps}
        node={node}
        nodes={[node]}
        onToggleGlyph={onToggleGlyph}
        onStoreCascade={onStoreCascade}
      />,
    );

    fireEvent.click(screen.getByText('a'));
    expect(onStoreCascade).toHaveBeenCalledWith('store#s#0', 'a');
    expect(onToggleGlyph).not.toHaveBeenCalled();
  });

  it('falls back to onToggleGlyph when onStoreCascade is absent', () => {
    const onToggleGlyph = vi.fn();
    const chips: StoreCharChip[] = [
      { chipId: 'store#s#0', ch: 'a', itemsIndex: 0, action: 'drop' },
    ];
    const node = makeStoreNode({ storeChips: chips });
    render(<Inspector {...baseInspectorProps} node={node} nodes={[node]} onToggleGlyph={onToggleGlyph} />);

    fireEvent.click(screen.getByText('a'));
    expect(onToggleGlyph).toHaveBeenCalledWith('store#s#0');
  });

  it('a disabled chip never calls onStoreCascade, even when the prop is present', () => {
    const onStoreCascade = vi.fn();
    const chips: StoreCharChip[] = [
      { chipId: 'store#s#0', ch: 'a', itemsIndex: 0, action: 'disabled', disabledReason: 'blocked: reason text' },
    ];
    const node = makeStoreNode({ storeChips: chips });
    render(<Inspector {...baseInspectorProps} node={node} nodes={[node]} onStoreCascade={onStoreCascade} />);

    fireEvent.click(screen.getByText('a'));
    expect(onStoreCascade).not.toHaveBeenCalled();
  });
});

describe('Inspector — StoreDetail AC6 "empties the store" warning banner', () => {
  const AC6_TEXT = 'This will empty the store — the mechanism depending on it will stop working';
  // Drop-class stores are the only class that can still show this banner:
  // classifyStoreSlotEdit's "drop" mode is exactly any()-referenced-unpaired
  // or unreferenced, and applyStoreSlotRemovals refuses to empty the
  // any()-referenced sub-case — matching this second line.
  const AC6_DROP_TEXT =
    "To keep the keyboard buildable, the built keyboard keeps this store's characters until at least one stays active — remove the whole store instead if you no longer need it.";
  // Nul-fill class stores never actually shrink items[] — the second line
  // reflects that the mechanism keeps working, just producing no output.
  const AC6_NUL_FILL_TEXT =
    "Each removed character's slot outputs nothing (nul) in the built keyboard; the mechanism stays but produces no output.";

  it('shows the drop-class second line when all toggleable chips are off, they cover every char item, and the store has rule dependents', () => {
    const chips: StoreCharChip[] = [
      { chipId: 'store#s#0', ch: 'a', itemsIndex: 0, action: 'drop' },
      { chipId: 'store#s#1', ch: 'b', itemsIndex: 1, action: 'drop' },
    ];
    const node = makeStoreNode({
      storeChips: chips,
      storeUsage: { ruleCount: 2, asSource: true, asOutput: false, groupNames: ['main'], patternRefs: [], groupRefs: [] },
    });
    const isItemDeleted = () => true; // all chips off
    render(<Inspector {...baseInspectorProps} node={node} nodes={[node]} isItemDeleted={isItemDeleted} />);

    expect(screen.getByText(AC6_TEXT)).toBeDefined();
    // Second line: explains the engine's refusal-to-empty guard so authors
    // understand why the store keeps one character until they delete it outright.
    expect(screen.getByText(AC6_DROP_TEXT)).toBeDefined();
    expect(screen.queryByText(AC6_NUL_FILL_TEXT)).toBeNull();
  });

  it('shows the nul-fill-class second line when all toggleable chips are off on a nul-fill store', () => {
    const chips: StoreCharChip[] = [
      { chipId: 'store#s#0', ch: 'a', itemsIndex: 0, action: 'nul-fill' },
      { chipId: 'store#s#1', ch: 'b', itemsIndex: 1, action: 'nul-fill' },
    ];
    const node = makeStoreNode({
      storeChips: chips,
      storeUsage: { ruleCount: 2, asSource: false, asOutput: true, groupNames: ['main'], patternRefs: [], groupRefs: [] },
    });
    const isItemDeleted = () => true; // all chips off
    render(<Inspector {...baseInspectorProps} node={node} nodes={[node]} isItemDeleted={isItemDeleted} />);

    expect(screen.getByText(AC6_TEXT)).toBeDefined();
    expect(screen.getByText(AC6_NUL_FILL_TEXT)).toBeDefined();
    expect(screen.queryByText(AC6_DROP_TEXT)).toBeNull();
  });

  it('does NOT show the banner when some toggleable chips are still on (not fully off)', () => {
    const chips: StoreCharChip[] = [
      { chipId: 'store#s#0', ch: 'a', itemsIndex: 0, action: 'drop' },
      { chipId: 'store#s#1', ch: 'b', itemsIndex: 1, action: 'drop' },
    ];
    const node = makeStoreNode({
      storeChips: chips,
      storeUsage: { ruleCount: 2, asSource: true, asOutput: false, groupNames: ['main'], patternRefs: [], groupRefs: [] },
    });
    const isItemDeleted = (id: string) => id === 'store#s#0'; // only one off
    render(<Inspector {...baseInspectorProps} node={node} nodes={[node]} isItemDeleted={isItemDeleted} />);

    expect(screen.queryByText(AC6_TEXT)).toBeNull();
    expect(screen.queryByText(AC6_DROP_TEXT)).toBeNull();
  });

  it('does NOT show the banner when the store has no rule dependents (ruleCount 0 / storeUsage undefined)', () => {
    const chips: StoreCharChip[] = [
      { chipId: 'store#s#0', ch: 'a', itemsIndex: 0, action: 'drop' },
    ];
    const node = makeStoreNode({ storeChips: chips }); // storeUsage undefined
    const isItemDeleted = () => true;
    render(<Inspector {...baseInspectorProps} node={node} nodes={[node]} isItemDeleted={isItemDeleted} />);

    expect(screen.queryByText(AC6_TEXT)).toBeNull();
  });

  it('does NOT show the banner when a disabled chip hides an uncovered char (toggleable chips do not cover every char item)', () => {
    const chips: StoreCharChip[] = [
      { chipId: 'store#s#0', ch: 'a', itemsIndex: 0, action: 'drop' },
      { chipId: 'store#s#1', ch: 'b', itemsIndex: 1, action: 'disabled', disabledReason: 'x' },
    ];
    const node = makeStoreNode({
      storeChips: chips,
      storeUsage: { ruleCount: 1, asSource: true, asOutput: false, groupNames: ['main'], patternRefs: [], groupRefs: [] },
    });
    const isItemDeleted = (id: string) => id === 'store#s#0'; // the only toggleable chip is off
    render(<Inspector {...baseInspectorProps} node={node} nodes={[node]} isItemDeleted={isItemDeleted} />);

    expect(screen.queryByText(AC6_TEXT)).toBeNull();
  });

  it('does NOT show the banner when the store itself is whole-deleted', () => {
    const chips: StoreCharChip[] = [
      { chipId: 'store#s#0', ch: 'a', itemsIndex: 0, action: 'drop' },
    ];
    const node = makeStoreNode({
      storeChips: chips,
      storeUsage: { ruleCount: 1, asSource: true, asOutput: false, groupNames: ['main'], patternRefs: [], groupRefs: [] },
    });
    const isItemDeleted = () => true;
    const isDeleted = (id: string) => id === 'store#s';
    render(
      <Inspector
        {...baseInspectorProps}
        node={node}
        nodes={[node]}
        isItemDeleted={isItemDeleted}
        isDeleted={isDeleted}
      />,
    );

    expect(screen.queryByText(AC6_TEXT)).toBeNull();
  });
});

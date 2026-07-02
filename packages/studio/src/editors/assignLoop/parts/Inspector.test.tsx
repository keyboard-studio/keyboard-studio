// Tests for Inspector.tsx's StoreDetail store-chip rendering (#523).
//
// Coverage:
//   - Toggling a single chip calls onToggleGlyph with the chip's chipId.
//   - A disabled chip's click is a no-op for onToggleGlyph, and its
//     disabledReason is surfaced via hover info (delegated to StoreChip;
//     asserted end-to-end through the rendered Inspector tree here).
//   - "Remove all" / "Keep all" only ever targets the TOGGLEABLE chip ids
//     (never a disabled chip's id).
//   - AC6 warning banner appears exactly under its trigger conditions:
//     all toggleable chips off + toggleable chips cover every char item +
//     storeUsage.ruleCount > 0 + store not whole-deleted.

import { describe, it, expect, afterEach, vi } from 'vitest';
import { render, cleanup, fireEvent, screen } from '@testing-library/react';
import { Inspector } from './Inspector.tsx';
import { useHoverInfoStore } from '../../../stores/hoverInfoStore.ts';
import type { CarveNode, StoreCharChip } from '../../../lib/irToCarveNodes.ts';

afterEach(() => {
  cleanup();
  useHoverInfoStore.setState({ info: null });
});

function makeStoreNode(overrides: Partial<CarveNode> = {}): CarveNode {
  return {
    nodeId: 'store#s',
    kind: 'store',
    name: 'sX',
    ...overrides,
  };
}

const baseInspectorProps = {
  nodes: [] as CarveNode[],
  isItemDeleted: () => false,
  onToggleGlyph: vi.fn(),
  onSetManyGlyphs: vi.fn(),
  isDeleted: () => false,
  onToggleNode: vi.fn(),
};

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

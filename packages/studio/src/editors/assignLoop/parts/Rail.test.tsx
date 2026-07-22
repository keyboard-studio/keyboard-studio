// Tests for Rail.tsx's store-node rendering (#523 triage CR4).
//
// Coverage:
//   - keptN/total counts for a store node are computed over TOGGLEABLE chips
//     only — a disabled chip is excluded from the denominator entirely (it
//     never appears as a "1 of 3" when one of three chips is disabled; it
//     shows "1 of 2").
//   - Tri-state ToggleBox aria-label reflects on/partial/off for a store
//     node driven by its storeChips (via nodeState -> idsTriState).
//   - Clicking the store's ToggleBox with usesChipCounts true calls
//     onSetManyGlyphs with exactly the toggleable chip ids, in both
//     directions: some-off -> restore-all (off=false), all-on -> remove-all
//     (off=true).
//   - A store with NO toggleable chips (all disabled, or no chips at all)
//     falls back to the whole-node onToggleNode toggle instead of
//     onSetManyGlyphs.

import { describe, it, expect, afterEach, vi } from 'vitest';
import { cleanup, fireEvent, screen } from '@testing-library/react';
import { render } from '../../../test/renderWithI18n.tsx';
import { Rail } from './Rail.tsx';
import { useHoverInfoStore } from '../../../stores/hoverInfoStore.ts';
import type { CarveNode, StoreCharChip } from '../../../lib/irToCarveNodes.ts';

afterEach(() => {
  cleanup();
  useHoverInfoStore.setState({ info: null });
});

const baseRailProps = {
  selectedId: null,
  onSelect: vi.fn(),
  isItemDeleted: () => false,
  isDeleted: () => false,
  onSetManyGlyphs: vi.fn(),
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

describe('Rail — store node keptN/total counts over toggleable chips only', () => {
  it('excludes a disabled chip from the denominator: 1 disabled + 2 toggleable (1 kept) shows "1/2", not "1/3"', () => {
    const chips: StoreCharChip[] = [
      { chipId: 'store#s#0', ch: 'a', itemsIndex: 0, action: 'drop' },
      { chipId: 'store#s#1', ch: 'b', itemsIndex: 1, action: 'drop' },
      { chipId: 'store#s#2', ch: 'c', itemsIndex: 2, action: 'disabled', disabledReason: 'x' },
    ];
    const node = makeStoreNode({ storeChips: chips });
    // Only chip #1 ('b') is deleted; chip #0 ('a') stays, disabled chip #2 is irrelevant.
    const isItemDeleted = (id: string) => id === 'store#s#1';
    render(<Rail {...baseRailProps} nodes={[node]} isItemDeleted={isItemDeleted} />);

    expect(screen.getByText('1/2')).toBeDefined();
    expect(screen.queryByText('1/3')).toBeNull();
    expect(screen.queryByText('2/3')).toBeNull();
  });

  it('reports 2/2 when both toggleable chips are kept, ignoring an unrelated disabled chip', () => {
    const chips: StoreCharChip[] = [
      { chipId: 'store#s#0', ch: 'a', itemsIndex: 0, action: 'drop' },
      { chipId: 'store#s#1', ch: 'b', itemsIndex: 1, action: 'drop' },
      { chipId: 'store#s#2', ch: 'c', itemsIndex: 2, action: 'disabled', disabledReason: 'x' },
    ];
    const node = makeStoreNode({ storeChips: chips });
    render(<Rail {...baseRailProps} nodes={[node]} isItemDeleted={() => false} />);

    expect(screen.getByText('2/2')).toBeDefined();
  });
});

describe('Rail — store node tri-state ToggleBox', () => {
  it('renders aria-label "Remove" (on state) when every toggleable chip is kept', () => {
    const chips: StoreCharChip[] = [
      { chipId: 'store#s#0', ch: 'a', itemsIndex: 0, action: 'drop' },
      { chipId: 'store#s#1', ch: 'b', itemsIndex: 1, action: 'drop' },
    ];
    const node = makeStoreNode({ storeChips: chips });
    render(<Rail {...baseRailProps} nodes={[node]} isItemDeleted={() => false} />);

    expect(screen.getByRole('button', { name: 'Remove' })).toBeDefined();
  });

  it('renders aria-label "Keep" (off state) when every toggleable chip is removed', () => {
    const chips: StoreCharChip[] = [
      { chipId: 'store#s#0', ch: 'a', itemsIndex: 0, action: 'drop' },
      { chipId: 'store#s#1', ch: 'b', itemsIndex: 1, action: 'drop' },
    ];
    const node = makeStoreNode({ storeChips: chips });
    render(<Rail {...baseRailProps} nodes={[node]} isItemDeleted={() => true} />);

    expect(screen.getByRole('button', { name: 'Keep' })).toBeDefined();
  });

  it('renders aria-label "Remove" for the partial state too (ToggleBox has no distinct partial label)', () => {
    // Partial state maps to the same "Remove" aria-label as "on" in ToggleBox
    // (only `off` flips the label); the visual partial dash is what
    // distinguishes it, not the accessible name.
    const chips: StoreCharChip[] = [
      { chipId: 'store#s#0', ch: 'a', itemsIndex: 0, action: 'drop' },
      { chipId: 'store#s#1', ch: 'b', itemsIndex: 1, action: 'drop' },
    ];
    const node = makeStoreNode({ storeChips: chips });
    const isItemDeleted = (id: string) => id === 'store#s#0';
    render(<Rail {...baseRailProps} nodes={[node]} isItemDeleted={isItemDeleted} />);

    expect(screen.getByRole('button', { name: 'Remove' })).toBeDefined();
    expect(screen.getByText('1/2')).toBeDefined();
  });
});

describe('Rail — store node bulk-toggle branch (usesChipCounts)', () => {
  it('some-off -> clicking ToggleBox calls onSetManyGlyphs with all toggleable ids and off=false (restore-all)', () => {
    const onSetManyGlyphs = vi.fn();
    const chips: StoreCharChip[] = [
      { chipId: 'store#s#0', ch: 'a', itemsIndex: 0, action: 'drop' },
      { chipId: 'store#s#1', ch: 'b', itemsIndex: 1, action: 'drop' },
      { chipId: 'store#s#2', ch: 'c', itemsIndex: 2, action: 'disabled', disabledReason: 'x' },
    ];
    const node = makeStoreNode({ storeChips: chips });
    // chip #0 off, chip #1 on -> partial state -> st !== 'off' -> click removes all
    const isItemDeleted = (id: string) => id === 'store#s#0';
    render(
      <Rail
        {...baseRailProps}
        nodes={[node]}
        isItemDeleted={isItemDeleted}
        onSetManyGlyphs={onSetManyGlyphs}
      />,
    );

    fireEvent.click(screen.getByRole('button', { name: 'Remove' }));
    // Only the two toggleable ids — the disabled chip's id is never included.
    expect(onSetManyGlyphs).toHaveBeenCalledWith(['store#s#0', 'store#s#1'], true);
  });

  it('all-on -> clicking ToggleBox calls onSetManyGlyphs with all toggleable ids and off=true (remove-all)', () => {
    const onSetManyGlyphs = vi.fn();
    const chips: StoreCharChip[] = [
      { chipId: 'store#s#0', ch: 'a', itemsIndex: 0, action: 'drop' },
      { chipId: 'store#s#1', ch: 'b', itemsIndex: 1, action: 'drop' },
    ];
    const node = makeStoreNode({ storeChips: chips });
    render(
      <Rail
        {...baseRailProps}
        nodes={[node]}
        isItemDeleted={() => false}
        onSetManyGlyphs={onSetManyGlyphs}
      />,
    );

    fireEvent.click(screen.getByRole('button', { name: 'Remove' }));
    expect(onSetManyGlyphs).toHaveBeenCalledWith(['store#s#0', 'store#s#1'], true);
  });

  it('all-off -> clicking ToggleBox calls onSetManyGlyphs with all toggleable ids and off=false (restore-all)', () => {
    const onSetManyGlyphs = vi.fn();
    const chips: StoreCharChip[] = [
      { chipId: 'store#s#0', ch: 'a', itemsIndex: 0, action: 'drop' },
      { chipId: 'store#s#1', ch: 'b', itemsIndex: 1, action: 'drop' },
    ];
    const node = makeStoreNode({ storeChips: chips });
    render(
      <Rail
        {...baseRailProps}
        nodes={[node]}
        isItemDeleted={() => true}
        onSetManyGlyphs={onSetManyGlyphs}
      />,
    );

    fireEvent.click(screen.getByRole('button', { name: 'Keep' }));
    expect(onSetManyGlyphs).toHaveBeenCalledWith(['store#s#0', 'store#s#1'], false);
  });
});

describe('Rail — store node fallback whole-node toggle', () => {
  it('a store with no toggleable chips (all disabled) calls onToggleNode, not onSetManyGlyphs', () => {
    const onToggleNode = vi.fn();
    const onSetManyGlyphs = vi.fn();
    const chips: StoreCharChip[] = [
      { chipId: 'store#s#0', ch: 'a', itemsIndex: 0, action: 'disabled', disabledReason: 'x' },
    ];
    const node = makeStoreNode({ storeChips: chips });
    render(
      <Rail
        {...baseRailProps}
        nodes={[node]}
        onToggleNode={onToggleNode}
        onSetManyGlyphs={onSetManyGlyphs}
      />,
    );

    fireEvent.click(screen.getByRole('button', { name: 'Remove' }));
    expect(onToggleNode).toHaveBeenCalledWith('store#s', true);
    expect(onSetManyGlyphs).not.toHaveBeenCalled();
  });

  it('a store with no chips at all (empty storeChips) calls onToggleNode, not onSetManyGlyphs', () => {
    const onToggleNode = vi.fn();
    const onSetManyGlyphs = vi.fn();
    const node = makeStoreNode({ storeChips: [] });
    render(
      <Rail
        {...baseRailProps}
        nodes={[node]}
        onToggleNode={onToggleNode}
        onSetManyGlyphs={onSetManyGlyphs}
      />,
    );

    fireEvent.click(screen.getByRole('button', { name: 'Remove' }));
    expect(onToggleNode).toHaveBeenCalledWith('store#s', true);
    expect(onSetManyGlyphs).not.toHaveBeenCalled();
  });

  it('toggling the whole node back on (already off) calls onToggleNode with off=false', () => {
    const onToggleNode = vi.fn();
    const node = makeStoreNode({ storeChips: [] });
    const isDeleted = (id: string) => id === 'store#s';
    render(
      <Rail
        {...baseRailProps}
        nodes={[node]}
        isDeleted={isDeleted}
        onToggleNode={onToggleNode}
      />,
    );

    fireEvent.click(screen.getByRole('button', { name: 'Keep' }));
    expect(onToggleNode).toHaveBeenCalledWith('store#s', false);
  });
});

describe('Rail — removal-recommendation badge retired (#525 BANNER slice)', () => {
  // The per-node "Suggested removal" badge (originally added in the #525
  // FOUNDATION slice) is retired — the green removal-recommendation banner
  // (CarveGallery's RemovalBanner) is now the SINGLE surface for this signal.
  // `recommendation` itself is left intact on CarveNode (annotateRemovalRecommendations
  // still computes it — see irToCarveNodes.test.ts) so Rail must simply never
  // render anything for it, regardless of value.
  function makePatternNode(overrides: Partial<CarveNode> = {}): CarveNode {
    return {
      nodeId: 'pattern#p',
      kind: 'pattern',
      name: 'Grave accent',
      ...overrides,
    };
  }

  it('never renders a "Suggested removal" badge for a node with recommendation "high"', () => {
    const node = makePatternNode({ recommendation: 'high' });
    render(<Rail {...baseRailProps} nodes={[node]} />);

    expect(screen.queryByTestId('carve-suggested-removal-pattern#p')).toBeNull();
    expect(screen.queryByText('Suggested removal')).toBeNull();
  });

  it('does not render anything for a node with recommendation "none"', () => {
    const node = makePatternNode({ recommendation: 'none' });
    render(<Rail {...baseRailProps} nodes={[node]} />);

    expect(screen.queryByTestId('carve-suggested-removal-pattern#p')).toBeNull();
    expect(screen.queryByText('Suggested removal')).toBeNull();
  });

  it('does not render anything for a node with recommendation undefined (unannotated)', () => {
    const node = makePatternNode();
    render(<Rail {...baseRailProps} nodes={[node]} />);

    expect(screen.queryByTestId('carve-suggested-removal-pattern#p')).toBeNull();
    expect(screen.queryByText('Suggested removal')).toBeNull();
  });

  it('renders no badge for either node when a "high" node is rendered alongside a "none" node', () => {
    const highNode = makePatternNode({ nodeId: 'pattern#high', recommendation: 'high' });
    const noneNode = makePatternNode({ nodeId: 'pattern#none', name: 'Cedilla', recommendation: 'none' });
    render(<Rail {...baseRailProps} nodes={[highNode, noneNode]} />);

    expect(screen.queryByTestId('carve-suggested-removal-pattern#high')).toBeNull();
    expect(screen.queryByTestId('carve-suggested-removal-pattern#none')).toBeNull();
    expect(screen.queryAllByText('Suggested removal')).toHaveLength(0);
  });
});

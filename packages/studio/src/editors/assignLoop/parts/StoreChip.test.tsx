// Unit tests for StoreChip.tsx (#523 per-character store toggle chips).
//
// StoreChip's click handler branches on the chip's action:
//   - "disabled"           → clicking must NOT call onToggle; it must instead
//                            push a HoverInfo (kind: 'text') into the shared
//                            hoverInfoStore carrying the chip's disabledReason,
//                            mirroring GlyphCell's not-removable pattern.
//   - "nul-fill" / "drop"  → clicking DOES call onToggle(chipId).

import { describe, it, expect, afterEach, vi } from 'vitest';
import { render, cleanup, fireEvent } from '@testing-library/react';
import { StoreChip } from './StoreChip.tsx';
import { useHoverInfoStore } from '../../../stores/hoverInfoStore.ts';
import type { StoreCharChip } from '../../../lib/irToCarveNodes.ts';

afterEach(() => {
  cleanup();
  useHoverInfoStore.setState({ info: null });
});

function makeChip(overrides: Partial<StoreCharChip> = {}): StoreCharChip {
  return { chipId: 'store#s#0', ch: 'a', itemsIndex: 0, action: 'drop', ...overrides };
}

describe('StoreChip — disabled action', () => {
  it('clicking does NOT call onToggle', () => {
    const onToggle = vi.fn();
    const chip = makeChip({ action: 'disabled', disabledReason: 'blocked reason' });
    const { container } = render(<StoreChip chip={chip} off={false} onToggle={onToggle} />);
    fireEvent.click(container.querySelector('button')!);
    expect(onToggle).not.toHaveBeenCalled();
  });

  it('clicking sets hover info with the chip disabledReason as the body', () => {
    const chip = makeChip({ action: 'disabled', disabledReason: 'This store is matched negatively.' });
    const { container } = render(<StoreChip chip={chip} off={false} onToggle={vi.fn()} />);
    fireEvent.click(container.querySelector('button')!);
    const info = useHoverInfoStore.getState().info;
    expect(info).toMatchObject({ kind: 'text', title: 'Not removable', body: 'This store is matched negatively.' });
  });

  it('hover (mouseEnter) also surfaces the disabledReason', () => {
    const chip = makeChip({ action: 'disabled', disabledReason: 'Paired-input reason.' });
    const { container } = render(<StoreChip chip={chip} off={false} onToggle={vi.fn()} />);
    fireEvent.mouseEnter(container.querySelector('button')!);
    const info = useHoverInfoStore.getState().info;
    expect(info).toMatchObject({ kind: 'text', title: 'Not removable', body: 'Paired-input reason.' });
  });

  it('marks the button aria-disabled', () => {
    const chip = makeChip({ action: 'disabled', disabledReason: 'x' });
    const { container } = render(<StoreChip chip={chip} off={false} onToggle={vi.fn()} />);
    expect(container.querySelector('button')!.getAttribute('aria-disabled')).toBe('true');
  });
});

describe('StoreChip — toggleable actions (nul-fill / drop)', () => {
  it('clicking a drop-action chip calls onToggle(chipId)', () => {
    const onToggle = vi.fn();
    const chip = makeChip({ action: 'drop', chipId: 'store#s#3' });
    const { container } = render(<StoreChip chip={chip} off={false} onToggle={onToggle} />);
    fireEvent.click(container.querySelector('button')!);
    expect(onToggle).toHaveBeenCalledTimes(1);
    expect(onToggle).toHaveBeenCalledWith('store#s#3');
  });

  it('clicking a nul-fill-action chip calls onToggle(chipId)', () => {
    const onToggle = vi.fn();
    const chip = makeChip({ action: 'nul-fill', chipId: 'store#out#1' });
    const { container } = render(<StoreChip chip={chip} off={false} onToggle={onToggle} />);
    fireEvent.click(container.querySelector('button')!);
    expect(onToggle).toHaveBeenCalledWith('store#out#1');
  });

  it('does not mark the button aria-disabled', () => {
    const chip = makeChip({ action: 'drop' });
    const { container } = render(<StoreChip chip={chip} off={false} onToggle={vi.fn()} />);
    expect(container.querySelector('button')!.getAttribute('aria-disabled')).toBe('false');
  });

  it('renders the character itself when off is false', () => {
    const chip = makeChip({ ch: 'ɛ' });
    const { getByText } = render(<StoreChip chip={chip} off={false} onToggle={vi.fn()} />);
    expect(getByText('ɛ')).toBeDefined();
  });

  it('renders an invisible-char label instead of the raw glyph for a space', () => {
    const chip = makeChip({ ch: ' ' });
    const { getByText } = render(<StoreChip chip={chip} off={false} onToggle={vi.fn()} />);
    expect(getByText('SPACE')).toBeDefined();
  });
});

// Unit tests for GlyphCell.tsx (Fix B, #886).
//
// GlyphCell's click handler branches on RemovalCapability:
//   - "not-removable:*"  → clicking must NOT call onToggle; it must instead
//                          push a HoverInfo into the shared hoverInfoStore
//                          (the same info a hover/focus would set), so the
//                          user gets an explanation instead of a silent
//                          no-op or (pre-fix) an accidental toggle.
//   - "removable:*"      → clicking DOES call onToggle(gid).
//
// hoverInfoStore is a plain zustand store (no Provider needed) — read
// directly via useHoverInfoStore.getState() after firing the click.

import { describe, it, expect, afterEach, vi } from 'vitest';
import { render, cleanup, fireEvent, screen } from '@testing-library/react';
import { GlyphCell } from './GlyphCell.tsx';
import { useHoverInfoStore } from '../../../stores/hoverInfoStore.ts';

afterEach(() => {
  cleanup();
  useHoverInfoStore.setState({ info: null });
});

const baseProps = {
  gid: 'rule#1',
  ch: 'ɛ',
  keys: ['K_Q'],
  off: false,
  color: 'var(--sil-green)',
  modifierLabel: '',
};

describe('GlyphCell — not-removable capability', () => {
  it('clicking does NOT call onToggle', () => {
    const onToggle = vi.fn();
    const { container } = render(
      <GlyphCell {...baseProps} capability="not-removable:context-sensitive" onToggle={onToggle} />,
    );
    const button = container.querySelector('button')!;
    fireEvent.click(button);
    expect(onToggle).not.toHaveBeenCalled();
  });

  it('clicking DOES set hover info via setInfo (explains why it cannot be removed)', () => {
    const onToggle = vi.fn();
    const { container } = render(
      <GlyphCell {...baseProps} capability="not-removable:context-sensitive" onToggle={onToggle} />,
    );
    const button = container.querySelector('button')!;
    fireEvent.click(button);
    const info = useHoverInfoStore.getState().info;
    expect(info).not.toBeNull();
    expect(info).toMatchObject({
      kind: 'key',
      keys: baseProps.keys,
      ch: baseProps.ch,
      off: baseProps.off,
      capability: 'not-removable:context-sensitive',
    });
  });

  it('marks the button aria-disabled', () => {
    const { container } = render(
      <GlyphCell {...baseProps} capability="not-removable:unknown" onToggle={vi.fn()} />,
    );
    const button = container.querySelector('button')!;
    expect(button.getAttribute('aria-disabled')).toBe('true');
  });
});

describe('GlyphCell — removable capability', () => {
  it('clicking DOES call onToggle(gid)', () => {
    const onToggle = vi.fn();
    const { container } = render(
      <GlyphCell {...baseProps} capability="removable:simple" onToggle={onToggle} />,
    );
    const button = container.querySelector('button')!;
    fireEvent.click(button);
    expect(onToggle).toHaveBeenCalledTimes(1);
    expect(onToggle).toHaveBeenCalledWith('rule#1');
  });

  it('does not mark the button aria-disabled', () => {
    const { container } = render(
      <GlyphCell {...baseProps} capability="removable:slot-fill" onToggle={vi.fn()} />,
    );
    const button = container.querySelector('button')!;
    expect(button.getAttribute('aria-disabled')).toBe('false');
  });
});

// ---------------------------------------------------------------------------
// #917 — GlyphOwner store tags: rendering, rail-jump click, propagation guard.
//
// Store owners render as role="button" spans with an accessible name of
// "Go to store <label>"; clicking one must call onOwnerClick(nodeId) and
// must NOT also fire the cell's own onToggle (stopPropagation). Pattern
// owners are consumed only by InfoView (via setInfo) and must never render
// a visible tag here.
// ---------------------------------------------------------------------------

describe('GlyphCell — #917 store owner tags', () => {
  it('renders a tag with accessible name "Go to store vowels" and label text "vowels"', () => {
    const owners = [{ kind: 'store' as const, nodeId: 's1', label: 'vowels' }];
    render(
      <GlyphCell {...baseProps} capability="removable:simple" onToggle={vi.fn()} owners={owners} />,
    );
    const tag = screen.getByRole('button', { name: 'Go to store vowels' });
    expect(tag.textContent).toBe('vowels');
  });

  it('clicking the store tag calls onOwnerClick with the store nodeId and does NOT call onToggle', () => {
    const onToggle = vi.fn();
    const onOwnerClick = vi.fn();
    const owners = [{ kind: 'store' as const, nodeId: 's1', label: 'vowels' }];
    render(
      <GlyphCell
        {...baseProps}
        capability="removable:simple"
        onToggle={onToggle}
        owners={owners}
        onOwnerClick={onOwnerClick}
      />,
    );
    const tag = screen.getByRole('button', { name: 'Go to store vowels' });
    fireEvent.click(tag);
    expect(onOwnerClick).toHaveBeenCalledTimes(1);
    expect(onOwnerClick).toHaveBeenCalledWith('s1');
    expect(onToggle).not.toHaveBeenCalled();
  });

  it('Enter keydown on the store tag also fires onOwnerClick and does not toggle', () => {
    const onToggle = vi.fn();
    const onOwnerClick = vi.fn();
    const owners = [{ kind: 'store' as const, nodeId: 's1', label: 'vowels' }];
    render(
      <GlyphCell
        {...baseProps}
        capability="removable:simple"
        onToggle={onToggle}
        owners={owners}
        onOwnerClick={onOwnerClick}
      />,
    );
    const tag = screen.getByRole('button', { name: 'Go to store vowels' });
    fireEvent.keyDown(tag, { key: 'Enter' });
    expect(onOwnerClick).toHaveBeenCalledWith('s1');
    expect(onToggle).not.toHaveBeenCalled();
  });

  it('a kind:"pattern" owner does not render a visible tag (store owners only)', () => {
    const owners = [{ kind: 'pattern' as const, nodeId: 'p1', label: 'Diacritics' }];
    render(
      <GlyphCell {...baseProps} capability="removable:simple" onToggle={vi.fn()} owners={owners} />,
    );
    expect(screen.queryByText('Diacritics')).toBeNull();
    expect(screen.queryByRole('button', { name: /Go to store/ })).toBeNull();
  });
});

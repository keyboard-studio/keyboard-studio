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

// GlyphCell's DOM is a plain <div> container with a toggle <button> inside
// it (the cell body) plus, when store owners exist, a sibling row of tag
// <button>s (see the #917 describe block below). The toggle button is
// always the FIRST button in the container, so `container.querySelector`
// still reaches it; tests that need to disambiguate against tag buttons
// use `getAllByRole('button')[0]` instead.

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
// #917 — GlyphOwner store tags: rendering, rail-jump click, no nested
// interactive elements.
//
// Store owners render as native <button type="button"> tags with an
// accessible name of "Go to store <label>", as SIBLINGS of the cell's
// toggle button (not nested inside it — nesting interactive elements
// inside a <button> is invalid HTML). Because the tag buttons are
// siblings, clicking one calls onOwnerClick(nodeId) and never reaches the
// toggle's onClick — no manual stopPropagation is needed, and native
// buttons give both Enter and Space activation for free. Pattern owners
// are consumed only by InfoView (via setInfo) and must never render a
// visible tag here.
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

  it('the store tag is not nested inside another button (no invalid HTML)', () => {
    const owners = [{ kind: 'store' as const, nodeId: 's1', label: 'vowels' }];
    render(
      <GlyphCell {...baseProps} capability="removable:simple" onToggle={vi.fn()} owners={owners} />,
    );
    const tag = screen.getByRole('button', { name: 'Go to store vowels' });
    expect(tag.closest('button')).toBe(tag);
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

  // jsdom does not implement the browser's native "Enter/Space on a focused
  // <button> synthesizes a click" behavior, so these two tests simulate the
  // resulting click event directly (`detail: 0` marks it as keyboard-
  // originated per Testing Library convention) — the point under test is
  // that the tag's own click handler fires onOwnerClick and, being a
  // sibling of the toggle button rather than nested inside it, the event
  // never reaches onToggle. A real browser wires the keypress to that same
  // click for a native <button>, which is the whole reason Fix 1 switched
  // the tag from a role="button" span to a native button in the first
  // place.
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
    fireEvent.click(tag, { detail: 0 });
    expect(onOwnerClick).toHaveBeenCalledWith('s1');
    expect(onToggle).not.toHaveBeenCalled();
  });

  it('Space keypress on the store tag fires onOwnerClick (native <button> Space activation) and does not toggle', () => {
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
    tag.focus();
    fireEvent.keyDown(tag, { key: ' ' });
    fireEvent.keyUp(tag, { key: ' ' });
    fireEvent.click(tag, { detail: 0 });
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

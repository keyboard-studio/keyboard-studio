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
import { cleanup, fireEvent, screen } from '@testing-library/react';
import { render } from '../../../test/renderWithI18n.tsx';
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

  it('shows the not-removable badge and stays interactive (cascade explains why)', () => {
    // #886: not-removable chips are no longer aria-disabled — clicking them runs
    // the cascade flow, which surfaces the reason it can't be removed. The amber
    // "!" badge is the visual not-removable marker.
    const { container } = render(
      <GlyphCell {...baseProps} capability="not-removable:unknown" onToggle={vi.fn()} />,
    );
    const button = container.querySelector('button')!;
    expect(button.getAttribute('aria-disabled')).not.toBe('true');
    expect(container.querySelector('[aria-label^="not removable"]')).not.toBeNull();
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
    // GlyphCell no longer sets aria-disabled at all (chips are interactive).
    expect(button.getAttribute('aria-disabled')).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// #886 cross-reference "web" tags: one summary tag per KIND (group / pattern /
// store) of OTHER location the character appears in. Tags are native <button>
// SIBLINGS of the cell's toggle button (never nested — that's invalid HTML).
// Clicking a tag calls onWebTag(ch, locations); the parent decides whether to
// navigate (1 location) or open the popup (>1).
// ---------------------------------------------------------------------------

describe('GlyphCell — cross-reference web tags', () => {
  const storeLoc = { kind: 'store' as const, nodeId: 's1', label: 'vowels' };
  const patternLoc = { kind: 'pattern' as const, nodeId: 'p1', label: 'Diacritics' };
  const groupLoc = { kind: 'group' as const, nodeId: 'g1', label: 'main' };

  it('renders a "store" summary tag when the character also lives in a store', () => {
    render(<GlyphCell {...baseProps} capability="removable:simple" onToggle={vi.fn()} webLocations={[storeLoc]} onWebTag={vi.fn()} />);
    expect(screen.getByRole('button', { name: /^store/ }).textContent).toBe('store');
  });

  it('renders a "pattern" tag for a pattern location (patterns AND stores, #886)', () => {
    render(<GlyphCell {...baseProps} capability="removable:simple" onToggle={vi.fn()} webLocations={[patternLoc]} onWebTag={vi.fn()} />);
    expect(screen.getByRole('button', { name: /^pattern/ }).textContent).toBe('pattern');
  });

  it('renders a "group" tag for a group location (pattern card → group web link)', () => {
    render(<GlyphCell {...baseProps} capability="removable:simple" onToggle={vi.fn()} webLocations={[groupLoc]} onWebTag={vi.fn()} />);
    expect(screen.getByRole('button', { name: /^group/ }).textContent).toBe('group');
  });

  it('renders ONE tag per kind even when a kind has multiple locations', () => {
    const locs = [storeLoc, { kind: 'store' as const, nodeId: 's2', label: 'tones' }, patternLoc];
    render(<GlyphCell {...baseProps} capability="removable:simple" onToggle={vi.fn()} webLocations={locs} onWebTag={vi.fn()} />);
    expect(screen.getAllByRole('button', { name: /^store/ })).toHaveLength(1);
    expect(screen.getAllByRole('button', { name: /^pattern/ })).toHaveLength(1);
  });

  it('a tag is a sibling button, not nested inside the chip-body button (valid HTML)', () => {
    render(<GlyphCell {...baseProps} capability="removable:simple" onToggle={vi.fn()} webLocations={[storeLoc]} onWebTag={vi.fn()} />);
    const tag = screen.getByRole('button', { name: /^store/ });
    expect(tag.closest('button')).toBe(tag);
  });

  it('clicking a tag calls onWebTag(ch, locations) and does NOT toggle', () => {
    const onToggle = vi.fn();
    const onWebTag = vi.fn();
    const locs = [storeLoc, patternLoc];
    render(<GlyphCell {...baseProps} capability="removable:simple" onToggle={onToggle} webLocations={locs} onWebTag={onWebTag} />);
    fireEvent.click(screen.getByRole('button', { name: /^store/ }));
    expect(onWebTag).toHaveBeenCalledWith(baseProps.ch, locs);
    expect(onToggle).not.toHaveBeenCalled();
  });

  it('renders no web tags when the character has no other locations', () => {
    render(<GlyphCell {...baseProps} capability="removable:simple" onToggle={vi.fn()} webLocations={[]} onWebTag={vi.fn()} />);
    expect(screen.queryByRole('button', { name: /^(store|pattern|group)/ })).toBeNull();
  });
});

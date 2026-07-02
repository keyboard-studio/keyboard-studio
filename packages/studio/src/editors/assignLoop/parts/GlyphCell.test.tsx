// Unit tests for the updated GlyphCell — ownership tag rendering and
// chip-body vs tag click separation.

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import React from 'react';
import { render, screen, fireEvent, cleanup } from '@testing-library/react';
import { GlyphCell } from './GlyphCell.tsx';
import { useHoverInfoStore } from '../../../stores/hoverInfoStore.ts';

beforeEach(() => {
  useHoverInfoStore.setState({ info: null });
});
afterEach(() => {
  cleanup();
  useHoverInfoStore.setState({ info: null });
});

const baseProps = {
  gid: 'g1',
  ch: 'a',
  keys: ['A'],
  off: false,
  color: '#6fbbd4',
  onToggle: vi.fn(),
  modifierLabel: '',
  capability: 'removable' as const,
};

// ---------------------------------------------------------------------------
// No ownership tag — baseline renders without owner tag
// ---------------------------------------------------------------------------

describe('GlyphCell — no ownership tag', () => {
  it('renders without an ownership tag when ownerLabel is absent', () => {
    render(<GlyphCell {...baseProps} />);
    // There should be no button with "Go to owning" aria-label
    expect(screen.queryByRole('button', { name: /go to owning/i })).toBeNull();
  });

  it('calls onToggle when chip body is clicked (no cascade override)', () => {
    const onToggle = vi.fn();
    render(<GlyphCell {...baseProps} onToggle={onToggle} />);
    const chip = screen.getByRole('button', { name: /a — A/i });
    fireEvent.click(chip);
    expect(onToggle).toHaveBeenCalledOnce();
    expect(onToggle).toHaveBeenCalledWith('g1');
  });

  it('calls onToggle on Enter key', () => {
    const onToggle = vi.fn();
    render(<GlyphCell {...baseProps} onToggle={onToggle} />);
    const chip = screen.getByRole('button', { name: /a — A/i });
    fireEvent.keyDown(chip, { key: 'Enter' });
    expect(onToggle).toHaveBeenCalledOnce();
  });

  it('calls onToggle on Space key', () => {
    const onToggle = vi.fn();
    render(<GlyphCell {...baseProps} onToggle={onToggle} />);
    const chip = screen.getByRole('button', { name: /a — A/i });
    fireEvent.keyDown(chip, { key: ' ' });
    expect(onToggle).toHaveBeenCalledOnce();
  });
});

// ---------------------------------------------------------------------------
// With ownership tag — pattern owner
// ---------------------------------------------------------------------------

describe('GlyphCell — pattern ownership tag renders', () => {
  const ownerProps = {
    ...baseProps,
    ownerKind: 'pattern' as const,
    ownerNodeId: 'node-p1',
    ownerLabel: 'S-02',
  };

  it('renders the ownership tag button with the ownerLabel', () => {
    render(<GlyphCell {...ownerProps} />);
    const tag = screen.getByRole('button', { name: /go to owning pattern S-02/i });
    expect(tag).toBeTruthy();
    expect(tag.textContent).toContain('S-02');
  });

  it('tag click calls onSelectNode with ownerNodeId', () => {
    const onSelectNode = vi.fn();
    render(<GlyphCell {...ownerProps} onSelectNode={onSelectNode} />);
    const tag = screen.getByRole('button', { name: /go to owning pattern S-02/i });
    fireEvent.click(tag);
    expect(onSelectNode).toHaveBeenCalledOnce();
    expect(onSelectNode).toHaveBeenCalledWith('node-p1');
  });

  it('tag click does NOT trigger chip-body handler (onToggle is NOT called)', () => {
    const onToggle = vi.fn();
    const onSelectNode = vi.fn();
    render(<GlyphCell {...ownerProps} onToggle={onToggle} onSelectNode={onSelectNode} />);
    const tag = screen.getByRole('button', { name: /go to owning pattern S-02/i });
    fireEvent.click(tag);
    expect(onToggle).not.toHaveBeenCalled();
  });

  it('chip-body click does NOT call onSelectNode', () => {
    const onToggle = vi.fn();
    const onSelectNode = vi.fn();
    render(<GlyphCell {...ownerProps} onToggle={onToggle} onSelectNode={onSelectNode} />);
    // Click the outer chip div (role=button for the chip body)
    const chip = screen.getByRole('button', { name: /a — A/i });
    fireEvent.click(chip);
    expect(onSelectNode).not.toHaveBeenCalled();
    expect(onToggle).toHaveBeenCalledOnce();
  });
});

// ---------------------------------------------------------------------------
// With ownership tag — store owner
// ---------------------------------------------------------------------------

describe('GlyphCell — store ownership tag renders', () => {
  it('renders "go to owning store" tag for store ownerKind', () => {
    render(
      <GlyphCell
        {...baseProps}
        ownerKind="store"
        ownerNodeId="store-1"
        ownerLabel="outputs"
      />,
    );
    const tag = screen.getByRole('button', { name: /go to owning store outputs/i });
    expect(tag).toBeTruthy();
  });
});

// ---------------------------------------------------------------------------
// Cascade-delete override — onCascadeDelete replaces onToggle for chip body
// ---------------------------------------------------------------------------

describe('GlyphCell — onCascadeDelete replaces onToggle on chip-body click', () => {
  it('calls onCascadeDelete instead of onToggle when override is provided', () => {
    const onToggle = vi.fn();
    const onCascadeDelete = vi.fn();
    render(
      <GlyphCell
        {...baseProps}
        onToggle={onToggle}
        onCascadeDelete={onCascadeDelete}
      />,
    );
    const chip = screen.getByRole('button', { name: /a — A/i });
    fireEvent.click(chip);
    expect(onCascadeDelete).toHaveBeenCalledOnce();
    expect(onCascadeDelete).toHaveBeenCalledWith('g1');
    expect(onToggle).not.toHaveBeenCalled();
  });

  it('onCascadeDelete does NOT interfere with tag click', () => {
    const onCascadeDelete = vi.fn();
    const onSelectNode = vi.fn();
    render(
      <GlyphCell
        {...baseProps}
        ownerKind="pattern"
        ownerNodeId="node-p1"
        ownerLabel="S-02"
        onCascadeDelete={onCascadeDelete}
        onSelectNode={onSelectNode}
      />,
    );
    const tag = screen.getByRole('button', { name: /go to owning pattern S-02/i });
    fireEvent.click(tag);
    expect(onCascadeDelete).not.toHaveBeenCalled();
    expect(onSelectNode).toHaveBeenCalledOnce();
  });
});

// ---------------------------------------------------------------------------
// Accessibility — chip body is keyboard-navigable
// ---------------------------------------------------------------------------

describe('GlyphCell — accessibility', () => {
  it('chip body has role=button and tabIndex=0', () => {
    const { container } = render(<GlyphCell {...baseProps} />);
    const chipDiv = container.querySelector('[role="button"]');
    expect(chipDiv).not.toBeNull();
    expect(chipDiv!.getAttribute('tabindex')).toBe('0');
  });

  it('chip body aria-label includes the character and key', () => {
    render(<GlyphCell {...baseProps} ch="é" keys={['E']} />);
    const chip = screen.getByRole('button', { name: /é — E/i });
    expect(chip).toBeTruthy();
  });
});

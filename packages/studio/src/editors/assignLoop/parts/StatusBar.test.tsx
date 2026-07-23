// Unit tests for StatusBar.tsx's RemovedMenu — specifically that a removed
// bare combining-mark item renders via the shared displayChar() helper
// (irToCarveNodes.ts), i.e. prefixed with U+25CC DOTTED CIRCLE so it's
// visible standalone rather than rendering as an invisible zero-width glyph.

import { describe, it, expect, afterEach, vi } from 'vitest';
import { cleanup, fireEvent, screen } from '@testing-library/react';
import { render } from '../../../test/renderWithI18n.tsx';
import { StatusBar, type RemovedItem } from './StatusBar.tsx';

afterEach(() => {
  cleanup();
});

describe('StatusBar — RemovedMenu combining-mark display', () => {
  it('renders a removed bare combining-mark item with a dotted circle (shared displayChar helper)', () => {
    const combiningGrave = '̀'; // COMBINING GRAVE ACCENT (Mn) — invisible standalone
    const removedList: RemovedItem[] = [
      { type: 'item', id: 'r1', ch: combiningGrave, keys: ['K_BKQUOTE'] },
    ];

    render(
      <StatusBar
        kept={2}
        total={3}
        removedList={removedList}
        onRestore={vi.fn()}
        onRestoreAll={vi.fn()}
      />,
    );

    // Open the "removed" menu — the toggle button shows the removed count.
    fireEvent.click(screen.getByRole('button', { name: /removed/i }));

    // The item's glyph tile renders "◌̀" (dotted circle + mark),
    // not the bare combining mark alone.
    expect(screen.getByText('◌' + combiningGrave)).toBeTruthy();
  });

  it('renders a removed plain-letter item with no dotted circle', () => {
    const removedList: RemovedItem[] = [
      { type: 'item', id: 'r1', ch: 'e', keys: ['K_E'] },
    ];

    render(
      <StatusBar
        kept={2}
        total={3}
        removedList={removedList}
        onRestore={vi.fn()}
        onRestoreAll={vi.fn()}
      />,
    );

    fireEvent.click(screen.getByRole('button', { name: /removed/i }));

    expect(screen.getByText('e')).toBeTruthy();
    expect(screen.queryByText('◌e')).toBeNull();
  });
});

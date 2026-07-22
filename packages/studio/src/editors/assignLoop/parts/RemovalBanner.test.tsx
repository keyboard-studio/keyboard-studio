// Unit tests for RemovalBanner.tsx (#525 BANNER slice qc P1).
//
// Coverage:
//   - collapsed banner renders the count + copy naming languageLabel
//   - clicking the strip expands the checklist, all boxes pre-checked
//   - unchecking every box disables "Remove all selected"
//   - onRemoveSelected is called with only the still-checked subset
//   - Dismiss hides the banner entirely (returns null)

import { describe, it, expect, afterEach, vi } from 'vitest';
import { cleanup, fireEvent, screen } from '@testing-library/react';
import { render } from '../../../test/renderWithI18n.tsx';
import { RemovalBanner } from './RemovalBanner.tsx';
import type { RecommendedRemovalChar } from '../../../lib/irToCarveNodes.ts';
import type { CharContributors } from '@keyboard-studio/engine';

afterEach(() => {
  cleanup();
});

function makeContributors(overrides: Partial<CharContributors> = {}): CharContributors {
  return {
    targetChar: 'y',
    ruleNodeIds: ['rule-1'],
    storeSlotIds: [],
    locations: [],
    blocked: [],
    ...overrides,
  };
}

function makeRecommended(ch: string, contributorOverrides: Partial<CharContributors> = {}): RecommendedRemovalChar {
  return { ch, contributors: makeContributors({ targetChar: ch, ...contributorOverrides }) };
}

describe('RemovalBanner — collapsed state', () => {
  it('shows the count and target-language copy', () => {
    const recommended = [makeRecommended('y'), makeRecommended('z')];
    render(<RemovalBanner recommended={recommended} languageLabel="fr" onRemoveSelected={vi.fn()} />);

    expect(screen.getByText(/We recommend removing 2 characters not needed for fr\./)).not.toBeNull();
  });

  it('uses singular "character" copy for a single recommendation', () => {
    render(<RemovalBanner recommended={[makeRecommended('y')]} languageLabel="fr" onRemoveSelected={vi.fn()} />);

    expect(screen.getByText(/We recommend removing 1 character not needed for fr\./)).not.toBeNull();
  });

  it('renders nothing when recommended is empty', () => {
    const { container } = render(<RemovalBanner recommended={[]} languageLabel="fr" onRemoveSelected={vi.fn()} />);

    expect(container.firstChild).toBeNull();
  });

  it('the checklist is not shown before the strip is clicked', () => {
    render(<RemovalBanner recommended={[makeRecommended('y')]} languageLabel="fr" onRemoveSelected={vi.fn()} />);

    expect(screen.queryByRole('list')).toBeNull();
    expect(screen.queryByLabelText('Recommended characters to remove')).toBeNull();
  });
});

describe('RemovalBanner — expand / checklist', () => {
  it('clicking the strip expands the checklist with every box pre-checked', () => {
    const recommended = [makeRecommended('y'), makeRecommended('z')];
    render(<RemovalBanner recommended={recommended} languageLabel="fr" onRemoveSelected={vi.fn()} />);

    fireEvent.click(screen.getByRole('button', { name: /We recommend removing/ }));

    const checkboxes = screen.getAllByRole('checkbox') as HTMLInputElement[];
    expect(checkboxes).toHaveLength(2);
    expect(checkboxes.every((cb) => cb.checked)).toBe(true);
  });

  it('clicking the strip again collapses the checklist', () => {
    render(<RemovalBanner recommended={[makeRecommended('y')]} languageLabel="fr" onRemoveSelected={vi.fn()} />);
    const strip = screen.getByRole('button', { name: /We recommend removing/ });

    fireEvent.click(strip);
    expect(screen.queryAllByRole('checkbox')).toHaveLength(1);

    fireEvent.click(strip);
    expect(screen.queryAllByRole('checkbox')).toHaveLength(0);
  });
});

describe('RemovalBanner — unchecking and "Remove all selected"', () => {
  it('unchecking all boxes disables "Remove all selected"', () => {
    const recommended = [makeRecommended('y'), makeRecommended('z')];
    render(<RemovalBanner recommended={recommended} languageLabel="fr" onRemoveSelected={vi.fn()} />);
    fireEvent.click(screen.getByRole('button', { name: /We recommend removing/ }));

    for (const cb of screen.getAllByRole('checkbox')) {
      fireEvent.click(cb);
    }

    const removeButton = screen.getByRole('button', { name: /Remove all selected/ });
    expect(removeButton).toHaveProperty('disabled', true);
  });

  it('clicking a disabled "Remove all selected" is a no-op', () => {
    const onRemoveSelected = vi.fn();
    render(<RemovalBanner recommended={[makeRecommended('y')]} languageLabel="fr" onRemoveSelected={onRemoveSelected} />);
    fireEvent.click(screen.getByRole('button', { name: /We recommend removing/ }));

    fireEvent.click(screen.getByRole('checkbox'));
    fireEvent.click(screen.getByRole('button', { name: /Remove all selected/ }));

    expect(onRemoveSelected).not.toHaveBeenCalled();
  });

  it('calls onRemoveSelected with only the still-checked subset', () => {
    const onRemoveSelected = vi.fn();
    const recommended = [makeRecommended('y'), makeRecommended('z'), makeRecommended('w')];
    render(<RemovalBanner recommended={recommended} languageLabel="fr" onRemoveSelected={onRemoveSelected} />);
    fireEvent.click(screen.getByRole('button', { name: /We recommend removing/ }));

    // Uncheck just 'z', leaving 'y' and 'w' checked.
    fireEvent.click(screen.getByLabelText(/Remove U\+007A/i));

    fireEvent.click(screen.getByRole('button', { name: /Remove all selected/ }));

    expect(onRemoveSelected).toHaveBeenCalledTimes(1);
    const selected = onRemoveSelected.mock.calls[0]![0] as RecommendedRemovalChar[];
    expect(selected.map((r) => r.ch)).toEqual(['y', 'w']);
  });

  it('with everything checked, "Remove all selected" passes the full recommended list', () => {
    const onRemoveSelected = vi.fn();
    const recommended = [makeRecommended('y'), makeRecommended('z')];
    render(<RemovalBanner recommended={recommended} languageLabel="fr" onRemoveSelected={onRemoveSelected} />);
    fireEvent.click(screen.getByRole('button', { name: /We recommend removing/ }));

    fireEvent.click(screen.getByRole('button', { name: /Remove all selected/ }));

    expect(onRemoveSelected).toHaveBeenCalledTimes(1);
    const selected = onRemoveSelected.mock.calls[0]![0] as RecommendedRemovalChar[];
    expect(selected.map((r) => r.ch)).toEqual(['y', 'z']);
  });
});

describe('RemovalBanner — dismiss', () => {
  it('clicking Dismiss hides the banner entirely', () => {
    const { container } = render(<RemovalBanner recommended={[makeRecommended('y')]} languageLabel="fr" onRemoveSelected={vi.fn()} />);

    fireEvent.click(screen.getByRole('button', { name: 'Dismiss removal recommendation' }));

    expect(container.firstChild).toBeNull();
    expect(screen.queryByRole('region', { name: 'Removal recommendation' })).toBeNull();
  });
});

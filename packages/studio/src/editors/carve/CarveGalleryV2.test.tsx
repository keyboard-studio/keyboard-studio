// Unit tests for CarveGalleryV2.tsx — the character-first carve gallery
// (#1399), including the #533 "suggested to discard" first-group redesign
// (recommendedRemovalChars rows render as the FIRST group of the gallery
// instead of a standing banner — see CarveGalleryV2.tsx's header comment).
// Component-level coverage was previously zero for this file; this suite
// exercises the behavior CarveGallery.test.tsx already covers for the
// sibling rule/node "Rail" view, adapted to V2's flatter, dialog-free
// interaction model (toggleCell/toggleGroup call cascadeDelete/cascadeRestore
// directly — there is no ConfirmDialog in this view).
//
// collectCharContributors is MOCKED (vi.mock, importActual for everything
// else) exactly as in CarveGallery.test.tsx, so cascade behavior is driven
// deterministically. neededCharsForLanguage (../../lib/services.ts) is also
// mocked to keep the suite offline/deterministic, per that file's pattern.
// recommendedRemovalChars (../../lib/irToCarveNodes.ts) is mocked the SAME
// way (importActual, default implementation forwards to the real function)
// so most tests exercise the real derivation, but the cross-script-Latin
// test can inject a `reason: 'cross-script-latin'` row directly rather than
// reconstructing a real non-Latin bcp47/langtags scenario — the same
// short-circuit RemovalBanner.test.tsx uses for its own optional-Latin cases.

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { cleanup, fireEvent, screen, within } from '@testing-library/react';
import { render } from '../../test/renderWithI18n.tsx';
import type { IRRule, IRGroup, IRStore, KeyboardIR, RemovalCapability } from '@keyboard-studio/contracts';
import { createVirtualFS } from '@keyboard-studio/contracts';
import { basicKbdus } from '@keyboard-studio/contracts/fixtures';
import { CarveGalleryV2 } from './CarveGalleryV2.tsx';
import { useWorkingCopyStore } from '../../stores/workingCopyStore.ts';
import type { CharContributors } from '@keyboard-studio/engine';
import type { RecommendedRemovalChar } from '../../lib/irToCarveNodes.ts';

const { collectCharContributorsMock, neededCharsResult, recommendedRemovalCharsMock } = vi.hoisted(() => {
  let _needed: Set<string> | null = null;
  return {
    collectCharContributorsMock: vi.fn(),
    neededCharsResult: {
      get: () => _needed,
      set: (v: Set<string> | null) => { _needed = v; },
    },
    recommendedRemovalCharsMock: vi.fn(),
  };
});

vi.mock('@keyboard-studio/engine', async () => {
  const actual = await vi.importActual<typeof import('@keyboard-studio/engine')>('@keyboard-studio/engine');
  return {
    ...actual,
    collectCharContributors: collectCharContributorsMock,
  };
});

// Default implementation forwards to the real function — set ONCE here
// (module init), never in afterEach's mockReset, so a plain
// `mockReturnValueOnce`/`mockImplementationOnce` in one test reverts to the
// real derivation for every other test without extra bookkeeping.
vi.mock('../../lib/irToCarveNodes.ts', async () => {
  const actual = await vi.importActual<typeof import('../../lib/irToCarveNodes.ts')>('../../lib/irToCarveNodes.ts');
  recommendedRemovalCharsMock.mockImplementation(actual.recommendedRemovalChars);
  return {
    ...actual,
    recommendedRemovalChars: recommendedRemovalCharsMock,
  };
});

// Offline stub — see the identical rationale in CarveGallery.test.tsx.
vi.mock('../../lib/services.ts', () => ({
  neededCharsForLanguage: async () => neededCharsResult.get(),
}));

afterEach(() => {
  cleanup();
  collectCharContributorsMock.mockReset();
  neededCharsResult.set(null);
});

beforeEach(() => {
  useWorkingCopyStore.getState().reset();
});

// ---------------------------------------------------------------------------
// Fixture — one keyboard exercising all four grouping/search/banner paths:
//   'a' — K_A,             basic-letter / direct-key
//   '1' — K_1,             digit        / direct-key
//   'C' — Shift+K_C,       basic-letter / direct-key (key label "Shift + c" —
//                          lowercase key name under the keycap convention,
//                          the produced 'C' is a separate, still-uppercase
//                          character)
//   'q' — store item,      basic-letter / store       (no key sequence)
// ---------------------------------------------------------------------------

function makeSimpleRule(nodeId: string, vkey: string, char: string, modifiers: string[] = []): IRRule {
  return {
    nodeId,
    context: [{ kind: 'vkey', name: vkey, modifiers }],
    output: [{ kind: 'char', value: char }],
  };
}

function makeGroup(nodeId: string, name: string, rules: IRRule[]): IRGroup {
  return { nodeId, name, usingKeys: true, rules, readonly: false };
}

function makeStore(nodeId: string, name: string, chars: string[]): IRStore {
  return { nodeId, name, items: chars.map((c) => ({ kind: 'char' as const, value: c })), isSystem: false };
}

function makeIR(groups: IRGroup[], stores: IRStore[] = []): KeyboardIR {
  return {
    origin: 'imported',
    header: {
      keyboardId: 'test', name: 'Test', bcp47: [], copyright: '', version: '1.0',
      targets: [], storeDirectives: [],
    },
    stores,
    groups,
    comments: [],
    raw: [],
    recognizedPatterns: [],
  };
}

function emptyContributors(targetChar: string): CharContributors {
  return { targetChar, ruleNodeIds: [], storeSlotIds: [], storeSlots: [], locations: [], blocked: [] };
}

function makeFixtureIR(): KeyboardIR {
  return makeIR(
    [makeGroup('g-main', 'main', [
      makeSimpleRule('r-a', 'K_A', 'a'),
      makeSimpleRule('r-1', 'K_1', '1'),
      makeSimpleRule('r-shiftc', 'K_C', 'C', ['SHIFT']),
    ])],
    [makeStore('store#sX', 'sX', ['q'])],
  );
}

/** Maps each fixture character to its contributor ids — mirrors CarveGallery.test.tsx's per-char mock shape. */
function mockFixtureContributors() {
  collectCharContributorsMock.mockImplementation((_ir: KeyboardIR, ch: string) => {
    if (ch === 'a') return { ...emptyContributors(ch), ruleNodeIds: ['r-a'] };
    if (ch === '1') return { ...emptyContributors(ch), ruleNodeIds: ['r-1'] };
    if (ch === 'C') return { ...emptyContributors(ch), ruleNodeIds: ['r-shiftc'] };
    if (ch === 'q') return { ...emptyContributors(ch), storeSlotIds: ['store#sX#0'] };
    return emptyContributors(ch);
  });
}

/** Instantiate the working copy (Track 2, mirrors CarveGallery.test.tsx's renderGallery) and render CarveGalleryV2. */
function renderGalleryV2(ir: KeyboardIR, caps: Map<string, RemovalCapability> = new Map()) {
  const vfs = createVirtualFS();
  useWorkingCopyStore.getState().instantiateFromExisting(basicKbdus, { vfs, ir, removalCapabilities: caps });
  return render(<CarveGalleryV2 onComplete={vi.fn()} />);
}

/** A fabricated RecommendedRemovalChar row — used only by the recommendedRemovalCharsMock override tests. */
function makeRow(ch: string, ruleNodeIds: string[], reason?: RecommendedRemovalChar['reason']): RecommendedRemovalChar {
  return {
    ch,
    contributors: { ...emptyContributors(ch), ruleNodeIds },
    ...(reason !== undefined ? { reason } : {}),
  };
}

// ---------------------------------------------------------------------------
// 1. Renders the character cells for the fixture keyboard.
// ---------------------------------------------------------------------------

describe('CarveGalleryV2 — renders character cells', () => {
  it('renders one cell per distinct produced character, each with a codepoint-bearing accessible name', () => {
    mockFixtureContributors();
    renderGalleryV2(makeFixtureIR());

    expect(screen.getByRole('button', { name: 'a — U+0061' })).not.toBeNull();
    expect(screen.getByRole('button', { name: '1 — U+0031' })).not.toBeNull();
    expect(screen.getByRole('button', { name: 'C — U+0043' })).not.toBeNull();
    expect(screen.getByRole('button', { name: 'q — U+0071' })).not.toBeNull();

    // Status strip counts all 4 as kept before any interaction.
    expect(screen.getByText('4').textContent).toBe('4');
  });
});

// ---------------------------------------------------------------------------
// 2. toggleCell — discard cascades to the contributor id; toggling again restores.
// ---------------------------------------------------------------------------

describe('CarveGalleryV2 — toggleCell', () => {
  it('discards a character (cascade marks its rule contributor deleted) and restores it on a second click', () => {
    mockFixtureContributors();
    renderGalleryV2(makeFixtureIR());

    const cell = screen.getByRole('button', { name: 'a — U+0061' });
    expect(useWorkingCopyStore.getState().isItemDeleted('r-a')).toBe(false);
    expect(cell.getAttribute('aria-pressed')).toBe('false');

    fireEvent.click(cell);
    expect(useWorkingCopyStore.getState().isItemDeleted('r-a')).toBe(true);
    expect(cell.getAttribute('aria-pressed')).toBe('true');

    fireEvent.click(cell);
    expect(useWorkingCopyStore.getState().isItemDeleted('r-a')).toBe(false);
    expect(cell.getAttribute('aria-pressed')).toBe('false');
  });

  it('discards a store-backed character (cascade marks its store-slot contributor deleted)', () => {
    mockFixtureContributors();
    renderGalleryV2(makeFixtureIR());

    const cell = screen.getByRole('button', { name: 'q — U+0071' });
    fireEvent.click(cell);

    expect(useWorkingCopyStore.getState().isItemDeleted('store#sX#0')).toBe(true);
    expect(cell.getAttribute('aria-pressed')).toBe('true');
  });
});

// ---------------------------------------------------------------------------
// 3. toggleGroup — discard/restore every toggleable cell in a group at once.
// ---------------------------------------------------------------------------

describe('CarveGalleryV2 — toggleGroup', () => {
  it('"Discard all" on a group cascades every cell in it; "Restore all" reverses it', () => {
    mockFixtureContributors();
    renderGalleryV2(makeFixtureIR());

    // The default (category) grouping puts '1' alone in "Digits & numerals".
    const digitsRegion = screen.getByRole('region', { name: 'Digits & numerals' });
    expect(useWorkingCopyStore.getState().isItemDeleted('r-1')).toBe(false);

    fireEvent.click(within(digitsRegion).getByRole('button', { name: 'Discard all' }));
    expect(useWorkingCopyStore.getState().isItemDeleted('r-1')).toBe(true);

    fireEvent.click(within(digitsRegion).getByRole('button', { name: 'Restore all' }));
    expect(useWorkingCopyStore.getState().isItemDeleted('r-1')).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// 4. Search filtering — by character, by codepoint name, and by key label.
// ---------------------------------------------------------------------------

describe('CarveGalleryV2 — search filtering', () => {
  it('narrows to the matching cell by literal character', () => {
    mockFixtureContributors();
    renderGalleryV2(makeFixtureIR());

    fireEvent.change(screen.getByRole('searchbox', { name: 'Search a character or code point' }), { target: { value: 'q' } });

    expect(screen.getByRole('button', { name: 'q — U+0071' })).not.toBeNull();
    expect(screen.queryByRole('button', { name: 'a — U+0061' })).toBeNull();
    expect(screen.queryByRole('button', { name: '1 — U+0031' })).toBeNull();
    expect(screen.queryByRole('button', { name: 'C — U+0043' })).toBeNull();
  });

  it('narrows to the matching cell by codepoint name', () => {
    mockFixtureContributors();
    renderGalleryV2(makeFixtureIR());

    fireEvent.change(screen.getByRole('searchbox', { name: 'Search a character or code point' }), { target: { value: 'U+0031' } });

    expect(screen.getByRole('button', { name: '1 — U+0031' })).not.toBeNull();
    expect(screen.queryByRole('button', { name: 'a — U+0061' })).toBeNull();
    expect(screen.queryByRole('button', { name: 'q — U+0071' })).toBeNull();
  });

  it('narrows to the matching cell by resolved key label', () => {
    mockFixtureContributors();
    renderGalleryV2(makeFixtureIR());

    // Only 'C' (Shift+K_C) resolves a key sequence containing "shift".
    fireEvent.change(screen.getByRole('searchbox', { name: 'Search a character or code point' }), { target: { value: 'shift' } });

    expect(screen.getByRole('button', { name: 'C — U+0043' })).not.toBeNull();
    expect(screen.queryByRole('button', { name: 'a — U+0061' })).toBeNull();
    expect(screen.queryByRole('button', { name: '1 — U+0031' })).toBeNull();
    expect(screen.queryByRole('button', { name: 'q — U+0071' })).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// 5. "Group by" toggle — Category vs Source re-groups the grid.
// ---------------------------------------------------------------------------

describe('CarveGalleryV2 — group-by toggle', () => {
  it('switches group headers from category labels to source labels, and back', () => {
    mockFixtureContributors();
    renderGalleryV2(makeFixtureIR());

    const categoryRadio = screen.getByRole('radio', { name: 'Category' }) as HTMLInputElement;
    const sourceRadio = screen.getByRole('radio', { name: 'Source' }) as HTMLInputElement;
    expect(categoryRadio.checked).toBe(true);
    expect(sourceRadio.checked).toBe(false);

    // Default grouping — category headers present, source headers absent.
    expect(screen.getByRole('heading', { level: 2, name: 'Basic letters' })).not.toBeNull();
    expect(screen.getByRole('heading', { level: 2, name: 'Digits & numerals' })).not.toBeNull();
    expect(screen.queryByRole('heading', { level: 2, name: 'Direct keys' })).toBeNull();
    expect(screen.queryByRole('heading', { level: 2, name: 'From stores' })).toBeNull();

    fireEvent.click(sourceRadio);

    expect(sourceRadio.checked).toBe(true);
    expect(categoryRadio.checked).toBe(false);
    expect(screen.getByRole('heading', { level: 2, name: 'Direct keys' })).not.toBeNull();
    expect(screen.getByRole('heading', { level: 2, name: 'From stores' })).not.toBeNull();
    expect(screen.queryByRole('heading', { level: 2, name: 'Basic letters' })).toBeNull();
    expect(screen.queryByRole('heading', { level: 2, name: 'Digits & numerals' })).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// 6. Suggested-to-discard first group (#533 — design handoff option 1b).
// recommendedRemovalChars rows render as the FIRST group of the gallery
// (RecommendedGroupCard), replacing the old standing RemovalBanner.
// ---------------------------------------------------------------------------

describe('CarveGalleryV2 — suggested-to-discard group', () => {
  it('renders a recommended character in the suggested group and NOT in the normal groups below (no duplicates)', async () => {
    mockFixtureContributors();
    // 'a' is needed — 'C' (a plain letter, never in an always-keep category)
    // is surplus and becomes recommended-removal. 'q' is deliberately NOT a
    // candidate here: recommendedRemovalChars walks buildProducedSet(ir),
    // which is rule-reachability-driven — an orphan store item never wired
    // into any rule's output never "produces" a character, so it can never
    // be a removal candidate regardless of the needed-set (verified against
    // the real recommendedRemovalChars, not asserted blind).
    neededCharsResult.set(new Set(['a']));

    renderGalleryV2(makeFixtureIR());

    const suggestedGroup = await screen.findByTestId('carve-v2-suggested-group');
    expect(within(suggestedGroup).getByRole('button', { name: 'C — U+0043' })).not.toBeNull();

    // 'C' is a basic-letter alongside 'a' — the normal "Basic letters" group
    // below must show 'a' but must NOT also show 'C' a second time.
    const basicLettersGroup = screen.getByRole('region', { name: 'Basic letters' });
    expect(within(basicLettersGroup).getByRole('button', { name: 'a — U+0061' })).not.toBeNull();
    expect(within(basicLettersGroup).queryByRole('button', { name: 'C — U+0043' })).toBeNull();
  });

  it('does not render the suggested group when there is no recommendation signal at all', () => {
    mockFixtureContributors();
    renderGalleryV2(makeFixtureIR());

    expect(screen.queryByTestId('carve-v2-suggested-group')).toBeNull();
    expect(screen.queryByRole('region', { name: 'Suggested to discard' })).toBeNull();
  });

  it('hides the suggested group entirely once a search query is entered', async () => {
    mockFixtureContributors();
    neededCharsResult.set(new Set(['a']));
    renderGalleryV2(makeFixtureIR());

    await screen.findByTestId('carve-v2-suggested-group');

    fireEvent.change(screen.getByRole('searchbox', { name: 'Search a character or code point' }), { target: { value: 'C' } });

    expect(screen.queryByTestId('carve-v2-suggested-group')).toBeNull();
    // The grid itself must still be able to answer the query — 'C' is
    // findable there while the card that would otherwise show it is hidden.
    expect(screen.getByRole('button', { name: 'C — U+0043' })).not.toBeNull();
  });

  it('bulk-discards every recommended character, then flips to a restore affordance', async () => {
    mockFixtureContributors();
    neededCharsResult.set(new Set(['a']));
    renderGalleryV2(makeFixtureIR());

    await screen.findByTestId('carve-v2-suggested-group');
    expect(useWorkingCopyStore.getState().isItemDeleted('r-shiftc')).toBe(false);

    const toggleAll = screen.getByTestId('carve-v2-suggested-toggle-all');
    expect(toggleAll.textContent).toMatch(/Discard all/);

    fireEvent.click(toggleAll);
    expect(useWorkingCopyStore.getState().isItemDeleted('r-shiftc')).toBe(true);
    expect(screen.getByTestId('carve-v2-suggested-toggle-all').textContent).toBe('Restore all');

    fireEvent.click(screen.getByTestId('carve-v2-suggested-toggle-all'));
    expect(useWorkingCopyStore.getState().isItemDeleted('r-shiftc')).toBe(false);
    expect(screen.getByTestId('carve-v2-suggested-toggle-all').textContent).toMatch(/Discard all/);
  });
});

// ---------------------------------------------------------------------------
// 7. Optional-Latin group — reason: 'cross-script-latin' rows split into
// their own secondary, collapsible group (preserved from RemovalBanner's
// post-#526 follow-on split; see RemovalBanner.tsx's header comment).
// ---------------------------------------------------------------------------

describe('CarveGalleryV2 — optional Latin group', () => {
  it('renders the optional-Latin group separately from the primary suggested group', async () => {
    mockFixtureContributors();
    // Non-null (even empty) flips useCarveNeededSet's hasSignal true, which
    // gates whether CarveGalleryV2 calls recommendedRemovalChars at all — the
    // mocked return value below is what actually drives this test, not the
    // needed-set contents.
    neededCharsResult.set(new Set());
    recommendedRemovalCharsMock.mockReturnValueOnce([
      makeRow('a', ['r-a']),
      makeRow('C', ['r-shiftc'], 'cross-script-latin'),
    ]);

    renderGalleryV2(makeFixtureIR());

    const suggestedGroup = await screen.findByTestId('carve-v2-suggested-group');
    const optionalGroup = screen.getByTestId('carve-v2-optional-latin-group');
    expect(suggestedGroup).not.toBe(optionalGroup);

    // 'a' (no reason) is in the primary group; 'C' (cross-script-latin) is
    // NOT — it belongs only to the optional group.
    expect(within(suggestedGroup).getByRole('button', { name: 'a — U+0061' })).not.toBeNull();
    expect(within(suggestedGroup).queryByRole('button', { name: 'C — U+0043' })).toBeNull();

    // The optional group starts collapsed (mirrors RemovalBanner's default);
    // expand it via its own disclosure control to reach the character cell.
    fireEvent.click(within(optionalGroup).getByRole('button', { name: /Latin alphabet \(optional\)/ }));
    expect(within(optionalGroup).getByRole('button', { name: 'C — U+0043' })).not.toBeNull();
  });

  it('does not render the optional-Latin group when no row is tagged cross-script-latin', () => {
    mockFixtureContributors();
    neededCharsResult.set(new Set(['a']));
    renderGalleryV2(makeFixtureIR());

    expect(screen.queryByTestId('carve-v2-optional-latin-group')).toBeNull();
  });
});

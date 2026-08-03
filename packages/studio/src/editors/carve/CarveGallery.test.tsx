// Unit tests for CarveGallery.tsx cascade-delete DECISION logic (post-review
// cleanup, #886/#961).
//
// CarveGallery.handleCascadeDelete resolves the clicked glyph, calls the
// engine's collectCharContributors(), and branches on the result to decide
// whether a chip click is a plain toggle or opens the cascade ConfirmDialog
// (remove or restore mode), plus a special "nothing removable" info dialog.
//
// collectCharContributors is MOCKED (vi.mock, importActual for everything
// else — irToCarveNodes.ts also imports from '@keyboard-studio/engine' and
// must keep its real implementation) so each branch is driven deterministically
// regardless of the real contributor-discovery algorithm. The rest of the
// stack (toRailNodes, buildCharWeb, the real workingCopyStore, Rail,
// Inspector, ConfirmDialog) runs for real — this is a render-based test.

import { describe, it, expect, beforeEach, beforeAll, afterEach, vi } from 'vitest';
import { cleanup, fireEvent, screen, waitFor, within } from '@testing-library/react';
import { render } from '../../test/renderWithI18n.tsx';
import type { IRRule, IRGroup, IRStore, KeyboardIR, RemovalCapability } from '@keyboard-studio/contracts';
import { createVirtualFS } from '@keyboard-studio/contracts';
import { basicKbdus } from '@keyboard-studio/contracts/fixtures';
import { CarveGallery } from './CarveGallery.tsx';
import { useWorkingCopyStore } from '../../stores/workingCopyStore.ts';
import type { CharContributors } from '@keyboard-studio/engine';

// jsdom does not implement HTMLDialogElement.showModal()/close() — see the
// same shim + rationale in ConfirmDialog.test.tsx.
beforeAll(() => {
  if (typeof HTMLDialogElement.prototype.showModal !== 'function') {
    HTMLDialogElement.prototype.showModal = function (this: HTMLDialogElement) {
      this.setAttribute('open', '');
    };
  }
  if (typeof HTMLDialogElement.prototype.close !== 'function') {
    HTMLDialogElement.prototype.close = function (this: HTMLDialogElement) {
      this.removeAttribute('open');
    };
  }
});

const { collectCharContributorsMock, neededCharsResult, neededCharsPerBcp47 } = vi.hoisted(() => {
  let _needed: Set<string> | null = null;
  return {
    collectCharContributorsMock: vi.fn(),
    neededCharsResult: {
      get: () => _needed,
      set: (v: Set<string> | null) => { _needed = v; },
    },
    // Review fix 8 — per-bcp47 deferred overrides, for tests that need to
    // control resolution ORDER across a bcp47 change (the stale-language
    // race). Empty by default — falls through to neededCharsResult above.
    neededCharsPerBcp47: new Map<string, Promise<Set<string> | null>>(),
  };
});

vi.mock('@keyboard-studio/engine', async () => {
  const actual = await vi.importActual<typeof import('@keyboard-studio/engine')>('@keyboard-studio/engine');
  return {
    ...actual,
    collectCharContributors: collectCharContributorsMock,
  };
});

// #525 items 2/4 — neededCharsForLanguage does a real CLDR network fetch when
// unmocked; stub it so the suite stays deterministic/offline. Defaults to
// null (no CLDR signal) so existing tests keep their inventory-only behavior;
// individual tests can set neededCharsResult to exercise the surplus signal,
// or register a per-bcp47 deferred promise (deferNeededChars below) to control
// resolution order.
vi.mock('../../lib/services.ts', () => ({
  neededCharsForLanguage: async (bcp47: string) => {
    const deferred = neededCharsPerBcp47.get(bcp47);
    return deferred !== undefined ? deferred : neededCharsResult.get();
  },
}));

/** Registers a pending neededCharsForLanguage(bcp47) call; returns the resolver. */
function deferNeededChars(bcp47: string): (result: Set<string> | null) => void {
  let resolve!: (v: Set<string> | null) => void;
  const promise = new Promise<Set<string> | null>((r) => { resolve = r; });
  neededCharsPerBcp47.set(bcp47, promise);
  return resolve;
}

afterEach(() => {
  cleanup();
  collectCharContributorsMock.mockReset();
  neededCharsResult.set(null);
  neededCharsPerBcp47.clear();
});

beforeEach(() => {
  useWorkingCopyStore.getState().reset();
});

// ---------------------------------------------------------------------------
// Fixture helpers — mirrors the pattern in irToCarveNodes.slot-expansion.test.ts
// ---------------------------------------------------------------------------

function makeSimpleRule(nodeId: string, vkey: string, char: string): IRRule {
  return {
    nodeId,
    context: [{ kind: 'vkey', name: vkey, modifiers: [] }],
    output: [{ kind: 'char', value: char }],
  };
}

function makeGroup(nodeId: string, name: string, rules: IRRule[]): IRGroup {
  return { nodeId, name, usingKeys: true, rules, readonly: false };
}

/** notany() context rule — used to force classifyStoreSlotEdit's "blocked" path
 * (reason "notany-widens") for the #523 disabled-chip test, without touching
 * isSystem (system stores never even get a CarveNode — see toRailNodes). */
function makeNotAnyRule(nodeId: string, storeName: string, outChar: string): IRRule {
  return {
    nodeId,
    context: [{ kind: 'notany', storeRef: storeName }],
    output: [{ kind: 'char', value: outChar }],
  };
}

function makeStore(nodeId: string, name: string, chars: string[]): IRStore {
  return { nodeId, name, items: chars.map((c) => ({ kind: 'char' as const, value: c })), isSystem: false };
}

function makeIR(groups: IRGroup[], stores: IRStore[] = []): KeyboardIR {
  return {
    origin: 'imported',
    header: {
      keyboardId: 'test',
      name: 'Test',
      bcp47: [],
      copyright: '',
      version: '1.0',
      targets: [],
      storeDirectives: [],
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

/** Instantiate the working copy (Track 2 — bypasses the "all clear" gate screen
 * unconditionally, per the isSimple gate in CarveGallery) and render CarveGallery. */
function renderGallery(ir: KeyboardIR, caps: Map<string, RemovalCapability> = new Map()) {
  const vfs = createVirtualFS();
  useWorkingCopyStore.getState().instantiateFromExisting(basicKbdus, { vfs, ir, removalCapabilities: caps });
  return render(<CarveGallery onComplete={vi.fn()} />);
}

// ---------------------------------------------------------------------------
// 1. Sole-producer, single contributor, removable — plain toggle, NO dialog.
// ---------------------------------------------------------------------------

describe('CarveGallery — sole removable producer', () => {
  it('toggles the item directly with no ConfirmDialog', () => {
    const ir = makeIR([makeGroup('g-main', 'main', [makeSimpleRule('r-a', 'K_A', 'a')])]);
    const caps = new Map<string, RemovalCapability>([['r-a', 'removable:simple']]);
    collectCharContributorsMock.mockImplementation((_ir: KeyboardIR, ch: string) => ({
      ...emptyContributors(ch),
      ruleNodeIds: ['r-a'],
      locations: [{ kind: 'group' as const, label: 'main', nodeId: 'g-main' }],
    }));

    renderGallery(ir, caps);
    expect(useWorkingCopyStore.getState().isItemDeleted('r-a')).toBe(false);

    fireEvent.click(screen.getByRole('button', { name: 'a — K_A' }));

    expect(screen.queryByRole('alertdialog')).toBeNull();
    expect(useWorkingCopyStore.getState().isItemDeleted('r-a')).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// 2. Multi-contributor — ConfirmDialog opens listing every location.
// ---------------------------------------------------------------------------

describe('CarveGallery — multi-contributor remove', () => {
  it('opens the ConfirmDialog listing the affected locations', () => {
    const ir = makeIR([makeGroup('g-main', 'main', [makeSimpleRule('r-b', 'K_B', 'b')])]);
    const caps = new Map<string, RemovalCapability>([
      ['r-b', 'removable:simple'],
      ['r-b2', 'removable:simple'],
    ]);
    collectCharContributorsMock.mockImplementation((_ir: KeyboardIR, ch: string) => ({
      ...emptyContributors(ch),
      ruleNodeIds: ['r-b', 'r-b2'],
      locations: [
        { kind: 'group' as const, label: 'main', nodeId: 'g-main' },
        { kind: 'pattern' as const, label: 'Diacritics', nodeId: 'p-1' },
      ],
    }));

    renderGallery(ir, caps);
    fireEvent.click(screen.getByRole('button', { name: 'b — K_B' }));

    const dialog = screen.getByRole('alertdialog');
    expect(dialog.textContent).toContain('Remove "b" everywhere?');
    expect(dialog.textContent).toContain('main');
    expect(dialog.textContent).toContain('Diacritics');
    // Two-button mode — an actionable removal always offers Cancel.
    expect(within(dialog).getByRole('button', { name: 'Cancel' })).not.toBeNull();
    expect(within(dialog).getByRole('button', { name: 'Yes, remove everywhere' })).not.toBeNull();
  });

  it('confirming the dialog cascade-deletes every contributor', () => {
    const ir = makeIR([makeGroup('g-main', 'main', [makeSimpleRule('r-b', 'K_B', 'b')])]);
    const caps = new Map<string, RemovalCapability>([
      ['r-b', 'removable:simple'],
      ['r-b2', 'removable:simple'],
    ]);
    collectCharContributorsMock.mockImplementation((_ir: KeyboardIR, ch: string) => ({
      ...emptyContributors(ch),
      ruleNodeIds: ['r-b', 'r-b2'],
      locations: [{ kind: 'group' as const, label: 'main', nodeId: 'g-main' }],
    }));

    renderGallery(ir, caps);
    fireEvent.click(screen.getByRole('button', { name: 'b — K_B' }));
    fireEvent.click(screen.getByRole('button', { name: 'Yes, remove everywhere' }));

    expect(useWorkingCopyStore.getState().isItemDeleted('r-b')).toBe(true);
    expect(useWorkingCopyStore.getState().isItemDeleted('r-b2')).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// 3. Remove vs restore mode — driven by isItemDeleted(gid) at click time.
// ---------------------------------------------------------------------------

describe('CarveGallery — restore mode', () => {
  it('sole restorable producer toggles directly (no dialog)', () => {
    const ir = makeIR([makeGroup('g-main', 'main', [makeSimpleRule('r-c', 'K_C', 'c')])]);
    const caps = new Map<string, RemovalCapability>([['r-c', 'removable:simple']]);
    collectCharContributorsMock.mockImplementation((_ir: KeyboardIR, ch: string) => ({
      ...emptyContributors(ch),
      ruleNodeIds: ['r-c'],
    }));

    renderGallery(ir, caps);
    useWorkingCopyStore.getState().deleteItem('r-c');
    expect(useWorkingCopyStore.getState().isItemDeleted('r-c')).toBe(true);

    fireEvent.click(screen.getByRole('button', { name: 'c — K_C' }));

    expect(screen.queryByRole('alertdialog')).toBeNull();
    expect(useWorkingCopyStore.getState().isItemDeleted('r-c')).toBe(false);
  });

  it('multiple restorable producers open the restore ConfirmDialog', () => {
    const ir = makeIR([makeGroup('g-main', 'main', [makeSimpleRule('r-d', 'K_D', 'd')])]);
    const caps = new Map<string, RemovalCapability>([['r-d', 'removable:simple']]);
    collectCharContributorsMock.mockImplementation((_ir: KeyboardIR, ch: string) => ({
      ...emptyContributors(ch),
      ruleNodeIds: ['r-d', 'r-d2'],
    }));

    renderGallery(ir, caps);
    useWorkingCopyStore.getState().deleteItem('r-d');
    useWorkingCopyStore.getState().deleteItem('r-d2');

    fireEvent.click(screen.getByRole('button', { name: 'd — K_D' }));

    const dialog = screen.getByRole('alertdialog');
    expect(dialog.textContent).toContain('Restore "d" everywhere?');

    fireEvent.click(within(dialog).getByRole('button', { name: 'Yes, restore everywhere' }));
    expect(useWorkingCopyStore.getState().isItemDeleted('r-d')).toBe(false);
    expect(useWorkingCopyStore.getState().isItemDeleted('r-d2')).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// 4/5. not-removable chip click surfaces the warning text (capabilityHint)
//      and — since nothing is removable — renders as a single-button info
//      dialog (fix 3).
// ---------------------------------------------------------------------------

describe('CarveGallery — not-removable chip / actionCount === 0', () => {
  it('opens a single-button info dialog naming the capabilityHint reason', () => {
    const ir = makeIR([makeGroup('g-main', 'main', [makeSimpleRule('r-e', 'K_E', 'e')])]);
    const caps = new Map<string, RemovalCapability>([['r-e', 'not-removable:context-sensitive']]);
    // The clicked chip's own capability drives the "clicked chip" blocked
    // entry; collectCharContributors finds no removable/blocked rule itself.
    collectCharContributorsMock.mockImplementation((_ir: KeyboardIR, ch: string) => emptyContributors(ch));

    renderGallery(ir, caps);
    fireEvent.click(screen.getByRole('button', { name: 'e — K_E' }));

    const dialog = screen.getByRole('alertdialog');
    expect(dialog.textContent).toContain('"e" can\'t be fully removed');
    // capabilityHint's not-removable:context-sensitive wording (InfoView.tsx).
    expect(dialog.textContent).toContain("Only produces this character after certain keys are pressed");

    // Single-button (fix 3) — omitting secondaryLabel collapses to one button.
    expect(within(dialog).getAllByRole('button')).toHaveLength(1);
    expect(within(dialog).getByRole('button', { name: 'OK' })).not.toBeNull();
  });

  it('dismissing the info dialog (OK) does not delete anything', () => {
    const ir = makeIR([makeGroup('g-main', 'main', [makeSimpleRule('r-f', 'K_F', 'f')])]);
    const caps = new Map<string, RemovalCapability>([['r-f', 'not-removable:opaque']]);
    collectCharContributorsMock.mockImplementation((_ir: KeyboardIR, ch: string) => emptyContributors(ch));

    renderGallery(ir, caps);
    fireEvent.click(screen.getByRole('button', { name: 'f — K_F' }));
    fireEvent.click(screen.getByRole('button', { name: 'OK' }));

    expect(screen.queryByRole('alertdialog')).toBeNull();
    expect(useWorkingCopyStore.getState().isItemDeleted('r-f')).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// 6/7. Cross-reference web-tag click — 1 other location navigates directly
//      (setSelectedId); >1 opens the location-picker popup.
// ---------------------------------------------------------------------------

describe('CarveGallery — web-tag navigation', () => {
  it('navigates directly when the character has exactly one other location', () => {
    const ir = makeIR([
      makeGroup('g-main', 'main', [makeSimpleRule('r-g1', 'K_G', 'g')]),
      makeGroup('g-second', 'second', [makeSimpleRule('r-g2', 'K_H', 'g')]),
    ]);
    const caps = new Map<string, RemovalCapability>([
      ['r-g1', 'removable:simple'],
      ['r-g2', 'removable:simple'],
    ]);
    collectCharContributorsMock.mockImplementation((_ir: KeyboardIR, ch: string) => emptyContributors(ch));

    renderGallery(ir, caps);
    // Default selection is nodes[0] — the "main" group — so its heading shows first.
    expect(screen.getByRole('heading', { level: 2 }).textContent).toBe('main');

    fireEvent.click(screen.getByRole('button', { name: /^group/ }));

    expect(screen.getByRole('heading', { level: 2 }).textContent).toBe('second');
    expect(screen.queryByText('Where "g" also appears')).toBeNull();
  });

  it('opens the location-picker popup when the character has more than one other location', () => {
    const ir = makeIR([
      makeGroup('g-main', 'main', [makeSimpleRule('r-h1', 'K_I', 'h')]),
      makeGroup('g-second', 'second', [makeSimpleRule('r-h2', 'K_J', 'h')]),
      makeGroup('g-third', 'third', [makeSimpleRule('r-h3', 'K_K', 'h')]),
    ]);
    const caps = new Map<string, RemovalCapability>([
      ['r-h1', 'removable:simple'],
      ['r-h2', 'removable:simple'],
      ['r-h3', 'removable:simple'],
    ]);
    collectCharContributorsMock.mockImplementation((_ir: KeyboardIR, ch: string) => emptyContributors(ch));

    renderGallery(ir, caps);
    fireEvent.click(screen.getByRole('button', { name: /^group/ }));

    const popup = screen.getByRole('alertdialog');
    expect(popup.textContent).toContain('Where "h" also appears');
    // Still on "main" — the popup lists choices rather than auto-navigating.
    // (The dialog itself also renders an <h2> title, so disambiguate by
    // excluding headings inside the <dialog>.)
    const inspectorHeadingBeforePick = screen
      .getAllByRole('heading', { level: 2 })
      .find((h) => h.closest('dialog') === null)!;
    expect(inspectorHeadingBeforePick.textContent).toBe('main');

    // Locate the popup row for "second" by its label text, then click its
    // enclosing <button> (the accessible name of that button concatenates
    // the kind + label spans, so matching by inner text is more robust).
    fireEvent.click(within(popup).getByText('second').closest('button')!);
    expect(screen.getByRole('heading', { level: 2 }).textContent).toBe('second');
  });
});

// ---------------------------------------------------------------------------
// 8-11. #523 — store-chip cascade. StoreChip clicks inside StoreDetail route
// through the SAME cascade decision (buildPendingCascade) as glyph chips,
// via handleStoreChipCascade / onStoreCascade, instead of a plain toggle.
// ---------------------------------------------------------------------------

describe('CarveGallery — store-chip cascade (#523)', () => {
  it('a store char also produced by a group rule opens the "remove everywhere" dialog; confirming cascades both', () => {
    const ir = makeIR(
      [makeGroup('g-main', 'main', [makeSimpleRule('r-a', 'K_A', 'a')])],
      [makeStore('store#s', 'sX', ['a'])],
    );
    const caps = new Map<string, RemovalCapability>([['r-a', 'removable:simple']]);
    collectCharContributorsMock.mockImplementation((_ir: KeyboardIR, ch: string) => ({
      ...emptyContributors(ch),
      ruleNodeIds: ['r-a'],
      storeSlotIds: ['store#s#0'],
      locations: [
        { kind: 'group' as const, label: 'main', nodeId: 'g-main' },
        { kind: 'store' as const, label: 'sX', nodeId: 'store#s' },
      ],
    }));

    renderGallery(ir, caps);
    fireEvent.click(screen.getByTestId('carve-card-store#s'));
    fireEvent.click(screen.getByRole('button', { name: 'a' }));

    const dialog = screen.getByRole('alertdialog');
    expect(dialog.textContent).toContain('Remove "a" everywhere?');
    expect(dialog.textContent).toContain('main');
    expect(dialog.textContent).toContain('sX');

    fireEvent.click(within(dialog).getByRole('button', { name: 'Yes, remove everywhere' }));

    expect(useWorkingCopyStore.getState().isItemDeleted('r-a')).toBe(true);
    expect(useWorkingCopyStore.getState().isItemDeleted('store#s#0')).toBe(true);
  });

  it('a store char that is its char\'s sole producer plain-toggles (no dialog)', () => {
    const ir = makeIR(
      [makeGroup('g-main', 'main', [])],
      [makeStore('store#s', 'sX', ['a'])],
    );
    collectCharContributorsMock.mockImplementation((_ir: KeyboardIR, ch: string) => ({
      ...emptyContributors(ch),
      storeSlotIds: ['store#s#0'],
    }));

    renderGallery(ir);
    fireEvent.click(screen.getByTestId('carve-card-store#s'));
    expect(useWorkingCopyStore.getState().isItemDeleted('store#s#0')).toBe(false);

    fireEvent.click(screen.getByRole('button', { name: 'a' }));

    expect(screen.queryByRole('alertdialog')).toBeNull();
    expect(useWorkingCopyStore.getState().isItemDeleted('store#s#0')).toBe(true);
  });

  it('restore path: clicking an already-removed cross-wired store char opens the "restore everywhere" dialog', () => {
    const ir = makeIR(
      [makeGroup('g-main', 'main', [makeSimpleRule('r-a', 'K_A', 'a')])],
      [makeStore('store#s', 'sX', ['a'])],
    );
    const caps = new Map<string, RemovalCapability>([['r-a', 'removable:simple']]);
    collectCharContributorsMock.mockImplementation((_ir: KeyboardIR, ch: string) => ({
      ...emptyContributors(ch),
      ruleNodeIds: ['r-a'],
      storeSlotIds: ['store#s#0'],
    }));

    renderGallery(ir, caps);
    useWorkingCopyStore.getState().deleteItem('r-a');
    useWorkingCopyStore.getState().deleteItem('store#s#0');

    fireEvent.click(screen.getByTestId('carve-card-store#s'));
    fireEvent.click(screen.getByRole('button', { name: 'a' }));

    const dialog = screen.getByRole('alertdialog');
    expect(dialog.textContent).toContain('Restore "a" everywhere?');

    fireEvent.click(within(dialog).getByRole('button', { name: 'Yes, restore everywhere' }));

    expect(useWorkingCopyStore.getState().isItemDeleted('r-a')).toBe(false);
    expect(useWorkingCopyStore.getState().isItemDeleted('store#s#0')).toBe(false);
  });

  it('a disabled/blocked store chip shows its reason and never cascades', () => {
    const ir = makeIR(
      [makeGroup('g-block', 'blockGroup', [makeNotAnyRule('r-block', 'blockedStore', 'x')])],
      [makeStore('store#blocked', 'blockedStore', ['z'])],
    );
    collectCharContributorsMock.mockImplementation((_ir: KeyboardIR, ch: string) => emptyContributors(ch));

    renderGallery(ir);
    fireEvent.click(screen.getByTestId('carve-card-store#blocked'));
    fireEvent.click(screen.getByRole('button', { name: 'z' }));

    expect(screen.queryByRole('alertdialog')).toBeNull();
    expect(collectCharContributorsMock).not.toHaveBeenCalled();
    expect(useWorkingCopyStore.getState().isItemDeleted('store#blocked#0')).toBe(false);
  });

  // Fully-blocked branch (actionCount === 0) driven through the store-chip
  // path — mirrors the glyph-path test in the "not-removable chip" describe
  // block above, but here the clicked store chip itself is toggleable
  // (classifyStoreSlotEdit allows the edit; there's no notany()/dual-use
  // reference on this store), and it's collectCharContributors' `blocked`
  // array — not a per-chip clickedCapability, which store chips never carry
  // — that reports every contributor as not-removable. This proves
  // buildPendingCascade's shared "nothing removable" branch also opens the
  // single-button info dialog for the store path.
  it('a store char whose contributors are all not-removable opens the single-button info dialog', () => {
    const ir = makeIR(
      [makeGroup('g-main', 'main', [])],
      [makeStore('store#s', 'sX', ['a'])],
    );
    collectCharContributorsMock.mockImplementation((_ir: KeyboardIR, ch: string) => ({
      ...emptyContributors(ch),
      blocked: [{ label: 'main', reason: 'Only produced by an opaque advanced rule.' }],
    }));

    renderGallery(ir);
    fireEvent.click(screen.getByTestId('carve-card-store#s'));
    fireEvent.click(screen.getByRole('button', { name: 'a' }));

    const dialog = screen.getByRole('alertdialog');
    expect(dialog.textContent).toContain('"a" can\'t be fully removed');
    expect(dialog.textContent).toContain('Only produced by an opaque advanced rule.');

    // Single-button (fix 3) — omitting secondaryLabel collapses to one button.
    expect(within(dialog).getAllByRole('button')).toHaveLength(1);
    fireEvent.click(within(dialog).getByRole('button', { name: 'OK' }));

    expect(screen.queryByRole('alertdialog')).toBeNull();
    expect(useWorkingCopyStore.getState().isItemDeleted('store#s#0')).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// Coordinated collateral (manual-carve safety, #525/#931 follow-up). A
// manual removal that hits a store paired via classifyStoreSlotEdit's
// coordinatedWith ALSO drops the partner store's aligned character at the
// same index — collectCharContributors never names that partner slot
// directly, so this must never be silent. Fixture mirrors the Cameroon
// `dk(1) any(dkf) > index(dkt,2)` cross-pairing idiom (same shape as the
// engine's applyStoreSlotRemovals.test.ts and irToCarveNodes.test.ts
// coordinatedCollateralForSlots fixtures) — collectCharContributors is
// mocked, but classifyStoreSlotEdit/analyzeStores run for REAL against the
// ir, so the pairing resolution itself is not faked.
// ---------------------------------------------------------------------------

function makeCrossPairedIr(dktChar: string): KeyboardIR {
  return makeIR(
    [{
      nodeId: 'g-main', name: 'main', usingKeys: true, readonly: false,
      rules: [{
        nodeId: 'rule-fanout',
        context: [{ kind: 'deadkey', id: 1 }, { kind: 'any', storeRef: 'dkf' }],
        output: [{ kind: 'index', storeRef: 'dkt', offset: 2 }],
      }],
    }],
    [
      makeStore('store#dkf', 'dkf', ['a']),
      makeStore('store#dkt', 'dkt', [dktChar]),
    ],
  );
}

describe('CarveGallery — coordinated collateral (manual carve safety, #525/#931 follow-up)', () => {
  it('opens the dialog (no longer a silent plain-toggle) and flags a needed collateral character from the paired store', () => {
    const ir = makeCrossPairedIr('α');
    collectCharContributorsMock.mockImplementation((_ir: KeyboardIR, ch: string) => ({
      ...emptyContributors(ch),
      storeSlotIds: ['store#dkf#0'],
    }));

    renderGallery(ir);
    // The author has confirmed 'α' as part of their inventory — it's "needed".
    useWorkingCopyStore.setState((s) => ({ session: { ...s.session, confirmedInventory: ['α'] } }));

    fireEvent.click(screen.getByTestId('carve-card-store#dkf'));
    expect(useWorkingCopyStore.getState().isItemDeleted('store#dkf#0')).toBe(false);

    // Previously (pre-fix) this was a plain-toggle: sole producer, nothing
    // blocked. It must now open the dialog because of the collateral.
    fireEvent.click(screen.getByRole('button', { name: 'a' }));

    const dialog = screen.getByRole('alertdialog');
    expect(dialog).not.toBeNull();
    expect(dialog.textContent).toContain('Remove "a" everywhere?');
    expect(dialog.textContent).toContain('α');
    expect(dialog.textContent).toContain('dkt');
    expect(dialog.textContent).toContain('needed for your language');

    // Awareness, not prevention — the user can still confirm.
    fireEvent.click(within(dialog).getByRole('button', { name: 'Yes, remove everywhere' }));
    expect(useWorkingCopyStore.getState().isItemDeleted('store#dkf#0')).toBe(true);
    // P1 fix: the CONFIRMED collateral partner slot ('dkt' at the same index)
    // must ALSO be persisted as deleted — not just displayed in the dialog —
    // so the Gallery's kept/removed state matches what export-time
    // applyStoreSlotRemovals will actually do.
    expect(useWorkingCopyStore.getState().isItemDeleted('store#dkt#0')).toBe(true);
  });

  it('shows plain (non-flagged) collateral text when the partner character is not needed', () => {
    const ir = makeCrossPairedIr('γ');
    collectCharContributorsMock.mockImplementation((_ir: KeyboardIR, ch: string) => ({
      ...emptyContributors(ch),
      storeSlotIds: ['store#dkf#0'],
    }));

    renderGallery(ir);
    useWorkingCopyStore.setState((s) => ({ session: { ...s.session, confirmedInventory: ['α'] } }));

    fireEvent.click(screen.getByTestId('carve-card-store#dkf'));
    fireEvent.click(screen.getByRole('button', { name: 'a' }));

    const dialog = screen.getByRole('alertdialog');
    expect(dialog.textContent).toContain('γ');
    expect(dialog.textContent).toContain('dkt');
    expect(dialog.textContent).not.toContain('needed for your language');
  });

  // G10 (spec 051 FR-005) — the same dialog, but the partner is the INPUT store.
  // Trimming the composed character off the OUTPUT store drops the trigger
  // letter from the deadkey's any()-consumed input store. That letter is NOT
  // lost — it stays typeable through its own base rule — so this must read as
  // information, not as "you are about to lose a character you need".
  it('G10: an INPUT-store partner renders as role="status" with no warning wording and no emoji', () => {
    const ir = makeCrossPairedIr('α');
    collectCharContributorsMock.mockImplementation((_ir: KeyboardIR, ch: string) => ({
      ...emptyContributors(ch),
      // Target the OUTPUT store this time — so the partner resolved is `dkf`,
      // the any()-consumed INPUT store holding 'a'.
      storeSlotIds: ['store#dkt#0'],
    }));

    renderGallery(ir);
    // 'a' (the input trigger letter) IS needed by the language.
    useWorkingCopyStore.setState((s) => ({ session: { ...s.session, confirmedInventory: ['a'] } }));

    fireEvent.click(screen.getByTestId('carve-card-store#dkt'));
    fireEvent.click(screen.getByRole('button', { name: 'α' }));

    const dialog = screen.getByRole('alertdialog');
    const info = within(dialog).getByRole('status');
    expect(info.textContent).toContain('no longer work');
    expect(info.textContent).toContain('You can still type');
    expect(info.textContent).toContain('a');
    // FR-005: informational, never framed as a loss.
    expect(dialog.textContent).not.toContain('character you need');
    expect(dialog.textContent).not.toContain('needed for your language');
    // Article VIII: no emoji in the collateral copy.
    expect(dialog.textContent).not.toContain('⚠');
    // Nothing is "lost", so there is no alert-severity collateral box.
    expect(within(dialog).queryByText(/characters? you need/)).toBeNull();
  });

  it('a sole-producer char with NO coordinated collateral still plain-toggles (regression guard, unpaired store)', () => {
    // Reuses the existing #523 fixture shape: an unpaired store, no
    // classifyStoreSlotEdit coordinatedWith partner — collateral must be [].
    const ir = makeIR(
      [makeGroup('g-main', 'main', [])],
      [makeStore('store#s', 'sX', ['a'])],
    );
    collectCharContributorsMock.mockImplementation((_ir: KeyboardIR, ch: string) => ({
      ...emptyContributors(ch),
      storeSlotIds: ['store#s#0'],
    }));

    renderGallery(ir);
    useWorkingCopyStore.setState((s) => ({ session: { ...s.session, confirmedInventory: ['α'] } }));

    fireEvent.click(screen.getByTestId('carve-card-store#s'));
    fireEvent.click(screen.getByRole('button', { name: 'a' }));

    expect(screen.queryByRole('alertdialog')).toBeNull();
    expect(useWorkingCopyStore.getState().isItemDeleted('store#s#0')).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// P0 — bulk store-toggle routed through the collateral guard. A store card's
// master ToggleBox (Rail.tsx) drops EVERY toggleable chip in the store at
// once via handleSetManyGlyphs — this must aggregate coordinated collateral
// across the WHOLE batch into ONE confirm dialog, not a silent bulk drop.
// ---------------------------------------------------------------------------

function makeBulkCrossPairedIr(): KeyboardIR {
  return makeIR(
    [{
      nodeId: 'g-main', name: 'main', usingKeys: true, readonly: false,
      rules: [{
        nodeId: 'rule-fanout',
        context: [{ kind: 'deadkey', id: 1 }, { kind: 'any', storeRef: 'dkf' }],
        output: [{ kind: 'index', storeRef: 'dkt', offset: 2 }],
      }],
    }],
    [
      makeStore('store#dkf', 'dkf', ['a', 'b']),
      makeStore('store#dkt', 'dkt', ['α', 'β']),
    ],
  );
}

describe('CarveGallery — bulk store-toggle collateral guard (P0)', () => {
  it('aggregates coordinated collateral across the whole batch into ONE dialog; confirming marks BOTH the batch slots and the collateral partner slots deleted', () => {
    const ir = makeBulkCrossPairedIr();
    collectCharContributorsMock.mockImplementation((_ir: KeyboardIR, ch: string) => emptyContributors(ch));

    renderGallery(ir);
    useWorkingCopyStore.setState((s) => ({ session: { ...s.session, confirmedInventory: ['β'] } }));

    // Master toggle for the whole 'dkf' store — drops BOTH its slots at once.
    const dkfCard = screen.getByTestId('carve-card-store#dkf');
    // A harmless prior interaction (select the card) forces a render flush
    // after the setState above, mirroring the existing single-chip
    // collateral tests' "click the card, THEN click the trigger" sequencing.
    fireEvent.click(dkfCard);
    // The ToggleBox is a sibling of the card <button> under the row wrapper
    // (spec 056 Cycle 1 fix — was previously a descendant, but nesting a
    // real <button> inside a role="button" fires axe nested-interactive).
    fireEvent.click(within(dkfCard.parentElement!).getByRole('button', { name: 'Remove' }));

    // Exactly one dialog, aggregating collateral for BOTH indices.
    expect(screen.getAllByRole('alertdialog')).toHaveLength(1);
    const dialog = screen.getByRole('alertdialog');
    expect(dialog.textContent).toContain('α');
    expect(dialog.textContent).toContain('β');
    expect(dialog.textContent).toContain('dkt');
    expect(dialog.textContent).toContain('needed for your language');

    // Nothing deleted yet — the dialog gated the batch.
    expect(useWorkingCopyStore.getState().isItemDeleted('store#dkf#0')).toBe(false);
    expect(useWorkingCopyStore.getState().isItemDeleted('store#dkf#1')).toBe(false);

    fireEvent.click(within(dialog).getByRole('button', { name: 'Yes, remove everywhere' }));

    // Both batch slots AND both collateral partner slots are now persisted as deleted.
    expect(useWorkingCopyStore.getState().isItemDeleted('store#dkf#0')).toBe(true);
    expect(useWorkingCopyStore.getState().isItemDeleted('store#dkf#1')).toBe(true);
    expect(useWorkingCopyStore.getState().isItemDeleted('store#dkt#0')).toBe(true);
    expect(useWorkingCopyStore.getState().isItemDeleted('store#dkt#1')).toBe(true);
  });

  it('applies the batch immediately (no dialog) when the batch carries no coordinated collateral', () => {
    const ir = makeIR(
      [makeGroup('g-main', 'main', [])],
      [makeStore('store#s', 'sX', ['a', 'b'])],
    );
    collectCharContributorsMock.mockImplementation((_ir: KeyboardIR, ch: string) => emptyContributors(ch));

    renderGallery(ir);

    const card = screen.getByTestId('carve-card-store#s');
    // ToggleBox is a sibling under the row wrapper (see spec 056 note above).
    fireEvent.click(within(card.parentElement!).getByRole('button', { name: 'Remove' }));

    expect(screen.queryByRole('alertdialog')).toBeNull();
    expect(useWorkingCopyStore.getState().isItemDeleted('store#s#0')).toBe(true);
    expect(useWorkingCopyStore.getState().isItemDeleted('store#s#1')).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// 12. Review fix 5 — component-level test for the CLDR-driven 'high' path.
// #525 BANNER slice update: the per-node Rail badge this test originally
// exercised is retired; the assertions now target the green RemovalBanner
// (the single surface for the character-level recommendation signal).
// ---------------------------------------------------------------------------

describe('CarveGallery — language-driven surplus recommendation (removal banner)', () => {
  it('lists a character surplus under the resolved CLDR needed-set in the banner checklist, but not a character that is needed', async () => {
    const ir = makeIR([
      makeGroup('g-main', 'main', [makeSimpleRule('r-z', 'K_Z', 'z')]),
      makeGroup('g-second', 'second', [makeSimpleRule('r-q', 'K_Q', 'q')]),
    ]);
    const caps = new Map<string, RemovalCapability>([
      ['r-z', 'removable:simple'],
      ['r-q', 'removable:simple'],
    ]);
    // recommendedRemovalChars resolves producers via collectCharContributors —
    // map each character to the rule that actually produces it so the
    // allowlist (isSimpleRemovableRule) can see a real, simple producer.
    collectCharContributorsMock.mockImplementation((_ir: KeyboardIR, ch: string) => {
      if (ch === 'z') return { ...emptyContributors(ch), ruleNodeIds: ['r-z'] };
      if (ch === 'q') return { ...emptyContributors(ch), ruleNodeIds: ['r-q'] };
      return emptyContributors(ch);
    });
    neededCharsResult.set(new Set(['q']));

    renderGallery(ir, caps);

    // 'z' is absent from the resolved needed-set — surplus, banner shows and
    // lists exactly one character.
    await screen.findByText(/We recommend removing 1 character/);
    fireEvent.click(screen.getByRole('button', { expanded: false, name: /We recommend removing/ }));
    expect(screen.getByRole('checkbox', { name: 'Remove U+007A' })).not.toBeNull();
    // 'q' IS in the resolved needed-set — never listed.
    expect(screen.queryByRole('checkbox', { name: 'Remove U+0071' })).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// 13. Review fix 8/4 — stale-language race: an in-flight fetch for the OLD
// bcp47 resolving AFTER the bcp47 changes must not overwrite the newer
// language's result (the cancelled-guard in the useEffect). #525 BANNER
// slice update: assertions retargeted from the retired Rail badge to the
// RemovalBanner summary text.
// ---------------------------------------------------------------------------

describe('CarveGallery — stale-language race (cancelled-guard)', () => {
  it('an older in-flight fetch resolving out of order does not overwrite the newer bcp47 result', async () => {
    const ir = makeIR([makeGroup('g-main', 'main', [makeSimpleRule('r-z', 'K_Z', 'z')])]);
    const caps = new Map<string, RemovalCapability>([['r-z', 'removable:simple']]);
    collectCharContributorsMock.mockImplementation((_ir: KeyboardIR, ch: string) =>
      ch === 'z' ? { ...emptyContributors(ch), ruleNodeIds: ['r-z'] } : emptyContributors(ch),
    );

    // basicKbdus.languages[0] === 'en' — instantiateFromExisting seeds identity.bcp47 with it.
    const resolveOld = deferNeededChars('en');
    renderGallery(ir, caps);

    // Old fetch still pending — no recommendation signal yet.
    expect(screen.queryByText(/We recommend removing/)).toBeNull();

    // Language changes mid-flight, before the 'en' fetch resolves.
    const resolveNew = deferNeededChars('fr');
    useWorkingCopyStore.getState().setIdentity({ bcp47: 'fr' });

    // Newer ('fr') fetch resolves first, WITHOUT 'z' — surplus, banner shows.
    resolveNew(new Set(['q']));
    await screen.findByText(/We recommend removing 1 character/);

    // Older ('en') fetch resolves LATER, WITH 'z' — if the cancelled-guard
    // didn't hold, this would overwrite neededChars and the banner would
    // disappear (since 'z' would suddenly be "needed").
    resolveOld(new Set(['z']));
    await Promise.resolve();
    expect(screen.getByText(/We recommend removing 1 character/)).not.toBeNull();
  });
});

// ---------------------------------------------------------------------------
// 14. #525 BANNER slice — RemovalBanner show/hide, expand, and
// "Remove all selected" (checked-subset cascade removal).
// ---------------------------------------------------------------------------

describe('CarveGallery — removal banner (#525 BANNER slice)', () => {
  it('is hidden when there is no recommendation signal at all (no confirmed inventory, no CLDR needed-set)', () => {
    const ir = makeIR([makeGroup('g-main', 'main', [makeSimpleRule('r-z', 'K_Z', 'z')])]);
    const caps = new Map<string, RemovalCapability>([['r-z', 'removable:simple']]);
    collectCharContributorsMock.mockImplementation((_ir: KeyboardIR, ch: string) => emptyContributors(ch));

    renderGallery(ir, caps);

    expect(screen.queryByText(/We recommend removing/)).toBeNull();
  });

  it('shows the correct count and, once expanded, checklist entries for every surplus character — a needed character never appears', async () => {
    const ir = makeIR([
      makeGroup('g-main', 'main', [
        makeSimpleRule('r-a', 'K_A', 'a'),
        makeSimpleRule('r-b', 'K_B', 'b'),
        makeSimpleRule('r-q', 'K_Q', 'q'),
      ]),
    ]);
    const caps = new Map<string, RemovalCapability>([
      ['r-a', 'removable:simple'],
      ['r-b', 'removable:simple'],
      ['r-q', 'removable:simple'],
    ]);
    collectCharContributorsMock.mockImplementation((_ir: KeyboardIR, ch: string) => {
      if (ch === 'a') return { ...emptyContributors(ch), ruleNodeIds: ['r-a'] };
      if (ch === 'b') return { ...emptyContributors(ch), ruleNodeIds: ['r-b'] };
      return emptyContributors(ch);
    });
    neededCharsResult.set(new Set(['q'])); // only 'q' is needed — 'a' and 'b' are surplus

    renderGallery(ir, caps);

    await screen.findByText(/We recommend removing 2 characters/);

    // Collapsed by default — the checklist isn't in the DOM yet.
    expect(screen.queryByRole('checkbox', { name: 'Remove U+0061' })).toBeNull();

    fireEvent.click(screen.getByRole('button', { expanded: false, name: /We recommend removing/ }));

    expect(screen.getByRole('checkbox', { name: 'Remove U+0061' })).not.toBeNull(); // 'a'
    expect(screen.getByRole('checkbox', { name: 'Remove U+0062' })).not.toBeNull(); // 'b'
    // 'q' is needed — never listed, regardless of expansion state.
    expect(screen.queryByRole('checkbox', { name: 'Remove U+0071' })).toBeNull();
  });

  it('"Remove all selected" removes only the still-checked characters, leaving an unchecked one untouched', async () => {
    const ir = makeIR([
      makeGroup('g-main', 'main', [
        makeSimpleRule('r-a', 'K_A', 'a'),
        makeSimpleRule('r-b', 'K_B', 'b'),
      ]),
    ]);
    const caps = new Map<string, RemovalCapability>([
      ['r-a', 'removable:simple'],
      ['r-b', 'removable:simple'],
    ]);
    collectCharContributorsMock.mockImplementation((_ir: KeyboardIR, ch: string) => {
      if (ch === 'a') return { ...emptyContributors(ch), ruleNodeIds: ['r-a'] };
      if (ch === 'b') return { ...emptyContributors(ch), ruleNodeIds: ['r-b'] };
      return emptyContributors(ch);
    });
    neededCharsResult.set(new Set(['q'])); // neither 'a' nor 'b' is needed

    renderGallery(ir, caps);
    await screen.findByText(/We recommend removing 2 characters/);
    fireEvent.click(screen.getByRole('button', { expanded: false, name: /We recommend removing/ }));

    // Both pre-checked by default.
    const checkboxA = screen.getByRole('checkbox', { name: 'Remove U+0061' });
    const checkboxB = screen.getByRole('checkbox', { name: 'Remove U+0062' });
    expect((checkboxA as HTMLInputElement).checked).toBe(true);
    expect((checkboxB as HTMLInputElement).checked).toBe(true);

    // Uncheck 'a' — only 'b' should be removed.
    fireEvent.click(checkboxA);
    fireEvent.click(screen.getByRole('button', { name: /Remove all selected \(1\)/ }));

    expect(useWorkingCopyStore.getState().isItemDeleted('r-a')).toBe(false);
    expect(useWorkingCopyStore.getState().isItemDeleted('r-b')).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// Every acted-on trim is visibly reflected (spec 051 US3)
//
// FR-007 is asserted over RENDERED state, not the store: the bug report was
// "the dialog closes and nothing changes colour", which a store-level
// assertion cannot see. GlyphCell renders its removed state as
// `aria-pressed`, so that is what these read.
//
// FR-008: a trim request terminates in exactly one of three outcomes —
// applied / applied-with-explicitly-retained-producers / refused-with-reason.
// "Closes with no visible effect" is not among them.
// ---------------------------------------------------------------------------

/**
 * Two keys producing 'g' — a two-producer character. Both rules live in the
 * SAME group so both tiles render at once; the invariant under test is about
 * what the author can see in one render.
 */
function makeTwoProducerIR(): KeyboardIR {
  return makeIR([
    makeGroup('g-main', 'main', [
      makeSimpleRule('r-g1', 'K_G', 'g'),
      makeSimpleRule('r-g2', 'K_H', 'g'),
    ]),
  ]);
}

/** Rendered removed-state of a glyph tile, read off GlyphCell's aria-pressed. */
function tileIsRemoved(name: string): boolean {
  return screen.getByRole('button', { name }).getAttribute('aria-pressed') === 'true';
}

describe('CarveGallery — every applied trim is visible (spec 051 US3)', () => {
  it('FR-007: after a confirmed trim, EVERY tile in the contributor set renders removed, in the same render', () => {
    const caps = new Map<string, RemovalCapability>([
      ['r-g1', 'removable:simple'],
      ['r-g2', 'removable:simple'],
    ]);
    collectCharContributorsMock.mockImplementation((_ir: KeyboardIR, ch: string) => ({
      ...emptyContributors(ch),
      ruleNodeIds: ['r-g1', 'r-g2'],
    }));

    renderGallery(makeTwoProducerIR(), caps);
    expect(tileIsRemoved('g — K_G')).toBe(false);
    expect(tileIsRemoved('g — K_H')).toBe(false);

    fireEvent.click(screen.getByRole('button', { name: 'g — K_G' }));
    fireEvent.click(screen.getByRole('button', { name: 'Yes, remove everywhere' }));

    // The clicked tile AND the other producer's tile both flip — the trimmed
    // contributor set is a subset of the tiles rendered removed.
    expect(tileIsRemoved('g — K_G')).toBe(true);
    expect(tileIsRemoved('g — K_H')).toBe(true);
  });

  it('FR-007: the kept/total counter updates in the same render', () => {
    const caps = new Map<string, RemovalCapability>([
      ['r-g1', 'removable:simple'],
      ['r-g2', 'removable:simple'],
    ]);
    collectCharContributorsMock.mockImplementation((_ir: KeyboardIR, ch: string) => ({
      ...emptyContributors(ch),
      ruleNodeIds: ['r-g1', 'r-g2'],
    }));

    renderGallery(makeTwoProducerIR(), caps);
    expect(screen.getByText('2').textContent).toBe('2'); // 2 of 2 kept

    fireEvent.click(screen.getByRole('button', { name: 'g — K_G' }));
    fireEvent.click(screen.getByRole('button', { name: 'Yes, remove everywhere' }));

    expect(screen.getByText('0').textContent).toBe('0'); // 0 of 2 kept
  });

  it('FR-008 outcome 1 — APPLIED: a sole-producer trim flips its tile with no dialog', () => {
    const ir = makeIR([makeGroup('g-main', 'main', [makeSimpleRule('r-a', 'K_A', 'a')])]);
    const caps = new Map<string, RemovalCapability>([['r-a', 'removable:simple']]);
    collectCharContributorsMock.mockImplementation((_ir: KeyboardIR, ch: string) => ({
      ...emptyContributors(ch),
      ruleNodeIds: ['r-a'],
    }));

    renderGallery(ir, caps);
    fireEvent.click(screen.getByRole('button', { name: 'a — K_A' }));

    expect(screen.queryByRole('alertdialog')).toBeNull();
    expect(tileIsRemoved('a — K_A')).toBe(true);
  });

  it('FR-008 outcome 2 — APPLIED WITH RETAINED PRODUCERS: the retained one is named with a reason, and stays lit', () => {
    const caps = new Map<string, RemovalCapability>([
      ['r-g1', 'removable:simple'],
      ['r-g2', 'not-removable:context-sensitive'],
    ]);
    collectCharContributorsMock.mockImplementation((_ir: KeyboardIR, ch: string) => ({
      ...emptyContributors(ch),
      ruleNodeIds: ['r-g1', 'r-g2'],
    }));

    renderGallery(makeTwoProducerIR(), caps);
    fireEvent.click(screen.getByRole('button', { name: 'g — K_G' }));

    // The dialog says WHICH producer is being kept and WHY — never silent.
    const dialog = screen.getByRole('alertdialog');
    expect(dialog.textContent).toContain('Marked not-removable');
    expect(dialog.textContent).toContain('Only produces this character after certain keys are pressed');

    fireEvent.click(within(dialog).getByRole('button', { name: 'Yes, remove everywhere' }));

    expect(tileIsRemoved('g — K_G')).toBe(true);
    expect(tileIsRemoved('g — K_H')).toBe(false); // retained, and the author was told
  });

  it('FR-008 outcome 3 — REFUSED WITH REASON: nothing is removable, nothing flips, and the reason is shown', () => {
    const ir = makeIR([makeGroup('g-main', 'main', [makeSimpleRule('r-e', 'K_E', 'e')])]);
    const caps = new Map<string, RemovalCapability>([['r-e', 'not-removable:context-sensitive']]);
    collectCharContributorsMock.mockImplementation((_ir: KeyboardIR, ch: string) => emptyContributors(ch));

    renderGallery(ir, caps);
    fireEvent.click(screen.getByRole('button', { name: 'e — K_E' }));

    const dialog = screen.getByRole('alertdialog');
    expect(dialog.textContent).toContain('can\'t be fully removed');
    expect(dialog.textContent).toContain('Only produces this character after certain keys are pressed');

    fireEvent.click(within(dialog).getByRole('button', { name: 'OK' }));
    expect(tileIsRemoved('e — K_E')).toBe(false);
  });

  it('FR-008: a trim never closes with no visible effect — the plain-toggle fast path only fires for a complete trim', () => {
    // The fast path (removableCount <= 1 && nothing blocked && no collateral)
    // is reachable ONLY when the clicked tile is the whole trim. A second
    // producer raises removableCount (dialog), and a not-removable one lands in
    // `blocked` (dialog) — so it can never flip one gid and leave a sibling lit.
    const caps = new Map<string, RemovalCapability>([
      ['r-g1', 'removable:simple'],
      ['r-g2', 'not-removable:opaque'],
    ]);
    collectCharContributorsMock.mockImplementation((_ir: KeyboardIR, ch: string) => ({
      ...emptyContributors(ch),
      ruleNodeIds: ['r-g1', 'r-g2'],
    }));

    renderGallery(makeTwoProducerIR(), caps);
    fireEvent.click(screen.getByRole('button', { name: 'g — K_G' }));

    expect(screen.queryByRole('alertdialog')).not.toBeNull();
  });
});

// ---------------------------------------------------------------------------
// T028 — gallery-level cased-letter tests (spec 051 FR-011/FR-014/FR-015,
// contracts/case-pairing.md "Proposal-row granularity", OQ-5).
//
// Fixture: U+018E (Ǝ, LATIN CAPITAL LETTER REVERSED E) <-> U+01DD (ǝ, LATIN
// SMALL LETTER TURNED E) — a REAL, verified case fold (`'Ǝ'.toLowerCase() ===
// 'ǝ'`), NOT the U+0259/U+018E near-miss the task briefing warned off (U+0259
// schwa's uppercase is U+018F, a different letter). Both members are surplus
// (absent from the resolved needed-set) and each is produced by its own
// isSimpleRemovableRule-eligible rule, so recommendedRemovalChars's
// allow-listing lets both through and `caseGroupFor` (via `caseCounterpart`,
// which is plain toUpperCase/toLowerCase-based — verified above, not
// locale-sensitive here) folds them into ONE row per FR-014.
// ---------------------------------------------------------------------------

const CASE_UPPER = 'Ǝ'; // Ǝ
const CASE_LOWER = 'ǝ'; // ǝ

/** Two rules producing a real case pair, each individually removable. */
function makeCasePairIR(): { ir: KeyboardIR; caps: Map<string, RemovalCapability> } {
  const ir = makeIR([
    makeGroup('g-main', 'main', [
      makeSimpleRule('r-cap', 'K_A', CASE_UPPER),
      makeSimpleRule('r-low', 'K_B', CASE_LOWER),
    ]),
  ]);
  const caps = new Map<string, RemovalCapability>([
    ['r-cap', 'removable:simple'],
    ['r-low', 'removable:simple'],
  ]);
  return { ir, caps };
}

/** Mocks collectCharContributors so each case member resolves to its OWN rule id only —
 * the per-chip cascade path never consults the other member (that's the escape hatch). */
function mockCasePairContributors() {
  collectCharContributorsMock.mockImplementation((_ir: KeyboardIR, ch: string) => {
    if (ch === CASE_UPPER) return { ...emptyContributors(ch), ruleNodeIds: ['r-cap'] };
    if (ch === CASE_LOWER) return { ...emptyContributors(ch), ruleNodeIds: ['r-low'] };
    return emptyContributors(ch);
  });
}

/** Opens the RemovalBanner checklist (mirrors the #525 BANNER slice tests' expand step). */
async function expandBanner() {
  await screen.findByText(/We recommend removing/);
  fireEvent.click(screen.getByRole('button', { expanded: false, name: /We recommend removing/ }));
}

describe('CarveGallery — cased-letter proposal rows (spec 051 T028)', () => {
  it('(a) FR-014: both case members surplus -> exactly ONE paired row, not two separate rows', async () => {
    const { ir, caps } = makeCasePairIR();
    mockCasePairContributors();
    neededCharsResult.set(new Set(['q'])); // neither case member is needed — both surplus

    renderGallery(ir, caps);
    await expandBanner();

    // Exactly one checkbox in the whole checklist — the fold produced ONE row, not two.
    expect(screen.getAllByRole('checkbox')).toHaveLength(1);

    // The combined paired-row aria-label/codepoint text is present...
    const pairedCheckbox = screen.getByRole('checkbox', { name: 'Remove U+018E / U+01DD (both cases)' });
    expect(pairedCheckbox).not.toBeNull();

    // ...and neither single-member aria-label rendered as its OWN separate row.
    expect(screen.queryByRole('checkbox', { name: 'Remove U+018E' })).toBeNull();
    expect(screen.queryByRole('checkbox', { name: 'Remove U+01DD' })).toBeNull();

    // The row's glyph/codepoint cells show BOTH members, not just the survivor.
    const checklist = screen.getByRole('list', { name: 'Recommended characters to remove' });
    expect(checklist.textContent).toContain('Ǝ / ǝ');
    expect(checklist.textContent).toContain('U+018E / U+01DD');
  });

  it('(b1) escape-hatch hint renders when a paired row is present', async () => {
    const { ir, caps } = makeCasePairIR();
    mockCasePairContributors();
    neededCharsResult.set(new Set(['q']));

    renderGallery(ir, caps);
    await expandBanner();
    expect(screen.getByText(/A paired row removes both cases together/)).not.toBeNull();
  });

  it('(b2) escape-hatch hint is absent when every recommended row is unpaired', async () => {
    // A single surplus character with no case counterpart in the produced set
    // (mirrors the existing 'removal banner' describe block's fixture) —
    // recommendedRemovalChars never sets `caseGroup` on an unpaired row, so
    // RemovalBanner's `hasPairedRow` must stay false and the hint must not render.
    const ir = makeIR([makeGroup('g-main', 'main', [makeSimpleRule('r-z', 'K_Z', 'z')])]);
    const caps = new Map<string, RemovalCapability>([['r-z', 'removable:simple']]);
    collectCharContributorsMock.mockImplementation((_ir: KeyboardIR, ch: string) =>
      ch === 'z' ? { ...emptyContributors(ch), ruleNodeIds: ['r-z'] } : emptyContributors(ch),
    );
    neededCharsResult.set(new Set(['q']));

    renderGallery(ir, caps);
    await expandBanner();
    expect(screen.queryByText(/A paired row removes both cases together/)).toBeNull();
  });

  it('(c) FR-011/FR-015: accepting the paired row trims BOTH cases as ONE action, ONE undo entry', async () => {
    const { ir, caps } = makeCasePairIR();
    mockCasePairContributors();
    neededCharsResult.set(new Set(['q']));

    renderGallery(ir, caps);
    await expandBanner();

    const undoDepthBefore = useWorkingCopyStore.getState().undoStack.length;
    expect(useWorkingCopyStore.getState().isItemDeleted('r-cap')).toBe(false);
    expect(useWorkingCopyStore.getState().isItemDeleted('r-low')).toBe(false);

    // The paired row is pre-checked by construction — "Remove all selected (1)"
    // acts on it directly, no per-row confirm dialog (the checklist IS the confirm).
    fireEvent.click(screen.getByRole('button', { name: /Remove all selected \(1\)/ }));

    // Both rule ids — the survivor's own contributors AND the folded-in
    // counterpart's — land deleted.
    expect(useWorkingCopyStore.getState().isItemDeleted('r-cap')).toBe(true);
    expect(useWorkingCopyStore.getState().isItemDeleted('r-low')).toBe(true);

    // ONE action / ONE undo entry (FR-011/FR-015) — not two separate cascades.
    // cascadeDelete pushes exactly one 'batch' undo entry per call; prove it
    // directly off the undo stack rather than inferring it from deletion state.
    const undoStackAfter = useWorkingCopyStore.getState().undoStack;
    expect(undoStackAfter.length).toBe(undoDepthBefore + 1);
    const lastEntry = undoStackAfter[undoStackAfter.length - 1]!;
    expect(lastEntry.k).toBe('batch');
    expect(lastEntry.itemIds).toEqual(expect.arrayContaining(['r-cap', 'r-low']));
  });

  it('(d) OQ-5 escape hatch: declining the paired row and trimming ONE case via its own chip leaves the counterpart untouched', () => {
    const { ir, caps } = makeCasePairIR();
    mockCasePairContributors();
    neededCharsResult.set(new Set(['q']));

    renderGallery(ir, caps);
    // Deliberately does NOT expand/accept the banner row — the author is using
    // the per-chip cascade directly, i.e. declining the paired proposal.
    const upperTileName = `${CASE_UPPER} — K_A`;
    const lowerTileName = `${CASE_LOWER} — K_B`;
    expect(tileIsRemoved(upperTileName)).toBe(false);
    expect(tileIsRemoved(lowerTileName)).toBe(false);

    // Sole-producer, capability-removable chip — plain toggle, no dialog, and
    // (unlike the banner path) it never consults the case-group partner.
    fireEvent.click(screen.getByRole('button', { name: upperTileName }));

    expect(screen.queryByRole('alertdialog')).toBeNull();
    expect(useWorkingCopyStore.getState().isItemDeleted('r-cap')).toBe(true);
    // The counterpart's rule is untouched, and its tile stays lit.
    expect(useWorkingCopyStore.getState().isItemDeleted('r-low')).toBe(false);
    expect(tileIsRemoved(lowerTileName)).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// 15. Convenience shield — base letters the author kept at the pre-carve
// question (session.retainedConvenienceChars) must never be proposed for
// removal, even though the orthography does not use them.
// ---------------------------------------------------------------------------

describe('CarveGallery — convenience-retained characters are shielded', () => {
  /** 'a' and 'b' are surplus; the language needs only 'q'. */
  function renderSurplusAB(retained?: string[]) {
    const ir = makeIR([
      makeGroup('g-main', 'main', [
        makeSimpleRule('r-a', 'K_A', 'a'),
        makeSimpleRule('r-b', 'K_B', 'b'),
      ]),
    ]);
    const caps = new Map<string, RemovalCapability>([
      ['r-a', 'removable:simple'],
      ['r-b', 'removable:simple'],
    ]);
    collectCharContributorsMock.mockImplementation((_ir: KeyboardIR, ch: string) => {
      if (ch === 'a') return { ...emptyContributors(ch), ruleNodeIds: ['r-a'] };
      if (ch === 'b') return { ...emptyContributors(ch), ruleNodeIds: ['r-b'] };
      return emptyContributors(ch);
    });
    neededCharsResult.set(new Set(['q']));
    renderGallery(ir, caps);
    // AFTER renderGallery: instantiateFromExisting resets the session, so a
    // retained list seeded before it would be wiped.
    if (retained !== undefined) {
      useWorkingCopyStore.setState((s) => ({
        session: { ...s.session, retainedConvenienceChars: retained },
      }));
    }
  }

  it('drops a retained character from the recommendation count', async () => {
    renderSurplusAB(['a']);
    // Without the shield this reads "2 characters" (see the banner block above).
    await screen.findByText(/We recommend removing 1 character(?!s)/);
  });

  it('never lists a retained character in the expanded checklist', async () => {
    renderSurplusAB(['a']);
    await screen.findByText(/We recommend removing 1 character(?!s)/);
    fireEvent.click(screen.getByRole('button', { expanded: false, name: /We recommend removing/ }));

    expect(screen.queryByRole('checkbox', { name: 'Remove U+0061' })).toBeNull(); // 'a' kept
    expect(screen.getByRole('checkbox', { name: 'Remove U+0062' })).not.toBeNull(); // 'b' still surplus
  });

  it('hides the banner entirely when every surplus character was retained', async () => {
    // Retain nothing first and WAIT for the banner. That await is what makes
    // the negative assertion below meaningful: it proves the async CLDR lookup
    // has settled and this fixture really does recommend both characters, so a
    // later absence is the shield working rather than the test looking too early.
    renderSurplusAB(undefined);
    await screen.findByText(/We recommend removing 2 characters/);

    useWorkingCopyStore.setState((s) => ({
      session: { ...s.session, retainedConvenienceChars: ['a', 'b'] },
    }));

    await waitFor(() => {
      expect(screen.queryByText(/We recommend removing/)).toBeNull();
    });
  });

  it('recommends normally when the author kept nothing (asked, kept none)', async () => {
    renderSurplusAB([]);
    await screen.findByText(/We recommend removing 2 characters/);
  });

  it('recommends normally when the question was never asked', async () => {
    renderSurplusAB(undefined);
    await screen.findByText(/We recommend removing 2 characters/);
  });
});

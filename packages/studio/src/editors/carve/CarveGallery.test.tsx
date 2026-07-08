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
import { render, cleanup, fireEvent, screen, within } from '@testing-library/react';
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

const { collectCharContributorsMock } = vi.hoisted(() => ({
  collectCharContributorsMock: vi.fn(),
}));

vi.mock('@keyboard-studio/engine', async () => {
  const actual = await vi.importActual<typeof import('@keyboard-studio/engine')>('@keyboard-studio/engine');
  return {
    ...actual,
    collectCharContributors: collectCharContributorsMock,
  };
});

afterEach(() => {
  cleanup();
  collectCharContributorsMock.mockReset();
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
  return { targetChar, ruleNodeIds: [], storeSlotIds: [], locations: [], blocked: [] };
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

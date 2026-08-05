// useKeyCommands — the touch key grid's COMMAND layer (spec 058 T094;
// FR-029, US4 AS1), distinct from `useGridNav.ts`'s NAVIGATION layer in the
// same directory. Where `useGridNav` answers "which cell comes next",
// this hook answers "what can the author DO to the selected key, and how do
// they invoke it."
//
// ## The one requirement this file exists to satisfy
//
// AS1: "Given a selected key, When the author presses Insert (or uses the
// key's command menu), Then a key is added after it and the studio proposes
// a real id — never `T_new_<n>`." Two invocation routes, ONE
// implementation: `buildAddKeyAfterOutcome` (pure, exported for direct unit
// testing — same convention as `useGridNav.ts`'s exported step functions and
// `useKeyEditGuards.ts`'s exported `findInvalidatedAssignedCharacters`) is
// the entire decision. `handleKeyDown`'s Insert branch and each
// `KeyGridCommandDescriptor.run()` both call the SAME `runAddKeyAfter`
// callback below — never two independent code paths that could drift, which
// is exactly the failure mode key-edit-overlay.md's "single-writer chain"
// language keeps warning about at the commit layer, and applies just as
// much to the PROPOSAL layer above it.
//
// ## Why the proposed id is `U_FFFD`, not a character-derived id
//
// `proposeKeyId` (keyIdMinting.ts, T079) needs a `chars` string to decide
// which row of key-id-policy.md's table applies — and a freshly INSERTED key
// has no character content yet; assigning one is `AssignPanel`'s job (US2,
// a separate, later action). Calling `proposeKeyId({ chars: "", ... })`
// exercises that module's own documented "empty-input edge case" — it
// returns `{ path: "unicode-default", id: "U_FFFD", ruleRequired: false,
// guardRequired: false }`, explicitly described there as mirroring
// `charToUnicodeKeyId`'s own empty-input fallback. This is NOT a workaround;
// it is the one existing, deliberate seam in that module for "a key that
// does not yet know what it will produce," and no caller exercised it before
// this hook. `U_FFFD` (REPLACEMENT CHARACTER) is load-bearing for FR-029/
// FR-045/SC-008 in three ways at once:
//   - it is a REAL id, satisfying AS1's "never `T_new_<n>`" as literally as
//     possible — it is not a counter, not a sentinel string invented by this
//     file, and not a second placeholder convention alongside the four the
//     engine already reserves (`T_removed_*`/`T_carved_*`/`T_touchdel_*`/
//     `T_new_*` — see keyIdMinting.ts's own module doc);
//   - it self-outputs (`U_` ids are interpreted by KeymanWeb's
//     `forUnicodeKeynames`, per key-id-policy.md §1a), so the new key is
//     NEVER a dead `T_` key (FR-045/SC-008) even before the author assigns
//     it a real character or renames it;
//   - `ruleRequired: false` means this hook never needs to touch the `.kmn`
//     at all — the layout-side `add` op is the ENTIRE commit, unlike
//     AssignPanel's guard/rule-bearing paths.
//
// ## Store-free, like every sibling editing surface in this directory
//
// Exactly the same discipline `AssignPanel.tsx` and `RenameDialog.tsx`
// document for themselves: this hook takes `layout` as a prop (the
// EFFECTIVE, overlay-folded `TouchLayoutIR` — same contract
// `keyGridViewModel.ts`/`useKeyEditGuards.ts` take) and never imports
// `useWorkingCopyStore`. It never calls `commitKeyEdit` itself. `onAddKeyAfter`
// fires EXACTLY ONCE per invocation with a discriminated `AddKeyAfterOutcome`
// — the caller (a later TouchGallery.tsx wiring task, out of this task's
// scope) decides whether to append `outcome.result.op` via `commitKeyEdit`
// (success) or how to surface `outcome.reason` (rejection). This is the
// "propose, then confirm" §3c requires: this hook's whole job is the
// PROPOSAL half — computing a real, validated id and the op that would
// carry it — never a silent commit. "Confirm" is the caller's act of
// actually writing it to the overlay, exactly as it already is for every
// other editing surface here.
//
// ## Validation: reused, never reimplemented (FR-045)
//
// `U_FFFD` is FIXED — every add-after invocation proposes the identical id.
// That is fine for the FIRST unassigned added key in a layer, but a SECOND
// one, added before the first is assigned a real character or renamed away
// from the placeholder, would collide — exactly the edge case spec.md names
// explicitly: "Adding a key that collides with an existing id in the same
// layer... Must be rejected at edit time." `buildAddKeyAfterOutcome` runs
// the SAME `validateCandidateKeyId` (keyIdMinting.ts, T079) every other
// editing surface in this directory calls, scoped to the anchor key's own
// (platform, layer) pair — mirroring `RenameDialog.tsx`'s
// `collectLayerScopeIds` (that file's own local, non-exported helper; this
// file's `collectSameLayerIds` is a parallel, narrower version with no
// `excludeAddress` parameter, since an ADD introduces a key that was never
// in the layout to begin with — there is nothing to exclude). A collision
// is reported as a rejection, not silently retried with a different shape:
// this file does not invent a disambiguation scheme (e.g. appending a
// counter) that key-id-policy.md's minting table does not itself define.
//
// ## What this hook deliberately does NOT do
//
// - Author geometry. `NewKeySpec` (keyEditOps.ts) has no `width`/`pad` field
//   at all — the applier assigns the new key's width/pad from the insert
//   position (key-edit-overlay.md §3's "geometry is read-only in
//   Increment 1"). This file supplies only `{ id, text: "", sp: 0 }`.
// - Render anything. No JSX, no DOM. `KeyGridCommandDescriptor.label` is a
//   ready-to-render, localized STRING (via the optional-`i18n` convention
//   `useKeyEditGuards.ts`/`useModeContextCarry.ts` already use — a real
//   component passes `useLingui()`'s `i18n`; a unit test omits it and
//   asserts on the English source text baked into the `msg()` descriptor) —
//   the rendered "⋯" affordance and the hover wedges belong to
//   `KeyGridCell.tsx`, and the menu WIDGET to `KeyGridCommandMenu.tsx` (both
//   T111). `commands` is the DATA that menu renders, not the menu itself.
// - Implement `suppress` (T095) or the three-outcome remove dialog
//   (T097-T099). `UseKeyCommandsOptions`/`commands` are
//   shaped so those tasks EXTEND this hook (one more `onXxx` callback prop,
//   one more `KeyGridCommandDescriptor` pushed into the array) rather than
//   restructure it — see "Extension seam" below, which is exactly how T111's
//   own two commands landed.
// - Handle Shift+Insert. research.md's own shortcut table lists
//   "Insert / Shift+Insert / Delete / Alt+Arrow" as the eventual full set
//   (Shift+Insert reads as "insert BEFORE" by the obvious symmetry with this
//   file's `position: "after"`), but AS1 names only Insert, and
//   `key-edit-overlay.md`'s `AddKeyOp.position` already supports `"before"`
//   for whenever that shortcut is added. `handleKeyDown` below therefore
//   requires Insert with NO modifier held (deliberately excluding
//   Shift/Ctrl/Alt/Meta) so that a future Shift+Insert binding never
//   silently double-fires this command in the interim.
//
// ## Extension seam
//
// `commands` is a plain `readonly KeyGridCommandDescriptor[]`, built by a
// `useMemo`. A later task adding "Suppress" or
// "Remove" support wires its own `onXxx` callback prop into this hook's
// options, computes its own outcome the same way `runAddKeyAfter` does
// below, and appends one more descriptor to the array this `useMemo`
// returns — no caller of `commands` needs to change shape to notice a new
// entry. `handleKeyDown` extends the same way: one more recognized `event.key`
// branch, routed through that same descriptor's `run()`.
//
// ## T111's two keyboard routes — why they live HERE, not in the cell
//
// T111 (FR-021) makes the pointer paths first-class: hover reveals the
// `(+)`/`⋯` wedges, right-click opens the command menu, double-click follows
// a key's "Goes to" layer. Every one of those MUST also have a keyboard
// route (FR-020b; docs/accessibility.md rule 3) — and a keyboard route is a
// COMMAND, which is this file's layer, not `KeyGridCell.tsx`'s. The cell owns
// the pointer gestures; this hook owns their keyboard equivalents and the
// descriptor list a menu renders. Neither duplicates the other: both routes
// call the same `runOpenCommandMenu` / `runFollowNextLayer` callback, exactly
// as Insert and the "Add key after" descriptor already share
// `runAddKeyAfter`.
//
// The two bindings, and why each is safe against `useGridNav.ts`:
//
// - **`ContextMenu` / `Shift+F10` -> open the command menu.** The universal
//   OS-level "open the context menu for the focused thing" pair; a
//   keyboard-only author gets the same menu the mouse gets from right-click.
//   Neither key is in `useGridNav`'s `RECOGNIZED_KEYS`.
// - **`Ctrl+Enter` -> follow the "Goes to" layer.** Deliberately NOT
//   `Alt+Arrow`: research.md's own shortcut table (§"Floating wedge
//   add/delete buttons") reserves `Alt+Arrow` for MOVING a key — drag's
//   keyboard analogue — and `useGridNav`'s `handleKeyDown` claims
//   `ArrowLeft`/`ArrowRight` REGARDLESS of modifiers (it tests
//   `RECOGNIZED_KEYS.has(event.key)` before looking at any modifier), so an
//   `Alt+ArrowRight` binding here would double-fire: follow the layer AND
//   step the selection one column right. `Ctrl+Enter` collides with neither
//   that hook (no `Enter` branch) nor FR-020b's plain `Enter`/`F2`
//   ("move focus into the inspector"), which is a different surface's
//   concern entirely. Because the cell is a native `<button>`, `Enter` would
//   otherwise also fire a synthetic `click` (i.e. a re-select); the
//   `preventDefault()` in that branch is what suppresses it, so following a
//   layer never doubles as a selection change.
//
// Both commands stay in `commands` even when unavailable, with
// `enabled: false` — per `KeyGridCommandDescriptor.enabled`'s own contract, a
// menu renders a disabled entry rather than omitting it, so the command's
// existence stays discoverable. "Follow the Goes to layer" is enabled only
// when the selected key actually HAS a `nextlayer`; a key that switches
// nowhere has nothing to follow.

import { useCallback, useMemo } from "react";
import type { KeyboardEvent as ReactKeyboardEvent } from "react";
import type { I18n } from "@lingui/core";
import { msg } from "@lingui/core/macro";
import type { TouchLayoutIR } from "@keyboard-studio/contracts";
import {
  parseTouchKeyAddress,
  proposeKeyId,
  validateCandidateKeyId,
  type ExistingKeyIdInScope,
  type KeyEditOperation,
  type KeyIdMintingProposal,
  type KeyIdRejectionReason,
} from "@keyboard-studio/engine";
import { resolveMessage } from "../../../lib/i18nResolve.ts";
import type { KeyGridCellViewModel } from "./keyGridViewModel.ts";

// ---------------------------------------------------------------------------
// The add-after outcome (see module doc, "Store-free")
// ---------------------------------------------------------------------------

/** `Omit<..., "seq">` of the engine's own `add` operation — never hand-duplicated (mirrors `AssignPanel.tsx`'s `AssignPanelSetOp` / `RenameDialog.tsx`'s `RenameDialogRenameOp`), so this cannot drift from the shape `commitKeyEdit` expects. */
export type AddKeyAfterOp = Omit<Extract<KeyEditOperation, { kind: "add" }>, "seq">;

export interface AddKeyAfterResult {
  /** Append via `commitKeyEdit` (store-owned; this file never calls it — see module doc, "Store-free"). */
  readonly op: AddKeyAfterOp;
  /** The confirmed minting proposal, echoed for logging/testing — always the `unicode-default` / `U_FFFD` path today (see module doc, "Why the proposed id is `U_FFFD`"). */
  readonly proposal: KeyIdMintingProposal;
}

/**
 * The result of one add-after invocation. `ok: false` covers both an
 * unparseable anchor address (defensive; should not occur against a real
 * `KeyGridCellViewModel`) and a genuine in-layer id collision
 * (FR-045 — see module doc, "Validation"). The caller decides how to surface
 * `reason` (e.g. a toast); this hook composes no user-facing rejection copy
 * itself, matching `RenameDialog.tsx`'s split between validation (engine)
 * and composed prose (component).
 */
export type AddKeyAfterOutcome =
  | { readonly ok: true; readonly result: AddKeyAfterResult }
  | { readonly ok: false; readonly reason: KeyIdRejectionReason };

// ---------------------------------------------------------------------------
// Scoped existing-id collection (see module doc, "Validation")
// ---------------------------------------------------------------------------

/**
 * Every top-level key id already in `platformId`/`layerId` — the scope the
 * new key would join. Mirrors `RenameDialog.tsx`'s own (non-exported)
 * `collectLayerScopeIds` with no `excludeAddress`: an ADD never needs to
 * exclude anything, since the key being added is not yet present anywhere
 * in `layout`.
 */
function collectSameLayerIds(
  layout: TouchLayoutIR,
  platformId: string,
  layerId: string,
): ExistingKeyIdInScope[] {
  const out: ExistingKeyIdInScope[] = [];
  const platform = layout.platforms.find((p) => p.id === platformId);
  if (platform === undefined) return out;
  const layer = platform.layers.find((l) => l.id === layerId);
  if (layer === undefined) return out;
  for (const row of layer.rows) {
    for (const k of row.keys) {
      out.push({ id: k.id, ...(k.layer !== undefined ? { layer: k.layer } : {}) });
    }
  }
  return out;
}

// ---------------------------------------------------------------------------
// The one decision (pure; exported for direct unit testing — see module doc,
// "The one requirement this file exists to satisfy")
// ---------------------------------------------------------------------------

/**
 * Propose (never mutate, never commit) adding a key immediately after
 * `anchor` in `layout`. `layout` is the EFFECTIVE (overlay-folded) touch
 * layout — the same contract every sibling in this directory takes.
 *
 * Always proposes the `unicode-default` path with an empty `chars` request
 * (see module doc, "Why the proposed id is `U_FFFD`") — a new key carries no
 * character intent yet, so there is nothing else this function could
 * legitimately ask `proposeKeyId` to decide between.
 */
export function buildAddKeyAfterOutcome(
  anchor: KeyGridCellViewModel,
  layout: TouchLayoutIR,
): AddKeyAfterOutcome {
  const parts = parseTouchKeyAddress(anchor.address);
  if (parts === undefined) return { ok: false, reason: "malformed" };

  const proposal = proposeKeyId({ chars: "", capsHandled: false });

  const existingIdsInScope = collectSameLayerIds(layout, parts.platform, parts.layerId);
  const validation = validateCandidateKeyId(proposal.id, { minting: true, existingIdsInScope });
  if (!validation.valid) return { ok: false, reason: validation.reason };

  const op: AddKeyAfterOp = {
    address: anchor.address,
    kind: "add",
    position: "after",
    // No `width`/`pad` — geometry is read-only this increment (see module
    // doc, "What this hook deliberately does NOT do"). `sp: 0` is the
    // ordinary interactive/letter class (FR-029a's full set is
    // `{0,1,2,8,9,10}`); an added key is authored as a normal, usable key,
    // never pre-suppressed — suppressing is its own separate command (T095).
    key: { id: proposal.id, text: "", sp: 0 },
  };
  return { ok: true, result: { op, proposal } };
}

// ---------------------------------------------------------------------------
// Localized command label (docs/accessibility.md — programmatic labels;
// same optional-`i18n` convention as useKeyEditGuards.ts's
// composeInvalidationMessage / useModeContextCarry.ts's
// composeCarryKindLabel: a real component passes useLingui()'s `i18n`; a
// unit test calling with none asserts on the English source text baked into
// the msg() descriptor.)
// ---------------------------------------------------------------------------

export function composeAddKeyAfterLabel(i18n?: I18n): string {
  return resolveMessage(
    i18n,
    msg({
      id: "editor.assignLoop.keyGrid.commands.addKeyAfter",
      message: "Add key after",
    }),
  );
}

/** T111 — the `⋯` wedge / right-click / `ContextMenu` command (see module doc, "T111's two keyboard routes"). */
export function composeOpenCommandMenuLabel(i18n?: I18n): string {
  return resolveMessage(
    i18n,
    msg({
      id: "editor.assignLoop.keyGrid.commands.openCommandMenu",
      message: "More commands",
    }),
  );
}

/** T111 — the double-click / `Ctrl+Enter` command (see module doc, "T111's two keyboard routes"). */
export function composeFollowNextLayerLabel(i18n?: I18n): string {
  return resolveMessage(
    i18n,
    msg({
      id: "editor.assignLoop.keyGrid.commands.followNextLayer",
      message: "Go to this key's layer",
    }),
  );
}

// ---------------------------------------------------------------------------
// The command descriptor shape — the data a future command-menu widget
// (T111) renders. See module doc, "Extension seam".
// ---------------------------------------------------------------------------

/**
 * Where a pointer-invoked command menu should open (T111) — viewport
 * coordinates, straight from the `contextmenu`/`click` event. Absent when the
 * menu was opened from the KEYBOARD (`ContextMenu`/`Shift+F10`), which has no
 * pointer position: the menu then positions itself against the focused cell
 * instead. Deliberately a plain `{x, y}` and not a DOM node — this hook and
 * `KeyGridCell.tsx` both stay free of any assumption about how the menu is
 * mounted or positioned (see `KeyGridCommandMenu.tsx`, which owns that).
 */
export interface KeyGridCommandMenuAnchor {
  readonly x: number;
  readonly y: number;
}

export interface KeyGridCommandDescriptor {
  /** Stable, non-localized identifier — for tests and for a future menu's `key` prop, never displayed. */
  readonly id: string;
  /** Ready-to-render, localized label. */
  readonly label: string;
  /** The physical key name this command is ALSO bound to, when it has one — raw (never localized; a key name, not prose), for a future menu to display as a keybinding hint. */
  readonly shortcutKey?: string;
  /** `false` when nothing is selected (or, in a later extension, when the command's own precondition otherwise fails) — a future menu renders a disabled entry rather than omitting it, so the command's existence stays discoverable. */
  readonly enabled: boolean;
  /** Invoke the command. A no-op is never necessary here: callers should gate on `enabled`, but `run()` itself still checks its own precondition defensively (see `runAddKeyAfter` below). */
  run(): void;
}

// ---------------------------------------------------------------------------
// The hook
// ---------------------------------------------------------------------------

export interface UseKeyCommandsOptions {
  /** The key the command menu / Insert acts on, or `null` before any selection has settled — mirrors `AssignPanel`/`RenameDialog`'s own `selectedCell` prop. */
  readonly selectedCell: KeyGridCellViewModel | null;
  /** The EFFECTIVE (overlay-folded) touch layout — for the in-layer uniqueness scope (see module doc, "Validation"). */
  readonly layout: TouchLayoutIR;
  /** Fired exactly once per add-after invocation, from EITHER route (see module doc, "The one requirement this file exists to satisfy"). */
  readonly onAddKeyAfter: (outcome: AddKeyAfterOutcome) => void;
  /**
   * T111 — fired when the author asks for the command menu, from EITHER route
   * (the `⋯` wedge / right-click, or `ContextMenu`/`Shift+F10`). `anchor` is
   * present only for the pointer routes (see `KeyGridCommandMenuAnchor`).
   * Omit the prop and the keyboard route becomes inert — this hook never
   * mounts a menu itself.
   */
  readonly onOpenCommandMenu?: (
    cell: KeyGridCellViewModel,
    anchor?: KeyGridCommandMenuAnchor,
  ) => void;
  /**
   * T111 — fired when the author follows the selected key's "Goes to" layer,
   * from EITHER route (double-click, or `Ctrl+Enter`). Called with the
   * resolved `nextlayer` so the caller never has to re-read it off the cell;
   * never fired at all for a key that has no `nextlayer`.
   */
  readonly onFollowNextLayer?: (
    cell: KeyGridCellViewModel,
    nextlayer: string,
  ) => void;
  /** `useLingui()`'s `i18n`, for a real component. Omit in a unit test to assert on the English source text. */
  readonly i18n?: I18n;
}

export interface UseKeyCommandsResult {
  /**
   * The key grid's command set — "Add key after", "Go to this key's layer",
   * and "More commands". `KeyGridCommandMenu.tsx` (T111) renders this list;
   * this hook renders nothing itself.
   */
  readonly commands: readonly KeyGridCommandDescriptor[];
  /**
   * Pass alongside (composed with, never in place of) `useGridNav`'s own
   * `handleKeyDown` on `KeyGrid`'s `onKeyDown` prop — that hook owns
   * navigation keys (arrows/Home/End); this hook owns command keys
   * (currently just Insert). Composing two keydown handlers into one
   * function passed to a single `onKeyDown` prop is the CALLER's job (the
   * same composition `KeyGrid.tsx`'s own module doc already anticipates for
   * "T065-T071" — see that file's "Seams" section) — this file does not
   * import or wrap `useGridNav` itself, since the two hooks' recognized-key
   * sets are disjoint (arrows/Home/End vs. Insert) and neither needs to know
   * the other exists.
   */
  readonly handleKeyDown: (event: ReactKeyboardEvent<HTMLElement>) => void;
}

/**
 * The touch key grid's command layer (T094; FR-029, US4 AS1). See this
 * module's doc comment for the full contract — in particular why the
 * proposed id is always `U_FFFD` today, why this hook never commits
 * anything itself, and the extension seam later tasks (T095/T097-T099/T111)
 * plug into.
 */
export function useKeyCommands({
  selectedCell,
  layout,
  onAddKeyAfter,
  onOpenCommandMenu,
  onFollowNextLayer,
  i18n,
}: UseKeyCommandsOptions): UseKeyCommandsResult {
  // The ONE implementation both invocation routes call — see module doc,
  // "The one requirement this file exists to satisfy".
  const runAddKeyAfter = useCallback(() => {
    if (selectedCell === null) return;
    onAddKeyAfter(buildAddKeyAfterOutcome(selectedCell, layout));
  }, [selectedCell, layout, onAddKeyAfter]);

  // T111's two commands — the SAME callbacks the cell's pointer gestures
  // invoke (see module doc, "T111's two keyboard routes"). `anchor` is
  // omitted here: a keyboard invocation has no pointer position.
  const runOpenCommandMenu = useCallback(() => {
    if (selectedCell === null) return;
    onOpenCommandMenu?.(selectedCell);
  }, [selectedCell, onOpenCommandMenu]);

  const runFollowNextLayer = useCallback(() => {
    if (selectedCell === null) return;
    const { nextlayer } = selectedCell;
    // A key that switches nowhere has nothing to follow — never fired, and
    // the descriptor below reports `enabled: false` for the same reason.
    if (nextlayer === undefined) return;
    onFollowNextLayer?.(selectedCell, nextlayer);
  }, [selectedCell, onFollowNextLayer]);

  const handleKeyDown = useCallback(
    (event: ReactKeyboardEvent<HTMLElement>) => {
      // ContextMenu / Shift+F10 -> the command menu (see module doc, "T111's
      // two keyboard routes"). Checked before Insert purely for readability;
      // the three recognized sets are disjoint.
      if (
        event.key === "ContextMenu" ||
        (event.key === "F10" &&
          event.shiftKey &&
          !event.ctrlKey &&
          !event.altKey &&
          !event.metaKey)
      ) {
        event.preventDefault();
        runOpenCommandMenu();
        return;
      }

      // Ctrl+Enter -> follow the "Goes to" layer. `preventDefault()` is
      // load-bearing, not defensive: the cell is a native <button>, so Enter
      // would otherwise ALSO fire a synthetic click (a re-select) alongside
      // the follow.
      if (
        event.key === "Enter" &&
        event.ctrlKey &&
        !event.shiftKey &&
        !event.altKey &&
        !event.metaKey
      ) {
        event.preventDefault();
        runFollowNextLayer();
        return;
      }

      // Insert, no modifier — see module doc, "What this hook deliberately
      // does NOT do" (Shift+Insert is reserved for a future "insert before").
      if (
        event.key !== "Insert" ||
        event.shiftKey ||
        event.ctrlKey ||
        event.altKey ||
        event.metaKey
      ) {
        return;
      }
      // Claimed regardless of whether a selection exists, matching
      // useGridNav.ts's own "every recognized key is claimed by the grid"
      // convention — Insert never falls through to a browser default.
      event.preventDefault();
      runAddKeyAfter();
    },
    [runAddKeyAfter, runOpenCommandMenu, runFollowNextLayer],
  );

  const commands = useMemo<readonly KeyGridCommandDescriptor[]>(
    () => [
      {
        id: "add-key-after",
        label: composeAddKeyAfterLabel(i18n),
        shortcutKey: "Insert",
        enabled: selectedCell !== null,
        run: runAddKeyAfter,
      },
      {
        id: "follow-next-layer",
        label: composeFollowNextLayerLabel(i18n),
        shortcutKey: "Ctrl+Enter",
        // Disabled — not omitted — for a key that switches nowhere, per
        // `enabled`'s own contract above.
        enabled: selectedCell !== null && selectedCell.nextlayer !== undefined,
        run: runFollowNextLayer,
      },
      {
        id: "open-command-menu",
        label: composeOpenCommandMenuLabel(i18n),
        shortcutKey: "ContextMenu",
        enabled: selectedCell !== null,
        run: runOpenCommandMenu,
      },
    ],
    [i18n, selectedCell, runAddKeyAfter, runFollowNextLayer, runOpenCommandMenu],
  );

  return { commands, handleKeyDown };
}

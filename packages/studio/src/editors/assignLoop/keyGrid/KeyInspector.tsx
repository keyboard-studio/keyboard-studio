// KeyInspector — the read-only detail surface for whichever cell is currently
// selected in the touch key grid (spec 063 T070; FR-020b, FR-030). This
// component is deliberately NOT part of KeyGrid.tsx (see that file's own
// module doc, "Seams for T065-T071" — "T070 KeyInspector / T071 FindPanel:
// separate components... FR-020b's 'selection is separate from editing' is
// why the split exists").
//
// ## Selection vs. editing — the contract this component exists to honor
//
// FR-020b: "Arrow keys and clicks change the selection and update the
// inspector's display while focus remains in the grid; Enter or F2 moves
// focus into the inspector; Escape returns it to the cell." This component
// upholds its half of that contract in the simplest way possible: it has NO
// effect that reacts to `selectedCell` changing by moving DOM focus anywhere.
// Arrow/click-driven re-renders of this panel are therefore inert with
// respect to focus — whoever has focus (almost always a grid cell) keeps it,
// and only the panel's on-screen CONTENT updates. The other half of the
// contract (actually moving focus in on Enter/F2, and back out on Escape) is
// `useKeyInspectorFocusBridge`, below — a small, explicit bridge rather than
// a hidden effect, because "moving focus into a DIFFERENT component" is not
// something this component can honestly do to itself from the inside; see
// that hook's own doc comment for the composition seam this leaves for
// whoever mounts `KeyGrid` + `KeyInspector` together (TouchGallery.tsx,
// out of scope for this task — T072+ / the concurrent gallery work).
//
// ## `key.layer` supersedes the containing layer (FR-030) — the "Sends:" row
//
// `KeyGridCellViewModel` (T063) deliberately does NOT carry `TouchKeyIR.layer`
// — that view model is scoped to what the GRID renders, and `layer` is a
// modifier-override fact the grid itself does not need (see
// keyGridViewModel.ts's own doc comment on why `producedChars` is narrower
// than `computeTouchCoverage`; the same "only what the grid needs" discipline
// applies to the cell shape as a whole). Reading `TouchKeyIR.layer` therefore
// requires the raw layout, which this component accepts as an OPTIONAL
// `layout` prop and resolves against via the engine's own
// `parseTouchKeyAddress` + `resolveKeyAddress` — both already-exported,
// already-stable primitives (`packages/engine/src/pattern-apply/keyEditOps.ts`
// / `touchKeyAddress.ts`), never re-derived here. `contracts/keyboard-ir.ts`'s
// own doc comment on `TouchKeyIR.layer` is explicit that "any 'Sends:' display
// that reads the containing layer instead of this field is wrong for exactly
// the keys where the field exists" — `resolveSendsLayer` below is that
// display's derivation, and `KeyInspector.sendsLayer.test` (see the sibling
// test file) is built specifically around a key where the two differ, per
// this task's own instruction ("a key where the two differ is the
// discriminating case").
//
// Omitting `layout` degrades gracefully: the "Sends:" row still renders,
// showing the containing layer alone, with no supersede detection — a
// caller that hasn't wired the effective layout through yet gets a slightly
// less precise inspector, not a crash.
//
// ## Findings — the real diagnostics, as of T115/T116
//
// `cell.findings` is now the contracts-owned `TouchKeyFinding` (T113), and this
// component renders each one as localized prose plus a button per fix
// descriptor. All copy comes from `findingCopy.ts` (T116) — this file composes
// none of its own, so the inspector and the grid's `aria-live` announcements
// cannot drift onto different wording for the same finding.
//
// Severity is carried by the chip's LETTER *and* by the severity word rendered
// beside it — never by colour alone (FR-050, US5 AS4). The word is real text
// rather than an `aria-label` on the chip, so it survives a monochrome or
// high-contrast display for a sighted author too, not only a screen reader.
//
// Acting on a fix is still NOT this component's job: `onApplyFix` reports the
// author's choice and this file commits nothing, exactly as `onSpChange` does
// below. See that prop's own doc for the required-prop contract (spec 065
// FR-001, FR-003, research D1).
//
// ## Editing is NOT this component's job — except the `sp` control (T096)
//
// This is a display surface. Assigning a character, changing an id, editing
// `nextlayer`, or acting on a finding's fix (FR-041) are Phase 6-8 concerns
// (rule synthesis, id minting, the edit overlay) that have no home yet in
// this file. Where an affordance for one of those will eventually need a
// FOCUSABLE control inside this panel (so Tab from the panel's root reaches
// it), the panel's own root already being a real DOM node with room for
// children is the seam — no restructuring needed when that lands.
//
// T096 (FR-029a) is the first, narrow exception: the full-legal-set `sp`
// control below IS an editing affordance, but this file still does not
// COMMIT anything. `onSpChange` fires with the author's chosen value and does
// nothing else; there is no store import, no engine mutation call, here —
// that discipline is unchanged by spec 065's required-prop inversion (D1).
// What changed is who is allowed to leave it disconnected: spec 065 makes
// `onSpChange` and `onApplyFix` **required** props (FR-001, FR-003), so a
// mount that cannot act is a compile-time error caught by `tsc`, not a
// degraded surface a caller could ship silently — the reverting `sp` control
// and the permanently-disabled fix buttons were exactly that degraded
// surface (see issue #1530 complaint #2, spec 065's "Context: what actually
// went wrong"). Wiring `onSpChange` into the actual key-edit overlay commit
// (a `SetKeyOp`) alongside T094's add-key and T095's suppress operation is
// still the composing caller's job (`TouchGallery.tsx`, spec 065 T013), not
// something this component pre-empts.
//
// ## The key-type control is a DROPDOWN, not six radios
//
// It began as a `RadioGroup` over all six values, each with its own explanatory
// note — about 200px of a panel that has to fit beside the keyboard it is
// editing, which it did not. The set is closed, mutually exclusive, and named,
// which is precisely what a select is for; Keyman Developer's own "Key Type"
// control is a dropdown for the same reason.
//
// Nothing about FR-029a is given up in the trade. The full legal set is still
// offered, still with no value disabled, and the FR-029d PROPOSAL still rides on
// its own option — `SelectMenu`'s `renderOptionLabel` hook carries the badge
// into both the option row and the collapsed trigger, so "which one would the
// studio pick" survives the control change rather than being flattened into
// prose. What was six always-visible notes is now the SELECTED type's own note,
// one line, beneath the control: an author reading about "Spacer" is choosing
// Spacer, and the other five explanations were answering a question nobody had
// asked yet.

import { useMemo, useCallback, useId, useRef, useState, type Ref } from "react";
import type { KeyboardEvent as ReactKeyboardEvent, RefObject } from "react";
import { Trans, useLingui } from "@lingui/react/macro";
import { plural } from "@lingui/core/macro";
import { isSpacerKeyClass, type TouchLayoutIR } from "@keyboard-studio/contracts";
import { parseTouchKeyAddress, resolveKeyAddress } from "@keyboard-studio/engine";
import { codepointLabel } from "../../../survey/codepointLabel.ts";
import { displayChar } from "../../../lib/irToCarveNodes.ts";
import { BG_CARD, BORDER, TEXT_DIM, TEXT_MAIN, FONT } from "../../../lib/galleryTheme.ts";
import { ERROR_RED, FONT_MONO, WARNING } from "../../../ui/theme.ts";
import { Badge, SelectMenu } from "../../../ui/index.ts";
import {
  PANEL_GRID_STYLE,
  PANEL_HINT_STYLE,
  PANEL_LABEL_STYLE,
  PANEL_SPAN_STYLE,
  visuallyHiddenUnless,
} from "./panelGrid.tsx";
import type { KeyGridCellViewModel, TouchKeyFinding } from "./keyGridViewModel.ts";
import type { TouchKeyFix } from "@keyboard-studio/contracts";
import {
  findingDetail,
  findingTitle,
  fixLabel,
  severityLabel,
} from "./findingCopy.ts";

// Layer C's info-severity blue has no dedicated *-severity named export in
// ui/theme.ts — KeyGridCell.tsx already made this same observation (its own
// `INFO_BLUE` const, same value) when it needed the identical E/W/I severity
// convention. Duplicated here rather than imported, since KeyGridCell.tsx
// does not export it — both now reuse the accent-text token directly (epic
// #533); if `ui/theme.ts` ever gains a dedicated severity token, both call
// sites should move onto it together.
const INFO_BLUE = "var(--app-accent-text)";

// ---------------------------------------------------------------------------
// "Sends:" derivation (FR-030) — the crux of this component
// ---------------------------------------------------------------------------

export interface SendsLayerInfo {
  /** `key.layer ?? containingLayerId` — what the key actually sends under. */
  readonly effectiveLayerId: string;
  /** The layer the grid is currently showing this key inside of. */
  readonly containingLayerId: string;
  /** True only when `TouchKeyIR.layer` is set AND differs from `containingLayerId`. */
  readonly superseded: boolean;
}

/**
 * Resolve the "Sends:" row's content for `cell`. Returns `undefined` only
 * when `cell.address` does not parse (never expected in practice — every
 * `KeyGridCellViewModel.address` is built by the SAME `touchKeyAddress`
 * builder `parseTouchKeyAddress` inverts — but handled rather than assumed,
 * matching this codebase's own "unresolvable is an ordinary outcome, not a
 * crash" convention).
 *
 * When `layout` is omitted (or the address does not resolve against it —
 * e.g. a stale `layout` from a moment before the current debounce cycle),
 * `superseded` is always `false` and `effectiveLayerId` is just the
 * containing layer: a graceful degrade, not a wrong answer, since the
 * containing layer IS the correct answer for every key that has no `layer`
 * override at all (the common case; see `contracts/keyboard-ir.ts`'s own doc
 * comment: "the field exists for exactly the keys where the two differ").
 */
export function resolveSendsLayer(
  cell: KeyGridCellViewModel,
  layout?: TouchLayoutIR,
): SendsLayerInfo | undefined {
  const parts = parseTouchKeyAddress(cell.address);
  if (parts === undefined) return undefined;

  const containingLayerId = parts.layerId;
  const rawLayer =
    layout !== undefined ? resolveKeyAddress(layout, parts)?.key.layer : undefined;
  const effectiveLayerId = rawLayer ?? containingLayerId;

  return {
    effectiveLayerId,
    containingLayerId,
    superseded: rawLayer !== undefined && rawLayer !== containingLayerId,
  };
}

// ---------------------------------------------------------------------------
// `sp` (key type) control (FR-029a) — the crux of T096
// ---------------------------------------------------------------------------

/**
 * The full legal `sp` (key class) set an author can assign: `0` character,
 * `1` frame, `2` active frame, `8` deadkey-styled, `9` blank, `10` spacer.
 *
 * Mirrored from the engine's own `EditableKeySp`
 * (`packages/engine/src/pattern-apply/keyEditOps.ts`) rather than imported
 * from it: that type is not re-exported through `@keyboard-studio/engine`'s
 * public entry point today (confirmed against `packages/engine/src/index.ts`
 * before writing this) — the SAME "reach past the package boundary" gap
 * `keyGridViewModel.ts`'s own module doc already flags for
 * `applyKeyEditsToLayout`/`replayKeyEditOverlay` (a gap T053 later closed for
 * that pair). **DEFECT to flag upstream:** `packages/engine/src/index.ts`
 * should export `EditableKeySp`/`EditableKeyFields` alongside its sibling
 * `keyEditOps.ts` exports so this literal union stops needing to be kept in
 * sync by hand against the one file that actually enforces it (the applier).
 */
export type TouchKeySpValue = 0 | 1 | 2 | 8 | 9 | 10;

const LEGAL_SP_VALUES: readonly TouchKeySpValue[] = [0, 1, 2, 8, 9, 10];

/**
 * `TouchKeyIR.sp`, defaulted and narrowed to the legal set. `undefined` means
 * "the implicit letter class" per that field's own doc comment; anything
 * outside {@link LEGAL_SP_VALUES} (never expected from a conforming layout,
 * but not assumed) degrades the same way rather than throwing.
 */
function normalizeSp(sp: number | undefined): TouchKeySpValue {
  return sp !== undefined && (LEGAL_SP_VALUES as readonly number[]).includes(sp)
    ? (sp as TouchKeySpValue)
    : 0;
}

/**
 * The PROPOSED `sp` value for `cell` (FR-029a's "propose the appropriate
 * value per context"; FR-029d). Two branches, in priority order:
 *
 * 1. **The key switches layers** (`nextlayer` is set) — R3b/FR-029d's
 *    derivable rule: active (`2`) on the layer it switches TO, inactive
 *    (`1`) everywhere else. `containingLayerId` is the grid's CURRENT layer
 *    (the key's own address, e.g. `resolveSendsLayer`'s `containingLayerId`
 *    — never the key's `layer` override): a frame key's "is this the layer
 *    it switches to" question is about which layer it is PLACED on, not
 *    which modifier state it sends under.
 * 2. **Otherwise** — nothing in this key's own fields distinguishes a
 *    deliberately-set character/frame/deadkey-styled/blank/spacer choice
 *    from an author's default, so the proposal is simply the key's CURRENT
 *    value: this never second-guesses an explicit blank/spacer/deadkey
 *    choice on the strength of, say, `producedChars` being non-empty (R3a:
 *    "`sp` is an authoring mechanism, not a detail to hide" — and not a fact
 *    to infer away from output, either).
 *
 * This intentionally covers the FR-029d "half" of the layer-switch rule —
 * proposing `sp:2`/`sp:1` from `nextlayer` and the containing layer. The
 * DIAGNOSTIC half (reporting when a frame key's `sp` and `nextlayer`
 * disagree) is T102's job (`packages/engine/src/pattern-apply/
 * touchKeyDiagnostics.ts`), not this component's.
 */
export function proposeSpValue(
  cell: KeyGridCellViewModel,
  containingLayerId: string | undefined,
): TouchKeySpValue {
  if (cell.nextlayer !== undefined) {
    return cell.nextlayer === containingLayerId ? 2 : 1;
  }
  return normalizeSp(cell.sp);
}

// ---------------------------------------------------------------------------
// The focus bridge (FR-020b) — Enter/F2 in, Escape back out
// ---------------------------------------------------------------------------

export interface UseKeyInspectorFocusBridgeOptions {
  /**
   * Address of the currently selected grid cell. `null` when nothing is
   * selected yet — Escape then has no "cell it came from" to return to, so
   * `handleEscape` is a no-op.
   */
  selectedAddress: string | null;
  /**
   * Edit this cell's VALUE — F2's target (spec 065).
   *
   * Optional: with no handler, F2 keeps its original meaning and focuses the
   * panel exactly as Enter does, so a caller that has no assign surface is
   * unaffected. Where it IS provided, it must land the caret in the character
   * field, opening whatever disclosure is in the way — that is what keeps spec
   * 058 SC-004's keyboard-only assign inside its action budget.
   */
  onEditValue?: () => void;
  /**
   * The DOM ancestor BOTH the grid's cells and (ideally) this bridge's own
   * lookups are scoped within — mirrors `useGridNav.ts`'s own
   * `applyFocusRestorationTarget` container-scoping rationale: an unscoped,
   * document-wide query would risk matching a cell in a DIFFERENT mounted
   * grid on the same page. Pass the same wrapping ref the caller places
   * around both `<KeyGrid>` and `<KeyInspector>`.
   */
  containerRef: RefObject<HTMLElement | null>;
}

export interface UseKeyInspectorFocusBridgeResult {
  /** Pass as `<KeyInspector panelRef={inspectorRef}>`. */
  inspectorRef: RefObject<HTMLDivElement | null>;
  /**
   * Merge into the GRID's `onKeyDown` alongside `useGridNav`'s own handler
   * (composition happens at the call site — see this hook's module-level
   * doc comment for why neither `KeyGrid.tsx` nor `useGridNav.ts` is touched
   * by this task). Enter/F2 pressed while a gridcell has focus moves DOM
   * focus into the inspector panel; every other key passes through
   * untouched (this handler never calls `preventDefault` on a key it does
   * not act on).
   */
  handleGridKeyDown: (event: ReactKeyboardEvent) => void;
  /** Pass as `<KeyInspector onEscape={handleEscape}>`. */
  handleEscape: () => void;
}

/**
 * The composition seam for FR-020b's "Enter/F2 moves focus into the
 * inspector; Escape returns it to the cell." Neither direction can live
 * inside `KeyInspector` alone (it has no reference to the grid's cells) nor
 * inside `KeyGrid`/`useGridNav` alone (this task does not touch either file —
 * a sibling agent is concurrently fixing focus restoration in both; see this
 * task's own briefing). This hook is the deliberately small, explicit
 * go-between: whoever renders BOTH `<KeyGrid>` and `<KeyInspector>` together
 * (TouchGallery.tsx today has neither mounted yet — confirmed by search
 * before writing this) wires this hook's `handleGridKeyDown` into the grid's
 * `onKeyDown` (composed with `useGridNav`'s own handler) and this hook's
 * `handleEscape` into the inspector's `onEscape`.
 *
 * `handleEscape` locates the cell to return to via `[role="gridcell"]
 * [aria-selected="true"]` — a REAL ARIA attribute `KeyGridCell.tsx` already
 * renders (`aria-selected={isSelected}`), not a test-only hook — scoped to
 * `containerRef`, mirroring `useGridNav.ts`'s own `queryCellElement`
 * scoping convention (by attribute, not by `data-testid`).
 */
export function useKeyInspectorFocusBridge({
  selectedAddress,
  containerRef,
  onEditValue,
}: UseKeyInspectorFocusBridgeOptions): UseKeyInspectorFocusBridgeResult {
  const inspectorRef = useRef<HTMLDivElement | null>(null);

  const handleGridKeyDown = useCallback(
    (event: ReactKeyboardEvent) => {
      if (event.key !== "Enter" && event.key !== "F2") return;
      const target = event.target;
      if (!(target instanceof Element) || target.closest('[role="gridcell"]') === null) return;
      event.preventDefault();
      // Spec 061: the two keys diverge, because the panel absorbed the assign
      // surface and put it behind a disclosure. Enter opens the DETAIL (the
      // panel region — FR-020b, unchanged). F2 edits the VALUE, landing
      // straight in the character field, which is the grid convention and what
      // spec 063 SC-004 measures: assigning a character must stay one keypress
      // away from the cell, not Enter-then-tab-to-a-disclosure.
      if (event.key === "F2" && onEditValue !== undefined) {
        onEditValue();
        return;
      }
      inspectorRef.current?.focus();
    },
    [onEditValue],
  );

  const handleEscape = useCallback(() => {
    if (selectedAddress === null) return;
    const container = containerRef.current;
    if (container === null) return;
    const cellEl = container.querySelector<HTMLElement>(
      '[role="gridcell"][aria-selected="true"]',
    );
    cellEl?.focus();
  }, [selectedAddress, containerRef]);

  return { inspectorRef, handleGridKeyDown, handleEscape };
}

// ---------------------------------------------------------------------------
// The component
// ---------------------------------------------------------------------------

export interface KeyInspectorProps {
  /** The currently selected cell's view model, or `null` before any selection has settled. */
  selectedCell: KeyGridCellViewModel | null;
  /**
   * The EFFECTIVE (already overlay-folded) touch layout the grid is
   * currently showing — see `resolveSendsLayer`'s doc comment for why this
   * is needed and what happens when it is omitted.
   */
  layout?: TouchLayoutIR;
  /**
   * Attaches the panel's root DOM node. `useKeyInspectorFocusBridge`'s
   * `inspectorRef` is the intended value in the composed app; a plain prop
   * rather than `forwardRef` since no existing component in this package
   * uses that pattern (checked before introducing it) and a prop keeps the
   * type signature ordinary.
   */
  panelRef?: Ref<HTMLDivElement>;
  /** Fired on Escape anywhere within the panel (FR-020b's "returns it to the cell"). */
  onEscape?: () => void;
  /**
   * Fired when the author picks an `sp` value directly from the full legal
   * set (FR-029a) — never gated on it matching the PROPOSED value; picking a
   * non-proposed value is a legitimate authoring act, not something this
   * callback screens out.
   *
   * REQUIRED (spec 065 FR-001, FR-003, research D1): `TouchGallery.tsx` is
   * this component's one caller, and this control used to be `value`-driven
   * from `currentSp` with the change handler a no-op `?.()` when unwired —
   * the DOM snapped back to `currentSp` on every click, which is the
   * "key type reverts" defect of record (issue #1530 complaint #2).
   * Making the prop required turns that omission into a build error instead
   * of a runtime nothing. See the module doc's "Editing is NOT this
   * component's job — except the `sp` control (T096)" section for what this
   * still does and does not commit.
   */
  onSpChange: (sp: TouchKeySpValue) => void;
  /**
   * Fired when the author presses a finding's fix button (T115, FR-041). Like
   * `onSpChange`, this component COMMITS NOTHING: it hands back the fix
   * descriptor the engine produced plus the finding it came from, and the caller
   * decides what that means (a `KeyEditOperation`, opening AssignPanel to pick a
   * character, or scrolling the offending key into view).
   *
   * REQUIRED (spec 065 FR-001, FR-003, research D1). This prop used to be
   * optional, and every fix button rendered `disabled` when it was omitted —
   * the only caller, `TouchGallery.tsx`, never supplied it, so every fix
   * button in the shipped app was permanently inert. That reasoning traded on
   * there being an honest way to leave a mount unwired; FR-003 forecloses
   * that trade ("an affordance that does not apply MUST be absent" — not
   * disabled) and the required prop forecloses it a second, stronger way:
   * there is no unwired mount left to be honest about. Every fix button this
   * component renders is enabled, and every click reaches the caller.
   */
  onApplyFix: (fix: TouchKeyFix, finding: TouchKeyFinding) => void;
  /** Localized panel accessible name override. */
  label?: string;
  /**
   * Render as a plain section inside another panel rather than as a
   * `role="region"` card of its own (spec 065 T035).
   *
   * `KeyPropertyPanel` is the single panel FR-018 asks for, and it composes
   * this component for the display, findings and key-type sections rather than
   * copying 300 lines of them. Two nested `role="region"`s with two accessible
   * names would be an honest description of the OLD stacked mount and a false
   * one of the merged panel — so when embedded this drops the role, the name,
   * its own border/background and its Escape handling, all of which the parent
   * now owns. Every `key-inspector-*` test id is unchanged, which is what keeps
   * the existing assertions meaning what they meant.
   */
  embedded?: boolean;
}

const FIELD_VALUE_STYLE = { fontSize: 13, color: TEXT_MAIN, fontFamily: FONT };

/**
 * Highest-severity color + single-letter badge, mirroring
 * `KeyGridCell.tsx`'s own `worstSeverity` — but this component renders EVERY
 * finding, not just a summary dot, since per-finding detail is exactly what
 * an inspector is for (KeyGridCell.tsx's own doc comment: "A dedicated
 * per-finding details view... is KeyInspector's job (T070), not this cell's").
 */
function severityStyle(severity: TouchKeyFinding["severity"]): { color: string; letter: string } {
  if (severity === "error") return { color: ERROR_RED, letter: "E" };
  if (severity === "warning") return { color: WARNING, letter: "W" };
  return { color: INFO_BLUE, letter: "I" };
}

export function KeyInspector({
  selectedCell,
  layout,
  panelRef,
  onEscape,
  onSpChange,
  onApplyFix,
  label,
  embedded = false,
}: KeyInspectorProps) {
  // `i18n` alongside `t` because findingCopy.ts's composers take an `I18n`
  // rather than being JSX macros — the same split existingMethodLabels.ts's
  // callers already use.
  const { t, i18n } = useLingui();
  const spGroupLabelId = useId();
  const spNoteId = useId();
  /**
   * Whether the key-type control has focus, and so whether its general caveat
   * is visible. Never gates the caveat's PRESENCE — the note element and the
   * `aria-describedby` pointing at it are unconditional; only the visual bulk is
   * conditional (see the note's own comment below).
   */
  const [spNoteExpanded, setSpNoteExpanded] = useState(false);

  const sendsInfo = useMemo(
    () => (selectedCell !== null ? resolveSendsLayer(selectedCell, layout) : undefined),
    [selectedCell, layout],
  );

  const currentSp = selectedCell !== null ? normalizeSp(selectedCell.sp) : 0;
  const proposedSp =
    selectedCell !== null ? proposeSpValue(selectedCell, sendsInfo?.containingLayerId) : 0;

  // Six explicit `t()` calls (not a data-driven loop over one shared table)
  // so lingui's static extractor sees a literal `id`/`message` at every call
  // site — the same discipline the "Sub-keys" section below already follows
  // for its plural() calls.
  const spOptionLabels: Record<TouchKeySpValue, { label: string; note: string }> = {
    0: {
      label: t({ id: "editor.assignLoop.keyGrid.inspector.sp.character.label", message: "Character" }),
      note: t({
        id: "editor.assignLoop.keyGrid.inspector.sp.character.note",
        message: "A normal letter, digit, or punctuation key.",
      }),
    },
    1: {
      label: t({ id: "editor.assignLoop.keyGrid.inspector.sp.frame.label", message: "Frame (inactive)" }),
      note: t({
        id: "editor.assignLoop.keyGrid.inspector.sp.frame.note",
        message: "A system key, such as a layer switch, shown inactive on this layer.",
      }),
    },
    2: {
      label: t({ id: "editor.assignLoop.keyGrid.inspector.sp.frameActive.label", message: "Frame (active)" }),
      note: t({
        id: "editor.assignLoop.keyGrid.inspector.sp.frameActive.note",
        message: "A layer-switch key shown engaged, on the layer it switches to.",
      }),
    },
    8: {
      label: t({
        id: "editor.assignLoop.keyGrid.inspector.sp.deadkeyStyled.label",
        message: "Deadkey-styled",
      }),
      note: t({
        id: "editor.assignLoop.keyGrid.inspector.sp.deadkeyStyled.note",
        message: "Styled like a deadkey. Still interactive and can produce output.",
      }),
    },
    9: {
      label: t({ id: "editor.assignLoop.keyGrid.inspector.sp.blank.label", message: "Blank" }),
      note: t({
        id: "editor.assignLoop.keyGrid.inspector.sp.blank.note",
        message: "Fills a keycap-shaped hole. Produces nothing by itself.",
      }),
    },
    10: {
      label: t({ id: "editor.assignLoop.keyGrid.inspector.sp.spacer.label", message: "Spacer" }),
      note: t({
        id: "editor.assignLoop.keyGrid.inspector.sp.spacer.note",
        message: "Fills space with no visible keycap. Produces nothing by itself.",
      }),
    },
  };

  const proposedBadgeLabel = t({
    id: "editor.assignLoop.keyGrid.inspector.sp.proposedBadge",
    message: "Proposed",
  });

  const handleKeyDown = useCallback(
    (event: ReactKeyboardEvent<HTMLDivElement>) => {
      if (event.key !== "Escape") return;
      event.preventDefault();
      onEscape?.();
    },
    [onEscape],
  );

  const panelLabel =
    label ?? t({ id: "editor.assignLoop.keyGrid.inspector.ariaLabel", message: "Key details" });

  const isBlank = selectedCell !== null && isSpacerKeyClass(selectedCell.sp);

  return (
    // eslint-disable-next-line jsx-a11y/no-noninteractive-element-interactions -- programmatically focusable REGION (not in the natural Tab order — see FR-020b: Enter/F2 moves focus here explicitly, Tab does not walk through it), the same "focusable container, not a Tab stop" idiom ui/SelectMenu.tsx's own portalled <ul> already uses for an analogous reason.
    <div
      ref={panelRef}
      // Embedded: a plain section inside KeyPropertyPanel, which owns the
      // region role, the accessible name, the chrome and the Escape handling.
      // See the `embedded` prop's own doc for why nesting two named regions
      // would misdescribe the merged panel.
      {...(embedded
        ? {}
        : {
            role: "region",
            "aria-label": panelLabel,
            tabIndex: -1,
            onKeyDown: handleKeyDown,
          })}
      data-testid="key-inspector"
      style={{
        // The compact label/control table (panelGrid.tsx) rather than a stack
        // of label-above-value rows: this panel has to fit beside the keyboard
        // it edits. See that module's doc for why the geometry is shared.
        ...PANEL_GRID_STYLE,
        ...(embedded
          ? {}
          : {
              padding: 12,
              background: BG_CARD,
              border: `1px solid ${BORDER}`,
              borderRadius: 8,
              outline: "none",
            }),
        fontFamily: FONT,
      }}
    >
      {selectedCell === null ? (
        <p
          data-testid="key-inspector-empty"
          style={{ ...FIELD_VALUE_STYLE, ...PANEL_SPAN_STYLE, color: TEXT_DIM, margin: 0 }}
        >
          <Trans id="editor.assignLoop.keyGrid.inspector.emptyState">
            Select a key to see its details.
          </Trans>
        </p>
      ) : (
        <>
          {/* Keycap + id — one line spanning both columns: it names the key the
              rows below are about, so it is a heading, not a field. */}
          <div
            style={{
              ...PANEL_SPAN_STYLE,
              display: "flex",
              alignItems: "baseline",
              justifyContent: "space-between",
              gap: 8,
            }}
            data-testid="key-inspector-header"
          >
            <span style={{ ...FIELD_VALUE_STYLE, fontFamily: FONT_MONO, fontSize: 15 }}>
              {isBlank
                ? t({
                    id: "editor.assignLoop.keyGrid.inspector.blankKey",
                    message: "Blank key",
                  })
                : selectedCell.keycap.length > 0
                  ? `${displayChar(selectedCell.keycap)} (${codepointLabel(selectedCell.keycap).title})`
                  : t({
                      id: "editor.assignLoop.keyGrid.inspector.noKeycap",
                      message: "(no keycap)",
                    })}
            </span>
            <span style={PANEL_HINT_STYLE} data-testid="key-inspector-id">
              {t({
                id: "editor.assignLoop.keyGrid.inspector.idLabel",
                message: `Id: ${{ id: selectedCell.id }}`,
              })}
            </span>
          </div>

          {/* "Sends:" — the FR-030 crux */}
          {sendsInfo !== undefined && (
            <>
              <span style={PANEL_LABEL_STYLE}>
                {t({ id: "editor.assignLoop.keyGrid.inspector.sendsLabel", message: "Sends" })}
              </span>
              <span style={{ ...FIELD_VALUE_STYLE, fontSize: 12 }} data-testid="key-inspector-sends">
                {sendsInfo.effectiveLayerId}
                {sendsInfo.superseded && (
                  <span
                    data-testid="key-inspector-sends-override-note"
                    style={{ color: TEXT_DIM, marginLeft: 6, fontSize: 11 }}
                  >
                    {t({
                      id: "editor.assignLoop.keyGrid.inspector.sendsOverrideNote",
                      message: `(overrides the containing ${{ layer: sendsInfo.containingLayerId }} layer)`,
                    })}
                  </span>
                )}
              </span>
            </>
          )}

          {/* Key type ("sp") — full legal set, always selectable (FR-029a),
              as a dropdown (see the module doc for why not six radios). */}
          <span id={spGroupLabelId} style={PANEL_LABEL_STYLE}>
            {t({ id: "editor.assignLoop.keyGrid.inspector.sp.label", message: "Key type" })}
          </span>
          <div
            data-testid="key-inspector-sp"
            style={{ display: "flex", flexDirection: "column", gap: 3 }}
            // Focus events bubble in React, so this catches the dropdown
            // trigger's own focus without reaching into `SelectMenu`.
            onFocus={() => setSpNoteExpanded(true)}
            onBlur={() => setSpNoteExpanded(false)}
          >
            <SelectMenu
              value={String(currentSp)}
              ariaLabelledby={spGroupLabelId}
              ariaDescribedby={spNoteId}
              onChange={(v) => onSpChange(Number(v) as TouchKeySpValue)}
              options={LEGAL_SP_VALUES.map((value) => ({
                value: String(value),
                label: spOptionLabels[value].label,
              }))}
              // The FR-029d proposal rides on its own option and on the
              // collapsed trigger, so "which one would the studio pick" is still
              // visible without opening the list.
              renderOptionLabel={(opt) => (
                <span style={{ display: "inline-flex", alignItems: "center", gap: 6 }}>
                  {opt.label}
                  {opt.value === String(proposedSp) && (
                    <span data-testid="key-inspector-sp-proposed">
                      <Badge tone="accent">{proposedBadgeLabel}</Badge>
                    </span>
                  )}
                </span>
              )}
              style={{ fontSize: 12, padding: "3px 8px" }}
            />
            {/* The SELECTED type's own note, always visible, plus the caveat
                that holds for every type — key type is about drawing and
                tappability, not about whether a rule matches — revealed when the
                control has focus. Same "in the DOM and described, visible when
                you are reading it" rule the property panel's field hints follow
                (panelGrid.tsx), and for the same reason: it is four lines in a
                column that has to fit beside the keyboard. */}
            <span
              id={spNoteId}
              data-testid="key-inspector-sp-note"
              style={PANEL_HINT_STYLE}
            >
              {spOptionLabels[currentSp].note}
              <span style={visuallyHiddenUnless(spNoteExpanded)}>
                {" "}
                {t({
                  id: "editor.assignLoop.keyGrid.inspector.sp.note",
                  message:
                    "Key type controls how this key is drawn and whether it can be tapped. It does not stop a rule from matching — the key's id controls what it sends.",
                })}
              </span>
            </span>
          </div>

          {/* Produced characters */}
          <span style={PANEL_LABEL_STYLE}>
            {t({ id: "editor.assignLoop.keyGrid.inspector.producesLabel", message: "Produces" })}
          </span>
          <div data-testid="key-inspector-produces">
            {selectedCell.producedChars.length === 0 ? (
              <span style={{ ...PANEL_HINT_STYLE }}>
                {t({
                  id: "editor.assignLoop.keyGrid.inspector.noOutput",
                  message: "No output — this key is unassigned.",
                })}
              </span>
            ) : (
              <ul style={{ margin: 0, padding: 0, listStyle: "none" }}>
                {selectedCell.producedChars.map((ch) => (
                  <li key={ch} style={{ ...FIELD_VALUE_STYLE, fontSize: 12 }}>
                    {ch} <span style={{ color: TEXT_DIM, fontSize: 11 }}>({codepointLabel(ch).title})</span>
                  </li>
                ))}
              </ul>
            )}
          </div>

          {/* Provenance */}
          {selectedCell.provenance !== undefined && selectedCell.provenance !== "hand-set" && (
            <>
              <span style={PANEL_LABEL_STYLE}>
                {t({ id: "editor.assignLoop.keyGrid.inspector.provenanceLabel", message: "Placement" })}
              </span>
              <span style={PANEL_HINT_STYLE} data-testid="key-inspector-provenance">
                {selectedCell.provenance === "base-derived"
                  ? t({
                      id: "editor.assignLoop.keyGrid.inspector.provenanceBaseDerived",
                      message: "Auto-placed from your base keyboard.",
                    })
                  : t({
                      id: "editor.assignLoop.keyGrid.inspector.provenancePhysicalSuggested",
                      message: "Auto-suggested from the physical layout.",
                    })}
              </span>
            </>
          )}

          {/* Annotations */}
          {(selectedCell.annotations.longpress > 0 ||
            selectedCell.annotations.multitap > 0 ||
            selectedCell.annotations.flick > 0) && (
            <>
              <span style={PANEL_LABEL_STYLE}>
                {t({ id: "editor.assignLoop.keyGrid.inspector.annotationsLabel", message: "Sub-keys" })}
              </span>
              <span
                style={{ ...FIELD_VALUE_STYLE, fontSize: 12 }}
                data-testid="key-inspector-annotations"
              >
                {selectedCell.annotations.longpress > 0 &&
                  t({
                    id: "editor.assignLoop.keyGrid.inspector.longpressCount",
                    message: plural(selectedCell.annotations.longpress, {
                      one: "# longpress entry",
                      other: "# longpress entries",
                    }),
                  })}
                {selectedCell.annotations.longpress > 0 &&
                  (selectedCell.annotations.multitap > 0 || selectedCell.annotations.flick > 0) &&
                  " · "}
                {selectedCell.annotations.multitap > 0 &&
                  t({
                    id: "editor.assignLoop.keyGrid.inspector.multitapCount",
                    message: plural(selectedCell.annotations.multitap, {
                      one: "# multitap entry",
                      other: "# multitap entries",
                    }),
                  })}
                {selectedCell.annotations.multitap > 0 && selectedCell.annotations.flick > 0 && " · "}
                {selectedCell.annotations.flick > 0 &&
                  t({
                    id: "editor.assignLoop.keyGrid.inspector.flickCount",
                    message: plural(selectedCell.annotations.flick, {
                      one: "# flick direction",
                      other: "# flick directions",
                    }),
                  })}
              </span>
            </>
          )}

          {/* Findings — T115/T116/T117: localized copy plus a concrete fix
              action per diagnostic. Severity is carried by the chip's LETTER
              and by the visible severity word beside it, never by colour alone
              (FR-050, US5 AS4). Spans both columns: a finding is a sentence with
              buttons under it, not a value in a label/value table. */}
          <div
            style={{ ...PANEL_SPAN_STYLE, display: "flex", flexDirection: "column", gap: 4 }}
            data-testid="key-inspector-findings"
          >
            <span style={PANEL_HINT_STYLE}>
              {selectedCell.findings.length === 0
                ? t({
                    id: "editor.assignLoop.keyGrid.inspector.findingsNone",
                    message: "No diagnostics",
                  })
                : t({
                    id: "editor.assignLoop.keyGrid.inspector.findingsLabel",
                    message: plural(selectedCell.findings.length, {
                      one: "# diagnostic",
                      other: "# diagnostics",
                    }),
                  })}
            </span>
            {selectedCell.findings.length > 0 && (
              <ul style={{ margin: 0, padding: 0, listStyle: "none", display: "flex", flexDirection: "column", gap: 10 }}>
                {selectedCell.findings.map((finding, i) => {
                  const sev = severityStyle(finding.severity);
                  const detail = findingDetail(finding, i18n);
                  return (
                    <li
                      // A finding carries no stable id of its own — it is derived
                      // fresh from the layout every cycle — so code+index is the
                      // correct key: it is stable for as long as the finding list
                      // itself is, which is exactly one render pass.
                      key={`${finding.code}-${i}`}
                      data-testid={`key-inspector-finding-${i}`}
                      style={{ display: "flex", flexDirection: "column", gap: 3, fontSize: 12 }}
                    >
                      <span style={{ display: "flex", alignItems: "baseline", gap: 6 }}>
                        <span
                          aria-hidden="true"
                          style={{
                            display: "inline-block",
                            width: 14,
                            height: 14,
                            lineHeight: "14px",
                            textAlign: "center",
                            borderRadius: 3,
                            fontWeight: 700,
                            fontSize: 9,
                            // Dark text on the bright severity-dot fill —
                            // matches KeyGridCell.tsx's identical badge.
                            color: "var(--app-bg)",
                            background: sev.color,
                            flexShrink: 0,
                          }}
                        >
                          {sev.letter}
                        </span>
                        {/* The severity WORD, not just the coloured chip — this is
                            the "and text" half of "icon and text, never colour
                            alone". It is real text, not `aria-label` on the chip,
                            so it also survives a high-contrast or monochrome
                            display for a sighted author. */}
                        <span
                          data-testid={`key-inspector-finding-${i}-severity`}
                          style={{ color: sev.color, fontWeight: 600, flexShrink: 0 }}
                        >
                          {severityLabel(finding.severity, i18n)}
                        </span>
                        <span
                          data-testid={`key-inspector-finding-${i}-title`}
                          style={{ ...FIELD_VALUE_STYLE, fontSize: 12 }}
                        >
                          {findingTitle(finding, i18n)}
                        </span>
                      </span>
                      {detail !== undefined && (
                        <span
                          data-testid={`key-inspector-finding-${i}-detail`}
                          style={{ ...FIELD_VALUE_STYLE, color: TEXT_DIM, fontSize: 11, paddingLeft: 20 }}
                        >
                          {detail}
                        </span>
                      )}
                      {finding.fixes.length > 0 && (
                        <span style={{ display: "flex", flexWrap: "wrap", gap: 6, paddingLeft: 20 }}>
                          {finding.fixes.map((fix, fixIndex) => (
                            <button
                              key={`${fix.kind}-${fixIndex}`}
                              type="button"
                              data-testid={`key-inspector-finding-${i}-fix-${fixIndex}`}
                              data-fix-kind={fix.kind}
                              onClick={() => onApplyFix(fix, finding)}
                              style={{
                                fontFamily: FONT,
                                fontSize: 11,
                                padding: "3px 8px",
                                borderRadius: 4,
                                border: `1px solid ${BORDER}`,
                                background: "transparent",
                                color: TEXT_MAIN,
                                cursor: "pointer",
                              }}
                            >
                              {fixLabel(fix, i18n)}
                            </button>
                          ))}
                        </span>
                      )}
                    </li>
                  );
                })}
              </ul>
            )}
          </div>
        </>
      )}
    </div>
  );
}

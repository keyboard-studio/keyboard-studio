// KeyInspector — the read-only detail surface for whichever cell is currently
// selected in the touch key grid (spec 058 T070; FR-020b, FR-030). This
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
// ## Findings — still Phase 9's shape, not this component's
//
// `cell.findings` is `keyGridViewModel.ts`'s own `TouchKeyFinding` PLACEHOLDER
// (T113-T121 have not landed the real diagnostic codes/copy yet — see that
// module's doc comment, "findings — the Phase 9 seam"). This component
// renders the STRUCTURED shape it already has (severity + the opaque `code`
// string + `fields` as a plain key/value list) rather than inventing English
// prose for codes that do not exist yet. When T113 lands the real
// `TouchKeyFinding` type and a code -> localized-copy mapping, that mapping
// is this component's next increment, not a re-architecture of it.
//
// ## Editing is NOT this component's job
//
// This is a display surface. Assigning a character, changing an id, editing
// `nextlayer`, or acting on a finding's fix (FR-041) are Phase 6-8 concerns
// (rule synthesis, id minting, the edit overlay) that have no home yet in
// this file. Where an affordance for one of those will eventually need a
// FOCUSABLE control inside this panel (so Tab from the panel's root reaches
// it), the panel's own root already being a real DOM node with room for
// children is the seam — no restructuring needed when that lands.

import { useMemo, useCallback, useRef, type Ref } from "react";
import type { KeyboardEvent as ReactKeyboardEvent, RefObject } from "react";
import { Trans, useLingui } from "@lingui/react/macro";
import { plural } from "@lingui/core/macro";
import { isSpacerKeyClass, type TouchLayoutIR } from "@keyboard-studio/contracts";
import { parseTouchKeyAddress, resolveKeyAddress } from "@keyboard-studio/engine";
import { codepointLabel } from "../../../survey/codepointLabel.ts";
import { displayChar } from "../../../lib/irToCarveNodes.ts";
import { BG_CARD, BORDER, TEXT_DIM, TEXT_MAIN, FONT } from "../../../lib/galleryTheme.ts";
import { ERROR_RED, FONT_MONO, WARNING } from "../../../ui/theme.ts";
import type { KeyGridCellViewModel, TouchKeyFinding } from "./keyGridViewModel.ts";

// Layer C's info-severity blue has no existing named token in ui/theme.ts —
// KeyGridCell.tsx already made this same observation (its own `INFO_BLUE`
// const, same value) when it needed the identical E/W/I severity convention.
// Duplicated here rather than imported, since KeyGridCell.tsx does not export
// it (and this task does not touch that file) — if `ui/theme.ts` ever gains a
// real token for it, both call sites should move onto it together.
const INFO_BLUE = "#58a6ff";

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
}: UseKeyInspectorFocusBridgeOptions): UseKeyInspectorFocusBridgeResult {
  const inspectorRef = useRef<HTMLDivElement | null>(null);

  const handleGridKeyDown = useCallback((event: ReactKeyboardEvent) => {
    if (event.key !== "Enter" && event.key !== "F2") return;
    const target = event.target;
    if (!(target instanceof Element) || target.closest('[role="gridcell"]') === null) return;
    event.preventDefault();
    inspectorRef.current?.focus();
  }, []);

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
  /** Localized panel accessible name override. */
  label?: string;
}

const ROW_STYLE = { display: "flex", flexDirection: "column" as const, gap: 2 };
const FIELD_LABEL_STYLE = { fontSize: 11, color: TEXT_DIM, fontFamily: FONT };
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
  label,
}: KeyInspectorProps) {
  const { t } = useLingui();

  const sendsInfo = useMemo(
    () => (selectedCell !== null ? resolveSendsLayer(selectedCell, layout) : undefined),
    [selectedCell, layout],
  );

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
      role="region"
      aria-label={panelLabel}
      tabIndex={-1}
      data-testid="key-inspector"
      onKeyDown={handleKeyDown}
      style={{
        display: "flex",
        flexDirection: "column",
        gap: 10,
        padding: 12,
        background: BG_CARD,
        border: `1px solid ${BORDER}`,
        borderRadius: 8,
        fontFamily: FONT,
        outline: "none",
      }}
    >
      {selectedCell === null ? (
        <p data-testid="key-inspector-empty" style={{ ...FIELD_VALUE_STYLE, color: TEXT_DIM, margin: 0 }}>
          <Trans id="editor.assignLoop.keyGrid.inspector.emptyState">
            Select a key to see its details.
          </Trans>
        </p>
      ) : (
        <>
          {/* Keycap + id */}
          <div style={ROW_STYLE} data-testid="key-inspector-header">
            <span style={{ ...FIELD_VALUE_STYLE, fontFamily: FONT_MONO, fontSize: 16 }}>
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
            <span style={FIELD_LABEL_STYLE} data-testid="key-inspector-id">
              {t({
                id: "editor.assignLoop.keyGrid.inspector.idLabel",
                message: `Id: ${{ id: selectedCell.id }}`,
              })}
            </span>
          </div>

          {/* "Sends:" — the FR-030 crux */}
          {sendsInfo !== undefined && (
            <div style={ROW_STYLE} data-testid="key-inspector-sends">
              <span style={FIELD_LABEL_STYLE}>
                {t({ id: "editor.assignLoop.keyGrid.inspector.sendsLabel", message: "Sends" })}
              </span>
              <span style={FIELD_VALUE_STYLE}>
                {sendsInfo.effectiveLayerId}
                {sendsInfo.superseded && (
                  <span
                    data-testid="key-inspector-sends-override-note"
                    style={{ color: TEXT_DIM, marginLeft: 6, fontSize: 12 }}
                  >
                    {t({
                      id: "editor.assignLoop.keyGrid.inspector.sendsOverrideNote",
                      message: `(overrides the containing ${{ layer: sendsInfo.containingLayerId }} layer)`,
                    })}
                  </span>
                )}
              </span>
            </div>
          )}

          {/* Produced characters */}
          <div style={ROW_STYLE} data-testid="key-inspector-produces">
            <span style={FIELD_LABEL_STYLE}>
              {t({ id: "editor.assignLoop.keyGrid.inspector.producesLabel", message: "Produces" })}
            </span>
            {selectedCell.producedChars.length === 0 ? (
              <span style={{ ...FIELD_VALUE_STYLE, color: TEXT_DIM }}>
                {t({
                  id: "editor.assignLoop.keyGrid.inspector.noOutput",
                  message: "No output — this key is unassigned.",
                })}
              </span>
            ) : (
              <ul style={{ margin: 0, padding: 0, listStyle: "none" }}>
                {selectedCell.producedChars.map((ch) => (
                  <li key={ch} style={FIELD_VALUE_STYLE}>
                    {ch} <span style={{ color: TEXT_DIM, fontSize: 11 }}>({codepointLabel(ch).title})</span>
                  </li>
                ))}
              </ul>
            )}
          </div>

          {/* Provenance */}
          {selectedCell.provenance !== undefined && selectedCell.provenance !== "hand-set" && (
            <div style={ROW_STYLE} data-testid="key-inspector-provenance">
              <span style={FIELD_LABEL_STYLE}>
                {t({ id: "editor.assignLoop.keyGrid.inspector.provenanceLabel", message: "Placement" })}
              </span>
              <span style={FIELD_VALUE_STYLE}>
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
            </div>
          )}

          {/* Annotations */}
          {(selectedCell.annotations.longpress > 0 ||
            selectedCell.annotations.multitap > 0 ||
            selectedCell.annotations.flick > 0) && (
            <div style={ROW_STYLE} data-testid="key-inspector-annotations">
              <span style={FIELD_LABEL_STYLE}>
                {t({ id: "editor.assignLoop.keyGrid.inspector.annotationsLabel", message: "Sub-keys" })}
              </span>
              <span style={FIELD_VALUE_STYLE}>
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
            </div>
          )}

          {/* Findings — structured placeholder pending T113's real diagnostic codes/copy */}
          <div style={ROW_STYLE} data-testid="key-inspector-findings">
            <span style={FIELD_LABEL_STYLE}>
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
              <ul style={{ margin: 0, padding: 0, listStyle: "none", display: "flex", flexDirection: "column", gap: 4 }}>
                {selectedCell.findings.map((finding, i) => {
                  const sev = severityStyle(finding.severity);
                  return (
                    <li
                      // findings carry no stable id of their own yet (T113 placeholder
                      // shape); code+index is the best available key until then
                      key={`${finding.code}-${i}`}
                      data-testid={`key-inspector-finding-${i}`}
                      style={{ display: "flex", alignItems: "baseline", gap: 6, fontSize: 12 }}
                    >
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
                          color: "#0d1117",
                          background: sev.color,
                          flexShrink: 0,
                        }}
                      >
                        {sev.letter}
                      </span>
                      <span style={{ ...FIELD_VALUE_STYLE, fontFamily: FONT_MONO, fontSize: 12 }}>
                        {finding.code}
                      </span>
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

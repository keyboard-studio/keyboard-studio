// KeyGridCell — one gridcell in the touch key grid (spec 058 T064; FR-020,
// FR-020a, FR-022). Purely presentational: renders one
// `KeyGridCellViewModel` (./keyGridViewModel.ts, T063 — a pure projection
// holding no state) as an ARIA APG `gridcell`
// (https://www.w3.org/WAI/ARIA/apg/patterns/grid/), with a
// codepoint-derived accessible name (docs/accessibility.md rule 10) — never
// the bare glyph alone.
//
// Selection vs. Tab-stop are two INDEPENDENT flags the parent (KeyGrid.tsx)
// computes and passes in: `isSelected` drives the visual highlight and
// `aria-selected`; `isTabbable` drives `tabIndex` (roving tabindex — see
// KeyGrid.tsx's module doc for the `hasSelectedVisible` fallback, which this
// component does not itself compute).
//
// The longpress/multitap/flick annotation counts, the provenance marker, and
// the findings dot are all `aria-hidden` — their substance is already folded
// into this cell's own `aria-label` (see `buildCellAriaLabel` below), so a
// screen reader never hears the same fact twice. A dedicated per-finding
// details view (click-through to the diagnostic, fix affordances) is
// KeyInspector's job (T070), not this cell's — this cell only SUMMARIZES.

import { useLingui } from "@lingui/react/macro";
import { plural } from "@lingui/core/macro";
import { isSpacerKeyClass } from "@keyboard-studio/contracts";
import { codepointLabel } from "../../../survey/codepointLabel.ts";
import { displayChar } from "../../../lib/irToCarveNodes.ts";
import { BG_CARD, BORDER, ACCENT, TEXT_DIM, FONT } from "../../../lib/galleryTheme.ts";
import { ERROR_RED, FONT_MONO, WARNING } from "../../../ui/theme.ts";
import type { KeyGridCellViewModel } from "./keyGridViewModel.ts";

// Layer C's info-severity blue has no existing named token in ui/theme.ts
// (WARNING/ERROR_RED cover Layer B/A already) — matches the editor gutter's
// own Layer C convention (docs/architecture.md "Editor gutter diagnostics").
const INFO_BLUE = "#58a6ff";

export interface KeyGridCellProps {
  cell: KeyGridCellViewModel;
  /** 1-based row index within the layer — mirrors `aria-rowindex`. */
  rowIndex: number;
  /** 1-based column (key) index within the row — mirrors `aria-colindex`; counts only actual keys, never the decorative pad/slack spacers KeyGrid renders alongside them. */
  colIndex: number;
  /** Percentage of the layer's widest-row total this cell's WIDTH occupies (the key's own left padding is a separate sibling spacer rendered by KeyGrid). */
  widthPercent: number;
  isSelected: boolean;
  isTabbable: boolean;
  onSelect: (cell: KeyGridCellViewModel) => void;
  /** Registers/unregisters this cell's DOM node against KeyGrid's own focus-follow map (see KeyGrid.tsx). */
  registerRef: (address: string, el: HTMLButtonElement | null) => void;
}

/**
 * Highest-severity color + single-letter badge present in `findings`, or
 * undefined when there are none. Mirrors the editor gutter's Layer A (red) /
 * B (yellow) / C (blue) severity convention. The letter is not decorative
 * flourish — docs/accessibility.md rule 7 ("color never carries meaning
 * alone") means a colored dot by itself is a defect for a colorblind sighted
 * author; pairing it with E/W/I is the shape/text differentiator the rule
 * asks for. (The full finding text itself is aria-hidden here — this cell's
 * `aria-label` already states the count — a click-through to per-finding
 * detail is KeyInspector's job, T070.)
 */
function worstSeverity(
  findings: KeyGridCellViewModel["findings"],
): { color: string; letter: string } | undefined {
  if (findings.some((f) => f.severity === "error")) return { color: ERROR_RED, letter: "E" };
  if (findings.some((f) => f.severity === "warning")) return { color: WARNING, letter: "W" };
  if (findings.length > 0) return { color: INFO_BLUE, letter: "I" };
  return undefined;
}

export function KeyGridCell({
  cell,
  rowIndex,
  colIndex,
  widthPercent,
  isSelected,
  isTabbable,
  onSelect,
  registerRef,
}: KeyGridCellProps) {
  const { t } = useLingui();
  const isBlank = isSpacerKeyClass(cell.sp);
  const finding = worstSeverity(cell.findings);
  const hasAnnotations =
    cell.annotations.longpress > 0 || cell.annotations.multitap > 0 || cell.annotations.flick > 0;
  const hasProvenanceMarker = cell.provenance !== undefined && cell.provenance !== "hand-set";
  const displayLabel = cell.keycap.length > 0 ? displayChar(cell.keycap) : cell.id;

  // The label-building helpers below are declared INSIDE this component
  // (closing over `t`), not hoisted to module scope taking `t` as a
  // parameter. That is load-bearing, not a style choice: Lingui's macro
  // transform rewrites a `t({...})` call only where it can statically prove
  // the callee IS the exact binding destructured from `const { t } =
  // useLingui()` (it walks that binding's own `referencePaths`) — passing
  // `t` into a separately-declared function creates a NEW parameter binding
  // also named `t`, which the macro's reference walk never reaches. A call
  // written that way still compiles and runs, but the labeled
  // `${{ name: expr }}` interpolation is never extracted or substituted —
  // at runtime the template literal just calls `Object.prototype.toString`
  // on the `{ name: expr }` object, rendering "[object Object]" in the
  // accessible name (caught by this file's own test suite, KeyGrid.test.tsx,
  // which was the point of writing content assertions on `aria-label`
  // rather than only checking DOM presence).

  /** " produces X (U+..), Y (U+..)" or " no output" — a trailing clause, never a standalone sentence. */
  function describeProduces(): string {
    if (cell.producedChars.length === 0) {
      return " " + t({ id: "editor.assignLoop.keyGrid.cell.noOutput", message: "no output" });
    }
    const list = cell.producedChars.map((ch) => `${ch} (${codepointLabel(ch).title})`).join(", ");
    return (
      " " +
      t({
        id: "editor.assignLoop.keyGrid.cell.produces",
        message: `produces ${{ produces: list }}`,
      })
    );
  }

  /** ", auto-placed from base keyboard" / ", auto-suggested from physical layout" / "" for hand-set (the unmarked default). */
  function describeProvenance(): string {
    if (cell.provenance === undefined || cell.provenance === "hand-set") return "";
    const label =
      cell.provenance === "base-derived"
        ? t({
            id: "editor.assignLoop.keyGrid.cell.provenanceBaseDerived",
            message: "auto-placed from base keyboard",
          })
        : t({
            id: "editor.assignLoop.keyGrid.cell.provenancePhysicalSuggested",
            message: "auto-suggested from physical layout",
          });
    return ", " + label;
  }

  /** ", N diagnostics" or "" when there are none. */
  function describeFindings(): string {
    if (cell.findings.length === 0) return "";
    return (
      ", " +
      t({
        id: "editor.assignLoop.keyGrid.cell.findingsCount",
        message: plural(cell.findings.length, { one: "# diagnostic", other: "# diagnostics" }),
      })
    );
  }

  /**
   * Build the cell's full accessible name. Each clause is its own small
   * translated fragment, concatenated with a plain locale-agnostic
   * separator — the same pattern CharacterMapPane.tsx's announcement
   * strings already use (`${actionWord} ${char} (${notation})
   * ${describeContribution(char)}`), not a mid-sentence reordering concern
   * (see catalog-format.md's "never concatenate translated fragments" rule,
   * which targets JSX `<Trans>` composition, not juxtaposed independent
   * facts like these).
   */
  function buildCellAriaLabel(): string {
    if (isBlank) {
      return t({
        id: "editor.assignLoop.keyGrid.cell.blankAriaLabel",
        message: `Blank key ${{ id: cell.id }}`,
      });
    }

    const base =
      cell.keycap.length > 0
        ? t({
            id: "editor.assignLoop.keyGrid.cell.ariaLabel",
            message: `${{ keycap: cell.keycap }} (${{ notation: codepointLabel(cell.keycap).title }}), key ${{ id: cell.id }}`,
          })
        : t({
            id: "editor.assignLoop.keyGrid.cell.ariaLabelNoKeycap",
            message: `Key ${{ id: cell.id }}`,
          });

    return base + describeProduces() + describeProvenance() + describeFindings();
  }

  const ariaLabel = buildCellAriaLabel();

  return (
    <button
      type="button"
      role="gridcell"
      ref={(el) => registerRef(cell.address, el)}
      data-testid={`key-grid-cell-${cell.address}`}
      aria-rowindex={rowIndex}
      aria-colindex={colIndex}
      aria-selected={isSelected}
      tabIndex={isTabbable ? 0 : -1}
      aria-label={ariaLabel}
      onClick={() => onSelect(cell)}
      style={{
        position: "relative",
        flexGrow: 0,
        flexShrink: 0,
        flexBasis: `${widthPercent}%`,
        boxSizing: "border-box",
        minWidth: 0,
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        justifyContent: "center",
        gap: 2,
        padding: "4px 2px",
        height: 48,
        background: isSelected ? "#0d2840" : isBlank ? "transparent" : BG_CARD,
        border: `1px solid ${isSelected ? ACCENT : isBlank ? "transparent" : BORDER}`,
        borderRadius: 4,
        color: isBlank ? TEXT_DIM : "#e6edf3",
        cursor: "pointer",
        fontFamily: FONT,
        overflow: "hidden",
      }}
    >
      {!isBlank && (
        <span
          style={{
            fontSize: 13,
            lineHeight: 1,
            fontFamily: FONT_MONO,
            whiteSpace: "nowrap",
            overflow: "hidden",
            textOverflow: "ellipsis",
            maxWidth: "100%",
          }}
        >
          {displayLabel}
        </span>
      )}
      {hasAnnotations && (
        <span aria-hidden="true" style={{ fontSize: 8, lineHeight: 1, color: TEXT_DIM }}>
          {cell.annotations.longpress > 0 && `+${cell.annotations.longpress}`}
          {cell.annotations.multitap > 0 && ` x${cell.annotations.multitap}`}
          {cell.annotations.flick > 0 && ` >${cell.annotations.flick}`}
        </span>
      )}
      {hasProvenanceMarker && (
        <span
          aria-hidden="true"
          data-testid={`key-grid-cell-${cell.address}-provenance`}
          style={{
            position: "absolute",
            top: 2,
            left: 3,
            fontSize: 8,
            lineHeight: 1,
            fontWeight: 700,
            color: TEXT_DIM,
          }}
        >
          {cell.provenance === "base-derived" ? "B" : "P"}
        </span>
      )}
      {finding !== undefined && (
        <span
          aria-hidden="true"
          data-testid={`key-grid-cell-${cell.address}-finding-badge`}
          style={{
            position: "absolute",
            top: 2,
            right: 3,
            fontSize: 7,
            lineHeight: "9px",
            width: 9,
            height: 9,
            textAlign: "center",
            borderRadius: 2,
            fontWeight: 700,
            color: "#0d1117",
            background: finding.color,
          }}
        >
          {finding.letter}
        </span>
      )}
    </button>
  );
}

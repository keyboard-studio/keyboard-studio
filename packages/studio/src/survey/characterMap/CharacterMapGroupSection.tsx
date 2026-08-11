// Group-render loop — renders one CharacterMapGroup as a <section>: its
// heading (+ per-group Hide/Show toggle), and either a "N hidden" collapse
// note or the cell grid itself (capped at maxCellsPerGroup, with a
// "Showing N of M" note when truncated). All selection/hide-state mutation
// lives in CharacterMapPane; this component is pure/controlled, called once
// per group from CharacterMapPane's `filteredGroups.map(...)`.

import { Trans, useLingui } from "@lingui/react/macro";
import { toUPlusNotation } from "@keyboard-studio/contracts";
import type { CharacterMapGroup } from "../../lib/services.ts";
import { prefixCombiningMark } from "../../lib/irToCarveNodes.ts";
import { TriangleIcon } from "../../editors/assignLoop/parts/carveShared.tsx";
import {
  TEXT_DIM,
  mutedNote,
  sectionHeading,
  charChip,
  chipGlyph,
  chipGlyphMissingBox,
  chipCodepoint,
  chipIndicator,
  chipIndicatorText,
  chipIndicatorColor,
  secondaryButton,
} from "../surveyStyles.ts";
import { groupGridId, groupKey } from "./groupKey.ts";
import { BASE_OUTPUT_BORDER } from "./constants.ts";
import type { CharacterMapCell } from "./types.ts";

export interface CharacterMapGroupSectionProps {
  group: CharacterMapGroup;
  maxCellsPerGroup: number;
  query: string;
  hiddenGroups: Set<string>;
  chars: string[];
  baseProduced: Set<string>;
  zoom: number;
  glyphFontStack: string;
  isGlyphSupported: (display: string) => boolean;
  onToggleCell: (cell: CharacterMapCell) => void;
  onToggleHidden: (group: CharacterMapGroup, hidden: boolean) => void;
}

export function CharacterMapGroupSection({
  group,
  maxCellsPerGroup,
  query,
  hiddenGroups,
  chars,
  baseProduced,
  zoom,
  glyphFontStack,
  isGlyphSupported,
  onToggleCell,
  onToggleHidden,
}: CharacterMapGroupSectionProps) {
  const { t } = useLingui();

  // Defined here (not at module scope) so its `t()` calls close over this
  // component's own `t` binding directly — mirrors the identical concern
  // this helper had inside CharacterMapPane before the extraction (the
  // lingui macro tracks a specific variable BINDING, so a `t` re-bound as a
  // plain function parameter is a distinct binding the extractor does not
  // follow).
  function tierLabel(tier: CharacterMapGroup["tier"]): string | null {
    if (tier === "main") return t({ id: "survey.characterMapPane.tier.main", message: "main" });
    if (tier === "auxiliary") return t({ id: "survey.characterMapPane.tier.auxiliary", message: "loanwords" });
    if (tier === "digits") return t({ id: "survey.characterMapPane.tier.digits", message: "Digits & numerals" });
    if (tier === "punctuation") return t({ id: "survey.characterMapPane.tier.punctuation", message: "Punctuation & symbols" });
    return null;
  }

  const label = tierLabel(group.tier);
  // Rendering safety net for very large blocks (Hangul ~11k, Yi
  // ~1.1k) — cap what's drawn, not what's reachable (search above
  // narrows `group.cells` before this slice runs, and the U+XXXX
  // field reaches anything regardless of this cap).
  const visibleCells = group.cells.slice(0, maxCellsPerGroup);
  const hiddenCount = group.cells.length - visibleCells.length;
  const groupAriaLabel =
    label !== null
      ? t({
          id: "survey.characterMapPane.group.ariaLabelWithTier",
          message: `${{ block: group.block }} characters (${{ tier: label }})`,
        })
      : t({
          id: "survey.characterMapPane.group.ariaLabel",
          message: `${{ block: group.block }} characters`,
        });
  const key = groupKey(group);
  const gridId = groupGridId(key);
  // Search is ALWAYS whole-set (see CharacterMapPane's filteredGroups
  // comment): while a query is active, `group.cells` here is already
  // the query-filtered survivors, so a hidden group must still
  // render them rather than showing the "N hidden" collapse note —
  // otherwise a match inside a hidden group would be invisible.
  // hiddenGroups itself is left untouched, so clearing the query
  // returns the group to its collapsed state.
  const hasActiveQuery = query.trim() !== "";
  const isHidden = !hasActiveQuery && hiddenGroups.has(key);
  const hideShowAriaLabel = isHidden
    ? t({
        id: "survey.characterMapPane.group.showAction",
        message: `Show ${{ block: group.block }}`,
      })
    : t({
        id: "survey.characterMapPane.group.hideAction",
        message: `Hide ${{ block: group.block }}`,
      });
  return (
    <section aria-label={groupAriaLabel}>
      <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
        {/* flex: "0 0 auto" (no grow, no shrink) overrides the flex
            default flex-shrink:1 — without it, when the block name
            + tier label is too wide for the remaining row space,
            Chrome/Firefox force this h3 to wrap onto two lines AND
            expand to fill the row's full remaining width (the
            "shrink-to-fit" fallback stops applying once wrapping
            is needed), pushing the Hide/Show button far past the
            end of the visible first line. Pinning the basis to the
            heading's own content keeps it single-line-sized so the
            button sits flush after it. */}
        <h3 style={{ ...sectionHeading, flex: "0 0 auto" }}>
          {group.block}
          {label !== null && (
            <span style={{ fontWeight: 400, color: TEXT_DIM, fontSize: 11 }}>
              {" "}
              — {label}
            </span>
          )}
        </h3>
        {/* Per-group hide toggle — collapses ONLY this group's cell
            grid in place; the group stays in `filteredGroups` and this
            heading stays rendered either way (contrast with the
            "blocks my keyboard uses" checkbox, which drops
            non-used groups from the data entirely). */}
        <button
          type="button"
          onClick={() => onToggleHidden(group, !isHidden)}
          aria-expanded={!isHidden}
          aria-controls={gridId}
          aria-label={hideShowAriaLabel}
          style={{
            ...secondaryButton,
            padding: "2px 8px",
            fontSize: 11,
            lineHeight: 1,
            flexShrink: 0,
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
          }}
        >
          {/* Disclosure triangle — visual only, via the shared
              TriangleIcon (editors/assignLoop/parts/carveShared.tsx),
              the same module ChevronIcon lives in, following the
              same rotate-on-toggle idiom. A plain SVG <path> with no
              <title> adds no accessible text of its own, so the
              button's accessible name stays entirely on aria-label
              above. Pointing right (unrotated) = collapsed/hidden;
              rotated 90deg to point down = open/visible. */}
          <TriangleIcon open={!isHidden} size={11} />
        </button>
      </div>
      {isHidden ? (
        <div id={gridId} style={{ ...mutedNote, marginTop: 6 }}>
          <Trans id="survey.characterMapPane.group.hiddenNote">
            {group.cells.length} characters hidden.
          </Trans>
        </div>
      ) : (
        <>
          <div
            id={gridId}
            role="group"
            aria-label={t({
              id: "survey.characterMapPane.group.clickToToggleAriaLabel",
              message: `${{ block: group.block }} characters — click to toggle`,
            })}
            style={{ display: "flex", flexWrap: "wrap", gap: 8 }}
          >
            {visibleCells.map((cell) => {
              const selected = chars.includes(cell.char.normalize("NFC"));
              const cp = toUPlusNotation(cell.char);
              const display = prefixCombiningMark(cell.char, cell.isCombiningMark);
              // Font-support box fallback (Requirement 1): every listed
              // character must render, even ones the selected font
              // can't draw — a deterministic bordered box stands in
              // for the glyph rather than trusting the OS's own
              // (inconsistent) missing-glyph rendering. The U+
              // codepoint label below always renders regardless.
              //
              // Combining marks are EXCLUDED from the box path
              // (cell.isCombiningMark gate below), never routed through
              // isGlyphSupported at all. Root cause of the regression
              // this guards against: a standalone combining mark has
              // ~zero advance width of its own (that's how combining
              // characters work — they don't move the cursor), so the
              // Canvas measureText heuristic in fontSupport.ts ends up
              // comparing the DOTTED-CIRCLE PREFIX's width against
              // itself across font stacks (the mark contributes
              // nothing to the measured width), which trivially
              // matches a generic-family baseline and misclassifies
              // the cell as "unsupported" even when the font can draw
              // the mark fine. A standalone mark must always show the
              // dotted circle, never a box.
              const glyphRenders = cell.isCombiningMark || isGlyphSupported(display);
              // Yellow "your base keyboard already types this" affordance,
              // shown until the author selects the glyph into the alphabet.
              const isBaseOutput = !selected && baseProduced.has(cell.char.normalize("NFC"));
              // Accessible name carries the base-output fact (never colour
              // alone) so screen-reader users get the same signal.
              const baseOutputHint = isBaseOutput
                ? t({
                    id: "survey.characterMapPane.cell.fromBase",
                    message: " — from your base keyboard",
                  })
                : "";
              // One catalog sentence per action, both variables interpolated
              // by the translator, rather than assembling a translated action
              // word with raw char/codepoint data via template literal — that
              // locks in English word order for every locale (#1589/#1596
              // sibling; mirrors PunctuationStep.tsx's fix).
              const cellAriaLabel = selected
                ? t({
                    id: "survey.characterMapPane.cell.removeAriaLabel",
                    message: `Remove ${{ char: cell.char }} (${{ cp }})${{ baseOutputHint }}`,
                  })
                : t({
                    id: "survey.characterMapPane.cell.addAriaLabel",
                    message: `Add ${{ char: cell.char }} (${{ cp }})${{ baseOutputHint }}`,
                  });
              return (
                <button
                  key={cell.char}
                  type="button"
                  onClick={() => onToggleCell(cell)}
                  aria-pressed={selected}
                  aria-label={cellAriaLabel}
                  style={
                    isBaseOutput
                      ? { ...charChip(false, zoom), border: `1px solid ${BASE_OUTPUT_BORDER}` }
                      : charChip(selected, zoom)
                  }
                >
                  {glyphRenders ? (
                    <span style={chipGlyph(selected, glyphFontStack, zoom)}>{display}</span>
                  ) : (
                    <span style={chipGlyphMissingBox(selected, zoom)} aria-hidden="true" />
                  )}
                  <span style={chipCodepoint(zoom)}>{cp}</span>
                  {/* Non-color selected indicator (colorblind-safe) — shared
                      helper with SuggestionChip's "[x]"/"+" pattern in
                      PhaseB.tsx (surveyStyles.ts's chipIndicator*). */}
                  <span style={chipIndicator(chipIndicatorColor(selected), zoom)}>
                    {chipIndicatorText(selected)}
                  </span>
                </button>
              );
            })}
          </div>
          {hiddenCount > 0 && (
            <div style={{ ...mutedNote, marginTop: 6 }}>
              <Trans id="survey.characterMapPane.group.hiddenCount">
                Showing {visibleCells.length} of {group.cells.length} characters — use search
                or "Add any character by code point" above to find a specific one.
              </Trans>
            </div>
          )}
        </>
      )}
    </section>
  );
}

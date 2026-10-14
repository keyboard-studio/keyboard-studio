// InvisiblesGalleryPane — the Invisible characters step's right-pane
// gallery (#1794).
//
// The alphabet and punctuation scopes of CharacterMapPane browse glyphs;
// format characters have no glyph, so this pane renders its own cell
// variant: a dotted placeholder box carrying the standard abbreviation
// (or the 4-hex where none exists), the official Unicode name, the
// U+XXXX notation, and the "you need this if…" statement. Toggling a cell
// calls the same `acceptInvisible` / `declineInvisible` ops the in-step
// rows use, so a pick in either place shows in both.
//
// Data is static (the inventory does not depend on the language or the
// base keyboard), so unlike the sibling scopes this pane performs no
// characterMapGroups fetch — it builds its groups from
// invisibleGallery.ts directly.

import { useEffect, useMemo, useState, type FormEvent } from "react";
import { Trans, useLingui } from "@lingui/react/macro";
import { plural } from "@lingui/core/macro";
import { toUPlusNotation } from "@keyboard-studio/contracts";
import { invisibleCharLabel } from "../../lib/irToCarveNodes.ts";
import { useDecisionStore } from "../../stores/decisionStore.ts";
import { deriveSurveyContext } from "../../decisions/identitySelectors.ts";
import { useInventoryDraft } from "../useInventoryDraft.ts";
import { isFormatChar } from "../charNormUtils.ts";
import {
  directionAnswersFromDecisions,
  writingDirectionFrom,
} from "../invisibles/invisibleDirection.ts";
import {
  invisibleGalleryGroups,
  matchesInvisibleQuery,
  type InvisibleGalleryCell,
  type InvisibleGalleryGroup,
} from "../invisibles/invisibleGallery.ts";
import { parseCodepointInput } from "./rawCodepointEntry.ts";
import { RawCodepointEntry } from "./RawCodepointEntry.tsx";
import { useSearchFiltersPopover } from "./useSearchFiltersPopover.ts";
import { SearchFiltersPopover } from "./SearchFiltersPopover.tsx";
import { useZoomControl } from "./useZoomControl.ts";
import { ZoomControl } from "./ZoomControl.tsx";
import {
  ACCENT,
  BORDER,
  BG_PAGE,
  TEXT_DIM,
  TEXT_MAIN,
  FONT,
  sectionHeading,
  secondaryButton,
  mutedNote,
  visuallyHidden,
} from "../surveyStyles.ts";

// ---------------------------------------------------------------------------
// InvisibleGalleryCellView — one named invisible character with a toggle
// ---------------------------------------------------------------------------

interface InvisibleGalleryCellViewProps {
  cell: InvisibleGalleryCell;
  accepted: boolean;
  zoom: number;
  onToggle: (cell: InvisibleGalleryCell) => void;
}

function InvisibleGalleryCellView({
  cell,
  accepted,
  zoom,
  onToggle,
}: InvisibleGalleryCellViewProps) {
  const { i18n } = useLingui();
  const hex = cell.codePoint.toString(16).toLowerCase().padStart(4, "0");
  const labelId = `invisible-gallery-label-${hex}`;
  const needId = `invisible-gallery-need-${hex}`;
  return (
    <li style={{ listStyle: "none", margin: 0 }}>
      <button
        type="button"
        role="checkbox"
        aria-checked={accepted}
        aria-labelledby={labelId}
        aria-describedby={needId}
        data-testid={`invisible-gallery-cell-${hex}`}
        onClick={() => onToggle(cell)}
        className="ks-focus-ring"
        style={{
          display: "grid",
          gridTemplateColumns: "auto 1fr",
          gap: 12,
          width: "100%",
          height: "100%",
          textAlign: "left",
          padding: "10px 12px",
          background: BG_PAGE,
          border: `1px solid ${accepted ? ACCENT : BORDER}`,
          borderRadius: 6,
          color: TEXT_MAIN,
          fontFamily: FONT,
          cursor: "pointer",
        }}
      >
        {/* Visible stand-in for the glyph-less character — aria-hidden:
            the accessible name comes from the labelled name + notation. */}
        <span
          aria-hidden="true"
          style={{
            display: "inline-flex",
            alignItems: "center",
            justifyContent: "center",
            minWidth: 56,
            height: 40,
            padding: "0 8px",
            border: `1.5px dashed ${accepted ? ACCENT : TEXT_DIM}`,
            borderRadius: 6,
            fontFamily: "monospace",
            fontSize: 12 * zoom,
            fontWeight: 700,
            color: accepted ? ACCENT : TEXT_DIM,
          }}
        >
          {cell.abbreviation ?? hex.toUpperCase()}
        </span>
        <span style={{ display: "flex", flexDirection: "column", gap: 2, minWidth: 0 }}>
          <span id={labelId} style={{ fontSize: 14, fontWeight: 600 }}>
            {cell.name}{" "}
            <span style={{ fontFamily: "monospace", fontWeight: 400, color: TEXT_DIM }}>
              {cell.notation}
            </span>
          </span>
          <span id={needId} style={{ fontSize: 12, color: TEXT_DIM, lineHeight: 1.5 }}>
            {i18n._(cell.need)}
          </span>
        </span>
      </button>
    </li>
  );
}

// ---------------------------------------------------------------------------
// InvisiblesGalleryPane
// ---------------------------------------------------------------------------

export function InvisiblesGalleryPane() {
  const { t, i18n } = useLingui();
  const decisions = useDecisionStore((s) => s.decisions);
  const surveyContext = useMemo(() => deriveSurveyContext(decisions), [decisions]);
  const direction = useMemo(
    () =>
      writingDirectionFrom(
        directionAnswersFromDecisions(decisions),
        surveyContext,
      ),
    [decisions, surveyContext],
  );

  // The shared invisibles-inventory decision value — the same record the
  // in-step rows toggle, so the two surfaces stay in sync both ways.
  const draft = useInventoryDraft("invisibles");
  const invisibleDecisions = draft.invisibleDecisions;
  const acceptInvisible = draft.ops.acceptInvisible;
  const declineInvisible = draft.ops.declineInvisible;

  const groups = useMemo(() => invisibleGalleryGroups(), []);

  const [announcement, setAnnouncement] = useState("");
  const [query, setQuery] = useState("");
  const [rawInput, setRawInput] = useState("");
  const [rawError, setRawError] = useState<string | null>(null);

  // Direction controls are expanded for right-to-left authors and
  // collapsed — never hidden — for everyone else, mirroring the step's
  // bidi group.
  const [directionExpanded, setDirectionExpanded] = useState(direction === "rtl");
  useEffect(() => {
    if (direction === "rtl") setDirectionExpanded(true);
  }, [direction]);

  // "Search filters" disclosure state/handlers — see useSearchFiltersPopover.ts.
  const searchFiltersPopover = useSearchFiltersPopover(setAnnouncement);
  const { searchFilters } = searchFiltersPopover;

  // Zoom factor for the placeholder boxes — see useZoomControl.ts.
  const { zoom, zoomOutButtonRef, zoomInButtonRef, handleZoom } = useZoomControl(setAnnouncement);

  const isAccepted = (cell: InvisibleGalleryCell): boolean =>
    invisibleDecisions[cell.notation] === "accepted";

  function announceToggle(cell: InvisibleGalleryCell, accepted: boolean): void {
    setAnnouncement(
      accepted
        ? t({
            id: "survey.characterMapPane.announce.invisibleAdded",
            message: `Added ${{ name: cell.name }} (${{ cp: cell.notation }})`,
          })
        : t({
            id: "survey.characterMapPane.announce.invisibleRemoved",
            message: `Removed ${{ name: cell.name }} (${{ cp: cell.notation }})`,
          }),
    );
  }

  function toggleCell(cell: InvisibleGalleryCell): void {
    const accepted = isAccepted(cell);
    if (accepted) declineInvisible(cell.notation);
    else acceptInvisible(cell.notation);
    announceToggle(cell, !accepted);
  }

  // The raw code-point field on this scope: a format character is accepted
  // straight into the invisibles inventory (this pane IS the invisibles
  // surface, so there is nothing to hand off to); anything else is
  // announced and left alone — it belongs to the alphabet or punctuation
  // scopes, not here.
  function handleRawSubmit(e: FormEvent): void {
    e.preventDefault();
    const trimmed = rawInput.trim();
    if (trimmed === "") return;
    const result = parseCodepointInput(trimmed);
    if (!result.ok) {
      setRawError(
        t({
          id: "survey.characterMapPane.rawInput.invalidCodepoint",
          message:
            "Enter a valid code point: U+ followed by 4-6 hex digits (e.g. U+1E900). Surrogate halves and Unicode noncharacters aren't allowed.",
        }),
      );
      return;
    }
    const char = result.char.normalize("NFC");
    const notation = toUPlusNotation(char);
    if (isFormatChar(char)) {
      acceptInvisible(notation);
      const name = invisibleCharLabel(char) ?? notation;
      setAnnouncement(
        t({
          id: "survey.characterMapPane.announce.invisibleAdded",
          message: `Added ${{ name }} (${{ cp: notation }})`,
        }),
      );
    } else {
      setAnnouncement(
        t({
          id: "survey.characterMapPane.rawInput.notInvisible",
          message: `${{ cp: notation }} is not an invisible character — only format characters can be added here.`,
        }),
      );
    }
    setRawInput("");
    setRawError(null);
  }

  // Search is whole-set, like the sibling scopes: a query searches every
  // section (including a collapsed Direction controls) by abbreviation,
  // name and notation.
  const q = query.trim();
  const visibleGroups: InvisibleGalleryGroup[] = useMemo(() => {
    if (q === "") return groups;
    return groups
      .map((g) => ({
        ...g,
        cells: g.cells.filter((c) => matchesInvisibleQuery(c, q, searchFilters)),
      }))
      .filter((g) => g.cells.length > 0);
  }, [groups, q, searchFilters]);

  return (
    <div
      data-testid="invisible-gallery"
      style={{ display: "flex", flexDirection: "column", gap: 12, height: "100%", minHeight: 0 }}
    >
      <h2 style={{ margin: 0, fontSize: "1.1rem", color: ACCENT }}>
        <Trans id="survey.characterMapPane.titleInvisibles">Invisible characters</Trans>
      </h2>
      <p style={{ margin: 0, fontSize: 12, color: TEXT_DIM, lineHeight: 1.5 }}>
        <Trans id="survey.characterMapPane.subtitleInvisibles">
          Browse and click to toggle invisible characters into your list — the
          same list you&apos;re building on the left.
        </Trans>
      </p>
      <RawCodepointEntry
        value={rawInput}
        onChange={(value) => {
          setRawInput(value);
          if (rawError !== null) setRawError(null);
        }}
        onSubmit={handleRawSubmit}
        error={rawError}
      />
      <SearchFiltersPopover
        query={query}
        onQueryChange={setQuery}
        filtersOpen={searchFiltersPopover.filtersOpen}
        filtersContainerRef={searchFiltersPopover.filtersContainerRef}
        filtersTriggerRef={searchFiltersPopover.filtersTriggerRef}
        onToggleFiltersOpen={searchFiltersPopover.toggleFiltersOpen}
        onFiltersKeyDown={searchFiltersPopover.handleFiltersKeyDown}
        searchFilters={searchFiltersPopover.searchFilters}
        onToggleSearchFilter={searchFiltersPopover.handleToggleSearchFilter}
      />
      <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
        <ZoomControl
          zoom={zoom}
          zoomOutButtonRef={zoomOutButtonRef}
          zoomInButtonRef={zoomInButtonRef}
          onZoom={handleZoom}
        />
      </div>
      {/* Screen-reader announcer for toggle actions — visually hidden. */}
      <div aria-live="polite" style={visuallyHidden}>
        {announcement}
      </div>

      <div
        style={{ flex: 1, minHeight: 0, overflow: "auto", display: "flex", flexDirection: "column", gap: 16 }}
      >
        {visibleGroups.length === 0 ? (
          <div style={mutedNote}>
            <Trans id="survey.characterMapPane.noMatch">
              No characters match "{query.trim()}".
            </Trans>
          </div>
        ) : (
          visibleGroups.map((group) => {
            const heading =
              typeof group.heading === "string" ? group.heading : i18n._(group.heading);
            // The Direction controls section stays collapsed for non-RTL
            // authors until they ask for it — unless a search is active,
            // in which case its matches show like any other section's.
            const collapsed =
              group.isDirectionSection && direction !== "rtl" && !directionExpanded && q === "";
            return (
              <section key={group.id} aria-label={heading}>
                <h3 style={sectionHeading}>{heading}</h3>
                {collapsed ? (
                  <button
                    type="button"
                    data-testid="invisible-gallery-bidi-expand"
                    aria-expanded={false}
                    onClick={() => setDirectionExpanded(true)}
                    style={secondaryButton}
                  >
                    {t({
                      id: "survey.invisibles.bidiGroup.expandButton",
                      message: plural(group.cells.length, {
                        one: "Show # direction control",
                        other: "Show # direction controls",
                      }),
                    })}
                  </button>
                ) : (
                  <ul
                    style={{
                      margin: 0,
                      padding: 0,
                      display: "grid",
                      gridTemplateColumns: "repeat(auto-fill, minmax(230px, 1fr))",
                      gap: 8,
                    }}
                  >
                    {group.cells.map((cell) => (
                      <InvisibleGalleryCellView
                        key={cell.notation}
                        cell={cell}
                        accepted={isAccepted(cell)}
                        zoom={zoom}
                        onToggle={toggleCell}
                      />
                    ))}
                  </ul>
                )}
              </section>
            );
          })
        )}
      </div>
    </div>
  );
}

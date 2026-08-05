// Search row: the query TextField grows to fill the row; the "Search
// filters" disclosure trigger sits to its right, collapsed by default.
// Reuses the style idiom of the raw-codepoint <form> row (flex row, gap 8,
// aligned controls) rather than inventing a new one. All state lives in
// useSearchFiltersPopover.ts (owned by CharacterMapPane); this component is
// pure/controlled.

import type { KeyboardEvent } from "react";
import { Trans, useLingui } from "@lingui/react/macro";
import { TextField, Checkbox } from "../../ui/index.ts";
import type { SearchFilters } from "../characterSearch.ts";
import { BG_PAGE, BORDER, TEXT_DIM, secondaryButton } from "../surveyStyles.ts";

export interface SearchFiltersPopoverProps {
  query: string;
  onQueryChange: (value: string) => void;
  filtersOpen: boolean;
  filtersContainerRef: React.RefObject<HTMLDivElement>;
  filtersTriggerRef: React.RefObject<HTMLButtonElement>;
  onToggleFiltersOpen: () => void;
  onFiltersKeyDown: (e: KeyboardEvent) => void;
  searchFilters: SearchFilters;
  onToggleSearchFilter: (field: keyof SearchFilters, next: boolean) => void;
}

export function SearchFiltersPopover({
  query,
  onQueryChange,
  filtersOpen,
  filtersContainerRef,
  filtersTriggerRef,
  onToggleFiltersOpen,
  onFiltersKeyDown,
  searchFilters,
  onToggleSearchFilter,
}: SearchFiltersPopoverProps) {
  const { t } = useLingui();
  return (
    <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
      <TextField
        value={query}
        onChange={(e) => onQueryChange(e.target.value)}
        placeholder={t({ id: "survey.characterMapPane.search.placeholder", message: "Search characters" })}
        aria-label={t({ id: "survey.characterMapPane.search.ariaLabel", message: "Search the character map" })}
        style={{ flex: 1 }}
      />
      <div ref={filtersContainerRef} style={{ position: "relative", flexShrink: 0 }}>
        <button
          type="button"
          ref={filtersTriggerRef}
          onClick={onToggleFiltersOpen}
          onKeyDown={onFiltersKeyDown}
          aria-haspopup="true"
          aria-expanded={filtersOpen}
          aria-controls="char-map-search-filters-panel"
          aria-label={t({
            id: "survey.characterMapPane.searchFilter.trigger.ariaLabel",
            message: "Search filters",
          })}
          style={{ ...secondaryButton, whiteSpace: "nowrap", display: "flex", alignItems: "center", gap: 4 }}
        >
          <Trans id="survey.characterMapPane.searchFilter.trigger">Search filters</Trans>
          <span aria-hidden="true">▾</span>
        </button>
        {filtersOpen && (
          /* eslint-disable-next-line jsx-a11y/no-noninteractive-element-interactions --
             the keydown listener only ADDS keyboard capability: it catches
             Escape bubbling from the checkboxes inside to dismiss the popover
             and restore focus to the trigger (house rule 4). The group itself
             is not made pointer-interactive. */
          <div
            id="char-map-search-filters-panel"
            role="group"
            aria-label={t({
              id: "survey.characterMapPane.searchFilter.label",
              message: "Search by:",
            })}
            onKeyDown={onFiltersKeyDown}
            style={{
              position: "absolute",
              top: "100%",
              right: 0,
              zIndex: 20,
              marginTop: 4,
              padding: 10,
              display: "flex",
              flexDirection: "column",
              gap: 6,
              whiteSpace: "nowrap",
              background: BG_PAGE,
              border: `1px solid ${BORDER}`,
              borderRadius: 6,
              boxShadow: "0 4px 12px rgba(0, 0, 0, 0.4)",
              fontSize: 12,
              color: TEXT_DIM,
            }}
          >
            <span style={{ fontWeight: 600 }}>
              <Trans id="survey.characterMapPane.searchFilter.label">Search by:</Trans>
            </span>
            <label className="ks-hit-target" style={{ display: "flex", alignItems: "center", gap: 4 }}>
              <Checkbox
                checked={searchFilters.character}
                onChange={(e) => onToggleSearchFilter("character", e.target.checked)}
                aria-label={t({
                  id: "survey.characterMapPane.searchFilter.character.ariaLabel",
                  message: "Search by character",
                })}
              />
              <Trans id="survey.characterMapPane.searchFilter.character">Character</Trans>
            </label>
            <label className="ks-hit-target" style={{ display: "flex", alignItems: "center", gap: 4 }}>
              <Checkbox
                checked={searchFilters.name}
                onChange={(e) => onToggleSearchFilter("name", e.target.checked)}
                aria-label={t({
                  id: "survey.characterMapPane.searchFilter.name.ariaLabel",
                  message: "Search by name",
                })}
              />
              <Trans id="survey.characterMapPane.searchFilter.name">Name</Trans>
            </label>
            <label className="ks-hit-target" style={{ display: "flex", alignItems: "center", gap: 4 }}>
              <Checkbox
                checked={searchFilters.codepoint}
                onChange={(e) => onToggleSearchFilter("codepoint", e.target.checked)}
                aria-label={t({
                  id: "survey.characterMapPane.searchFilter.unicode.ariaLabel",
                  message: "Search by Unicode value",
                })}
              />
              <Trans id="survey.characterMapPane.searchFilter.unicode">Unicode value</Trans>
            </label>
          </div>
        )}
      </div>
    </div>
  );
}

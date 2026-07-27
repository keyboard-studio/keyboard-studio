// "Search filters" disclosure — the three "Search by:" checkboxes live inside
// a popover anchored to a trigger button right of the search box, closed by
// default. Local open/closed state only; no timer of any kind (D3 scope
// guard — the studio's one 300ms cycle belongs to the validator/WASM oracle,
// not a viewing preference like this).
//
// P0 FIX (reported regression: "the search bar does nothing"): matchesQuery
// treats an all-false SearchFilters as a valid, deliberate "match nothing"
// state (characterSearch.ts's documented WYSIWYG contract, unit-tested in
// characterSearch.test.ts) — but reaching that state via these three
// checkboxes gave NO indication that search was now fully disabled, so a
// user unchecking all three (there is nothing that visually distinguishes
// "0 fields selected" from any other combination) would see every
// subsequent query return zero results, indistinguishable from the search
// box being broken. Refuse the toggle when it would leave every field
// unchecked, rather than silently landing in that state — the pure
// predicate's own all-false contract is untouched (still reachable/tested
// at the matchesQuery level), only the UI's affordance for reaching it is
// removed.

import { useCallback, useEffect, useRef, useState, type KeyboardEvent } from "react";
import { useLingui } from "@lingui/react/macro";
import { ALL_FILTERS, type SearchFilters } from "../characterSearch.ts";

export interface UseSearchFiltersPopoverResult {
  searchFilters: SearchFilters;
  filtersOpen: boolean;
  filtersContainerRef: React.RefObject<HTMLDivElement>;
  filtersTriggerRef: React.RefObject<HTMLButtonElement>;
  toggleFiltersOpen: () => void;
  handleFiltersKeyDown: (e: KeyboardEvent) => void;
  handleToggleSearchFilter: (field: keyof SearchFilters, next: boolean) => void;
  /** Resets to the all-checked, closed default — called on language/base change. */
  reset: () => void;
}

export function useSearchFiltersPopover(
  announce: (message: string) => void,
): UseSearchFiltersPopoverResult {
  const { t } = useLingui();
  // "Search by:" field filters for the search box above — all-true by
  // default (search every field). Deliberately independent of the
  // "blocks my keyboard uses" filter: these narrow WHICH FIELDS a query
  // matches against, not which groups are in scope. See characterSearch.ts's
  // SearchFilters doc comment for the mode mapping.
  const [searchFilters, setSearchFilters] = useState<SearchFilters>(ALL_FILTERS);
  const [filtersOpen, setFiltersOpen] = useState(false);
  const filtersContainerRef = useRef<HTMLDivElement>(null);
  const filtersTriggerRef = useRef<HTMLButtonElement>(null);

  // Close the "Search filters" popover on outside-click (pointerdown outside
  // both the trigger and the panel — both live inside filtersContainerRef).
  // Only attached while open, same idiom as ui/SelectMenu.tsx's own
  // click-outside effect. Escape-close is handled inline (handleFiltersKeyDown
  // below) since it also needs to refocus the trigger, which a document
  // listener can't do symmetrically with the outside-click case.
  useEffect(() => {
    if (!filtersOpen) return;
    const handlePointerDown = (e: PointerEvent): void => {
      if (!filtersContainerRef.current?.contains(e.target as Node)) {
        setFiltersOpen(false);
      }
    };
    document.addEventListener("pointerdown", handlePointerDown);
    return () => {
      document.removeEventListener("pointerdown", handlePointerDown);
    };
  }, [filtersOpen]);

  function toggleFiltersOpen(): void {
    setFiltersOpen((prev) => !prev);
  }

  function closeFiltersAndRefocusTrigger(): void {
    setFiltersOpen(false);
    filtersTriggerRef.current?.focus();
  }

  function handleFiltersKeyDown(e: KeyboardEvent): void {
    // Only handle Escape while the panel is open — otherwise a stray Escape on
    // the focused trigger would swallow its default action (e.g. dismissing a
    // parent overlay) for no visible effect.
    if (e.key === "Escape" && filtersOpen) {
      e.preventDefault();
      closeFiltersAndRefocusTrigger();
    }
  }

  // Toggles one of the "Search by:" field filters — reuses the shared
  // announcement live region passed in via `announce`.
  function handleToggleSearchFilter(field: keyof SearchFilters, next: boolean): void {
    if (!next) {
      const anyOtherFieldStillChecked = (Object.keys(searchFilters) as (keyof SearchFilters)[]).some(
        (key) => key !== field && searchFilters[key],
      );
      if (!anyOtherFieldStillChecked) {
        announce(
          t({
            id: "survey.characterMapPane.searchFilter.announceAtLeastOne",
            message: "At least one search field must stay selected.",
          }),
        );
        return;
      }
    }
    setSearchFilters((prev) => ({ ...prev, [field]: next }));
    const fieldLabel =
      field === "character"
        ? t({ id: "survey.characterMapPane.searchFilter.character", message: "Character" })
        : field === "name"
          ? t({ id: "survey.characterMapPane.searchFilter.name", message: "Name" })
          : t({ id: "survey.characterMapPane.searchFilter.unicode", message: "Unicode value" });
    announce(
      next
        ? t({
            id: "survey.characterMapPane.searchFilter.announceOn",
            message: `Now searching by ${{ field: fieldLabel }}`,
          })
        : t({
            id: "survey.characterMapPane.searchFilter.announceOff",
            message: `No longer searching by ${{ field: fieldLabel }}`,
          }),
    );
  }

  // Stable identity (empty dep array — only calls the state setters, which
  // are themselves stable) so CharacterMapPane's fetch effect can list it in
  // its dependency array without re-firing on every render.
  const reset = useCallback((): void => {
    setSearchFilters(ALL_FILTERS);
    setFiltersOpen(false);
  }, []);

  return {
    searchFilters,
    filtersOpen,
    filtersContainerRef,
    filtersTriggerRef,
    toggleFiltersOpen,
    handleFiltersKeyDown,
    handleToggleSearchFilter,
    reset,
  };
}

// carveContinue — the carve gallery's "marked until Continue" rule as pure
// functions (spec 106 FR-042), lifted out of CarveGalleryV2 so the gallery
// and the headless author commit the same thing (spec 107 FR-040).
//
// A suggested row is MARKED while it is neither discarded nor kept: nothing
// is removed until the author presses Continue. Continue discards every
// marked row as a `derived` removal and restores earlier defaults that are
// no longer suggested; Skip keeps every suggested character.
//
// The functions read and write the working copy through the same store
// actions the gallery's click handlers use (cascadeDelete / cascadeRestore /
// keepAll / setCarveSuggestion); their inputs are plain data — the rows
// `recommendedRemovalChars` produced, minus the cross-script-Latin ones —
// never React state.

import { useDecisionStore } from "../../stores/decisionStore.ts";
import { useWorkingCopyStore } from "../../stores/workingCopyStore.ts";
import type { RecommendedRemovalChar } from "../../lib/irToCarveNodes.ts";
import {
  currentCarvedLayoutValue,
  isUntouchedSuggestion,
  partitionRemovalKeys,
  removalKey,
  suggestionFingerprintOf,
  type CarvedLayoutValue,
} from "./carveValue.ts";

/** The store ids a recommendation row removes (rule nodes and store slots). */
export function recommendedRowIds(row: RecommendedRemovalChar): string[] {
  return [...row.contributors.ruleNodeIds, ...row.contributors.storeSlotIds];
}

/** True when every id of the row is deleted; a row with no ids is never discarded. */
export function isRowDiscarded(
  row: RecommendedRemovalChar,
  isItemDeleted: (id: string) => boolean,
): boolean {
  const ids = recommendedRowIds(row);
  if (ids.length === 0) return false;
  return ids.every((id) => isItemDeleted(id));
}

/**
 * Whether a suggested row is MARKED: one of the primary suggested rows, with
 * something to remove, not yet discarded and not kept by the author.
 * `primaryRows` are the suggested rows (reason other than cross-script-Latin);
 * `keptChars` are `carveSuggestion.kept` (NFC characters).
 */
export function isMarkedCarveRow(
  row: RecommendedRemovalChar,
  primaryRows: ReadonlySet<RecommendedRemovalChar>,
  isItemDeleted: (id: string) => boolean,
  keptChars: ReadonlySet<string>,
): boolean {
  return (
    primaryRows.has(row) &&
    recommendedRowIds(row).length > 0 &&
    !isRowDiscarded(row, isItemDeleted) &&
    !keptChars.has(row.ch.normalize("NFC"))
  );
}

/**
 * Continue: discard every marked row as the confirmed suggested default.
 * Restores earlier derived removals that are no longer suggested, deletes the
 * marked rows, and records the carve suggestion (`derived` = still-current
 * earlier ones plus the newly added, `kept` pruned to current characters).
 * No-op when `recommendationReady` is false. Mutates the working copy.
 */
export function applyCarveSuggestion(
  primaryRows: readonly RecommendedRemovalChar[],
  recommendationReady: boolean,
): void {
  if (!recommendationReady) return;
  const store = useWorkingCopyStore.getState();
  const cs = store.carveSuggestion;
  const suggestionFingerprint = suggestionFingerprintOf(primaryRows.map((r) => r.ch));
  const currentIds = new Set(primaryRows.flatMap(recommendedRowIds));
  const currentChars = new Set(
    primaryRows.flatMap((r) => (r.caseGroup ?? [r.ch]).map((c) => c.normalize("NFC"))),
  );
  const isCurrent = (key: string): boolean => {
    const id = key.slice(key.indexOf(":") + 1);
    return key.startsWith("char:") ? currentChars.has(id) : currentIds.has(id);
  };
  const stale = (cs?.derived ?? []).filter((k) => !isCurrent(k));
  if (stale.length > 0) {
    const { ids, chars } = partitionRemovalKeys(stale);
    store.cascadeRestore(ids, chars);
  }
  const before = new Set(currentCarvedLayoutValue().removals.map(removalKey));
  const primarySet = new Set(primaryRows);
  const kept = new Set(cs?.kept ?? []);
  const marked = primaryRows.filter((r) =>
    isMarkedCarveRow(r, primarySet, store.isItemDeleted, kept),
  );
  const ruleNodeIds: string[] = [];
  const storeSlotIds: string[] = [];
  const chars: string[] = [];
  for (const row of marked) {
    ruleNodeIds.push(...row.contributors.ruleNodeIds);
    storeSlotIds.push(...row.contributors.storeSlotIds);
    chars.push(...(row.caseGroup ?? [row.ch]));
  }
  if (ruleNodeIds.length > 0 || storeSlotIds.length > 0) {
    store.cascadeDelete(ruleNodeIds, storeSlotIds, chars);
  }
  const added = currentCarvedLayoutValue().removals.map(removalKey).filter((k) => !before.has(k));
  if (cs === null && added.length === 0) return;
  store.setCarveSuggestion({
    fingerprint: suggestionFingerprint,
    derived: [...(cs?.derived ?? []).filter(isCurrent), ...added],
    kept: (cs?.kept ?? []).filter((c) => currentChars.has(c)),
    ...(cs?.touched === true ? { touched: true } : {}),
  });
}

/**
 * Skip: keep every suggested character. Clears all removals, then records a
 * touched carve suggestion with nothing derived and every suggested
 * character kept. Mutates the working copy.
 */
export function applyCarveSkip(primaryRows: readonly RecommendedRemovalChar[]): void {
  const store = useWorkingCopyStore.getState();
  const suggestionFingerprint = suggestionFingerprintOf(primaryRows.map((r) => r.ch));
  store.keepAll();
  store.setCarveSuggestion({
    fingerprint: suggestionFingerprint,
    derived: [],
    kept: suggestionFingerprint === "[]" ? [] : primaryRows.map((r) => r.ch.normalize("NFC")).sort(),
    touched: true,
  });
}

/** What completing the carve step records as the `carved-layout` decision. */
export interface CarveDecisionInput {
  id: "carved-layout";
  value: CarvedLayoutValue;
  provenance: "default" | "asked";
}

/**
 * The `carved-layout` decision for the working copy's current carve state:
 * `default` provenance while the removals are exactly the untouched suggested
 * default (spec 106 FR-042), `asked` once the author changed anything.
 * Pure read; CarveAdapter records the result when the step completes.
 */
export function carveDecisionInput(): CarveDecisionInput {
  const value = currentCarvedLayoutValue();
  const suggestion = useWorkingCopyStore.getState().carveSuggestion;
  return {
    id: "carved-layout",
    value,
    provenance: isUntouchedSuggestion(value, suggestion) ? "default" : "asked",
  };
}

/** Record the carve decision for the working copy's current carve state, as the adapter does on completion. */
export function recordCarveDecision(): void {
  useDecisionStore.getState().record(carveDecisionInput());
}

/**
 * Press Continue: apply the marked suggestions, then return the decision the
 * adapter records on completion.
 */
export function continueCarve(
  primaryRows: readonly RecommendedRemovalChar[],
  recommendationReady: boolean,
): CarveDecisionInput {
  applyCarveSuggestion(primaryRows, recommendationReady);
  return carveDecisionInput();
}

/** Press Skip: keep every suggested character, then return the decision the adapter records. */
export function skipCarve(primaryRows: readonly RecommendedRemovalChar[]): CarveDecisionInput {
  applyCarveSkip(primaryRows);
  return carveDecisionInput();
}

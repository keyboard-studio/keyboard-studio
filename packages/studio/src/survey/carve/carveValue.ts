// carveValue — the carved-layout decision's value and its derivation
// from the live carve overlay (spec 090 T032, ruling D-090-30).
//
// The value types live here, in the carve feature home (the D-090-8
// pattern — deadkeyOps.ts, ruleAdditions.ts): the gallery module
// (survey/questions/gallery/carvedLayout.ts) may not import stores,
// editors, or lib, so the shape it re-exports is declared beside the
// overlay it snapshots. `currentCarvedLayoutValue()` is shared by
// CarveAdapter's completion recording and the module's decision
// renderer so the two surfaces never compute different values (the
// currentRuleSetValue precedent).

import {
  useWorkingCopyStore,
  type CarveSuggestionApplied,
} from "../../stores/workingCopyStore.ts";

export type { CarveSuggestionApplied };

/**
 * One removal-set item (RULED, T003 / owner ruling 2026-10-06): flat
 * per-item provenance — asked (the author removed it), derived (a studio
 * rule proposed and the author accepted the set), or extracted (it came
 * from the base keyboard's evidence).
 */
export interface CarveRemovalItem {
  kind: "node" | "item" | "family" | "char";
  id: string;
  provenance: "asked" | "derived" | "extracted";
}

/**
 * The carved-layout decision value (data-model.md). Values recorded before
 * the keyboard-wide fallback policy also carried `dispositions` and
 * `closedKeyboardCard`; those are read (never written) and folded into the
 * policy by `carveOverlayFromValue` — see survey/carve/fallbackPolicyMigration.ts.
 * The fallback policy itself is NOT part of this value: it is an
 * author-set working-copy setting (Assign Mechanisms step), so recording it
 * here at carve time would let a replay rebuild revert a later choice.
 */
export interface CarvedLayoutValue {
  removals: CarveRemovalItem[];
  /**
   * The suggested-discard set the gallery applied as a default on its first
   * visit (spec 106 FR-042), as a fingerprint. Absent when no suggestion was
   * ever applied, so values recorded before the field existed are unchanged.
   */
  suggestionFingerprint?: string;
}

/** The overlay slices the value snapshots — a structural subset of the
 * working copy's carve state, so the builder stays pure and testable. */
export interface CarveOverlaySnapshot {
  deletedNodeIds: ReadonlySet<string>;
  deletedItemIds: ReadonlySet<string>;
  disabledFamilyIds: ReadonlySet<string>;
  carveChars: ReadonlySet<string>;
}

/** One removal item's identity across the four id spaces. */
export function removalKey(item: Pick<CarveRemovalItem, "kind" | "id">): string {
  return `${item.kind}:${item.id}`;
}

/**
 * Split removal keys back into the two restore channels: item/node ids and
 * carved characters (the inverse of {@link removalKey}, for cascadeRestore).
 */
export function partitionRemovalKeys(keys: readonly string[]): {
  ids: string[];
  chars: string[];
} {
  const ids: string[] = [];
  const chars: string[] = [];
  for (const key of keys) {
    const id = key.slice(key.indexOf(":") + 1);
    if (key.startsWith("char:")) chars.push(id);
    else ids.push(id);
  }
  return { ids, chars };
}

/** The fingerprint of a suggestion set: its NFC characters, sorted. */
export function suggestionFingerprintOf(chars: readonly string[]): string {
  return JSON.stringify([...new Set(chars.map((c) => c.normalize("NFC")))].sort());
}

/** The characters a {@link suggestionFingerprintOf} fingerprint names. */
export function suggestedCharsOf(fingerprint: string): string[] {
  try {
    const parsed: unknown = JSON.parse(fingerprint);
    return Array.isArray(parsed) ? parsed.filter((c): c is string => typeof c === "string") : [];
  } catch {
    return [];
  }
}

const KIND_ORDER: readonly CarveRemovalItem["kind"][] = ["node", "item", "family", "char"];

/**
 * Build the decision value from an overlay snapshot.
 *
 * The four removal collections become one item list discriminated by
 * `kind` (data-model.md — the four id spaces stay distinct), sorted by
 * kind then id so the recorded value is canonical: two sessions that
 * reach the same overlay by different click orders record the same
 * value.
 *
 * Per-item provenance is `asked` for an author action, and `derived` for
 * a removal the gallery applied as its suggested default (spec 106
 * FR-042) — the items in `suggestion.derived`. No starting-point seeding
 * path writes the overlay today, so `extracted` cannot be produced
 * honestly yet; it becomes real when 092 live extraction lands.
 *
 * Reconstructibility (ruling D-090-30 condition (i)): the snapshot
 * covers every overlay component that can be non-trivial at carve
 * completion and feeds the applied view — the four removal sets. The one remaining overlay field,
 * `carveTouchKeepInert`, has no live writer, so it is always empty
 * in the live flow; if a surface ever mounts a writer for it, this
 * value needs a field for it (named in the spec's downstream
 * handoff, D-090-31).
 */
export function carvedLayoutValueFromOverlay(
  overlay: CarveOverlaySnapshot,
  suggestion: CarveSuggestionApplied | null = null,
): CarvedLayoutValue {
  const derived = new Set(suggestion?.derived ?? []);
  const sets: Record<CarveRemovalItem["kind"], ReadonlySet<string>> = {
    node: overlay.deletedNodeIds,
    item: overlay.deletedItemIds,
    family: overlay.disabledFamilyIds,
    char: overlay.carveChars,
  };
  const removals: CarveRemovalItem[] = [];
  for (const kind of KIND_ORDER) {
    for (const id of [...sets[kind]].sort()) {
      const provenance = derived.has(removalKey({ kind, id })) ? "derived" : "asked";
      removals.push({ kind, id, provenance });
    }
  }
  return suggestion === null
    ? { removals }
    : { removals, suggestionFingerprint: suggestion.fingerprint };
}

/**
 * True while the value holds exactly the suggested default and nothing the
 * author changed: every derived removal is still there and no other removal
 * exists. The carved-layout decision is then `default`-provenance (spec 106
 * FR-042); any keep, extra discard or restore makes it `asked`.
 */
export function isUntouchedSuggestion(
  value: CarvedLayoutValue,
  suggestion: CarveSuggestionApplied | null,
): boolean {
  if (
    suggestion === null ||
    suggestion.touched === true ||
    (suggestion.kept ?? []).length > 0 ||
    suggestion.derived.length === 0
  ) {
    return false;
  }
  return (
    value.removals.length === suggestion.derived.length &&
    value.removals.every((r) => r.provenance === "derived")
  );
}

/** The carved-layout value from the live working copy's carve overlay. */
export function currentCarvedLayoutValue(): CarvedLayoutValue {
  const s = useWorkingCopyStore.getState();
  return carvedLayoutValueFromOverlay(
    {
      deletedNodeIds: s.deletedNodeIds,
      deletedItemIds: s.deletedItemIds,
      disabledFamilyIds: s.disabledFamilyIds,
      carveChars: s.carveChars,
    },
    s.carveSuggestion,
  );
}

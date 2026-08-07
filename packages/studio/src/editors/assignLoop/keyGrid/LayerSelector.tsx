// LayerSelector — the key-mode layer switcher (spec 061-touch-editor-parity
// T011; FR-004, FR-005; research.md D11; contracts/key-mode-ui.md §1/§4).
//
// ## Why FR-004 is met "by construction", not by a special case
//
// Key mode today has an `activeKeyLayerId` with no control at all — the only
// way to reach a non-`default` layer is a double-click on a key that
// happens to carry a `nextlayer`. That is a coverage gap, not merely an
// ergonomics one: a layer no key's `nextlayer` reaches (an orphaned layer,
// or one only a Desktop rule chain ever selects) is simply unreachable
// through the grid. FR-004 closes it by requiring the selector's own list to
// come from `layerIds` (the ACTIVE PLATFORM's declared `layers[]`, per this
// module's prop contract) — **never** derived by scanning keys for
// `nextlayer`. Sourcing from the declaration is what makes "every layer,
// including ones no key reaches" true by construction: there is no code path
// here that could silently drop a layer no key points at, because no code
// path here ever looks at a key's `nextlayer` at all. The caller
// (`TouchGallery.tsx`, a later task) owns building `layerIds` from
// `platform.layers.map(l => l.id)`, not this component.
//
// ## Grouping (FR-005) — reads the engine's decomposition, never re-derives it
//
// `groupLayerFamilies` + `classifyPlane` (`@keyboard-studio/engine`,
// `packages/engine/src/pattern-apply/layerFamilies.ts`) are the SAME
// primitives `useModeContextCarry.ts`'s `orderLayerIdsByFamily` already
// builds on for family-ordering the character<->key context carry. This file
// reuses `orderLayerIdsByFamily` for the FLAT (family-then-complexity)
// ordering, and calls `groupLayerFamilies` directly for the plane label per
// family, rather than re-deriving the grouping from `orderLayerIdsByFamily`'s
// output. Two engine calls over the same cheap array is a non-issue (the
// same "cheap to re-derive every debounce cycle" precedent as
// `buildLayoutOrderIndex`, decision D3) — what actually matters is that this
// component never string-matches on a layer id's shape itself. The engine
// module's own doc names why that would drift: a second copy of the
// decomposition grammar (segment parsing, fragment vocabulary, the
// plane-only-sentinel table) going stale is "the exact bug [it] itself
// documents having fixed once already".
//
// **The group test id's plane segment** (`key-layer-selector-group-${plane}`)
// is, per this task's briefing: the plane's own name for a named plane (e.g.
// `symbol`, `numeric` — whatever the keyboard's author called it — rendered
// verbatim, since a plane name is authored DATA, not UI copy, and so is never
// wrapped for translation, matching catalog-format.md's "do not wrap...
// technical tokens" rule); the literal string `"base"` for the base
// alphabetic plane (`family.plane === undefined`); and the literal string
// `"freeform"` for every id `groupLayerFamilies` could not parse at all
// (`grouping.freeformLayerIds` — FR-067 in the engine module's own terms: a
// freeform id is never a family member, even a family of one, so every
// freeform id collapses into ONE shared bucket here rather than getting its
// own single-member group).
//
// ## Counts (FR-005) — a rollup this component reads, never computes
//
// `findingCountsByLayerId` is the caller's ALREADY-COMPUTED diagnostics
// rollup (built once per debounce cycle from `useTouchKeyDiagnostics`,
// grouped by the layer segment of each finding's address, per research D11).
// This component runs no validation of its own and starts no timer of its
// own — FR-039 (decision D3) is about there being exactly ONE 300ms
// validation cycle in the whole studio, and the way a component earns the
// right to show a live diagnostic count without being that second cycle is
// by never computing one. A missing map entry reads as zero, and a rendered
// `0` is deliberately never shown at all: a badge on every single option
// would be pure noise (this task's briefing, "no digits at all" for the
// zero case, mirrors `KeyGrid.tsx`'s own row-slack precedent of showing
// nothing rather than a zero). Non-zero counts render as real, visible TEXT
// (not a bare colored dot) so color is never the sole carrier of the
// finding-severity signal (docs/accessibility.md rule 7), and the count is
// ALSO folded into the option's accessible name in words (docs/
// accessibility.md rule 10's "name the character, don't just show the
// glyph" principle applied to counts: name the number, don't just badge it).
// Severity-aware rollup (loud vs soft) is explicitly out of this task's
// scope — this is a COUNT only, never a worst-severity computation.
//
// ## The >=2 / exactly-1 split — a choice that isn't real must not look real
//
// With two or more layers, this renders a single `role="tablist"` (the ARIA
// APG tabs pattern, automatic activation) that mirrors `KeyGrid.tsx`'s own
// platform tablist (`handlePlatformTabsKeyDown`) byte-for-byte in its
// keyboard contract: ArrowLeft/ArrowRight move AND select the adjacent tab,
// wrapping at both ends; Home/End jump to the first/last tab; exactly one
// tab carries `tabIndex={0}` at a time (roving tabindex — "Single Tab stop",
// the same convention `KeyGrid.tsx`'s own module doc names). This is
// deliberately the SAME composite-widget pattern as the platform tablist,
// not a second one invented for layers — contracts/key-mode-ui.md §6 says so
// outright ("one composite-widget pattern on this surface, not two"), and
// `useCharCycleKeys.ts`'s `SKIP_SELECTOR` already matches ANY
// `[role="tablist"]`, so the pane-level character-cycle handler never eats
// this tablist's arrow keys either, with no change needed to that file.
//
// With EXACTLY one layer, this renders a plain, non-interactive label naming
// that layer — no `role="tablist"`, no `role="tab"`, no buttons at all. A
// single-entry menu is not a choice; presenting one as though it were
// (a disabled-looking tab, a dropdown with one option) invites an author to
// go looking for the other options that don't exist. This mirrors
// `KeyGrid.tsx`'s own platform-tablist precedent exactly: "fewer than 2
// platforms renders no tablist... the selector must not imply choices that
// do not exist" (this file's module doc, and contracts/key-mode-ui.md §1's
// "absence rule" table, "exactly 1 layer -> the selector renders as a
// label, not a control").
//
// With ZERO layers (a caller bug — a real platform always declares at least
// one layer, but this component does not assume its input is well-formed),
// nothing renders at all: there is nothing to select and nothing to name.
//
// ## What this component does NOT own
//
// It never mounts itself (a later task wires it into `TouchGallery.tsx`,
// which is off-limits to this change per that task's own scope). It never
// computes `layerIds` from a platform object, never resolves the active
// layer from a `TouchLayoutIR`, and never touches `nextlayer` anywhere in
// its own code — the caller supplies the platform's declared layer list and
// the current selection; this file only renders the choice and reports the
// click/keypress back through the REQUIRED `onSelectLayer` callback (never
// optional — research D1's "a build error to omit, never a silent runtime
// nothing", the same discipline `KeyGrid.tsx`'s own callbacks are being
// moved to across this feature).

import { useMemo, useRef } from "react";
import type { KeyboardEventHandler } from "react";
import { useLingui } from "@lingui/react/macro";
import { plural } from "@lingui/core/macro";
import { classifyPlane, groupLayerFamilies } from "@keyboard-studio/engine";
import { orderLayerIdsByFamily } from "./useModeContextCarry.ts";
import { BORDER, ACCENT, TEXT_DIM, TEXT_MAIN, FONT } from "../../../lib/galleryTheme.ts";

export interface LayerSelectorProps {
  /**
   * Every layer id the ACTIVE PLATFORM declares, in declaration order.
   * Never derived from any key's `nextlayer` (FR-004) — see this file's
   * module doc for why that is the whole point.
   */
  readonly layerIds: readonly string[];
  readonly activeLayerId: string;
  readonly onSelectLayer: (layerId: string) => void;
  /**
   * Rolled-up diagnostic count per layer id, from the caller's
   * ALREADY-COMPUTED diagnostics map. A missing entry reads as zero. This
   * component runs no validation of its own — FR-039 forbids a second cycle
   * or timer.
   */
  readonly findingCountsByLayerId: ReadonlyMap<string, number>;
  /** Localized accessible name override. */
  readonly label?: string;
}

/** One rendered group: a plane's family, or the single shared freeform bucket. */
interface DisplayGroup {
  /** The `key-layer-selector-group-${planeSegment}` test-id segment — see this file's module doc, "Grouping". */
  readonly planeSegment: string;
  /**
   * The group's visible heading. A named plane's own name (data, never
   * translated); a localized word for the base plane and the freeform
   * bucket.
   */
  readonly headingText: string;
  /** This group's members, in the SAME order `orderLayerIdsByFamily` already resolved for the flat list (ascending modifier-combo complexity within the family; original relative order for freeform ids). */
  readonly layerIds: readonly string[];
}

/**
 * Group `layerIds` by family/plane (FR-005) for DISPLAY, and return both the
 * groups (in family-then-freeform order) and the fully flattened order
 * (needed for the tablist's roving-tabindex / arrow-key math, which treats
 * the whole selector as ONE sequence regardless of visual grouping — see
 * this file's module doc, "The >=2 / exactly-1 split").
 *
 * `baseGroupHeading`/`freeformGroupHeading` are passed in already-localized
 * (computed once, above any loop) rather than calling `t()` per group here —
 * the same "translate the fixed pieces once, splice in data per item"
 * discipline `FamilyApplyDialog.tsx` already follows for its own per-layer
 * list (`unavailableText`/`noContentText` computed once, referenced inside
 * its `targets.map`).
 */
function buildDisplayGroups(
  layerIds: readonly string[],
  baseGroupHeading: string,
  freeformGroupHeading: string,
): { groups: readonly DisplayGroup[]; flatLayerIds: readonly string[] } {
  const grouping = groupLayerFamilies(layerIds);
  const orderedLayerIds = orderLayerIdsByFamily(layerIds);

  const groups: DisplayGroup[] = [];
  for (const family of grouping.families) {
    const memberSet = new Set(family.layerIds);
    // `classifyPlane` is read here, not re-derived, so this component can
    // never disagree with the engine about which planes are "the base
    // alphabetic plane" vs. a named one — even though today only that
    // alphabetic/non-alphabetic split feeds the group heading, calling the
    // real classifier (rather than checking `family.plane === undefined`
    // directly a second time) keeps this file honest if a future task ever
    // wants to say more per plane class.
    const isAlphabetic = classifyPlane(family.plane) === "alphabetic";
    groups.push({
      planeSegment: family.plane ?? "base",
      headingText: isAlphabetic ? baseGroupHeading : (family.plane ?? baseGroupHeading),
      layerIds: orderedLayerIds.filter((id) => memberSet.has(id)),
    });
  }
  if (grouping.freeformLayerIds.length > 0) {
    const freeformSet = new Set(grouping.freeformLayerIds);
    groups.push({
      planeSegment: "freeform",
      headingText: freeformGroupHeading,
      layerIds: orderedLayerIds.filter((id) => freeformSet.has(id)),
    });
  }

  return { groups, flatLayerIds: orderedLayerIds };
}

export function LayerSelector({
  layerIds,
  activeLayerId,
  onSelectLayer,
  findingCountsByLayerId,
  label,
}: LayerSelectorProps) {
  const { t } = useLingui();
  const tabRefs = useRef<Map<string, HTMLButtonElement>>(new Map());

  const baseGroupHeading = t({
    id: "editor.assignLoop.keyGrid.layerSelector.groupBase",
    message: "Base",
  });
  const freeformGroupHeading = t({
    id: "editor.assignLoop.keyGrid.layerSelector.groupFreeform",
    message: "Other layers",
  });
  const defaultAriaLabel = t({
    id: "editor.assignLoop.keyGrid.layerSelector.ariaLabel",
    message: "Layers",
  });

  const { groups, flatLayerIds } = useMemo(
    () => buildDisplayGroups(layerIds, baseGroupHeading, freeformGroupHeading),
    [layerIds, baseGroupHeading, freeformGroupHeading],
  );

  if (flatLayerIds.length === 0) return null;

  /** The visible+accessible per-option text: `<layerId>` plus a real-text, worded finding-count clause when non-zero — see this file's module doc, "Counts". */
  function describeOption(layerId: string): { visibleCount: string | undefined; accessibleName: string } {
    const count = findingCountsByLayerId.get(layerId) ?? 0;
    const baseName = t({
      id: "editor.assignLoop.keyGrid.layerSelector.optionLabel",
      message: `Layer ${{ layerId }}`,
    });
    if (count <= 0) return { visibleCount: undefined, accessibleName: baseName };

    const countClause = t({
      id: "editor.assignLoop.keyGrid.layerSelector.optionFindingCount",
      message: plural(count, { one: "# finding", other: "# findings" }),
    });
    return {
      visibleCount: String(count),
      accessibleName: `${baseName} — ${countClause}`,
    };
  }

  // ---------------------------------------------------------------------
  // Exactly one layer: a label, never a control (see module doc).
  // ---------------------------------------------------------------------
  if (flatLayerIds.length === 1) {
    const onlyLayerId = flatLayerIds[0];
    // Unreachable in practice (length === 1 guarantees index 0 exists), kept
    // only to satisfy `noUncheckedIndexedAccess` without an `as` cast.
    if (onlyLayerId === undefined) return null;
    const { visibleCount, accessibleName } = describeOption(onlyLayerId);
    const group = groups.find((g) => g.layerIds.includes(onlyLayerId));

    return (
      <div
        data-testid="key-layer-selector"
        aria-label={label ?? defaultAriaLabel}
        style={{ fontFamily: FONT }}
      >
        {group !== undefined && (
          <div data-testid={`key-layer-selector-group-${group.planeSegment}`}>
            <span
              data-testid={`key-layer-selector-option-${onlyLayerId}`}
              aria-label={accessibleName}
              style={{ fontSize: 12, color: TEXT_MAIN }}
            >
              {onlyLayerId}
              {visibleCount !== undefined && (
                <span
                  data-testid={`key-layer-selector-count-${onlyLayerId}`}
                  style={{ marginLeft: 6, fontSize: 11, color: TEXT_DIM }}
                >
                  {visibleCount}
                </span>
              )}
            </span>
          </div>
        )}
      </div>
    );
  }

  // ---------------------------------------------------------------------
  // Two or more layers: one tablist, ARIA APG tabs pattern, automatic
  // activation — mirrors KeyGrid.tsx's `handlePlatformTabsKeyDown` exactly
  // (see module doc, "The >=2 / exactly-1 split").
  // ---------------------------------------------------------------------
  const handleTablistKeyDown: KeyboardEventHandler<HTMLDivElement> = (e) => {
    const activeIndex = flatLayerIds.indexOf(activeLayerId);
    let nextIndex: number;
    switch (e.key) {
      case "ArrowRight":
        nextIndex = activeIndex === -1 ? 0 : (activeIndex + 1) % flatLayerIds.length;
        break;
      case "ArrowLeft":
        nextIndex =
          activeIndex === -1
            ? 0
            : (activeIndex - 1 + flatLayerIds.length) % flatLayerIds.length;
        break;
      case "Home":
        nextIndex = 0;
        break;
      case "End":
        nextIndex = flatLayerIds.length - 1;
        break;
      default:
        return;
    }
    e.preventDefault();
    const next = flatLayerIds[nextIndex];
    if (next === undefined) return;
    onSelectLayer(next);
    tabRefs.current.get(next)?.focus();
  };

  return (
    // eslint-disable-next-line jsx-a11y/interactive-supports-focus -- the same roving-tabindex model KeyGrid.tsx's own platform tablist documents: DOM focus lives on the individual `role="tab"` buttons (each carrying its own managed tabIndex, 0 for the active layer and -1 for the rest), never on this container, so it intentionally has no tabIndex. Giving the container one would add a second Tab stop for a single control.
    <div
      role="tablist"
      aria-label={label ?? defaultAriaLabel}
      data-testid="key-layer-selector"
      onKeyDown={handleTablistKeyDown}
      // Groups flow INLINE, wrapping only when the row genuinely runs out of
      // width: "Base" and "Other layers" are usually two or three chips each,
      // and a block apiece spent a whole line on a handful of buttons,
      // pushing the grid itself further down a pane that already scrolls.
      // Each group keeps its own heading immediately before its chips, so
      // wrapping never separates a heading from what it names.
      style={{
        display: "flex",
        flexWrap: "wrap",
        alignItems: "center",
        columnGap: 16,
        rowGap: 8,
        fontFamily: FONT,
      }}
    >
      {groups.map((group) => (
        <div
          key={group.planeSegment}
          data-testid={`key-layer-selector-group-${group.planeSegment}`}
          style={{ display: "flex", flexWrap: "wrap", alignItems: "center", gap: 6 }}
        >
          <div style={{ fontSize: 10, color: TEXT_DIM }}>{group.headingText}</div>
          <div style={{ display: "flex", flexWrap: "wrap", gap: 4 }}>
            {group.layerIds.map((layerId) => {
              const isActive = layerId === activeLayerId;
              const { visibleCount, accessibleName } = describeOption(layerId);
              return (
                <button
                  key={layerId}
                  type="button"
                  role="tab"
                  ref={(el) => {
                    if (el) tabRefs.current.set(layerId, el);
                    else tabRefs.current.delete(layerId);
                  }}
                  aria-selected={isActive}
                  aria-label={accessibleName}
                  tabIndex={isActive ? 0 : -1}
                  data-testid={`key-layer-selector-option-${layerId}`}
                  onClick={() => onSelectLayer(layerId)}
                  style={{
                    padding: "5px 10px",
                    background: isActive ? "#0d2840" : "transparent",
                    border: `1px solid ${isActive ? ACCENT : BORDER}`,
                    borderRadius: 6,
                    color: isActive ? TEXT_MAIN : TEXT_DIM,
                    fontSize: 12,
                    fontWeight: isActive ? 600 : 400,
                    cursor: "pointer",
                    fontFamily: FONT,
                    display: "flex",
                    alignItems: "center",
                    gap: 6,
                  }}
                >
                  {layerId}
                  {visibleCount !== undefined && (
                    <span
                      data-testid={`key-layer-selector-count-${layerId}`}
                      style={{ fontSize: 10, color: TEXT_DIM }}
                    >
                      {visibleCount}
                    </span>
                  )}
                </button>
              );
            })}
          </div>
        </div>
      ))}
    </div>
  );
}

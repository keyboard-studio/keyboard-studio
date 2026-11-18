// touchPlatformCoverage — touch coverage judged per platform, not pooled.
//
// `touchCoverage` (engine) unions every platform's keys before it asks whether
// a character is reachable, so a letter on the tablet layout alone counts as
// placed even though nothing on the phone layout types it. The touch step's
// worklist needs the stricter question — "which platforms still lack this
// letter?" — so this module asks `touchCoverage` once per platform, over a
// one-platform projection of the layout. It never computes coverage itself:
// the engine wrapper stays the one production model (spec 104 T025).
//
// The `KM_LINT_TOUCH_UNCOVERED` lint and the export coverage gate keep the
// pooled meaning; only the touch step's own figures move to this one.
//
// It is also stricter than the export gate about the desktop: the export gate
// passes `touchCoverage` the desktop's produced set, crediting letters the
// desktop types; nothing here does. A letter, or the mark it is built from,
// counts on a platform only when that platform's own keys reach it — directly
// or through a .kmn rule a touch key fires (the rule index in `options`).
// Export keeps the lenient credit: it is a hard gate with no "mark for later",
// and a keyboard opened for update often ships a touch layout that lacks
// letters its desktop types.

import type { I18n } from "@lingui/core";
import { msg } from "@lingui/core/macro";
import type { TouchCoverageOptions, TouchLayoutIR } from "@keyboard-studio/contracts";
import { touchCoverage } from "@keyboard-studio/engine";
import { resolveMessage } from "../../lib/i18nResolve.ts";

/** The platforms whose coverage the touch step tracks: tablet and phone where the layout has them, else whatever it has. */
export function coveragePlatformIds(layout: TouchLayoutIR): readonly string[] {
  const ids = layout.platforms.map((p) => p.id);
  const touch = ids.filter((id) => id === "tablet" || id === "phone");
  return touch.length > 0 ? touch : ids;
}

/** `layout` cut down to the one platform `platformId`. */
export function projectToPlatform(layout: TouchLayoutIR, platformId: string): TouchLayoutIR {
  return { ...layout, platforms: layout.platforms.filter((p) => p.id === platformId) };
}

export interface TouchPlatformCoverage {
  /** Inventory characters missing on at least one tracked platform, in inventory order. */
  readonly uncovered: readonly string[];
  /** Per tracked platform, the inventory characters nothing on it types, in inventory order. */
  readonly byPlatform: ReadonlyMap<string, readonly string[]>;
}

/**
 * `touchCoverage` run per tracked platform (see {@link coveragePlatformIds}).
 * `refine` post-processes each platform's own uncovered list (e.g. mark credit,
 * which depends on what that platform covers) before the lists are combined.
 * A layout with no platforms leaves every inventory character uncovered.
 */
export function touchCoverageByPlatform(
  layout: TouchLayoutIR,
  inventory: readonly string[],
  options: TouchCoverageOptions = {},
  refine?: (uncovered: readonly string[]) => readonly string[],
): TouchPlatformCoverage {
  const byPlatform = new Map<string, readonly string[]>();
  const missing = new Set<string>();
  const platformIds = coveragePlatformIds(layout);
  if (platformIds.length === 0) return { uncovered: [...inventory], byPlatform };
  for (const id of platformIds) {
    const { uncovered } = touchCoverage(projectToPlatform(layout, id), inventory, options);
    const list = refine !== undefined ? refine(uncovered) : uncovered;
    byPlatform.set(id, list);
    for (const ch of list) missing.add(ch);
  }
  return { uncovered: inventory.filter((ch) => missing.has(ch)), byPlatform };
}

/** Localized label for a `.keyman-touch-layout` platform id (T072's key-mode
 * platform tabs, and the per-platform coverage messages). Takes an optional
 * i18n + resolves via msg()/resolveMessage() — see TouchGallery's
 * touchMechanismLabel doc comment for why a bare `t` parameter would break
 * Lingui's static extraction here. */
export function touchModePlatformLabel(id: string, i18n?: I18n): string {
  if (id === "phone") {
    return resolveMessage(
      i18n,
      msg({ id: "editor.assignLoop.touch.keyMode.platform.phone", message: "Phone" }),
    );
  }
  if (id === "tablet") {
    return resolveMessage(
      i18n,
      msg({ id: "editor.assignLoop.touch.keyMode.platform.tablet", message: "Tablet" }),
    );
  }
  if (id === "desktop") {
    return resolveMessage(
      i18n,
      msg({
        id: "editor.assignLoop.touch.keyMode.platform.desktop",
        message: "Desktop touch",
      }),
    );
  }
  return id;
}

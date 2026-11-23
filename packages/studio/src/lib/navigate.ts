// Centralised hash-based navigation helper.
//
// All route changes must go through navigateTo() — do not assign
// window.location.hash directly in component files.
// Intra-wizard stage transitions (survey → carve → B → mechanisms → F) use
// callback props (onComplete / onBack) — navigateTo is for top-level route changes only.
//
// Spec 057 FR-006: this stays the ONE router. The `Location` overload below
// widens what a caller can address (route, step, question — see lib/location.ts)
// without introducing a second writer of `window.location.hash`.

import { formatLocation, type Location, type RouteId } from "./location.ts";
import { noteAccepted, runGuardedNavigation } from "./navigationGuard.ts";

// `RouteId` now lives in lib/location.ts — the route token set is part of the
// hash grammar, and defining it there is what keeps these two modules from
// importing each other. Re-exported so every existing
// `import { RouteId } from "./navigate.ts"` compiles unchanged.
export type { RouteId };

/** Existing signature — every current call site keeps compiling unchanged. */
export function navigateTo(route: RouteId): void;
/** Widened overload: navigate to a step or a question, not just a tab (FR-010). */
export function navigateTo(location: Location): void;
export function navigateTo(target: RouteId | Location): void {
  // A bare RouteId formats to the same hash it always did, so a route-only
  // navigation is byte-identical to the pre-widening behaviour when nothing is unapplied.
  runGuardedNavigation(() => {
    const hash = typeof target === "string" ? target : formatLocation(target).slice(1);
    // Accepted before the write, so the hashchange it causes is not read as the browser's Back.
    noteAccepted(hash.startsWith("#") ? hash : `#${hash}`);
    window.location.hash = hash;
  });
}

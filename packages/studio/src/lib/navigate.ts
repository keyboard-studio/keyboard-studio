// Centralised hash-based navigation helper.
//
// All route changes must go through navigateTo() — do not assign
// window.location.hash directly in component files.

export type RouteId =
  | 'pick-base'
  | 'survey'
  | 'gallery'
  | 'mechanisms'
  // touch — §8 "Gallery instantiation": the touch layout gallery is derived
  // from the locked desktop layout. Gated: requires desktopLocked === true.
  // The full touch gallery is not yet built (unit 3d); this route holds the
  // gating seam and the mount point for that future work.
  | 'touch'
  | 'preview'
  | 'output';

export function navigateTo(route: RouteId): void {
  window.location.hash = route;
}

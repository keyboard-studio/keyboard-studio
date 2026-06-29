// Centralised hash-based navigation helper.
//
// All route changes must go through navigateTo() — do not assign
// window.location.hash directly in component files.
// Intra-wizard stage transitions (survey → carve → B → mechanisms → F) use
// callback props (onComplete / onBack) — navigateTo is for top-level route changes only.

export type RouteId =
  | 'welcome'
  | 'survey'
  | 'preview'
  | 'output'
  | 'flowmap'
  | 'profile';

export function navigateTo(route: RouteId): void {
  window.location.hash = route;
}

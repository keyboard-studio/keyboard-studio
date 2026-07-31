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
  // The decision trail (specs/053-decision-audit). Unconditionally valid, unlike
  // 'flowmap': FR-017 makes it a PRODUCTION surface — an author reviewing what
  // their own decisions did to their keyboard is the feature, not a developer aid
  // — so it must never sit behind the dev gate in StudioShell's VALID_ROUTES.
  | 'trail'
  | 'profile';

export function navigateTo(route: RouteId): void {
  window.location.hash = route;
}

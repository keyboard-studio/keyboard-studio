// Shared release/ corpus-scope matcher (spec.md §8 step 1).
//
// `keymanapp/keyboards` scopes one keyboard package per `<id>` directory under
// `release/<vendor>/<id>/`. The package's `.kps` basename must equal the `<id>`
// directory name — that discipline is what both regexes below enforce via a
// `\1` back-reference.
//
// Two layouts exist in the live corpus:
//   - Keyman 17+ "project format" (current default, 918/918 packages as of
//     the #1125 audit): the package nests under a `source/` subfolder —
//     `release/<vendor>/<id>/source/<id>.kps`.
//   - Legacy flat-root layout (a residual handful of keyboards): the `.kps`
//     sits directly in the `<id>` folder — `release/<vendor>/<id>/<id>.kps`.
//
// Callers that don't reconcile both layouts silently match zero (or a strict
// subset of) keyboards depending on which layout the corpus favors at the
// time — this happened to base-browser when the corpus migrated to `source/`
// (#1125). `matchKeyboardScopePath` is the single place both layouts are
// tried, so base-browser (remote GitHub git-tree paths) and
// utilities/facet-index (local-checkout relative paths) can't diverge again
// (#1126) — both consumers match the same `release/<vendor>/<id>/[source/]<id>.kps`
// path-string shape, only the path source (remote tree listing vs. local
// filesystem walk) differs.

/** Keyman 17+ project-format layout: `release/<vendor>/<id>/source/<id>.kps`. */
export const KPS_SCOPE_RE_SOURCE = /^release\/[^/]+\/([^/]+)\/source\/\1\.kps$/;

/** Legacy flat-root layout: `release/<vendor>/<id>/<id>.kps` (no `source/` segment). */
export const KPS_SCOPE_RE_ROOT = /^release\/[^/]+\/([^/]+)\/\1\.kps$/;

/** Result of a successful {@link matchKeyboardScopePath} match. */
export interface KeyboardScopeMatch {
  /** The keyboard id — the `<id>` path segment, equal to the `.kps` basename. */
  id: string;
}

/**
 * Match a `release/`-relative path against both known corpus layouts —
 * `source/` (current) first, then flat-root (legacy) — and return the
 * extracted keyboard id, or null if the path matches neither.
 *
 * Accepts any `release/`-relative path string: a GitHub recursive git-tree
 * entry path or a local-checkout relative path both take this same shape.
 */
export function matchKeyboardScopePath(path: string): KeyboardScopeMatch | null {
  const sourceMatch = KPS_SCOPE_RE_SOURCE.exec(path);
  if (sourceMatch?.[1] !== undefined) return { id: sourceMatch[1] };

  const rootMatch = KPS_SCOPE_RE_ROOT.exec(path);
  if (rootMatch?.[1] !== undefined) return { id: rootMatch[1] };

  return null;
}

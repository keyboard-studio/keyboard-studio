// location — the hash grammar (spec 057 FR-010, FR-011).
//
// One addressable model for "where the author is", finer-grained than a tab:
//
//   hash     := "#" route [ "/" step [ "/" question ] ]
//   route    := an existing RouteId — the token set is UNCHANGED
//   step     := an ActiveStepId
//   question := a questionRegistry id
//
// The `preview` route token stays `preview` even though FR-020 renames the tab
// the author sees to "Compare". Renaming the token would break every bookmark
// and every e2e hash assertion for no requirement's sake; FR-026's sweep
// covers labels, aria names, headings, message ids, tests and docs, not the
// route token (see contracts/location-grammar.md §1).
//
// Parsing is deliberately SHALLOW: it validates the shape and the character
// class, never whether the step or question exists in this build. That is
// resolveLocation.ts's job, because that is where FR-013's stated reason has
// to be produced — a parse that silently dropped an unknown step would leave
// nothing to explain.
//
// This module owns no browser state. navigate.ts remains the only writer of
// `window.location.hash` (FR-006).

import type { ActiveStepId } from "../stores/surveySessionStore.ts";

/**
 * The seven top-level routes.
 *
 * Defined HERE rather than in navigate.ts because the route token set is part
 * of the grammar this module owns — `parseLocation` has to know which tokens
 * are routes. `navigate.ts` re-exports it, so every existing
 * `import { RouteId } from "./navigate.ts"` keeps working and no call site
 * moves.
 *
 * `preview` is retained deliberately: FR-020 renames the tab the author sees
 * to "Compare", not the route token (contract §1).
 */
export type RouteId =
  | "welcome"
  | "survey"
  | "preview"
  | "output"
  | "flowmap"
  // The decision trail (specs/053-decision-audit). Unconditionally valid,
  // unlike 'flowmap': FR-017 makes it a PRODUCTION surface — an author
  // reviewing what their own decisions did to their keyboard is the feature,
  // not a developer aid — so it must never sit behind the dev gate in
  // StudioShell's VALID_ROUTES.
  | "trail"
  | "profile";

/**
 * Where the author is. Immutable — `jumpToLocation` produces a new one;
 * nothing mutates one in place.
 */
export interface Location {
  readonly route: RouteId;
  /** Only meaningful when `route === "survey"`. Absent means "wherever the walk is". */
  readonly step?: ActiveStepId;
  /** A questionRegistry id. Requires `step`; a bare question is a parse failure. */
  readonly question?: string;
}

/**
 * The character class every manifest step id and questionRegistry id is drawn
 * from. Because no reserved character can occur, segments are not
 * URL-encoded — a segment outside this class is a parse failure rather than a
 * decoded value (contract §1).
 */
const SEGMENT = /^[a-z0-9_]+$/;

/**
 * The route tokens the grammar accepts. This is the full `RouteId` union, NOT
 * `StudioShell`'s dev-gated `VALID_ROUTES`: whether `flowmap` is reachable in
 * this build is a routing decision, not a grammar one, and keeping the two
 * separate means a parse failure always means "malformed", never "gated off".
 */
const ROUTES: ReadonlySet<RouteId> = new Set<RouteId>([
  "welcome",
  "survey",
  "preview",
  "output",
  "flowmap",
  "trail",
  "profile",
]);

/**
 * Parse a raw hash, with or without the leading `#`.
 *
 * Returns `null` on any parse failure: a trailing slash, an empty segment, a
 * `question` without a `step`, more than three segments, an unknown route
 * token, or a segment outside `[a-z0-9_]`.
 */
export function parseLocation(hash: string): Location | null {
  const raw = hash.startsWith("#") ? hash.slice(1) : hash;
  if (raw === "") return null;

  const segments = raw.split("/");
  if (segments.length > 3) return null;
  // Catches both the trailing slash ("#survey/") and the empty middle
  // segment ("#survey//q") — split leaves an empty string for each.
  if (segments.some((s) => s === "")) return null;

  const [route, step, question] = segments as [string, string?, string?];
  if (!ROUTES.has(route as RouteId)) return null;
  if (step !== undefined && !SEGMENT.test(step)) return null;
  if (question !== undefined && !SEGMENT.test(question)) return null;

  return {
    route: route as RouteId,
    ...(step !== undefined ? { step: step as ActiveStepId } : {}),
    ...(question !== undefined ? { question } : {}),
  };
}

/**
 * Format a `Location` as a hash INCLUDING the leading `#`.
 *
 * A `question` without a `step` cannot be expressed, so it is dropped rather
 * than emitted as an unparseable hash — that keeps the round-trip total for
 * every value `parseLocation` can produce.
 */
export function formatLocation(loc: Location): string {
  if (loc.step === undefined) return `#${loc.route}`;
  if (loc.question === undefined) return `#${loc.route}/${loc.step}`;
  return `#${loc.route}/${loc.step}/${loc.question}`;
}

/** Structural equality — locations are compared by value, never by identity. */
export function locationsEqual(a: Location, b: Location): boolean {
  return a.route === b.route && a.step === b.step && a.question === b.question;
}

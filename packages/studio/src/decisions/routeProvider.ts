// routeProvider: the author's current route, for the route-aware lint fallback (spec 108 FR-015).
//
// The route is derived from the step manifest's gates, but the consumers (the Output screen,
// the validator hook) sit upstream of the manifest's evaluation, so they must not import it:
// that closes the registry init cycle. The manifest registers its provider here when it is
// evaluated instead. Before that, and in any test that never loads the manifest, there is no
// route, and every step counts as present (the behaviour before routes were consulted).

import type { DecisionSet } from "./decisionTypes.ts";

type RouteProvider = (decisions: DecisionSet) => ReadonlySet<string>;

let provider: RouteProvider | null = null;

/** Called once by steps/manifest.ts, which owns the gates. */
export function registerRouteProvider(next: RouteProvider): void {
  provider = next;
}

/** The current route, or undefined when no manifest has registered one. */
export function routeStepIdsOf(decisions: DecisionSet): ReadonlySet<string> | undefined {
  return provider === null ? undefined : provider(decisions);
}

// derivedViews — the derived screen views of the live registry.
//
// Split out of steps/manifest.ts (spec 113): `derivedScreens`, `screenGates`
// and `screenTrails` are computed from the decision registry alone — they
// never touch the step pool — but they lived in the same module as `manifest`,
// whose pool imports the step hosts (steps/registerEditorSteps.ts). Any
// component the hosts import that reads one of these views therefore closed
// a module cycle back into the manifest (depcruise `no-circular`): the Trial
// and Publish hosts import the Output-screen family (TestBuildPanel,
// TesterReports, OutputSectionList, OutputGateBanners, PublishHandover,
// DocumentationChecklist), which navigate through lib/jumpToLocation.ts and
// order through decisions/stageGroups.ts, both of which read these views.
//
// This module sits BELOW the manifest: it may import the decision registry,
// the derivation, and the route provider — never the step pool, the step
// hosts, or anything that imports them. steps/manifest.ts re-exports these
// three views, so existing importers are untouched; the cycle participants
// (lib/jumpToLocation.ts, decisions/stageGroups.ts,
// components/OutputSectionList.tsx) import from here instead.

import { deriveScreens, type DerivedScreen } from "../decisions/deriveScreens.ts";
import type { DecisionSet } from "../decisions/decisionTypes.ts";
import type { StepTrail } from "../decisions/orderDecisions.ts";
import { registerRouteProvider } from "../decisions/routeProvider.ts";
import {
  decisionModules,
  declaredScreenGates,
  openScreenGates,
} from "../survey/questions/registry.ts";

/**
 * The derived screens of the live registry, computed once (spec 091).
 * The manifest is arranged by these screens; the gate and trail
 * views below are published from the same derivation so every consumer
 * reads one source.
 */
export const derivedScreens: readonly DerivedScreen[] = deriveScreens(
  decisionModules,
  declaredScreenGates,
);

/**
 * The manifest's step ids in derived order, terminal "package" included —
 * the same id set (and order) as `manifest` itself, without the step hosts.
 * `buildManifest` arranges the pool by exactly this list. Consumers that
 * need membership only (lib/resolveLocation.ts, decisions/stageGroups.ts,
 * components/OutputSectionList.tsx) read this instead of the manifest, so
 * they stay below the step-pool layer and cannot cycle back into it.
 */
export const manifestStepIds: readonly string[] = [
  ...derivedScreens.map((s) => s.id),
  "package",
];

/**
 * Derived screen gates by screen id (spec 091 T015): present only for a
 * screen whose every member decision is gated. Steps no longer carry
 * `gatedBy` (T014) — gate reads (steps/advance.ts, lib/resolveLocation.ts
 * via its ResolveContext) come from here.
 */
export const screenGates: ReadonlyMap<string, (decisions: DecisionSet) => boolean> =
  new Map([
    ...derivedScreens.flatMap((s) =>
      s.gatedBy !== undefined ? [[s.id, s.gatedBy] as const] : [],
    ),
    // Spec 111: the screens Open hides gate the walk without leaving the spine.
    ...openScreenGates,
  ]);

// The author's current route for the lint fallback (spec 108 FR-015): a screen is on the route
// while its derived gate passes, and a screen with no gate always is. Registered here, not
// imported by the consumers, because they sit upstream of this module's evaluation.
registerRouteProvider((decisions) => {
  const route = new Set<string>();
  for (const { id } of derivedScreens) {
    const gate = screenGates.get(id);
    let on = true;
    if (gate !== undefined) {
      try {
        on = gate(decisions);
      } catch {
        on = true;
      }
    }
    if (on) route.add(id);
  }
  return route;
});

/**
 * Derived screen trails by screen id (spine membership + join target),
 * including the ruled terminal "package" screen (ungated spine). The
 * Flow Map and completeness checks read trails from here (spec 091 T014)
 * instead of re-deriving them from step declarations.
 */
export const screenTrails: ReadonlyMap<string, StepTrail> = new Map<string, StepTrail>([
  ...derivedScreens.map(
    (s) =>
      [
        s.id,
        s.joinTarget !== undefined
          ? { spine: s.spine, joinTarget: s.joinTarget }
          : { spine: s.spine },
      ] as const,
  ),
  ["package", { spine: true }],
]);

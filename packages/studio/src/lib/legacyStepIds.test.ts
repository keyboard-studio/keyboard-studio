// legacyStepIds.test — the SC-005 inventory (spec 091 T023).
//
// Every step id that existed on `main` at 18e63aa4 (the 18 ids inventoried
// in specs/091-derived-steps/research.md) must resolve — through the frozen
// legacy map and the deep-link resolver — to the derived screen that now
// holds that step's decisions. Ids are named literally here so a future
// rename or removal breaks this test loudly instead of stranding a
// pre-091 deep link or draft silently.

import { describe, it, expect } from "vitest";
import { LEGACY_STEP_ID_MAP, resolveLegacyStepId } from "../decisions/legacyStepIds.ts";
import { derivedScreens, manifest, screenGates } from "../steps/manifest.ts";
import { declaredScreenGates } from "../survey/questions/registry.ts";
import { stepDependencies } from "../steps/stepDependencies.ts";
import type { TraversalSnapshot } from "../stores/surveySessionStore.ts";
import type { Location } from "./location.ts";
import { resolveLocation, type ResolveContext } from "./resolveLocation.ts";

/** The 18 step ids on `main` at 18e63aa4 (research.md inventory). */
const MAIN_STEP_IDS_AT_18E63AA4 = [
  "identity",
  "layout",
  "choose_base",
  "track",
  "project_name",
  "characters",
  "marks",
  "punctuation",
  "invisibles",
  "convenience",
  "carve",
  "deadkeys",
  "rules",
  "mechanisms",
  "touch_seed_source",
  "touch",
  "help",
  "package",
] as const;

function traversalAllWalked(): TraversalSnapshot {
  return {
    activeStepId: "help",
    history: [...MAIN_STEP_IDS_AT_18E63AA4],
    visited: [...MAIN_STEP_IDS_AT_18E63AA4],
    selectedTrack: "copy",
  } as unknown as TraversalSnapshot;
}

/** A context in which the author has walked everything on the copy track. */
function ctxAllWalked(): ResolveContext {
  return {
    manifest,
    screenGates,
    questionRegistry: {},
    traversal: traversalAllWalked(),
    decisions: {
      "authoring-track": { id: "authoring-track", value: "copy", provenance: "asked" },
    },
    hasProject: true,
  };
}

describe("SC-005 inventory — every pre-091 step id resolves to its screen", () => {
  it("the frozen map covers exactly the 18 inventoried ids", () => {
    expect(Object.keys(LEGACY_STEP_ID_MAP).sort()).toEqual(
      [...MAIN_STEP_IDS_AT_18E63AA4].sort(),
    );
  });

  it("each id resolves to a derived screen (or the terminal package screen)", () => {
    const screenIds = new Set([
      ...derivedScreens.map((s) => s.id),
      "package",
    ]);
    for (const id of MAIN_STEP_IDS_AT_18E63AA4) {
      expect(screenIds.has(resolveLegacyStepId(id)), id).toBe(true);
    }
  });

  it("the resolved screen holds the decisions the step provided (stepDependencies oracle)", () => {
    // The oracle is the pre-091 declaration table (held for deletion at
    // T016); at the flip its provides lists are carried here as literals.
    const screenById = new Map(derivedScreens.map((s) => [s.id, s] as const));
    for (const id of MAIN_STEP_IDS_AT_18E63AA4) {
      if (id === "package") continue; // terminal screen: no decisions
      const screen = screenById.get(resolveLegacyStepId(id))!;
      expect(screen, id).toBeDefined();
      for (const decisionId of stepDependencies(id).provides) {
        expect(screen.decisionIds, `${id} -> ${screen.id}`).toContain(decisionId);
      }
    }
  });

  it("each id resolves through resolveLocation to a reachable location on that screen", () => {
    const ctx = ctxAllWalked();
    for (const id of MAIN_STEP_IDS_AT_18E63AA4) {
      const loc: Location = { route: "survey", step: id as never };
      const result = resolveLocation(loc, ctx);
      expect(result.kind, id).toBe("reachable");
      if (result.kind === "reachable") {
        expect(result.location.step, id).toBe(resolveLegacyStepId(id));
      }
    }
  });

  it("the declared screen gates cover the two gated legacy steps", () => {
    // project_name and touch_seed_source were the gated steps of the old
    // table; their gates survive as composition-layer declarations (P6).
    expect(declaredScreenGates.has(resolveLegacyStepId("project_name"))).toBe(true);
    expect(declaredScreenGates.has(resolveLegacyStepId("touch_seed_source"))).toBe(true);
  });

  it("done / unsupported pass through the map unchanged (terminals, not screens)", () => {
    expect(resolveLegacyStepId("done")).toBe("done");
    expect(resolveLegacyStepId("unsupported")).toBe("unsupported");
    expect(LEGACY_STEP_ID_MAP["done"]).toBeUndefined();
    expect(LEGACY_STEP_ID_MAP["unsupported"]).toBeUndefined();
  });
});

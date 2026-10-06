// decisionsFromTraversal.test — pins the shared step-gate decision set so that
// advance() and resolveLocation() cannot drift apart on the track gate, and so
// resolveLocation's deliberate omission of the touch seed stays observable.

import { describe, it, expect } from "vitest";
import { resolveLocation, type ResolveContext } from "../lib/resolveLocation.ts";
import type { TraversalSnapshot } from "../stores/surveySessionStore.ts";
import { advance, type AdvanceContext } from "./advance.ts";
import { decisionsFromTraversal } from "./decisionsFromTraversal.ts";
import { manifest } from "./manifest.ts";

function snapshot(partial: {
  activeStepId: string;
  history?: readonly string[];
  selectedTrack: "copy" | "adapt" | null;
  touchSeedSource?: string | null;
}): TraversalSnapshot {
  return {
    activeStepId: partial.activeStepId,
    history: partial.history ?? [],
    selectedTrack: partial.selectedTrack,
    touchSeedSource: partial.touchSeedSource ?? null,
  } as unknown as TraversalSnapshot;
}

function resolveCtx(traversal: TraversalSnapshot): ResolveContext {
  return { manifest, questionRegistry: {}, traversal, hasProject: true };
}

function advanceCtx(
  selectedTrack: "copy" | "adapt" | null,
  touchSeedSource: AdvanceContext["touchSeedSource"] = null,
): AdvanceContext {
  return { selectedTrack, identitySupported: true, touchSeedSource, allCharactersImplemented: true };
}

describe("decisionsFromTraversal", () => {
  it("records the track and the seed under their decision ids; omits absent ones", () => {
    expect(decisionsFromTraversal(null)).toEqual({});
    expect(Object.keys(decisionsFromTraversal("copy"))).toEqual(["authoring-track"]);
    expect(Object.keys(decisionsFromTraversal("adapt", "import-adapt")).sort()).toEqual([
      "authoring-track",
      "touch-seed-source",
    ]);
    expect(decisionsFromTraversal(null, null)).toEqual({});
  });
});

describe("step gates share one decision set", () => {
  it("touch_seed_source stays reachable via resolveLocation when a seed is already set", () => {
    const traversal = snapshot({
      activeStepId: "touch",
      history: ["identity", "choose_base", "track", "mechanisms", "touch_seed_source"],
      selectedTrack: "adapt",
      touchSeedSource: "import-adapt",
    });
    expect(
      resolveLocation({ route: "survey", step: "touch_seed_source" }, resolveCtx(traversal)).kind,
    ).toBe("reachable");
    // ...while advance() with the same seed skips the chooser.
    expect(advance("mechanisms", undefined, advanceCtx("adapt", "import-adapt")).next).toBe("touch");
  });

  it("project_name with a null track: gate closed in both, no crash", () => {
    const traversal = snapshot({
      activeStepId: "track",
      history: ["identity", "choose_base"],
      selectedTrack: null,
    });
    const result = resolveLocation({ route: "survey", step: "project_name" }, resolveCtx(traversal));
    expect(result.kind).toBe("degraded");
    const gate = manifest.find((s) => s.id === "project_name")?.gatedBy;
    expect(gate?.(decisionsFromTraversal(null))).toBe(false);
  });

  it.each(["copy", "adapt"] as const)(
    "advance and resolveLocation agree on the project_name track gate (%s)",
    (track) => {
      const advanceWalksIt = advance("track", undefined, advanceCtx(track)).next === "project_name";
      const traversal = snapshot({
        activeStepId: "project_name",
        history: ["identity", "choose_base", "track"],
        selectedTrack: track,
      });
      const resolved = resolveLocation({ route: "survey", step: "project_name" }, resolveCtx(traversal));
      expect(advanceWalksIt).toBe(track === "copy");
      expect(resolved.kind === "reachable").toBe(advanceWalksIt);
    },
  );
});

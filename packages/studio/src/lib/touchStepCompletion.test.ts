// FR-040 unit tests for the rules lifted out of AddTouchAdapter and
// TouchSeedSourcePanel into touchStepCompletion.ts (spec 107).

import { beforeEach, describe, expect, it } from "vitest";
import type { SurveyPhaseResult } from "@keyboard-studio/contracts";
import { irGroup, makeTestIR, vkeyRule } from "@keyboard-studio/contracts/fixtures";
import { useDecisionStore } from "../stores/decisionStore.ts";
import { bindManifest, useWorkingCopyStore } from "../stores/workingCopyStore.ts";
import type { EditorStep, Step } from "../steps/types.ts";
import { completeTouchStep, touchDesktopModifications } from "./touchStepCompletion.ts";
import type { TouchCompleteResult } from "./assignLoopCompletion.ts";

const NO_IDS: ReadonlySet<string> = new Set();
const NO_PHASES: readonly SurveyPhaseResult[] = [];

/** A one-rule keyboard: K_A produces "a". */
function irProducingA() {
  return makeTestIR([
    irGroup({
      nodeId: "group:main",
      rules: [vkeyRule({ nodeId: "rule:a", vkey: "K_A", output: "a" })],
    }),
  ]);
}

// completeTouchStep ends in clearStale("touch"), which needs a bound manifest.
// Mirrors the deepLinkRevision fixture: "touch" is its own stale root.
const TOUCH_MANIFEST: readonly Step[] = [
  {
    kind: "editor-step",
    id: "touch",
    title: "touch",
    component: (() => null) as EditorStep["component"],
    inputs: [],
    writes: [],
  },
];

beforeEach(() => {
  bindManifest(TOUCH_MANIFEST);
  useWorkingCopyStore.getState().reset();
  useDecisionStore.getState().reset();
});

describe("touchDesktopModifications", () => {
  it("falls back to empty mods when there is no startIr", () => {
    const mods = touchDesktopModifications(null, new Set(["rule:a"]), NO_IDS, NO_PHASES, new Set(["a"]));
    expect(mods.removals).toHaveLength(0);
    expect(mods.placements).toHaveLength(0);
  });

  it("returns empty mods for an untouched keyboard", () => {
    const mods = touchDesktopModifications(irProducingA(), NO_IDS, NO_IDS, NO_PHASES, NO_IDS);
    expect(mods).toEqual({ removals: [], placements: [] });
  });

  it("derives a carve removal when the rule producing a character is deleted", () => {
    const mods = touchDesktopModifications(irProducingA(), new Set(["rule:a"]), NO_IDS, NO_PHASES, NO_IDS);
    expect(mods.removals).toContain("a");
    expect(mods.placements).toHaveLength(0);
  });
});

describe("completeTouchStep", () => {
  const emptyPayload: TouchCompleteResult = { assignments: [], startIr: null, startVfs: null };

  it("returns the payload it was given, unchanged", () => {
    expect(completeTouchStep(emptyPayload)).toBe(emptyPayload);
  });

  it("records touch-layout as an asked decision carrying the overlay snapshot", () => {
    useWorkingCopyStore.getState().deleteTouchKey("phone:default:K_Q");
    completeTouchStep(emptyPayload);

    const recorded = useDecisionStore.getState().decisions["touch-layout"];
    expect(recorded?.provenance).toBe("asked");
    expect(recorded?.value).toEqual({ ops: [], deletedTouchKeyIds: ["phone:default:K_Q"] });
  });

  it("records an empty snapshot when the overlay holds no edits", () => {
    completeTouchStep(emptyPayload);
    expect(useDecisionStore.getState().decisions["touch-layout"]?.value).toEqual({
      ops: [],
      deletedTouchKeyIds: [],
    });
  });

  it("fires the completion effects: no startIr clears the stored layout", () => {
    useWorkingCopyStore.getState().setTouchLayoutJson("{}");
    completeTouchStep(emptyPayload);
    expect(useWorkingCopyStore.getState().touchLayoutJson).toBeNull();
  });

  it("clears the touch stale flag", () => {
    useWorkingCopyStore.getState().markStale("touch");
    expect(useWorkingCopyStore.getState().staleSteps.has("touch")).toBe(true);
    completeTouchStep(emptyPayload);
    expect(useWorkingCopyStore.getState().staleSteps.has("touch")).toBe(false);
  });

  it("fires the completion effects: a reseed with a startIr stores a built layout", () => {
    completeTouchStep({
      assignments: [],
      startIr: irProducingA(),
      startVfs: null,
      mods: { removals: [], placements: [] },
      seedSource: "reseed-from-desktop",
    });
    const stored = useWorkingCopyStore.getState().touchLayoutJson;
    expect(stored).not.toBeNull();
    expect(typeof JSON.parse(stored!)).toBe("object");
  });
});

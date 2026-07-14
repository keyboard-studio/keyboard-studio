// advance.test.ts — unit tests for the pure advance policy (spec 028 T007).
//
// Covers every case in advance-and-stephost.contract.md §1:
//   - copy/adapt fork at "track"
//   - project_name → characters (joinTarget hop)
//   - identity supported/unsupported (terminal branch)
//   - help → done + navigate:"output"
//   - each spine hop (skipping spine:false steps)
//   - adapt-track skips project_name (US2)

import { describe, it, expect } from "vitest";
import { advance, nextSpineStepAfter, manifestIndexOf } from "./advance.ts";
import { manifest, validateManifestShape } from "./manifest.ts";

// ---------------------------------------------------------------------------
// walkSpine — drive advance() from "identity" to a terminal, collecting the
// full ordered sequence of steps the host would visit (the starting "identity"
// plus every `next` advance() returns). Used by the spec-034 SR-1/SR-2
// full-walk assertions below. Guarded against a non-terminating manifest.
// ---------------------------------------------------------------------------

type WalkStep =
  | "identity" | "choose_base" | "track" | "project_name" | "characters"
  | "carve" | "mechanisms" | "touch" | "help" | "done" | "unsupported";

function walkSpine(
  ctx: { selectedTrack: "copy" | "adapt" | null; identitySupported: boolean },
): { sequence: WalkStep[]; navigateAtEnd: "output" | undefined } {
  const sequence: WalkStep[] = ["identity"];
  let current: WalkStep = "identity";
  let navigateAtEnd: "output" | undefined;
  for (let guard = 0; guard < 50; guard++) {
    const outcome = advance(current, undefined, ctx);
    sequence.push(outcome.next as WalkStep);
    if (outcome.navigate !== undefined) navigateAtEnd = outcome.navigate;
    if (outcome.next === "done" || outcome.next === "unsupported") break;
    current = outcome.next as WalkStep;
  }
  return { sequence, navigateAtEnd };
}

// ---------------------------------------------------------------------------
// Context helpers
// ---------------------------------------------------------------------------

const copyCtx = { selectedTrack: "copy" as const, identitySupported: true, touchSeedSource: null };
const adaptCtx = { selectedTrack: "adapt" as const, identitySupported: true, touchSeedSource: null };
const unsupported = { selectedTrack: null, identitySupported: false, touchSeedSource: null };

// ---------------------------------------------------------------------------
// manifestIndexOf
// ---------------------------------------------------------------------------

describe("manifestIndexOf", () => {
  it("returns 0 for identity (first step)", () => {
    expect(manifestIndexOf("identity")).toBe(0);
  });

  it("returns -1 for an unknown id", () => {
    expect(manifestIndexOf("unknown_step")).toBe(-1);
  });

  it("returns a positive index for choose_base", () => {
    expect(manifestIndexOf("choose_base")).toBeGreaterThan(0);
  });
});

// ---------------------------------------------------------------------------
// nextSpineStepAfter
// ---------------------------------------------------------------------------

describe("nextSpineStepAfter", () => {
  it("identity → choose_base", () => {
    expect(nextSpineStepAfter("identity")).toBe("choose_base");
  });

  it("choose_base → track", () => {
    expect(nextSpineStepAfter("choose_base")).toBe("track");
  });

  it("track → characters (skips project_name which is spine:false)", () => {
    // project_name is spine:false so nextSpineStepAfter("track") skips it.
    expect(nextSpineStepAfter("track")).toBe("characters");
  });

  it("characters → carve", () => {
    expect(nextSpineStepAfter("characters")).toBe("carve");
  });

  it("carve → mechanisms", () => {
    expect(nextSpineStepAfter("carve")).toBe("mechanisms");
  });

  it("mechanisms → touch (skips touch_seed_source which is spine:false)", () => {
    // touch_seed_source is spine:false so nextSpineStepAfter("mechanisms") skips it.
    expect(nextSpineStepAfter("mechanisms")).toBe("touch");
  });

  it("touch → help", () => {
    expect(nextSpineStepAfter("touch")).toBe("help");
  });

  it("help → done (package is reserved)", () => {
    expect(nextSpineStepAfter("help")).toBe("done");
  });
});

// ---------------------------------------------------------------------------
// spec 034 T003 — full ordered spine walk (SR-1, SR-2) + manifest shape (SR-5)
//
// The individual-hop tests above pin each edge; these pin the WHOLE sequence
// advance() produces end-to-end, so a reorder of the tail (mechanisms -> touch
// -> help) or an accidental project_name fork change is caught as one failure.
// ---------------------------------------------------------------------------

describe("spec 034 SR-1/SR-2 — full spine walk via advance()", () => {
  it("SR-1/SR-2 copy track: identity -> choose_base -> track -> project_name -> characters -> carve -> mechanisms -> touch -> help -> done", () => {
    const { sequence, navigateAtEnd } = walkSpine(copyCtx);
    expect(sequence).toEqual([
      "identity", "choose_base", "track", "project_name", "characters",
      "carve", "mechanisms", "touch", "help", "done",
    ]);
    // "... -> done -> output": help -> done carries navigate:"output".
    expect(navigateAtEnd).toBe("output");
  });

  it("SR-2 adapt track: same spine but project_name is skipped", () => {
    const { sequence, navigateAtEnd } = walkSpine(adaptCtx);
    expect(sequence).toEqual([
      "identity", "choose_base", "track", "characters",
      "carve", "mechanisms", "touch", "help", "done",
    ]);
    expect(sequence).not.toContain("project_name");
    expect(navigateAtEnd).toBe("output");
  });

  it("SR-5: the physical -> touch -> docs tail is never reordered (touch after mechanisms, before help)", () => {
    const { sequence } = walkSpine(copyCtx);
    const mech = sequence.indexOf("mechanisms");
    const touch = sequence.indexOf("touch");
    const help = sequence.indexOf("help");
    expect(mech).toBeGreaterThan(-1);
    expect(touch).toBeGreaterThan(mech); // touch strictly after mechanisms
    expect(help).toBeGreaterThan(touch); // help (docs) strictly after touch
  });

  it("unsupported script terminates immediately at the unsupported terminal", () => {
    const { sequence } = walkSpine(unsupported);
    expect(sequence).toEqual(["identity", "unsupported"]);
  });
});

describe("spec 034 SR-3 — mechanisms advances to touch, never past it", () => {
  // lockDesktop() firing at mechanisms completion is covered by reducer.test.ts
  // R1; here we pin the advance half: mechanisms goes to touch and NOT beyond,
  // and touch is a genuinely-visited step (never skipped) that then reaches help.
  it("advance(mechanisms) is exactly 'touch' (not 'help'/'done' — touch is not skipped)", () => {
    const outcome = advance("mechanisms", undefined, copyCtx);
    expect(outcome.next).toBe("touch");
    expect(outcome.next).not.toBe("help");
    expect(outcome.next).not.toBe("done");
  });

  it("touch is reached and advances onward to help (never bypassed)", () => {
    expect(advance("touch", undefined, copyCtx).next).toBe("help");
    expect(walkSpine(copyCtx).sequence).toContain("touch");
    expect(walkSpine(adaptCtx).sequence).toContain("touch");
  });
});

describe("spec 034 SR-5 — validateManifestShape structural guard", () => {
  it("does not throw for the shipped manifest", () => {
    expect(() => validateManifestShape()).not.toThrow();
  });

  it("declares exactly one physical lock then one touch lock, in that order (M3 tail)", () => {
    const locks = manifest.filter((s) => s.lock !== undefined).map((s) => s.lock);
    expect(locks).toEqual(["physical", "touch"]);
  });

  it("spine ids (spine !== false) are in the locked order", () => {
    const spineIds = manifest.filter((s) => s.spine !== false).map((s) => s.id);
    expect(spineIds).toEqual([
      "identity", "choose_base", "track", "characters",
      "carve", "mechanisms", "touch", "help", "package",
    ]);
  });
});

// ---------------------------------------------------------------------------
// advance — identity step
// ---------------------------------------------------------------------------

describe("advance: identity", () => {
  it("supported → choose_base", () => {
    const { next, navigate } = advance("identity", undefined, copyCtx);
    expect(next).toBe("choose_base");
    expect(navigate).toBeUndefined();
  });

  it("unsupported script → unsupported terminal", () => {
    const { next } = advance("identity", undefined, unsupported);
    expect(next).toBe("unsupported");
  });

  it("does not carry setCharactersSubStage", () => {
    const outcome = advance("identity", undefined, copyCtx);
    expect(outcome.setCharactersSubStage).toBeUndefined();
  });
});

// ---------------------------------------------------------------------------
// advance — choose_base step
// ---------------------------------------------------------------------------

describe("advance: choose_base", () => {
  it("→ track (spine next after choose_base)", () => {
    const { next } = advance("choose_base", undefined, copyCtx);
    expect(next).toBe("track");
  });
});

// ---------------------------------------------------------------------------
// advance — track step (copy/adapt fork)
// ---------------------------------------------------------------------------

describe("advance: track — copy fork", () => {
  it("copy track → project_name (side-trail)", () => {
    const { next } = advance("track", undefined, copyCtx);
    expect(next).toBe("project_name");
  });

  it("copy track does NOT carry setCharactersSubStage", () => {
    const outcome = advance("track", undefined, copyCtx);
    expect(outcome.setCharactersSubStage).toBeUndefined();
  });
});

describe("advance: track — adapt fork (US2)", () => {
  it("adapt track → characters (skips project_name)", () => {
    const { next } = advance("track", undefined, adaptCtx);
    expect(next).toBe("characters");
  });

  it("adapt track carries setCharactersSubStage:'prefill'", () => {
    const outcome = advance("track", undefined, adaptCtx);
    expect(outcome.setCharactersSubStage).toBe("prefill");
  });
});

// ---------------------------------------------------------------------------
// advance — project_name step (joinTarget hop)
// ---------------------------------------------------------------------------

describe("advance: project_name", () => {
  it("→ characters (joinTarget)", () => {
    const { next } = advance("project_name", undefined, copyCtx);
    expect(next).toBe("characters");
  });

  it("carries setCharactersSubStage:'prefill'", () => {
    const outcome = advance("project_name", undefined, copyCtx);
    expect(outcome.setCharactersSubStage).toBe("prefill");
  });

  it("does not carry navigate", () => {
    const outcome = advance("project_name", undefined, copyCtx);
    expect(outcome.navigate).toBeUndefined();
  });
});

// ---------------------------------------------------------------------------
// advance — spine hops
// ---------------------------------------------------------------------------

describe("advance: spine hops", () => {
  it("characters → carve", () => {
    expect(advance("characters", undefined, copyCtx).next).toBe("carve");
  });

  it("carve → mechanisms", () => {
    expect(advance("carve", undefined, copyCtx).next).toBe("mechanisms");
  });

  it("mechanisms → touch_seed_source when no fork choice is recorded (spec 035 R4/R12)", () => {
    expect(advance("mechanisms", undefined, copyCtx).next).toBe("touch_seed_source");
  });

  it("mechanisms → touch directly when a fork choice IS recorded (spec 035 R12 fork memory)", () => {
    const withChoice = { ...copyCtx, touchSeedSource: "import-adapt" as const };
    expect(advance("mechanisms", undefined, withChoice).next).toBe("touch");
  });

  it("mechanisms → touch directly for the other recorded choice too", () => {
    const withChoice = { ...copyCtx, touchSeedSource: "reseed-from-desktop" as const };
    expect(advance("mechanisms", undefined, withChoice).next).toBe("touch");
  });

  it("touch_seed_source → touch (joinTarget hop, spec 035 R4)", () => {
    expect(advance("touch_seed_source", undefined, copyCtx).next).toBe("touch");
  });

  it("touch_seed_source → touch does NOT carry setCharactersSubStage or navigate", () => {
    const outcome = advance("touch_seed_source", undefined, copyCtx);
    expect(outcome.setCharactersSubStage).toBeUndefined();
    expect(outcome.navigate).toBeUndefined();
  });

  it("touch → help", () => {
    expect(advance("touch", undefined, copyCtx).next).toBe("help");
  });
});

// ---------------------------------------------------------------------------
// advance — help → done + navigate:"output"
// ---------------------------------------------------------------------------

describe("advance: help", () => {
  it("help → done terminal", () => {
    const { next } = advance("help", undefined, copyCtx);
    expect(next).toBe("done");
  });

  it("help carries navigate:'output'", () => {
    const { navigate } = advance("help", undefined, copyCtx);
    expect(navigate).toBe("output");
  });
});

// ---------------------------------------------------------------------------
// advance — terminals (idempotent)
// ---------------------------------------------------------------------------

describe("advance: terminals (idempotent, not called in practice)", () => {
  it("done → done", () => {
    expect(advance("done", undefined, copyCtx).next).toBe("done");
  });

  it("unsupported → unsupported", () => {
    expect(advance("unsupported", undefined, copyCtx).next).toBe("unsupported");
  });
});

// ---------------------------------------------------------------------------
// advance — track step: null selectedTrack recovery (P1-B invariant guard)
// ---------------------------------------------------------------------------

describe("advance: track — null selectedTrack recovery", () => {
  it("null selectedTrack defaults to copy path (project_name), not adapt", () => {
    // TrackStepAdapter must always set selectedTrack before onComplete; null here
    // is an invariant violation. The guard defaults to copy (project_name) — the
    // safer fork, as it does not skip a step.
    // Note: we do not assert console.error in this suite because vitest's spy
    // setup would require importing vi and mocking before the module loads;
    // the console.error call is documented in advance.ts and visible in test output.
    const outcome = advance("track", undefined, { selectedTrack: null, identitySupported: true });
    expect(outcome.next).toBe("project_name");
  });

  it("null selectedTrack recovery does NOT carry setCharactersSubStage", () => {
    const outcome = advance("track", undefined, { selectedTrack: null, identitySupported: true });
    expect(outcome.setCharactersSubStage).toBeUndefined();
  });
});

// ---------------------------------------------------------------------------
// nextSpineStepAfter — unknown id guard (P2-D)
// ---------------------------------------------------------------------------

describe("nextSpineStepAfter: unknown id", () => {
  it("returns 'done' for an unknown step id (not 'identity')", () => {
    // Before the guard, manifestIndexOf returned -1 causing the scan to start
    // at index 0 and return the first spine step. Now it returns "done".
    expect(nextSpineStepAfter("completely_unknown_step_id")).toBe("done");
  });
});

// ---------------------------------------------------------------------------
// Pure: result parameter is unused by branch logic
// ---------------------------------------------------------------------------

describe("advance: pure — result is ignored", () => {
  it("same outcome regardless of result value", () => {
    const a = advance("characters", { someData: true }, copyCtx);
    const b = advance("characters", null, copyCtx);
    const c = advance("characters", "string-result", copyCtx);
    expect(a.next).toBe(b.next);
    expect(b.next).toBe(c.next);
  });
});

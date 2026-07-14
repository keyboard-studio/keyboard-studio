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

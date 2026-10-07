// advance.test.ts — unit tests for the pure advance policy (spec 028 T007).
//
// Covers every case in advance-and-stephost.contract.md §1:
//   - copy/adapt fork at "track"
//   - project_name → characters (side-trail rejoin hop)
//   - identity supported/unsupported (terminal branch)
//   - help → done + navigate:"output"
//   - each spine hop (skipping side-trail steps)
//   - adapt-track skips project_name (US2)

import { describe, it, expect } from "vitest";
import { advance, nextMainLineStepAfter, manifestIndexOf } from "./advance.ts";
import { buildManifest, manifest, validateManifestShape } from "./manifest.ts";
import { STEP_TRAILS } from "./stepOrder.ts";
import { deriveScreens } from "../decisions/deriveScreens.ts";
import type { DecisionId } from "../decisions/decisionTypes.ts";
import {
  decisionModules,
  declaredScreenGates,
} from "../survey/questions/registry.ts";

// ---------------------------------------------------------------------------
// walkSpine — drive advance() from "identity" to a terminal, collecting the
// full ordered sequence of steps the host would visit (the starting "identity"
// plus every `next` advance() returns). Used by the spec-034 SR-1/SR-2
// full-walk assertions below. Guarded against a non-terminating manifest.
// ---------------------------------------------------------------------------

type WalkStep =
  | "identity" | "layout" | "choose_base" | "track" | "project_name" | "characters"
  | "carve" | "marks" | "punctuation" | "invisibles" | "convenience" | "mechanisms" | "touch_seed_source" | "touch" | "help" | "done" | "unsupported";

function walkSpine(
  ctx: { selectedTrack: "copy" | "adapt" | null; identitySupported: boolean },
): { sequence: WalkStep[]; navigateAtEnd: "output" | undefined } {
  // Spec 088 T020 (fixture construction only): the gate set is a DecisionSet
  // literal matching the context's track — advance() reads gates from it.
  const fullCtx = {
    ...ctx,
    touchSeedSource: null,
    allCharactersImplemented: true,
    decisions:
      ctx.selectedTrack === null
        ? {}
        : {
            "authoring-track": {
              id: "authoring-track" as const,
              value: ctx.selectedTrack,
              provenance: "asked" as const,
            },
          },
  };
  const sequence: WalkStep[] = ["identity"];
  let current: WalkStep = "identity";
  let navigateAtEnd: "output" | undefined;
  for (let guard = 0; guard < 50; guard++) {
    const outcome = advance(current, undefined, fullCtx);
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

// allCharactersImplemented: true — these contexts model the "everything is
// finished" success path for the full-walk assertions below; the Phase F
// hard-gate's own false-branch behavior is covered separately (see "advance:
// help — hard gate" below).
const copyCtx = {
  selectedTrack: "copy" as const, identitySupported: true, touchSeedSource: null, allCharactersImplemented: true,
  decisions: { "authoring-track": { id: "authoring-track" as const, value: "copy", provenance: "asked" as const } },
};
const adaptCtx = {
  selectedTrack: "adapt" as const, identitySupported: true, touchSeedSource: null, allCharactersImplemented: true,
  decisions: { "authoring-track": { id: "authoring-track" as const, value: "adapt", provenance: "asked" as const } },
};
const unsupported = { selectedTrack: null, identitySupported: false, touchSeedSource: null, allCharactersImplemented: true, decisions: {} };

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
// nextMainLineStepAfter
// ---------------------------------------------------------------------------

describe("nextMainLineStepAfter", () => {
  it("identity → layout (spec 076 A4: the community-layout step)", () => {
    expect(nextMainLineStepAfter("identity")).toBe("layout");
  });

  it("layout → choose_base", () => {
    expect(nextMainLineStepAfter("layout")).toBe("choose_base");
  });

  it("choose_base → track", () => {
    expect(nextMainLineStepAfter("choose_base")).toBe("track");
  });

  it("track → characters (skips project_name which is a derived side trail)", () => {
    // project_name is a derived side trail so nextMainLineStepAfter("track") skips it.
    expect(nextMainLineStepAfter("track")).toBe("characters");
  });

  it("characters → marks (spec 071)", () => {
    expect(nextMainLineStepAfter("characters")).toBe("marks");
  });

  it("marks → punctuation", () => {
    expect(nextMainLineStepAfter("marks")).toBe("punctuation");
  });

  it("punctuation → invisibles", () => {
    expect(nextMainLineStepAfter("punctuation")).toBe("invisibles");
  });

  it("invisibles → convenience", () => {
    expect(nextMainLineStepAfter("invisibles")).toBe("convenience");
  });

  it("convenience → carve", () => {
    expect(nextMainLineStepAfter("convenience")).toBe("carve");
  });

  it("carve → deadkeys (spec 083: Deadkeys step sits between carve and mechanisms)", () => {
    expect(nextMainLineStepAfter("carve")).toBe("deadkeys");
  });

  it("deadkeys → rules (spec 082: rules step follows deadkeys)", () => {
    expect(nextMainLineStepAfter("deadkeys")).toBe("rules");
  });

  it("rules → mechanisms", () => {
    expect(nextMainLineStepAfter("rules")).toBe("mechanisms");
  });

  it("mechanisms → touch (skips touch_seed_source which is a derived side trail)", () => {
    // touch_seed_source is a derived side trail so nextMainLineStepAfter("mechanisms") skips it.
    expect(nextMainLineStepAfter("mechanisms")).toBe("touch");
  });

  it("touch → help", () => {
    expect(nextMainLineStepAfter("touch")).toBe("help");
  });

  it("help → done (package is reserved)", () => {
    expect(nextMainLineStepAfter("help")).toBe("done");
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
  it("SR-1/SR-2 copy track: identity -> choose_base -> track -> project_name -> characters -> marks -> carve -> deadkeys -> rules -> mechanisms -> touch_seed_source -> touch -> help -> done", () => {
    const { sequence, navigateAtEnd } = walkSpine(copyCtx);
    // Spec 035 R4/R12: with no recorded fork choice (copyCtx.touchSeedSource === null),
    // mechanisms routes through the off-spine touch_seed_source fork before touch.
    expect(sequence).toEqual([
      "identity", "layout", "choose_base", "track", "project_name", "characters",
      "marks", "punctuation", "invisibles", "convenience", "carve", "deadkeys", "rules", "mechanisms", "touch_seed_source", "touch", "help", "done",
    ]);
    // "... -> done -> output": help -> done carries navigate:"output".
    expect(navigateAtEnd).toBe("output");
  });

  it("SR-2 adapt track: same spine but project_name is skipped", () => {
    const { sequence, navigateAtEnd } = walkSpine(adaptCtx);
    expect(sequence).toEqual([
      "identity", "layout", "choose_base", "track", "characters",
      "marks", "punctuation", "invisibles", "convenience", "carve", "deadkeys", "rules", "mechanisms", "touch_seed_source", "touch", "help", "done",
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
  // R1; here we pin the advance half: mechanisms enters the touch_seed_source
  // fork (spec 035 R4/R12) which joins straight to touch — touch is a
  // genuinely-visited step (never skipped past to help/done) that then
  // reaches help.
  it("advance(mechanisms) enters the touch_seed_source fork, never skipping touch to help/done", () => {
    const outcome = advance("mechanisms", undefined, copyCtx);
    expect(outcome.next).toBe("touch_seed_source");
    expect(outcome.next).not.toBe("help");
    expect(outcome.next).not.toBe("done");
    // The off-spine fork joins straight to touch — touch is still reached.
    expect(advance("touch_seed_source", undefined, copyCtx).next).toBe("touch");
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
    const spineIds = manifest.filter((s) => STEP_TRAILS.get(s.id)?.spine !== false).map((s) => s.id);
    expect(spineIds).toEqual([
      "identity", "layout", "choose_base", "track", "characters",
      "marks", "punctuation", "invisibles", "convenience", "carve", "deadkeys", "rules", "mechanisms", "touch", "help", "package",
    ]);
  });
});

// ---------------------------------------------------------------------------
// advance — identity step
// ---------------------------------------------------------------------------

describe("advance: identity", () => {
  it("supported → layout", () => {
    const { next, navigate } = advance("identity", undefined, copyCtx);
    expect(next).toBe("layout");
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

describe("advance: layout", () => {
  it("→ choose_base (spine next after layout)", () => {
    const { next } = advance("layout", undefined, copyCtx);
    expect(next).toBe("choose_base");
  });
});

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
// advance — project_name step (side-trail rejoin hop)
// ---------------------------------------------------------------------------

describe("advance: project_name", () => {
  it("→ characters (side-trail rejoin)", () => {
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
  it("characters → marks (spec 071)", () => {
    expect(advance("characters", undefined, copyCtx).next).toBe("marks");
  });

  it("marks → punctuation", () => {
    expect(advance("marks", undefined, copyCtx).next).toBe("punctuation");
  });

  it("punctuation → invisibles", () => {
    expect(advance("punctuation", undefined, copyCtx).next).toBe("invisibles");
  });

  it("invisibles → convenience", () => {
    expect(advance("invisibles", undefined, copyCtx).next).toBe("convenience");
  });

  it("convenience → carve", () => {
    expect(advance("convenience", undefined, copyCtx).next).toBe("carve");
  });

  it("carve → deadkeys (spec 083)", () => {
    expect(advance("carve", undefined, copyCtx).next).toBe("deadkeys");
  });

  it("deadkeys → rules (spec 082)", () => {
    expect(advance("deadkeys", undefined, copyCtx).next).toBe("rules");
  });

  it("rules → mechanisms", () => {
    expect(advance("rules", undefined, copyCtx).next).toBe("mechanisms");
  });

  it("mechanisms → touch_seed_source when no fork choice is recorded (spec 035 R4/R12)", () => {
    expect(advance("mechanisms", undefined, copyCtx).next).toBe("touch_seed_source");
  });

  it("mechanisms → touch directly when a fork choice IS recorded (spec 035 R12 fork memory)", () => {
    const withChoice = {
      ...copyCtx,
      touchSeedSource: "import-adapt" as const,
      decisions: {
        ...copyCtx.decisions,
        "touch-seed-source": { id: "touch-seed-source" as const, value: "import-adapt", provenance: "asked" as const },
      },
    };
    expect(advance("mechanisms", undefined, withChoice).next).toBe("touch");
  });

  it("mechanisms → touch directly for the other recorded choice too", () => {
    const withChoice = {
      ...copyCtx,
      touchSeedSource: "reseed-from-desktop" as const,
      decisions: {
        ...copyCtx.decisions,
        "touch-seed-source": { id: "touch-seed-source" as const, value: "reseed-from-desktop", provenance: "asked" as const },
      },
    };
    expect(advance("mechanisms", undefined, withChoice).next).toBe("touch");
  });

  it("touch_seed_source → touch (side-trail rejoin hop, spec 035 R4)", () => {
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
// advance — help: the Phase F hard gate (no "come back later" escape)
// ---------------------------------------------------------------------------

describe("advance: help — hard gate (allCharactersImplemented)", () => {
  it("stays on 'help' (no navigate) when allCharactersImplemented is false", () => {
    const blockedCtx = { ...copyCtx, allCharactersImplemented: false };
    const outcome = advance("help", undefined, blockedCtx);
    expect(outcome.next).toBe("help");
    expect(outcome.navigate).toBeUndefined();
  });

  it("advances to done + navigate:'output' once allCharactersImplemented flips true", () => {
    const readyCtx = { ...copyCtx, allCharactersImplemented: true };
    const outcome = advance("help", undefined, readyCtx);
    expect(outcome.next).toBe("done");
    expect(outcome.navigate).toBe("output");
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
// nextMainLineStepAfter — unknown id guard (P2-D)
// ---------------------------------------------------------------------------

describe("nextMainLineStepAfter: unknown id", () => {
  it("returns 'done' for an unknown step id (not 'identity')", () => {
    // Before the guard, manifestIndexOf returned -1 causing the scan to start
    // at index 0 and return the first spine step. Now it returns "done".
    expect(nextMainLineStepAfter("completely_unknown_step_id")).toBe("done");
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

// ---------------------------------------------------------------------------
// Spec 088 T020 (US2): routing reads the DecisionSet, not session fields.
// The contexts below deliberately carry selectedTrack/touchSeedSource values
// that DISAGREE with their `decisions` — the outcomes must follow the
// decisions, proving the gate no longer reads the fields.
// ---------------------------------------------------------------------------

describe("advance: gates read the DecisionSet (spec 088 T020)", () => {
  it("adapt in the DecisionSet skips project_name even when the field says copy", () => {
    const outcome = advance("track", undefined, {
      selectedTrack: "copy",
      identitySupported: true,
      touchSeedSource: null,
      allCharactersImplemented: true,
      decisions: {
        "authoring-track": { id: "authoring-track", value: "adapt", provenance: "asked" },
      },
    });
    expect(outcome.next).not.toBe("project_name");
  });

  it("a recorded touch-seed-source in the DecisionSet routes mechanisms straight to touch", () => {
    const outcome = advance("mechanisms", undefined, {
      selectedTrack: "copy",
      identitySupported: true,
      touchSeedSource: null,
      allCharactersImplemented: true,
      decisions: {
        "authoring-track": { id: "authoring-track", value: "copy", provenance: "asked" },
        "touch-seed-source": { id: "touch-seed-source", value: "import-adapt", provenance: "asked" },
      },
    });
    expect(outcome.next).toBe("touch");
  });

  it("no touch-seed-source record routes mechanisms to the seed chooser", () => {
    const outcome = advance("mechanisms", undefined, {
      selectedTrack: "copy",
      identitySupported: true,
      touchSeedSource: "import-adapt",
      allCharactersImplemented: true,
      decisions: {
        "authoring-track": { id: "authoring-track", value: "copy", provenance: "asked" },
      },
    });
    expect(outcome.next).toBe("touch_seed_source");
  });
});

// ---------------------------------------------------------------------------
// Spec 091 T021 (US3) — walk-level tests over derived screens.
//
// The split-run case exercises the T010 seam the host walks (buildManifest
// over a supplied module list): advance() itself is id-based over the live
// manifest, so the split is asserted on the built sequence and the derived
// screens' labels, and the gate cases are asserted through advance() on the
// live manifest.
// ---------------------------------------------------------------------------

describe("spec 091 T021 — derived screens in the walk", () => {
  // The SC-001 declaration edit (same as T009/T011): il_language_autonym
  // gains requires: ["base-keyboard"] and its `next` is re-pointed.
  const editedModules = decisionModules.map((m) =>
    m.definition.id === "il_language_autonym"
      ? {
          ...m,
          requires: [...(m.requires ?? []), "base-keyboard" as DecisionId],
          definition: { ...m.definition, next: null },
        }
      : m,
  );

  it("a split run yields two screens with the same group label, in derived order", () => {
    const screens = deriveScreens(editedModules, declaredScreenGates);
    const identityScreens = screens.filter((s) => s.id === "identity");
    expect(identityScreens).toHaveLength(2);
    // Same group label on both halves of the split run.
    expect(identityScreens.map((s) => s.group)).toEqual(["identity", "identity"]);
    // Derived order: first identity run, layout, choose_base, second run.
    const ids = screens.map((s) => s.id);
    const firstIdx = ids.indexOf("identity");
    const secondIdx = ids.lastIndexOf("identity");
    expect(ids.indexOf("layout")).toBeGreaterThan(firstIdx);
    expect(ids.indexOf("choose_base")).toBeGreaterThan(ids.indexOf("layout"));
    expect(secondIdx).toBeGreaterThan(ids.indexOf("choose_base"));

    // The manifest the host walks (T010 seam) carries the same sequence.
    const built = buildManifest(editedModules);
    expect(built.map((s) => s.id)).toEqual([...ids, "package"]);
    expect(built.filter((s) => s.id === "identity")).toHaveLength(2);
  });

  it("baseline contrast: the unedited registry walks a single identity screen", () => {
    const built = buildManifest(decisionModules);
    expect(built.filter((s) => s.id === "identity")).toHaveLength(1);
    expect(built.map((s) => s.id)).toEqual(manifest.map((s) => s.id));
  });

  it("a screen whose decisions are all gated off is skipped by advance (adapt skips project_name)", () => {
    const outcome = advance("track", undefined, adaptCtx);
    expect(outcome.next).toBe("characters");
  });

  it("the same screen is walked when its gate passes (copy walks project_name)", () => {
    const outcome = advance("track", undefined, copyCtx);
    expect(outcome.next).toBe("project_name");
    // And the walked side trail rejoins the spine at characters.
    expect(advance("project_name", undefined, copyCtx).next).toBe("characters");
  });

  it("a partially gated screen is walked: characters carries routing-gated questions but no screen gate", () => {
    // The characters screen has no entry in the derived screen gates (its
    // members' gates are per-question routing), so advance lands on it and
    // walks through it on BOTH tracks.
    expect(advance("track", undefined, adaptCtx).next).toBe("characters");
    expect(advance("characters", undefined, adaptCtx).next).toBe("marks");
    expect(advance("characters", undefined, copyCtx).next).toBe("marks");
  });

  it("the touch_seed_source screen is walked while unrecorded and skipped once its decision exists", () => {
    const unrecorded = advance("mechanisms", undefined, copyCtx);
    expect(unrecorded.next).toBe("touch_seed_source");
    const recorded = advance("mechanisms", undefined, {
      ...copyCtx,
      decisions: {
        ...copyCtx.decisions,
        "touch-seed-source": {
          id: "touch-seed-source" as const,
          value: "import-adapt",
          provenance: "asked" as const,
        },
      },
    });
    expect(recorded.next).toBe("touch");
  });
});

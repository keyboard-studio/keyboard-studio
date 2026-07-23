// manifest.test.ts — T025 (P4b foundation, updated for P4b review P0 fix).
//
// Asserts M2–M6 from the manifest-reducer contract:
//   M2 — spine order matches FR-012 functional order (now includes track).
//   M3 — exactly one lock:"physical" then one lock:"touch".
//   M4 — touch_seed_source is spine:false with a joinTarget resolving to an
//         existing spine:true step.
//   M4b — project_name is spine:false with joinTarget:"characters" (CYOA fork).
//   M5 — all ids unique.
//   M6 — no A–G phase-letter vocabulary in ids or titles.
//
// Source of truth: specs/012-step-model-manifest/contracts/manifest-reducer.contract.md

import { describe, it, expect } from "vitest";
import { manifest } from "./manifest.ts";
import type { Step } from "./types.ts";
import { assertUniqueIds } from "./types.test.ts";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const spineSteps = (steps: readonly Step[]): Step[] =>
  steps.filter((s) => s.spine === true);

const lockedSteps = (steps: readonly Step[]): Step[] =>
  steps.filter((s) => s.lock !== undefined);

const offSpineSteps = (steps: readonly Step[]): Step[] =>
  steps.filter((s) => s.spine === false);

/** Finds the index of a step by id; returns -1 if not found. */
const findStepIndex = (steps: readonly Step[], id: string): number =>
  steps.findIndex((s) => s.id === id);

/** Asserts that stepA appears before stepB in the list. */
function assertStepOrder(
  steps: readonly Step[],
  stepA: string,
  stepB: string,
): void {
  const idxA = findStepIndex(steps, stepA);
  const idxB = findStepIndex(steps, stepB);
  expect(idxA).toBeGreaterThanOrEqual(0);
  expect(idxB).toBeGreaterThanOrEqual(0);
  expect(idxA).toBeLessThan(idxB);
}

// ---------------------------------------------------------------------------
// M5 — unique ids (precondition for all other assertions)
// ---------------------------------------------------------------------------

describe("M5 — all step ids are unique", () => {
  it("no duplicate ids in manifest", () => {
    expect(() => assertUniqueIds(manifest)).not.toThrow();
  });
});

// ---------------------------------------------------------------------------
// M2 — spine order
//
// FR-012: Identity → choose_base → track → Characters → Marks → Carve →
//         Mechanisms → (lock:physical on mechanisms) → Sequences →
//         touch carve+add → (lock:touch) → Help → Package
//
// track is a real spine step (P0 fix). project_name is spine:false (CYOA fork).
// ---------------------------------------------------------------------------

const EXPECTED_SPINE_ORDER = [
  "identity",
  "choose_base",
  "track",
  "characters",
  "marks",
  "carve",
  "mechanisms",
  "sequences",
  "touch",
  "help",
  "package",
] as const;

describe("M2 — spine order matches FR-012", () => {
  it("spine steps appear in the functional order (Identity → … → Package)", () => {
    const actualSpineIds = spineSteps(manifest).map((s) => s.id);
    expect(actualSpineIds).toEqual([...EXPECTED_SPINE_ORDER]);
  });

  it("first spine step is 'identity'", () => {
    const first = spineSteps(manifest)[0];
    expect(first?.id).toBe("identity");
  });

  it("last spine step is 'package'", () => {
    const spine = spineSteps(manifest);
    const last = spine[spine.length - 1];
    expect(last?.id).toBe("package");
  });

  it("'track' is a spine step between 'choose_base' and 'characters'", () => {
    const spine = spineSteps(manifest);
    assertStepOrder(spine, "choose_base", "track");
    assertStepOrder(spine, "track", "characters");
  });

  it("'mechanisms' appears before 'touch' on the spine", () => {
    assertStepOrder(spineSteps(manifest), "mechanisms", "touch");
  });

  it("'sequences' sits between 'mechanisms' and 'touch' on the spine", () => {
    const spine = spineSteps(manifest);
    assertStepOrder(spine, "mechanisms", "sequences");
    assertStepOrder(spine, "sequences", "touch");
  });

  it("'carve' appears before 'mechanisms' on the spine", () => {
    assertStepOrder(spineSteps(manifest), "carve", "mechanisms");
  });

  it("'characters' appears before 'carve' on the spine", () => {
    assertStepOrder(spineSteps(manifest), "characters", "carve");
  });

  it("'marks' sits between 'characters' and 'carve' on the spine (spec 046 reorder — combined-letter answers precede all key work)", () => {
    const spine = spineSteps(manifest);
    assertStepOrder(spine, "characters", "marks");
    assertStepOrder(spine, "marks", "carve");
  });

  it("'help' appears before 'package' on the spine", () => {
    assertStepOrder(spineSteps(manifest), "help", "package");
  });

  it("'project_name' is NOT a spine step (it is the copy-track CYOA fork)", () => {
    const spine = spineSteps(manifest);
    const found = spine.find((s) => s.id === "project_name");
    expect(found).toBeUndefined();
  });
});

// ---------------------------------------------------------------------------
// M3 — exactly two locks, in the order physical then touch
// ---------------------------------------------------------------------------

describe("M3 — exactly one lock:physical then one lock:touch", () => {
  it("exactly two locks exist in the manifest", () => {
    const locked = lockedSteps(manifest);
    expect(locked).toHaveLength(2);
  });

  it("the first lock is 'physical'", () => {
    const locked = lockedSteps(manifest);
    expect(locked[0]?.lock).toBe("physical");
  });

  it("the second lock is 'touch'", () => {
    const locked = lockedSteps(manifest);
    expect(locked[1]?.lock).toBe("touch");
  });

  it("lock:physical is on the 'mechanisms' step", () => {
    const physicalLockStep = manifest.find((s) => s.lock === "physical");
    expect(physicalLockStep?.id).toBe("mechanisms");
  });

  it("lock:touch is on the 'touch' step", () => {
    const touchLockStep = manifest.find((s) => s.lock === "touch");
    expect(touchLockStep?.id).toBe("touch");
  });

  it("'sequences' carries no lock", () => {
    const sequencesStep = manifest.find((s) => s.id === "sequences");
    expect(sequencesStep?.lock).toBeUndefined();
  });

  it("lock:physical appears before lock:touch in the manifest array", () => {
    const locks = lockedSteps(manifest);
    expect(locks[0]?.lock).toBe("physical");
    expect(locks[1]?.lock).toBe("touch");
  });

  it("all lock-carrying steps are spine:true steps (not side trails)", () => {
    const locked = lockedSteps(manifest);
    for (const s of locked) {
      expect(s.spine).toBe(true);
    }
  });
});

// ---------------------------------------------------------------------------
// M4 — touch_seed_source fork
// ---------------------------------------------------------------------------

describe("M4 — touch_seed_source fork", () => {
  it("a step with id 'touch_seed_source' exists in the manifest", () => {
    const found = manifest.find((s) => s.id === "touch_seed_source");
    expect(found?.id).toBe("touch_seed_source");
  });

  it("touch_seed_source has spine:false", () => {
    const found = manifest.find((s) => s.id === "touch_seed_source");
    expect(found?.spine).toBe(false);
  });

  it("touch_seed_source has a joinTarget declared", () => {
    const found = manifest.find((s) => s.id === "touch_seed_source");
    expect(found?.joinTarget).toBeDefined();
    expect(typeof found?.joinTarget).toBe("string");
    expect((found?.joinTarget?.length ?? 0) > 0).toBe(true);
  });

  it("touch_seed_source.joinTarget resolves to a step that exists in the manifest", () => {
    const seedStep = manifest.find((s) => s.id === "touch_seed_source");
    const joinTarget = seedStep?.joinTarget;
    expect(joinTarget).toBeDefined();
    const targetStep = manifest.find((s) => s.id === joinTarget);
    expect(targetStep).toBeDefined();
  });

  it("touch_seed_source.joinTarget resolves to a spine:true step", () => {
    const seedStep = manifest.find((s) => s.id === "touch_seed_source");
    const joinTarget = seedStep?.joinTarget;
    const targetStep = manifest.find((s) => s.id === joinTarget);
    expect(targetStep?.spine).toBe(true);
  });

  it("touch_seed_source appears in the manifest before the touch spine step", () => {
    assertStepOrder(manifest, "touch_seed_source", "touch");
  });
});

// ---------------------------------------------------------------------------
// M4b — project_name CYOA fork (copy-track only)
//
// project_name must be spine:false with joinTarget:"characters" — it is the
// CYOA branch for the copy track. The adapt track skips it entirely.
// ---------------------------------------------------------------------------

describe("M4b — project_name CYOA fork (copy-track only)", () => {
  it("a step with id 'project_name' exists in the manifest", () => {
    const found = manifest.find((s) => s.id === "project_name");
    expect(found).toBeDefined();
  });

  it("project_name has spine:false", () => {
    const found = manifest.find((s) => s.id === "project_name");
    expect(found?.spine).toBe(false);
  });

  it("project_name.joinTarget is 'characters'", () => {
    const found = manifest.find((s) => s.id === "project_name");
    expect(found?.joinTarget).toBe("characters");
  });

  it("project_name.joinTarget resolves to a spine:true step", () => {
    const found = manifest.find((s) => s.id === "project_name");
    const targetStep = manifest.find((s) => s.id === found?.joinTarget);
    expect(targetStep?.spine).toBe(true);
  });

  it("project_name appears in the manifest between track and characters", () => {
    assertStepOrder(manifest, "track", "project_name");
    assertStepOrder(manifest, "project_name", "characters");
  });
});

// ---------------------------------------------------------------------------
// Off-spine inventory — exactly two off-spine steps
// ---------------------------------------------------------------------------

describe("Off-spine step inventory", () => {
  it("exactly two spine:false steps exist (project_name and touch_seed_source)", () => {
    const offSpine = offSpineSteps(manifest);
    expect(offSpine).toHaveLength(2);
    const ids = offSpine.map((s) => s.id).sort();
    expect(ids).toEqual(["project_name", "touch_seed_source"]);
  });

  it("all spine:false steps have a joinTarget declared", () => {
    for (const step of offSpineSteps(manifest)) {
      expect(step.joinTarget).toBeDefined();
      expect(typeof step.joinTarget).toBe("string");
    }
  });

  it("all spine:false joinTargets resolve to spine:true steps in the manifest", () => {
    for (const step of offSpineSteps(manifest)) {
      const target = manifest.find((s) => s.id === step.joinTarget);
      expect(target?.spine).toBe(true);
    }
  });
});

// ---------------------------------------------------------------------------
// Layout declarations (spec 024 Stage 0)
//
// Exactly {carve, mechanisms, sequences, touch} must declare layout:"full".
// All other steps must have layout:"pane" or omit the field (implicit "pane").
// ---------------------------------------------------------------------------

const FULL_LAYOUT_IDS = ["carve", "mechanisms", "sequences", "touch"] as const;

describe("layout declarations (spec 024 Stage 0)", () => {
  it("exactly four steps declare layout:'full'", () => {
    const fullSteps = manifest.filter((s) => s.layout === "full");
    const fullIds = fullSteps.map((s) => s.id).sort();
    expect(fullIds).toEqual([...FULL_LAYOUT_IDS].sort());
  });

  it("carve declares layout:'full'", () => {
    const carve = manifest.find((s) => s.id === "carve");
    expect(carve?.layout).toBe("full");
  });

  it("mechanisms declares layout:'full'", () => {
    const mechanisms = manifest.find((s) => s.id === "mechanisms");
    expect(mechanisms?.layout).toBe("full");
  });

  it("touch declares layout:'full'", () => {
    const touch = manifest.find((s) => s.id === "touch");
    expect(touch?.layout).toBe("full");
  });

  it("sequences declares layout:'full'", () => {
    const sequences = manifest.find((s) => s.id === "sequences");
    expect(sequences?.layout).toBe("full");
  });

  it("all other steps have layout:'pane' or omit layout (implicit pane)", () => {
    const fullSet = new Set<string>(FULL_LAYOUT_IDS);
    for (const step of manifest) {
      if (!fullSet.has(step.id)) {
        expect(
          step.layout === undefined || step.layout === "pane",
          `Step "${step.id}" must not declare layout:"full"`,
        ).toBe(true);
      }
    }
  });
});

// ---------------------------------------------------------------------------
// M6 — no A–G phase-letter vocabulary in ids or titles
// ---------------------------------------------------------------------------

const RETIRED_ID_PATTERNS = [
  /^phase_[a-gA-G]$/,
  /^phase[A-G]$/,
  /^[a-gA-G]$/,
];

const RETIRED_TITLE_PATTERNS = [
  /^Phase\s+[A-G]\s*$/i,
];

describe("M6 — no A–G phase-letter vocabulary in ids or titles", () => {
  it("no step id matches a retired phase-letter pattern", () => {
    for (const step of manifest) {
      for (const pattern of RETIRED_ID_PATTERNS) {
        expect(
          pattern.test(step.id),
          `Step id "${step.id}" matches retired pattern ${pattern.source}`,
        ).toBe(false);
      }
    }
  });

  it("no step title is exactly a retired 'Phase X' label", () => {
    for (const step of manifest) {
      for (const pattern of RETIRED_TITLE_PATTERNS) {
        expect(
          pattern.test(step.title),
          `Step title "${step.title}" matches retired pattern ${pattern.source}`,
        ).toBe(false);
      }
    }
  });

  it("the characters-inventory step uses id 'characters', not 'phase_a' or similar", () => {
    const charStep = manifest.find((s) => s.id === "characters");
    expect(charStep).toBeDefined();
  });
});

// ---------------------------------------------------------------------------
// SC-004 — SurveyView no longer contains per-step render branches or
//           completion handlers (spec 028 Stage 5 contract).
//
// These private strings were deleted by the Stage 5 refactor; their absence
// is the guard. Reading the StudioShell.tsx source at test-time ensures the
// guard stays in sync with the file rather than with a stale snapshot.
// ---------------------------------------------------------------------------

import { readFileSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const STUDIO_SHELL_PATH = join(__dirname, "..", "StudioShell.tsx");

describe("SC-004 — StudioShell.tsx has no per-step render branches or completion handlers", () => {
  let src: string;

  // Read the source once for all assertions in this suite.
  // If the file moves, the readFileSync will throw — that is intentional (the
  // guard itself needs updating, which is better than silently passing).
  src = readFileSync(STUDIO_SHELL_PATH, "utf-8");

  it('"renderQuestionsPane" is absent from StudioShell.tsx (deleted by Stage 5)', () => {
    expect(src).not.toContain("renderQuestionsPane");
  });

  it('"handlePhaseEComplete" is absent from StudioShell.tsx (deleted by Stage 5)', () => {
    expect(src).not.toContain("handlePhaseEComplete");
  });

  it('"handleTrackSelected" is absent from StudioShell.tsx (deleted by Stage 5)', () => {
    expect(src).not.toContain("handleTrackSelected");
  });

  it('"handleProjectNameNext" is absent from StudioShell.tsx (deleted by Stage 5)', () => {
    expect(src).not.toContain("handleProjectNameNext");
  });
});

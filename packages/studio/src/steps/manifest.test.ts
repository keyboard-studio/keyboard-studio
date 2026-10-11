// manifest.test.ts — T025 (P4b foundation, updated for P4b review P0 fix).
//
// Asserts M2–M6 from the manifest-reducer contract. Spine membership and join
// targets are DERIVED (steps/stepOrder.ts): a gated step is a side trail and
// rejoins at the next ungated step. The frozen-literal parity oracle lives in
// stepOrder.parity.test.ts; these tests assert the contract's M-rules on top.
//   M2 — main-line order matches FR-012 functional order (now includes track).
//   M3 — exactly one lock:"physical" then one lock:"touch".
//   M4 — touch_seed_source is a side trail whose derived join target is an
//         existing spine step.
//   M4b — project_name is a side trail rejoining at "characters" (CYOA fork).
//   M5 — all ids unique.
//   M6 — no A–G phase-letter vocabulary in ids or titles.
//
// Source of truth: specs/012-step-model-manifest/contracts/manifest-reducer.contract.md

import { describe, it, expect } from "vitest";
import { manifest } from "./manifest.ts";
import type { Step } from "./types.ts";
import { assertUniqueIds } from "./types.test.ts";
import {
  decisionModules,
  declaredScreenGates,
  questionRegistry,
} from "../survey/questions/registry.ts";
import { deriveScreens } from "../decisions/deriveScreens.ts";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/**
 * Derived screen trails (spec 091 T018): spine membership and join
 * targets are read from the derived screens, not from step declarations.
 * "package" is the ruled terminal screen (spine, no join target).
 */
const derivedScreenById = new Map(
  deriveScreens(decisionModules, declaredScreenGates).map((s) => [s.id, s] as const),
);
const spineOf = (s: Step | undefined): boolean | undefined =>
  s === undefined ? undefined : s.id === "package" ? true : derivedScreenById.get(s.id)?.spine;
const joinOf = (s: Step | undefined): string | undefined =>
  s === undefined ? undefined : derivedScreenById.get(s.id)?.joinTarget;

const spineSteps = (steps: readonly Step[]): Step[] =>
  steps.filter((s) => spineOf(s) === true);

const lockedSteps = (steps: readonly Step[]): Step[] =>
  steps.filter((s) => s.lock !== undefined);

const offSpineSteps = (steps: readonly Step[]): Step[] =>
  steps.filter((s) => spineOf(s) === false);

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
// FR-003 — every manifest step id resolves to a registered component
//
// editor-step -> step.component must be a resolved function (not undefined).
// question-step -> step.questionId must resolve in questionRegistry. No
// question-step entries exist in the manifest today, but the union type
// supports it (steps/types.ts); this guard covers the branch TypeScript's
// structural typing cannot: a runtime registry lookup.
// ---------------------------------------------------------------------------

describe("FR-003 — every manifest step id resolves to a registered component", () => {
  for (const step of manifest) {
    it(`"${step.id}" (${step.kind}) resolves to a registered component`, () => {
      if (step.kind === "editor-step") {
        expect(typeof step.component).toBe("function");
      } else if (step.kind === "question-step") {
        expect(questionRegistry[step.questionId]).toBeDefined();
      }
    });
  }
});

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
//         Rules → Mechanisms → (lock:physical on mechanisms) →
//         touch carve+add → (lock:touch) → Help → Package
//
// track is a real spine step (P0 fix). project_name is a derived side trail (CYOA fork).
// Sequences (S-03) build inline in the Mechanism Gallery's method chooser —
// there is no separate "sequences" spine step.
// Rules (spec 082) sits between carve and mechanisms: the before/after rule
// demo + rule list/builder, after the author has shaped which keys exist.
// ---------------------------------------------------------------------------

const EXPECTED_SPINE_ORDER = [
  "identity",
  "layout",
  "choose_base",
  "track",
  // #1901: the author/copyright step walks right after the track choice.
  "attribution",
  "characters",
  "marks",
  "punctuation",
  "invisibles",
  "convenience",
  "carve",
  "deadkeys",
  "rules",
  "mechanisms",
  "touch",
  "help",
  "package",
] as const;

describe("M2 — spine order matches FR-012", () => {
  it("manifest ≡ derived screens (spec 091 T018): same ids, same order, same trails", () => {
    const screens = deriveScreens(decisionModules, declaredScreenGates);
    expect(manifest.map((s) => s.id)).toEqual([...screens.map((s) => s.id), "package"]);
    for (const screen of screens) {
      const step = manifest.find((s) => s.id === screen.id);
      expect(step, screen.id).toBeDefined();
      expect(spineOf(step), screen.id).toBe(screen.spine);
      expect(joinOf(step), screen.id).toBe(screen.joinTarget);
    }
  });

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

  it("'layout' sits right after 'identity' and before 'choose_base' (spec 076 A4)", () => {
    const spine = spineSteps(manifest);
    assertStepOrder(spine, "identity", "layout");
    assertStepOrder(spine, "layout", "choose_base");
    expect(spine[1]?.id).toBe("layout");
  });

  it("'track' is a spine step between 'choose_base' and 'characters'", () => {
    const spine = spineSteps(manifest);
    assertStepOrder(spine, "choose_base", "track");
    assertStepOrder(spine, "track", "characters");
  });

  it("'mechanisms' appears before 'touch' on the spine", () => {
    assertStepOrder(spineSteps(manifest), "mechanisms", "touch");
  });

  it("'carve' appears before 'rules' before 'mechanisms' on the spine (spec 082)", () => {
    const spine = spineSteps(manifest);
    assertStepOrder(spine, "carve", "rules");
    assertStepOrder(spine, "rules", "mechanisms");
  });

  it("'characters' appears before 'carve' on the spine", () => {
    assertStepOrder(spineSteps(manifest), "characters", "carve");
  });

  it("'marks' sits between 'characters' and 'carve' on the spine (spec 071 reorder — combined-letter answers precede all key work)", () => {
    const spine = spineSteps(manifest);
    assertStepOrder(spine, "characters", "marks");
    assertStepOrder(spine, "marks", "punctuation");
    assertStepOrder(spine, "punctuation", "invisibles");
    assertStepOrder(spine, "invisibles", "convenience");
    assertStepOrder(spine, "convenience", "carve");
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

  it("lock:physical appears before lock:touch in the manifest array", () => {
    const locks = lockedSteps(manifest);
    expect(locks[0]?.lock).toBe("physical");
    expect(locks[1]?.lock).toBe("touch");
  });

  it("all lock-carrying steps are spine steps (not side trails)", () => {
    const locked = lockedSteps(manifest);
    for (const s of locked) {
      expect(spineOf(s)).toBe(true);
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

  it("touch_seed_source is a derived side trail", () => {
    const found = manifest.find((s) => s.id === "touch_seed_source");
    expect(spineOf(found)).toBe(false);
  });

  it("touch_seed_source has a joinTarget declared", () => {
    const found = manifest.find((s) => s.id === "touch_seed_source");
    expect(joinOf(found)).toBeDefined();
    expect(typeof joinOf(found)).toBe("string");
    expect((joinOf(found)?.length ?? 0) > 0).toBe(true);
  });

  it("touch_seed_source.joinTarget resolves to a step that exists in the manifest", () => {
    const seedStep = manifest.find((s) => s.id === "touch_seed_source");
    const joinTarget = joinOf(seedStep);
    expect(joinTarget).toBeDefined();
    const targetStep = manifest.find((s) => s.id === joinTarget);
    expect(targetStep).toBeDefined();
  });

  it("touch_seed_source.joinTarget resolves to a spine step", () => {
    const seedStep = manifest.find((s) => s.id === "touch_seed_source");
    const joinTarget = joinOf(seedStep);
    const targetStep = manifest.find((s) => s.id === joinTarget);
    expect(spineOf(targetStep)).toBe(true);
  });

  it("touch_seed_source appears in the manifest before the touch spine step", () => {
    assertStepOrder(manifest, "touch_seed_source", "touch");
  });
});

// ---------------------------------------------------------------------------
// M4b — project_name CYOA fork (copy-track only)
//
// project_name must be a derived side trail with join target:"characters" — it is the
// CYOA branch for the copy track. The adapt track skips it entirely.
// ---------------------------------------------------------------------------

describe("M4b — project_name CYOA fork (copy-track only)", () => {
  it("a step with id 'project_name' exists in the manifest", () => {
    const found = manifest.find((s) => s.id === "project_name");
    expect(found).toBeDefined();
  });

  it("project_name is a derived side trail", () => {
    const found = manifest.find((s) => s.id === "project_name");
    expect(spineOf(found)).toBe(false);
  });

  it("project_name.joinTarget is 'characters'", () => {
    const found = manifest.find((s) => s.id === "project_name");
    expect(joinOf(found)).toBe("characters");
  });

  it("project_name.joinTarget resolves to a spine step", () => {
    const found = manifest.find((s) => s.id === "project_name");
    const targetStep = manifest.find((s) => s.id === joinOf(found));
    expect(spineOf(targetStep)).toBe(true);
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
  it("exactly two derived side-trail steps exist (project_name and touch_seed_source)", () => {
    const offSpine = offSpineSteps(manifest);
    expect(offSpine).toHaveLength(2);
    const ids = offSpine.map((s) => s.id).sort();
    expect(ids).toEqual(["project_name", "touch_seed_source"]);
  });

  it("all derived side-trail steps have a derived join target", () => {
    for (const step of offSpineSteps(manifest)) {
      expect(joinOf(step)).toBeDefined();
      expect(typeof joinOf(step)).toBe("string");
    }
  });

  it("all derived join targets resolve to spine steps in the manifest", () => {
    for (const step of offSpineSteps(manifest)) {
      const target = manifest.find((s) => s.id === joinOf(step));
      expect(spineOf(target)).toBe(true);
    }
  });
});

// ---------------------------------------------------------------------------
// Layout declarations (spec 024 Stage 0; touch_seed_source joined this set in
// the spec 035 R4b follow-up P0 fix — the panel's inline live OSK preview
// needs the two-pane shell's persistent right-pane OSKFrame suppressed, or
// two live OSKs co-mount).
//
// Exactly {carve, deadkeys, rules, mechanisms, touch, touch_seed_source}
// must declare layout:"full". All other steps must have layout:"pane" or
// omit the field (implicit "pane").
// ---------------------------------------------------------------------------

const FULL_LAYOUT_IDS = ["carve", "deadkeys", "rules", "mechanisms", "touch", "touch_seed_source"] as const;

describe("layout declarations (spec 024 Stage 0)", () => {
  it("exactly six steps declare layout:'full'", () => {
    const fullSteps = manifest.filter((s) => s.layout === "full");
    const fullIds = fullSteps.map((s) => s.id).sort();
    expect(fullIds).toEqual([...FULL_LAYOUT_IDS].sort());
  });

  it("carve declares layout:'full'", () => {
    const carve = manifest.find((s) => s.id === "carve");
    expect(carve?.layout).toBe("full");
  });

  it("deadkeys declares layout:'full' (spec 083: three-tab editor needs the full working area, like carve)", () => {
    const deadkeys = manifest.find((s) => s.id === "deadkeys");
    expect(deadkeys?.layout).toBe("full");
  });

  it("rules declares layout:'full' (spec 082: the demo pane + rule builder need the full width)", () => {
    const rules = manifest.find((s) => s.id === "rules");
    expect(rules?.layout).toBe("full");
  });

  it("mechanisms declares layout:'full'", () => {
    const mechanisms = manifest.find((s) => s.id === "mechanisms");
    expect(mechanisms?.layout).toBe("full");
  });

  it("touch declares layout:'full'", () => {
    const touch = manifest.find((s) => s.id === "touch");
    expect(touch?.layout).toBe("full");
  });

  it("touch_seed_source declares layout:'full' (P0 fix: suppresses the outer persistent OSK pane so the panel's own inline OSK is the only preview)", () => {
    const seedSource = manifest.find((s) => s.id === "touch_seed_source");
    expect(seedSource?.layout).toBe("full");
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
const STEP_HOST_PATH = join(__dirname, "..", "components", "StepHost.tsx");

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

  it("StudioShell.tsx has no import from an editors/ path (FR-004)", () => {
    expect(src).not.toMatch(/from ["'][^"']*\/editors\//);
  });
});

describe("FR-004 — components/StepHost.tsx has no direct editors/ import", () => {
  const stepHostSrc = readFileSync(STEP_HOST_PATH, "utf-8");

  it("StepHost.tsx has no import from an editors/ path", () => {
    expect(stepHostSrc).not.toMatch(/from ["'][^"']*\/editors\//);
  });
});

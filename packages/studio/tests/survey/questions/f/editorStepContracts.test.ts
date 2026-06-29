// Spec 017 — per-step declared-contract unit tests (US1 / US3, FR-012/-013/-014).
//
// Asserts the populated inputs/writes on the existing editor-steps (carve /
// mechanisms / touch / track / project_name) and the DEC-D1 charactersStep
// subsumption write are well-formed (resolve via irPath() to existing KeyboardIR
// locations), that no declaration references the forbidden irPath('header','script'),
// that writes-before-inputs keeps C5 green at every intermediate step, and that
// C7 (per-graph reachability) stays green.
//
// Declared-only: nothing executes, flag off, no contracts bump (FR-015).

import { describe, it, expect } from "vitest";
import { formatIRPath } from "@keyboard-studio/contracts";
import type { IRPath, KeyboardIR } from "@keyboard-studio/contracts";

import {
  carveStep,
  mechanismsStep,
  touchStep,
  trackStep,
  projectNameStep,
} from "../../../../src/steps/registerEditorSteps.ts";
import { CARVE_WRITES, ADD_GALLERY_WRITES, TOUCH_WRITES } from "../../../../src/steps/editorMutate.ts";
import { manifest } from "../../../../src/steps/manifest.ts";
import {
  checkInputsSatisfiableFromManifest,
  findUnreachable,
} from "../../../../src/dashboard/completeness.ts";
import type { Step } from "../../../../src/steps/types.ts";

// ---------------------------------------------------------------------------
// IRPath well-formedness: a path resolves to an existing KeyboardIR location iff
// every string segment names a real key down the structure. We assert resolution
// against a representative KeyboardIR keyset rather than re-implementing PathsInto
// (the irPath() builder is already a compile-time guarantee — these are runtime
// belt-and-braces, and the FR-013 forbidden-path guard).
// ---------------------------------------------------------------------------

const KEYBOARD_IR_TOP_KEYS = new Set<keyof KeyboardIR>([
  "origin",
  "header",
  "stores",
  "groups",
  "comments",
  "raw",
  "touchLayout",
  "visualKeyboard",
  "recognizedPatterns",
]);

function topSegmentOf(p: IRPath): string {
  // formatIRPath renders e.g. "groups[].rules[]" / "header.bcp47"; the top
  // segment is the first dotted/bracketed token.
  const s = formatIRPath(p);
  return s.split(/[.[]/)[0]!;
}

describe("spec 017 — editor-step declared contracts are well-formed (FR-002, FR-012)", () => {
  const declaredSteps: ReadonlyArray<{ name: string; step: Step }> = [
    { name: "carve", step: carveStep },
    { name: "mechanisms", step: mechanismsStep },
    { name: "touch", step: touchStep },
    { name: "track", step: trackStep },
    { name: "project_name", step: projectNameStep },
  ];

  for (const { name, step } of declaredSteps) {
    it(`${name}: every declared input/write resolves to an existing KeyboardIR top-level location`, () => {
      for (const p of [...step.inputs, ...step.writes]) {
        const top = topSegmentOf(p);
        expect(
          KEYBOARD_IR_TOP_KEYS.has(top as keyof KeyboardIR),
          `${name} declares path "${formatIRPath(p)}" whose top segment "${top}" is not a KeyboardIR field`,
        ).toBe(true);
      }
    });
  }

  it("carve.writes == CARVE_WRITES (groups[]/stores[]/raw[]); inputs [] (self-read, C2 cycle avoidance)", () => {
    expect(carveStep.writes.map(formatIRPath)).toEqual(CARVE_WRITES.map(formatIRPath));
    expect(carveStep.inputs).toEqual([]);
  });

  it("mechanisms.writes == ADD_GALLERY_WRITES (groups[]/stores[]); inputs []", () => {
    expect(mechanismsStep.writes.map(formatIRPath)).toEqual(ADD_GALLERY_WRITES.map(formatIRPath));
    expect(mechanismsStep.inputs).toEqual([]);
  });

  it("touch.writes == TOUCH_WRITES (touchLayout…keys[] + touchLayout.nodeIds[]); inputs []", () => {
    expect(touchStep.writes.map(formatIRPath)).toEqual(TOUCH_WRITES.map(formatIRPath));
    expect(touchStep.inputs).toEqual([]);
  });

  it("track.writes is [] (DEC-D2 — branch selection only, no IR leaf in P1)", () => {
    expect(trackStep.writes).toEqual([]);
  });

  it("track.inputs are header.bcp47 (array, session-derived) + resolved base display name (header.name)", () => {
    expect(trackStep.inputs.map(formatIRPath)).toEqual(["header.bcp47", "header.name"]);
  });

  it("project_name declares its scaffold writes (header.name / header.keyboardId) against existing locations", () => {
    expect(projectNameStep.writes.map(formatIRPath)).toEqual(["header.name", "header.keyboardId"]);
    expect(projectNameStep.inputs.map(formatIRPath)).toEqual(["header.bcp47"]);
  });
});

// ---------------------------------------------------------------------------
// FR-004 / FR-013 — the forbidden irPath('header','script') guard.
// ---------------------------------------------------------------------------

describe("spec 017 — FR-013 forbidden-path guard: no declaration references header.script", () => {
  it("no manifest step (incl. charactersStep) declares header.script", () => {
    for (const step of manifest) {
      for (const p of [...step.inputs, ...step.writes]) {
        expect(
          formatIRPath(p),
          `manifest step "${step.id}" declares the forbidden path header.script`,
        ).not.toBe("header.script");
      }
    }
  });

  it("no editor-step declaration references header.script", () => {
    const all = [carveStep, mechanismsStep, touchStep, trackStep, projectNameStep];
    for (const step of all) {
      for (const p of [...step.inputs, ...step.writes]) {
        expect(formatIRPath(p)).not.toBe("header.script");
      }
    }
  });
});

// ---------------------------------------------------------------------------
// FR-010 / DEC-D1 — charactersStep subsumption write makes prefill's header.bcp47
// input C5-satisfiable within the single manifest graph.
// ---------------------------------------------------------------------------

describe("spec 017 — DEC-D1 subsumption: charactersStep declares header.bcp47 (FR-010, FR-011)", () => {
  const charactersStep = manifest.find((s) => s.id === "characters")!;

  it("charactersStep.writes includes header.bcp47", () => {
    expect(charactersStep.writes.map(formatIRPath)).toContain("header.bcp47");
  });

  it("manifest-level C5 (checkInputsSatisfiable) reports NO orphan inputs (single check)", () => {
    const orphans = checkInputsSatisfiableFromManifest(manifest);
    expect(orphans, `orphan inputs: ${orphans.map((o) => `${o.stepId}:${o.path}`).join(", ")}`).toEqual([]);
  });
});

// ---------------------------------------------------------------------------
// FR-009 / SC-004 — writes-before-inputs sequencing: replay the declaration
// sequence and assert C5 is green after EACH intermediate step. Writes-group
// lands first; inputs-group second. C5 never transiently reds.
// ---------------------------------------------------------------------------

describe("spec 017 — writes-before-inputs sequencing keeps C5 green (FR-009, SC-004)", () => {
  // Strip every declared inputs/writes back to empty, then replay them in the
  // spec's load-bearing order against the REAL manifest shape (ids/spine/locks
  // preserved). After each step C5 (orphan inputs) must be empty.
  const baseline: Step[] = manifest.map((s) => ({ ...s, inputs: [], writes: [] }));

  // Final declared contracts, keyed by step id (read off the real manifest).
  const finalById = new Map(manifest.map((s) => [s.id, { inputs: s.inputs, writes: s.writes }]));

  function withStep(
    state: readonly Step[],
    id: string,
    field: "inputs" | "writes",
  ): Step[] {
    const decl = finalById.get(id)!;
    return state.map((s) => (s.id === id ? { ...s, [field]: decl[field] } : s));
  }

  it("C5 is green after every intermediate declaration step (writes first, then inputs)", () => {
    let state: Step[] = baseline;

    // Group B — writes first (carve/mechanisms/touch + charactersStep subsumption;
    // track/project_name writes too — track is [], so order is harmless).
    const writeOrder = ["carve", "mechanisms", "touch", "characters", "track", "project_name"];
    // Group C — inputs after.
    const inputOrder = ["carve", "mechanisms", "touch", "track", "project_name"];

    for (const id of writeOrder) {
      state = withStep(state, id, "writes");
      const orphans = checkInputsSatisfiableFromManifest(state);
      expect(orphans, `C5 RED after writing ${id}: ${orphans.map((o) => `${o.stepId}:${o.path}`).join(", ")}`).toEqual([]);
    }
    for (const id of inputOrder) {
      state = withStep(state, id, "inputs");
      const orphans = checkInputsSatisfiableFromManifest(state);
      expect(orphans, `C5 RED after declaring inputs of ${id}: ${orphans.map((o) => `${o.stepId}:${o.path}`).join(", ")}`).toEqual([]);
    }

    // End state matches the real manifest's orphan result (green).
    expect(checkInputsSatisfiableFromManifest(state)).toEqual(checkInputsSatisfiableFromManifest(manifest));
  });
});

// ---------------------------------------------------------------------------
// FR-012 / FR-014 — C7 per-graph reachability for the editor-step graph.
// ---------------------------------------------------------------------------

describe("spec 017 — C7 per-graph reachability (editor-step graph, FR-012/FR-014)", () => {
  it("no manifest editor-step is unreachable (findUnreachable is empty)", () => {
    expect(findUnreachable(manifest)).toEqual([]);
  });
});

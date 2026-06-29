// Spec 021 — qu-wire-galleries: map-node confirmation (additive) + Phase-1
// invariant guards.
//
// Spec 021 adds NO production code. The three gallery editor-steps — carve,
// mechanisms (lock:"physical"), touch (lock:"touch") — are ALREADY declared
// manifest entries (registerEditorSteps.ts:116/138/174, placed in manifest.ts),
// with their `writes` populated by spec 017 (CARVE_WRITES / ADD_GALLERY_WRITES /
// TOUCH_WRITES). This file confirms — ADDITIVELY to the spec-015 map-projection
// test (manifestProjection.test.ts) and the spec-015 step-graph tautology
// (buildStepGraph.test.ts), which it does NOT repurpose — that:
//
//   T013 — carve resolves as exactly one first-class node on the manifest spine
//          after `characters`, sourced from buildManifestStepGraph() via the
//          spec-015 adapter (no new declaration), carrying its spec-017 writes
//          over groups[]/stores[]/raw[] (CARVE_WRITES) (FR-001/FR-004/SC-001/SC-002).
//   T014 — mechanisms resolves as exactly one node (lock:"physical"), carrying its
//          spec-017 writes over groups[]/stores[] (ADD_GALLERY_WRITES)
//          (FR-002/FR-004/SC-001/SC-002).
//   T015 — touch resolves as exactly one node (lock:"touch"), carrying its
//          spec-017 writes over touchLayout.platforms[].layers[].rows[].keys[]
//          (TOUCH_WRITES), and the touch_seed_source side-trail (spine:false,
//          joinTarget:"touch") projects as a fork/join into `touch`, NOT a spine
//          step (FR-003/FR-004/SC-001/SC-002).
//
// Plus the Phase-1 invariant guards on the map/contract surface:
//   T017 — no @keyboard-studio/contracts bump / no new KeyboardIR field: every
//          declared write path is an existing irPath() location.
//   T019 — no re-declaration: exactly one declaration and one manifest entry per
//          gallery; this spec added none.
//
// NB on `inputs`: the three galleries deliberately declare inputs:[] (the C2-cycle
// avoidance documented at registerEditorSteps.ts — declaring the self-read coarse
// paths as manifest INPUTS would form a carve↔mechanisms↔touch data cycle). The
// load-bearing spec-017 contract on each node is therefore the `writes` set; this
// file asserts the writes are populated and inputs are the declared [] (NOT a
// missing field). The map adapter (buildManifestStepGraph → buildManifestProjection)
// carries each node's writePaths/inputPaths from step.writes/step.inputs verbatim.
//
// Test-only: no contracts bump, no write routing, no mutate(), no re-declaration,
// no change to the spec-015 projection or the spec-016 drift bijection.
//
// Source of truth:
//   specs/021-qu-wire-galleries/spec.md (US1, FR-001..-004/-015, SC-001/-002)
//   specs/021-qu-wire-galleries/tasks.md (T013/T014/T015/T017/T019)

import { describe, it, expect } from "vitest";
import { formatIRPath } from "@keyboard-studio/contracts";

import { manifest } from "../../src/steps/manifest.ts";
import {
  buildManifestStepGraph,
} from "../../src/dashboard/buildStepGraph.ts";
import {
  buildManifestProjection,
  CHARACTERS_STEP_ID,
} from "../../src/dashboard/manifestProjection.ts";
import {
  CARVE_WRITES,
  ADD_GALLERY_WRITES,
  TOUCH_WRITES,
} from "../../src/steps/editorMutate.ts";

const CARVE_ID = "carve";
const MECHANISMS_ID = "mechanisms";
const TOUCH_ID = "touch";
const TOUCH_SEED_ID = "touch_seed_source";

// Build once — the projection / step graph are pure functions of the manifest.
const stepGraph = buildManifestStepGraph();
const projection = buildManifestProjection();

function stepNode(id: string) {
  return stepGraph.nodes.find((n) => n.id === id);
}

/** The expected formatted write paths for a spec-017 containment set. */
function formatted(paths: readonly import("@keyboard-studio/contracts").IRPath[]): string[] {
  return paths.map(formatIRPath);
}

// ---------------------------------------------------------------------------
// T013 — carve resolves as exactly one first-class node on the spine after
// `characters`, carrying CARVE_WRITES.
// ---------------------------------------------------------------------------

describe("spec 021 T013 — carve resolves as a first-class map node carrying CARVE_WRITES (FR-001/FR-004/SC-001/SC-002)", () => {
  it("exactly one `carve` node, projected from buildManifestStepGraph() (no new declaration)", () => {
    expect(stepGraph.nodes.filter((n) => n.id === CARVE_ID)).toHaveLength(1);
    // The spec-015 adapter projects exactly the step-graph node set → one rendered node.
    expect(projection.nodes.filter((n) => n.id === CARVE_ID)).toHaveLength(1);
  });

  it("the carve node sits on the manifest spine immediately after `characters`", () => {
    const ids = manifest.filter((s) => s.spine === true).map((s) => s.id);
    const charIdx = ids.indexOf(CHARACTERS_STEP_ID);
    expect(charIdx).toBeGreaterThanOrEqual(0);
    expect(ids[charIdx + 1]).toBe(CARVE_ID);
    // The carve step is a spine step (it carries a spine edge in the step graph).
    expect(stepGraph.edges.some((e) => e.kind === "spine" && e.from === CARVE_ID)).toBe(true);
  });

  it("the carve node carries its spec-017 writes over groups[]/stores[]/raw[] (CARVE_WRITES)", () => {
    const node = stepNode(CARVE_ID);
    expect(node).toBeDefined();
    // The adapter source (writePaths) mirrors the declared CARVE_WRITES verbatim.
    expect(node!.writePaths).toEqual(formatted(CARVE_WRITES));
    // The declared surface is groups[]/stores[]/raw[] (the carve deletion overlay).
    expect(node!.writePaths).toEqual(["groups[]", "stores[]", "raw[]"]);
    // inputs are the declared [] (C2-cycle avoidance), NOT a missing field.
    expect(node!.inputPaths).toEqual([]);
  });
});

// ---------------------------------------------------------------------------
// T014 — mechanisms resolves as exactly one node (lock:"physical"), carrying
// ADD_GALLERY_WRITES.
// ---------------------------------------------------------------------------

describe("spec 021 T014 — mechanisms resolves as a first-class map node (lock:physical) carrying ADD_GALLERY_WRITES (FR-002/FR-004/SC-001/SC-002)", () => {
  it("exactly one `mechanisms` node, projected from buildManifestStepGraph()", () => {
    expect(stepGraph.nodes.filter((n) => n.id === MECHANISMS_ID)).toHaveLength(1);
    expect(projection.nodes.filter((n) => n.id === MECHANISMS_ID)).toHaveLength(1);
  });

  it("the mechanisms node carries lock:'physical' (the manifest.ts spread)", () => {
    expect(stepNode(MECHANISMS_ID)!.lock).toBe("physical");
  });

  it("the mechanisms node carries its spec-017 writes over groups[]/stores[] (ADD_GALLERY_WRITES)", () => {
    const node = stepNode(MECHANISMS_ID);
    expect(node!.writePaths).toEqual(formatted(ADD_GALLERY_WRITES));
    expect(node!.writePaths).toEqual(["groups[]", "stores[]"]);
    expect(node!.inputPaths).toEqual([]);
  });
});

// ---------------------------------------------------------------------------
// T015 — touch resolves as exactly one node (lock:"touch") carrying TOUCH_WRITES;
// touch_seed_source projects as a fork/join into `touch`.
// ---------------------------------------------------------------------------

describe("spec 021 T015 — touch resolves as a first-class map node (lock:touch) carrying TOUCH_WRITES; touch_seed_source is a fork/join (FR-003/FR-004/SC-001/SC-002)", () => {
  it("exactly one `touch` node, projected from buildManifestStepGraph()", () => {
    expect(stepGraph.nodes.filter((n) => n.id === TOUCH_ID)).toHaveLength(1);
    expect(projection.nodes.filter((n) => n.id === TOUCH_ID)).toHaveLength(1);
  });

  it("the touch node carries lock:'touch' (the manifest.ts spread)", () => {
    expect(stepNode(TOUCH_ID)!.lock).toBe("touch");
  });

  it("the touch node carries its spec-017 writes over touchLayout...keys[] (TOUCH_WRITES)", () => {
    const node = stepNode(TOUCH_ID);
    expect(node!.writePaths).toEqual(formatted(TOUCH_WRITES));
    // The addressable endpoints: the per-key array + the nodeIds map.
    expect(node!.writePaths).toEqual([
      "touchLayout.platforms[].layers[].rows[].keys[]",
      "touchLayout.nodeIds[]",
    ]);
    expect(node!.inputPaths).toEqual([]);
  });

  it("touch_seed_source is spine:false and projects as a fork/join into `touch`, NOT a spine step", () => {
    const seed = stepNode(TOUCH_SEED_ID);
    expect(seed).toBeDefined();
    expect(seed!.spine).toBe(false);
    expect(seed!.joinTarget).toBe(TOUCH_ID);

    // A join edge runs touch_seed_source → touch; a fork edge reaches it from the
    // preceding spine step. Neither is a spine edge out of the seed node.
    expect(
      stepGraph.edges.some((e) => e.kind === "join" && e.from === TOUCH_SEED_ID && e.to === TOUCH_ID),
    ).toBe(true);
    expect(stepGraph.edges.some((e) => e.kind === "fork" && e.to === TOUCH_SEED_ID)).toBe(true);
    expect(stepGraph.edges.some((e) => e.kind === "spine" && e.from === TOUCH_SEED_ID)).toBe(false);

    // In the rendered projection the fork/join edges are "default" (dashed), never
    // a "linear" spine edge — the seed is a side-trail, not on the spine.
    const renderedSeedEdges = projection.edges.filter(
      (e) => e.from === TOUCH_SEED_ID || e.to === TOUCH_SEED_ID,
    );
    expect(renderedSeedEdges.length).toBeGreaterThan(0);
    for (const e of renderedSeedEdges) {
      expect(e.kind).toBe("default");
    }
  });
});

// ---------------------------------------------------------------------------
// T017 / T019 — Phase-1 invariant guards on the map/contract surface.
// ---------------------------------------------------------------------------

describe("spec 021 T017/T019 — invariant guards: no contracts bump, no new field, no re-declaration (FR-015)", () => {
  it("T019 — exactly one manifest entry per gallery (no re-declaration; this spec added none)", () => {
    for (const id of [CARVE_ID, MECHANISMS_ID, TOUCH_ID, TOUCH_SEED_ID]) {
      expect(manifest.filter((s) => s.id === id), `duplicate manifest entry for "${id}"`).toHaveLength(1);
    }
  });

  it("T019 — exactly one projected node per gallery (the projection is a bijection over manifest steps)", () => {
    for (const id of [CARVE_ID, MECHANISMS_ID, TOUCH_ID, TOUCH_SEED_ID]) {
      expect(projection.nodes.filter((n) => n.id === id)).toHaveLength(1);
    }
  });

  it("T017 — every declared gallery write path is an existing irPath() location (no new KeyboardIR field)", () => {
    // CARVE/ADD/TOUCH writes are all expressible via formatIRPath over existing
    // KeyboardIR roots (groups/stores/raw/touchLayout) — no new contract field.
    const allWrites = [...CARVE_WRITES, ...ADD_GALLERY_WRITES, ...TOUCH_WRITES].map(formatIRPath);
    const allowedRoots = ["groups", "stores", "raw", "touchLayout"];
    for (const w of allWrites) {
      const root = w.split(/[.[]/)[0];
      expect(allowedRoots, `unexpected write root in "${w}"`).toContain(root);
    }
    // header is never a gallery write target (carve/mechanisms/touch never touch it).
    expect(allWrites.some((w) => w.startsWith("header"))).toBe(false);
  });
});

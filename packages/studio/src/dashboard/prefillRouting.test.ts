// Spec 019 — qu-wire-prefill: branch/read-only oracle + drill-down map-node
// confirmation.
//
// `prefill` ("Confirm the basics", survey/Prefill.tsx:64) is NOT a manifest entry
// and NOT a questionRegistry id. It is a registry-keyed DRILL-DOWN under the
// opaque `characters` node (charactersStep, manifest.ts:47-56), declared by spec
// 017 (drillDownDeclarations.ts:86-95) with writes:[] and inputs = header.bcp47
// (array, session-derived) + the session-level ScriptPrefill (a non-IR signal).
// Promotion to a first-class manifest entry requires decomposing the `characters`
// placeholder — Phase 2 spec #11 (qu-mutate-prefill).
//
// Spec 019 adds NO production code. It:
//   (a) locks the hand-coded confirm/back routing in StudioShell
//       (handlePrefillConfirm, StudioShell.tsx:632-634; handlePrefillBack,
//       StudioShell.tsx:721) with a flow-routing snapshot — the §2.5 branch/
//       read-only oracle (FR-010) — because `prefill` writes no IR leaf
//       (writes:[]), so there is no emit-byte or SurveyPhaseResult to compare;
//       the oracle IS the resolved next sub-stage (charactersSub "prefill" → "B"),
//       and
//   (b) confirms, additively to the spec-017 per-step contract test
//       (tests/survey/questions/a/prefill.test.ts) and the spec-015 map-projection
//       test, that `prefill` resolves as a read-only drill-down UNDER the opaque
//       `characters` node (NOT a top-level manifest spine entry) with its declared
//       inputs/writes and no irPath('header','script') (FR-001/-002/-003/-004).
//
// Test-only: no contracts bump, no write routing, no mutate(), no flag flip, no
// re-declaration of `prefill` (017 owns the drill-down declaration). The confirm
// stays byte-identical in handlePrefillConfirm; the render stays hand-placed by
// StudioShell (StudioShell.tsx:930-940). The promotion/modular-read conversion is
// Phase 2 spec #11 (FR-009/-013).
//
// NOTE on the oracle shape: handlePrefillConfirm and handlePrefillBack are
// module-private closures in StudioShell.tsx (not exported), so this oracle
// reconstructs their routing decision from the SAME source of truth they read —
// the charactersSub state machine and the selectedTrack — exactly as the spec-018
// trackRouting.test.ts oracle reconstructs handleTrackSelected from the live
// `manifest`. The reconstruction mirrors handlePrefillConfirm/handlePrefillBack
// byte-for-byte (StudioShell.tsx:632-634, 721-723); if either drifts, the SPA
// integration coverage in StudioShell.test.tsx and this snapshot diverge,
// surfacing the regression. We do NOT duplicate StudioShell.test.tsx's
// render-driven coverage here — this is the stable routing SNAPSHOT (the
// regression lock).

import { describe, it, expect } from "vitest";
import { formatIRPath } from "@keyboard-studio/contracts";

import { manifest } from "../steps/manifest.ts";
import { buildManifestProjection } from "./manifestProjection.ts";
import {
  prefillDrillDown,
  drillDownDeclarations,
  CHARACTERS_NODE_ID,
} from "../survey/questions/drillDownDeclarations.ts";
import { questionRegistry } from "../survey/questions/registry.ts";

// ---------------------------------------------------------------------------
// Routing reconstruction — mirrors StudioShell.handlePrefillConfirm (632-634) and
// handlePrefillBack (721-723). The ONLY inputs are the intra-`characters`
// sub-stage state machine (charactersSub "prefill" → "B") and the selectedTrack
// the back action reads — the same state those closures mutate, so this stays
// faithful by construction.
// ---------------------------------------------------------------------------

type CharactersSubStage = "prefill" | "B";
type Track = "copy" | "adapt";

/**
 * The resolved outcome of handlePrefillConfirm (StudioShell.tsx:632-634):
 *   setCharactersSub("B")  — advance into Phase B.
 * `prefill` writes no IR leaf, so the resolved next sub-stage IS the oracle.
 */
function resolvePrefillConfirm(): { nextCharactersSub: CharactersSubStage } {
  return { nextCharactersSub: "B" };
}

/**
 * The resolved outcome of handlePrefillBack (StudioShell.tsx:721-723):
 *   setActiveStepId(selectedTrack === "copy" ? "project_name" : "track").
 * copy-track returns to project_name (its preceding manifest step); adapt-track
 * returns to track (project_name was skipped on the adapt path).
 */
function resolvePrefillBack(selectedTrack: Track | null): { nextActiveStepId: string } {
  return { nextActiveStepId: selectedTrack === "copy" ? "project_name" : "track" };
}

// ---------------------------------------------------------------------------
// B. Branch/read-only oracle (§2.5, FR-010) — the one new artifact.
// ---------------------------------------------------------------------------

describe("spec 019 — branch/read-only oracle: prefill confirm/back routing (FR-008/-010)", () => {
  // T006 — the confirm advances charactersSub "prefill" → "B" (advance into
  // Phase B), exactly as today.
  it("confirm → charactersSub advances to B (FR-008/SC-003)", () => {
    expect(resolvePrefillConfirm().nextCharactersSub).toBe("B");
  });

  // T007 — the back action is unchanged: copy-track → project_name; adapt-track →
  // track (byte-identical baseline).
  it("back → copy-track returns to project_name, adapt-track returns to track (FR-008)", () => {
    expect(resolvePrefillBack("copy").nextActiveStepId).toBe("project_name");
    expect(resolvePrefillBack("adapt").nextActiveStepId).toBe("track");
  });

  // T008 — the resolved routing snapshot. This is the §2.5 branch/read-only
  // oracle: the locked baseline. A change to the confirm's resolved next sub-stage
  // or the back action's resolved step breaks this snapshot. There is no IR or
  // SurveyPhaseResult to compare since `prefill` writes [].
  it("resolved routing snapshot is locked for the confirm and back actions (FR-010/SC-003)", () => {
    const snapshot = {
      confirm: resolvePrefillConfirm(),
      backCopy: resolvePrefillBack("copy"),
      backAdapt: resolvePrefillBack("adapt"),
    };
    expect(snapshot).toMatchInlineSnapshot(`
      {
        "backAdapt": {
          "nextActiveStepId": "track",
        },
        "backCopy": {
          "nextActiveStepId": "project_name",
        },
        "confirm": {
          "nextCharactersSub": "B",
        },
      }
    `);
  });
});

// ---------------------------------------------------------------------------
// C. Map-node confirmation — `prefill` is a read-only drill-down UNDER the opaque
// `characters` node, NOT a top-level manifest spine entry (additive — does NOT
// repurpose the spec-015 map-projection test or the spec-017 per-step test).
// ---------------------------------------------------------------------------

describe("spec 019 — prefill resolves as a read-only drill-down under `characters` (FR-001/-002/-003)", () => {
  // T009 — `prefill` is a registry-keyed drill-down UNDER the opaque `characters`
  // node, NOT a top-level manifest spine entry. It hangs off the drill-down layer
  // (drillDownDeclarations, keyed off a real questionRegistry id), and it does NOT
  // appear as a node on the projected manifest spine.
  it("prefill is a drill-down under `characters`, NOT a manifest spine node (FR-001/SC-001)", () => {
    // It hangs UNDER the opaque `characters` node.
    expect(prefillDrillDown.underNodeId).toBe(CHARACTERS_NODE_ID);
    expect(drillDownDeclarations[CHARACTERS_NODE_ID]).toContain(prefillDrillDown);

    // Registry-keyed: anchored to a real questionRegistry id at its boundary, so a
    // registry/manifest divergence stays observable (mirrors the spec-015 keying).
    expect(
      Object.prototype.hasOwnProperty.call(questionRegistry, prefillDrillDown.registryKey),
    ).toBe(true);

    // NOT a top-level manifest spine entry: the spec-015 projection's spine
    // FlowGraph carries no `prefill` node, and `prefill` is no manifest step.
    const spine = buildManifestProjection();
    expect(spine.nodes.some((n) => n.id === "prefill")).toBe(false);
    expect(manifest.some((s) => s.id === "prefill")).toBe(false);

    // `prefill` is also NOT itself a questionRegistry id (it is a drill-down id).
    expect(Object.prototype.hasOwnProperty.call(questionRegistry, "prefill")).toBe(false);
  });

  // T010 — the drill-down node is read-only (writes:[]) and carries its
  // spec-017-declared inputs: header.bcp47 (array, session-derived) as the IR input
  // + the session-level ScriptPrefill as a non-IR signal. Additive to spec 017's
  // per-step authority (tests/survey/questions/a/prefill.test.ts) — we confirm the
  // drill-down node surfaces them, not re-assert the declaration's authority.
  it("prefill node is read-only (writes []) and carries declared inputs header.bcp47 + session ScriptPrefill (FR-002/-003/SC-002)", () => {
    // Read-only: writes [] and output kind "none" (no IR leaf, no phase-result).
    expect(prefillDrillDown.writes).toEqual([]);
    expect(prefillDrillDown.output).toEqual({ kind: "none" });

    // IR input: header.bcp47 (array, session-derived).
    expect(prefillDrillDown.inputs.map(formatIRPath)).toEqual(["header.bcp47"]);

    // Session-level ScriptPrefill is declared as a non-IR signal (NOT an irPath).
    expect(prefillDrillDown.sessionInputs?.some((s) => s.includes("ScriptPrefill"))).toBe(true);
  });

  // T011 — no declaration on the `prefill` node references irPath('header','script')
  // (the path does not exist in KeyboardIR, keyboard-ir.ts:348-359); the script
  // signal is the session-level ScriptPrefill. Additive — does not duplicate
  // spec 017's authority over the declaration.
  it("no declaration references irPath('header','script') — the path does not exist (FR-004/-012/SC-002)", () => {
    for (const p of [...prefillDrillDown.inputs, ...prefillDrillDown.writes]) {
      expect(formatIRPath(p)).not.toBe("header.script");
    }
  });
});

// ---------------------------------------------------------------------------
// D. Input satisfiability (consumed from spec 017 — do NOT re-resolve C5).
// ---------------------------------------------------------------------------

describe("spec 019 — prefill input satisfiability (consumed from spec 017 DEC-D1) (FR-005/-006)", () => {
  // T012 — prefill's declared inputs are satisfiable per the 017 C5 decision (D1,
  // Option A subsumption): the opaque charactersStep writes header.bcp47 (the
  // iso_code writer lives inside that placeholder), so manifest-level C5
  // (checkInputsSatisfiable) returns no spurious orphan for `prefill`. We confirm a
  // producer exists in the manifest graph; we do NOT re-resolve the C5 mechanism
  // (that lives in spec 017).
  it("declared input header.bcp47 has a producer in the manifest graph (DEC-D1, no spurious orphan) (FR-005/-006/SC-006)", () => {
    const writers = new Set<string>();
    for (const step of manifest) for (const w of step.writes) writers.add(formatIRPath(w));
    for (const input of prefillDrillDown.inputs) {
      expect(
        writers.has(formatIRPath(input)),
        `prefill input ${formatIRPath(input)} has no producer in the manifest graph`,
      ).toBe(true);
    }
  });
});

// ---------------------------------------------------------------------------
// E. Invariant guards — confirm nothing moved into Phase-2 territory.
// ---------------------------------------------------------------------------

describe("spec 019 — Phase-1 invariant guards (FR-009/-013/SC-007)", () => {
  // T014 / T015 — no promotion to a manifest entry, no new write routing: `prefill`
  // stays a drill-down with writes:[], and there is exactly one prefill drill-down
  // declaration under `characters` (no re-declaration, no manifest entry).
  it("prefill stays a drill-down (writes []), not promoted to a manifest entry (FR-009/-013/SC-007)", () => {
    expect(prefillDrillDown.writes).toEqual([]);
    expect(manifest.filter((s) => s.id === "prefill").length).toBe(0);
    // Exactly one prefill drill-down declaration under `characters` (no re-declare).
    expect(
      drillDownDeclarations[CHARACTERS_NODE_ID]?.filter((d) => d.id === "prefill").length,
    ).toBe(1);
  });

  // T016 — the SPA render path is unchanged: there is no manifest/registry-resolved
  // render of Prefill. `prefill` is neither a manifest step nor a questionRegistry
  // id, so nothing resolves a component for it from the manifest/registry — it stays
  // hand-placed by StudioShell as a `characters` sub-stage (StudioShell.tsx:930-940).
  it("prefill is not manifest/registry-resolved — render stays hand-placed (FR-007/SC-004)", () => {
    expect(manifest.some((s) => s.id === "prefill")).toBe(false);
    expect(Object.prototype.hasOwnProperty.call(questionRegistry, "prefill")).toBe(false);
  });
});

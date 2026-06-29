// Spec 020 — qu-wire-buildlist: SurveyPhaseResult oracle + drill-down map-node
// confirmation.
//
// pb_build_list is the hand-built BuildListView (survey/PhaseB.tsx:535, mounted
// ~692), reached behind the MANDATORY IntroChooser discovery-method gate. Per the
// merged spec-016 guardrail and spec-017 declaration (drillDownDeclarations.ts),
// `pb_build_list` is a DECLARED-ONLY drill-down descriptor — NOT a questionRegistry
// id and NOT itself reachable. The reachable/rendered node at that gate is the
// registry id `pb_discovery_intro` (the IntroChooser), and `pb_build_list` is the
// build-list-branch descriptor anchored to it via registryKey: "pb_discovery_intro".
// (Reconciliation I1, dated 2026-06-29.) Promotion to a first-class manifest entry
// is Phase 2 (qu-mutate-buildlist-loop, spec #12).
//
// Spec 020 adds NO production code. It:
//   (a) locks the build-list path's confirmed-inventory OUTPUT — which rides on
//       SurveyPhaseResult.confirmedInventory (PhaseB.tsx:610), unioned via
//       mergePhaseResults — with the §2.5 SurveyPhaseResult oracle (FR-009).
//       Because the build-list path writes NO KeyboardIR leaf (writes:[]), the
//       oracle IS the produced confirmedInventory union, NOT an emit-byte or
//       flow-routing comparison.
//
//       Per reconciliation U1 (2026-06-29) the oracle is a CONCRETE committed
//       baseline: an inline snapshot (toMatchInlineSnapshot, mirroring spec 019's
//       prefillRouting.test.ts) of the POST-mergePhaseResults deduped /
//       NFC-normalised confirmedInventory UNION for a FIXED input sequence — NOT a
//       raw per-phase confirmedInventory array. The fixed input deliberately
//       includes a duplicate, a whitespace-only token, and an NFD entry so the
//       committed snapshot pins the dedup + NFC normalisation + empties-dropped
//       contract mergePhaseResults applies, and
//   (b) confirms, additively to the spec-017 per-step contract test
//       (tests/survey/questions/b/pb_build_list.test.ts) and the spec-015
//       map-projection test, that the `pb_build_list` descriptor surfaces as a
//       drill-down UNDER the opaque `characters` node of the map projection, with
//       its registry anchor `pb_discovery_intro` as the reachable node and the
//       `pb_*` step-by-step battery as the other branch off the SAME anchor
//       (FR-001/-002/-003).
//
// Test-only: no contracts bump, no write routing, no mutate(), no flag flip, no
// re-declaration of `pb_build_list` (017 owns the drill-down descriptor). The
// BuildListView render/onComplete stay byte-identical (StudioShell/PhaseB keep
// hand-placing it). The mutate()/per-grapheme-loop move is Phase 2 spec #12
// (FR-012).
//
// Per reconciliation C1 (2026-06-29): the descriptor-SHAPE facts (underNodeId,
// the registryKey anchor, NOT-a-registry/manifest-id, writes:[], the
// phase-result-field output, no header.script, header.bcp47 satisfiability and
// survey-reach of the anchor) are ALREADY ratified by spec-017's
// tests/survey/questions/b/pb_build_list.test.ts. This file REFERENCES that test
// and asserts only the genuinely additive facts — the runtime oracle (a) and the
// map-projection surfacing (b) — without re-litigating the descriptor shape.

import { describe, it, expect } from "vitest";
import { formatIRPath, mergePhaseResults } from "@keyboard-studio/contracts";
import type { SurveyPhaseResult } from "@keyboard-studio/contracts";

import { manifest } from "../steps/manifest.ts";
import {
  buildManifestProjection,
  CHARACTERS_STEP_ID,
} from "./manifestProjection.ts";
import {
  pbBuildListDrillDown,
  prefillDrillDown,
  drillDownDeclarations,
  CHARACTERS_NODE_ID,
} from "../survey/questions/drillDownDeclarations.ts";
import { questionRegistry } from "../survey/questions/registry.ts";

// ---------------------------------------------------------------------------
// B. SurveyPhaseResult oracle (§2.5, FR-009) — the one new artifact.
//
// Reconstructs the build-list completion the SAME way BuildListView.onComplete
// does (PhaseB.tsx:607-611): a Phase-B SurveyPhaseResult whose confirmedInventory
// is the chosen grapheme set. The render-driven coverage (ticking suggestions /
// typing chips / Done) lives in BuildListView.test.tsx; this is the stable
// phase-result OUTPUT snapshot (the regression lock), driven from a fixed input
// so the committed baseline is reproducible.
// ---------------------------------------------------------------------------

// A FIXED build-list completion input (the confirmedInventory BuildListView would
// emit). Deliberately exercises every normalisation rule mergePhaseResults applies:
//   - "a" appears twice          → dedup, first-appearance order
//   - "   " is whitespace-only   → dropped
//   - "é" is NFD (e + combining acute) → NFC-normalised to "é"
const FIXED_BUILD_LIST_INPUT: readonly string[] = [
  "a",
  "b",
  "a", // duplicate of the first entry
  "   ", // whitespace-only — dropped
  "c",
  "é", // NFD "é" — NFC-normalised
];

/** The Phase-B result BuildListView.onComplete produces (PhaseB.tsx:607-611). */
function buildListPhaseResult(inventory: readonly string[]): SurveyPhaseResult {
  return {
    phase: "B",
    answers: [],
    confirmedInventory: [...inventory],
  };
}

describe("spec 020 — SurveyPhaseResult oracle: build-list confirmedInventory union (FR-009/SC-003)", () => {
  // T006/T007 — the produced confirmedInventory union (post mergePhaseResults) for
  // the fixed build-list input, pinned as a CONCRETE committed inline snapshot
  // (U1). This is the §2.5 SurveyPhaseResult oracle: the deduped + NFC-normalised +
  // empties-dropped UNION, NOT the raw per-phase array. Any change to the produced
  // inventory (or to mergePhaseResults' normalisation) breaks this snapshot.
  it("merged confirmedInventory union is the committed deduped/NFC baseline (FR-006/-009/SC-003)", () => {
    const phase = buildListPhaseResult(FIXED_BUILD_LIST_INPUT);
    const session = mergePhaseResults({}, [phase]);

    // The POST-mergePhaseResults union — NOT the raw per-phase confirmedInventory.
    expect(session.confirmedInventory).toMatchInlineSnapshot(`
      [
        "a",
        "b",
        "c",
        "é",
      ]
    `);

    // Belt-and-braces on the normalisation contract the snapshot encodes:
    // every entry is NFC, deduped, and no empties survived.
    for (const g of session.confirmedInventory) {
      expect(g).toBe(g.normalize("NFC"));
      expect(g.trim().length).toBeGreaterThan(0);
    }
    expect(new Set(session.confirmedInventory).size).toBe(session.confirmedInventory.length);
  });

  // T008 — the build-list path writes NO KeyboardIR leaf. Its declared output is a
  // phase-result field (confirmedInventory), not an irPath() write — so the merged
  // SurveySession carries the inventory and `writes` is []. There is no mutate() /
  // IR write route on this path (Phase-1 invariant; the mutate()/loop move is
  // Phase 2 spec #12).
  it("build-list output rides on confirmedInventory, NOT a KeyboardIR write (FR-005/-009/SC-003)", () => {
    // The declared output is a phase-result field, never an irPath() write.
    expect(pbBuildListDrillDown.writes).toEqual([]);
    expect(pbBuildListDrillDown.output).toEqual({
      kind: "phase-result-field",
      field: "confirmedInventory",
    });

    // The inventory surfaces on the merged SurveySession's confirmedInventory — the
    // phase-result surface — exactly as the production onComplete path produces it.
    const session = mergePhaseResults({}, [buildListPhaseResult(FIXED_BUILD_LIST_INPUT)]);
    expect(session.confirmedInventory.length).toBeGreaterThan(0);
  });
});

// ---------------------------------------------------------------------------
// C. Map-node confirmation — the `pb_build_list` descriptor surfaces as a
// drill-down UNDER the opaque `characters` node of the map projection, anchored to
// the IntroChooser gate `pb_discovery_intro`. ADDITIVE: the descriptor-shape facts
// are owned by spec-017's pb_build_list.test.ts (C1) — referenced here, not
// re-asserted.
// ---------------------------------------------------------------------------

describe("spec 020 — build-list branch surfaces as a drill-down under `characters` (FR-001/-002/-003)", () => {
  // T009 — the `pb_build_list` descriptor surfaces on the MAP PROJECTION as a
  // drill-down hung under the opaque `characters` node, and is NOT a top-level
  // manifest spine node. (The descriptor-shape facts — underNodeId, the anchor,
  // NOT-a-registry/manifest-id — are ratified by pb_build_list.test.ts:86-98;
  // this asserts the additive projection-surfacing fact.)
  it("pb_build_list surfaces under the projected `characters` node, NOT on the manifest spine (FR-001/-002/SC-001)", () => {
    // The build-list descriptor hangs under the opaque `characters` node — the same
    // node id the spec-015 map projection attaches its registry-keyed drill-down
    // layer under (CHARACTERS_STEP_ID === CHARACTERS_NODE_ID). So a Flow Map render
    // surfaces the descriptor as a drill-down under the projected `characters` node.
    const charactersDrillDowns = drillDownDeclarations[CHARACTERS_NODE_ID] ?? [];
    expect(charactersDrillDowns).toContain(pbBuildListDrillDown);
    expect(pbBuildListDrillDown.underNodeId).toBe(CHARACTERS_NODE_ID);
    // The descriptor table and the map projection key off the SAME `characters`
    // node id, so the drill-down surfaces under the projected node.
    expect(CHARACTERS_NODE_ID).toBe(CHARACTERS_STEP_ID);

    // NOT a top-level manifest spine entry: the projected spine carries no
    // `pb_build_list` node and `pb_build_list` is no manifest step.
    const spine = buildManifestProjection();
    expect(spine.nodes.some((n) => n.id === "pb_build_list")).toBe(false);
    expect(manifest.some((s) => s.id === "pb_build_list")).toBe(false);
  });

  // T009 (cont.) / I1 — the reachable/rendered node at the gate is the registry
  // anchor `pb_discovery_intro` (the IntroChooser); `pb_build_list` is the
  // declared-only descriptor anchored to it, NOT itself a registry id.
  it("the reachable node is the anchor `pb_discovery_intro`; pb_build_list is the descriptor anchored to it (I1, FR-001)", () => {
    expect(pbBuildListDrillDown.registryKey).toBe("pb_discovery_intro");
    // The anchor IS a real, reachable questionRegistry id (the IntroChooser gate).
    expect(
      Object.prototype.hasOwnProperty.call(questionRegistry, "pb_discovery_intro"),
    ).toBe(true);
    // `pb_build_list` itself is NOT a questionRegistry id (declared-only descriptor).
    expect(
      Object.prototype.hasOwnProperty.call(questionRegistry, "pb_build_list"),
    ).toBe(false);
  });

  // T010 — the IntroChooser gate `pb_discovery_intro` is the SHARED anchor off
  // which the build-list branch (the pb_build_list descriptor / BuildListView) and
  // the step-by-step branch (the pb_* battery) both hang. Both branches are keyed
  // off the SAME gate. (The pb_* battery is the modular-flow questions reached from
  // the same `pb_discovery_intro` entry; this spec does NOT touch it — its
  // demotion/move is spec 022.)
  it("both branches hang off the SAME IntroChooser anchor `pb_discovery_intro` (FR-003/SC-002)", () => {
    // The build-list branch descriptor is anchored to the gate.
    expect(pbBuildListDrillDown.registryKey).toBe("pb_discovery_intro");
    // The step-by-step battery is reached from the same gate id: the modular flow's
    // discovery-intro question (pb_discovery_intro) is the shared entry. We assert
    // the gate id is a real questionRegistry id (the shared branch point); the pb_*
    // battery membership/non-demotion is owned by spec 022 and the modular YAML —
    // not re-litigated here.
    expect(
      Object.prototype.hasOwnProperty.call(questionRegistry, "pb_discovery_intro"),
    ).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// E. Invariant guards — confirm nothing moved into Phase-2 territory.
// ---------------------------------------------------------------------------

describe("spec 020 — Phase-1 invariant guards (FR-012/SC-007)", () => {
  // T016 — no promotion to a manifest entry or a questionRegistry id: pb_build_list
  // stays a declared-only drill-down descriptor under `characters`, anchored to
  // pb_discovery_intro, with writes:[]. Exactly one pb_build_list descriptor under
  // `characters` (no re-declaration — 017 owns it). The manifest/registry-absence
  // facts overlap pb_build_list.test.ts:94-98 (C1) — confirmed here as the
  // invariant guard for THIS spec's diff, not as a re-litigation.
  it("pb_build_list stays a drill-down descriptor (writes []), not promoted (FR-012/SC-007)", () => {
    expect(pbBuildListDrillDown.writes).toEqual([]);
    expect(manifest.filter((s) => s.id === "pb_build_list").length).toBe(0);
    expect(
      Object.prototype.hasOwnProperty.call(questionRegistry, "pb_build_list"),
    ).toBe(false);
    // Exactly one pb_build_list descriptor under `characters` (no re-declare); the
    // sibling prefill descriptor is unchanged.
    const charactersDrillDowns = drillDownDeclarations[CHARACTERS_NODE_ID] ?? [];
    expect(charactersDrillDowns.filter((d) => d.id === "pb_build_list").length).toBe(1);
    expect(charactersDrillDowns).toContain(prefillDrillDown);
  });

  // T012/T008 (guard) — no irPath('header','script') is declared on the build-list
  // descriptor (the path does not exist); the script/CLDR signals are non-IR
  // session signals. Overlaps pb_build_list.test.ts:113-117 (C1) — guarded here for
  // this spec's invariant set.
  it("no declaration references irPath('header','script') (FR-012)", () => {
    for (const p of [...pbBuildListDrillDown.inputs, ...pbBuildListDrillDown.writes]) {
      expect(formatIRPath(p)).not.toBe("header.script");
    }
  });
});

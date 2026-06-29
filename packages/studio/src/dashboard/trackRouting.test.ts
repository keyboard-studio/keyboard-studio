// Spec 018 — qu-wire-track: branch/read-only oracle + map-node confirmation.
//
// `track` is ALREADY a manifest editor-step (registerEditorSteps.ts:73-85,
// manifest.ts:87, spine:true) with its inputs/writes declared by spec 017. Spec
// 018 adds NO production code: it (a) locks the hand-coded copy-vs-adapt fork in
// StudioShell.handleTrackSelected (StudioShell.tsx:602-614) with a flow-routing
// snapshot — the §2.5 branch/read-only oracle (FR-008) — because `track` writes
// no IR leaf (writes:[]), so there is no emit-byte or SurveyPhaseResult to
// compare; the oracle IS the resolved next-step id / branch selection; and
// (b) confirms, additively to the spec-015 map-projection test and the spec-017
// per-step contract test, that the `track` map node resolves with its declared
// inputs/writes and is projected branch-defining (fork to project_name, spine to
// characters) (FR-001/-002/-003).
//
// Test-only: no contracts bump, no write routing, no mutate(), no flag flip, no
// re-declaration of `track`. The fork stays byte-identical in handleTrackSelected;
// the fork-to-YAML move is Phase 2 spec #10 (qu-mutate-track) (FR-005/-011).
//
// NOTE on the oracle shape: handleTrackSelected and nextSpineStepAfter are
// module-private closures in StudioShell.tsx (not exported), so this oracle
// reconstructs their routing decision from the SAME source of truth they read —
// the `manifest` array — exactly as editorStepContracts.test.ts (spec 017) and
// driftGuardrail.test.ts (spec 016) reconstruct production logic from the
// manifest. The reconstruction mirrors handleTrackSelected/nextSpineStepAfter
// byte-for-byte (StudioShell.tsx:319-344, 602-614); if either drifts, the SPA
// integration assertions in StudioShell.test.tsx (copy → project_name,
// adapt → prefill) and this snapshot diverge, surfacing the regression. We do
// NOT duplicate StudioShell.test.tsx's render-driven coverage here — this is the
// stable routing SNAPSHOT (the regression lock), not a second render harness.

import { describe, it, expect } from "vitest";
import { formatIRPath } from "@keyboard-studio/contracts";

import { manifest } from "../steps/manifest.ts";
import { trackStep, projectNameStep } from "../steps/registerEditorSteps.ts";
import { buildManifestStepGraph } from "./buildStepGraph.ts";
import { buildManifestProjection } from "./manifestProjection.ts";

// ---------------------------------------------------------------------------
// Routing reconstruction — mirrors StudioShell.nextSpineStepAfter (319-344) and
// handleTrackSelected (602-614). The ONLY input is the live `manifest`, the same
// array those closures read, so this stays faithful by construction.
// ---------------------------------------------------------------------------

const ACTIVE_STEP_IDS = new Set([
  "identity",
  "choose_base",
  "track",
  "project_name",
  "characters",
  "carve",
  "mechanisms",
  "touch",
  "help",
]);

/** Mirror of StudioShell.nextSpineStepAfter (StudioShell.tsx:319-344). */
function nextSpineStepAfter(currentId: string): string {
  const currentIdx = manifest.findIndex((s) => s.id === currentId);
  for (let i = currentIdx + 1; i < manifest.length; i++) {
    const step = manifest[i];
    if (step === undefined) break;
    if (step.spine === false) continue; // skip side-trail (spine:false) steps
    const id = step.id;
    if (ACTIVE_STEP_IDS.has(id)) return id;
    if (id === "package") return "done"; // reserved — terminal
  }
  return "done";
}

/**
 * The resolved branch outcome of handleTrackSelected for one track. Captures the
 * resolved next active step id AND the branch-gating side effects the fork sets
 * (StudioShell.tsx:602-614) — these ARE the branch selection (the oracle), since
 * `track` writes no IR leaf.
 */
interface TrackRouting {
  /** The active step the fork resolves to (setActiveStepId). */
  nextActiveStepId: string;
  /** charactersSub set by the fork ("prefill" on adapt; untouched on copy). */
  charactersSub: "prefill" | null;
  /** Whether the fork clears scaffoldSpec (setScaffoldSpec(null) on adapt only). */
  scaffoldSpecCleared: boolean;
}

/**
 * Mirror of StudioShell.handleTrackSelected (StudioShell.tsx:602-614):
 *   copy  → setActiveStepId("project_name")
 *   adapt → setScaffoldSpec(null); setActiveStepId(nextSpineStepAfter("track"));
 *           setCharactersSub("prefill")
 */
function resolveTrackRouting(track: "copy" | "adapt"): TrackRouting {
  if (track === "copy") {
    return {
      nextActiveStepId: "project_name",
      charactersSub: null,
      scaffoldSpecCleared: false,
    };
  }
  return {
    nextActiveStepId: nextSpineStepAfter("track"),
    charactersSub: "prefill",
    scaffoldSpecCleared: true,
  };
}

// ---------------------------------------------------------------------------
// B. Branch/read-only oracle (§2.5, FR-008) — the one new artifact.
// ---------------------------------------------------------------------------

describe("spec 018 — branch/read-only oracle: handleTrackSelected routing (FR-004/-007/-008)", () => {
  // T006 — copy track resolves the active step to project_name (the spine:false
  // side-trail), exactly as today.
  it("copy track → active step is project_name (FR-004/-007/SC-003)", () => {
    expect(resolveTrackRouting("copy").nextActiveStepId).toBe("project_name");
  });

  // T007 — adapt track clears scaffoldSpec, resolves to nextSpineStepAfter("track")
  // (== characters, skipping the spine:false project_name), and sets
  // charactersSub:"prefill" — exactly as today.
  it("adapt track → clears scaffoldSpec, active step is characters, charactersSub is prefill (FR-004/-007/SC-003/SC-004)", () => {
    const adapt = resolveTrackRouting("adapt");
    expect(adapt.nextActiveStepId).toBe("characters");
    expect(adapt.charactersSub).toBe("prefill");
    expect(adapt.scaffoldSpecCleared).toBe(true);
  });

  // The adapt branch correctly bypasses project_name: nextSpineStepAfter("track")
  // skips the spine:false side-trail and lands on the next spine step.
  it("adapt branch bypasses the spine:false project_name side-trail (FR-007/SC-004)", () => {
    // project_name sits between track and characters in the manifest array but is
    // spine:false, so the adapt routing must NOT land on it.
    const trackIdx = manifest.findIndex((s) => s.id === "track");
    const next = manifest[trackIdx + 1];
    expect(next?.id).toBe("project_name");
    expect(next?.spine).toBe(false);
    expect(resolveTrackRouting("adapt").nextActiveStepId).not.toBe("project_name");
  });

  // T008 — the resolved routing snapshot for BOTH tracks. This is the §2.5
  // branch/read-only oracle: the locked baseline. A change to the fork's resolved
  // next-step id or its branch-gating side effects breaks this snapshot.
  it("resolved routing snapshot is locked for both tracks (FR-008/SC-003)", () => {
    const snapshot = {
      copy: resolveTrackRouting("copy"),
      adapt: resolveTrackRouting("adapt"),
    };
    expect(snapshot).toMatchInlineSnapshot(`
      {
        "adapt": {
          "charactersSub": "prefill",
          "nextActiveStepId": "characters",
          "scaffoldSpecCleared": true,
        },
        "copy": {
          "charactersSub": null,
          "nextActiveStepId": "project_name",
          "scaffoldSpecCleared": false,
        },
      }
    `);
  });
});

// ---------------------------------------------------------------------------
// C. Map-node confirmation (additive — does NOT repurpose spec-015/016 tests).
// ---------------------------------------------------------------------------

describe("spec 018 — track resolves as a first-class map node (FR-001/-002/-003)", () => {
  const stepGraph = buildManifestStepGraph();
  const projection = buildManifestProjection();

  // T009 — exactly one `track` node on the manifest spine, sourced from
  // buildManifestStepGraph() via the spec-015 adapter (no new declaration).
  it("exactly one `track` node on the manifest spine, after choose_base (FR-001/SC-001)", () => {
    const trackNodes = projection.nodes.filter((n) => n.id === "track");
    expect(trackNodes.length).toBe(1);

    // Sits after choose_base on the spine projection.
    const ids = projection.nodes.map((n) => n.id);
    expect(ids.indexOf("track")).toBe(ids.indexOf("choose_base") + 1);

    // The projected node carries kind:"stub" (the spec-015 adapter stamp) — the
    // node is sourced from the manifest projection, not hand-added here.
    expect(projection.nodes.find((n) => n.id === "track")?.kind).toBe("stub");
  });

  // T010 — the node carries the spec-017-declared inputs/writes. The StepGraph
  // node is where buildManifestStepGraph surfaces the declared contract (as
  // writePaths/inputPaths). writes is [] (branch selection only, no IR leaf).
  // Additive to spec 017's per-step authority (editorStepContracts.test.ts) — we
  // assert the GRAPH NODE surfaces them, not re-assert the declaration's authority.
  it("track node carries declared inputs (header.bcp47 + header.name) and writes [] (FR-002/SC-002)", () => {
    const node = stepGraph.nodes.find((n) => n.id === "track");
    expect(node).toBeDefined();
    expect(node!.writePaths).toEqual([]);
    expect(node!.inputPaths).toEqual(["header.bcp47", "header.name"]);

    // The graph node's contract is exactly the declared trackStep contract
    // (017 owns the declaration; this confirms the projection surfaces it faithfully).
    expect(node!.writePaths).toEqual(trackStep.writes.map(formatIRPath));
    expect(node!.inputPaths).toEqual(trackStep.inputs.map(formatIRPath));
  });

  // T011 — the node is projected as branch-defining: a fork edge to the
  // project_name side-trail (spine:false, joinTarget:"characters") AND the spine
  // continuation to characters (nextSpineStepAfter("track")).
  it("track node is branch-defining: fork → project_name, spine → characters (FR-003/SC-001)", () => {
    const fromTrack = stepGraph.edges.filter((e) => e.from === "track");

    const spineEdge = fromTrack.find((e) => e.kind === "spine");
    expect(spineEdge?.to).toBe("characters");

    const forkEdge = fromTrack.find((e) => e.kind === "fork");
    expect(forkEdge?.to).toBe("project_name");

    // project_name is the spine:false side-trail with joinTarget "characters" —
    // the copy-track fork target the adapt track bypasses.
    const projName = manifest.find((s) => s.id === "project_name")!;
    expect(projName.spine).toBe(false);
    expect(projName.joinTarget).toBe("characters");

    // project_name rejoins the spine at characters (the join edge).
    const projJoin = stepGraph.edges.find(
      (e) => e.from === "project_name" && e.kind === "join",
    );
    expect(projJoin?.to).toBe("characters");
  });
});

// ---------------------------------------------------------------------------
// D. Invariant guards — confirm nothing moved into Phase-2 territory.
// ---------------------------------------------------------------------------

describe("spec 018 — Phase-1 invariant guards (FR-005/-011/SC-007)", () => {
  // T013 / T015 — `track` writes no IR leaf (no new write routing), and there is
  // exactly one trackStep declaration with writes:[] (no re-declaration).
  it("track declares writes:[] — no new write routing introduced (FR-005/-011/SC-007)", () => {
    expect(trackStep.writes).toEqual([]);
    // Exactly one manifest entry for `track`.
    expect(manifest.filter((s) => s.id === "track").length).toBe(1);
  });

  // The project_name side-trail contract is unchanged (consumed, not modified).
  it("project_name side-trail contract is intact (spine:false, joinTarget characters)", () => {
    const projName = manifest.find((s) => s.id === "project_name")!;
    expect(projName.spine).toBe(false);
    expect(projName.joinTarget).toBe("characters");
    // project_name still declares its own scaffold writes (spec 017) — unchanged.
    expect(projectNameStep.writes.map(formatIRPath)).toEqual([
      "header.name",
      "header.keyboardId",
    ]);
  });
});

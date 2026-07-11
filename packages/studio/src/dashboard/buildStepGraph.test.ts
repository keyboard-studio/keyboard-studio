import { describe, it, expect } from "vitest";

import identityLiteModularRaw from "../../../../content/flows/identity_lite.modular.yaml?raw";
import phaseAModularRaw from "../../../../content/flows/proposed/phase_a_identity.modular.yaml?raw";
import phaseBModularRaw from "../../../../content/flows/phase_b_characters.modular.yaml?raw";
import phaseFModularRaw from "../../../../content/flows/phase_f_helpdocs.modular.yaml?raw";

import { buildModularFlowGraph, buildGraphFromQuestions, buildManifestStepGraph } from "./buildStepGraph.ts";
import { buildScriptRouting } from "./buildScriptRouting.ts";
import { loadModularFlow } from "../survey/loadModularFlow.ts";
import { phaseARegistry } from "../survey/questions/registry.a.ts";
import { phaseBRegistry } from "../survey/questions/registry.b.ts";
import { phaseFRegistry } from "../survey/questions/registry.f.ts";
import type { FlowDef } from "../survey/types.ts";
import { manifest } from "../steps/manifest.ts";

// ---------------------------------------------------------------------------
// INV-1 helper: assert that the live node set exactly equals the manifest ids
// ---------------------------------------------------------------------------

function assertLiveNodeSetEqualsManifest(
  modularRaw: string,
  registry: Readonly<Record<string, import("../survey/types.ts").QuestionModule>>,
  label: string,
) {
  const graph = buildModularFlowGraph(modularRaw, label, registry);
  const liveFlow = loadModularFlow(modularRaw);
  // Include provenance_questions in the expected live ids (buildGraphFromQuestions
  // includes them so goto targets resolve).
  const expectedIds = new Set([
    ...liveFlow.questions.map((q) => q.id),
    ...(liveFlow.provenance_questions ?? []).map((q) => q.id),
  ]);
  const liveNodeIds = new Set(
    graph.nodes.filter((n) => n.kind === "live").map((n) => n.id),
  );

  expect(liveNodeIds).toEqual(expectedIds);
}

// ---------------------------------------------------------------------------
// All-flows modular table
// ---------------------------------------------------------------------------

const ALL_FLOWS = [
  { raw: identityLiteModularRaw, title: "Identity-lite", registry: phaseARegistry },
  { raw: phaseAModularRaw, title: "Phase A", registry: phaseARegistry },
  { raw: phaseBModularRaw, title: "Phase B", registry: phaseBRegistry },
  { raw: phaseFModularRaw, title: "Phase F", registry: phaseFRegistry },
];

describe("buildModularFlowGraph — identity_lite (fully specified)", () => {
  const g = buildModularFlowGraph(identityLiteModularRaw, "Identity-lite", phaseARegistry);

  it("uses the first question as the entry", () => {
    // spec 030 FR-009: the English-name picker (il_language_english) is the
    // first question; the language code is a later confirmation step.
    expect(g.entryId).toBe("il_language_english");
    expect(g.nodes.find((n) => n.id === "il_language_english")?.isEntry).toBe(true);
  });

  it("flags the script question as a gate (it has conditional branching)", () => {
    const target = g.nodes.find((n) => n.id === "il_target_script");
    expect(target?.isGate).toBe(true);
    // It branches to the not-supported notice on a condition, else terminates.
    const conditional = g.edges.filter((e) => e.from === "il_target_script" && e.kind === "conditional");
    expect(conditional.some((e) => e.to === "il_script_not_supported")).toBe(true);
  });

  it("marks the not-supported notice as terminal", () => {
    const stub = g.nodes.find((n) => n.id === "il_script_not_supported");
    expect(stub?.isTerminal).toBe(true);
  });
});

describe("buildModularFlowGraph — every shipped flow (INV-1)", () => {
  for (const { raw, title, registry } of ALL_FLOWS) {
    it(`${title}: builds with a defined entry and no dangling goto targets`, () => {
      const g = buildModularFlowGraph(raw, title, registry);
      expect(g.nodes.length).toBeGreaterThan(0);
      expect(g.entryId).not.toBeNull();
      // Every goto must resolve to a real question — a dangling target is an
      // authoring defect the map surfaces, and the shipped flows must be clean.
      expect(g.danglingTargets).toEqual([]);
    });

    it(`${title}: INV-1 — live node ids equal manifest question ids`, () => {
      assertLiveNodeSetEqualsManifest(raw, registry, title);
    });
  }

  const reserveTestCases = [
    { raw: phaseAModularRaw, title: "Phase A", registry: phaseARegistry, includeProvenance: true },
    { raw: phaseFModularRaw, title: "Phase F", registry: phaseFRegistry, includeProvenance: false },
    { raw: identityLiteModularRaw, title: "identity-lite", registry: phaseARegistry, includeProvenance: false },
  ];

  for (const { raw, title, registry, includeProvenance } of reserveTestCases) {
    it(`${title} exposes reserve nodes: registry modules not in the manifest show as library-not-in-flow`, () => {
      const g = buildModularFlowGraph(raw, title, registry);
      const liveFlow = loadModularFlow(raw);
      const liveIds = new Set([
        ...liveFlow.questions.map((q) => q.id),
        ...(includeProvenance && liveFlow.provenance_questions ? liveFlow.provenance_questions.map((q) => q.id) : []),
      ]);
      const expectedReserve = new Set(Object.keys(registry).filter((id) => !liveIds.has(id)));
      const reserveNodeIds = new Set(
        g.nodes.filter((n) => n.kind === "library-not-in-flow").map((n) => n.id),
      );
      expect(reserveNodeIds).toEqual(expectedReserve);
    });
  }
});

// ---------------------------------------------------------------------------
// T010/T011: Phase B honesty — derived-equality + reserve + edge snapshot
// ---------------------------------------------------------------------------

describe("buildModularFlowGraph — Phase B honesty (FR-010)", () => {
  // Build the modular Phase B graph once for all assertions in this suite.
  const graph = buildModularFlowGraph(phaseBModularRaw, "Phase B — character discovery", phaseBRegistry);

  // Resolve the live id set independently (from loadModularFlow) for the
  // derived-equality assertion (FR-010 Part A).
  const liveFlow = loadModularFlow(phaseBModularRaw);
  const liveIds = new Set(liveFlow.questions.map((q) => q.id));

  // Registry keys for the reserve computation (FR-010 Part B).
  const registryIds = new Set(Object.keys(phaseBRegistry));

  it("FR-010 Part A — live node ids equal loadModularFlow resolved ids", () => {
    const liveNodeIds = new Set(
      graph.nodes.filter((n) => n.kind === "live").map((n) => n.id),
    );
    // Every live node must correspond to a manifest-resolved step.
    for (const id of liveNodeIds) {
      expect(liveIds.has(id), `live node "${id}" not in manifest`).toBe(true);
    }
    // Every manifest-resolved step must have a live node.
    for (const id of liveIds) {
      expect(liveNodeIds.has(id), `manifest id "${id}" missing from live nodes`).toBe(true);
    }
    expect(liveNodeIds.size).toBe(liveIds.size);
  });

  it("FR-010 Part B — library-not-in-flow ids equal registry minus live ids", () => {
    const reserveNodeIds = new Set(
      graph.nodes.filter((n) => n.kind === "library-not-in-flow").map((n) => n.id),
    );
    const expectedReserve = new Set([...registryIds].filter((id) => !liveIds.has(id)));
    // Every reserve node must be in the registry but not in the manifest.
    for (const id of reserveNodeIds) {
      expect(registryIds.has(id), `reserve node "${id}" not in registry`).toBe(true);
      expect(liveIds.has(id), `reserve node "${id}" unexpectedly also in live ids`).toBe(false);
    }
    // Every registry-but-not-live id must appear as a reserve node.
    for (const id of expectedReserve) {
      expect(reserveNodeIds.has(id), `registry id "${id}" missing from reserve nodes`).toBe(true);
    }
    expect(reserveNodeIds.size).toBe(expectedReserve.size);
    // NOTE: The shipped manifest currently references all registered Phase B
    // modules, so expectedReserve is empty today and reserveNodeIds.size === 0.
    // This assertion gains force when real reserve modules exist in the registry
    // but are not yet wired into the manifest. The empty case is expected and
    // intentional — not a sign of a broken test.
  });

  it("FR-002 — zero ghost nodes (every live node runs in the manifest)", () => {
    // Covered by Part A above; this test names the invariant explicitly.
    const liveNodeIds = graph.nodes.filter((n) => n.kind === "live").map((n) => n.id);
    for (const id of liveNodeIds) {
      expect(liveIds.has(id), `ghost node detected: "${id}" is live but not in manifest`).toBe(true);
    }
  });

  it("FR-002 — zero missing nodes (every manifest step has a live node)", () => {
    // Covered by Part A above; this test names the invariant explicitly.
    const liveNodeIds = new Set(graph.nodes.filter((n) => n.kind === "live").map((n) => n.id));
    for (const id of liveIds) {
      expect(liveNodeIds.has(id), `missing node: manifest id "${id}" has no live node`).toBe(true);
    }
  });

  it("FR-003 — dangling Phase B edge is surfaced, not dropped", () => {
    // Part 1: Prove detection works. Construct a synthetic FlowDef whose second
    // question's `next` points to "nonexistent_q" — an id absent from the flow.
    // The builder must (a) add "nonexistent_q" to danglingTargets and
    // (b) mark the corresponding edge dangling:true.
    const syntheticFlow: FlowDef = {
      flow_id: "test_dangling",
      phase: "test",
      questions: [
        { id: "q_first", type: "text", next: "q_second" },
        { id: "q_second", type: "text", next: "nonexistent_q" },
      ],
    };
    const syntheticGraph = buildGraphFromQuestions(syntheticFlow, "Dangling test");
    expect(syntheticGraph.danglingTargets).toContain("nonexistent_q");
    const danglingEdge = syntheticGraph.edges.find(
      (e) => e.from === "q_second" && e.to === "nonexistent_q",
    );
    expect(danglingEdge).toBeDefined();
    expect(danglingEdge?.dangling).toBe(true);

    // Part 2: The shipped Phase B modular manifest is clean by design — all goto
    // targets resolve to real question ids, so danglingTargets is empty.
    // This is intentional: the empty list confirms the manifest is clean, not
    // that the detection code is untested (Part 1 above covers detection).
    expect(graph.danglingTargets).toEqual([]);
  });

  it("all Phase B nodes carry kind and region", () => {
    for (const node of graph.nodes) {
      expect(
        node.kind === "live" || node.kind === "library-not-in-flow",
        `node "${node.id}" has unexpected kind "${node.kind}"`,
      ).toBe(true);
      if (node.kind === "live") {
        // Live nodes belong to the ordered survey spine.
        expect(node.region, `live node "${node.id}" should have region "flow"`).toBe("flow");
      } else {
        // library-not-in-flow reserve nodes are NOT part of the ordered spine —
        // same region as stub nodes (neither is in the live spine).
        expect(
          node.region,
          `library-not-in-flow node "${node.id}" should have region "not-yet-ordered"`,
        ).toBe("not-yet-ordered");
      }
    }
  });

  it("FR-010 Part C — Phase B edge/label snapshot", () => {
    // Snapshot the edge set (from, to, kind, label) so routing regressions are
    // caught.  On a deliberate routing change, update the snapshot with
    // `pnpm --filter @keyboard-studio/studio test -- -u`.
    const edgeSnapshot = graph.edges.map((e) => ({
      from: e.from,
      to: e.to,
      kind: e.kind,
      ...(e.label !== undefined ? { label: e.label } : {}),
      dangling: e.dangling,
    }));
    expect(edgeSnapshot).toMatchSnapshot("Phase B edges");
  });
});

// ---------------------------------------------------------------------------
// INV-2: Script-routing parity — modular loader produces correct §9 gating
// ---------------------------------------------------------------------------

describe("buildScriptRouting — §9 split (INV-2: modular loader parity)", () => {
  // INV-2: buildScriptRouting now uses identity_lite.modular.yaml via
  // loadModularFlow. The routing rows must be identical to what the legacy
  // loader produced — same script options, same gating decisions.
  const rows = buildScriptRouting(identityLiteModularRaw);
  const byValue = (v: string) => rows.find((r) => r.value === v);

  it("INV-2: produces a non-empty routing table from the modular manifest", () => {
    // The modular manifest contains il_target_script which has script options.
    expect(rows.length).toBeGreaterThan(0);
  });

  it("routes Latin to qwerty-qwertz / alphabetic", () => {
    const latn = byValue("Latn");
    expect(latn?.routingGroup).toBe("qwerty-qwertz");
    expect(latn?.scriptClass).toBe("alphabetic");
    expect(latn?.gated).toBe(false);
  });

  it("routes Devanagari to non-roman / abugida", () => {
    const deva = byValue("Deva");
    expect(deva?.routingGroup).toBe("non-roman");
    expect(deva?.scriptClass).toBe("abugida");
  });

  it("treats romanization + IPA as Latin", () => {
    expect(byValue("romanization-Latn")?.script).toBe("Latn");
    const ipa = byValue("fonipa");
    expect(ipa?.script).toBe("Latn");
    expect(ipa?.variant).toBe("fonipa");
  });

  it("INV-2: marks Ethiopic / Han / Hangul as gated (no routing group)", () => {
    // Parity check: Ethi/Hani/Hang must be gated: true in the modular-loader
    // output, matching the §9 "not yet supported" branching in il_target_script.
    for (const v of ["Ethi", "Hani", "Hang"]) {
      const row = byValue(v);
      expect(row?.gated, `${v} should be gated`).toBe(true);
      expect(row?.routingGroup).toBeNull();
    }
  });
});

// ---------------------------------------------------------------------------
// T032 — C8 / C9: buildManifestStepGraph reads steps/manifest.ts (FR-010)
// ---------------------------------------------------------------------------

describe("buildManifestStepGraph — C8/C9 (T032)", () => {
  const graph = buildManifestStepGraph();

  // C9: dashboard reads the SAME manifest.ts the runtime reads.
  // The test imports manifest directly from steps/manifest.ts and compares ids —
  // there is no second ordering source.
  it("C9 — node ids equal manifest step ids in manifest order", () => {
    const nodeIds = graph.nodes.map((n) => n.id);
    const manifestIds = manifest.map((s) => s.id);
    expect(nodeIds).toEqual(manifestIds);
  });

  // C8: exactly one node per manifest step — zero ghost, zero missing.
  it("C8 — exactly one node per manifest step (no ghost, no missing)", () => {
    const manifestIds = new Set(manifest.map((s) => s.id));
    const nodeIds = new Set(graph.nodes.map((n) => n.id));

    // Every node corresponds to a manifest step.
    for (const id of nodeIds) {
      expect(manifestIds.has(id), `ghost node: "${id}" is in the graph but not in the manifest`).toBe(true);
    }
    // Every manifest step has a node.
    for (const id of manifestIds) {
      expect(nodeIds.has(id), `missing node: manifest step "${id}" has no graph node`).toBe(true);
    }
    // Counts agree.
    expect(graph.nodes.length).toBe(manifest.length);
  });

  it("C8 — no duplicate node ids", () => {
    const ids = graph.nodes.map((n) => n.id);
    const unique = new Set(ids);
    expect(unique.size).toBe(ids.length);
  });

  it("spine steps carry spine:true; off-spine steps carry spine:false", () => {
    for (const node of graph.nodes) {
      const step = manifest.find((s) => s.id === node.id);
      expect(step).toBeDefined();
      expect(node.spine).toBe(step!.spine === true);
    }
  });

  it("lock gates are preserved from the manifest", () => {
    for (const node of graph.nodes) {
      const step = manifest.find((s) => s.id === node.id);
      expect(step).toBeDefined();
      expect(node.lock).toBe(step!.lock);
    }
  });

  it("joinTarget is preserved for off-spine steps", () => {
    const offSpine = graph.nodes.filter((n) => !n.spine);
    // There are at least two off-spine steps (project_name + touch_seed_source).
    expect(offSpine.length).toBeGreaterThanOrEqual(2);
    for (const node of offSpine) {
      const step = manifest.find((s) => s.id === node.id);
      expect(step).toBeDefined();
      expect(node.joinTarget).toBe(step!.joinTarget);
      // Every off-spine step must have a joinTarget.
      expect(node.joinTarget, `off-spine step "${node.id}" missing joinTarget`).toBeDefined();
    }
  });

  it("first and last steps are marked correctly", () => {
    const first = graph.nodes[0];
    const last = graph.nodes[graph.nodes.length - 1];
    expect(first?.isEntry).toBe(true);
    expect(first?.isTerminal).toBe(false);
    expect(last?.isTerminal).toBe(true);
    expect(last?.isEntry).toBe(false);
  });

  it("spine edges connect consecutive spine steps in manifest order", () => {
    const spineIds = graph.nodes.filter((n) => n.spine).map((n) => n.id);
    const spineEdges = graph.edges.filter((e) => e.kind === "spine");

    // Each consecutive spine step pair has a spine edge.
    for (let i = 0; i < spineIds.length - 1; i++) {
      const from = spineIds[i]!;
      const to = spineIds[i + 1]!;
      const edge = spineEdges.find((e) => e.from === from && e.to === to);
      expect(edge, `missing spine edge from "${from}" to "${to}"`).toBeDefined();
    }
    // Last spine step has no outgoing spine edge.
    const lastSpine = spineIds[spineIds.length - 1]!;
    expect(spineEdges.filter((e) => e.from === lastSpine).length).toBe(0);
  });

  it("join edges connect off-spine steps back to their joinTarget", () => {
    const offSpine = graph.nodes.filter((n) => !n.spine);
    for (const node of offSpine) {
      if (node.joinTarget === undefined) continue;
      const joinEdge = graph.edges.find(
        (e) => e.from === node.id && e.to === node.joinTarget && e.kind === "join",
      );
      expect(joinEdge, `missing join edge from "${node.id}" to "${node.joinTarget}"`).toBeDefined();
    }
  });
});

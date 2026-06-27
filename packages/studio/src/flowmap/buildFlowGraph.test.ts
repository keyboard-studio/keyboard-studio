import { describe, it, expect } from "vitest";

import identityLiteRaw from "../../../../content/flows/identity_lite.yaml?raw";
import phaseARaw from "../../../../content/flows/phase_a_identity.yaml?raw";
import phaseBRaw from "../../../../content/flows/phase_b_characters.yaml?raw";
import phaseBModularRaw from "../../../../content/flows/phase_b_characters.modular.yaml?raw";
import phaseFRaw from "../../../../content/flows/phase_f_helpdocs.yaml?raw";

import { buildFlowGraph, buildModularFlowGraph, buildGraphFromQuestions } from "./buildFlowGraph.ts";
import { buildScriptRouting } from "./buildScriptRouting.ts";
import { loadModularFlow } from "../survey/loadModularFlow.ts";
import { phaseBRegistry } from "../survey/questions/registry.b.ts";
import type { FlowDef } from "../survey/types.ts";

const ALL_FLOWS = [
  { raw: identityLiteRaw, title: "Identity-lite" },
  { raw: phaseARaw, title: "Phase A" },
  { raw: phaseBRaw, title: "Phase B" },
  { raw: phaseFRaw, title: "Phase F" },
];

describe("buildFlowGraph — identity_lite (fully specified)", () => {
  const g = buildFlowGraph(identityLiteRaw, "Identity-lite");

  it("uses the first question as the entry", () => {
    expect(g.entryId).toBe("il_language_autonym");
    expect(g.nodes.find((n) => n.id === "il_language_autonym")?.isEntry).toBe(true);
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

describe("buildFlowGraph — every shipped flow", () => {
  for (const { raw, title } of ALL_FLOWS) {
    it(`${title}: builds with a defined entry and no dangling goto targets`, () => {
      const g = buildFlowGraph(raw, title);
      expect(g.nodes.length).toBeGreaterThan(0);
      expect(g.entryId).not.toBeNull();
      // Every goto must resolve to a real question — a dangling target is an
      // authoring defect the map surfaces, and the shipped flows must be clean.
      expect(g.danglingTargets).toEqual([]);
    });
  }

  it("Phase B exposes the engine-resolved routing gate", () => {
    const g = buildFlowGraph(phaseBRaw, "Phase B");
    const routing = g.nodes.find((n) => n.id === "pb_routing_branch");
    expect(routing).toBeDefined();
    expect(routing?.isGate).toBe(true);
    expect(g.edges.some((e) => e.from === "pb_routing_branch" && e.to === "pb_non_roman_branch")).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// T010/T011: Phase B honesty — derived-equality + reserve + edge snapshot
// ---------------------------------------------------------------------------

describe("buildModularFlowGraph — Phase B honesty (FR-010)", () => {
  // Build the modular Phase B graph once for all assertions in this suite.
  const graph = buildModularFlowGraph(phaseBModularRaw, "Phase B — character discovery");

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

describe("buildScriptRouting — §9 split", () => {
  const rows = buildScriptRouting(identityLiteRaw);
  const byValue = (v: string) => rows.find((r) => r.value === v);

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

  it("marks Ethiopic / Han / Hangul as gated (no routing group)", () => {
    for (const v of ["Ethi", "Hani", "Hang"]) {
      const row = byValue(v);
      expect(row?.gated, `${v} should be gated`).toBe(true);
      expect(row?.routingGroup).toBeNull();
    }
  });
});

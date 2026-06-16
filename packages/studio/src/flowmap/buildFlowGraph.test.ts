import { describe, it, expect } from "vitest";

import identityLiteRaw from "../../../../content/flows/identity_lite.yaml?raw";
import phaseARaw from "../../../../content/flows/phase_a_identity.yaml?raw";
import phaseBRaw from "../../../../content/flows/phase_b_characters.yaml?raw";
import phaseFRaw from "../../../../content/flows/phase_f_helpdocs.yaml?raw";

import { buildFlowGraph } from "./buildFlowGraph.ts";
import { buildScriptRouting } from "./buildScriptRouting.ts";

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

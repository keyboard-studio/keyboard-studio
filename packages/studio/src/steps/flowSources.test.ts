// src/steps/flowSources.test.ts — D2 completeness checks (spec 024, Stage 1;
// rewritten for spec 091 T014).
//
// Co-located with steps/flowSources.ts, steps/manifest.ts, etc. per the
// project convention (F2: moved from tests/steps/flowSources.test.ts).
//
// The three-way consistency invariant, restated for derived screens.
// Steps no longer declare flowRefs and flowSources entries no longer
// declare a status: liveness is DERIVED from screen membership
// (steps/flowSources.ts). The checks, re-derived independently here:
//
//   (a) Every status:"live" flow's modules sit on exactly one derived
//       screen, and that screen is a manifest step (its drill-down anchor).
//   (b) A flow is status:"live" iff every one of its modules is a member
//       of a derived screen.
//   (c) No status:"proposed" flow has any module on a derived screen.
//
// ADR-0001's intent is preserved: the Flow Map is derived solely from
// the (derived) manifest composition; flowSources is the catalogue; the
// two must stay aligned.

import { describe, it, expect } from "vitest";
import { manifest } from "./manifest.ts";
import { flowSources, screenIdForFlow } from "./flowSources.ts";
import { decisionModules } from "../survey/questions/registry.ts";
import { deriveScreens } from "../decisions/deriveScreens.ts";

// ---------------------------------------------------------------------------
// Helpers — screen membership, derived independently of flowSources.ts.
// ---------------------------------------------------------------------------

const screenByModuleId: ReadonlyMap<string, string> = new Map(
  deriveScreens(decisionModules).flatMap((s) =>
    s.moduleIds.map((moduleId) => [moduleId, s.id] as const),
  ),
);

const manifestStepIds: ReadonlySet<string> = new Set(manifest.map((s) => s.id));

/** The distinct screens a flow's modules sit on (empty when unwalked). */
function screensOf(flowId: string): string[] {
  const source = flowSources[flowId];
  if (source === undefined) return [];
  return [
    ...new Set(
      source.derivedModules
        .map((m) => screenByModuleId.get(m.definition.id))
        .filter((id): id is string => id !== undefined),
    ),
  ];
}

// ---------------------------------------------------------------------------
// (a) Every live flow hangs under exactly one screen, a manifest step.
// ---------------------------------------------------------------------------

describe("D2a — every live flow hangs under exactly one derived screen", () => {
  for (const [id, source] of Object.entries(flowSources)) {
    if (source.status !== "live") continue;
    it(`live flow "${id}" sits on exactly one screen, which is a manifest step`, () => {
      const screens = screensOf(id);
      expect(screens, `live flow "${id}" must sit on exactly one screen`).toHaveLength(1);
      expect(manifestStepIds.has(screens[0]!)).toBe(true);
    });
  }
});

// ---------------------------------------------------------------------------
// (b) Liveness ⟺ every module is a member of a derived screen.
// ---------------------------------------------------------------------------

describe("D2b — liveness is exactly screen membership", () => {
  for (const [id, source] of Object.entries(flowSources)) {
    it(`flow "${id}" is live iff all its modules are screen members`, () => {
      const allMembers = source.derivedModules.every((m) =>
        screenByModuleId.has(m.definition.id),
      );
      expect(
        source.status === "live",
        `flowSources["${id}"] status "${source.status}" disagrees with screen membership`,
      ).toBe(allMembers);
    });
  }
});

// ---------------------------------------------------------------------------
// (c) No proposed flow has any module on a derived screen.
// ---------------------------------------------------------------------------

describe("D2c — no proposed flow is walked by any screen", () => {
  for (const [id, source] of Object.entries(flowSources)) {
    if (source.status !== "proposed") continue;
    it(`proposed flow "${id}" has no module on any derived screen`, () => {
      expect(screensOf(id)).toHaveLength(0);
    });
  }
});

// ---------------------------------------------------------------------------
// Sanity: phase_a_identity must be proposed and unwalked (spec 022).
// ---------------------------------------------------------------------------

describe("spec-022 demotion — phase_a_identity is proposed and unwalked", () => {
  it("phase_a_identity exists in flowSources with status:'proposed'", () => {
    const entry = flowSources["phase_a_identity"];
    expect(entry).toBeDefined();
    expect(entry?.status).toBe("proposed");
  });

  it("no derived screen holds a phase_a_identity module", () => {
    expect(screensOf("phase_a_identity")).toHaveLength(0);
  });
});

// ---------------------------------------------------------------------------
// Spec 091 T020 — screenIdForFlow: screen labels key off the derived screen.
// ---------------------------------------------------------------------------

describe("screenIdForFlow (spec 091 T020)", () => {
  it("maps each live flow to the screen holding its modules", () => {
    expect(screenIdForFlow("identity_lite")).toBe("identity");
    expect(screenIdForFlow("track")).toBe("track");
    expect(screenIdForFlow("project_name")).toBe("project_name");
    // Intra-step flows name their enclosing custom screen.
    expect(screenIdForFlow("phase_b_characters")).toBe("characters");
    expect(screenIdForFlow("phase_f_helpdocs")).toBe("help");
  });

  it("agrees with the independently derived membership map for every live flow", () => {
    for (const source of Object.values(flowSources)) {
      if (source.status !== "live") continue;
      const first = source.derivedModules[0]!;
      expect(screenIdForFlow(source.id)).toBe(screenByModuleId.get(first.definition.id));
    }
  });

  it("a proposed flow has no screen", () => {
    expect(screenIdForFlow("phase_a_identity")).toBeUndefined();
  });
});

// Drill-down declarations under the opaque `characters` node (specs 017, 019, 020).
//
// `prefill` (Prefill.tsx confirm screen) and `pb_build_list` (PhaseB.tsx
// BuildListView) are registry-keyed drill-down descriptors: not manifest steps,
// not questionRegistry ids, not projected spine nodes. Both share one contract,
// checked here once per descriptor:
//   - hung under `characters`, declared exactly once, anchored to a real
//     questionRegistry id that the live survey actually reaches;
//   - read-only (writes []) with header.bcp47 as the only IR input, plus a
//     non-IR session signal;
//   - header.bcp47 has a producer in the manifest graph (DEC-D1 subsumption).
//
// The header.script forbidden-path guard for these descriptors lives in
// tests/survey/questions/f/editorStepContracts.test.ts with the other
// declarations. Track/prefill routing is tested against the real policy in
// src/steps/advance.test.ts.

import { describe, it, expect } from "vitest";
import { formatIRPath, mergePhaseResults } from "@keyboard-studio/contracts";

import {
  prefillDrillDown,
  pbBuildListDrillDown,
  drillDownDeclarations,
  CHARACTERS_NODE_ID,
} from "./drillDownDeclarations.ts";
import type { DrillDownDeclaration, DrillDownOutput } from "./drillDownDeclarations.ts";
import { questionRegistry } from "./registry.ts";
import { manifest } from "../../steps/manifest.ts";
import { flowSources } from "../../steps/flowSources.ts";
import { ruleTarget } from "../../dashboard/flowUtils.ts";
import { buildManifestProjection, CHARACTERS_STEP_ID } from "../../dashboard/manifestProjection.ts";
import { resolveNext } from "../SurveyRunner.tsx";
import { loadModularFlow } from "../loadModularFlow.ts";
import type { FlowQuestion } from "../types.ts";

// ---------------------------------------------------------------------------
// Survey-question reachability via the real resolveNext / FlowGotoRule routing
// (FR-014 §2.2(b), the survey-question half of C7). BFS from each status:"live"
// flowSources entry, collecting visited questionRegistry ids. findUnreachable is
// not used because it is blind to FlowGotoRule routing.
// ---------------------------------------------------------------------------

function structuralTargets(q: FlowQuestion): string[] {
  const next = q.next;
  if (next === undefined || next === null) return [];
  if (typeof next === "string") {
    const t = resolveNext(q, undefined, {});
    return t !== null ? [t] : [];
  }
  const targets: string[] = [];
  for (const rule of next) {
    const goto = ruleTarget(rule);
    if (goto !== null) targets.push(goto);
  }
  return targets;
}

function computeSurveyReach(): Set<string> {
  const reach = new Set<string>();
  const liveSources = Object.values(flowSources).filter((s) => s.status === "live");
  for (const source of liveSources) {
    let flow;
    try {
      flow = loadModularFlow(source.raw);
    } catch {
      continue;
    }
    const all = [...flow.questions, ...(flow.provenance_questions ?? [])];
    const byId = new Map(all.map((q) => [q.id, q]));
    const entry = flow.questions[0]?.id;
    if (entry === undefined) continue;

    const visited = new Set<string>();
    const stack = [entry];
    while (stack.length > 0) {
      const id = stack.pop()!;
      if (visited.has(id)) continue;
      visited.add(id);
      const q = byId.get(id);
      if (q === undefined) continue;
      for (const target of structuralTargets(q)) stack.push(target);
    }
    for (const id of visited) {
      if (Object.prototype.hasOwnProperty.call(questionRegistry, id)) reach.add(id);
    }
  }
  return reach;
}

const surveyReach = computeSurveyReach();

interface DrillDownCase {
  decl: DrillDownDeclaration;
  registryKey: string;
  output: DrillDownOutput;
  /** Substring the declared non-IR session signal must carry. */
  sessionSignal: string;
}

const CASES: readonly DrillDownCase[] = [
  {
    decl: prefillDrillDown,
    // Spec 022 re-anchor: moved from the demoted Phase-A `primary_script` to the
    // live identity-lite script question.
    registryKey: "il_target_script",
    output: { kind: "none" },
    sessionSignal: "ScriptPrefill",
  },
  {
    decl: pbBuildListDrillDown,
    // The IntroChooser discovery gate the build list sits behind.
    registryKey: "pb_discovery_intro",
    output: { kind: "phase-result-field", field: "confirmedInventory" },
    sessionSignal: "CLDR",
  },
];

it("the `characters` drill-down table holds exactly prefill and pb_build_list, under the projection's characters node", () => {
  expect(Object.keys(drillDownDeclarations)).toEqual([CHARACTERS_NODE_ID]);
  expect(drillDownDeclarations[CHARACTERS_NODE_ID]).toEqual(CASES.map((c) => c.decl));
  // The descriptor table and the map projection key off the same node id, so a
  // Flow Map render surfaces these under the projected `characters` node.
  expect(CHARACTERS_NODE_ID).toBe(CHARACTERS_STEP_ID);
});

describe.each(CASES)("drill-down $decl.id", ({ decl, registryKey, output, sessionSignal }) => {
  it("hangs under `characters`, anchored to a real questionRegistry id", () => {
    expect(decl.underNodeId).toBe(CHARACTERS_NODE_ID);
    expect(decl.registryKey).toBe(registryKey);
    expect(Object.prototype.hasOwnProperty.call(questionRegistry, registryKey)).toBe(true);
  });

  it("is not a questionRegistry id, a manifest step, or a projected spine node", () => {
    expect(Object.prototype.hasOwnProperty.call(questionRegistry, decl.id)).toBe(false);
    expect(manifest.some((s) => s.id === decl.id)).toBe(false);
    expect(buildManifestProjection().nodes.some((n) => n.id === decl.id)).toBe(false);
  });

  it("is read-only: writes [] and its declared output is not an IR write", () => {
    expect(decl.writes).toEqual([]);
    expect(decl.output).toEqual(output);
  });

  it("reads header.bcp47 as its only IR input, plus a non-IR session signal", () => {
    expect(decl.inputs.map(formatIRPath)).toEqual(["header.bcp47"]);
    expect(decl.sessionInputs?.some((s) => s.includes(sessionSignal))).toBe(true);
  });

  it("input header.bcp47 is satisfiable: a manifest step writes it (DEC-D1)", () => {
    const writers = new Set<string>();
    for (const step of manifest) for (const w of step.writes) writers.add(formatIRPath(w));
    for (const input of decl.inputs) {
      expect(
        writers.has(formatIRPath(input)),
        `${decl.id} input ${formatIRPath(input)} has no producer in the manifest graph`,
      ).toBe(true);
    }
  });

  it("FR-014 §2.2(b): its registry anchor is reachable via the survey resolveNext walk", () => {
    expect(
      surveyReach.has(registryKey),
      `${decl.id} anchor "${registryKey}" is not reachable via the survey resolveNext walk`,
    ).toBe(true);
  });
});

it("spec 022: the demoted Phase-A primary_script (prefill's old anchor) is no longer reachable", () => {
  expect(surveyReach.has("primary_script"), "primary_script must be demoted (unreachable)").toBe(false);
});

// pb_build_list's output rides on SurveyPhaseResult.confirmedInventory, so the
// real mergePhaseResults is what turns a build-list completion into session
// state. A fixed input with a duplicate, a whitespace-only token and an NFD
// entry pins the deduped / NFC / empties-dropped union (spec 020 FR-009).
it("pb_build_list: mergePhaseResults turns a build-list completion into a deduped NFC confirmedInventory", () => {
  const session = mergePhaseResults({}, [
    {
      phase: "B",
      answers: [],
      confirmedInventory: ["a", "b", "a", "   ", "c", "é"],
    },
  ]);
  expect(session.confirmedInventory).toEqual(["a", "b", "c", "é"]);
});

// Drill-down declarations — prefill / pb_build_list (spec 017, US2).
//
// `prefill` and `pb_build_list` are the mature, hand-built survey experiences
// (Prefill.tsx confirm screen; PhaseB.tsx BuildListView, reached behind the
// IntroChooser discovery gate) that have NO manifest entry and NO questionRegistry
// id today (the spec-016 drift guardrail ratified that `pb_build_list` is NOT a
// questionRegistry id — the registry id at that boundary is `pb_discovery_intro`).
// They cannot become first-class manifest nodes in Phase 1 without decomposing the
// opaque `charactersStep` placeholder (Phase 2 work).
//
// Per spec 017 they are declared as REGISTRY-KEYED DRILL-DOWN DESCRIPTORS hung
// under the opaque `characters` node, NOT as questionRegistry entries and NOT as
// modular-YAML flow nodes. Declaring them here (rather than in questionRegistry)
// is deliberate and load-bearing for the Phase-1 invariants:
//   - questionRegistry membership would trip the orphan-input-lint "no
//     non-manifested registry modules" gate (every registry id must appear in a
//     .modular.yaml manifest), and
//   - a modular-YAML flow node would require a runtime-reach edge or the spec-016
//     rendered<->runtime bijection (exact set equality) goes RED.
// A separate descriptor table carries the declared contract WITHOUT touching
// either gate, keeping behaviour byte-identical (flag off, no mutate(), no
// contracts bump).
//
// These are DECLARED-ONLY contracts: nothing executes, no component is wired to
// resolve as its node (that is specs 018-021 / Phase 2).

import { irPath } from "@keyboard-studio/contracts";
import type { IRPath } from "@keyboard-studio/contracts";

/** The opaque manifest node these drill-downs hang under (manifest.ts:47-56). */
export const CHARACTERS_NODE_ID = "characters";

/**
 * The kind of "output" a drill-down declaration produces. `prefill` is read-only
 * (no output); `pb_build_list`'s output rides on a SurveyPhaseResult field, not a
 * KeyboardIR location — so it is modelled DISTINCTLY from an irPath() write.
 */
export type DrillDownOutput =
  | { kind: "none" }
  | { kind: "phase-result-field"; field: string };

/**
 * A registry-keyed drill-down declaration under the opaque `characters` node.
 *
 * `registryKey` anchors the drill-down to an existing questionRegistry id at its
 * boundary (so a registry/manifest divergence stays observable, mirroring the
 * spec-015 projection's drill-down keying) WITHOUT promoting the drill-down id
 * itself to a registry entry.
 */
export interface DrillDownDeclaration {
  /** The drill-down id (the hand-built experience). NOT a questionRegistry id. */
  id: string;
  /** Friendly title. */
  title: string;
  /** The manifest node this drill-down hangs under. */
  underNodeId: string;
  /**
   * An existing questionRegistry id at this drill-down's boundary — the
   * registry-keyed anchor (NOT the drill-down id itself).
   */
  registryKey: string;
  /** IR locations this drill-down READS (existing KeyboardIR locations only). */
  inputs: readonly IRPath[];
  /** IR locations this drill-down WRITES. */
  writes: readonly IRPath[];
  /**
   * Non-IR session-level signals this drill-down reads, documented for
   * completeness (they carry no C5 obligation — only irPath() inputs do).
   */
  sessionInputs?: readonly string[];
  /** The drill-down's output (none, or a phase-result field — never an IR write). */
  output: DrillDownOutput;
}

/**
 * prefill — the hand-built Prefill confirm screen (Prefill.tsx).
 *
 * Read-only (`writes: []`): it confirms script-derived assumptions, it does not
 * write IR. Its IR input is the session-derived `header.bcp47` array (produced by
 * `iso_code` inside the opaque `charactersStep`; per DEC-D1 the charactersStep
 * node declares that write, so this input is C5-satisfiable within the single
 * manifest graph). The session-level ScriptPrefill (script subtag / A2 class /
 * routing group, scriptAxes.ts) is a non-IR signal — declared as a sessionInput,
 * NOT an irPath(). irPath('header','script') is NOT declared (it does not exist).
 *
 * Spec 022 re-anchor: this drill-down anchored to `primary_script` (a vestigial
 * Phase-A module). Spec 022 demotes the full non-identity Phase A to the inert
 * library (renderedNodeSet.ts drops phase_a_identity from FLOW_SOURCES), so
 * `primary_script` is no longer reachable. The anchor moves to the LIVE, reachable
 * identity-lite equivalent `il_target_script` (questions/a/il_target_script.ts —
 * "Which script will THIS keyboard type?", the script-capture question on the real
 * StudioShell→IdentityLite runtime path that drives A2/routing/base-suggestion). The
 * registryKey is the reachable registry BOUNDARY id for the script-prefill
 * confirmation, not the bcp47 writer; the header.bcp47 input stays C5-satisfiable via
 * the charactersStep subsumption write (DEC-D1), unchanged.
 */
export const prefillDrillDown: DrillDownDeclaration = {
  id: "prefill",
  title: "Confirm the basics (prefill)",
  underNodeId: CHARACTERS_NODE_ID,
  registryKey: "il_target_script",
  inputs: [irPath("header", "bcp47")],
  writes: [],
  sessionInputs: ["ScriptPrefill (script subtag / A2 class / routing group)"],
  output: { kind: "none" },
};

/**
 * pb_build_list — the hand-built BuildListView (PhaseB.tsx), reached behind the
 * mandatory IntroChooser discovery-method gate (registry id `pb_discovery_intro`).
 *
 * Inputs: CLDR suggestions (async, stays in the component — a non-IR session
 * signal) + the base IR seed (`header.bcp47`). Its confirmed-inventory OUTPUT
 * rides on `SurveyPhaseResult.confirmedInventory` (PhaseB.tsx:610) — a phase-result
 * field, NOT a KeyboardIR write — so `writes` is [] and the output is modelled as
 * a phase-result field.
 */
export const pbBuildListDrillDown: DrillDownDeclaration = {
  id: "pb_build_list",
  title: "Build character list",
  underNodeId: CHARACTERS_NODE_ID,
  registryKey: "pb_discovery_intro",
  inputs: [irPath("header", "bcp47")],
  writes: [],
  sessionInputs: ["CLDR suggestions (async, stays in component)"],
  output: { kind: "phase-result-field", field: "confirmedInventory" },
};

/**
 * The spec-017 drill-down declarations, grouped by the manifest node they hang
 * under (mirroring ManifestProjection.drillDowns shape). Declared-only data
 * consumed by the per-step unit tests; no component resolves through it in P1.
 */
export const drillDownDeclarations: Readonly<Record<string, readonly DrillDownDeclaration[]>> = {
  [CHARACTERS_NODE_ID]: [prefillDrillDown, pbBuildListDrillDown],
} as const;

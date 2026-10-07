// steps/flowSources.ts — the single authoritative registry of all known survey
// flows, keyed by flow_id.
//
// Spec 024 (ADR-0001): the Flow Map derives drill-downs from the step flowRefs
// declared in the manifest. Spec 087: every flow's membership is the module list
// registered for it in survey/questions/registry.ts (`flowModules`) and its ORDER
// is derived from those modules' provides/requires — there are no hand-maintained
// order lists. This file only adds per-flow metadata (title, phase letter,
// status) on top of that single membership table.
//
// Boundary (.dependency-cruiser.cjs steps-layer rule): steps/ MAY import
// survey/ (registry) and contracts — but NOT dashboard/, stores/, lib/, or
// components/. dashboard/ reads this file via flowRefs.
//
// Status semantics:
//   "live"     — referenced by at least one manifest step via flowRefs;
//                appears as a live drill-down in the Flow Map.
//   "proposed" — known to the registry but NOT referenced by any manifest step;
//                excluded from live drill-downs and from the rendered<->runtime
//                bijection; rendered as an ordered graph in the Flow Map's Library
//                section (spec 025, D6). The `status` here is the single source
//                of that marker.
//
// Adding a flow: give its question modules `provides` / `requires` (DecisionId,
// decisions/decisionTypes.ts), list them under a new key in `flowModules`
// (registry.ts) in walk order, freeze the intended order in a decisions/*Parity
// test, and add an entry below. Everything downstream (loadFlowSourceDef,
// dashboard graphs, rendered-node set, library flows, mirror suites) keys off
// `derivedModules` generically. Conditional visibility stays single-sourced in
// each module's definition.next (gatedBy is derived from it, FR-005).

import {
  decisionModules,
  flowModules,
  phaseFLibraryModules,
  reserveModules,
  moduleRecord,
} from "../survey/questions/registry.ts";
import { deriveScreens } from "../decisions/deriveScreens.ts";

import type { QuestionModule } from "../survey/types.ts";
import type { FlowDef } from "../survey/types.ts";
import { loadDerivedFlowDef } from "../survey/loadDerivedFlow.ts";

// ---------------------------------------------------------------------------
// FlowSource shape
// ---------------------------------------------------------------------------

/**
 * A single survey flow registered in this catalogue.
 * Keyed by the flow's flow_id.
 */
export interface FlowSource {
  /** Stable id — equals the flow_id. */
  id: string;
  /**
   * Question modules whose provides/requires declarations supply this flow's
   * order via `orderDecisions` (the flow's `flowModules` entry).
   */
  derivedModules: readonly QuestionModule[];
  /** Phase letter of the flow (the per-flow A-G scheme, see steps/phases.ts). */
  phase: string;
  /**
   * Subset of `derivedModules` that forms the supplemental
   * `provenance_questions` list (Phase A). Membership only — order still
   * derives from the single provides/requires pass over `derivedModules`.
   */
  provenanceModules?: readonly QuestionModule[];
  /** Human title for the Flow Map drill-down header. */
  title: string;
  /**
   * id-keyed modules for the Flow Map's reserve-node computation: the flow's
   * own modules plus registered-but-unused siblings that surface as
   * "library-not-in-flow" nodes in this drill-down.
   */
  registry: Readonly<Record<string, QuestionModule>>;
  /**
   * "live"     — every module is a member of a derived screen (spec 091
   *              T014); appears in live drill-downs.
   * "proposed" — registered but in no derived screen; rendered as an
   *              ordered graph in the Library section.
   * Derived at the bottom of this module, never declared per entry.
   */
  status: "live" | "proposed";
}

/** Load a flow source's FlowDef: the order derives from its modules. */
export function loadFlowSourceDef(source: FlowSource): FlowDef {
  return loadDerivedFlowDef(
    source.id,
    source.phase,
    source.derivedModules,
    source.provenanceModules,
  );
}

// ---------------------------------------------------------------------------
// The catalogue
// ---------------------------------------------------------------------------

/**
 * All known survey flows, keyed by flow_id.
 *
 * Adding a flow here does NOT put it in the live drill-downs — it must also be
 * referenced via a manifest step's `flowRefs` field. Status:"proposed" entries
 * are explicitly excluded from live drill-down rendering.
 *
 * phase_a_identity is intentionally status:"proposed" and referenced by NO
 * manifest step — this realises the spec-022 demotion. Its modules are
 * physically relocated to questions/reserve/ (no-delete guardrail) and are
 * visible as the ordered proposed-flow graph in the Flow Map's Library section
 * and as flat entries in its Leftover section — never as reserve clog inside
 * the live identity_lite drill-down (whose registry holds only the il_*
 * modules).
 */
const declaredFlowSources = {
  // --- Live flows (referenced by manifest step flowRefs) ---

  identity_lite: {
    id: "identity_lite",
    derivedModules: flowModules.identity_lite,
    phase: "A",
    title: "Identity-lite",
    registry: moduleRecord(flowModules.identity_lite),
  },

  track: {
    id: "track",
    derivedModules: flowModules.track,
    phase: "G",
    title: "Track selection",
    registry: moduleRecord(flowModules.track),
  },

  project_name: {
    id: "project_name",
    derivedModules: flowModules.project_name,
    phase: "G",
    title: "Project name",
    registry: moduleRecord(flowModules.project_name),
  },

  phase_b_characters: {
    id: "phase_b_characters",
    derivedModules: flowModules.phase_b_characters,
    phase: "B",
    title: "Character discovery",
    registry: moduleRecord(flowModules.phase_b_characters),
  },

  phase_f_helpdocs: {
    id: "phase_f_helpdocs",
    derivedModules: flowModules.phase_f_helpdocs,
    phase: "F",
    title: "Help docs",
    // Includes the demoted tip slots: registered but not flow members, so they
    // surface as library-not-in-flow nodes in this drill-down.
    registry: moduleRecord(phaseFLibraryModules),
  },

  // --- Proposed flows (NOT referenced by any manifest step) ---

  // Spec 022 demotion: the full non-identity Phase A battery is excluded from
  // live drill-downs. Its modules live in questions/reserve/ (no-delete
  // guardrail), appearing as the ordered proposed-flow graph in the Library
  // section plus flat entries in the Leftover section — kept for reference /
  // future reuse, never run by the live survey.
  phase_a_identity: {
    id: "phase_a_identity",
    // Order derives from the reserve modules' provides/requires (reserve-*
    // decision ids, distinct from the live il_* ones). The 15 provenance_*
    // modules keep the supplemental provenance_questions list.
    derivedModules: flowModules.phase_a_identity,
    phase: "A",
    provenanceModules: flowModules.phase_a_identity.filter(
      (m) =>
        m.definition.id.startsWith("provenance_") &&
        m.definition.id !== "provenance_opt_in",
    ),
    title: "Full identity (reserve/library)",
    registry: moduleRecord(reserveModules),
  },
};

// ---------------------------------------------------------------------------
// Liveness, derived from screen membership (spec 091 T014)
// ---------------------------------------------------------------------------

/**
 * A flow is "live" iff every one of its modules is a member of a derived
 * screen (decisions/deriveScreens.ts over the live registry) — i.e. the
 * wizard actually walks it. Registered-but-unwalked flows (the reserve
 * phase_a_identity battery) are "proposed". This replaces both the
 * per-entry status literal and the old "referenced via a manifest step's
 * flowRefs" rule: flowRefs are deleted (T014), screen membership is the
 * single source.
 */
const liveScreenModuleIds: ReadonlySet<string> = new Set(
  deriveScreens(decisionModules).flatMap((s) => s.moduleIds),
);

export const flowSources: Readonly<Record<string, FlowSource>> = Object.fromEntries(
  Object.entries(declaredFlowSources).map(([id, source]) => [
    id,
    {
      ...source,
      status: source.derivedModules.every((m) =>
        liveScreenModuleIds.has(m.definition.id),
      )
        ? ("live" as const)
        : ("proposed" as const),
    },
  ]),
);

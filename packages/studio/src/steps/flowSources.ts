// steps/flowSources.ts — the ONE module holding static ?raw flow imports.
//
// Spec 024 (ADR-0001): FLOW_SOURCES is retired; the Flow Map derives drill-downs
// from the step flowRefs declared in the manifest. This file is the single
// authoritative registry of all known survey flows, keyed by their flow_id.
//
// Boundary (.dependency-cruiser.cjs steps-layer rule): steps/ MAY import
// survey/ (registries), content ?raw, and contracts — but NOT dashboard/,
// stores/, lib/, or components/. This file imports only content ?raw + the
// phase registries from survey/questions. dashboard/ reads it via flowRefs.
//
// Status semantics:
//   "live"     — referenced by at least one manifest step via flowRefs;
//                appears as a live drill-down in the Flow Map.
//   "proposed" — known to the registry but NOT referenced by any manifest step;
//                excluded from live drill-downs and from the rendered<->runtime
//                bijection; rendered as an ordered graph in the Flow Map's Library
//                section (spec 025, D6). The `status` here is the single source
//                of that marker (the YAML flow descriptors that once mirrored it
//                are deleted).
//
// Migrating a flow from a thin YAML order list to a DERIVED order (spec 085 Q3 /
// SC-003 — no hand-maintained order lists). Do this once per flow:
//   1. Give each of the flow's question modules `provides` / `requires`
//      (DecisionId, decisions/decisionTypes.ts; add new ids there + in
//      decisionIRPaths). Registry key order is the tie-break where the graph is
//      silent, so keep the keys in walk order.
//   2. Add a `<flow>DecisionIndex` beside the registry (indexProviders over the
//      registry values — see phaseADecisionIndex / phaseTrackDecisionIndex).
//   3. Freeze the YAML's order in a decisions/*Parity test (derived order ===
//      frozen legacy array), then delete the YAML and its ?raw import here.
//   4. Swap `raw: xRaw` for `derivedModules: Object.values(registry)` and set
//      `phase` (the deleted YAML's `phase:` letter). Everything downstream
//      (loadFlowSourceDef, dashboard graphs, rendered-node set, proposed/library
//      flows, mirror suites) keys off derivedModules generically — no per-flow code.
//   5. Retarget any test that imported the YAML ?raw to loadFlowSourceDef
//      (flowSources[id]); tests/survey/orphan-input-lint picks derived flows up
//      automatically. Conditional visibility stays single-sourced in each
//      module's definition.next (gatedBy is derived from it, FR-005).


import { phaseARegistry } from "../survey/questions/registry.a.ts";
import { phaseBRegistry } from "../survey/questions/registry.b.ts";
import { phaseFRegistry, phaseFFlowModules } from "../survey/questions/registry.f.ts";
import { phaseTrackRegistry, phaseProjectRegistry } from "../survey/questions/registry.g.ts";
import { reserveRegistry, phaseAReserveRegistry } from "../survey/questions/registry.reserve.ts";

import type { QuestionModule } from "../survey/types.ts";
import type { FlowDef } from "../survey/types.ts";
import { loadDerivedFlowDef, loadModularFlow } from "../survey/loadModularFlow.ts";

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
   * The ?raw import of the thin modular YAML descriptor.
   * Absent when the flow's order is derived (see `derivedModules`) — the
   * YAML list was deleted per spec 085 Q3.
   */
  raw?: string;
  /**
   * Question modules whose provides/requires declarations supply this flow's
   * order via `orderDecisions` (spec 085 T040). Present exactly when `raw`
   * is absent — one ordering source per flow, never both.
   */
  derivedModules?: readonly QuestionModule[];
  /**
   * Phase letter of the flow (the deleted YAML's `phase:` field). Required
   * when `derivedModules` is set; unused for YAML flows (the YAML carries it).
   */
  phase?: string;
  /**
   * Subset of `derivedModules` that forms the supplemental
   * `provenance_questions` list (Phase A). Membership only � order still
   * derives from the single provides/requires pass over `derivedModules`.
   */
  provenanceModules?: readonly QuestionModule[];
  /** Human title for the Flow Map drill-down header. */
  title: string;
  /** Registry of QuestionModule definitions for this flow's questions. */
  registry: Readonly<Record<string, QuestionModule>>;
  /**
   * "live"     — referenced by >=1 manifest step; appears in live drill-downs.
   * "proposed" — not yet referenced by any manifest step; Stage 2 will build
   *              full ordered graphs; Stage 1 renders a flat Library list only.
   */
  status: "live" | "proposed";
}

/**
 * Load a flow source's FlowDef: derived order when `derivedModules` is
 * present, otherwise the thin YAML. Exactly one ordering source per flow —
 * both absent or both present is a fail-fast error.
 */
export function loadFlowSourceDef(source: FlowSource): FlowDef {
  const hasRaw = source.raw !== undefined;
  const hasDerived = source.derivedModules !== undefined;
  if (hasRaw === hasDerived) {
    throw new Error(
      `flowSources: "${source.id}" must declare exactly one of raw / derivedModules`,
    );
  }
  if (hasDerived) {
    if (source.phase === undefined) {
      throw new Error(`flowSources: derived flow "${source.id}" must declare phase`);
    }
    return loadDerivedFlowDef(
      source.id,
      source.phase,
      source.derivedModules ?? [],
      source.provenanceModules,
    );
  }
  return loadModularFlow(source.raw as string);
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
 * manifest step — this realises the spec-022 demotion through the new mechanism.
 * Its modules are physically relocated to questions/reserve/ and registered in
 * reserveRegistry (no-delete guardrail) and are visible as the ordered
 * proposed-flow graph in the Flow Map's Library section and as flat entries in
 * its Leftover section — never as reserve clog inside the live identity_lite
 * drill-down (which keys off the il_*-only phaseARegistry).
 */
export const flowSources: Readonly<Record<string, FlowSource>> = {
  // --- Live flows (referenced by manifest step flowRefs) ---

  identity_lite: {
    id: "identity_lite",
    // spec 085 T040: the thin YAML order list is deleted — the order is
    // derived from the il_* modules' own provides/requires declarations
    // (parity with the deleted list proven by orderParity.test.ts).
    derivedModules: Object.values(phaseARegistry),
    phase: "A",
    title: "Identity-lite",
    // phaseARegistry now holds ONLY the il_* modules (the demoted battery was
    // physically relocated to questions/reserve/), so computeReserveNodes
    // yields nothing here: the demoted Phase A battery is not surfaced as
    // reserve clog under the live identity flow. Those demoted modules are
    // registered in reserveRegistry (no-delete guardrail) and surface in the
    // Flow Map's dedicated Leftover section instead (kept for reference /
    // future reuse, never run by the live survey).
    registry: phaseARegistry,
    status: "live",
  },

  track: {
    id: "track",
    derivedModules: Object.values(phaseTrackRegistry),
    phase: "G",
    title: "Track selection",
    registry: phaseTrackRegistry,
    status: "live",
  },

  project_name: {
    id: "project_name",
    derivedModules: Object.values(phaseProjectRegistry),
    phase: "G",
    title: "Project name",
    registry: phaseProjectRegistry,
    status: "live",
  },

  phase_b_characters: {
    id: "phase_b_characters",
    derivedModules: Object.values(phaseBRegistry),
    phase: "B",
    title: "Character discovery",
    registry: phaseBRegistry,
    status: "live",
  },

  phase_f_helpdocs: {
    id: "phase_f_helpdocs",
    derivedModules: phaseFFlowModules,
    phase: "F",
    title: "Help docs",
    registry: phaseFRegistry,
    status: "live",
  },

  // --- Proposed flows (NOT referenced by any manifest step) ---

  // Spec 022 demotion: the full non-identity Phase A battery is excluded from
  // live drill-downs. Its modules are physically relocated to questions/reserve/
  // and registered in reserveRegistry (no-delete guardrail), appearing as the
  // ordered proposed-flow graph in the Library section plus flat entries in the
  // Leftover section — kept for reference / future reuse, never run by the live
  // survey and never clogging the live identity_lite drill-down.
  phase_a_identity: {
    id: "phase_a_identity",
    // spec 085 US4: order derives from the reserve modules' provides/requires
    // (reserve-* decision ids, distinct from the live il_* ones). The 15
    // provenance_* modules keep the supplemental provenance_questions list.
    derivedModules: Object.values(phaseAReserveRegistry),
    phase: "A",
    provenanceModules: Object.values(phaseAReserveRegistry).filter(
      (m) =>
        m.definition.id.startsWith("provenance_") &&
        m.definition.id !== "provenance_opt_in",
    ),
    title: "Full identity (reserve/library)",
    registry: reserveRegistry,
    status: "proposed",
  },
} as const;

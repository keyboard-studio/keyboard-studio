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
//                excluded from live drill-downs; rendered only as a flat Library
//                list (Stage 2 will add full ordered graphs for proposed entries).

import identityLiteModularRaw from "../../../../content/flows/identity_lite.modular.yaml?raw";
import phaseAIdentityModularRaw from "../../../../content/flows/phase_a_identity.modular.yaml?raw";
import phaseBModularRaw from "../../../../content/flows/phase_b_characters.modular.yaml?raw";
import phaseFModularRaw from "../../../../content/flows/phase_f_helpdocs.modular.yaml?raw";
import trackModularRaw from "../../../../content/flows/track.modular.yaml?raw";
import projectNameModularRaw from "../../../../content/flows/project_name.modular.yaml?raw";

import { phaseARegistry } from "../survey/questions/registry.a.ts";
import { phaseBRegistry } from "../survey/questions/registry.b.ts";
import { phaseFRegistry } from "../survey/questions/registry.f.ts";
import { phaseTrackRegistry, phaseProjectRegistry } from "../survey/questions/registry.g.ts";

import type { QuestionModule } from "../survey/types.ts";

// ---------------------------------------------------------------------------
// FlowSource shape
// ---------------------------------------------------------------------------

/**
 * A single survey flow registered in this catalogue.
 * Keyed by the flow's flow_id (matches the YAML `flow_id:` field).
 */
export interface FlowSource {
  /** Stable id — equals the YAML flow_id field. */
  id: string;
  /** The ?raw import of the thin modular YAML descriptor. */
  raw: string;
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
 * Its modules remain registered in phaseARegistry (no-delete guardrail) and are
 * visible as reserve/library nodes in the identity_lite drill-down.
 */
export const flowSources: Readonly<Record<string, FlowSource>> = {
  // --- Live flows (referenced by manifest step flowRefs) ---

  identity_lite: {
    id: "identity_lite",
    raw: identityLiteModularRaw,
    title: "Identity-lite (Phase A head)",
    registry: phaseARegistry,
    status: "live",
  },

  track: {
    id: "track",
    raw: trackModularRaw,
    title: "Phase G — track selection",
    registry: phaseTrackRegistry,
    status: "live",
  },

  project_name: {
    id: "project_name",
    raw: projectNameModularRaw,
    title: "Phase G — project name",
    registry: phaseProjectRegistry,
    status: "live",
  },

  phase_b_characters: {
    id: "phase_b_characters",
    raw: phaseBModularRaw,
    title: "Phase B — character discovery",
    registry: phaseBRegistry,
    status: "live",
  },

  phase_f_helpdocs: {
    id: "phase_f_helpdocs",
    raw: phaseFModularRaw,
    title: "Phase F — help docs",
    registry: phaseFRegistry,
    status: "live",
  },

  // --- Proposed flows (NOT referenced by any manifest step) ---

  // Spec 022 demotion: the full non-identity Phase A battery is excluded from
  // live drill-downs. Its modules remain in phaseARegistry (no-delete guardrail)
  // and appear as reserve/library nodes in the identity_lite drill-down graph.
  // Stage 2 will build a full ordered graph for proposed entries; Stage 1
  // exposes it only as a flat Library list.
  phase_a_identity: {
    id: "phase_a_identity",
    raw: phaseAIdentityModularRaw,
    title: "Phase A — full identity (reserve/library)",
    registry: phaseARegistry,
    status: "proposed",
  },
} as const;

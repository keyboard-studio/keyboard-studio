// Question module registry — consolidated entry point.
//
// Maps every question ID across all phases to its QuestionModule via static
// imports (synchronous; loadModularFlow assembles FlowDef on the call stack).
//
// Per-phase sub-registries (registry.a.ts, registry.b.ts, registry.f.ts) own
// the actual import lists — one file per phase keeps merge conflicts off the
// hot path during parallel migration cycles. This file just merges them.
//
// Fan-out rule: a new question lands in questions/<phase>/<id>.ts AND its phase
// sub-registry. This file does not need editing unless a NEW phase is added.

import type { QuestionModule } from "../types.ts";
import { phaseARegistry } from "./registry.a.ts";
import { phaseBRegistry } from "./registry.b.ts";
import { phaseFRegistry } from "./registry.f.ts";
import { phaseGRegistry } from "./registry.g.ts";

/**
 * Synchronous registry: { [questionId]: QuestionModule }
 *
 * All entries are populated at module-init time; the map never grows at runtime.
 * If a question ID is not found here, loadModularFlow throws immediately rather
 * than silently skipping the question.
 */
export const questionRegistry: Readonly<Record<string, QuestionModule>> = {
  ...phaseARegistry,
  ...phaseBRegistry,
  ...phaseFRegistry,
  ...phaseGRegistry,
} as const;

// ---------------------------------------------------------------------------
// Spec 017 — registry-keyed drill-down declarations (prefill / pb_build_list).
//
// These are DECLARED-ONLY drill-down descriptors hung under the opaque
// `characters` node — NOT questionRegistry entries and NOT modular-YAML flow
// nodes (keeping the orphan-input-lint and the spec-016 bijection green). They
// live in their own module; re-exported here so the drill-down declarations have
// a home under the question registry, per spec 017 T004/T016/T017.
// ---------------------------------------------------------------------------
export {
  drillDownDeclarations,
  prefillDrillDown,
  pbBuildListDrillDown,
  CHARACTERS_NODE_ID,
} from "./drillDownDeclarations.ts";
export type { DrillDownDeclaration, DrillDownOutput } from "./drillDownDeclarations.ts";

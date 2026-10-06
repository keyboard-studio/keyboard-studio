// Derived-order regression guard (km/decisions-spike, spec 085 T040).
//
// The thin identity_lite.modular.yaml order list was deleted — the order is
// now derived from the il_* modules' own provides/requires declarations.
// This test pins the derived order against the deleted list's frozen
// content, so any accidental reorder fails loudly. (Provenance: the parity
// test that compared derived vs YAML before the cutover.)

import { describe, it, expect } from "vitest";
import { phaseARegistry } from "../survey/questions/registry.a.ts";
import { phaseTrackRegistry, phaseProjectRegistry } from "../survey/questions/registry.g.ts";
import { flowSources, loadFlowSourceDef } from "../steps/flowSources.ts";
import type { QuestionModule } from "../survey/types.ts";
import { orderDecisions } from "./orderDecisions.ts";

/** Frozen from the deleted content/flows/identity_lite.modular.yaml. */
const LEGACY_IDENTITY_LITE_ORDER: readonly string[] = [
  "il_language_english",
  "il_language_region",
  "il_language_autonym",
  "il_language_code",
  "il_target_script",
  "il_script_not_supported",
  "il_author_name",
  "il_author_email",
  "il_copyright_holder",
];

describe("orderDecisions — identity_lite derived order (post-YAML)", () => {
  it("derived order equals the frozen legacy order", () => {
    const derived = orderDecisions(Object.values(phaseARegistry)).map(
      (m) => m.definition.id,
    );
    expect(derived).toEqual([...LEGACY_IDENTITY_LITE_ORDER]);
  });
});

// ---------------------------------------------------------------------------
// Phase G flows (spec 085 T042) — one frozen legacy order per migrated flow.
// Add a row here when migrating the next flow (see flowSources.ts header).
// ---------------------------------------------------------------------------

const FROZEN_LEGACY_ORDERS: ReadonlyArray<{
  flowId: string;
  phase: string;
  registry: Readonly<Record<string, QuestionModule>>;
  order: readonly string[];
}> = [
  // Frozen from the deleted content/flows/track.modular.yaml.
  { flowId: "track", phase: "G", registry: phaseTrackRegistry, order: ["track_choice"] },
  // Frozen from the deleted content/flows/project_name.modular.yaml.
  {
    flowId: "project_name",
    phase: "G",
    registry: phaseProjectRegistry,
    order: ["project_display_name", "project_keyboard_id"],
  },
];

describe("orderDecisions — derived flows equal their frozen legacy YAML order", () => {
  for (const { flowId, phase, registry, order } of FROZEN_LEGACY_ORDERS) {
    it(`${flowId}: derived order equals the frozen legacy order`, () => {
      const derived = orderDecisions(Object.values(registry)).map((m) => m.definition.id);
      expect(derived).toEqual([...order]);
    });

    it(`${flowId}: flowSources entry derives (no raw) with the legacy phase`, () => {
      const source = flowSources[flowId]!;
      expect(source.raw).toBeUndefined();
      const flow = loadFlowSourceDef(source);
      expect(flow.flow_id).toBe(flowId);
      expect(flow.phase).toBe(phase);
      expect(flow.questions.map((q) => q.id)).toEqual([...order]);
    });
  }
});

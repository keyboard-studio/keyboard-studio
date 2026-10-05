// Derived-order regression guard (km/decisions-spike, spec 085 T040).
//
// The thin identity_lite.modular.yaml order list was deleted — the order is
// now derived from the il_* modules' own provides/requires declarations.
// This test pins the derived order against the deleted list's frozen
// content, so any accidental reorder fails loudly. (Provenance: the parity
// test that compared derived vs YAML before the cutover.)

import { describe, it, expect } from "vitest";
import { phaseARegistry } from "../survey/questions/registry.a.ts";
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

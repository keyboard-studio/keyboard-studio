// Parity test: the decision-spike derived order reproduces the legacy
// identity-lite YAML order exactly (km/decisions-spike).
//
// This is the no-regression proof for derived ordering: with the
// provides/requires annotations on the il_* modules, dropping the hand-written
// question list changes nothing about the walk the author experiences.

import { describe, it, expect } from "vitest";
import { parseThinYaml } from "../survey/loadModularFlow.ts";
import { questionRegistry } from "../survey/questions/registry.ts";
import { orderDecisions } from "./orderDecisions.ts";
import identityLiteRaw from "../../../../content/flows/identity_lite.modular.yaml?raw";

describe("orderDecisions parity with identity_lite.modular.yaml", () => {
  it("derived order equals the legacy YAML question order", () => {
    const thin = parseThinYaml(identityLiteRaw);
    const modules = thin.questions.map((id) => {
      const mod = questionRegistry[id];
      if (!mod) throw new Error(`question "${id}" not in registry`);
      return mod;
    });
    const derived = orderDecisions(modules).map((m) => m.definition.id);
    expect(derived).toEqual(thin.questions);
  });
});

// Invariant tests for the consolidated question registry.
//
// Key contract: every entry in questionRegistry must be a QuestionModule
// ({ definition, validate, fixtures }) — NOT a raw ES module namespace
// ({ definition, validate, fixtures, default, ... }). The presence of a
// "default" key on a registry entry is the signature of a namespace import
// (import * as foo) leaked through instead of the default-import pattern
// (import foo). P1-A regression guard.

import { describe, it, expect } from "vitest";
import { questionRegistry } from "./registry.ts";

describe("questionRegistry", () => {
  it("has at least one entry", () => {
    expect(Object.keys(questionRegistry).length).toBeGreaterThan(0);
  });

  it("no entry has a 'default' key (namespace-import leak guard)", () => {
    for (const [id, mod] of Object.entries(questionRegistry)) {
      expect(
        Object.prototype.hasOwnProperty.call(mod, "default"),
        `Registry entry "${id}" has a "default" key — registry.a.ts may be using namespace imports instead of default imports`,
      ).toBe(false);
    }
  });

  it("every entry has definition and fixtures; validate is a function if present", () => {
    for (const [id, mod] of Object.entries(questionRegistry)) {
      expect(typeof mod.definition, `"${id}".definition`).toBe("object");
      // validate is optional (notice-type questions have no user input)
      if (mod.validate !== undefined) {
        expect(typeof mod.validate, `"${id}".validate`).toBe("function");
      }
      expect(typeof mod.fixtures, `"${id}".fixtures`).toBe("object");
    }
  });

  it("every entry key matches its definition.id", () => {
    for (const [id, mod] of Object.entries(questionRegistry)) {
      expect(mod.definition.id, `entry key "${id}" vs definition.id`).toBe(id);
    }
  });
});

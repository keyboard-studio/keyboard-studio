// Invariant tests for the consolidated question registry.
//
// Key contract: every entry in questionRegistry must be a QuestionModule
// ({ definition, validate, fixtures }) — NOT a raw ES module namespace
// ({ definition, validate, fixtures, default, ... }). The presence of a
// "default" key on a registry entry is the signature of a namespace import
// (import * as foo) leaked through instead of the default-import pattern
// (import foo). P1-A regression guard.

import { describe, it, expect } from "vitest";
import {
  questionRegistry,
  decisionIndex,
  flowModules,
  demotedPhaseFModules,
  reserveOnlyModules,
  galleryModules,
  moduleRecord,
} from "./registry.ts";

describe("questionRegistry", () => {
  // 9 Phase A + 47 Phase B + 24 Phase F + 3 Phase G + 31 Reserve = 114 question
  // modules, + 14 gallery decision modules (spec 090 T008, research R2: the
  // gallery group registers in this same registry so decisionIndex resolves
  // exactly one provider per gallery decision) = 128 total
  // (re-verified 2026-10-07 at the spec 090 US2 gate; spec 069 FR-002 — update
  // this count in the same change that adds or removes a questionRegistry
  // entry. Spec 079 US5 adds pf_history_entry + pf_history_entry_bullets to
  // Phase F; spec 075 FR-019 retired pb_rtl_direction_marks +
  // pb_rtl_direction_marks_detail from Phase B: the invisible-characters
  // spine step subsumes them.)
  it("has exactly the verified inventory of 128 entries", () => {
    expect(Object.keys(questionRegistry).length).toBe(128);
  });

  it("no entry has a 'default' key (namespace-import leak guard)", () => {
    for (const [id, mod] of Object.entries(questionRegistry)) {
      expect(
        Object.prototype.hasOwnProperty.call(mod, "default"),
        `Registry entry "${id}" has a "default" key — registry.ts may be using namespace imports instead of default imports`,
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

describe("flow membership (single source)", () => {
  it("every registered module is in exactly one membership group", () => {
    const groups: Array<readonly unknown[]> = [
      ...Object.values(flowModules),
      demotedPhaseFModules,
      reserveOnlyModules,
      galleryModules,
    ];
    const total = groups.reduce((n, g) => n + g.length, 0);
    expect(total).toBe(Object.keys(questionRegistry).length);
  });

  it("moduleRecord throws on a duplicate question id", () => {
    const mod = flowModules.track[0];
    expect(() => moduleRecord([mod, mod])).toThrow(/duplicate question id/);
  });
});

describe("decisionIndex (single DecisionId index)", () => {
  it("maps identity-lite decisions to their il_* modules", () => {
    expect(decisionIndex["language-name"]?.definition.id).toBe("il_language_english");
    expect(decisionIndex["language-code"]?.definition.id).toBe("il_language_code");
    expect(decisionIndex["target-script"]?.definition.id).toBe("il_target_script");
    expect(decisionIndex["author-name"]?.definition.id).toBe("il_author_name");
    expect(decisionIndex["author-email"]?.definition.id).toBe("il_author_email");
    expect(decisionIndex["copyright-holder"]?.definition.id).toBe("il_copyright_holder");
    expect(decisionIndex["language-region"]?.definition.id).toBe("il_language_region");
    expect(decisionIndex["language-autonym"]?.definition.id).toBe("il_language_autonym");
  });

  it("covers exactly the decisions the registered modules provide", () => {
    const provided = new Set(
      Object.values(questionRegistry).flatMap((m) => m.provides ?? []),
    );
    for (const id of provided) {
      expect(decisionIndex[id], id).toBeDefined();
    }
    expect(Object.keys(decisionIndex)).toHaveLength(provided.size);
  });
});

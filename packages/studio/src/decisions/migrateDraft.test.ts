// Tests for draft migration (spec 087 T041, Q5): old-flow answers map onto
// decisions at load; unmappable answers surface visibly, never dropped.

import { describe, it, expect } from "vitest";
import type { QuestionModule } from "../survey/types.ts";
import {
  migrateDraft,
  DRAFT_MIGRATION_VERSION,
} from "./migrateDraft.ts";

function stubModule(
  id: string,
  provides?: QuestionModule["provides"],
): QuestionModule {
  return {
    definition: { id, type: "text" },
    fixtures: { valid: [{ value: "x" }], invalid: [] },
    inputs: [],
    writes: [],
    ...(provides !== undefined ? { provides } : {}),
  };
}

const modules = [
  stubModule("il_language_english", ["language-name"]),
  stubModule("il_target_script", ["target-script"]),
  stubModule("il_script_not_supported"), // terminal stub: no provides
];

describe("migrateDraft", () => {
  it("maps answers onto decisions with asked provenance", () => {
    const result = migrateDraft(
      { il_language_english: "Ewondo", il_target_script: "Latn" },
      modules,
    );
    expect(result.decisions["language-name"]).toMatchObject({
      value: "Ewondo",
      provenance: "asked",
    });
    expect(result.decisions["target-script"]).toMatchObject({
      value: "Latn",
      provenance: "asked",
    });
    expect(result.orphans).toEqual([]);
    expect(result.version).toBe(DRAFT_MIGRATION_VERSION);
  });

  it("fans out one answer to every decision the module provides", () => {
    const multi = stubModule("q_multi", ["language-code", "target-script"]);
    const result = migrateDraft({ q_multi: "shared" }, [multi]);
    expect(result.decisions["language-code"]).toMatchObject({ value: "shared" });
    expect(result.decisions["target-script"]).toMatchObject({ value: "shared" });
  });

  it("surfaces unknown questions and provide-less modules as orphans — never drops them", () => {
    const result = migrateDraft(
      {
        il_language_english: "Ewondo",
        retired_question: "old value",
        il_script_not_supported: "acknowledged",
      },
      modules,
    );
    expect(result.decisions["language-name"]).toMatchObject({ value: "Ewondo" });
    expect(result.orphans).toEqual([
      { questionId: "retired_question", value: "old value" },
      { questionId: "il_script_not_supported", value: "acknowledged" },
    ]);
  });

  it("migrates an empty draft to empty decisions", () => {
    const result = migrateDraft({}, modules);
    expect(result.decisions).toEqual({});
    expect(result.orphans).toEqual([]);
  });
});

describe("migrateDraft — Phase G flows (spec 087 T042)", () => {
  it("maps track and project-name answers through the real registries", async () => {
    const { flowModules } = await import("../survey/questions/registry.ts");
    const result = migrateDraft(
      { track_choice: "copy", project_display_name: "My Kbd", project_keyboard_id: "my_kbd" },
      [...flowModules.track, ...flowModules.project_name],
    );
    expect(result.orphans).toEqual([]);
    expect(result.decisions["authoring-track"]).toMatchObject({ value: "copy", provenance: "asked" });
    expect(result.decisions["project-display-name"]).toMatchObject({ value: "My Kbd" });
    expect(result.decisions["project-keyboard-id"]).toMatchObject({ value: "my_kbd" });
  });
});

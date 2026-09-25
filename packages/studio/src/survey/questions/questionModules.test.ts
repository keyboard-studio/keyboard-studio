// Contract suite for every live question module (a/, b/, f/, g/ — registered
// or not; reserve/ has its own suite). See src/test/questionModuleContract.ts
// for what runs per module. Per-module test files under
// tests/survey/questions/ hold only behaviour specific to one module.

import { describe, it, expect } from "vitest";
import {
  LIVE_QUESTION_MODULES,
  ON_DISK_QUESTION_MODULES,
  describeQuestionModules,
  type ValidateProbe,
} from "../../test/questionModuleContract.ts";
import { questionRegistry } from "./registry.ts";

// Hand-written validate() cases that are not in a module's own fixtures,
// carried over from the per-module mirror tests this suite replaced.
const PROBES: Readonly<Record<string, readonly ValidateProbe[]>> = {
  il_author_name: [{ value: "Alice Example", accepts: true, note: "a real name" }],
  il_language_autonym: [
    { value: "Faʼ", accepts: true, note: "no script gate at validation (Latin + modifier letter)" },
    { value: " አማርኛ", accepts: true, note: "no script gate at validation (Ethiopic)" },
    { value: "日本語", accepts: true, note: "no script gate at validation (Han)" },
  ],
  pb_char_count: [{ value: "massive", rejects: "invalid_option", note: "out of Phase B scope per spec §9/§16" }],
  pb_indic_conjuncts: [{ value: "maybe", rejects: "required", note: "not a bool string" }],
  pb_linguist_confirm: [{ value: "yes", rejects: "required", note: "not a bool string" }],
  pb_text_sample: [
    { value: ["", "  "], rejects: "required", note: "an array of blank lines is blank" },
    { value: "بِسْمِ اللَّهِ الرَّحْمَٰنِ الرَّحِيمِ", accepts: true, note: "non-Latin text" },
  ],
  pb_text_sample_review: [{ value: "yes", rejects: "required", note: "not a bool string" }],
  pb_typing_approach: [
    { value: "phonetic", accepts: true, note: "phonetic -> A3 strong" },
    { value: "direct", accepts: true, note: "others -> A3 weak" },
  ],
  pf_doc_language: [
    { value: "klingon", rejects: "invalid_option", note: "an unoffered option" },
    { value: undefined, accepts: true, note: "optional — blank means English" },
    { value: "", accepts: true, note: "optional — blank means English" },
  ],
  pf_welcome_paragraph: [
    { value: "Keyboard untuk mengetik Ewondo (ʼÉwondo) di komputer.", accepts: true, note: "Unicode description" },
  ],
  project_display_name: [{ value: "Ghomálá'", accepts: true, note: "a non-ASCII display name" }],
};

describeQuestionModules("live question modules", LIVE_QUESTION_MODULES, {
  probes: PROBES,
  // validateKeyboardId reports every unusable id, blank included, the same way.
  blankCodes: { project_keyboard_id: "invalid_keyboard_id" },
});

describe("questionRegistry ↔ on-disk modules", () => {
  it("every registry entry is the on-disk module of the same id", () => {
    const byId = new Map(ON_DISK_QUESTION_MODULES.map((e) => [e.id, e.mod]));
    for (const [id, mod] of Object.entries(questionRegistry)) {
      expect(byId.has(id), `registry entry "${id}" has no module file under survey/questions/`).toBe(true);
      expect(byId.get(id), `registry entry "${id}" is not its on-disk module's default export`).toBe(mod);
    }
  });

  it("module ids are unique across folders", () => {
    const ids = ON_DISK_QUESTION_MODULES.map((e) => e.id);
    expect(new Set(ids).size).toBe(ids.length);
  });
});

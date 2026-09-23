// Contract suite for every live question module (a/, b/, f/, g/ — registered
// or not; reserve/ has its own suite). See src/test/questionModuleContract.ts
// for what runs per module. Per-module test files under
// tests/survey/questions/ hold only behaviour specific to one module.

import { describe, it, expect } from "vitest";
import {
  LIVE_QUESTION_MODULES,
  ON_DISK_QUESTION_MODULES,
  describeQuestionModules,
} from "../../test/questionModuleContract.ts";
import { questionRegistry } from "./registry.ts";

describeQuestionModules("live question modules", LIVE_QUESTION_MODULES, {
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

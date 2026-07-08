// spec 030 US1 — langtags-picker-first identity flow.
//
// The langtags picker (il_language_code) becomes the FIRST question; selecting a
// language resolves the entry, which seeds the English-name and autonym
// confirmations (il_language_english / il_language_autonym) and the script.
// extractIdentityLite is deliberately UNCHANGED (english/autonym/code are still
// read from their answers — now pre-filled), so identity extraction stays valid.
//
// Pure-logic tests (no jsdom), matching IdentityLite.langtags.test.ts. The seed
// WIRING itself (getSeedValue returning the resolved englishName/autonym) is
// component-internal (refs in IdentityLite.tsx) and is covered by typecheck +
// the flow/extraction contracts asserted here.

import { describe, it, expect } from "vitest";
import { loadModularFlow } from "./loadModularFlow.ts";
import { extractIdentityLite } from "./IdentityLite.tsx";
import identityLiteRaw from "../../../../content/flows/identity_lite.modular.yaml?raw";
import type { SurveyPhaseResult } from "@keyboard-studio/contracts";

const flow = loadModularFlow(identityLiteRaw as string);

describe("spec 030 US1 — identity flow order (langtags picker first)", () => {
  it("orders the questions: picker -> english -> autonym -> script -> not-supported", () => {
    expect(flow.questions.map((q) => q.id)).toEqual([
      "il_language_code",
      "il_language_english",
      "il_language_autonym",
      "il_target_script",
      "il_script_not_supported",
    ]);
  });

  it("the first question is the langtags-backed autocomplete picker", () => {
    const first = flow.questions[0];
    expect(first?.id).toBe("il_language_code");
    expect(first?.type).toBe("autocomplete");
    expect(first?.options_source).toBe("@langtags_iso639");
  });

  it("the name confirmations follow the picker (english then autonym)", () => {
    const ids = flow.questions.map((q) => q.id);
    expect(ids.indexOf("il_language_english")).toBeGreaterThan(ids.indexOf("il_language_code"));
    expect(ids.indexOf("il_language_autonym")).toBeGreaterThan(ids.indexOf("il_language_english"));
  });
});

describe("spec 030 US1 — extractIdentityLite maps the reordered/seeded answers", () => {
  it("derives english / autonym / code from the (now pre-filled) confirmation answers", () => {
    const result: SurveyPhaseResult = {
      phase: "A",
      answers: [
        { questionId: "il_language_code", answerType: "text", value: "ha" },
        { questionId: "il_language_english", answerType: "text", value: "Hausa" },
        { questionId: "il_language_autonym", answerType: "text", value: "Hausa" },
        { questionId: "il_target_script", answerType: "select", value: "Latn" },
      ],
    };
    const id = extractIdentityLite(result);
    expect(id.languageSubtag).toBe("ha");
    expect(id.english).toBe("Hausa");
    expect(id.autonym).toBe("Hausa");
    expect(id.bcp47).toBe("ha-Latn");
    expect(id.supported).toBe(true);
  });

  it("free-text / unmatched language still completes — no dead end (FR-003)", () => {
    // Author typed a code not in langtags; the seeds were empty so they typed the
    // names themselves. Extraction must not throw and must carry their input.
    const result: SurveyPhaseResult = {
      phase: "A",
      answers: [
        { questionId: "il_language_code", answerType: "text", value: "bft" },
        { questionId: "il_language_english", answerType: "text", value: "Balti" },
        { questionId: "il_language_autonym", answerType: "text", value: "" },
      ],
    };
    expect(() => extractIdentityLite(result)).not.toThrow();
    const id = extractIdentityLite(result);
    expect(id.languageSubtag).toBe("bft");
    expect(id.english).toBe("Balti");
  });

  it("blank language (author unsure) still completes with an empty bcp47", () => {
    const result: SurveyPhaseResult = {
      phase: "A",
      answers: [
        { questionId: "il_language_english", answerType: "text", value: "My Language" },
        { questionId: "il_language_autonym", answerType: "text", value: "Mine" },
      ],
    };
    const id = extractIdentityLite(result);
    expect(id.languageSubtag).toBe("");
    expect(id.bcp47).toBe("");
    expect(id.english).toBe("My Language");
  });
});

// The characters, punctuation and invisibles drivers (spec 107 T028): the
// build-list path with the pinned exemplar index, the case's text sample, and
// the phase-C steps' proposals taken as offered. The acceptance signal is the
// alphabet the walk leaves on the decision record, not that a driver returned.

import { beforeEach, describe, expect, it } from "vitest";
import type { SurveyPhaseResult } from "@keyboard-studio/contracts";
import { useWorkingCopyStore } from "../../../stores/workingCopyStore.ts";
import { useSurveySessionStore } from "../../../stores/surveySessionStore.ts";
import { useSurveyAnswerStore } from "../../../stores/surveyAnswerStore.ts";
import { getDecisionSnapshot, useDecisionStore } from "../../../stores/decisionStore.ts";
import type { Case } from "../caseTypes.ts";
import { createRunReport } from "../runReport.ts";
import { inventoryDrivers } from "./inventory.ts";

function reset(): void {
  useWorkingCopyStore.getState().reset();
  useSurveySessionStore.getState().reset();
  useSurveyAnswerStore.getState().reset();
  useDecisionStore.getState().reset();
}

/** Identity decisions and a start keyboard, as the routing leaves them before `characters`. */
function seedIdentity(code: string): void {
  const record = (id: string, value: string): void =>
    useDecisionStore.getState().record({ id, value, provenance: "asked", step: "identity" } as never);
  record("language-code", code);
  record("language-name", "Test language");
  record("language-autonym", "Test");
  record("target-script", "Latn");
  useSurveySessionStore.getState().setLocalStart({
    id: "basic_kbdus",
    path: "release/b/basic_kbdus",
    script: "Latn",
    targets: ["windows"],
    displayName: "US Basic",
    version: "1.0",
  });
}

function drive(step: string, sampleText: string) {
  const report = createRunReport("store-default");
  const run = async () =>
    (await inventoryDrivers[step]!({
      case: { sampleText } as unknown as Case,
      startIr: null as never,
      report,
    })) as SurveyPhaseResult;
  return { report, run };
}

beforeEach(reset);

describe("characters driver", () => {
  it("takes the pre-selected exemplar set, leaving a populated alphabet on the decision record", async () => {
    seedIdentity("bfd");
    const { report, run } = drive("characters", "");
    const result = await run();

    const value = getDecisionSnapshot()["character-inventory"]?.value as { chars: string[]; provenance: Record<string, string> };
    expect(value.chars.length).toBeGreaterThan(0);
    expect(Object.values(value.provenance)).toContain("sldr");
    expect(result.phase).toBe("B");
    expect(result.confirmedInventory?.length).toBeGreaterThan(0);
    expect(useSurveySessionStore.getState().discoveryMethod).toBe("build-list");
    expect(report.report.steps.find((s) => s.decisionId === "characters.discoveryMethod")).toMatchObject({
      rule: "default",
      value: "exemplars",
    });
  });

  it("submits the case's text sample when the product offers no alphabet", async () => {
    seedIdentity("zzz");
    const { report, run } = drive("characters", "abc");
    await run();

    const value = getDecisionSnapshot()["character-inventory"]?.value as { chars: string[]; provenance: Record<string, string> };
    expect(value.chars).toEqual(expect.arrayContaining(["a", "b", "c"]));
    expect(Object.values(value.provenance)).toContain("text");
    expect(report.report.steps.find((s) => s.decisionId === "characters.discoveryMethod")?.value).toBe("build-list");
    expect(report.report.steps.find((s) => s.decisionId === "characters.textSample")?.rule).toBe("override");
  });

  it("fails when Continue stays disabled: no exemplars and no text sample", async () => {
    seedIdentity("zzz");
    await expect(drive("characters", "").run()).rejects.toThrow(/alphabet is empty/);
  });
});

describe("punctuation and invisibles drivers", () => {
  it("complete with the phase-C result, taking the seeded proposals as offered", async () => {
    seedIdentity("bfd");
    await drive("characters", "").run();

    const punctuation = await drive("punctuation", "").run();
    expect(punctuation.phase).toBe("C");
    expect(useSurveyAnswerStore.getState().steps["punctuation"]?.answers["punctuation.inventory"]?.evidenceKey).toContain("|");

    const invisibles = await drive("invisibles", "").run();
    expect(invisibles.phase).toBe("C");
    expect(invisibles.answers.length).toBeGreaterThan(0);
    expect(invisibles.answers.every((a) => a.answerType === "boolean")).toBe(true);
  });
});

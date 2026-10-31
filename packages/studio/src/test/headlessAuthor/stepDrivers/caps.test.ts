// The Phase F (help) driver walks the phase_f_helpdocs flow with the product's
// own options record (spec 107 T033). A fixture with an empty inventory, so the
// coverage gate passes and the walk is the flow alone.

import { beforeEach, describe, expect, it } from "vitest";
import { useWorkingCopyStore } from "../../../stores/workingCopyStore.ts";
import { useSurveySessionStore } from "../../../stores/surveySessionStore.ts";
import { useDecisionStore } from "../../../stores/decisionStore.ts";
import { deriveInventoryCoverageGate } from "../../../lib/inventoryDiff.ts";
import type { Case } from "../caseTypes.ts";
import { createRunReport } from "../runReport.ts";
import { capsDrivers } from "./caps.ts";

function reset(): void {
  useWorkingCopyStore.getState().reset();
  useSurveySessionStore.getState().reset();
  useDecisionStore.getState().reset();
  useSurveySessionStore.getState().advance("help");
}

beforeEach(reset);

describe("caps driver (help step)", () => {
  it("completes the flow with the product defaults, a placeholder description, and the coverage gate open", async () => {
    expect(deriveInventoryCoverageGate(useWorkingCopyStore.getState()).blocked).toBe(false);

    const report = createRunReport("store-default");
    const result = (await capsDrivers["help"]!({
      case: {} as Case,
      startIr: useWorkingCopyStore.getState().startIr as never,
      report,
    })) as { phase: string; answers: { questionId: string; value: unknown }[] };

    expect(result.phase).toBe("F");
    const byId = new Map(result.answers.map((a) => [a.questionId, a.value]));
    // The required description has no proposal here: the placeholder is typed.
    expect(byId.get("pf_welcome_paragraph")).toBe("zzq");
    // The gate's lookup default (No) is taken, routing straight to credits.
    expect(byId.get("pf_more_detail_gate")).toBe(false);
    expect(byId.has("pf_doc_language")).toBe(false);
  });
});

// The Phase F (help) driver walks the phase_f_helpdocs flow with the product's
// own options record (spec 107 T033). A fixture with an empty inventory, so the
// coverage gate passes and the walk is the flow alone.

import { beforeEach, describe, expect, it } from "vitest";
import { createVirtualFS } from "@keyboard-studio/contracts";
import { basicKbdus, makeTestIR } from "@keyboard-studio/contracts/fixtures";
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

    const report = createRunReport();
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

  it("asks the body-parity question on an adaptation with differing pages, taking the seeded welcome default", async () => {
    const ir = makeTestIR([]);
    ir.header.version = "1.0";
    useWorkingCopyStore
      .getState()
      .instantiateFromExisting(basicKbdus, { vfs: createVirtualFS(), ir });
    useWorkingCopyStore
      .getState()
      .setStartWelcomeHtmText("<html><body><p>Welcome to Test Keyboard</p></body></html>");
    useWorkingCopyStore
      .getState()
      .setStartHelpPhpText(
        "<?php\n  $pagename = 'Test Keyboard Help';\n  $pagetitle = $pagename;\n  require_once('header.php');\n?>\n<html><body><p>Something totally different.</p></body></html>",
      );

    expect(deriveInventoryCoverageGate(useWorkingCopyStore.getState()).blocked).toBe(false);

    const report = createRunReport();
    const result = (await capsDrivers["help"]!({
      case: {} as Case,
      startIr: useWorkingCopyStore.getState().startIr as never,
      report,
    })) as { phase: string; answers: { questionId: string; value: unknown }[] };

    expect(result.phase).toBe("F");
    const byId = new Map(result.answers.map((a) => [a.questionId, a.value]));
    // The seeded "welcome" default is the walk's top suggestion, so the
    // question is answered without a driver placeholder.
    expect(byId.get("pf_body_parity")).toBe("welcome");
    // The seeded default is in the decision record (provenance default) —
    // that is what the walk's policy consumed as its top suggestion.
    expect(useDecisionStore.getState().decisions["help-body-parity"]?.value).toBe("welcome");
  });
});

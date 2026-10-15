// CharactersStep A7a remap-posture confirmation tests (spec §7.2 rule 8).
//
// The derived producer (target identity x base IR) fires for an alphabetic
// non-Latin target on a Latin letter base. When it fires:
//   (a) the prefill surface receives a remapConfirmation pre-filled with
//       "full-remap", and the irAxes baseline is reconciled to match;
//   (b) confirming without a change records the derived value as the
//       phase result's tier-1 computed axis;
//   (c) changing the answer to "addition" records "addition" instead (and
//       persists the choice as a survey answer for the evidence key).
// When it does not fire (Latin target), no confirmation is offered and no
// axis is recorded.
//
// Strategy mirrors CharactersStep.test.tsx: Prefill/PhaseB are mocked at
// the file level; stores are seeded via getState()/setState.

import { describe, it, expect, afterEach, vi } from "vitest";
import { render, screen, fireEvent, cleanup } from "@testing-library/react";
import type { RemapPosture, SurveyPhaseResult } from "@keyboard-studio/contracts";
import { createVirtualFS } from "@keyboard-studio/contracts";
import { basicKbdus, irGroup, makeTestIR, vkeyRule } from "@keyboard-studio/contracts/fixtures";
import { useSurveySessionStore } from "../stores/surveySessionStore.ts";
import { useDecisionStore } from "../stores/decisionStore.ts";
import { useWorkingCopyStore } from "../stores/workingCopyStore.ts";
import { useSurveyAnswerStore } from "../stores/surveyAnswerStore.ts";
import { resetInventoryDecisions } from "../survey/useInventoryDraft.ts";

const { mockRemapRef } = vi.hoisted(() => ({
  mockRemapRef: {
    current: undefined as
      | { value: RemapPosture; onChange: (next: RemapPosture) => void }
      | undefined,
  },
}));

vi.mock("./Prefill.tsx", () => ({
  Prefill: ({
    onConfirm,
    remapConfirmation,
  }: {
    onConfirm: () => void;
    remapConfirmation?: { value: RemapPosture; onChange: (next: RemapPosture) => void };
  }) => {
    mockRemapRef.current = remapConfirmation;
    return (
      <div data-testid="mock-prefill">
        <button type="button" data-testid="prefill-continue" onClick={onConfirm}>
          confirm
        </button>
        {remapConfirmation !== undefined && (
          <button
            type="button"
            data-testid="prefill-remap-to-addition"
            onClick={() => remapConfirmation.onChange("addition")}
          >
            change to addition
          </button>
        )}
      </div>
    );
  },
}));

vi.mock("./PhaseB.tsx", () => ({
  PhaseB: ({ onComplete }: { onComplete: (r: unknown) => void }) => {
    const fakeResult: SurveyPhaseResult = {
      phase: "B" as const,
      answers: [],
      confirmedInventory: [],
    };
    return (
      <div data-testid="mock-phase-b">
        <button
          type="button"
          data-testid="phaseB-complete"
          onClick={() => onComplete(fakeResult)}
        >
          complete
        </button>
      </div>
    );
  },
}));

import { CharactersStepHost } from "./CharactersStepHost.tsx";

const fakeStart = {
  id: "basic_kbdus",
  path: "release/b/basic_kbdus",
  script: "Latn",
  displayName: "English (US)",
  targets: ["windows"] as string[],
  version: "1.0",
};

function latinLetterIr() {
  return makeTestIR([
    irGroup({
      rules: [
        vkeyRule({ vkey: "K_A", output: "a" }),
        vkeyRule({ vkey: "K_B", output: "b" }),
        vkeyRule({ vkey: "K_C", output: "c" }),
      ],
    }),
  ]);
}

function seedIdentity(targetScriptRaw: string): void {
  const record = useDecisionStore.getState().record;
  record({ id: "language-name", value: "Armenian", provenance: "asked" });
  record({ id: "language-autonym", value: "Armenian", provenance: "asked" });
  record({ id: "language-code", value: "hy", provenance: "asked" });
  record({ id: "language-region", value: "", provenance: "asked" });
  record({ id: "target-script", value: targetScriptRaw, provenance: "asked" });
}

function seedAll(targetScriptRaw: string): void {
  seedIdentity(targetScriptRaw);
  useSurveySessionStore.setState({ localStart: fakeStart, charactersSubStage: "prefill" });
  useWorkingCopyStore
    .getState()
    .instantiateFromStart(basicKbdus, { vfs: createVirtualFS(), ir: latinLetterIr() });
}

afterEach(() => {
  cleanup();
  resetInventoryDecisions();
  useWorkingCopyStore.getState().reset();
  useSurveyAnswerStore.setState({ steps: {} });
  mockRemapRef.current = undefined;
});

describe("CharactersStep — A7a remap-posture confirmation", () => {
  it("offers the derived full-remap prefill and reconciles irAxes for an Armenian target on a Latin base", () => {
    seedAll("Armn");
    render(<CharactersStepHost onComplete={vi.fn()} onBack={vi.fn()} />);

    expect(screen.getByTestId("mock-prefill")).toBeTruthy();
    expect(mockRemapRef.current?.value).toBe("full-remap");
    expect(useWorkingCopyStore.getState().irAxes.remapPosture).toBe("full-remap");
  });

  it("records the derived value as the tier-1 axis when confirmed unchanged", async () => {
    seedAll("Armn");
    const onComplete = vi.fn();
    render(<CharactersStepHost onComplete={onComplete} onBack={vi.fn()} />);

    fireEvent.click(screen.getByTestId("prefill-continue"));
    fireEvent.click(await screen.findByTestId("phaseB-complete"));

    expect(onComplete).toHaveBeenCalledTimes(1);
    const emitted = onComplete.mock.calls[0]?.[0] as SurveyPhaseResult;
    expect(emitted.computedAxes?.remapPosture).toBe("full-remap");
  });

  it("records addition when the author changes the pre-filled answer", async () => {
    seedAll("Armn");
    const onComplete = vi.fn();
    render(<CharactersStepHost onComplete={onComplete} onBack={vi.fn()} />);

    fireEvent.click(screen.getByTestId("prefill-remap-to-addition"));
    expect(mockRemapRef.current?.value).toBe("addition");
    const saved =
      useSurveyAnswerStore.getState().steps["characters"]?.answers["characters.remapPosture"];
    expect(saved?.value).toBe("addition");

    fireEvent.click(screen.getByTestId("prefill-continue"));
    fireEvent.click(await screen.findByTestId("phaseB-complete"));

    const emitted = onComplete.mock.calls[0]?.[0] as SurveyPhaseResult;
    expect(emitted.computedAxes?.remapPosture).toBe("addition");
  });

  it("offers no confirmation and records no axis for a Latin target", async () => {
    seedAll("Latn");
    const onComplete = vi.fn();
    render(<CharactersStepHost onComplete={onComplete} onBack={vi.fn()} />);

    expect(screen.getByTestId("mock-prefill")).toBeTruthy();
    expect(mockRemapRef.current).toBeUndefined();
    expect(useWorkingCopyStore.getState().irAxes.remapPosture).toBeUndefined();

    fireEvent.click(screen.getByTestId("prefill-continue"));
    fireEvent.click(await screen.findByTestId("phaseB-complete"));

    const emitted = onComplete.mock.calls[0]?.[0] as SurveyPhaseResult;
    expect(emitted.computedAxes?.remapPosture).toBeUndefined();
  });
});

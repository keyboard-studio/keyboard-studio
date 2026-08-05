// jumpToLocation.test — the ONE jump primitive (spec 057 T018).
//
// The contract under test is FR-012's: a jump ARRIVES or it REFUSES, and a
// refusal writes nothing. "Writes nothing" is the assertion that matters —
// a jump that set the traversal target and then declined to navigate would
// leave the wizard silently re-pointed at a step the author never asked to
// be on.

import { describe, it, expect, beforeEach, vi } from "vitest";
import { createVirtualFS } from "@keyboard-studio/contracts";
import { basicKbdus, makeTestIR } from "@keyboard-studio/contracts/fixtures";
import { useSurveySessionStore } from "../stores/surveySessionStore.ts";
import { useWorkingCopyStore } from "../stores/workingCopyStore.ts";
import {
  clearPendingJump,
  consumePendingJump,
  jumpToLocation,
  peekPendingJump,
} from "./jumpToLocation.ts";

vi.mock("./navigate.ts", async (importOriginal) => {
  const actual = await importOriginal<typeof import("./navigate.ts")>();
  return { ...actual, navigateTo: vi.fn() };
});

import { navigateTo } from "./navigate.ts";

/** Instantiate a working copy so `hasProject` is true. */
function seedProject(): void {
  useWorkingCopyStore.getState().instantiateFromBase(basicKbdus, {
    vfs: createVirtualFS([{ path: "source/basic_kbdus.kmn", content: "c\n", isBinary: false }]),
    ir: makeTestIR([]),
  });
}

/** Walk identity -> choose_base -> track -> characters. */
function walkToCharacters(): void {
  const s = useSurveySessionStore.getState();
  s.advance("choose_base");
  useSurveySessionStore.getState().advance("track");
  useSurveySessionStore.getState().advance("characters");
}

beforeEach(() => {
  vi.mocked(navigateTo).mockClear();
  clearPendingJump();
  useSurveySessionStore.getState().reset();
  useWorkingCopyStore.getState().reset();
  window.location.hash = "#trail";
});

describe("arrival", () => {
  it("sets the traversal target AND navigates", () => {
    seedProject();
    walkToCharacters();

    const outcome = jumpToLocation({ route: "survey", step: "choose_base" });

    expect(outcome).toEqual({ kind: "arrived", at: { route: "survey", step: "choose_base" } });
    expect(useSurveySessionStore.getState().activeStepId).toBe("choose_base");
    expect(navigateTo).toHaveBeenCalledWith({ route: "survey" });
  });

  it("truncates history to the walked path from the landing point", () => {
    seedProject();
    walkToCharacters();

    jumpToLocation({ route: "survey", step: "choose_base" });

    // Everything after the landing point is consumed; everything before it
    // stays, so an in-app Back from here still walks the real path.
    expect(useSurveySessionStore.getState().history).toEqual(["identity"]);
    expect(useSurveySessionStore.getState().lastNavigation).toBe("pop");
  });

  it("parks a requested question for the step runner to consume", () => {
    seedProject();
    walkToCharacters();

    jumpToLocation({ route: "survey", step: "identity", question: "il_language_english" });

    expect(peekPendingJump()).toEqual({ question: "il_language_english" });
    // Consuming clears it, so a later ordinary arrival at the same step does
    // not silently re-target the question.
    expect(consumePendingJump()).toEqual({ question: "il_language_english" });
    expect(peekPendingJump()).toBeNull();
  });

  it("retains returnTo for the caller's return affordance (FR-034)", () => {
    seedProject();
    walkToCharacters();

    jumpToLocation(
      { route: "survey", step: "identity", question: "il_language_english" },
      { returnTo: { route: "trail" } },
    );

    expect(peekPendingJump()).toEqual({
      question: "il_language_english",
      returnTo: { route: "trail" },
    });
  });

  it("skips the navigate when already on the target tab — a same-value hash fires no hashchange", () => {
    seedProject();
    walkToCharacters();
    window.location.hash = "#survey";

    const outcome = jumpToLocation({ route: "survey", step: "choose_base" });

    expect(outcome.kind).toBe("arrived");
    expect(useSurveySessionStore.getState().activeStepId).toBe("choose_base");
    expect(navigateTo).not.toHaveBeenCalled();
  });
});

describe("refusal", () => {
  it("every refusable location degrades instead, because the route is always a valid ancestor", () => {
    // Worth stating rather than leaving implicit: `JumpOutcome.refused` is
    // currently unreachable BY CONSTRUCTION, and that is FR-014 working, not
    // a gap. A step-scoped location always has an ancestor to fall back to
    // (drop the question, then the step, then land on the route), and a bare
    // route resolves reachable, so no input produces a flat refusal today.
    // The variant stays in the union because FR-012 defines the outcome set,
    // and a future gate that makes a whole TAB unreachable would produce it.
    seedProject();
    walkToCharacters();

    const outcomes = [
      jumpToLocation({ route: "survey", step: "touch" }),
      jumpToLocation({ route: "survey", step: "project_name" }),
      jumpToLocation({ route: "survey", step: "not_a_step" as never }),
    ];
    expect(outcomes.map((o) => o.kind)).toEqual(["degraded", "degraded", "degraded"]);
  });

  it("a forward jump past a gate degrades rather than skipping the lock", () => {
    seedProject();
    walkToCharacters();

    const outcome = jumpToLocation({ route: "survey", step: "touch" });

    expect(outcome).toMatchObject({ kind: "degraded", reason: "beyond-gate" });
    // The store was NOT moved to "touch" — the whole point of the refusal.
    expect(useSurveySessionStore.getState().activeStepId).toBe("characters");
  });

  it("a jump with no project instantiated degrades to the bare route", () => {
    // No seedProject() — hasProject is false.
    const outcome = jumpToLocation({ route: "survey", step: "characters" });

    expect(outcome).toMatchObject({
      kind: "degraded",
      at: { route: "survey" },
      reason: "no-project",
    });
    expect(useSurveySessionStore.getState().activeStepId).toBe("identity");
  });
});

describe("degrade", () => {
  it("lands on the ancestor and reports the reason", () => {
    seedProject();
    walkToCharacters();

    const outcome = jumpToLocation({
      route: "survey",
      step: "choose_base",
      question: "no_such_question",
    });

    expect(outcome).toEqual({
      kind: "degraded",
      at: { route: "survey", step: "choose_base" },
      reason: "question-not-in-build",
    });
    // The step half of the request WAS honoured — that is what "nearest valid
    // ancestor" means, and it is why a degrade is not a refusal.
    expect(useSurveySessionStore.getState().activeStepId).toBe("choose_base");
    expect(peekPendingJump()).toBeNull();
  });
});

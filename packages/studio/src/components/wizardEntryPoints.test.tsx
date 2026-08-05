// wizardEntryPoints.test — spec 057 US1 (T028), FR-005 / FR-008 / SC-004.
//
// Four shipped affordances route into the wizard. Three of them were
// structurally broken by defect D-1: each set a target step and then
// navigated, and `SurveyView`'s mount-time traversal reset discarded the
// target on arrival. The fourth — "Resume" from the My-keyboards list — was
// the exception that proved the rule: it worked only because it happened to
// trip the boot flag D-1's guard read.
//
// THIS FILE IS THE REGRESSION NET FR-008 ASKS FOR. Every test below asserts
// the traversal state a navigation leaves behind and then proves it SURVIVES
// the remount the hash change causes. Reinstating any mount-time reset in
// `SurveyView` fails all four.
//
// Deliberately at the store/primitive level rather than through the full
// screens: what each entry point promises is "the wizard is at X when you
// arrive", and X is the traversal store. Rendering OutputScreen or
// ProfileScreen to click their buttons would test their layout, not their
// promise — the end-to-end version of that is `e2e/tab-roundtrip.spec.ts`.

import { describe, it, expect, beforeEach, vi } from "vitest";
import { act, cleanup } from "@testing-library/react";
import { render } from "../test/renderWithI18n.tsx";
import { createVirtualFS } from "@keyboard-studio/contracts";
import { basicKbdus, makeTestIR } from "@keyboard-studio/contracts/fixtures";
import { useSurveySessionStore } from "../stores/surveySessionStore.ts";
import { useWorkingCopyStore } from "../stores/workingCopyStore.ts";

// SurveyView pulls the whole authoring stack; the entry points are about
// traversal, so the heavy children are stubbed to nothing renderable and the
// assertions read the store.
vi.mock("./StepHost.tsx", () => ({
  StepHost: () => <div data-testid="step-host" />,
}));
vi.mock("../survey/CharacterMapPane.tsx", () => ({
  CharacterMapPane: () => <div />,
}));
vi.mock("./OSKFrame.tsx", () => ({ OSKFrame: () => <div /> }));
vi.mock("../hooks/useKeyboardArtifact.ts", () => ({
  useKeyboardArtifact: () => ({ stage: { kind: "idle" }, retry: vi.fn(), recompile: vi.fn() }),
}));
vi.mock("../hooks/useWorkingCopyTransform.ts", () => ({
  useWorkingCopyTransform: () => null,
}));
vi.mock("../hooks/useValidator.ts", () => ({ useValidator: () => ({ findings: [] }) }));

import { SurveyView } from "../StudioShell.tsx";

/**
 * Mount the wizard the way `StudioShell` does, then unmount and mount it
 * again — the remount a hash-route change causes, which is the exact moment
 * D-1 used to discard the author's position.
 */
async function arriveInTheWizard(): Promise<void> {
  const base =
    useWorkingCopyStore.getState().baseKeyboard ?? useSurveySessionStore.getState().localBase;
  await act(async () => {
    render(<SurveyView baseKeyboard={base} />);
  });
}

async function leaveAndReturn(): Promise<void> {
  await arriveInTheWizard();
  cleanup();
  await arriveInTheWizard();
}

/** A walked session sitting on Phase F, with a real working copy. */
function seedWalkedSession(): void {
  useWorkingCopyStore.getState().instantiateFromBase(basicKbdus, {
    vfs: createVirtualFS([{ path: "source/basic_kbdus.kmn", content: "c\n", isBinary: false }]),
    ir: makeTestIR([]),
  });
  const s = useSurveySessionStore.getState();
  s.advance("choose_base");
  useSurveySessionStore.getState().advance("track");
  useSurveySessionStore.getState().advance("characters");
  useSurveySessionStore.getState().advance("carve");
  useSurveySessionStore.getState().advance("mechanisms");
  useSurveySessionStore.getState().advance("touch");
  useSurveySessionStore.getState().advance("help");
}

beforeEach(() => {
  cleanup();
  useSurveySessionStore.getState().reset();
  useWorkingCopyStore.getState().reset();
  localStorage.clear();
});

describe("entry point 1 — the coverage-blocked banner's 'go finish them now'", () => {
  it("lands on the gallery it names, not on the identity question", async () => {
    seedWalkedSession();

    // What OutputScreen.handleGoToGallery does, in order: set the target step,
    // then navigate. The navigate is what remounts the wizard.
    useSurveySessionStore.getState().backToUnfinishedGallery("mechanisms");
    await leaveAndReturn();

    expect(useSurveySessionStore.getState().activeStepId).toBe("mechanisms");
  });

  it("routes to the touch gallery when that is the blocked one", async () => {
    seedWalkedSession();

    useSurveySessionStore.getState().backToUnfinishedGallery("touch");
    await leaveAndReturn();

    expect(useSurveySessionStore.getState().activeStepId).toBe("touch");
  });
});

describe("entry point 2 — Profile's '← Back to studio'", () => {
  it("returns to the step the author left", async () => {
    seedWalkedSession();
    const left = useSurveySessionStore.getState().activeStepId;
    expect(left).toBe("help");

    // The button is a bare `navigateTo("survey")` — it sets no target, because
    // the position is already in the store. All that has to survive is the
    // remount.
    await leaveAndReturn();

    expect(useSurveySessionStore.getState().activeStepId).toBe("help");
  });

  it("keeps the walked history, so in-app Back still works after returning", async () => {
    seedWalkedSession();
    const historyBefore = [...useSurveySessionStore.getState().history];

    await leaveAndReturn();

    expect([...useSurveySessionStore.getState().history]).toEqual(historyBefore);
  });
});

describe("entry point 3 — the Phase F hop to #output and back", () => {
  it("leaves a way back into the walk that preserves position", async () => {
    seedWalkedSession();

    // StepHost navigates to #output when help completes; the author's return
    // is an ordinary Studio-tab click, i.e. the same remount.
    await leaveAndReturn();

    expect(useSurveySessionStore.getState().activeStepId).toBe("help");
  });
});

describe("entry point 4 — Resume from the My-keyboards list", () => {
  it("resumes at the restored step without depending on a boot-flag read", async () => {
    // `resumeProject` hydrates the stores and then navigates. Previously this
    // only survived arrival because `loadDraft` set the flag D-1's guard read;
    // with no reset, an ordinary hydrate is enough.
    seedWalkedSession();
    const snapshot = {
      ...useSurveySessionStore.getState(),
      activeStepId: "carve" as const,
      history: ["identity", "choose_base", "track", "characters"] as const,
    };
    useSurveySessionStore.getState().hydrate(snapshot as never);

    await leaveAndReturn();

    expect(useSurveySessionStore.getState().activeStepId).toBe("carve");
    expect([...useSurveySessionStore.getState().history]).toEqual([
      "identity",
      "choose_base",
      "track",
      "characters",
    ]);
  });
});

describe("the regression net itself", () => {
  it("a mount-time reset would break every entry point above", async () => {
    // Stated as its own test so the net's PURPOSE is not just a comment: this
    // asserts the precondition all four rely on — that mounting the wizard
    // does not touch traversal. If a future change reinstates a reset, this
    // fails first and names the reason.
    seedWalkedSession();
    const before = {
      activeStepId: useSurveySessionStore.getState().activeStepId,
      history: [...useSurveySessionStore.getState().history],
      identityResult: useSurveySessionStore.getState().identityResult,
      selectedTrack: useSurveySessionStore.getState().selectedTrack,
      charactersSubStage: useSurveySessionStore.getState().charactersSubStage,
    };

    await leaveAndReturn();

    expect({
      activeStepId: useSurveySessionStore.getState().activeStepId,
      history: [...useSurveySessionStore.getState().history],
      identityResult: useSurveySessionStore.getState().identityResult,
      selectedTrack: useSurveySessionStore.getState().selectedTrack,
      charactersSubStage: useSurveySessionStore.getState().charactersSubStage,
    }).toEqual(before);
  });
});

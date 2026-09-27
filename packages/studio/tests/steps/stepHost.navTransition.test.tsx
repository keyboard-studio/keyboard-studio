// Nav transition test — spec 081 US3 (SC-005).
//
// Walks the copy track through StepHost with the real StudioFooter beside it,
// forward, then back, then by a footer dot jump. After every hop:
//   - the nav store holds an entry for the active step only, so no button of
//     the step just left can render (a stale entry is the defect US3 names);
//   - there is at most one Back button in the whole document;
//   - every nav handle on screen is inside the footer's nav group, never in a
//     step body.
// The final hop, leaving the survey for the output route, leaves no cluster.
//
// Same shallow mock harness as stepHost.goldenWalk.test.tsx (the shared
// studioShellMocks), so the steps publish their nav exactly as the real ones do.

import { describe, it, expect, vi } from "vitest";
import { screen, fireEvent, act, within } from "@testing-library/react";
import { render } from "../../src/test/renderWithI18n.tsx";
import { useSurveySessionStore } from "../../src/stores/surveySessionStore.ts";
import { useStepNavStore } from "../../src/stores/stepNavStore.ts";

vi.mock("../../src/survey/FlowStepHost.tsx", () => import("../../src/test/studioShellMocks/FlowStepHost.tsx"));
vi.mock("../../src/survey/index.ts", () => import("../../src/test/studioShellMocks/surveyIndex.tsx"));
vi.mock("../../src/editors/panels/BaseResolution.tsx", () =>
  import("../../src/test/studioShellMocks/BaseResolution.tsx"),
);
vi.mock("../../src/editors/carve/CarveGalleryV2.tsx", () =>
  import("../../src/test/studioShellMocks/CarveGalleryV2.tsx"),
);
vi.mock("../../src/editors/assignLoop/MechanismGallery.tsx", () =>
  import("../../src/test/studioShellMocks/MechanismGallery.tsx"),
);
vi.mock("../../src/editors/assignLoop/TouchGallery.tsx", () =>
  import("../../src/test/studioShellMocks/TouchGallery.tsx"),
);
vi.mock("../../src/components/UnsupportedScriptStub.tsx", () =>
  import("../../src/test/studioShellMocks/UnsupportedScriptStub.tsx"),
);
vi.mock("../../src/components/OSKFrame.tsx", () => import("../../src/test/studioShellMocks/OSKFrame.tsx"));
vi.mock("../../src/components/OskModeToggle.tsx", () => import("../../src/test/studioShellMocks/OskModeToggle.tsx"));
vi.mock("../../src/components/OutputScreen.tsx", () => import("../../src/test/studioShellMocks/OutputScreen.tsx"));
vi.mock("../../src/dashboard/DashboardView.tsx", () => import("../../src/test/studioShellMocks/DashboardView.tsx"));
vi.mock("../../src/hooks/useKeyboardArtifact.ts", () =>
  import("../../src/test/studioShellMocks/idleKeyboardArtifact.ts"),
);
vi.mock("../../src/hooks/useWorkingCopyTransform.ts", () =>
  import("../../src/test/studioShellMocks/useWorkingCopyTransform.ts"),
);
vi.mock("../../src/lib/confirmRebase.ts", () => import("../../src/test/studioShellMocks/confirmRebase.ts"));
vi.mock("../../src/lib/buildTouchLayoutJson.ts", () =>
  import("../../src/test/studioShellMocks/buildTouchLayoutJson.ts"),
);
vi.mock("../../src/lib/navigate.ts", () => import("../../src/test/studioShellMocks/navigate.ts"));

// Mock the touch_seed_source chooser (spec 035 T014) — registerEditorSteps.ts
// now renders TouchSeedSourcePanel for this step (the "touch" step keeps the
// TouchGallery mock above). A single confirm button is all the golden-walk
// oracle needs: the panel's onComplete carries no SurveyPhaseResult shape and
// the step is not in STEPS_WITH_APPLY_COMPLETION, so the only recorded effect
// is the "advance" session mutation (matches __fixtures__/goldenWalk/*.json).
vi.mock("../../src/editors/touchSeedSource/TouchSeedSourcePanel.tsx", async () => {
  // Publishes to the footer, as the real panel does (spec 081).
  const { usePublishStepNav } = await import("../../src/hooks/usePublishStepNav.ts");
  return {
    TouchSeedSourcePanel: ({
      onComplete,
      onBack,
    }: {
      onComplete: (result: unknown) => void;
      onBack?: () => void;
    }) => {
      usePublishStepNav({
        ...(onBack !== undefined
          ? { back: { label: "seed-source-back", onClick: onBack, testId: "seed-source-back" } }
          : {}),
        forward: {
          label: "seed-source-confirm",
          onClick: () => onComplete(undefined),
          testId: "seed-source-confirm",
        },
      });
      return <div data-testid="stage-seed-source" />;
    },
  };
});

// The punctuation step (spec 075) seeds the resolved locale's CLDR punctuation
// tier into the confirmed inventory on arrival. Track 1 carries a real BCP47
// tag, so on a warm exemplar index that seed lands before the walk clicks
// Done — and every typographic mark the (uninstantiated) base cannot type then
// sits on the Phase F coverage gate, whose blocking <dialog> jsdom cannot
// showModal(). That is the product working as specified (FR-011: unplaced
// punctuation is owed to the mechanism gallery), not a traversal fact this
// oracle records. Resolve no exemplars here so the walk stays a spine
// traversal; PunctuationStep.test.tsx owns the seeding behaviour.
vi.mock("../../src/lib/services.ts", async (importOriginal) => ({
  ...(await importOriginal<typeof import("../../src/lib/services.ts")>()),
  sourcedExemplars: async () => null,
}));

import { SurveyView } from "../../src/StudioShell.tsx";
import { StudioFooter } from "../../src/components/StudioFooter.tsx";

const BACK_NAME = /^(← )?Back$|-back$/;

function navGroup(): HTMLElement | null {
  return screen.queryByTestId("step-nav");
}

function navButtons(): HTMLButtonElement[] {
  const group = navGroup();
  return group === null ? [] : Array.from(group.querySelectorAll("button"));
}

/** The invariants that must hold after every hop. */
function expectCleanNav(context: string): void {
  const active = useSurveySessionStore.getState().activeStepId;
  const entryIds = Object.keys(useStepNavStore.getState().entries);
  expect(entryIds.filter((id) => id !== active), `${context}: stale entries`).toEqual([]);

  const backs = screen
    .queryAllByRole("button")
    .filter((b) => BACK_NAME.test(b.textContent ?? "") || BACK_NAME.test(b.getAttribute("data-testid") ?? ""));
  expect(backs.length, `${context}: Back buttons`).toBeLessThanOrEqual(1);

  const group = navGroup();
  for (const button of navButtons()) {
    const testId = button.getAttribute("data-testid")!;
    const all = document.querySelectorAll(`[data-testid="${testId}"]`);
    expect(all.length, `${context}: ${testId} rendered more than once`).toBe(1);
    expect(group!.contains(all[0]!)).toBe(true);
  }
}

async function click(testId: string): Promise<void> {
  await act(async () => {
    fireEvent.click(screen.getByTestId(testId));
  });
}

/** The copy-track walk from stepHost.goldenWalk.test.tsx, with the settle points it needs. */
const COPY_WALK: Array<{ testIds: string[]; settleFor?: string }> = [
  { testIds: ["survey-advance"] },
  { testIds: ["base-preview", "base-confirm"] },
  { testIds: ["track-copy"] },
  { testIds: ["survey-advance"] },
  { testIds: ["prefill-confirm"] },
  { testIds: ["phase-b-done"], settleFor: "punctuation-done" },
  { testIds: ["punctuation-done"], settleFor: "invisibles-continue" },
  { testIds: ["invisibles-continue"], settleFor: "carve-continue" },
  { testIds: ["carve-continue"] },
  { testIds: ["mechanisms-continue"] },
  { testIds: ["seed-source-confirm"] },
];

function Harness({ onSurvey }: { onSurvey: boolean }) {
  return (
    <>
      {onSurvey && <SurveyView baseKeyboard={null} />}
      <StudioFooter />
    </>
  );
}

describe("footer nav across step transitions (spec 081 US3)", () => {
  it("never shows a previous step's buttons or a second Back — forward, back, and by dot jump", async () => {
    let view!: ReturnType<typeof render>;
    await act(async () => {
      view = render(<Harness onSurvey />);
    });
    expectCleanNav("initial");

    // Forward, one hop at a time.
    const visited: string[] = [useSurveySessionStore.getState().activeStepId];
    for (const hop of COPY_WALK) {
      for (const testId of hop.testIds) await click(testId);
      if (hop.settleFor !== undefined) await screen.findByTestId(hop.settleFor);
      visited.push(useSurveySessionStore.getState().activeStepId);
      expectCleanNav(`forward to ${visited.at(-1)}`);
    }
    expect(visited.at(-1)).toBe("touch");

    // Back, through the footer's own Back, until a step offers none.
    for (let i = 0; i < 20; i++) {
      const back = navButtons().find((b) => BACK_NAME.test(b.getAttribute("data-testid") ?? ""));
      if (back === undefined) break;
      const before = useSurveySessionStore.getState().activeStepId;
      await act(async () => {
        fireEvent.click(back);
      });
      expectCleanNav(`back from ${before}`);
    }

    // By dot jump: any reached dot in the footer's row.
    const row = screen.getByTestId("progress-dot-row");
    const reached = within(row)
      .queryAllByRole("button")
      .filter((b) => b.getAttribute("data-progress-dot-kind") === "completed");
    if (reached.length > 0) {
      await act(async () => {
        fireEvent.click(reached.at(-1)!);
      });
      expectCleanNav("dot jump");
    }

    // Leaving the survey (the output route unmounts the step) leaves no cluster.
    await act(async () => {
      view.rerender(<Harness onSurvey={false} />);
    });
    expect(navGroup()).toBeNull();
    expect(useStepNavStore.getState().entries).toEqual({});
  });
});

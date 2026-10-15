// StudioShell — issue #2145 (adopted warnings-placement model): NO finding
// renders at the top of the survey pane. A warning lives only where it can
// be acted on — mapped findings chip at their owning question, doc and
// other unmapped findings accumulate to the Output screen. These wiring
// tests pin the ABSENCE here; the owner surfaces have their own tests
// (DocumentationFindingsSummary.test.tsx, OutputScreen tests).
//
// Regression these pin:
//   - re-adding a pane-top render for any finding class (full blocks, the
//     doc-notes summary, or a LintSummary) makes a message appear here
//     and fails these tests;
//   - the role="status" live region itself must stay mounted (transient
//     announcements still need it), it just carries no persistent findings.
//
// The findings pipeline is fed through the two real hook boundaries:
// `./hooks/useValidator.ts` (the single findings source) and
// `./hooks/useDocumentationFindings.ts` (the Layer C subset).

import { describe, it, expect, afterEach, beforeEach, vi } from "vitest";
import { screen, cleanup, act } from "@testing-library/react";
import { render } from "./test/renderWithI18n.tsx";
import { ActiveStepNav } from "./test/ActiveStepNav.tsx";
import type { LintFinding } from "@keyboard-studio/contracts";
import { resetInventoryDecisions } from "./survey/useInventoryDraft.ts";

// ---------------------------------------------------------------------------
// Shallow stubs for every child component plus the heavy hooks (shared
// harness: test/studioShellMocks/, one module per mocked child), copied from
// StudioShell.test.tsx so this file mounts the same way.
// ---------------------------------------------------------------------------

vi.mock("./survey/FlowStepHost.tsx", () => import("./test/studioShellMocks/FlowStepHost.tsx"));
vi.mock("./survey/index.ts", () => import("./test/studioShellMocks/surveyIndex.tsx"));
// CharactersStep imports Prefill/PhaseB by file since spec 090 T021 (not via
// the barrel), so the shallow stubs must be registered for the files too.
vi.mock("./survey/Prefill.tsx", () => import("./test/studioShellMocks/surveyIndex.tsx"));
vi.mock("./survey/PhaseB.tsx", () => import("./test/studioShellMocks/surveyIndex.tsx"));
vi.mock("./editors/panels/StartResolution.tsx", () => import("./test/studioShellMocks/StartResolution.tsx"));
vi.mock("./editors/carve/CarveGalleryV2.tsx", () => import("./test/studioShellMocks/CarveGalleryV2.tsx"));
vi.mock("./editors/adapters/deadkeyAdapter.tsx", () => import("./test/studioShellMocks/deadkeyAdapter.tsx"));
vi.mock("./editors/assignLoop/MechanismGallery.tsx", () => import("./test/studioShellMocks/MechanismGallery.tsx"));
vi.mock("./editors/assignLoop/TouchGallery.tsx", () => import("./test/studioShellMocks/TouchGallery.tsx"));
vi.mock("./survey/touchSeedSource/TouchSeedSourceHost.tsx", () =>
  import("./test/studioShellMocks/TouchSeedSourceHost.tsx"),
);
vi.mock("./components/UnsupportedScriptStub.tsx", () => import("./test/studioShellMocks/UnsupportedScriptStub.tsx"));
vi.mock("./components/OSKFrame.tsx", () => import("./test/studioShellMocks/OSKFrame.tsx"));
vi.mock("./components/OskModeToggle.tsx", () => import("./test/studioShellMocks/OskModeToggle.tsx"));
vi.mock("./components/CompareScreen.tsx", () => import("./test/studioShellMocks/CompareScreen.tsx"));
vi.mock("./components/OutputScreen.tsx", () => import("./test/studioShellMocks/OutputScreen.tsx"));
vi.mock("./components/WelcomeScreen.tsx", () => import("./test/studioShellMocks/WelcomeScreen.tsx"));
vi.mock("./dashboard/DashboardView.tsx", () => import("./test/studioShellMocks/DashboardView.tsx"));
vi.mock("./hooks/useKeyboardArtifact.ts", () => import("./test/studioShellMocks/useKeyboardArtifact.ts"));
vi.mock("./hooks/useWorkingCopyTransform.ts", () => import("./test/studioShellMocks/useWorkingCopyTransform.ts"));
vi.mock("./lib/confirmRebase.ts", () => import("./test/studioShellMocks/confirmRebase.ts"));
vi.mock("./lib/buildTouchLayoutJson.ts", () => import("./test/studioShellMocks/buildTouchLayoutJson.ts"));
vi.mock("./lib/navigate.ts", () => import("./test/studioShellMocks/navigate.ts"));

// ---------------------------------------------------------------------------
// Controllable findings pipeline: the doc fixture must be the same reference
// in both hooks (identity match), so it lives in a hoisted holder.
// ---------------------------------------------------------------------------

const findingsHoisted = vi.hoisted(() => ({
  validatorFindings: [] as LintFinding[],
  documentationFindings: [] as LintFinding[],
}));

vi.mock("./hooks/useValidator.ts", () => ({
  useValidator: () => ({ findings: findingsHoisted.validatorFindings }),
}));

vi.mock("./hooks/useDocumentationFindings.ts", () => ({
  useDocumentationFindings: () => findingsHoisted.documentationFindings,
}));

// ---------------------------------------------------------------------------
// Import the component under test — AFTER all vi.mock() declarations.
// ---------------------------------------------------------------------------

import { SurveyView } from "./StudioShell.tsx";

function lintFinding(overrides: Partial<LintFinding> = {}): LintFinding {
  return {
    code: "KM_LINT_README_MISSING",
    severity: "warning",
    layer: "C",
    message: "README is missing a version line",
    ...overrides,
  };
}

const DOC_MESSAGE = "doc advisory message (collapsed)";
const NON_DOC_MESSAGE = "non-doc advisory message (full block)";

async function mountShell(): Promise<void> {
  await act(async () => {
    render(
      <>
        <SurveyView startKeyboard={null} />
        <ActiveStepNav />
      </>,
    );
  });
}

function seedFindings(doc: LintFinding | null): void {
  const nonDoc = lintFinding({
    code: "KM_LINT_WELCOME_STALE",
    layer: "A",
    message: NON_DOC_MESSAGE,
  });
  // The doc finding rides ONLY the documentation hook's array (as in
  // production); the identity Set matches it after concatenation.
  findingsHoisted.validatorFindings = [nonDoc];
  findingsHoisted.documentationFindings = doc === null ? [] : [doc];
}

beforeEach(() => {
  findingsHoisted.validatorFindings = [];
  findingsHoisted.documentationFindings = [];
});

afterEach(() => {
  cleanup();
  // Spec 079 R-07: alphabetEvidenceKey / sticky decisions survive store.reset();
  // global test-setup only calls reset(), so clear them here.
  resetInventoryDecisions();
  vi.clearAllMocks();
  localStorage.clear();
});

describe("StudioShell — warnings placement (#2145): nothing at the pane top", () => {
  it("renders no doc-notes summary and no doc message, even with a doc finding", async () => {
    seedFindings(lintFinding({ message: DOC_MESSAGE }));
    await mountShell();

    expect(screen.queryByTestId("doc-findings-summary-toggle")).toBeNull();
    expect(screen.queryByText(DOC_MESSAGE, { exact: false })).toBeNull();
  });

  it("renders no authored warning block at the pane top", async () => {
    seedFindings(null);
    await mountShell();

    expect(screen.queryByText(NON_DOC_MESSAGE, { exact: false })).toBeNull();
    expect(screen.queryByText("Warning:", { exact: false })).toBeNull();
  });

  it("renders no LintSummary for a non-warning finding at the pane top", async () => {
    findingsHoisted.validatorFindings = [
      lintFinding({ code: "KM_LINT_BROKEN", severity: "error", layer: "A", message: "pane-top error text" }),
    ];
    findingsHoisted.documentationFindings = [];
    await mountShell();

    expect(screen.queryByText("pane-top error text", { exact: false })).toBeNull();
  });

  it("keeps the role=status live region mounted for transient announcements", async () => {
    seedFindings(lintFinding({ message: DOC_MESSAGE }));
    await mountShell();

    const liveRegion = document.querySelector('[role="status"]');
    expect(liveRegion).not.toBeNull();
    expect(liveRegion!.getAttribute("aria-live")).toBe("polite");
    // ... and it carries no persistent finding content.
    expect(liveRegion!.textContent ?? "").not.toContain(DOC_MESSAGE);
    expect(liveRegion!.textContent ?? "").not.toContain(NON_DOC_MESSAGE);
  });
});

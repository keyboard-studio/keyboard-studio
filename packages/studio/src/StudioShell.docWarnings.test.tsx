// StudioShell — Layer C documentation findings are collapsed into ONE summary
// row inside the existing live region; non-doc warnings keep their full-block
// render. Wiring tests only: the component's own toggle/group/aria behavior
// lives in DocumentationFindingsSummary.test.tsx.
//
// Regression these pin:
//   - a revert to rendering `globalWarnings` as full blocks would make the
//     doc message visible without expanding the summary (test 1 fails);
//   - rendering the summary outside the status live region would break the
//     count announcement (test 2 fails);
//   - doc findings leaking into the authored list (or vice versa) breaks the
//     full-block / summary split (tests 1 and 3 fail).
//
// The findings pipeline is fed through the two real hook boundaries:
// `./hooks/useValidator.ts` (the single findings source) and
// `./hooks/useDocumentationFindings.ts` (the Layer C subset). The doc fixture
// is the SAME object reference in both mocks — the production wiring matches
// by identity (`new Set(documentationFindings)`), so the test must too.

import { describe, it, expect, afterEach, beforeEach, vi } from "vitest";
import { screen, fireEvent, cleanup, act } from "@testing-library/react";
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
vi.mock("./editors/panels/BaseResolution.tsx", () => import("./test/studioShellMocks/BaseResolution.tsx"));
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
        <SurveyView baseKeyboard={null} />
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

describe("StudioShell — documentation findings summary wiring", () => {
  it("collapses the doc finding into one summary row; the non-doc warning keeps its full block", async () => {
    const doc = lintFinding({ message: DOC_MESSAGE });
    seedFindings(doc);
    await mountShell();

    // The collapsed summary row carries the count; the doc message itself
    // stays hidden until the author expands it.
    const toggle = screen.getByTestId("doc-findings-summary-toggle");
    expect(toggle.textContent).toContain("1 documentation note");
    const statusText = () =>
      toggle.closest('[role="status"]')?.textContent ?? "";
    // A pre-fix regression (doc findings rendered as full blocks) would put
    // the doc message in the live region while still collapsed.
    expect(statusText()).not.toContain(DOC_MESSAGE);

    // The non-doc warning still renders as a full advisory block.
    expect(statusText()).toContain(NON_DOC_MESSAGE);

    // Expanding reveals the doc message inside the summary.
    fireEvent.click(toggle);
    expect(statusText()).toContain(DOC_MESSAGE);
  });

  it("renders the summary inside the SAME role=status live region (no second announcer)", async () => {
    seedFindings(lintFinding({ message: DOC_MESSAGE }));
    await mountShell();

    const toggle = screen.getByTestId("doc-findings-summary-toggle");
    const liveRegion = toggle.closest('[role="status"]');
    expect(liveRegion).not.toBeNull();
    expect(liveRegion!.getAttribute("aria-live")).toBe("polite");

    // The summary must not sit in a nested live region of its own.
    expect(toggle.closest('[role="status"] [role="status"]')).toBeNull();

    // The non-doc full block lives in that same live region too.
    const nonDocBlock = screen.getByText(NON_DOC_MESSAGE, { exact: false });
    expect(nonDocBlock.closest('[role="status"]')).toBe(liveRegion);
  });

  it("shows no summary row when there are no doc findings", async () => {
    seedFindings(null);
    await mountShell();

    expect(screen.queryByTestId("doc-findings-summary-toggle")).toBeNull();
    // Non-doc warnings are unaffected.
    expect(screen.getByText(NON_DOC_MESSAGE, { exact: false })).toBeTruthy();
  });

  it("counts an upstream-origin doc finding in the summary", async () => {
    seedFindings(
      lintFinding({
        message: "inherited doc advisory",
        origin: "upstream",
      }),
    );
    await mountShell();

    const toggle = screen.getByTestId("doc-findings-summary-toggle");
    expect(toggle.textContent).toContain("1 documentation note");
    // The identity match must pick the finding up even with origin set —
    // it never appears as a full block.
    expect(
      (toggle.closest('[role="status"]')?.textContent ?? "").includes(
        "inherited doc advisory",
      ),
    ).toBe(false);
  });
});

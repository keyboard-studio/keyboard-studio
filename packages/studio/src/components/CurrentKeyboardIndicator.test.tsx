// Tests for CurrentKeyboardIndicator — the NavBar top-bar control that names
// the current keyboard and drops down to switch between the author's
// keyboards.
//
// Mocking idiom: mock `../lib/navigate.ts` (same as MyKeyboardsList.test.tsx)
// so navigation is observable rather than actually flipping
// `window.location.hash`. `resumeProject` from `../lib/draftPersistence.ts`
// is wrapped with `vi.fn(actual.resumeProject)` (same idiom) so we can assert
// the call AND let the real apply happen — `listDrafts`,
// `deriveProjectKeyFromWorkingCopy`, and `saveDraft` are exercised for real
// against real localStorage.

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { act, cleanup, fireEvent, screen } from "@testing-library/react";
import { render } from "../test/renderWithI18n.tsx";
import { createVirtualFS, makeBaseKeyboard } from "@keyboard-studio/contracts";
import type { KeyboardIR } from "@keyboard-studio/contracts";
import { CurrentKeyboardIndicator } from "./CurrentKeyboardIndicator.tsx";
import { navigateTo } from "../lib/navigate.ts";
import {
  DRAFT_INDEX_KEY,
  saveDraft,
  resumeProject,
  type ProjectIndexEntry,
} from "../lib/draftPersistence.ts";
import { useWorkingCopyStore } from "../stores/workingCopyStore.ts";
import { useSurveySessionStore } from "../stores/surveySessionStore.ts";
import { usePhaseBDraftStore } from "../stores/phaseBDraftStore.ts";

vi.mock("../lib/navigate.ts", () => ({ navigateTo: vi.fn() }));

vi.mock("../lib/draftPersistence.ts", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../lib/draftPersistence.ts")>();
  return {
    ...actual,
    resumeProject: vi.fn(actual.resumeProject),
  };
});

const mockedNavigateTo = vi.mocked(navigateTo);
const mockedResumeProject = vi.mocked(resumeProject);

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------

function makeMinimalIr(): KeyboardIR {
  return {
    origin: "scaffolded" as const,
    header: {
      keyboardId: "test",
      name: "test",
      bcp47: [],
      copyright: "",
      version: "10.0",
      targets: [],
      storeDirectives: [],
    },
    stores: [],
    groups: [],
    comments: [],
    raw: [],
    recognizedPatterns: [],
  } as unknown as KeyboardIR;
}

/** Instantiates a real working copy as `projectKey`, so it becomes "the
 * current keyboard" until the next `instantiateFromBase` call. */
function instantiateAsCurrent(projectKey: string, displayName: string): void {
  const base = makeBaseKeyboard({
    id: projectKey,
    path: `release/${projectKey}`,
    script: "Latn",
    targets: ["windows"],
    displayName,
    version: "1.0",
  });
  useWorkingCopyStore
    .getState()
    .instantiateFromBase(base, { vfs: createVirtualFS([]), ir: makeMinimalIr() });
}

/**
 * Seeds a REAL, `resumeProject()`-loadable per-project record for
 * `projectKey`: instantiates a working copy AS that project and calls the
 * real `saveDraft(projectKey)` — same idiom as
 * MyKeyboardsList.test.tsx's `seedRealDraft`. The caller is responsible for
 * re-instantiating the ACTUAL current project afterward.
 */
function seedRealResumableDraft(projectKey: string, displayName: string): void {
  instantiateAsCurrent(projectKey, displayName);
  saveDraft(projectKey);
}

/** Seeds an index-only row (no per-project record) — sufficient for the
 * dropdown-contents tests, which only read `listDrafts()`, never resume this
 * particular row. */
function seedIndexOnly(entries: Array<Partial<ProjectIndexEntry> & { projectKey: string }>): void {
  const rows: ProjectIndexEntry[] = entries.map((e) => ({
    projectKey: e.projectKey,
    savedAt: e.savedAt ?? Date.now(),
    activeStepId: e.activeStepId ?? "carve",
    label: e.label ?? null,
    langTag: e.langTag ?? null,
    status: e.status ?? "draft",
    prUrl: e.prUrl ?? null,
  }));
  localStorage.setItem(DRAFT_INDEX_KEY, JSON.stringify(rows));
}

function resetStores(): void {
  useWorkingCopyStore.getState().reset();
  useSurveySessionStore.getState().reset();
  usePhaseBDraftStore.getState().reset();
}

beforeEach(() => {
  localStorage.clear();
  resetStores();
});

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
  localStorage.clear();
  resetStores();
});

// ---------------------------------------------------------------------------
// Visibility / label
// ---------------------------------------------------------------------------

describe("CurrentKeyboardIndicator — visibility and label", () => {
  it("renders nothing when there is no current keyboard", () => {
    const { container } = render(<CurrentKeyboardIndicator />);
    expect(container.firstChild).toBeNull();
  });

  it("shows the base keyboard's display name when no override exists", () => {
    instantiateAsCurrent("current-kbd", "French");
    render(<CurrentKeyboardIndicator />);
    expect(screen.getByRole("button").textContent).toContain("French");
  });

  it("prefers the project_name scaffoldSpec name over the base keyboard's name (FR-041)", () => {
    instantiateAsCurrent("current-kbd", "French");
    useSurveySessionStore
      .getState()
      .setScaffoldSpec({ keyboardId: "current-kbd", displayName: "Bambara Latin" });
    render(<CurrentKeyboardIndicator />);
    expect(screen.getByRole("button").textContent).toContain("Bambara Latin");
    expect(screen.getByRole("button").textContent).not.toContain("French");
  });

  it("reflects a live rename immediately, without waiting for a hashchange", () => {
    instantiateAsCurrent("current-kbd", "French");
    render(<CurrentKeyboardIndicator />);
    expect(screen.getByRole("button").textContent).toContain("French");

    act(() => {
      useSurveySessionStore
        .getState()
        .setScaffoldSpec({ keyboardId: "current-kbd", displayName: "Renamed" });
    });

    expect(screen.getByRole("button").textContent).toContain("Renamed");
    expect(screen.getByRole("button").textContent).not.toContain("French");
  });
});

// ---------------------------------------------------------------------------
// Dropdown contents
// ---------------------------------------------------------------------------

describe("CurrentKeyboardIndicator — dropdown contents", () => {
  it("lists the current keyboard, other resumable drafts, and a manage-all row", () => {
    seedIndexOnly([{ projectKey: "other-kbd", label: "Other keyboard", status: "draft" }]);
    instantiateAsCurrent("current-kbd", "Current keyboard");

    render(<CurrentKeyboardIndicator />);
    fireEvent.click(screen.getByRole("button"));

    expect(screen.getByRole("option", { name: "Current keyboard" })).toBeTruthy();
    expect(screen.getByRole("option", { name: "Other keyboard" })).toBeTruthy();
    expect(screen.getByRole("option", { name: "Manage all keyboards…" })).toBeTruthy();
  });

  it("excludes submitted projects — they have no resume path", () => {
    seedIndexOnly([
      { projectKey: "other-kbd", label: "Other keyboard", status: "draft" },
      { projectKey: "old-kbd", label: "Old submitted keyboard", status: "submitted" },
    ]);
    instantiateAsCurrent("current-kbd", "Current keyboard");

    render(<CurrentKeyboardIndicator />);
    fireEvent.click(screen.getByRole("button"));

    expect(screen.queryByRole("option", { name: "Old submitted keyboard" })).toBeNull();
  });

  it("falls back to 'Untitled keyboard' for a null label", () => {
    seedIndexOnly([{ projectKey: "other-kbd", label: null, status: "draft" }]);
    instantiateAsCurrent("current-kbd", "Current keyboard");

    render(<CurrentKeyboardIndicator />);
    fireEvent.click(screen.getByRole("button"));

    expect(screen.getByRole("option", { name: "Untitled keyboard" })).toBeTruthy();
  });

  it("picks up a newly-saved draft after a hashchange (staleness refresh)", () => {
    instantiateAsCurrent("current-kbd", "Current keyboard");
    render(<CurrentKeyboardIndicator />);

    fireEvent.click(screen.getByRole("button"));
    expect(screen.queryByRole("option", { name: "Late-arriving keyboard" })).toBeNull();
    // Close it back up before mutating the list, matching how an author would
    // actually leave the menu closed while away on another tab.
    fireEvent.click(screen.getByRole("button"));

    seedIndexOnly([{ projectKey: "late-kbd", label: "Late-arriving keyboard", status: "draft" }]);
    fireEvent(window, new Event("hashchange"));

    fireEvent.click(screen.getByRole("button"));
    expect(screen.getByRole("option", { name: "Late-arriving keyboard" })).toBeTruthy();
  });
});

// ---------------------------------------------------------------------------
// Switching
// ---------------------------------------------------------------------------

describe("CurrentKeyboardIndicator — switching keyboards", () => {
  it("resumes another project and navigates to the survey on selection", () => {
    seedRealResumableDraft("other-kbd", "Other keyboard");
    instantiateAsCurrent("current-kbd", "Current keyboard");

    render(<CurrentKeyboardIndicator />);
    fireEvent.click(screen.getByRole("button"));
    fireEvent.click(screen.getByRole("option", { name: "Other keyboard" }));

    expect(mockedResumeProject).toHaveBeenCalledWith("other-kbd");
    expect(mockedNavigateTo).toHaveBeenCalledWith("survey");
    // The real apply happened — the working copy is now the OTHER project.
    expect(useWorkingCopyStore.getState().baseKeyboard?.id).toBe("other-kbd");
  });

  it("selecting the already-current keyboard is a no-op", () => {
    instantiateAsCurrent("current-kbd", "Current keyboard");

    render(<CurrentKeyboardIndicator />);
    fireEvent.click(screen.getByRole("button"));
    fireEvent.click(screen.getByRole("option", { name: "Current keyboard" }));

    expect(mockedResumeProject).not.toHaveBeenCalled();
    expect(mockedNavigateTo).not.toHaveBeenCalled();
  });

  it("navigates to #profile via 'Manage all keyboards…' without resuming anything", () => {
    instantiateAsCurrent("current-kbd", "Current keyboard");

    render(<CurrentKeyboardIndicator />);
    fireEvent.click(screen.getByRole("button"));
    fireEvent.click(screen.getByRole("option", { name: "Manage all keyboards…" }));

    expect(mockedResumeProject).not.toHaveBeenCalled();
    expect(mockedNavigateTo).toHaveBeenCalledWith("profile");
  });

  it("leaves the wizard untouched when resumeProject fails to apply", () => {
    // A row with no matching per-project record — resumeProject's loadDraft
    // fails and returns false; there is nothing valid to switch into.
    seedIndexOnly([{ projectKey: "broken-kbd", label: "Broken keyboard", status: "draft" }]);
    instantiateAsCurrent("current-kbd", "Current keyboard");

    render(<CurrentKeyboardIndicator />);
    fireEvent.click(screen.getByRole("button"));
    fireEvent.click(screen.getByRole("option", { name: "Broken keyboard" }));

    expect(mockedResumeProject).toHaveBeenCalledWith("broken-kbd");
    expect(mockedNavigateTo).not.toHaveBeenCalled();
    expect(useWorkingCopyStore.getState().baseKeyboard?.id).toBe("current-kbd");
  });

  // The defect this component's SelectMenu commitMode="onExplicitSelect" opt-in
  // fixes: onChange here has a real side effect (resumeProject + navigateTo),
  // so SelectMenu's default selection-follows-focus contract would resume a
  // different project on every single ArrowDown/ArrowUp keypress. These tests
  // lock the fix in at this component's own level (SelectMenu.test.tsx locks
  // the underlying primitive's contract).
  it("arrow-key traversal through several keyboards triggers zero resumeProject/navigateTo calls", () => {
    seedRealResumableDraft("other-kbd-1", "Other keyboard 1");
    seedRealResumableDraft("other-kbd-2", "Other keyboard 2");
    instantiateAsCurrent("current-kbd", "Current keyboard");

    render(<CurrentKeyboardIndicator />);
    const trigger = screen.getByRole("button");
    fireEvent.click(trigger);
    const listbox = screen.getByRole("listbox");

    // Options are: [current, other-kbd-1, other-kbd-2, manage-all] — arrow
    // through every one of them.
    fireEvent.keyDown(listbox, { key: "ArrowDown" });
    fireEvent.keyDown(listbox, { key: "ArrowDown" });
    fireEvent.keyDown(listbox, { key: "ArrowDown" });
    fireEvent.keyDown(listbox, { key: "ArrowUp" });

    expect(mockedResumeProject).not.toHaveBeenCalled();
    expect(mockedNavigateTo).not.toHaveBeenCalled();
    // The working copy never moved off the current project either.
    expect(useWorkingCopyStore.getState().baseKeyboard?.id).toBe("current-kbd");
  });

  it("Enter on a highlighted keyboard triggers exactly one resumeProject and one navigateTo call", () => {
    seedRealResumableDraft("other-kbd", "Other keyboard");
    instantiateAsCurrent("current-kbd", "Current keyboard");

    render(<CurrentKeyboardIndicator />);
    fireEvent.click(screen.getByRole("button"));
    const listbox = screen.getByRole("listbox");

    fireEvent.keyDown(listbox, { key: "ArrowDown" }); // highlight -> "Other keyboard"
    expect(mockedResumeProject).not.toHaveBeenCalled();

    fireEvent.keyDown(listbox, { key: "Enter" });

    expect(mockedResumeProject).toHaveBeenCalledTimes(1);
    expect(mockedResumeProject).toHaveBeenCalledWith("other-kbd");
    expect(mockedNavigateTo).toHaveBeenCalledTimes(1);
    expect(mockedNavigateTo).toHaveBeenCalledWith("survey");
    expect(useWorkingCopyStore.getState().baseKeyboard?.id).toBe("other-kbd");
  });
});

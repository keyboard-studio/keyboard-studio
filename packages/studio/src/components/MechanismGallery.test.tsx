// Unit tests for MechanismGallery component.
// Rendering style follows lint.test.tsx (React Testing Library, jsdom).
// The services module is mocked so the test never touches Vite
// import.meta.glob or the real pattern catalog.

import { describe, it, expect, afterEach, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, act, cleanup } from "@testing-library/react";
import { MechanismGallery } from "./MechanismGallery";
import { useSurveyResultsStore } from "../stores/surveyResultsStore";
import type { PatternLibraryService } from "@keyboard-studio/contracts";
import { basicKbdus } from "@keyboard-studio/contracts/fixtures";
import { latinDeadkeyAcuteSingle } from "@keyboard-studio/contracts/fixtures";
import type { PatternMatch } from "@keyboard-studio/contracts";

// ---------------------------------------------------------------------------
// Mock the services module so we control what filterFor/getById return.
// ---------------------------------------------------------------------------

const mockSvc: PatternLibraryService = {
  listAll: () => Promise.resolve([latinDeadkeyAcuteSingle]),
  getById: (id: string) =>
    Promise.resolve(
      id === latinDeadkeyAcuteSingle.id ? latinDeadkeyAcuteSingle : undefined,
    ),
  filterFor: () => {
    const match: PatternMatch = {
      patternId: latinDeadkeyAcuteSingle.id,
      rank: 1,
      reason: "primary-strategy",
      strategyId: "S-02",
    };
    return Promise.resolve([match]);
  },
};

vi.mock("../lib/services.ts", () => ({
  getPatternLibraryService: () => mockSvc,
  USE_REAL: false,
  LOCAL_PROXY_BASE: "",
}));

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function seedInventory(chars: string[]) {
  useSurveyResultsStore.getState().recordPhase({
    phase: "B",
    answers: [],
    confirmedInventory: chars,
  });
}

afterEach(() => {
  cleanup();
  useSurveyResultsStore.getState().reset();
  vi.clearAllMocks();
});

beforeEach(() => {
  useSurveyResultsStore.getState().reset();
});

// ---------------------------------------------------------------------------
// Empty/no-base state
// ---------------------------------------------------------------------------

describe("MechanismGallery — no base keyboard", () => {
  it("renders the pick-base prompt when selectedBaseKeyboard is null", () => {
    render(<MechanismGallery selectedBaseKeyboard={null} />);
    expect(screen.getByText(/No base keyboard selected/i)).toBeTruthy();
  });

  it("does NOT render the gallery list when selectedBaseKeyboard is null", () => {
    render(<MechanismGallery selectedBaseKeyboard={null} />);
    expect(screen.queryByRole("list")).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// No-inventory state
// ---------------------------------------------------------------------------

describe("MechanismGallery — no inventory", () => {
  it("renders the survey prompt when inventory is empty", () => {
    render(<MechanismGallery selectedBaseKeyboard={basicKbdus} />);
    expect(screen.getByText(/No inventory confirmed yet/i)).toBeTruthy();
  });
});

// ---------------------------------------------------------------------------
// Gallery rendering with inventory + base
// ---------------------------------------------------------------------------

describe("MechanismGallery — with inventory", () => {
  it("renders the pattern card after filterFor resolves", async () => {
    seedInventory(["á", "é"]);
    await act(async () => {
      render(<MechanismGallery selectedBaseKeyboard={basicKbdus} />);
    });
    // Pattern title should appear.
    expect(screen.getByText(latinDeadkeyAcuteSingle.title)).toBeTruthy();
  });

  it("renders the coverage indicator with correct counts", async () => {
    seedInventory(["á", "é"]);
    await act(async () => {
      render(<MechanismGallery selectedBaseKeyboard={basicKbdus} />);
    });
    // CoverageIndicator uses aria-label "Coverage: N of M characters covered"
    const indicator = screen.getByRole("status");
    expect(indicator.getAttribute("aria-label")).toMatch(/Coverage:/);
  });
});

// ---------------------------------------------------------------------------
// Applying a mechanism at keyboard-default scope
// ---------------------------------------------------------------------------

describe("MechanismGallery — apply mechanism at keyboard-default scope", () => {
  it("emits a MechanismAssignment into the store after Apply is clicked", async () => {
    seedInventory(["á"]);
    await act(async () => {
      render(<MechanismGallery selectedBaseKeyboard={basicKbdus} />);
    });

    // Expand the card to reveal the Apply button.
    const configBtn = screen.getByRole("button", { name: /configure/i });
    fireEvent.click(configBtn);

    // Scope is keyboard-default by default; click Apply.
    const applyBtn = screen.getByRole("button", { name: /^Apply$/i });
    fireEvent.click(applyBtn);

    const state = useSurveyResultsStore.getState();
    const physicalAssignments = state.session.assignments.filter(
      (a) => a.modality === "physical",
    );
    expect(physicalAssignments).toHaveLength(1);
    expect(physicalAssignments[0]?.scope).toBe("keyboard-default");
    expect(physicalAssignments[0]?.mechanisms[0]?.patternId).toBe(
      latinDeadkeyAcuteSingle.id,
    );
  });
});

// ---------------------------------------------------------------------------
// Applying a mechanism at individual scope to a selected character
// ---------------------------------------------------------------------------

describe("MechanismGallery — apply at individual scope", () => {
  it("emits an individual-scope assignment for the selected character", async () => {
    seedInventory(["á", "é"]);
    await act(async () => {
      render(<MechanismGallery selectedBaseKeyboard={basicKbdus} />);
    });

    // Expand the card.
    fireEvent.click(screen.getByRole("button", { name: /configure/i }));

    // Switch scope to individual.
    const individualRadio = screen.getByRole("radio", {
      name: /Individual characters/i,
    });
    fireEvent.click(individualRadio);

    // Select only 'á' (first char button).
    const charBtn = screen.getByRole("button", { name: /á/i });
    fireEvent.click(charBtn);

    fireEvent.click(screen.getByRole("button", { name: /^Apply$/i }));

    const state = useSurveyResultsStore.getState();
    const assignments = state.session.assignments.filter(
      (a) => a.modality === "physical" && a.scope === "individual",
    );
    expect(assignments).toHaveLength(1);
    expect(assignments[0]?.target).toBe("á");
  });
});

// ---------------------------------------------------------------------------
// Removing an assignment
// ---------------------------------------------------------------------------

describe("MechanismGallery — remove assignment", () => {
  it("removes the assignment from the store when Remove is clicked", async () => {
    seedInventory(["á"]);
    await act(async () => {
      render(<MechanismGallery selectedBaseKeyboard={basicKbdus} />);
    });

    // Apply first.
    fireEvent.click(screen.getByRole("button", { name: /configure/i }));
    fireEvent.click(screen.getByRole("button", { name: /^Apply$/i }));

    // Verify it's applied.
    expect(
      useSurveyResultsStore.getState().session.assignments.filter(
        (a) => a.modality === "physical",
      ),
    ).toHaveLength(1);

    // Remove — the Remove button appears only when the pattern isApplied.
    const removeBtn = screen.getByRole("button", { name: /^Remove$/i });
    fireEvent.click(removeBtn);

    expect(
      useSurveyResultsStore.getState().session.assignments.filter(
        (a) => a.modality === "physical",
      ),
    ).toHaveLength(0);
  });
});

// ---------------------------------------------------------------------------
// Coverage indicator reflects covered/uncovered counts
// ---------------------------------------------------------------------------

describe("MechanismGallery — coverage indicator", () => {
  it("shows uncovered when no assignments exist", async () => {
    seedInventory(["á", "é"]);
    await act(async () => {
      render(<MechanismGallery selectedBaseKeyboard={basicKbdus} />);
    });
    const indicator = screen.getByRole("status");
    // The aria-label is "Coverage: N of M characters covered" for all states.
    expect(indicator.getAttribute("aria-label")).toMatch(/Coverage: 0 of 2 characters covered/);
  });

  it("shows all covered after a keyboard-default assignment is applied", async () => {
    seedInventory(["á", "é"]);
    await act(async () => {
      render(<MechanismGallery selectedBaseKeyboard={basicKbdus} />);
    });

    fireEvent.click(screen.getByRole("button", { name: /configure/i }));
    fireEvent.click(screen.getByRole("button", { name: /^Apply$/i }));

    const indicator = screen.getByRole("status");
    // After a keyboard-default assignment the coverage indicator text changes,
    // but the aria-label always reflects the live count.
    expect(indicator.getAttribute("aria-label")).toMatch(/Coverage: 2 of 2 characters covered/);
  });
});

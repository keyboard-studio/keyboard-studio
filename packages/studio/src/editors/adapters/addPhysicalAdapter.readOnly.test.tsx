// addPhysicalAdapter on a basic keyboard opened for update: every tab is
// handed `readOnly`, and finishing the step records nothing.

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, screen } from "@testing-library/react";
import { render } from "../../test/renderWithI18n.tsx";
import { completePhysicalLayoutStep } from "../../lib/mechanismStepCompletion.ts";
import { AddPhysicalAdapter } from "./addPhysicalAdapter.tsx";

const basic = vi.hoisted(() => ({ open: false }));

vi.mock("../../hooks/useBasicKeyboardOpen.ts", () => ({
  useBasicKeyboardOpen: () => basic.open,
}));
vi.mock("../assignLoop/MechanismGallery.tsx", () => ({
  MechanismGallery: (props: { readOnly?: boolean; onComplete?: () => void }) => (
    <div data-testid="mock-gallery" data-read-only={String(props.readOnly === true)}>
      <button type="button" data-testid="mock-complete" onClick={props.onComplete}>
        Continue
      </button>
    </div>
  ),
}));
vi.mock("../assignLoop/KmnCodePane.tsx", () => ({
  KmnCodePane: (props: { physicalLocked?: boolean }) => (
    <div data-testid="mock-code-pane" data-read-only={String(props.physicalLocked === true)} />
  ),
}));
vi.mock("../layout/LayoutPane.tsx", () => ({
  LayoutPane: (props: { readOnly?: boolean }) => (
    <div data-testid="mock-layout-pane" data-read-only={String(props.readOnly === true)} />
  ),
}));
vi.mock("../../hooks/usePlacementPriors.ts", () => ({
  usePlacementPriors: () => undefined,
}));
vi.mock("../../lib/mechanismStepCompletion.ts", () => ({
  completePhysicalLayoutStep: vi.fn(),
}));

beforeEach(() => {
  vi.mocked(completePhysicalLayoutStep).mockClear();
});
afterEach(() => {
  cleanup();
  basic.open = false;
});

async function readOnlyOf(testId: string, tab: "code" | "layout" | null): Promise<string | null> {
  if (tab !== null) fireEvent.click(screen.getByTestId(`editor-view-tab-${tab}`));
  return (await screen.findByTestId(testId)).getAttribute("data-read-only");
}

describe("AddPhysicalAdapter — basic keyboard opened for update", () => {
  it("locks the physical keys in the Assign, Code and Layout tabs", async () => {
    basic.open = true;
    render(<AddPhysicalAdapter onComplete={vi.fn()} />);
    expect(await readOnlyOf("mock-gallery", null)).toBe("true");
    expect(await readOnlyOf("mock-code-pane", "code")).toBe("true");
    expect(await readOnlyOf("mock-layout-pane", "layout")).toBe("true");
  });

  it("finishes without recording the physical layout", () => {
    basic.open = true;
    const onComplete = vi.fn();
    render(<AddPhysicalAdapter onComplete={onComplete} />);
    fireEvent.click(screen.getByTestId("mock-complete"));
    expect(onComplete).toHaveBeenCalledTimes(1);
    expect(completePhysicalLayoutStep).not.toHaveBeenCalled();
  });

  it("any other keyboard: editable, and finishing records the physical layout", async () => {
    const onComplete = vi.fn();
    render(<AddPhysicalAdapter onComplete={onComplete} />);
    expect(await readOnlyOf("mock-gallery", null)).toBe("false");
    fireEvent.click(screen.getByTestId("mock-complete"));
    expect(completePhysicalLayoutStep).toHaveBeenCalledTimes(1);
    expect(onComplete).toHaveBeenCalledTimes(1);
  });
});

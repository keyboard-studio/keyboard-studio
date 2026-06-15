// Tests for TrackOneIdentityPanel.
//
// Coverage:
//   1. Panel renders only when instantiationMode === "new-from-base".
//   2. Panel does not render when instantiationMode is null or "adapt-existing".
//   3. Display-name input is seeded from baseKeyboard.displayName.
//   4. Keyboard-id input is seeded from baseKeyboard.id.
//   5. Changing display name calls setIdentity with the new displayName.
//   6. Changing keyboard id to a valid value calls setIdentity with keyboardId.
//   7. Invalid keyboard id shows validation error and does NOT call setIdentity.
//   8. Download warning: base-id warning shown when keyboardId is still the base id.
//   9. No base-id warning once keyboardId differs from base id.

import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { render, screen, fireEvent, cleanup } from "@testing-library/react";
import { useWorkingCopyStore } from "../stores/workingCopyStore.ts";
import { createVirtualFS } from "@keyboard-studio/contracts";
import { basicKbdus, makeTestIR } from "@keyboard-studio/contracts/fixtures";
import { TrackOneIdentityPanel } from "./TrackOneIdentityPanel.tsx";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function seedTrack1() {
  const vfs = createVirtualFS([
    { path: "source/basic_kbdus.kmn", content: "c test\n", isBinary: false },
  ]);
  useWorkingCopyStore.getState().instantiateFromBase(basicKbdus, {
    vfs,
    ir: makeTestIR([]),
  });
}

function seedTrack2() {
  const vfs = createVirtualFS([
    { path: "source/basic_kbdus.kmn", content: "c test\n", isBinary: false },
  ]);
  useWorkingCopyStore.getState().instantiateFromExisting(basicKbdus, {
    vfs,
    ir: makeTestIR([]),
  });
}

beforeEach(() => {
  useWorkingCopyStore.getState().reset();
  vi.clearAllMocks();
});

afterEach(() => {
  useWorkingCopyStore.getState().reset();
  cleanup();
});

// ---------------------------------------------------------------------------
// Render gating
// ---------------------------------------------------------------------------

describe("TrackOneIdentityPanel — render gating", () => {
  it("renders nothing when not yet instantiated", () => {
    const { container } = render(<TrackOneIdentityPanel />);
    expect(container.firstChild).toBeNull();
  });

  it("renders nothing for Track 2 (adapt-existing)", () => {
    seedTrack2();
    const { container } = render(<TrackOneIdentityPanel />);
    expect(container.firstChild).toBeNull();
  });

  it("renders the panel for Track 1 (new-from-base)", () => {
    seedTrack1();
    render(<TrackOneIdentityPanel />);
    expect(screen.getByRole("region", { name: "Name your keyboard" })).toBeDefined();
  });
});

// ---------------------------------------------------------------------------
// Seeding from base keyboard
// ---------------------------------------------------------------------------

describe("TrackOneIdentityPanel — seeding", () => {
  it("display-name input is seeded from baseKeyboard.displayName", () => {
    seedTrack1();
    render(<TrackOneIdentityPanel />);
    const input = screen.getByLabelText<HTMLInputElement>("Display name");
    expect(input.value).toBe(basicKbdus.displayName);
  });

  it("keyboard-id input is seeded from baseKeyboard.id", () => {
    seedTrack1();
    render(<TrackOneIdentityPanel />);
    const input = screen.getByLabelText<HTMLInputElement>("Keyboard ID");
    expect(input.value).toBe(basicKbdus.id);
  });
});

// ---------------------------------------------------------------------------
// setIdentity integration
// ---------------------------------------------------------------------------

describe("TrackOneIdentityPanel — setIdentity calls", () => {
  it("changing display name stores new displayName in the working copy", () => {
    seedTrack1();
    render(<TrackOneIdentityPanel />);
    const input = screen.getByLabelText<HTMLInputElement>("Display name");
    fireEvent.change(input, { target: { value: "Hausa SIL" } });
    expect(useWorkingCopyStore.getState().identity?.displayName).toBe("Hausa SIL");
  });

  it("changing keyboard id to a valid value stores new keyboardId in the working copy", () => {
    seedTrack1();
    render(<TrackOneIdentityPanel />);
    const input = screen.getByLabelText<HTMLInputElement>("Keyboard ID");
    fireEvent.change(input, { target: { value: "ha_sil" } });
    expect(useWorkingCopyStore.getState().identity?.keyboardId).toBe("ha_sil");
  });

  it("invalid keyboard id does NOT update the store's keyboardId", () => {
    seedTrack1();
    render(<TrackOneIdentityPanel />);
    const input = screen.getByLabelText<HTMLInputElement>("Keyboard ID");
    // Seed a valid id first so we can verify it is not overwritten.
    fireEvent.change(input, { target: { value: "ha_sil" } });
    expect(useWorkingCopyStore.getState().identity?.keyboardId).toBe("ha_sil");
    // Now type an invalid id (contains a space).
    fireEvent.change(input, { target: { value: "ha sil invalid" } });
    // Store should still hold the last valid value.
    expect(useWorkingCopyStore.getState().identity?.keyboardId).toBe("ha_sil");
  });

  it("invalid keyboard id shows the validation error message", () => {
    seedTrack1();
    render(<TrackOneIdentityPanel />);
    const input = screen.getByLabelText<HTMLInputElement>("Keyboard ID");
    fireEvent.change(input, { target: { value: "has space" } });
    // Error appears because the field was touched (change fires blur simulation).
    const error = screen.queryByRole("alert");
    expect(error).not.toBeNull();
    expect(error?.textContent).toMatch(/invalid characters/i);
  });
});

// ---------------------------------------------------------------------------
// Download warning for base-id unchanged
// ---------------------------------------------------------------------------

describe("TrackOneIdentityPanel — base-id warning", () => {
  it("shows the base-id warning when keyboardId still equals base id", () => {
    seedTrack1();
    render(<TrackOneIdentityPanel />);
    // Initial state: id is seeded to base id; warning should be visible.
    const warn = screen.queryByRole("status");
    expect(warn).not.toBeNull();
    expect(warn?.textContent).toMatch(/base keyboard/i);
  });

  it("hides the base-id warning once keyboardId differs from the base id", () => {
    seedTrack1();
    render(<TrackOneIdentityPanel />);
    const input = screen.getByLabelText<HTMLInputElement>("Keyboard ID");
    fireEvent.change(input, { target: { value: "ha_sil" } });
    // basicKbdus.id is "basic_kbdus"; "ha_sil" is different.
    expect(screen.queryByRole("status")).toBeNull();
  });
});

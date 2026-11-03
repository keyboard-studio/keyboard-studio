// MechanismGallery adapter for the shared gallery contract suites. Imports the
// component and harness only; the entry file owns the vi.mock block.
//
// Test-support module: imported only by *.test.tsx entry files.

import { act, fireEvent, screen } from "@testing-library/react";
import { basicKbdus } from "@keyboard-studio/contracts/fixtures";
import { render } from "../renderWithI18n.tsx";
import { MechanismGallery } from "../../editors/assignLoop/MechanismGallery.tsx";
import { CUSTOM_KEY_OPTION_VALUE } from "../../lib/keyOptions.ts";
import { useWorkingCopyStore } from "../../stores/workingCopyStore.ts";
import { MECHANISMS_STEP_ID } from "../../steps/stepIds.ts";
import { changeSelectMenu } from "../selectMenuTestUtils.ts";
import { seedInventory } from "../mechanismGallery/harness.ts";
import { BAFUT_BASES } from "../bafutFixture.ts";
import type { GalleryAdapter } from "./adapter.ts";

export const mechanismAdapter: GalleryAdapter = {
  name: "MechanismGallery",
  walkStepId: MECHANISMS_STEP_ID,
  prepareWalk() {
    // Nothing to seed: the walk fixtures carry the inventory.
  },
  async renderWalkGallery() {
    useWorkingCopyStore.getState().markGalleryIntroSeen("mechanism");
    await act(async () => {
      render(<MechanismGallery selectedStartKeyboard={basicKbdus} />, { withStepNav: true });
    });
  },
  expectedBases: BAFUT_BASES,
  introText: /Welcome to the Mechanism Gallery/i,
  startButton: /start the mechanism gallery/i,
  seedShell({ intro }) {
    seedInventory(["á"], intro === undefined ? {} : { intro });
  },
  async renderShell() {
    await act(async () => {
      render(<MechanismGallery selectedStartKeyboard={basicKbdus} />, { withStepNav: true });
      await new Promise((r) => setTimeout(r, 0));
    });
  },
  galleryVisible() {
    // "á" is decomposable-accented, so more than one status region can
    // legitimately be present (the coverage line plus the deadkey method's
    // pre-filled base-letter reflection): at least one means "gallery shown".
    return screen.queryAllByRole("status").length > 0;
  },
  customKey: {
    describeLabel: "custom key option (S-01 swap)",
    seed() {
      seedInventory(["ẑ"]);
    },
    async render() {
      await act(async () => {
        render(<MechanismGallery selectedStartKeyboard={basicKbdus} />);
      });
    },
    async openCustom() {
      fireEvent.click(screen.getByText(/Assign to a key/i));
      await changeSelectMenu(
        screen.getByLabelText(/Physical key for Assign to a key/i),
        CUSTOM_KEY_OPTION_VALUE,
      );
    },
    input: () => screen.getByLabelText(/Custom character for the assigned key/i),
    applyButton: () =>
      screen.getByRole("button", { name: /Apply method for ẑ/i }) as HTMLButtonElement,
  },
  applyCard: {
    seed() {
      seedInventory(["á"]);
    },
    async render() {
      await act(async () => {
        render(<MechanismGallery selectedStartKeyboard={basicKbdus} />, { withStepNav: true });
      });
    },
    applyName: /Apply method for á/i,
    // "á" decomposes to a + U+0301, so the default method is deadkey.
    defaultApplyTestId: "mechanism-apply-deadkey",
    steps: [
      {
        // Anchored regex: the swap card's key picker carries the aria-label
        // "Physical key for Assign to a key", which an unanchored
        // /Assign to a key/ would also match.
        async open() {
          fireEvent.click(screen.getByRole("button", { name: /^Assign to a key/i }));
        },
        applyTestId: "mechanism-apply-swap",
      },
    ],
  },
};

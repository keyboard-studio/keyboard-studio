// TouchGallery adapter for the shared gallery contract suites. Imports the
// component and harness only; the entry file owns the vi.mock block.
//
// Test-support module: imported only by *.test.tsx entry files.

import { act, fireEvent, screen } from "@testing-library/react";
import { expect, vi } from "vitest";
import { render } from "../renderWithI18n.tsx";
import { TouchGallery } from "../../editors/assignLoop/TouchGallery.tsx";
import { CUSTOM_KEY_OPTION_VALUE } from "../../lib/keyOptions.ts";
import { TOUCH_STEP_ID } from "../../steps/stepIds.ts";
import { changeSelectMenu } from "../selectMenuTestUtils.ts";
import { seedStore } from "../touchGallery/harness.ts";
import { BAFUT_BASES } from "../bafutFixture.ts";
import type { GalleryAdapter } from "./adapter.ts";

// The touch walk additionally excludes characters already reachable on the
// seed touch layout (the pre-existing entry-parity rule): the fixture seeds
// from US Basic, whose layout already carries the plain ASCII letters, so the
// expected walk is the placement set minus those. Everything non-ASCII in the
// placement set must be walked.
const UNDETECTED_BASES = BAFUT_BASES.filter((b) => !/^[A-Za-z]$/.test(b));

async function renderTouchGallery(): Promise<void> {
  await act(async () => {
    render(<TouchGallery onComplete={vi.fn()} onBack={vi.fn()} />, { withStepNav: true });
  });
}

// "中" has no desktop assignment, is not in the default touch layout and is
// not decomposable-accented, so no suggestion is offered and the method
// chooser opens directly at its default (long-press) method.
function seedNoSuggestionChar(): void {
  seedStore({ withInventory: ["中"] });
}

const OTHER_CARDS = [
  { label: /Swipe a key \(flick\)/i, applyTestId: "touch-apply-flick" },
  { label: /Tap multiple times \(multitap\)/i, applyTestId: "touch-apply-multitap" },
  { label: /Replace a key/i, applyTestId: "touch-apply-replace" },
];

export const touchAdapter: GalleryAdapter = {
  name: "TouchGallery",
  walkStepId: TOUCH_STEP_ID,
  prepareWalk() {
    seedStore({});
  },
  renderWalkGallery: renderTouchGallery,
  expectedBases: UNDETECTED_BASES,
  introText: /Welcome to the Touch Gallery/i,
  startButton: /start the touch gallery/i,
  seedShell({ intro }) {
    seedStore(intro === undefined ? { withInventory: ["ä"] } : { withInventory: ["ä"], intro });
  },
  renderShell: renderTouchGallery,
  galleryVisible() {
    return screen.queryAllByText(/Touch mapping/i).length > 0;
  },
  afterWalk(walk) {
    // The coverage line denominates over the same walk list.
    expect(screen.getByText(`0 of ${walk.length} configured`)).toBeTruthy();
  },
  customKey: {
    describeLabel: "custom host-key option",
    seed: seedNoSuggestionChar,
    render: renderTouchGallery,
    async openCustom() {
      await changeSelectMenu(
        screen.getByRole("button", { name: /host key for long-press/i }),
        CUSTOM_KEY_OPTION_VALUE,
      );
    },
    input: () => screen.getByLabelText(/Custom character for long-press host key/i),
    applyButton: () =>
      screen.getByRole("button", { name: /Apply touch method/i }) as HTMLButtonElement,
  },
  applyCard: {
    seed: seedNoSuggestionChar,
    render: renderTouchGallery,
    applyName: /Apply touch method for/i,
    defaultApplyTestId: "touch-apply-longpress",
    steps: OTHER_CARDS.map(({ label, applyTestId }) => ({
      async open() {
        await act(async () => {
          fireEvent.click(screen.getByText(label));
        });
      },
      applyTestId,
    })),
  },
};

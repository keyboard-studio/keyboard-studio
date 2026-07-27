// PhaseFGate — blocked-banner rendering regression.
//
// This is the regression test for the empty-interpolation bug: the dialog
// body's `{uncoveredCharsList}` and `{targetGalleryLabel}` locals rendered as
// EMPTY STRINGS even though the character COUNT was correct, because the
// committed en/fr Lingui catalogs for `editor.help.unimplementedGate.message`
// were stale — left over from before the previous refactor renamed the
// `<Trans>` interpolation locals, with numbered placeholders (`{0}{1}{2}`,
// `{3}`) that no longer matched the named values the macro now passes at
// runtime. A test that only checks `container.querySelector("dialog")` (as
// the pre-existing MechanismGallery suite does) never renders the message
// body far enough to catch this — this test asserts on the actual text.
//
// Root-cause fix: `pnpm --filter @keyboard-studio/studio messages:extract`
// regenerated the catalogs from current source; the fix here additionally
// mirrors the `en` text into `fr` for the ids that were affected (translator
// catch-up, not a fresh regression) and adds `formatUncoveredCharsList`
// truncation so a long inventory doesn't blow up the banner.
//
// Renders through the real `en`-activated <I18nProvider> (via
// `../../test/renderWithI18n.tsx`), which loads the actual committed
// `en/messages.json` catalog — so this test exercises the exact interpolation
// path that broke, not a hand-rolled English string.

import { describe, it, expect, vi, beforeEach, beforeAll, afterEach } from "vitest";
import { screen, fireEvent, cleanup } from "@testing-library/react";
import { render } from "../../test/renderWithI18n.tsx";
import { useWorkingCopyStore } from "../../stores/workingCopyStore.ts";
import { useSurveySessionStore } from "../../stores/surveySessionStore.ts";
import { createVirtualFS } from "@keyboard-studio/contracts";
import { makeTestIR, basicKbdus } from "@keyboard-studio/contracts/fixtures";

// jsdom does not implement HTMLDialogElement.showModal()/close() — same shim
// ConfirmDialog.test.tsx / MechanismGallery.test.tsx use.
beforeAll(() => {
  HTMLDialogElement.prototype.showModal ??= function (this: HTMLDialogElement) {
    this.setAttribute("open", "");
  };
  HTMLDialogElement.prototype.close ??= function (this: HTMLDialogElement) {
    this.removeAttribute("open");
  };
});

// PhaseFGate always renders the real Phase F step content ahead of the
// blocking dialog (`<PhaseFStepFactoryComponent {...props} />`) — stub it so
// this test isolates the coverage-blocked dialog rather than driving the
// whole Phase F "help" step's own dependencies.
vi.mock("./flowStepOptions.tsx", async (importOriginal) => ({
  ...(await importOriginal<typeof import("./flowStepOptions.tsx")>()),
  PhaseFStepFactoryComponent: () => null,
}));

function resetStores() {
  useWorkingCopyStore.getState().reset();
  useSurveySessionStore.getState().reset();
}

function seedInstantiatedWorkingCopy(inventory: string[]) {
  const vfs = createVirtualFS([
    { path: "source/basic_kbdus.kmn", content: "c test\n", isBinary: false },
  ]);
  useWorkingCopyStore.getState().instantiateFromBase(basicKbdus, { vfs, ir: makeTestIR([]) });
  useWorkingCopyStore.getState().recordPhase({
    phase: "B",
    answers: [],
    confirmedInventory: inventory,
  });
}

beforeEach(resetStores);
afterEach(() => {
  cleanup();
  resetStores();
  vi.clearAllMocks();
});

describe("PhaseFGate — coverage-blocked dialog", () => {
  it("renders the real uncovered characters (not empty) and a non-empty gallery label when desktop characters are unimplemented", async () => {
    const inventory = ["á", "é", "í", "ó", "ú"];
    seedInstantiatedWorkingCopy(inventory);
    // No mechanism assignments recorded at all — every inventory char is
    // unimplemented in the physical/desktop modality.

    const { PhaseFGate } = await import("./PhaseFGate.tsx");
    const { container } = render(<PhaseFGate onComplete={vi.fn()} />);

    // The native <dialog> is open (blocked === true).
    expect(container.querySelector("dialog")?.hasAttribute("open")).toBe(true);
    // Body text must include EVERY uncovered character — the exact bug was
    // this being blank while the count was correct.
    const bodyText = document.body.textContent ?? "";
    for (const char of inventory) {
      expect(bodyText).toContain(char);
    }
    // No stray unresolved placeholder tokens left in the rendered text.
    expect(bodyText).not.toMatch(/\{\d+\}/);
    // The gallery label must be a real, non-empty name — not blank.
    expect(bodyText).toMatch(/Go back to the .*Gallery.* to finish them/);
    expect(bodyText).toContain("Mechanism Gallery");
  });

  it("truncates a long uncovered-character list with a '+N more' suffix instead of listing all of them", async () => {
    const inventory = Array.from({ length: 34 }, (_, i) => String.fromCharCode(0x0410 + i)); // Cyrillic run
    seedInstantiatedWorkingCopy(inventory);

    const { PhaseFGate } = await import("./PhaseFGate.tsx");
    render(<PhaseFGate onComplete={vi.fn()} />);

    const bodyText = document.body.textContent ?? "";
    // Count is exact...
    expect(bodyText).toContain("34 characters");
    // ...but the inline list is capped with a "+N more" suffix rather than
    // rendering all 34 glyphs.
    expect(bodyText).toMatch(/\+22 more/);
  });
});

// ---------------------------------------------------------------------------
// "Go back and finish" — the P0 Back->Phase F regression.
//
// Root cause: PhaseFGate's handleGoBack used to call the forward-push
// `advance()` store primitive to route back to the relevant gallery. Because
// "help" is only ever entered via "touch"'s forward completion, `advance()`
// pushed a STALE "help" entry onto the walked-history stack every time this
// ran. That stale entry sat there until some LATER, completely ordinary Back
// traversal (popHistory, or backToTouchSeedSource's history-consuming
// branch) reached the top of the stack and popped it — silently landing the
// author back on the blocked "help" step. From the author's perspective:
// "I pressed Back [somewhere downstream] and it moved me to Phase F."
//
// Fix: handleGoBack now calls `backToUnfinishedGallery` (surveySessionStore.ts),
// a genuine BACK primitive that consumes exactly the "help" entry rather than
// pushing a new one. This test drives the full realistic walk (mechanisms ->
// touch_seed_source -> touch -> help), clicks "Go back and finish", and then
// performs the SAME ordinary Back traversal a real author would perform next
// — proving it reaches the true previous step, never "help" again.
// ---------------------------------------------------------------------------

describe("PhaseFGate — \"Go back and finish\" (Back regression)", () => {
  it("routes back without corrupting history — a subsequent ordinary Back never resurfaces 'help'", async () => {
    const inventory = ["á", "é"];
    seedInstantiatedWorkingCopy(inventory);
    // No desktop mechanism assignments recorded — blockedOnDesktop === true,
    // so handleGoBack targets "mechanisms" (desktop-first priority) rather
    // than "touch". This is the more demanding case: it jumps PAST the
    // immediate predecessor ("touch") in the walked history.
    const session = useSurveySessionStore.getState();
    session.advance("mechanisms");
    session.advance("touch_seed_source");
    session.advance("touch");
    session.advance("help");
    expect(useSurveySessionStore.getState().activeStepId).toBe("help");

    const { PhaseFGate } = await import("./PhaseFGate.tsx");
    render(<PhaseFGate onComplete={vi.fn()} />);

    const goBackBtn = screen.getByRole("button", { name: /go back and finish/i });
    fireEvent.click(goBackBtn);

    // Routed to "mechanisms" (blockedOnDesktop) — not stuck on "help".
    expect(useSurveySessionStore.getState().activeStepId).toBe("mechanisms");

    // The regression proof: perform the SAME ordinary Back traversal an
    // author would do next (mechanisms's own first-character Back ->
    // StepHost's generic popHistory path) and assert it does NOT resurface
    // "help" — it must reach the actual prior step ("touch_seed_source").
    useSurveySessionStore.getState().popHistory();
    expect(useSurveySessionStore.getState().activeStepId).not.toBe("help");
    expect(useSurveySessionStore.getState().activeStepId).toBe("touch_seed_source");
  });
});

// MarksStepHost on Open (spec 111 SC-008): the guard rules are written into the
// file by the author's own action, finishing the series - never by mounting,
// remounting, going back or a restored decision.

import { StrictMode } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, screen, waitFor } from "@testing-library/react";
import { render } from "../../test/renderWithI18n.tsx";
import { createVirtualFS, type StartKeyboard } from "@keyboard-studio/contracts";
import { MARKS_GUARD_GROUP, parseKmn } from "@keyboard-studio/engine";
import { useWorkingCopyStore } from "../../stores/workingCopyStore.ts";
import { clearOpenSession, useOpenUndoStore } from "../../stores/openUndoStore.ts";
import { useOpenAssignStore } from "../../stores/openAssignStore.ts";
import { useDecisionStore } from "../../stores/decisionStore.ts";
import { readVfsText } from "../../lib/vfsText.ts";
import { OpenApplyHost } from "../../components/OpenApplyHost.tsx";
import { recordMarksTreatmentValue, type MarksTreatmentValue } from "./marksValue.ts";
import { MarksStepHost } from "./MarksStepHost.tsx";

// The hosted series itself is not under test: a stand-in that finishes on click.
vi.mock("../../steps/galleryHost.tsx", async (importOriginal) => ({
  ...(await importOriginal<typeof import("../../steps/galleryHost.tsx")>()),
  GalleryHost: ({ stepContext }: { stepContext: { onComplete: (r: unknown) => void } }) => (
    <button type="button" data-testid="finish" onClick={() => stepContext.onComplete({})}>
      finish
    </button>
  ),
}));

const ID = "tiny";
const KMN_PATH = `source/${ID}.kmn`;
const KMN = ["store(&NAME) 'Tiny'", "begin Unicode > use(main)", "group(main) using keys", "+ [K_A] > 'a'", ""].join("\n");
const VALUE: MarksTreatmentValue = {
  answers: {},
  completion: {
    worklist: { ownLetterUnits: ["a", "k"], markUnits: [{ mark: "́", inputOrder: "postfix" }], blockedCombinations: [{ base: "k", mark: "́" }] },
    outputForm: "base-plus-mark",
  } as unknown as MarksTreatmentValue["completion"],
  contextTolerance: null,
};
const text = () => readVfsText(useWorkingCopyStore.getState().startVfs!, KMN_PATH)!;

function openKeyboard(): void {
  clearOpenSession();
  useDecisionStore.getState().reset();
  const vfs = createVirtualFS([
    { path: KMN_PATH, content: KMN, isBinary: false },
    { path: `source/${ID}.kps`, content: "<Package/>", isBinary: false },
  ]);
  const wc = useWorkingCopyStore.getState();
  wc.reset();
  wc.instantiateFromExisting(
    { id: ID, path: "release/t/tiny", script: "Latn", targets: ["desktop"], displayName: "Tiny", version: "1.0", languages: ["en"] } as StartKeyboard,
    { vfs, ir: parseKmn(KMN, ID).ir },
  );
  wc.setAttribution({ authorName: "T", copyrightHolder: "T" });
  recordMarksTreatmentValue(VALUE);
}

afterEach(() => cleanup());

describe("MarksStepHost on Open", () => {
  beforeEach(openKeyboard);

  it("mounting, remounting and StrictMode neither write nor prompt", async () => {
    const onComplete = vi.fn();
    const first = render(<StrictMode><OpenApplyHost><MarksStepHost onComplete={onComplete} onBack={() => {}} /></OpenApplyHost></StrictMode>);
    first.unmount();
    render(<StrictMode><OpenApplyHost><MarksStepHost onComplete={onComplete} onBack={() => {}} /></OpenApplyHost></StrictMode>);
    await new Promise((r) => setTimeout(r, 20));
    expect(text()).toBe(KMN);
    expect(useOpenUndoStore.getState().records).toEqual([]);
    expect(onComplete).not.toHaveBeenCalled();
  });

  it("finishing the series writes the guards, then continues", async () => {
    const onComplete = vi.fn();
    render(<OpenApplyHost><MarksStepHost onComplete={onComplete} onBack={() => {}} /></OpenApplyHost>);
    fireEvent.click(screen.getByTestId("finish"));
    await waitFor(() => expect(onComplete).toHaveBeenCalledTimes(1));
    expect(text()).toContain(`group(${MARKS_GUARD_GROUP})`);
    expect(useOpenUndoStore.getState().records.map((r) => r.view.kind)).toEqual(["marks"]);
  });

  it("a completion the author declined is not asked again, and the memory is session-scoped", async () => {
    const onComplete = vi.fn();
    useOpenAssignStore.getState().declineMarks(`${ID}|${JSON.stringify(VALUE.completion)}`);
    render(<OpenApplyHost><MarksStepHost onComplete={onComplete} onBack={() => {}} /></OpenApplyHost>);
    fireEvent.click(screen.getByTestId("finish"));
    await waitFor(() => expect(onComplete).toHaveBeenCalledTimes(1));
    expect(text()).toBe(KMN);
    clearOpenSession();
    expect(useOpenAssignStore.getState().declinedMarks).toBeNull();
  });
});

describe("MarksStepHost on Copy", () => {
  it("finishing only continues", async () => {
    useDecisionStore.getState().reset();
    useWorkingCopyStore.getState().reset();
    const onComplete = vi.fn();
    render(<OpenApplyHost><MarksStepHost onComplete={onComplete} onBack={() => {}} /></OpenApplyHost>);
    fireEvent.click(screen.getByTestId("finish"));
    await waitFor(() => expect(onComplete).toHaveBeenCalledTimes(1));
    expect(useOpenUndoStore.getState().records).toEqual([]);
  });
});

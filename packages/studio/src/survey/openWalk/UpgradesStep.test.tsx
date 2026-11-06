// Spec 111 FR-034: the Upgrades page lists each offer with a preview, applies
// only on Apply (writing the file text through the starting-point seam), and a
// Skip keeps the offer from coming back.

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { act, cleanup, fireEvent, screen, waitFor } from "@testing-library/react";
import { render } from "../../test/renderWithI18n.tsx";

import type { UpgradeOffer } from "../../criteria/upgradePairs.ts";

const FILE = "source/basic_kbdus.kmn";
const offer: UpgradeOffer = {
  file: FILE,
  afterText: "c upgraded\n",
  fix: {
    id: `upgrade:KM_LINT_TEST:${FILE}`,
    kind: "upgrade",
    findingKey: null,
    preview: [{ file: FILE, before: "c test\n", after: "c upgraded\n" }],
    status: "pending",
    title: "Use the test upgrade",
  },
};

const replace = vi.hoisted(() => vi.fn(() => ({ ok: true as const })));

vi.mock("../../lib/replaceStartingPoint.ts", () => ({ replaceStartingPointAndReplay: replace }));
vi.mock("../../lib/capsEngine.ts", () => ({ loadCapsEngine: () => Promise.resolve({}) }));
vi.mock("../../criteria/upgradePairs.ts", () => ({ offerUpgrades: () => Promise.resolve([offer]) }));
vi.mock("../../criteria/openRatchet.ts", () => ({
  collectFailing: () => [{ key: `KM_LINT_TEST:${FILE}`, criterionId: "x" }],
}));
vi.mock("../../hooks/useOpenWalkCriteria.ts", () => ({
  useOpenWalkCriteria: () => ({ result: {}, stage: { kind: "idle" } }),
}));

import { UpgradesRenderer } from "./UpgradesStep.tsx";
import { GalleryStepContext } from "../../steps/galleryHost.tsx";
import { useWorkingCopyStore } from "../../stores/workingCopyStore.ts";
import { useDecisionLogStore } from "../../decisions/decisionLogStore.ts";
import { STANDALONE_STEP_ID, useStepNavStore } from "../../stores/stepNavStore.ts";
import { seedInstantiatedWorkingCopy } from "../../test/workingCopy.ts";

function mount(onComplete = vi.fn(), onChange = vi.fn()) {
  render(
    <GalleryStepContext.Provider value={{ onComplete }}>
      <UpgradesRenderer value={undefined} onChange={onChange} decisionId="upgrades-review" provenance="asked" />
    </GalleryStepContext.Provider>,
  );
  return { onComplete, onChange };
}

describe("UpgradesStep", () => {
  beforeEach(() => {
    replace.mockClear();
    useDecisionLogStore.getState().reset();
    useWorkingCopyStore.getState().reset();
    seedInstantiatedWorkingCopy([]);
  });
  afterEach(cleanup);

  it("applies the previewed text only when Apply is pressed", async () => {
    mount();
    expect(await screen.findByText("Use the test upgrade")).toBeTruthy();
    expect(replace).not.toHaveBeenCalled();
    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: /Apply: Use the test upgrade/ }));
    });
    expect(replace).toHaveBeenCalledWith(FILE, "c upgraded\n");
    await waitFor(() => expect(screen.queryByText("Use the test upgrade")).toBeNull());
  });

  it("skip hides the offer without writing anything", async () => {
    mount();
    await screen.findByText("Use the test upgrade");
    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: /Skip: Use the test upgrade/ }));
    });
    expect(replace).not.toHaveBeenCalled();
    await waitFor(() => expect(screen.queryByText("Use the test upgrade")).toBeNull());
  });

  it("Continue records the page as reviewed and completes the step", async () => {
    const { onComplete, onChange } = mount();
    await screen.findByText("Use the test upgrade");
    const forward = useStepNavStore.getState().entries[STANDALONE_STEP_ID]?.spec.forward;
    expect(forward).toBeDefined();
    forward!.onClick();
    expect(onChange).toHaveBeenCalledWith(true);
    expect(onComplete).toHaveBeenCalled();
  });
});

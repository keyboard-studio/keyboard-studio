// Regression: the replay fold keeps the docFixProposals channel
// (defect b). Before the fix, foldPatch dropped it and the rebuild
// install never wrote it to the working copy.

import { describe, it, expect, beforeEach } from "vitest";
import { makeTestIR } from "@keyboard-studio/contracts/fixtures";
import type { QuestionModule } from "../survey/types.ts";
import type { Decision, DecisionSet } from "./decisionTypes.ts";
import { providerFromModules, replayKeyboard } from "./replayKeyboard.ts";
import { rebuildWorkingCopyFromStores, resetRebuildTrail } from "./rebuildWorkingCopy.ts";
import { useDecisionStore } from "../stores/decisionStore.ts";
import { useWorkingCopyStore } from "../stores/workingCopyStore.ts";

const parityModule = {
  definition: { id: "pf_body_parity", type: "text", prompt: "p" },
  fixtures: { valid: [], invalid: [] },
  provides: ["help-body-parity"],
  apply: () => ({ docFixProposals: { bodySync: "welcome" } }),
} as unknown as QuestionModule;

const decisions = {
  "help-body-parity": {
    id: "help-body-parity",
    value: "welcome",
    provenance: "asked",
  } as Decision,
} as unknown as DecisionSet;

describe("replayKeyboard - docFixProposals channel", () => {
  it("folds docFixProposals into the overlay", () => {
    const out = replayKeyboard(providerFromModules([parityModule]), {
      decisions,
      order: ["help-body-parity"],
      startingPointIR: makeTestIR({}),
    });
    expect(out.state.overlay.docFixProposals).toEqual({ bodySync: "welcome" });
    expect(out.checkpoints.at(-1)?.overlay.docFixProposals).toEqual({ bodySync: "welcome" });
  });
});

describe("rebuildWorkingCopyFromStores - docFixProposals install", () => {
  beforeEach(() => {
    useDecisionStore.getState().reset();
    useWorkingCopyStore.getState().reset();
    resetRebuildTrail();
  });

  it("installs the folded proposals and keeps sibling keys", () => {
    const ir = makeTestIR({});
    useWorkingCopyStore.setState({
      startIr: ir,
      ir,
      docFixProposals: { pagename: "accepted" },
    });
    useDecisionStore.getState().recordAll([
      { id: "authoring-track", value: "copy", provenance: "asked" } as Decision,
      { id: "help-body-parity", value: "help", provenance: "asked" } as Decision,
    ]);
    rebuildWorkingCopyFromStores(["help-body-parity"]);
    expect(useWorkingCopyStore.getState().docFixProposals).toEqual({
      pagename: "accepted",
      bodySync: "help",
    });
  });
});

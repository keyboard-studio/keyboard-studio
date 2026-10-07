// Tests for the T009 rebuild wiring core (spec 093): a decision change
// recalculates its downstream closure and the working copy is rebuilt by
// replay from the checkpoint before the first changed decision — the
// rebuilt state carries the IR and the overlay channels (I-1).

import { describe, it, expect, beforeEach } from "vitest";
import { makeTestIR } from "@keyboard-studio/contracts/fixtures";
import type { KeyboardIR } from "@keyboard-studio/contracts";
import type { QuestionModule } from "../survey/types.ts";
import type { Decision, DecisionId, DecisionSet } from "./decisionTypes.ts";
import type { ExtractContext } from "./extractContext.ts";
import { seedTrail } from "./replayCheckpoints.ts";
import {
  decisionOrderFor,
  rebuildWorkingCopy,
  rebuildWorkingCopyFromStores,
  resetRebuildTrail,
  type RebuildDeps,
} from "./rebuildWorkingCopy.ts";
import { useDecisionStore } from "../stores/decisionStore.ts";
import { useWorkingCopyStore } from "../stores/workingCopyStore.ts";

const mod = (partial: Partial<QuestionModule> & { id: string }): QuestionModule => ({
  definition: { id: partial.id, type: "text", prompt: partial.id },
  fixtures: { valid: [], invalid: [] },
  ...partial,
} as QuestionModule);

const rec = (partial: Partial<Decision> & { id: DecisionId }): Decision =>
  ({ value: undefined, provenance: "asked", ...partial }) as Decision;

function baseIR(): KeyboardIR {
  return makeTestIR({
    header: { name: "base-name", keyboardId: "base_id", version: "1.0" },
  });
}

// A tiny chain: language-name → project-keyboard-id (extracted) →
// copyright-holder (asked). The bundle's keyboard id is mutable stand-in
// evidence, the way a starting-point change would move it.
let bundleKbId = "old_id";

const nameModule = mod({
  id: "q_name",
  provides: ["language-name"],
  writes: [["header"]],
  apply: (value) => ({ ir: { header: { name: String(value ?? "") } } }),
});
const kbIdModule = mod({
  id: "q_kbid",
  provides: ["project-keyboard-id"],
  requires: ["language-name"],
  extract: () => bundleKbId,
  writes: [["header"]],
  apply: (value) => ({
    identity: { keyboardId: String(value ?? "") },
    ir: { header: { keyboardId: String(value ?? "") } },
  }),
});
const holderModule = mod({
  id: "q_holder",
  provides: ["copyright-holder"],
  requires: ["project-keyboard-id"],
  validate: (v) => ({ ok: typeof v === "string" && v.length > 0 }),
  apply: (value) => ({
    attribution: { authorName: "An Author", copyrightHolder: String(value ?? "") },
  }),
});

const MODULES = [nameModule, kbIdModule, holderModule];
const CTX = { ir: null, catalog: null } as ExtractContext;

function deps(): RebuildDeps {
  return { modules: MODULES, extractContext: CTX, source: "base_kb" };
}

function startDecisions(): DecisionSet {
  return {
    "language-name": rec({ id: "language-name", value: "Lang", provenance: "asked" }),
    "project-keyboard-id": rec({
      id: "project-keyboard-id",
      value: "old_id",
      provenance: "extracted",
      source: "base_kb",
    }),
    "copyright-holder": rec({
      id: "copyright-holder",
      value: "© Holder",
      provenance: "asked",
    }),
  };
}

describe("rebuildWorkingCopy — recalculate + replay (T009)", () => {
  it("derives the decision order from the registry order", () => {
    expect(decisionOrderFor(MODULES)).toEqual([
      "language-name",
      "project-keyboard-id",
      "copyright-holder",
    ]);
  });

  it("recomputes a downstream extracted record and installs IR + overlay", () => {
    bundleKbId = "new_id"; // the starting point's evidence moved
    const start = baseIR();
    const out = rebuildWorkingCopy(deps(), {
      decisions: startDecisions(),
      changed: new Set(["language-name"]),
      startingPointIR: start,
      trail: seedTrail(start),
    });

    // Recalculation re-extracted the downstream record; only it is
    // written back (the author's own records are already in the store).
    expect(out.recordsToWrite.map((r) => r.id)).toEqual(["project-keyboard-id"]);
    expect(out.recordsToWrite[0]?.value).toBe("new_id");
    expect(out.recalculated.recomputed).toEqual(["project-keyboard-id"]);

    // The rebuilt state folds every apply in derived order.
    expect(out.replayedFromIndex).toBe(0);
    expect(out.state.ir.header.name).toBe("Lang");
    expect(out.state.ir.header.keyboardId).toBe("new_id");
    expect(out.state.overlay.identity?.keyboardId).toBe("new_id");
    expect(out.state.overlay.attribution?.copyrightHolder).toBe("© Holder");
    expect(out.trail).toHaveLength(4);
  });

  it("resumes from the checkpoint before a later change, equal to a full rebuild", () => {
    bundleKbId = "old_id";
    const start = baseIR();
    const first = rebuildWorkingCopy(deps(), {
      decisions: startDecisions(),
      changed: new Set(["language-name"]),
      startingPointIR: start,
      trail: seedTrail(start),
    });

    const edited: DecisionSet = {
      ...startDecisions(),
      "copyright-holder": rec({
        id: "copyright-holder",
        value: "© New Holder",
        provenance: "asked",
      }),
    };
    const incremental = rebuildWorkingCopy(deps(), {
      decisions: edited,
      changed: new Set(["copyright-holder"]),
      startingPointIR: start,
      trail: first.trail,
    });
    // copyright-holder sits at order index 2 — the resume starts there.
    expect(incremental.replayedFromIndex).toBe(2);
    expect(incremental.state.overlay.attribution?.copyrightHolder).toBe("© New Holder");

    const full = rebuildWorkingCopy(deps(), {
      decisions: edited,
      changed: new Set(["copyright-holder"]),
      startingPointIR: start,
      trail: seedTrail(start),
    });
    expect(incremental.state.ir).toEqual(full.state.ir);
    expect(incremental.state.overlay).toEqual(full.state.overlay);
  });

  it("keeps an asked record the change leaves valid (no write-back)", () => {
    bundleKbId = "old_id";
    const start = baseIR();
    const out = rebuildWorkingCopy(deps(), {
      decisions: startDecisions(),
      changed: new Set(["project-keyboard-id"]),
      startingPointIR: start,
      trail: seedTrail(start),
    });
    expect(out.recordsToWrite).toEqual([]);
    expect(out.recalculated.reproposed).toEqual([]);
  });
});

describe("rebuildWorkingCopyFromStores — the live entry (T009)", () => {
  beforeEach(() => {
    useDecisionStore.getState().reset();
    useWorkingCopyStore.getState().reset();
    resetRebuildTrail();
  });

  it("is a no-op before a starting point exists", () => {
    expect(rebuildWorkingCopyFromStores(["copyright-holder"])).toBeNull();
    expect(rebuildWorkingCopyFromStores([])).toBeNull();
  });

  it("installs the rebuilt IR + overlay channels into the working copy store", () => {
    const ir = baseIR();
    useWorkingCopyStore.setState({ baseIr: ir, ir });
    useDecisionStore.getState().recordAll([
      rec({ id: "author-name", value: "Test Author", provenance: "asked" }),
      rec({ id: "authoring-track", value: "copy", provenance: "asked" }),
      rec({ id: "copyright-holder", value: "Test Author", provenance: "asked" }),
      rec({ id: "project-keyboard-id", value: "testish_new", provenance: "asked" }),
      rec({ id: "project-display-name", value: "Testish New", provenance: "asked" }),
      rec({ id: "help-welcome-paragraph", value: "Welcome to the keyboard.", provenance: "asked" }),
    ]);

    const out = rebuildWorkingCopyFromStores(["copyright-holder"]);
    expect(out).not.toBeNull();

    const wc = useWorkingCopyStore.getState();
    expect(wc.attribution?.copyrightHolder).toBe("Test Author");
    expect(wc.identity?.keyboardId).toBe("testish_new");
    expect(wc.helpDocs?.description).toBe("Welcome to the keyboard.");
    // The IR header keeps the base id: the rename to the author's id is
    // the output projection's pass over the identity channel, not an
    // apply-time IR write (workingCopyStore's IdentityPatch contract).
    expect(wc.ir?.header.keyboardId).toBe("base_id");
  });

  it("installs the folded carve slice into the working copy's carve state (D-090-24)", () => {
    const ir = baseIR();
    useWorkingCopyStore.setState({ baseIr: ir, ir });
    useDecisionStore.getState().recordAll([
      rec({ id: "authoring-track", value: "copy", provenance: "asked" }),
      rec({
        id: "carved-layout",
        value: {
          removals: [
            { kind: "node", id: "n1", provenance: "asked" },
            { kind: "item", id: "i1", provenance: "asked" },
            { kind: "family", id: "fam1", provenance: "asked" },
            { kind: "char", id: "é", provenance: "asked" },
          ],
          dispositions: [
            { comboId: "n1#0", disposition: "block", provenance: "author-override" },
          ],
          closedKeyboardCard: "accepted",
        },
        provenance: "asked",
      }),
    ]);

    const out = rebuildWorkingCopyFromStores(["carved-layout"]);
    expect(out).not.toBeNull();

    const wc = useWorkingCopyStore.getState();
    expect([...wc.deletedNodeIds]).toEqual(["n1"]);
    expect([...wc.deletedItemIds]).toEqual(["i1"]);
    expect([...wc.disabledFamilyIds]).toEqual(["fam1"]);
    expect([...wc.carveChars]).toEqual(["é"]);
    expect(wc.carveDispositions).toEqual([
      { comboId: "n1#0", disposition: "block", provenance: "author-override" },
    ]);
    expect(wc.closedKeyboardCard).toBe("accepted");
  });
});

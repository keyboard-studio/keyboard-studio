// Tests for pf_history_entry (spec 076 T043/T045, contracts/studio-surfaces.md §3).
//
// Coverage:
//   - module shape (definition/id/routing, inputs/writes, bulletsModule)
//   - validate() fixtures for both modules
//   - deriveHistoryEntryState: first render, unchanged version, version
//     change (heading/version + bullets re-derived, dateIso/status/
//     editedBullets preserved)
//   - applyHistoryEntryAction: confirm / dismiss / edit (with and without
//     edited text)
//   - parseEditedBullets

import { describe, it, expect } from "vitest";
import type { HistoryEntryState } from "@keyboard-studio/contracts";
import type { HistoryProposalSeed } from "@keyboard-studio/engine";
import mod, {
  bulletsModule,
  definition,
  bulletsDefinition,
  validate,
  applyHistoryEntryAction,
  deriveHistoryEntryState,
  parseEditedBullets,
} from "./pf_history_entry.ts";

const EMPTY_SEED: HistoryProposalSeed = {
  base: null,
  charactersAdded: [],
  mechanismsAssigned: [],
  keysRemoved: 0,
};

const FULL_SEED: HistoryProposalSeed = {
  base: { id: "basic_kbdfr", version: "1.3" },
  charactersAdded: ["é", "è"],
  mechanismsAssigned: ["dead key"],
  keysRemoved: 2,
};

describe("pf_history_entry — module shape", () => {
  it("has the correct id, is optional, and routes on the answered action", () => {
    expect(definition.id).toBe("pf_history_entry");
    expect(definition.required).toBe(false);
    expect(definition.type).toBe("radio");
    expect(definition.next).toEqual([
      { condition: "value == 'edit'", goto: "pf_history_entry_bullets" },
      { goto: "pf_more_detail_gate", default: true },
    ]);
  });

  it("offers exactly the three actions as options", () => {
    expect(definition.options?.map((o) => o.value)).toEqual(["confirm", "edit", "dismiss"]);
  });

  it("declares no IR reads/writes (store-slice pattern, spec 061 precedent)", () => {
    expect(mod.inputs).toEqual([]);
    expect(mod.writes).toEqual([]);
    expect(mod.specRef).toBe("specs/076-documentation-completeness");
  });

  it("the bullets module routes straight to the opt-in gate", () => {
    expect(bulletsDefinition.id).toBe("pf_history_entry_bullets");
    expect(bulletsDefinition.next).toBe("pf_more_detail_gate");
    expect(bulletsModule.inputs).toEqual([]);
    expect(bulletsModule.writes).toEqual([]);
  });
});

describe("pf_history_entry — validate()", () => {
  for (const fixture of mod.fixtures.valid) {
    it(`accepts: ${fixture.note ?? String(fixture.value)}`, () => {
      expect(validate(fixture.value)).toEqual({ ok: true });
    });
  }

  for (const fixture of mod.fixtures.invalid) {
    it(`rejects: ${fixture.note ?? String(fixture.value)}`, () => {
      const result = validate(fixture.value);
      expect(result.ok).toBe(false);
      if (!result.ok && fixture.expectedCode !== undefined) {
        expect(result.code).toBe(fixture.expectedCode);
      }
    });
  }
});

describe("deriveHistoryEntryState — first render (no prior state)", () => {
  it("builds a fresh 'proposed' state, stamping dateIso once", () => {
    const state = deriveHistoryEntryState({
      seed: FULL_SEED,
      version: "1.1",
      dateIso: "2026-06-18",
      previous: null,
    });
    expect(state.status).toBe("proposed");
    expect(state.editedBullets).toBeNull();
    expect(state.proposal.version).toBe("1.1");
    expect(state.proposal.dateIso).toBe("2026-06-18");
    expect(state.proposal.bullets).toEqual([
      "Adapted from basic_kbdfr v1.3 via keyboard-studio.",
      "Added 2 characters: é, è",
      "Assigned mechanisms: dead key",
      "Removed 2 keys",
    ]);
  });

  it("net-new (no base): the proposal falls back to 'Initial release.'", () => {
    const state = deriveHistoryEntryState({
      seed: EMPTY_SEED,
      version: "1.0",
      dateIso: "2026-06-18",
      previous: null,
    });
    expect(state.proposal.bullets).toEqual(["Initial release."]);
  });
});

describe("deriveHistoryEntryState — same version", () => {
  it("returns the previous state unchanged", () => {
    const previous: HistoryEntryState = {
      status: "confirmed",
      proposal: { version: "1.1", dateIso: "2026-06-18", bullets: ["Initial release."] },
      editedBullets: null,
    };
    const state = deriveHistoryEntryState({
      seed: FULL_SEED,
      version: "1.1",
      dateIso: "2099-01-01",
      previous,
    });
    expect(state).toBe(previous);
  });
});

describe("deriveHistoryEntryState — version change (spec edge case)", () => {
  it("re-derives heading/version and bullets, preserving dateIso, status, and editedBullets", () => {
    const previous: HistoryEntryState = {
      status: "edited",
      proposal: { version: "1.1", dateIso: "2026-06-18", bullets: ["Adapted from basic_kbdfr v1.3 via keyboard-studio."] },
      editedBullets: ["My own wording."],
    };
    const state = deriveHistoryEntryState({
      seed: FULL_SEED,
      version: "1.2",
      dateIso: "2099-01-01",
      previous,
    });
    expect(state.status).toBe("edited");
    expect(state.editedBullets).toEqual(["My own wording."]);
    expect(state.proposal.version).toBe("1.2");
    // R12: the ORIGINAL dateIso is kept, never the fresh one passed in.
    expect(state.proposal.dateIso).toBe("2026-06-18");
    expect(state.proposal.bullets).toEqual([
      "Adapted from basic_kbdfr v1.3 via keyboard-studio.",
      "Added 2 characters: é, è",
      "Assigned mechanisms: dead key",
      "Removed 2 keys",
    ]);
  });

  it("also re-derives a still-'proposed' (undecided) state", () => {
    const previous: HistoryEntryState = {
      status: "proposed",
      proposal: { version: "1.0", dateIso: "2026-06-18", bullets: ["Initial release."] },
      editedBullets: null,
    };
    const state = deriveHistoryEntryState({
      seed: EMPTY_SEED,
      version: "1.1",
      dateIso: "2099-01-01",
      previous,
    });
    expect(state.status).toBe("proposed");
    expect(state.proposal.version).toBe("1.1");
    expect(state.proposal.dateIso).toBe("2026-06-18");
  });
});

describe("applyHistoryEntryAction", () => {
  const current: HistoryEntryState = {
    status: "proposed",
    proposal: { version: "1.0", dateIso: "2026-06-18", bullets: ["Initial release."] },
    editedBullets: null,
  };

  it("confirm -> status confirmed, editedBullets null", () => {
    const next = applyHistoryEntryAction("confirm", undefined, current);
    expect(next.status).toBe("confirmed");
    expect(next.editedBullets).toBeNull();
    expect(next.proposal).toBe(current.proposal);
  });

  it("dismiss -> status dismissed, editedBullets null (placeholder stays, FR-011)", () => {
    const next = applyHistoryEntryAction("dismiss", undefined, current);
    expect(next.status).toBe("dismissed");
    expect(next.editedBullets).toBeNull();
  });

  it("edit with text -> status edited, editedBullets parsed one-per-line", () => {
    const next = applyHistoryEntryAction("edit", "First bullet.\n\nSecond bullet.\n", current);
    expect(next.status).toBe("edited");
    expect(next.editedBullets).toEqual(["First bullet.", "Second bullet."]);
  });

  it("edit with blank text -> falls back to the current proposal's bullets", () => {
    const next = applyHistoryEntryAction("edit", "   \n  ", current);
    expect(next.status).toBe("edited");
    expect(next.editedBullets).toEqual(current.proposal.bullets);
  });

  it("edit with undefined text -> falls back to the current proposal's bullets", () => {
    const next = applyHistoryEntryAction("edit", undefined, current);
    expect(next.editedBullets).toEqual(current.proposal.bullets);
  });
});

describe("parseEditedBullets", () => {
  it("splits on newlines, trims, and drops blank lines", () => {
    expect(parseEditedBullets("  a  \n\nb\n   \nc")).toEqual(["a", "b", "c"]);
  });

  it("returns an empty array for blank input", () => {
    expect(parseEditedBullets("   \n  \n")).toEqual([]);
  });
});

// Tests for the pure replay engine (spec 093 T004, FR-001 + I-1): replay
// folds ALL FIVE WorkingCopyPatch channels — the IR through the checked
// merge, the four overlay channels as whole-value replaces — in derived
// order, with ApplyContext.currentHistoryEntryState read from the
// accumulator folded so far.

import { describe, it, expect } from "vitest";
import { makeTestIR } from "@keyboard-studio/contracts/fixtures";
import type { KeyboardIR } from "@keyboard-studio/contracts";
import type { QuestionModule } from "../survey/types.ts";
import type { Decision, DecisionSet } from "./decisionTypes.ts";
import {
  providerFromModules,
  replayKeyboard,
  type ReplayOutcome,
} from "./replayKeyboard.ts";
import ilCopyrightHolder from "../survey/questions/a/il_copyright_holder.ts";
import projectKeyboardId from "../survey/questions/g/project_keyboard_id.ts";
import pfWelcomeParagraph from "../survey/questions/f/pf_welcome_paragraph.ts";

const mod = (partial: Partial<QuestionModule> & { id: string }): QuestionModule => ({
  definition: { id: partial.id, type: "text", prompt: partial.id },
  fixtures: { valid: [], invalid: [] },
  ...partial,
} as QuestionModule);

const rec = (partial: Partial<Decision> & { id: Decision["id"] }): Decision => ({
  value: undefined,
  provenance: "asked",
  ...partial,
} as Decision);

function baseIR(): KeyboardIR {
  return makeTestIR({
    header: { name: "base-name", keyboardId: "base_id", version: "1.0" },
  });
}

// ---------------------------------------------------------------------------
// Synthetic channel writers
// ---------------------------------------------------------------------------

const nameModule = mod({
  id: "q_name",
  provides: ["language-name"],
  writes: [["header"]],
  apply: (value) => ({ ir: { header: { name: String(value ?? "") } } }),
});

const idModule = mod({
  id: "q_project_id",
  provides: ["project-keyboard-id"],
  writes: [["header"]],
  apply: (value) => ({
    identity: { keyboardId: String(value ?? ""), displayName: "Display" },
    ir: { header: { keyboardId: String(value ?? "") } },
  }),
});

const copyrightModule = mod({
  id: "q_copyright",
  provides: ["copyright-holder"],
  writes: [],
  apply: (value) => ({
    attribution: { authorName: "Author", copyrightHolder: String(value ?? "") },
  }),
});

const historySeedModule = mod({
  id: "q_welcome",
  provides: ["help-welcome-paragraph"],
  writes: [],
  apply: (_value, ctx) => ({
    helpDocs: { description: "welcome", usageTips: [] },
    historyEntryState: {
      status: "proposed",
      proposal: { bullets: [`prev:${ctx.currentHistoryEntryState === null ? "none" : "set"}`] },
      editedBullets: null,
    } as never,
  }),
});

// Reads the folded history-entry state and stamps it into the IR header —
// proves a later apply sees the accumulator, not a store.
const historyReaderModule = mod({
  id: "q_history_reader",
  provides: ["help-history-entry"],
  writes: [["header"]],
  apply: (_value, ctx) => ({
    ir: {
      header: {
        name: ctx.currentHistoryEntryState === null ? "no-history" : "saw-history",
      },
    },
  }),
});

const ALL_MODULES = [nameModule, idModule, copyrightModule, historySeedModule, historyReaderModule];
const ORDER = [
  "language-name",
  "project-keyboard-id",
  "copyright-holder",
  "help-welcome-paragraph",
  "help-history-entry",
] as const;

const DECISIONS: DecisionSet = {
  "language-name": rec({ id: "language-name", value: "Testish" }),
  "project-keyboard-id": rec({ id: "project-keyboard-id", value: "testish_kb" }),
  "copyright-holder": rec({ id: "copyright-holder", value: "© 2026 Testish Org" }),
  "help-welcome-paragraph": rec({ id: "help-welcome-paragraph", value: "Welcome" }),
  "help-history-entry": rec({ id: "help-history-entry", value: "history" }),
};

describe("replayKeyboard — five-channel fold (T004)", () => {
  it("folds the ir channel through the checked merge, preserving siblings", () => {
    const out = replayKeyboard(providerFromModules(ALL_MODULES), {
      decisions: DECISIONS,
      order: [...ORDER],
      startingPointIR: baseIR(),
    });
    expect(out.state.ir.header.name).toBe("saw-history");
    expect(out.state.ir.header.keyboardId).toBe("testish_kb");
    expect(out.state.ir.header.version).toBe("1.0");
  });

  it("lands the non-IR channels in the overlay accumulator (I-1)", () => {
    const out = replayKeyboard(providerFromModules(ALL_MODULES), {
      decisions: DECISIONS,
      order: [...ORDER],
      startingPointIR: baseIR(),
    });
    expect(out.state.overlay.identity).toEqual({ keyboardId: "testish_kb", displayName: "Display" });
    expect(out.state.overlay.attribution).toEqual({
      authorName: "Author",
      copyrightHolder: "© 2026 Testish Org",
    });
    expect(out.state.overlay.helpDocs).toEqual({ description: "welcome", usageTips: [] });
    expect(out.state.overlay.historyEntryState).toMatchObject({ status: "proposed" });
  });

  it("reads currentHistoryEntryState from the accumulator folded so far", () => {
    const out = replayKeyboard(providerFromModules(ALL_MODULES), {
      decisions: DECISIONS,
      order: [...ORDER],
      startingPointIR: baseIR(),
    });
    // The welcome apply ran with NO history state folded yet ("prev:none"),
    // and the later reader apply SAW the folded state ("saw-history").
    const hes = out.state.overlay.historyEntryState as { proposal: { bullets: string[] } };
    expect(hes.proposal.bullets).toEqual(["prev:none"]);
    expect(out.state.ir.header.name).toBe("saw-history");
  });

  it("later channel writes replace earlier ones whole (last write wins)", () => {
    const second = mod({
      id: "q_copyright_2",
      provides: ["author-name"],
      writes: [],
      apply: () => ({ attribution: { authorName: "Second", copyrightHolder: "Second Holder" } }),
    });
    // author-name's module may NOT write attribution (A3: only the
    // copyright-holder provider may) — the fold must throw, not replace.
    expect(() =>
      replayKeyboard(providerFromModules([copyrightModule, second]), {
        decisions: {
          "copyright-holder": rec({ id: "copyright-holder", value: "H" }),
          "author-name": rec({ id: "author-name", value: "A" }),
        },
        order: ["copyright-holder", "author-name"],
        startingPointIR: baseIR(),
      }),
    ).toThrow(/unauthorized channel "attribution"/);
  });

  it("skips absent and inactive records and modules without apply", () => {
    const out = replayKeyboard(providerFromModules(ALL_MODULES), {
      decisions: {
        "language-name": rec({ id: "language-name", value: "Kept" }),
        "copyright-holder": rec({
          id: "copyright-holder",
          value: "Gated",
          inactive: true,
        }),
      },
      order: [...ORDER],
      startingPointIR: baseIR(),
    });
    expect(out.state.ir.header.name).toBe("Kept");
    expect(out.state.overlay.attribution).toBeUndefined();
    expect(out.applied).toEqual(["language-name"]);
  });

  it("a RawKmnFragment in the starting point passes through unchanged (FR-001)", () => {
    const ir = baseIR();
    ir.raw.push({
      nodeId: "raw#frag1",
      origin: "imported" as const,
      sourceText: "save(opaqueStore, 1)",
      reason: "save/set/reset option-store",
      sourceLine: 25,
    });
    const before = structuredClone(ir.raw);
    const out = replayKeyboard(providerFromModules(ALL_MODULES), {
      decisions: DECISIONS,
      order: [...ORDER],
      startingPointIR: ir,
    });
    expect(out.state.ir.raw).toEqual(before);
    // The starting point object itself was not mutated by the fold.
    expect(ir.header.name).toBe("base-name");
  });

  it("emits a checkpoint per order position, index 0 = starting point + empty overlay", () => {
    const start = baseIR();
    const out: ReplayOutcome = replayKeyboard(providerFromModules(ALL_MODULES), {
      decisions: DECISIONS,
      order: [...ORDER],
      startingPointIR: start,
    });
    expect(out.checkpoints).toHaveLength(ORDER.length + 1);
    expect(out.checkpoints[0]).toMatchObject({ orderIndex: 0, decisionId: null });
    expect(out.checkpoints[0]!.ir).toBe(start);
    expect(out.checkpoints[0]!.overlay).toEqual({});
    expect(out.checkpoints[ORDER.length]!.ir).toBe(out.state.ir);
    expect(out.checkpoints[ORDER.length]!.overlay).toBe(out.state.overlay);
  });
});

describe("replayKeyboard — real modules (identity/attribution/helpDocs chains)", () => {
  it("the recorded identity decisions land in the overlay and the IR header", () => {
    const modules = [ilCopyrightHolder, projectKeyboardId, pfWelcomeParagraph];
    const decisions: DecisionSet = {
      "author-name": rec({ id: "author-name", value: "Test Author", provenance: "asked" }),
      "authoring-track": rec({ id: "authoring-track", value: "copy", provenance: "asked" }),
      "copyright-holder": rec({
        id: "copyright-holder",
        value: "Test Author",
        provenance: "asked",
      }),
      "project-keyboard-id": rec({
        id: "project-keyboard-id",
        value: "testish_new",
        provenance: "asked",
      }),
      "project-display-name": rec({
        id: "project-display-name",
        value: "Testish New",
        provenance: "asked",
      }),
      "help-welcome-paragraph": rec({
        id: "help-welcome-paragraph",
        value: "Welcome to the keyboard.",
        provenance: "asked",
      }),
    };
    const out = replayKeyboard(providerFromModules(modules), {
      decisions,
      order: ["copyright-holder", "project-keyboard-id", "project-display-name", "help-welcome-paragraph"],
      startingPointIR: baseIR(),
    });
    // attribution channel (authored by the copyright module's apply,
    // composed from ctx.decisions) and identity channel (project id apply).
    expect(out.state.overlay.attribution?.copyrightHolder).toBe("Test Author");
    expect(out.state.overlay.identity?.keyboardId).toBe("testish_new");
    expect(out.state.overlay.helpDocs?.description).toBe("Welcome to the keyboard.");
  });
});

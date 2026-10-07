// Tests for spec 093 T017 — a starting-point change is a recalculation
// (owner ruling (a)): the carried-over decision set is re-evaluated
// against the NEW starting point under the provenance rule, and the
// working copy is rebuilt by a full replay over the new starting point.

import { describe, it, expect } from "vitest";
import { makeTestIR } from "@keyboard-studio/contracts/fixtures";
import type { KeyboardIR } from "@keyboard-studio/contracts";
import type { QuestionModule } from "../survey/types.ts";
import type { Decision, DecisionId, DecisionSet } from "./decisionTypes.ts";
import type { ExtractContext } from "./extractContext.ts";
import { recalculateForStartingPointChange } from "./startingPointChange.ts";
import { recalculate, type RecalculateDeps } from "./recalculate.ts";
import { providerFromModules } from "./replayKeyboard.ts";
import type { RebuildDeps } from "./rebuildWorkingCopy.ts";

const mod = (partial: Partial<QuestionModule> & { id: string }): QuestionModule => ({
  definition: { id: partial.id, type: "text", prompt: partial.id },
  fixtures: { valid: [], invalid: [] },
  ...partial,
} as QuestionModule);

const rec = (partial: Partial<Decision> & { id: DecisionId }): Decision =>
  ({ value: undefined, provenance: "asked", ...partial }) as Decision;

const CTX = { ir: null, catalog: null } as ExtractContext;

// The NEW starting point's facts, read by the modules' extract /
// lookupDefault / validate the way the real ones read the live bundle.
// The carried-over records below were decided under `old_kb`, whose
// holder was "Old Holder" and whose script default was "Arab".
const bundle = {
  kbId: "new_kb",
  holderDefault: "New Holder",
  scriptDefault: "Latn",
  rejectedHolder: "Old Holder",
};

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
  extract: () => bundle.kbId,
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
  // Validity consults the bundle (the landed validators consult
  // bundle-derived tables the same way): the old holder is not
  // acceptable under the new starting point.
  validate: (v) => ({ ok: typeof v === "string" && v.length > 0 && v !== bundle.rejectedHolder }),
  lookupDefault: () => ({ value: bundle.holderDefault, source: bundle.kbId }),
  apply: (value) => ({
    attribution: { authorName: "An Author", copyrightHolder: String(value ?? "") },
  }),
});
const scriptModule = mod({
  id: "q_script",
  provides: ["target-script"],
  lookupDefault: () => ({ value: bundle.scriptDefault }),
  apply: () => ({}),
});

const MODULES = [nameModule, kbIdModule, holderModule, scriptModule];

function deps(): RebuildDeps {
  // `source` names the NEW keyboard — re-extracted records must too.
  return { modules: MODULES, extractContext: CTX, source: "new_kb" };
}

function carriedDecisions(): DecisionSet {
  return {
    "language-name": rec({
      id: "language-name",
      value: "Test Language",
      provenance: "asked",
      source: "old_kb",
    }),
    "project-keyboard-id": rec({
      id: "project-keyboard-id",
      value: "old_kb",
      provenance: "extracted",
      source: "old_kb",
    }),
    "copyright-holder": rec({
      id: "copyright-holder",
      value: "Old Holder",
      provenance: "asked",
      source: "old_kb",
    }),
    "target-script": rec({
      id: "target-script",
      value: "Arab",
      provenance: "default",
      source: "old_kb",
    }),
  };
}

function newStartingPoint(): KeyboardIR {
  return makeTestIR({
    header: { name: "new-base", keyboardId: "new_kb", version: "1.0" },
  });
}

describe("recalculateForStartingPointChange — spec 093 T017", () => {
  it("re-extracts extracted records against the new bundle, naming the new source", () => {
    const out = recalculateForStartingPointChange(deps(), {
      decisions: carriedDecisions(),
      startingPointIR: newStartingPoint(),
    });
    const kbid = out.recalculated.decisions["project-keyboard-id"];
    expect(out.recalculated.recomputed).toContain("project-keyboard-id");
    expect(kbid?.value).toBe("new_kb");
    expect(kbid?.source).toBe("new_kb");
    // The superseding record is what the caller writes back; the prior
    // entry (value old_kb, source old_kb) stays in the log as history.
    expect(out.recordsToWrite.map((r) => r.id)).toContain("project-keyboard-id");
  });

  it("recomputes default records from the new bundle's defaults", () => {
    const out = recalculateForStartingPointChange(deps(), {
      decisions: carriedDecisions(),
      startingPointIR: newStartingPoint(),
    });
    expect(out.recalculated.recomputed).toContain("target-script");
    expect(out.recalculated.decisions["target-script"]?.value).toBe("Latn");
  });

  it("keeps a still-valid asked record whole — old source stands as history", () => {
    const start = carriedDecisions();
    const out = recalculateForStartingPointChange(deps(), {
      decisions: start,
      startingPointIR: newStartingPoint(),
    });
    // Same reference: untouched, including its old_kb source.
    expect(out.recalculated.decisions["language-name"]).toBe(start["language-name"]);
    expect(out.recalculated.reproposed).not.toContain("language-name");
  });

  it("keeps an asked record that no longer fits, flagged and re-proposed — never overwritten", () => {
    const out = recalculateForStartingPointChange(deps(), {
      decisions: carriedDecisions(),
      startingPointIR: newStartingPoint(),
    });
    const holder = out.recalculated.decisions["copyright-holder"];
    expect(out.recalculated.reproposed).toContain("copyright-holder");
    expect(holder?.value).toBe("Old Holder");
    expect(holder?.offered).toBe("New Holder");
  });

  it("rebuilds by full replay over the NEW starting point with a fresh trail", () => {
    const start = newStartingPoint();
    const out = recalculateForStartingPointChange(deps(), {
      decisions: carriedDecisions(),
      startingPointIR: start,
    });
    expect(out.replayedFromIndex).toBe(0);
    // The fresh trail is seeded on the new starting point.
    expect(out.trail[0]?.ir).toBe(start);
    expect(out.trail).toHaveLength(5); // seed + one checkpoint per decision
    // The folded state derives from the new IR + the recalculated set:
    // the kept asked name, the re-extracted id, the kept holder.
    expect(out.state.ir.header.name).toBe("Test Language");
    expect(out.state.ir.header.keyboardId).toBe("new_kb");
    expect(out.state.overlay.identity?.keyboardId).toBe("new_kb");
    expect(out.state.overlay.attribution?.copyrightHolder).toBe("Old Holder");
  });

  it("visits records outside any requires closure (visitAll): a gate flip lands", () => {
    // Neither module requires anything, so the closure of an empty
    // change set is empty — only visitAll reaches these records.
    const gatedModule = mod({ id: "q_gated", provides: ["gated-thing"], apply: () => ({}) });
    const otherModule = mod({ id: "q_other", provides: ["other-thing"], apply: () => ({}) });
    const modules = [gatedModule, otherModule];
    const decisions: DecisionSet = {
      "gated-thing": rec({ id: "gated-thing", value: "x", provenance: "asked", inactive: true }),
      "other-thing": rec({ id: "other-thing", value: "y", provenance: "asked" }),
    };
    const rdeps: RecalculateDeps = {
      providerFor: providerFromModules(modules),
      modules,
      extractContext: CTX,
      // Under the new starting point the first gate cleared and the
      // second gate closed.
      isActive: (id) => id === "gated-thing",
    };
    const order = ["gated-thing", "other-thing"] as DecisionId[];

    const widened = recalculate(rdeps, {
      decisions,
      changed: new Set<DecisionId>(),
      order,
      visitAll: true,
    });
    expect(widened.reactivated).toEqual(["gated-thing"]);
    expect(widened.decisions["gated-thing"]?.inactive).toBeUndefined();
    expect(widened.inactivated).toEqual(["other-thing"]);
    expect(widened.decisions["other-thing"]?.inactive).toBe(true);
    // Records are kept whole through both flips.
    expect(widened.decisions["other-thing"]?.value).toBe("y");

    // Control: without visitAll the active record outside the closure
    // is never visited, so its gate flip does not land.
    const control = recalculate(rdeps, {
      decisions,
      changed: new Set<DecisionId>(),
      order,
    });
    expect(control.inactivated).toEqual([]);
    expect(control.decisions["other-thing"]?.inactive).toBeUndefined();
  });
});

// applyDecisionEffects.test — spec 089 T009: the decision-apply runner
// against contracts/apply-contract.md (A1–A8).
//
// The deps harness mirrors the production sink composition in StudioShell
// (checked `ir` merge first via applyMutatePatch, then overlay channels in
// order) over plain cells, so A4's "containment first, no partial patch"
// is exercised against the real merge, not a mock of it.

import { describe, it, expect, afterEach } from "vitest";
import type { IRPath, KeyboardIR, SurveyPhaseResult } from "@keyboard-studio/contracts";
import { irPath, ARRAY_INDEX } from "@keyboard-studio/contracts";
import { makeTestIR } from "@keyboard-studio/contracts/fixtures";
import {
  applyDecisionEffects,
  recordAnswersAsDecisions,
  ApplyChannelError,
  type ReducerDeps,
} from "./reducer.ts";
import { applyMutatePatch, MutatePatchContainmentError } from "./mutateApply.ts";
import { questionRegistry } from "../survey/questions/registry.ts";
import type { QuestionModule } from "../survey/types.ts";
import type { Decision, DecisionSet } from "../decisions/decisionTypes.ts";
import type { IdentityPatch } from "../stores/workingCopyStore.ts";

interface Harness {
  deps: ReducerDeps;
  ir: () => KeyboardIR | null;
  identity: () => IdentityPatch | null;
  sinkCalls: Array<{ patch: unknown; writes: readonly IRPath[] }>;
}

function makeHarness(initialIr: KeyboardIR | null, decisions: DecisionSet = {}): Harness {
  let ir = initialIr;
  let identity: IdentityPatch | null = null;
  const sinkCalls: Harness["sinkCalls"] = [];
  const deps: ReducerDeps = {
    lockDesktop: () => {},
    clearStale: () => {},
    setTouchLayoutJson: () => {},
    instantiateFromBase: () => {},
    instantiateFromExisting: () => {},
    buildTouchLayoutJson: () => ({ json: null, warnings: [] }),
    resolveBaseTouchJson: () => undefined,
    instantiateFromBaseIfConfirmed: () => true,
    getWorkingIR: () => ir,
    setWorkingIR: (next) => {
      ir = next;
    },
    getDecisions: () => decisions,
    getHistoryEntryState: () => null,
    // The production sink composition (StudioShell), over the cells above.
    applyWorkingCopyPatch: (patch, writes) => {
      sinkCalls.push({ patch, writes });
      if (patch.ir !== undefined && ir !== null) {
        ir = applyMutatePatch(ir, patch.ir, writes);
      }
      if (patch.identity !== undefined) identity = patch.identity;
    },
  };
  return { deps, ir: () => ir, identity: () => identity, sinkCalls };
}

function result(answers: SurveyPhaseResult["answers"]): SurveyPhaseResult {
  return { phase: "B", answers };
}

/** Register a synthetic module for one test; returns the cleanup. */
function registerSynthetic(id: string, mod: Partial<QuestionModule>): () => void {
  const base = questionRegistry["il_language_code"]!;
  (questionRegistry as Record<string, QuestionModule>)[id] = {
    ...base,
    definition: { ...base.definition, id },
    fixtures: { valid: [], invalid: [] },
    ...mod,
  } as QuestionModule;
  return () => {
    delete (questionRegistry as Record<string, QuestionModule>)[id];
  };
}

describe("applyDecisionEffects — A1: runs unconditionally (no flag)", () => {
  it("applies pb_standard_letters with no env flag set anywhere", () => {
    // Deliberately NO vi.stubEnv: the pre-089 seam wrote nothing unless
    // its (since-deleted) flag was set. The runner must write regardless.
    const h = makeHarness(makeTestIR([]));
    applyDecisionEffects(
      result([{ questionId: "pb_standard_letters", answerType: "select", value: "extended-latin" }]),
      h.deps,
    );
    const store = h.ir()?.stores.find((s) => s.name === "kmStandardLetters");
    expect(store?.items).toEqual([{ kind: "raw", text: "extended-latin" }]);
    expect(h.sinkCalls).toHaveLength(1);
  });

  it("re-answering replaces the discriminator store (idempotent shape)", () => {
    const h = makeHarness(makeTestIR([]));
    const answer = (v: string) =>
      result([{ questionId: "pb_standard_letters", answerType: "select", value: v }]);
    applyDecisionEffects(answer("basic-az"), h.deps);
    applyDecisionEffects(answer("extended-latin"), h.deps);
    const stores = h.ir()?.stores.filter((s) => s.name === "kmStandardLetters") ?? [];
    expect(stores).toHaveLength(1);
    expect(stores[0]?.items).toEqual([{ kind: "raw", text: "extended-latin" }]);
  });
});

describe("applyDecisionEffects — A7: answers without an apply write nothing", () => {
  it("skips modules with no apply and unknown question ids without throwing", () => {
    const h = makeHarness(makeTestIR([]));
    applyDecisionEffects(
      result([
        { questionId: "track_choice", answerType: "select", value: "copy" },
        { questionId: "il_author_name", answerType: "text", value: "A" },
        { questionId: "not_a_question", answerType: "text", value: "x" },
      ]),
      h.deps,
    );
    expect(h.sinkCalls).toHaveLength(0);
  });

  it("is a no-op when the host injected no patch sink", () => {
    const h = makeHarness(makeTestIR([]));
    const { applyWorkingCopyPatch: _sink, ...deps } = h.deps;
    applyDecisionEffects(
      result([{ questionId: "pb_standard_letters", answerType: "select", value: "basic-az" }]),
      deps,
    );
    expect(h.ir()?.stores.find((s) => s.name === "kmStandardLetters")).toBeUndefined();
  });
});

describe("applyDecisionEffects — A3: channel authorization", () => {
  let cleanup: () => void;
  afterEach(() => cleanup?.());

  it("rejects an overlay channel from a module that does not provide its decision, applying nothing", () => {
    cleanup = registerSynthetic("synthetic_identity_thief", {
      provides: ["standard-letters"],
      writes: [],
      apply: () => ({ identity: { keyboardId: "thief" } }),
    });
    const h = makeHarness(makeTestIR([]));
    expect(() =>
      applyDecisionEffects(
        result([{ questionId: "synthetic_identity_thief", answerType: "text", value: "x" }]),
        h.deps,
      ),
    ).toThrow(ApplyChannelError);
    expect(h.sinkCalls).toHaveLength(0);
    expect(h.identity()).toBeNull();
  });

  it("rejects the ir channel from a module with empty declared writes", () => {
    cleanup = registerSynthetic("synthetic_ir_thief", {
      provides: ["standard-letters"],
      writes: [],
      apply: () => ({ ir: { stores: [] } }),
    });
    const h = makeHarness(makeTestIR([]));
    expect(() =>
      applyDecisionEffects(
        result([{ questionId: "synthetic_ir_thief", answerType: "text", value: "x" }]),
        h.deps,
      ),
    ).toThrow(ApplyChannelError);
    expect(h.sinkCalls).toHaveLength(0);
  });
});

describe("applyDecisionEffects — A4: containment first, no partial patch", () => {
  let cleanup: () => void;
  afterEach(() => cleanup?.());

  it("a patch escaping the declared writes applies NO channel, identity included", () => {
    cleanup = registerSynthetic("synthetic_escape", {
      provides: ["project-keyboard-id"],
      writes: [irPath("stores", ARRAY_INDEX)],
      apply: () => ({
        // header is outside writes: [stores[]] — the checked merge must throw.
        ir: { header: { keyboardId: "escape" } } as Partial<KeyboardIR>,
        identity: { keyboardId: "escape" },
      }),
    });
    const base = makeTestIR([]);
    const h = makeHarness(base);
    expect(() =>
      applyDecisionEffects(
        result([{ questionId: "synthetic_escape", answerType: "text", value: "escape" }]),
        h.deps,
      ),
    ).toThrow(MutatePatchContainmentError);
    // The sink ran the checked merge before the identity setter: nothing landed.
    expect(h.ir()).toBe(base);
    expect(h.identity()).toBeNull();
  });
});

describe("applyDecisionEffects — data-model §2: null IR skips only the ir channel", () => {
  let cleanup: () => void;
  afterEach(() => cleanup?.());

  it("an overlay channel still applies when no working copy exists yet", () => {
    cleanup = registerSynthetic("synthetic_identity", {
      provides: ["project-keyboard-id"],
      writes: [irPath("header", "keyboardId")],
      apply: () => ({ identity: { keyboardId: "early" } }),
    });
    const h = makeHarness(null);
    applyDecisionEffects(
      result([{ questionId: "synthetic_identity", answerType: "text", value: "early" }]),
      h.deps,
    );
    expect(h.identity()).toEqual({ keyboardId: "early" });
    expect(h.ir()).toBeNull();
  });

  it("pb_standard_letters against a null IR writes nothing and does not throw", () => {
    const h = makeHarness(null);
    applyDecisionEffects(
      result([{ questionId: "pb_standard_letters", answerType: "select", value: "basic-az" }]),
      h.deps,
    );
    expect(h.sinkCalls).toHaveLength(0);
  });
});

describe("applyDecisionEffects — A6: recording precedes applying", () => {
  let cleanup: () => void;
  afterEach(() => cleanup?.());

  it("an apply reads its own completion's just-recorded decision from ctx.decisions", () => {
    cleanup = registerSynthetic("synthetic_echo", {
      provides: ["standard-letters"],
      writes: [irPath("stores", ARRAY_INDEX)],
      apply: (_value, ctx) => ({
        ir: {
          stores: [
            ...(ctx.ir?.stores ?? []),
            {
              nodeId: "store-echo",
              name: "echo",
              items: [{ kind: "raw", text: String(ctx.decisions["standard-letters"]?.value ?? "") }],
              isSystem: false,
            },
          ],
        },
      }),
    });

    // Wire the decision-store deps to a local cell, as StudioShell does.
    let decisions: DecisionSet = {};
    const h = makeHarness(makeTestIR([]), {});
    h.deps.writeDecisionRecords = (records) => {
      const next: Partial<Record<string, Decision<unknown>>> = { ...decisions };
      for (const r of records) next[r.id] = r;
      decisions = next as DecisionSet;
    };
    h.deps.readDecisionSet = () => decisions;
    h.deps.getDecisions = () => decisions;

    const completion = result([
      { questionId: "synthetic_echo", answerType: "text", value: "just-recorded" },
    ]);
    // StepHost's order: record first, then apply.
    recordAnswersAsDecisions(completion, "characters", h.deps);
    applyDecisionEffects(completion, h.deps);

    const echo = h.ir()?.stores.find((s) => s.name === "echo");
    expect(echo?.items).toEqual([{ kind: "raw", text: "just-recorded" }]);
  });
});

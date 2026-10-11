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

describe("applyDecisionEffects — pass 2: composed apply with an unanswered question", () => {
  const cleanups: Array<() => void> = [];
  afterEach(() => {
    for (const c of cleanups.splice(0)) c();
  });

  /** A synthetic input provider + composed owner pair, in
   *  il_copyright_holder's shape: the owner provides the attribution
   *  channel's decision, requires the input decision, and composes its
   *  patch from ctx.decisions, ignoring its own value. Synthetic ids keep
   *  the real registry's own composed owner (il_copyright_holder) out of
   *  this test's blast radius. */
  function registerPair(calls: Array<{ value: unknown }>): void {
    cleanups.push(
      registerSynthetic("synthetic_author", {
        provides: ["synthetic-input"],
        requires: [],
        apply: undefined,
      }),
    );
    cleanups.push(
      registerSynthetic("synthetic_holder", {
        provides: ["copyright-holder"],
        requires: ["synthetic-input"],
        writes: [],
        apply: (value, ctx) => {
          calls.push({ value });
          const name = ctx.decisions["synthetic-input"]?.value;
          if (typeof name !== "string" || name === "") return {};
          return { attribution: { authorName: name, copyrightHolder: name } };
        },
      }),
    );
  }

  /** Decision-store deps wired to a local cell, as in the A6 test. */
  function wireDecisionCell(h: Harness, seed: DecisionSet = {}): void {
    let decisions: DecisionSet = seed;
    h.deps.writeDecisionRecords = (records) => {
      const next: Partial<Record<string, Decision<unknown>>> = { ...decisions };
      for (const r of records) next[r.id] = r;
      decisions = next as DecisionSet;
    };
    h.deps.readDecisionSet = () => decisions;
    h.deps.getDecisions = () => decisions;
  }

  it("runs the owner when the completion records its input but its own question is unanswered", () => {
    const calls: Array<{ value: unknown }> = [];
    registerPair(calls);
    const h = makeHarness(makeTestIR([]));
    wireDecisionCell(h);

    // The live identity completion's shape: the input question is
    // answered, the owner's question is left blank — so NO answer in the
    // result names the owner module at all.
    const completion = result([
      { questionId: "synthetic_author", answerType: "text", value: "Test Author" },
    ]);
    recordAnswersAsDecisions(completion, "identity", h.deps);
    applyDecisionEffects(completion, h.deps);

    expect(calls).toEqual([{ value: undefined }]);
    expect(h.sinkCalls).toHaveLength(1);
    expect(h.sinkCalls[0]?.patch).toEqual({
      attribution: { authorName: "Test Author", copyrightHolder: "Test Author" },
    });
  });

  it("does not fire at a completion that records none of its inputs, even if they were recorded earlier", () => {
    const calls: Array<{ value: unknown }> = [];
    registerPair(calls);
    const h = makeHarness(makeTestIR([]));
    // The input decision is already in the store from an EARLIER completion.
    wireDecisionCell(h, {
      "synthetic-input": {
        id: "synthetic-input",
        value: "Earlier Author",
        provenance: "asked",
        step: "identity",
      } as Decision,
    });

    const completion = result([
      { questionId: "track_choice", answerType: "select", value: "copy" },
    ]);
    recordAnswersAsDecisions(completion, "track", h.deps);
    applyDecisionEffects(completion, h.deps);

    expect(calls).toHaveLength(0);
    expect(h.sinkCalls).toHaveLength(0);
  });

  it("runs exactly once, with its own value, when its question IS answered", () => {
    const calls: Array<{ value: unknown }> = [];
    registerPair(calls);
    const h = makeHarness(makeTestIR([]));
    wireDecisionCell(h);

    const completion = result([
      { questionId: "synthetic_author", answerType: "text", value: "Test Author" },
      { questionId: "synthetic_holder", answerType: "text", value: "Some Holder" },
    ]);
    recordAnswersAsDecisions(completion, "identity", h.deps);
    applyDecisionEffects(completion, h.deps);

    expect(calls).toEqual([{ value: "Some Holder" }]);
    expect(h.sinkCalls).toHaveLength(1);
  });
});

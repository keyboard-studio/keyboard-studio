// deadkeysDefined module tests (spec 090 T033/T036): the module
// contract and the op-replay apply — deterministic over a base IR, and
// a safe no-op when replayed over an IR that already carries the ops'
// effects (the live state at completion time). The hosted editor flow
// is covered by the deadkey editor suites.

import { describe, it, expect } from "vitest";
import { makeTestIR } from "@keyboard-studio/contracts/fixtures";
import { listDeadkeys } from "@keyboard-studio/contracts";
import deadkeysDefined, { type DeadkeysDefinedValue } from "./deadkeysDefined.ts";
import { DeadkeyDecisionRenderer } from "../../deadkeys/DeadkeyDecisionRenderer.tsx";
import type { ApplyContext } from "../../types.ts";

function ctx(ir: ApplyContext["ir"], decisions: ApplyContext["decisions"] = {}): ApplyContext {
  return { ir, writes: deadkeysDefined.writes, decisions, currentHistoryEntryState: null };
}

const DEFINE_OP: DeadkeysDefinedValue = {
  ops: [{ kind: "define", triggerKey: "e", id: 0x3001, accentChar: "́" }],
};

describe("deadkeysDefined module contract", () => {
  it("provides deadkeys-defined, requires carved-layout, writes groups/stores/raw", () => {
    expect(deadkeysDefined.provides).toEqual(["deadkeys-defined"]);
    expect(deadkeysDefined.requires).toEqual(["carved-layout"]);
    expect(deadkeysDefined.writes.map((p) => p[0])).toEqual(["groups", "stores", "raw"]);
    expect(deadkeysDefined.renderer).toBe(DeadkeyDecisionRenderer);
    expect(deadkeysDefined.extract).toBeUndefined();
  });

  it("apply with no value, no IR, or an empty op log writes nothing", () => {
    const ir = makeTestIR();
    expect(deadkeysDefined.apply(undefined, ctx(ir))).toEqual({});
    expect(deadkeysDefined.apply(DEFINE_OP, ctx(null))).toEqual({});
    expect(deadkeysDefined.apply({ ops: [] }, ctx(ir))).toEqual({});
  });
});

describe("deadkeysDefined apply (op replay)", () => {
  it("replays a define op onto a base IR, deterministically", () => {
    const base = makeTestIR();
    const first = deadkeysDefined.apply(DEFINE_OP, ctx(base));
    const second = deadkeysDefined.apply(DEFINE_OP, ctx(base));
    expect(first).toEqual(second);
    expect(first.ir).toBeDefined();
    const replayed = { ...base, ...first.ir };
    expect(listDeadkeys(replayed).map((d) => d.id)).toContain(0x3001);
  });

  it("pass 2: invoked with value undefined, composes the recorded op log from ctx.decisions", () => {
    // 089's input-triggered second pass: a completion that records
    // carved-layout runs this apply with value undefined. With a
    // recorded deadkeys decision the ops replay; without one, no-op.
    const base = makeTestIR();
    const withRecord = ctx(base, {
      "deadkeys-defined": { id: "deadkeys-defined", value: DEFINE_OP, provenance: "asked" },
    });
    const patch = deadkeysDefined.apply(undefined, withRecord);
    expect(patch.ir).toBeDefined();
    const replayed = { ...base, ...patch.ir };
    expect(listDeadkeys(replayed).map((d) => d.id)).toContain(0x3001);
    expect(deadkeysDefined.apply(undefined, ctx(base))).toEqual({});
  });

  it("is a no-op over an IR that already carries the op's effect (live completion state)", () => {
    const base = makeTestIR();
    const first = deadkeysDefined.apply(DEFINE_OP, ctx(base));
    const live = { ...base, ...first.ir };
    // The define precondition (id free) no longer holds — the replay
    // skips the op with a warning and the apply writes nothing.
    expect(deadkeysDefined.apply(DEFINE_OP, ctx(live))).toEqual({});
  });
});

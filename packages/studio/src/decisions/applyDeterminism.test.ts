// applyDeterminism.test — spec 090 T009: the harness proves its own checks
// bite (a harness that cannot fail is scaffolding, not a gate): a pure
// apply passes and returns its patch; a mutating apply, a store-writing
// apply, and a store-reading (externally dependent) apply each fail with
// the named check.

import { describe, it, expect } from "vitest";
import { makeTestIR } from "@keyboard-studio/contracts/fixtures";
import { irPath } from "@keyboard-studio/contracts";
import {
  ApplyDeterminismError,
  runApplyDeterministically,
} from "./applyDeterminism.ts";
import type { ApplyContext, WorkingCopyPatch } from "../survey/types.ts";

function makeContext(): ApplyContext {
  return {
    ir: makeTestIR(),
    writes: [irPath("header", "name")],
    decisions: {
      "language-code": { id: "language-code", value: "fra", provenance: "asked" },
    },
    currentHistoryEntryState: null,
  };
}

const pureApply = (value: string | undefined, _ctx: ApplyContext): WorkingCopyPatch => ({
  ir: { header: { name: value ?? "" } } as WorkingCopyPatch["ir"],
});

describe("runApplyDeterministically", () => {
  it("passes a pure apply and returns its patch", () => {
    const patch = runApplyDeterministically({
      apply: pureApply,
      value: "Test Keyboard",
      makeContext,
      fingerprintStores: () => "stores:unchanged",
    });
    expect(patch).toEqual({ ir: { header: { name: "Test Keyboard" } } });
  });

  it("fails an apply that mutates its context", () => {
    const mutating = (_value: string | undefined, ctx: ApplyContext): WorkingCopyPatch => {
      (ctx.decisions as Record<string, unknown>)["language-code"] = undefined;
      return {};
    };
    expect(() =>
      runApplyDeterministically({ apply: mutating, value: "x", makeContext }),
    ).toThrow(ApplyDeterminismError);
  });

  it("fails an apply that writes a store (fingerprint changes)", () => {
    let storeCell = "before";
    const writing = (): WorkingCopyPatch => {
      storeCell = "after";
      return {};
    };
    expect(() =>
      runApplyDeterministically({
        apply: writing,
        value: "x",
        makeContext,
        fingerprintStores: () => storeCell,
      }),
    ).toThrow(/store fingerprint changed/);
  });

  it("fails an apply whose output depends on state outside (value, ctx)", () => {
    let counter = 0;
    const reading = (): WorkingCopyPatch => ({
      ir: { header: { name: `run-${++counter}` } } as WorkingCopyPatch["ir"],
    });
    expect(() =>
      runApplyDeterministically({ apply: reading, value: "x", makeContext }),
    ).toThrow(/different patches across runs/);
  });

  it("rethrows a non-TypeError from the apply unchanged", () => {
    const boom = new Error("boom");
    expect(() =>
      runApplyDeterministically({
        apply: () => {
          throw boom;
        },
        value: "x",
        makeContext,
      }),
    ).toThrow(boom);
  });
});

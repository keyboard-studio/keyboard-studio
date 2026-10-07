// touchLayout module tests (spec 090 T042/T044): the module
// contract, the ruled no-op apply (deterministic over the SC-005
// frozen-stores harness, pass-2 included), the overlay → value
// builder, and the spec-014 R6 store-level scenario — driven
// through the mechanisms completion path (applyPhysicalCompletion
// Effects → repropagate): suggested keys refresh on an input
// change, hand-set keys survive byte-identical, and an orphaned
// hand-set key (its desktop assignment gone) is kept in the layout
// the gallery renders from. The R2 build effects live in
// lib/assignLoopCompletion.ts (D-090-38) and are pinned there.

import { describe, it, expect, beforeEach } from "vitest";
import { makeTestIR } from "@keyboard-studio/contracts/fixtures";
import type { KeyboardIR, TouchKeyIR } from "@keyboard-studio/contracts";
import type { KeyEditOperation } from "@keyboard-studio/engine";
import touchLayout, { type TouchLayoutValue } from "./touchLayout.ts";
import { TouchDecisionRenderer } from "../../assignLoop/TouchDecisionRenderer.tsx";
import {
  currentTouchLayoutValue,
  touchLayoutValueFromSnapshot,
} from "../../assignLoop/touchLayoutValue.ts";
import { runApplyDeterministically } from "../../../decisions/applyDeterminism.ts";
import {
  bindManifest,
  useWorkingCopyStore,
} from "../../../stores/workingCopyStore.ts";
import { manifest } from "../../../steps/manifest.ts";
import { applyPhysicalCompletionEffects } from "../../../lib/assignLoopCompletion.ts";
import { touchSuggest } from "../../../editors/touchSuggest/touchSuggest.ts";
import {
  key,
  layoutWithKeys,
} from "../../../test/touchProvenance.ts";
import type { ApplyContext } from "../../types.ts";

function ctx(
  ir: ApplyContext["ir"],
  decisions: ApplyContext["decisions"] = {},
): ApplyContext {
  return { ir, writes: touchLayout.writes, decisions, currentHistoryEntryState: null };
}

const OP = { kind: "setText", keyId: "K_B", text: "ß" } as unknown as KeyEditOperation;

const VALUE: TouchLayoutValue = { ops: [OP], deletedTouchKeyIds: ["K_Q"] };

describe("touchLayout module contract", () => {
  it("provides touch-layout, requires physical-layout + touch-seed-source, writes nothing", () => {
    expect(touchLayout.provides).toEqual(["touch-layout"]);
    expect(touchLayout.requires).toEqual(["physical-layout", "touch-seed-source"]);
    expect(touchLayout.writes).toEqual([]);
    expect(touchLayout.renderer).toBe(TouchDecisionRenderer);
    expect(touchLayout.extract).toBeUndefined();
  });

  it("apply is the ruled no-op for every input (D-090-38)", () => {
    const ir = makeTestIR();
    expect(touchLayout.apply(undefined, ctx(ir))).toEqual({});
    expect(touchLayout.apply(VALUE, ctx(ir))).toEqual({});
    expect(touchLayout.apply(VALUE, ctx(null))).toEqual({});
  });

  it("apply is deterministic under the SC-005 frozen-stores harness", () => {
    const patch = runApplyDeterministically({
      apply: touchLayout.apply,
      value: VALUE,
      makeContext: () => ctx(makeTestIR()),
    });
    expect(patch).toEqual({});
  });

  it("pass 2: invoked with value undefined and physical-layout recorded, still a no-op", () => {
    // 089's second pass fires this apply when a completion records
    // physical-layout (the mechanisms completion). The build it
    // might expect belongs to the touch step's OWN completion
    // wiring, not to an apply — with no patch channel for the
    // touchLayoutJson string, the no-op is the ruling.
    const withRequires = ctx(makeTestIR(), {
      "physical-layout": {
        id: "physical-layout",
        value: { assignments: [] },
        provenance: "asked",
      },
    });
    expect(touchLayout.apply(undefined, withRequires)).toEqual({});
  });
});

describe("touchLayoutValueFromSnapshot", () => {
  it("copies both lists — later overlay appends do not leak into a recorded value", () => {
    const ops: KeyEditOperation[] = [OP];
    const deleted = new Set(["K_Q"]);
    const value = touchLayoutValueFromSnapshot(ops, deleted);
    ops.push({ kind: "setText", keyId: "K_C", text: "x" } as unknown as KeyEditOperation);
    deleted.add("K_R");
    expect(value).toEqual({ ops: [OP], deletedTouchKeyIds: ["K_Q"] });
  });

  it("deleted ids keep deletion (insertion) order", () => {
    const value = touchLayoutValueFromSnapshot([], new Set(["K_Z", "K_A", "K_M"]));
    expect(value.deletedTouchKeyIds).toEqual(["K_Z", "K_A", "K_M"]);
  });
});

describe("currentTouchLayoutValue (store level)", () => {
  beforeEach(() => {
    bindManifest(manifest);
    useWorkingCopyStore.getState().reset();
  });

  it("snapshots the live overlay and deletion set", () => {
    useWorkingCopyStore.setState({
      keyEditOverlay: { ops: [OP] },
      deletedTouchKeyIds: new Set(["K_Q"]),
    });
    expect(currentTouchLayoutValue()).toEqual({
      ops: [OP],
      deletedTouchKeyIds: ["K_Q"],
    });
  });
});

// ---------------------------------------------------------------------------
// Spec 014 R6 — the refresh / survival scenario at store level.
// A mechanisms completion (the input change) re-runs re-propagation
// over the working copy: the stale physical-suggested key is
// re-suggested from the current desktop state, the hand-set keys —
// including one whose desktop assignment no longer exists — are
// never clobbered.
// ---------------------------------------------------------------------------

describe("spec 014 R6 scenario — refresh, survival, orphan kept (store level)", () => {
  beforeEach(() => {
    bindManifest(manifest);
    useWorkingCopyStore.getState().reset();
  });

  function allKeys(ir: KeyboardIR): TouchKeyIR[] {
    const out: TouchKeyIR[] = [];
    for (const p of ir.touchLayout?.platforms ?? [])
      for (const l of p.layers) for (const r of l.rows) out.push(...r.keys);
    return out;
  }

  it("suggested keys refresh on an input change, hand-set keys survive, an orphaned hand-set key is kept and shown", () => {
    const handSet = key("K_A", "å", "hand-set");
    const orphan = key("K_Z", "ʒ", "hand-set");
    // The input change, in IR terms: the desktop side gained an
    // S-02 deadkey pattern making "ç" a successor of the C key
    // (the owned rule below, mirroring the engine scaffolder's
    // longpress fixtures). The touch layout still carries the
    // suggestion derived from the PREVIOUS desktop state — K_C
    // physical-suggested with no longpress successors yet.
    const seeded = makeTestIR({
      header: { keyboardId: "fixture", name: "Fixture", bcp47: ["en"], copyright: "(c)", targets: ["any"] },
      groups: [
        {
          nodeId: "g_main",
          name: "main",
          usingKeys: true,
          readonly: false,
          rules: [
            {
              nodeId: "rule:kc-plain",
              context: [{ kind: "vkey", name: "K_C", modifiers: [] }],
              output: [{ kind: "char", value: "c" }],
            },
            {
              nodeId: "rule:kc-deadkey",
              context: [
                { kind: "deadkey", name: "dk1" } as never,
                { kind: "vkey", name: "K_C", modifiers: [] },
              ],
              output: [{ kind: "char", value: "ç" }],
            },
          ],
        },
      ],
      recognizedPatterns: [
        {
          id: "test_s02_pattern",
          title: "Test deadkey",
          description: "Test deadkey pattern",
          category: "desktop",
          appliesTo: [],
          strategyId: "S-02",
          origin: "recognized",
          ownedNodes: [{ nodeId: "rule:kc-deadkey", kind: "rule" }],
          questions: [],
          kmnFragment: "+ [K_ACUTE] > deadkey(dk1)\n+ [dk1 K_C] > 'ç'",
          tests: [],
          validatedForFamilies: [],
          sourceKeyboards: [],
          reviewedBy: "test",
          reviewDate: "2026-06-18",
        } as unknown as KeyboardIR["recognizedPatterns"][number],
      ],
      touchLayout: layoutWithKeys([
        handSet,
        key("K_C", "c", "physical-suggested"),
        orphan,
      ]),
    });
    useWorkingCopyStore.setState({ ir: seeded });

    // The mechanisms edit re-opens touch for review, and the author
    // re-completes mechanisms (the R1 completion path).
    useWorkingCopyStore.getState().markStale("touch");
    applyPhysicalCompletionEffects();

    const next = useWorkingCopyStore.getState().ir!;
    const keys = allKeys(next);

    // Suggested refresh: K_C gained the new deadkey successor as a
    // longpress entry, exactly what the current suggestion carries.
    const suggestion = touchSuggest({ physicalIR: seeded });
    const suggestedKeys = suggestion.platforms[0]!.layers[0]!.rows.flatMap((r) => r.keys);
    const refreshedC = keys.find((k) => k.id === "K_C");
    expect(refreshedC).toBeDefined();
    expect(refreshedC!.sk?.map((s) => s.text)).toEqual(["ç"]);
    expect(refreshedC!.sk).toEqual(suggestedKeys.find((k) => k.id === "K_C")!.sk);

    // Hand-set survival: byte-identical.
    expect(keys.find((k) => k.id === "K_A")).toEqual(handSet);

    // Orphan kept and shown: the author's "ʒ" on K_Z is produced by
    // nothing in the desktop state — a from-scratch (Case A)
    // derivation over the same IR gives K_Z only the template's
    // default content — yet the hand-set key survives in the merged
    // layout with its authored content intact, in the same layout
    // object TouchGallery renders from (presence here is presence
    // on screen).
    const fromScratch = touchSuggest({
      physicalIR: { ...seeded, touchLayout: undefined },
    });
    const scratchKeys = fromScratch.platforms[0]!.layers[0]!.rows.flatMap((r) => r.keys);
    expect(scratchKeys.find((k) => k.id === "K_Z")?.text).not.toBe("ʒ");
    expect(keys.find((k) => k.id === "K_Z")).toEqual(orphan);

    // The completion also locked the desktop (R1).
    expect(useWorkingCopyStore.getState().desktopLocked).toBe(true);
  });
});

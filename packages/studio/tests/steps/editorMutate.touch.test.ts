// TOUCH_WRITES containment test (spec-014 US2 foundation / Cycle A).
//
// This cycle exports the TOUCH_WRITES IRPath set (editorMutate.ts) so the next
// cycle's repropagate.ts can route its touchSuggest-derived patch through the
// single mutate() write path. These tests prove that the containment surface
// already composes correctly with the US1 applyMutatePatch helper:
//
//   - a patch that rewrites touch keys (incl. per-key provenance) at
//     touchLayout.platforms[].layers[].rows[].keys[] PASSES the M3 containment
//     check against TOUCH_WRITES and deep-merges with siblings preserved (M2);
//   - a patch that strays outside the touch surface (e.g. into header) is
//     rejected WHOLE with the IR left unchanged (M3);
//   - re-applying the same touch patch is idempotent (M4).
//
// The re-propagation LOGIC (staleness read, touchSuggest re-run, no-clobber
// provenance gate) is deferred to US2 (T022-T024) — this only pins the seam.
//
// Source of truth:
//   specs/014-mutate-seam-touch-propagation/contracts/mutate-seam.contract.md

import { describe, it, expect } from "vitest";
import { TOUCH_WRITES } from "../../src/steps/editorMutate.ts";
import {
  applyMutatePatch,
  MutatePatchContainmentError,
} from "../../src/steps/mutateApply.ts";
import type { KeyboardIR, TouchLayoutIR } from "@keyboard-studio/contracts";

function touchLayout(): TouchLayoutIR {
  return {
    platforms: [
      {
        id: "tablet",
        layers: [
          {
            id: "default",
            rows: [
              {
                keys: [
                  { nodeId: "n1", id: "K_A", text: "a", provenance: "hand-set" },
                  { nodeId: "n2", id: "K_B", text: "b", provenance: "base-derived" },
                ],
              },
            ],
          },
        ],
      },
    ],
    nodeIds: [["tablet:default:K_A", { kind: "touchKey", nodeId: "n1" }]],
  };
}

function freshIR(): KeyboardIR {
  return {
    origin: "imported",
    header: {
      keyboardId: "kbd",
      name: "Test",
      bcp47: ["en"],
      copyright: "(c)",
      version: "1.0",
      targets: ["any"],
      storeDirectives: [],
    },
    stores: [],
    groups: [],
    comments: [],
    raw: [],
    touchLayout: touchLayout(),
    recognizedPatterns: [],
  };
}

// A patch that re-suggests the touch keys (the shape repropagate.ts will emit):
// it replaces the keys array of the one row, re-tagging the previously
// base-derived key as physical-suggested.
function repropagationPatch(): Partial<KeyboardIR> {
  return {
    touchLayout: {
      platforms: [
        {
          id: "tablet",
          layers: [
            {
              id: "default",
              rows: [
                {
                  keys: [
                    { nodeId: "n1", id: "K_A", text: "a", provenance: "hand-set" },
                    { nodeId: "n2", id: "K_B", text: "b", provenance: "physical-suggested" },
                  ],
                },
              ],
            },
          ],
        },
      ],
      nodeIds: [["tablet:default:K_A", { kind: "touchKey", nodeId: "n1" }]],
    },
  };
}

describe("TOUCH_WRITES containment (spec-014 US2 foundation)", () => {
  it("a touch-key patch passes applyMutatePatch containment against TOUCH_WRITES", () => {
    const base = freshIR();
    expect(() => applyMutatePatch(base, repropagationPatch(), TOUCH_WRITES)).not.toThrow();
  });

  it("the patch rewrites the touch keys (incl. provenance) and preserves siblings (M2)", () => {
    const base = freshIR();
    const next = applyMutatePatch(base, repropagationPatch(), TOUCH_WRITES);
    const keys = next.touchLayout?.platforms[0]?.layers[0]?.rows[0]?.keys;
    expect(keys?.[1]?.provenance).toBe("physical-suggested");
    // Sibling top-level IR untouched.
    expect(next.header).toEqual(base.header);
    expect(next.stores).toEqual(base.stores);
    expect(next.groups).toEqual(base.groups);
  });

  it("base IR is never mutated (M1)", () => {
    const base = freshIR();
    const snapshot = JSON.stringify(base);
    applyMutatePatch(base, repropagationPatch(), TOUCH_WRITES);
    expect(JSON.stringify(base)).toBe(snapshot);
  });

  it("is idempotent — applying the same patch twice equals once (M4)", () => {
    const base = freshIR();
    const once = applyMutatePatch(base, repropagationPatch(), TOUCH_WRITES);
    const twice = applyMutatePatch(once, repropagationPatch(), TOUCH_WRITES);
    expect(twice).toEqual(once);
  });

  it("rejects a patch that strays outside the touch surface (into header) — whole-patch (M3)", () => {
    const base = freshIR();
    const strayPatch = {
      ...repropagationPatch(),
      header: { ...base.header, name: "HIJACKED" },
    } as Partial<KeyboardIR>;
    expect(() => applyMutatePatch(base, strayPatch, TOUCH_WRITES)).toThrow(
      MutatePatchContainmentError,
    );
  });

  it("an empty patch is a no-op structural copy (M5)", () => {
    const base = freshIR();
    const next = applyMutatePatch(base, {}, TOUCH_WRITES);
    expect(next).toEqual(base);
    expect(next).not.toBe(base);
  });
});

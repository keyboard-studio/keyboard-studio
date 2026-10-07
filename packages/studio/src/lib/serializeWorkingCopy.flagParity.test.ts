// Touch re-propagation (spec 089 T022: single-path — the flag that used
// to gate repropagate() in the reducer is deleted, OI-1 ruled global).
//
// The emit parity for carve, add-gallery and touch inject runs in
// projectWorkingCopyVfs.flagParity.test.ts (projectWorkingCopyForOutput
// wraps that same projection and reads no flag of its own). This file
// holds the re-propagation surface: after a physical change, the reducer
// re-derives the auto-managed touch keys through the single mutate()
// write path — unconditionally.
//
// Source of truth:
//   specs/014-mutate-seam-touch-propagation/contracts/mutate-seam.contract.md (M6)

import { describe, it, expect } from "vitest";
import { makeTestIR } from "@keyboard-studio/contracts/fixtures";
import { layerAFindings } from "@keyboard-studio/contracts/fixtures";
import { emitTouchLayout } from "@keyboard-studio/engine";
import type { KeyboardIR, TouchKeyIR, LintFinding } from "@keyboard-studio/contracts";
import { repropagate, type RepropagateDeps } from "../steps/repropagate.ts";
import { VALIDATOR_ERROR_FINDING } from "../lint/validationErrorFindings.ts";

// ===========================================================================
// spec-014 Phase 5 step 1 — the touch re-propagation half of the full-spine
// proof, made single-path by spec 089 T022.
//
// Carve + add-gallery emit is pinned in
// projectWorkingCopyVfs.flagParity.test.ts. Touch re-propagation is the
// surface the deleted flag used to gate in the reducer; it now runs
// unconditionally, re-deriving the auto-managed touch keys through the
// single mutate() write path (applyMutatePatch / TOUCH_WRITES).
//
// This block models the spine's last leg — complete mechanisms → a physical
// change → touch re-suggest — and asserts:
//
//   - the re-propagated layout DIFFERS from the pre-change layout, and the
//     difference is exactly the re-suggested auto-managed keys (a
//     base-derived/physical-suggested key's provenance is re-stamped);
//   - SC-005 hand-set protection: a `hand-set` key is BYTE-IDENTICAL
//     across the physical change (R2 no-clobber).
//
// Source of truth:
//   specs/014-mutate-seam-touch-propagation/contracts/repropagation.contract.md (R1/R2/R4)
//   specs/014-mutate-seam-touch-propagation/spec.md (US2, SC-005)
// ===========================================================================

/**
 * A representative physical IR carrying a shipped touch layout with one
 * `hand-set` key (author-protected) and two auto-managed keys (one
 * physical-suggested, one base-derived). The physical groups give touchSuggest
 * a real substrate to re-derive from.
 */
function physicalIrWithTouch(): KeyboardIR {
  const ir = makeTestIR(
    [
      {
        nodeId: "g#main",
        name: "main",
        usingKeys: true,
        readonly: false,
        rules: [
          {
            nodeId: "r#a",
            context: [{ kind: "vkey", name: "K_A", modifiers: [] }],
            output: [{ kind: "char", value: "x" }],
          },
          {
            nodeId: "r#b",
            context: [{ kind: "vkey", name: "K_B", modifiers: [] }],
            output: [{ kind: "char", value: "y" }],
          },
        ],
      },
    ],
    [],
  );
  ir.touchLayout = {
    platforms: [
      {
        id: "phone",
        layers: [
          {
            id: "default",
            rows: [
              {
                keys: [
                  // Author-edited keycap — must survive the physical change.
                  { nodeId: "n_K_A", id: "K_A", text: "MINE", provenance: "hand-set" },
                  // Auto-managed keys — re-propagation may re-suggest these.
                  { nodeId: "n_K_B", id: "K_B", text: "y", provenance: "physical-suggested" },
                  { nodeId: "n_K_C", id: "K_C", text: "z", provenance: "base-derived" },
                ],
              },
            ],
          },
        ],
      },
    ],
    nodeIds: [
      ["phone:default:K_A", { kind: "touchKey", nodeId: "n_K_A" }],
      ["phone:default:K_B", { kind: "touchKey", nodeId: "n_K_B" }],
      ["phone:default:K_C", { kind: "touchKey", nodeId: "n_K_C" }],
    ],
  };
  return ir;
}

function allTouchKeys(ir: KeyboardIR): TouchKeyIR[] {
  const out: TouchKeyIR[] = [];
  for (const p of ir.touchLayout?.platforms ?? []) {
    for (const l of p.layers) for (const r of l.rows) out.push(...r.keys);
  }
  return out;
}

function findTouchKey(ir: KeyboardIR, id: string): TouchKeyIR | undefined {
  return allTouchKeys(ir).find((k) => k.id === id);
}

/**
 * Run the touch leg of the spine: repropagate() runs (the reducer invokes
 * it unconditionally since spec 089 T021). Returns the IR after the leg
 * plus the emitted .keyman-touch-layout text.
 */
function runTouchLeg(): { ir: KeyboardIR; touchText: string } {
  let cur: KeyboardIR = structuredClone(physicalIrWithTouch());
  const deps: RepropagateDeps = {
    staleSteps: new Set(["touch"]),
    getWorkingIR: () => cur,
    setWorkingIR: (next) => {
      cur = next;
    },
  };
  repropagate(deps);
  return { ir: cur, touchText: emitTouchLayout(cur.touchLayout!) };
}

describe("touch re-propagation — unconditional (US2 / SC-005)", () => {
  it("re-propagates through the seam — the touch layout DIFFERS from the pre-change layout", () => {
    const baseline = emitTouchLayout(physicalIrWithTouch().touchLayout!);
    const out = runTouchLeg();

    // SCOPE NOTE (read before assuming the downloaded .keyman-touch-layout
    // already diverges): repropagate() writes the re-derived layout into
    // the WORKING IR (the mutate() write path / OSK-preview substrate). This
    // test proves the change on the IR → emitTouchLayout(cur.touchLayout!)
    // path — i.e. what the OSK preview renders from the live IR. WIRING
    // that re-propagated touchLayout IR back into the SHIPPED side-car
    // (the projection's touchLayoutJson, which the .zip download emits
    // verbatim) remains deferred: the add-gallery/full-spine projection
    // still returns the injected side-car byte-identical (proved in
    // projectWorkingCopyVfs.flagParity.test.ts). So the DOWNLOADED artifact
    // does NOT diverge — only the working IR / preview does. Do not read
    // this `not.toBe` as a claim about the downloaded .keyman-touch-layout.
    expect(out.touchText).not.toBe(baseline);

    // And the change is exactly the auto-managed re-suggestion: the
    // physical-suggested key was re-stamped by touchSuggest (it is now
    // carried as base-derived from the re-derived layout), while the
    // pre-change layout keeps the original physical-suggested tag.
    expect(findTouchKey(physicalIrWithTouch(), "K_B")?.provenance).toBe("physical-suggested");
    expect(findTouchKey(out.ir, "K_B")?.provenance).toBe("base-derived");
  });

  it("SC-005 — the hand-set key is byte-identical across the physical change", () => {
    const before = findTouchKey(physicalIrWithTouch(), "K_A");
    const after = findTouchKey(runTouchLeg().ir, "K_A");

    // Re-propagation's no-clobber rule (R2) protects it: byte-identical
    // to the original.
    expect(after).toEqual(before);
    // Explicitly: text + provenance unchanged.
    expect(after?.text).toBe("MINE");
    expect(after?.provenance).toBe("hand-set");
  });

  // Hardening pass #5 — oracle-down degraded path is warning-only. When
  // the WASM oracle is unavailable (or the TS validator pass throws), the
  // studio appends KM_WARN_ORACLE_UNAVAILABLE / KM_WARN_VALIDATOR_ERROR
  // rather than blocking. Assert both findings are severity "warning"
  // (hence non-blocking under the dashboard's blocking predicate).
  // isBlockingFinding is private to completeness.ts, so its rule is
  // replicated here (origin !== "upstream" && severity in {error,fatal}).
  it("the degraded-validator findings are warning-only and non-blocking", () => {
    const oracleUnavailable = layerAFindings.find(
      (f) => f.code === "KM_WARN_ORACLE_UNAVAILABLE",
    );
    expect(oracleUnavailable).toBeDefined();

    const isBlocking = (f: LintFinding): boolean =>
      f.origin !== "upstream" && (f.severity === "error" || f.severity === "fatal");

    expect(VALIDATOR_ERROR_FINDING.severity).toBe("warning");
    expect(isBlocking(VALIDATOR_ERROR_FINDING)).toBe(false);
    expect(oracleUnavailable!.severity).toBe("warning");
    expect(isBlocking(oracleUnavailable!)).toBe(false);
  });
});

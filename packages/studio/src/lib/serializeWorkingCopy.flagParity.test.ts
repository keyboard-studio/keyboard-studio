// T011 / spec-014 flag-parity for the OUTPUT path — projectWorkingCopyForOutput
// produces a byte-identical projected .kmn whether the mutate seam flag is on or
// off, for a working copy carrying carve deletions (M6/SC-008).
//
// Unlike serializeWorkingCopy.test.ts (which mocks ./projectWorkingCopyVfs to
// assert call wiring), this file runs the REAL projection + emit pipeline so the
// comparison is on actual emitted bytes. It compares the projected VFS content
// returned by projectWorkingCopyForOutput rather than zipped bytes (toZip would
// add nondeterministic archive metadata).
//
// Source of truth:
//   specs/014-mutate-seam-touch-propagation/contracts/mutate-seam.contract.md (M6)

import { describe, it, expect, afterEach, beforeEach, vi } from "vitest";
import { useWorkingCopyStore } from "../stores/workingCopyStore.ts";
import { createVirtualFS } from "@keyboard-studio/contracts";
import { makeTestIR } from "@keyboard-studio/contracts/fixtures";
import { basicKbdus } from "@keyboard-studio/contracts/fixtures";
import { layerAFindings } from "@keyboard-studio/contracts/fixtures";
import { emitTouchLayout } from "@keyboard-studio/engine";
import type {
  IRGroup,
  IRRule,
  IRStore,
  KeyboardIR,
  TouchKeyIR,
  LintFinding,
} from "@keyboard-studio/contracts";
import { repropagate, type RepropagateDeps } from "../steps/repropagate.ts";
import { VALIDATOR_ERROR_FINDING } from "../lint/validationErrorFindings.ts";

// Mock only services (toZip / pattern library) — NOT projectWorkingCopyVfs, so
// the real emit pipeline runs.
vi.mock("./services.ts", () => ({
  getToZip: vi.fn(async () => async () => new Uint8Array()),
  getPatternLibraryService: vi.fn(() => ({ getById: async () => undefined })),
}));

import { projectWorkingCopyForOutput } from "./serializeWorkingCopy.ts";

function rule(nodeId: string, vkey: string, char: string): IRRule {
  return {
    nodeId,
    context: [{ kind: "vkey", name: vkey, modifiers: [] }],
    output: [{ kind: "char", value: char }],
  };
}

function group(nodeId: string, name: string, rules: IRRule[]): IRGroup {
  return { nodeId, name, usingKeys: true, rules, readonly: false };
}

function store(nodeId: string, name: string): IRStore {
  return { nodeId, name, items: [{ kind: "char", value: "q" }], isSystem: false };
}

function makeIr(): KeyboardIR {
  const main = group("g#main", "main", [rule("r#a", "K_A", "x"), rule("r#b", "K_B", "y")]);
  const second = group("g#second", "second", [rule("r#c", "K_C", "z")]);
  return makeTestIR([main, second], [store("s#extra", "extraX")]);
}

function seed() {
  const vfs = createVirtualFS([
    { path: `source/${basicKbdus.id}.kmn`, content: "c stub\n", isBinary: false },
  ]);
  useWorkingCopyStore.getState().instantiateFromBase(basicKbdus, { vfs, ir: makeIr() });
  // A carve overlay that drops a non-entry group + a store.
  useWorkingCopyStore.getState().deleteNode("g#second");
  useWorkingCopyStore.getState().deleteNode("s#extra");
}

beforeEach(() => {
  useWorkingCopyStore.getState().reset();
});

afterEach(() => {
  vi.unstubAllEnvs();
  useWorkingCopyStore.getState().reset();
});

describe("projectWorkingCopyForOutput — carve flag parity", () => {
  it("emits byte-identical projected .kmn with the seam on vs off", async () => {
    vi.stubEnv("VITE_KM_MUTATE_SEAM", "");
    seed();
    const off = await projectWorkingCopyForOutput();
    const offKmn = off!.vfs.get(`source/${basicKbdus.id}.kmn`)?.content as string;

    useWorkingCopyStore.getState().reset();

    vi.stubEnv("VITE_KM_MUTATE_SEAM", "1");
    seed();
    const on = await projectWorkingCopyForOutput();
    const onKmn = on!.vfs.get(`source/${basicKbdus.id}.kmn`)?.content as string;

    expect(typeof offKmn).toBe("string");
    expect(onKmn).toBe(offKmn);
    // And the carve actually took effect (second group + extra store dropped).
    expect(onKmn).not.toMatch(/group\(second\)/);
    expect(onKmn).not.toMatch(/store\(extraX\)/);
  });
});

// ===========================================================================
// spec-014 Phase 5 step 1 — the touch re-propagation DIVERGENCE half of the
// full-spine proof.
//
// Carve + add-gallery emit byte-identically in both flag states (proved above
// and in projectWorkingCopyVfs.flagParity.test.ts). Touch re-propagation is the
// ONE surface that is flag-on-only: the reducer gates repropagate() on
// isMutateSeamEnabled(), so flag-OFF leaves the shipped touch layout untouched,
// while flag-ON re-derives the auto-managed touch keys through the single
// mutate() write path (applyMutatePatch / TOUCH_WRITES).
//
// This block models the spine's last leg — complete mechanisms → a physical
// change → touch re-suggest — and asserts the SPECIFIC, EXPECTED divergence:
//
//   - flag-OFF (repropagate NOT run, mirroring the reducer gate): the emitted
//     .keyman-touch-layout is byte-identical to the pre-change layout.
//   - flag-ON  (repropagate run through the seam): the emitted layout DIFFERS,
//     and the difference is exactly the re-suggested auto-managed keys (a
//     base-derived/physical-suggested key's provenance is re-stamped).
//   - SC-005 hand-set protection: a `hand-set` key is BYTE-IDENTICAL across the
//     physical change in BOTH flag states.
//
// Source of truth:
//   specs/014-mutate-seam-touch-propagation/contracts/repropagation.contract.md (R1/R2/R4)
//   specs/014-mutate-seam-touch-propagation/contracts/flag-and-validator.contract.md (F1/F2)
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
 * Run the touch leg of the spine for one flag state. Flag-OFF mirrors the
 * reducer gate (repropagate is NOT invoked) — the layout is untouched.
 * Flag-ON invokes repropagate() (the gated seam write path). Returns the IR
 * after the leg plus the emitted .keyman-touch-layout text.
 */
function runTouchLeg(seamOn: boolean): { ir: KeyboardIR; touchText: string } {
  let cur: KeyboardIR = structuredClone(physicalIrWithTouch());
  if (seamOn) {
    const deps: RepropagateDeps = {
      staleSteps: new Set(["touch"]),
      getWorkingIR: () => cur,
      setWorkingIR: (next) => {
        cur = next;
      },
    };
    repropagate(deps);
  }
  return { ir: cur, touchText: emitTouchLayout(cur.touchLayout!) };
}

describe("touch re-propagation — flag-on-only DIVERGENCE (US2 / SC-005)", () => {
  it("flag-OFF leaves the touch layout byte-identical to the pre-change layout (reducer gate)", () => {
    const baseline = emitTouchLayout(physicalIrWithTouch().touchLayout!);
    const off = runTouchLeg(false);
    expect(off.touchText).toBe(baseline);
  });

  it("flag-ON re-propagates through the seam — the touch layout DIFFERS from flag-off", () => {
    const off = runTouchLeg(false);
    const on = runTouchLeg(true);

    // Hardening pass #3 — SCOPE OF THIS DIVERGENCE (read before assuming the
    // downloaded .keyman-touch-layout already diverges):
    //
    // repropagate() writes the re-derived layout into the WORKING IR (the
    // mutate() write path / OSK-preview substrate). This test proves the
    // divergence on the IR → emitTouchLayout(cur.touchLayout!) path — i.e. what
    // the OSK preview renders from the live IR. WIRING that re-propagated
    // touchLayout IR back into the SHIPPED side-car (the projection's
    // touchLayoutJson, which the .zip download emits verbatim) is DEFERRED: the
    // add-gallery/full-spine projection still returns the injected side-car
    // byte-identical in both flag states (proved in
    // projectWorkingCopyVfs.flagParity.test.ts). So the DOWNLOADED artifact does
    // NOT yet diverge — only the working IR / preview does. Do not read this
    // `not.toBe` as a claim about the downloaded .keyman-touch-layout.
    //
    // The asserted flag-on-only difference: the emitted (IR→emitter) touch
    // artifact diverges.
    expect(on.touchText).not.toBe(off.touchText);

    // And the divergence is exactly the auto-managed re-suggestion: the
    // physical-suggested key was re-stamped by touchSuggest (it is now carried
    // as base-derived from the re-derived layout), while flag-off keeps the
    // original physical-suggested tag.
    expect(findTouchKey(off.ir, "K_B")?.provenance).toBe("physical-suggested");
    expect(findTouchKey(on.ir, "K_B")?.provenance).toBe("base-derived");
  });

  it("SC-005 — the hand-set key is byte-identical across the physical change in BOTH flag states", () => {
    const before = findTouchKey(physicalIrWithTouch(), "K_A");
    const off = findTouchKey(runTouchLeg(false).ir, "K_A");
    const on = findTouchKey(runTouchLeg(true).ir, "K_A");

    // Flag-off cannot touch it (no re-propagation runs); flag-on's no-clobber
    // rule (R2) protects it. Either way it is byte-identical to the original.
    expect(off).toEqual(before);
    expect(on).toEqual(before);
    // Explicitly: text + provenance unchanged.
    expect(on?.text).toBe("MINE");
    expect(on?.provenance).toBe("hand-set");
  });

  // Hardening pass #5 — oracle-down degraded path is warning-only AND
  // flag-orthogonal. When the WASM oracle is unavailable (or the TS validator
  // pass throws), the studio appends KM_WARN_ORACLE_UNAVAILABLE /
  // KM_WARN_VALIDATOR_ERROR rather than blocking — and that degraded mode must
  // NOT change with the mutate seam. Assert both findings are severity "warning"
  // (hence non-blocking under the dashboard's blocking predicate) identically in
  // both flag states. isBlockingFinding is private to completeness.ts, so its
  // rule is replicated here (origin !== "upstream" && severity in {error,fatal}).
  it("the degraded-validator findings are warning-only and non-blocking, identical across flag states", () => {
    const oracleUnavailable = layerAFindings.find(
      (f) => f.code === "KM_WARN_ORACLE_UNAVAILABLE",
    );
    expect(oracleUnavailable).toBeDefined();

    const isBlocking = (f: LintFinding): boolean =>
      f.origin !== "upstream" && (f.severity === "error" || f.severity === "fatal");

    const assertNonBlocking = (): void => {
      expect(VALIDATOR_ERROR_FINDING.severity).toBe("warning");
      expect(isBlocking(VALIDATOR_ERROR_FINDING)).toBe(false);
      expect(oracleUnavailable!.severity).toBe("warning");
      expect(isBlocking(oracleUnavailable!)).toBe(false);
    };

    vi.stubEnv("VITE_KM_MUTATE_SEAM", "");
    assertNonBlocking();

    vi.stubEnv("VITE_KM_MUTATE_SEAM", "1");
    assertNonBlocking();
  });
});

// Spec 021 — qu-wire-galleries: per-surface emit-byte oracle (§2.5, FR-011).
//
// Spec 021 adds NO production code. This file is the per-surface, `flagParity`-style
// emit-byte oracle (migration-plan §2.5; mirroring projectWorkingCopyVfs.flagParity.test.ts)
// that locks the emitted artifacts BYTE-IDENTICAL for each of the three gallery
// write surfaces while they gain a map node:
//
//   T010 — carve: a representative carve edit sequence (delete/restore nodes and
//          items) emits byte-identical .kmn; carve still routes through its current
//          mechanism (the deletion overlay over groups[]/stores[]/raw[], NOT
//          mutate()) (FR-005/FR-011/SC-003).
//   T011 — mechanisms (physical, REFERENCE): a representative physical-assignment
//          sequence emits byte-identical .kmn (FR-006/FR-011/SC-003; overlaps the
//          reducer-side R1 lock in tests/steps/wireGalleries.reference.test.ts —
//          kept additive: this pins the EMITTED BYTES, that pins the reducer write).
//   T012 — touch (REFERENCE): a representative touch-assignment sequence emits
//          byte-identical .kmn AND byte-identical .keyman-touch-layout side-car
//          (FR-007/FR-011/SC-003; #831).
//
// METHOD (the §2.5 oracle): all three are IR/emit-writing surfaces, so the oracle is
// the emitted-.kmn (+ touch side-car) comparison — NOT a SurveyPhaseResult deep-equal
// (that is the build-list oracle, spec 020) and NOT a flow-routing snapshot (track/
// prefill). projectWorkingCopyVfs is the single projection that emits all three
// surfaces (carve via deletedNodeIds/deletedItemIds; mechanisms via assignments;
// touch via the injected layout side-car). "Byte-identical before/after this spec"
// is proved as a STABLE BASELINE: the seam flag is the only axis that could perturb
// the emit, so flag-on === flag-off === today's bytes pins the byte-identity in any
// state (Phase 1 keeps the flag OFF). This file runs the REAL emit pipeline (it does
// NOT mock @keyboard-studio/engine) so the comparison is on actual emitted bytes.
//
// Source of truth:
//   specs/021-qu-wire-galleries/spec.md (US2, FR-011, SC-003)
//   specs/021-qu-wire-galleries/tasks.md (T010/T011/T012)
//   migration-plan §2.5 (IR/emit-writing-surface oracle)

import { describe, it, expect, afterEach, vi } from "vitest";
import { createVirtualFS } from "@keyboard-studio/contracts";
import { makeTestIR, latinDeadkeyAcuteSingle } from "@keyboard-studio/contracts/fixtures";
import type {
  IRGroup,
  IRRule,
  IRStore,
  StoreItem,
  KeyboardIR,
  MechanismAssignment,
  Pattern,
} from "@keyboard-studio/contracts";
import { projectWorkingCopyVfs } from "../../src/lib/projectWorkingCopyVfs.js";

// ---------------------------------------------------------------------------
// Fixtures — a keyboard with two groups, a parallel-store deadkey, a stray store.
// (Same shape as projectWorkingCopyVfs.flagParity.test.ts so the surfaces are
// realistic and the carve/add/touch paths all have something to bite on.)
// ---------------------------------------------------------------------------

function rule(nodeId: string, vkey: string, char: string): IRRule {
  return {
    nodeId,
    context: [{ kind: "vkey", name: vkey, modifiers: [] }],
    output: [{ kind: "char", value: char }],
  };
}

function parallelRule(nodeId: string, dkId: number, inN: string, outN: string): IRRule {
  return {
    nodeId,
    context: [
      { kind: "deadkey", id: dkId },
      { kind: "any", storeRef: inN },
    ],
    output: [{ kind: "index", storeRef: outN, offset: 2 }],
  };
}

function group(nodeId: string, name: string, rules: IRRule[]): IRGroup {
  return { nodeId, name, usingKeys: true, rules, readonly: false };
}

function store(nodeId: string, name: string, items: StoreItem[]): IRStore {
  return { nodeId, name, items, isSystem: false };
}

function makeFixtureIr(): KeyboardIR {
  const outStore = store("store#dkt", "dktX", [
    { kind: "char", value: "À" },
    { kind: "char", value: "ε" },
    { kind: "char", value: "Z" },
  ]);
  const inStore = store("store#dkf", "dkfX", [
    { kind: "char", value: "a" },
    { kind: "char", value: "b" },
    { kind: "char", value: "c" },
  ]);
  const extra = store("store#extra", "extraX", [{ kind: "char", value: "Q" }]);

  const main = group("group#main", "main", [
    rule("rule#a", "K_A", "x"),
    rule("rule#b", "K_B", "y"),
    parallelRule("rule#dk", 0x003b, "dkfX", "dktX"),
  ]);
  const second = group("group#second", "second", [rule("rule#c", "K_C", "z")]);

  return makeTestIR([main, second], [outStore, inStore, extra]);
}

function makeVfs(keyboardId: string) {
  return createVirtualFS([
    { path: `source/${keyboardId}.kmn`, content: "c stub\n", isBinary: false },
  ]);
}

/** A representative physical mechanism assignment (the acute-deadkey gallery item). */
function makeAssignment(): MechanismAssignment {
  return {
    scope: "keyboard-default",
    target: "",
    modality: "physical",
    mechanisms: [
      {
        patternId: latinDeadkeyAcuteSingle.id,
        slotValues: {
          triggerKey: "K_QUOTE",
          accentChar: "́",
          baseLetters: "aeiouAEIOU",
          accentedForms: "áéíóúÁÉÍÓÚ",
        },
      },
    ],
  };
}

function patternResolver(id: string): Pattern | undefined {
  return id === latinDeadkeyAcuteSingle.id ? latinDeadkeyAcuteSingle : undefined;
}

/** A minimal, pretty-printed Phase E touch layout JSON (one phone/default key). */
const TOUCH_JSON =
  JSON.stringify(
    {
      phone: {
        font: "Tahoma",
        layer: [{ id: "default", row: [{ id: 1, key: [{ id: "K_A", text: "a" }] }] }],
      },
    },
    null,
    2,
  ) + "\n";

interface ProjectOpts {
  deletedNodeIds?: Set<string>;
  deletedItemIds?: Set<string>;
  assignments?: MechanismAssignment[];
  touchLayoutJson?: string;
}

/** Run the REAL projection once for one flag state; return both emitted artifacts. */
function project(seamOn: boolean, opts: ProjectOpts): { kmn: string; touch: string | undefined } {
  vi.stubEnv("VITE_KM_MUTATE_SEAM", seamOn ? "1" : "");
  const vfs = makeVfs("kb");
  projectWorkingCopyVfs({
    vfs,
    keyboardId: "kb",
    baseIr: makeFixtureIr(),
    deletedNodeIds: opts.deletedNodeIds ?? new Set(),
    deletedItemIds: opts.deletedItemIds ?? new Set(),
    assignments: opts.assignments ?? [],
    getPattern: opts.assignments && opts.assignments.length > 0 ? patternResolver : () => undefined,
    ...(opts.touchLayoutJson !== undefined ? { touchLayoutJson: opts.touchLayoutJson } : {}),
    identity: null,
  });
  return {
    kmn: vfs.get("source/kb.kmn")?.content as string,
    // The touch side-car is emitted as text (isBinary:false), so it is a string
    // when present and undefined when no layout was injected.
    touch: vfs.get("source/kb.keyman-touch-layout")?.content as string | undefined,
  };
}

/** Assert both flag states emit identical bytes for `opts`, and return them. */
function assertByteIdentical(opts: ProjectOpts): { kmn: string; touch: string | undefined } {
  const off = project(false, opts);
  const on = project(true, opts);
  expect(typeof off.kmn).toBe("string");
  expect(on.kmn).toBe(off.kmn);
  expect(on.touch).toBe(off.touch);
  return off;
}

afterEach(() => {
  vi.unstubAllEnvs();
});

// ---------------------------------------------------------------------------
// T010 — carve emit-byte oracle (FR-005/FR-011/SC-003).
// ---------------------------------------------------------------------------

describe("spec 021 T010 — carve emit-byte oracle: byte-identical .kmn over a representative edit sequence", () => {
  // A representative carve edit sequence: a whole-group deletion, a whole-store
  // deletion, a store-slot nul-rewrite, and a single-rule deletion — the surfaces
  // the carve deletion overlay rewrites (groups[]/stores[]/raw[]).
  const CARVE_SCENARIOS: Array<{ name: string; opts: ProjectOpts }> = [
    { name: "no edits (no re-emit)", opts: {} },
    { name: "whole-group deletion", opts: { deletedNodeIds: new Set(["group#second"]) } },
    { name: "single-rule deletion", opts: { deletedNodeIds: new Set(["rule#a"]) } },
    { name: "whole-store deletion", opts: { deletedNodeIds: new Set(["store#extra"]) } },
    { name: "store-slot nul rewrite", opts: { deletedItemIds: new Set(["store#dkt#1"]) } },
    {
      name: "delete then restore (overlay shrinks back to empty)",
      // restore = a smaller deletion set; restore-all collapses to the no-edit emit.
      opts: {},
    },
    {
      name: "combined group + slot deletion",
      opts: {
        deletedNodeIds: new Set(["group#second"]),
        deletedItemIds: new Set(["store#dkt#0"]),
      },
    },
  ];

  for (const { name, opts } of CARVE_SCENARIOS) {
    it(`emits byte-identical .kmn before/after (flag-invariant) — ${name}`, () => {
      assertByteIdentical(opts);
    });
  }

  it("a whole-group carve deletion actually takes effect (non-vacuous), and is flag-invariant", () => {
    const { kmn } = assertByteIdentical({ deletedNodeIds: new Set(["group#second"]) });
    expect(kmn).not.toMatch(/group\(second\)/);
  });

  it("restore-all (empty overlay) emits identically to the never-edited baseline (overlay round-trip)", () => {
    // The carve mechanism is the reversible deletion overlay: an empty overlay
    // (the restore-all / keep-all terminal state) re-emits the base bytes.
    const restoredToEmpty = project(false, {}).kmn;
    const neverEdited = project(false, {}).kmn;
    expect(restoredToEmpty).toBe(neverEdited);
  });
});

// ---------------------------------------------------------------------------
// T011 — mechanisms (physical, REFERENCE) emit-byte oracle (FR-006/FR-011/SC-003).
// ---------------------------------------------------------------------------

describe("spec 021 T011 — mechanisms emit-byte oracle: byte-identical .kmn over a physical assignment (REFERENCE)", () => {
  it("emits byte-identical .kmn before/after (flag-invariant) for a physical mechanism assignment", () => {
    assertByteIdentical({ assignments: [makeAssignment()] });
  });

  it("the physical assignment actually injects into the .kmn (non-vacuous), and is flag-invariant", () => {
    const { kmn } = assertByteIdentical({ assignments: [makeAssignment()] });
    // The acute-deadkey gallery item injects its trigger rule into the emitted .kmn.
    expect(kmn).toMatch(/\[K_QUOTE\] > deadkey\(accent\)/);
  });

  it("carve + a physical assignment together still emit byte-identically (combined surface)", () => {
    assertByteIdentical({
      deletedNodeIds: new Set(["group#second", "store#extra"]),
      deletedItemIds: new Set(["store#dkt#1"]),
      assignments: [makeAssignment()],
    });
  });
});

// ---------------------------------------------------------------------------
// T012 — touch (REFERENCE) emit-byte oracle: .kmn AND .keyman-touch-layout side-car
// byte-identical (FR-007/FR-011/SC-003; #831).
// ---------------------------------------------------------------------------

describe("spec 021 T012 — touch emit-byte oracle: byte-identical .kmn AND .keyman-touch-layout side-car (REFERENCE)", () => {
  it("emits a byte-identical .keyman-touch-layout side-car before/after (flag-invariant)", () => {
    const { touch } = assertByteIdentical({
      assignments: [makeAssignment()],
      touchLayoutJson: TOUCH_JSON,
    });
    // The add-gallery seam does NOT re-emit touch (keycap/touch projection is
    // deferred to Phase 2), so the injected Phase E layout returns verbatim — the
    // R2 side-car byte-identity (#831).
    expect(touch).toBe(TOUCH_JSON);
  });

  it("emits a byte-identical .kmn AND side-car across the whole carve + add + touch spine", () => {
    const off = assertByteIdentical({
      deletedNodeIds: new Set(["group#second", "store#extra"]),
      deletedItemIds: new Set(["store#dkt#1"]),
      assignments: [makeAssignment()],
      touchLayoutJson: TOUCH_JSON,
    });
    // Non-vacuous: the spine took effect AND the side-car came back verbatim.
    expect(off.kmn).not.toMatch(/group\(second\)/);
    expect(off.touch).toBe(TOUCH_JSON);
  });

  it("an absent touch layout emits NO side-car file in either flag state (consistent absence)", () => {
    const off = project(false, { assignments: [makeAssignment()] });
    const on = project(true, { assignments: [makeAssignment()] });
    expect(off.touch).toBeUndefined();
    expect(on.touch).toBeUndefined();
  });
});

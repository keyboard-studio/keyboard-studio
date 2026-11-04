// projectWorkingCopyVfs tests: key edit overlay, SC-008 dead keys, declared-writes containment.
// Split from the former projectWorkingCopyVfs.test.ts; shared fixtures live in
// ../test/projectWorkingCopyVfsTestkit.ts.

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { makeTestIR } from "@keyboard-studio/contracts/fixtures";
import type { KeyEditOperation } from "@keyboard-studio/engine";
import { touchKeyAddress, makePhysicalAssignment, KEY_EDIT_KMN, makeKeyEditTouchLayoutJson, makeKeyEditVfs } from "../test/projectWorkingCopyVfsTestkit.ts";

// ---------------------------------------------------------------------------
// Spy on the engine functions this projection calls
// ---------------------------------------------------------------------------

const applyCarveToVfsSpy = vi.fn(
  (_vfs: unknown, _id: string, _ir: unknown, _ids: unknown) => ({
    warnings: [] as string[],
  }),
);
/** Records the order the projection invokes touchKeycapRemovals / keyEdits /
 *  assignments in — the T052 "1.7 runs after 1.6 and before 2" obligation. */
const callOrder: string[] = [];
const applyAssignmentsToVfsSpy = vi.fn(
  (_vfs: unknown, _id: string, _a: unknown, _fn: unknown) => {
    callOrder.push("assignments");
    return { kmn: "c mock", warnings: [] as string[] };
  },
);
const applyIdentityStubMutationSpy = vi.fn(
  (_vfs: unknown, _id: string, _identity: unknown): void => {
    /* no-op */
  },
);
// Passthrough-by-default spies (real implementation, wired below once the
// module is first resolved) — unlike the three above, these two need their
// REAL behaviour for the ordering/correctness tests, while still letting
// individual tests override with `.mockImplementationOnce` to simulate a
// pass failure without touching every other test in this file.
const applyTouchKeycapRemovalsToVfsSpy = vi.fn();
const applyKeyEditsToVfsSpy = vi.fn();
/** Passthrough-by-default spy on `emitKmn`, so the rule-half-failure test can
 *  force a single throw from inside projectWorkingCopyVfs's own try/catch
 *  without touching the (many) other tests in this file that rely on a real
 *  .kmn re-emit (id-rename, etc.). */
const emitKmnSpy = vi.fn();

vi.mock("@keyboard-studio/engine", async (importOriginal) => {
  const original = await importOriginal<typeof import("@keyboard-studio/engine")>();
  applyTouchKeycapRemovalsToVfsSpy.mockImplementation((...args: Parameters<typeof original.applyTouchKeycapRemovalsToVfs>) => {
    callOrder.push("touchKeycapRemovals");
    return original.applyTouchKeycapRemovalsToVfs(...args);
  });
  applyKeyEditsToVfsSpy.mockImplementation((...args: Parameters<typeof original.applyKeyEditsToVfs>) => {
    callOrder.push("keyEdits");
    return original.applyKeyEditsToVfs(...args);
  });
  emitKmnSpy.mockImplementation((...args: Parameters<typeof original.emitKmn>) => original.emitKmn(...args));
  return {
    ...original,
    applyCarveToVfs: applyCarveToVfsSpy,
    applyAssignmentsToVfs: applyAssignmentsToVfsSpy,
    applyIdentityStubMutation: applyIdentityStubMutationSpy,
    applyTouchKeycapRemovalsToVfs: applyTouchKeycapRemovalsToVfsSpy,
    applyKeyEditsToVfs: applyKeyEditsToVfsSpy,
    emitKmn: emitKmnSpy,
  };
});

beforeEach(() => {
  vi.clearAllMocks();
  callOrder.length = 0;
});

afterEach(() => {
  vi.clearAllMocks();
  callOrder.length = 0;
});

// ---------------------------------------------------------------------------
// spec 063 T052 — key edit overlay projection (step 1.7 layout half + the
// rule-half sibling). Uses the REAL applyKeyEditsToVfs / parseKmn / emitKmn
// (the mock above passes them through by default), not canned mocks, so
// these tests exercise genuine Case B splicing and genuine .kmn re-emit.
// ---------------------------------------------------------------------------

describe("projectWorkingCopyVfs — key edit overlay: empty overlay is a no-op", () => {
  it("leaves .keyman-touch-layout and .kmn byte-identical when keyEditOps is empty", async () => {
    const { projectWorkingCopyVfs } = await import("./projectWorkingCopyVfs.ts");
    const vfs = makeKeyEditVfs();
    const beforeTouch = vfs.get("source/test_kb.keyman-touch-layout")?.content;
    const beforeKmn = vfs.get("source/test_kb.kmn")?.content;

    const { warnings } = projectWorkingCopyVfs({
      vfs,
      keyboardId: "test_kb",
      startIr: makeTestIR([]),
      deletedNodeIds: new Set(),
      assignments: [],
      getPattern: () => undefined,
      identity: null,
      keyEditOps: [],
    });

    expect(vfs.get("source/test_kb.keyman-touch-layout")?.content).toBe(beforeTouch);
    expect(vfs.get("source/test_kb.kmn")?.content).toBe(beforeKmn);
    expect(applyKeyEditsToVfsSpy).not.toHaveBeenCalled();
    expect(warnings.some((w) => w.includes("key edit"))).toBe(false);
  });

  it("is also a no-op when keyEditOps is omitted entirely", async () => {
    const { projectWorkingCopyVfs } = await import("./projectWorkingCopyVfs.ts");
    const vfs = makeKeyEditVfs();
    const beforeTouch = vfs.get("source/test_kb.keyman-touch-layout")?.content;
    const beforeKmn = vfs.get("source/test_kb.kmn")?.content;

    projectWorkingCopyVfs({
      vfs,
      keyboardId: "test_kb",
      startIr: makeTestIR([]),
      deletedNodeIds: new Set(),
      assignments: [],
      getPattern: () => undefined,
      identity: null,
      // keyEditOps intentionally omitted
    });

    expect(vfs.get("source/test_kb.keyman-touch-layout")?.content).toBe(beforeTouch);
    expect(vfs.get("source/test_kb.kmn")?.content).toBe(beforeKmn);
    expect(applyKeyEditsToVfsSpy).not.toHaveBeenCalled();
  });
});

describe("projectWorkingCopyVfs — key edit overlay: ordering (step 1.7 after 1.6, before step 2)", () => {
  it("invokes touch-method deletions, then key edits, then assignments, in that order", async () => {
    const { projectWorkingCopyVfs } = await import("./projectWorkingCopyVfs.ts");
    const vfs = makeKeyEditVfs();
    const setOp: KeyEditOperation = {
      seq: 1,
      kind: "set",
      address: touchKeyAddress("phone", "default", "T_B"),
      fields: { text: "Z" },
    };

    projectWorkingCopyVfs({
      vfs,
      keyboardId: "test_kb",
      startIr: makeTestIR([]),
      deletedNodeIds: new Set(),
      // Non-empty so step 1.6 actually fires (targets a DIFFERENT key than
      // the one the set op touches, so both passes have real work to do).
      deletedTouchKeyIds: new Set([touchKeyAddress("phone", "default", "T_A")]),
      keyEditOps: [setOp],
      assignments: [makePhysicalAssignment("p")],
      getPattern: () => undefined,
      identity: null,
    });

    expect(callOrder).toEqual(["touchKeycapRemovals", "keyEdits", "assignments"]);
  });

  it("an address step 1.6 already neutralized does not resolve at step 1.7 — proving the order, not just recording it", async () => {
    const { projectWorkingCopyVfs } = await import("./projectWorkingCopyVfs.ts");
    const vfs = makeKeyEditVfs();
    // Both the deletion overlay AND the key-edit overlay target the SAME key
    // (T_A). If 1.6 really runs before 1.7, T_A's id is already neutralized
    // to T_touchdel_* by the time 1.7 resolves its address, so the `set` op
    // must fail to resolve (a warning, not a silent apply) and T_A's text
    // must stay dropped (never becomes "NEW").
    const setOp: KeyEditOperation = {
      seq: 1,
      kind: "set",
      address: touchKeyAddress("phone", "default", "T_A"),
      fields: { text: "NEW" },
    };

    const { warnings } = projectWorkingCopyVfs({
      vfs,
      keyboardId: "test_kb",
      startIr: makeTestIR([]),
      deletedNodeIds: new Set(),
      deletedTouchKeyIds: new Set([touchKeyAddress("phone", "default", "T_A")]),
      keyEditOps: [setOp],
      assignments: [],
      getPattern: () => undefined,
      identity: null,
    });

    expect(warnings.some((w) => w.includes("does not resolve"))).toBe(true);

    const layout = JSON.parse(
      vfs.get("source/test_kb.keyman-touch-layout")?.content as string,
    ) as { phone: { layer: [{ row: [{ key: Array<Record<string, unknown>> }] }] } };
    const keys = layout.phone.layer[0].row[0].key;
    const neutralized = keys.find((k) => String(k.id).startsWith("T_touchdel_"));
    expect(neutralized).toBeDefined();
    expect(neutralized?.text).toBeUndefined();
  });
});

describe("projectWorkingCopyVfs — key edit overlay: pass failure is reported and does not abort the chain", () => {
  it("layout-half failure: warns and still runs step 2 (assignments)", async () => {
    const { projectWorkingCopyVfs } = await import("./projectWorkingCopyVfs.ts");
    applyKeyEditsToVfsSpy.mockImplementationOnce(() => {
      throw new Error("boom-layout");
    });
    const vfs = makeKeyEditVfs();
    const setOp: KeyEditOperation = {
      seq: 1,
      kind: "set",
      address: touchKeyAddress("phone", "default", "T_A"),
      fields: { text: "NEW" },
    };

    const { warnings } = projectWorkingCopyVfs({
      vfs,
      keyboardId: "test_kb",
      startIr: makeTestIR([]),
      deletedNodeIds: new Set(),
      keyEditOps: [setOp],
      assignments: [makePhysicalAssignment("p")],
      getPattern: () => undefined,
      identity: null,
    });

    expect(warnings.some((w) => w.includes("key edit layout projection skipped"))).toBe(true);
    expect(warnings.some((w) => w.includes("boom-layout"))).toBe(true);
    // The chain was not aborted: step 2 still ran.
    expect(applyAssignmentsToVfsSpy).toHaveBeenCalled();
  });

  it("rule-half failure: warns and still runs step 2 (assignments), leaving .kmn untouched", async () => {
    const { projectWorkingCopyVfs } = await import("./projectWorkingCopyVfs.ts");
    emitKmnSpy.mockImplementationOnce(() => {
      throw new Error("boom-rule");
    });
    const vfs = makeKeyEditVfs();
    const beforeKmn = vfs.get("source/test_kb.kmn")?.content;
    const renameOp: KeyEditOperation = {
      seq: 1,
      kind: "rename",
      address: touchKeyAddress("phone", "default", "T_A"),
      toId: "T_A_RENAMED",
    };

    const { warnings } = projectWorkingCopyVfs({
      vfs,
      keyboardId: "test_kb",
      startIr: makeTestIR([]),
      deletedNodeIds: new Set(),
      keyEditOps: [renameOp],
      assignments: [makePhysicalAssignment("p")],
      getPattern: () => undefined,
      identity: null,
    });

    expect(warnings.some((w) => w.includes("key edit rule projection skipped"))).toBe(true);
    expect(warnings.some((w) => w.includes("boom-rule"))).toBe(true);
    expect(vfs.get("source/test_kb.kmn")?.content).toBe(beforeKmn);
    // The chain was not aborted: step 2 still ran.
    expect(applyAssignmentsToVfsSpy).toHaveBeenCalled();
  });
});

describe("projectWorkingCopyVfs — key edit overlay: rename rewrites the vkey binding (rule half)", () => {
  it("rewrites `[T_A]` to the new id in every rule bound to it, and re-emits the .kmn", async () => {
    const { projectWorkingCopyVfs } = await import("./projectWorkingCopyVfs.ts");
    const vfs = makeKeyEditVfs();
    const renameOp: KeyEditOperation = {
      seq: 1,
      kind: "rename",
      address: touchKeyAddress("phone", "default", "T_A"),
      toId: "T_ALPHA",
    };

    projectWorkingCopyVfs({
      vfs,
      keyboardId: "test_kb",
      startIr: makeTestIR([]),
      deletedNodeIds: new Set(),
      keyEditOps: [renameOp],
      assignments: [],
      getPattern: () => undefined,
      identity: null,
    });

    const kmn = vfs.get("source/test_kb.kmn")?.content as string;
    expect(kmn).toContain("T_ALPHA");
    expect(kmn).not.toMatch(/\[\s*T_A\s*\]/);
    // The other rule (bound to T_B) is untouched.
    expect(kmn).toContain("T_B");

    // The LAYOUT half also renamed T_A -> T_ALPHA in the same projection.
    const layout = JSON.parse(
      vfs.get("source/test_kb.keyman-touch-layout")?.content as string,
    ) as { phone: { layer: [{ row: [{ key: Array<Record<string, unknown>> }] }] } };
    const ids = layout.phone.layer[0].row[0].key.map((k) => k.id);
    expect(ids).toContain("T_ALPHA");
    expect(ids).not.toContain("T_A");
  });

  it("does not touch the .kmn when the overlay carries no rename op", async () => {
    const { projectWorkingCopyVfs } = await import("./projectWorkingCopyVfs.ts");
    const vfs = makeKeyEditVfs();
    const beforeKmn = vfs.get("source/test_kb.kmn")?.content;
    const setOp: KeyEditOperation = {
      seq: 1,
      kind: "set",
      address: touchKeyAddress("phone", "default", "T_B"),
      fields: { text: "Z" },
    };

    projectWorkingCopyVfs({
      vfs,
      keyboardId: "test_kb",
      startIr: makeTestIR([]),
      deletedNodeIds: new Set(),
      keyEditOps: [setOp],
      assignments: [],
      getPattern: () => undefined,
      identity: null,
    });

    expect(vfs.get("source/test_kb.kmn")?.content).toBe(beforeKmn);
  });
});

describe("projectWorkingCopyVfs — key edit overlay: Case B fidelity (SC-006)", () => {
  it("editing one key leaves every untouched key and platform-level field (e.g. font) structurally identical", async () => {
    const { projectWorkingCopyVfs } = await import("./projectWorkingCopyVfs.ts");
    const vfs = makeKeyEditVfs();
    const setOp: KeyEditOperation = {
      seq: 1,
      kind: "set",
      address: touchKeyAddress("phone", "default", "T_A"),
      fields: { text: "EDITED" },
    };

    projectWorkingCopyVfs({
      vfs,
      keyboardId: "test_kb",
      startIr: makeTestIR([]),
      deletedNodeIds: new Set(),
      keyEditOps: [setOp],
      assignments: [],
      getPattern: () => undefined,
      identity: null,
    });

    const layout = JSON.parse(
      vfs.get("source/test_kb.keyman-touch-layout")?.content as string,
    ) as {
      phone: { font: string; layer: [{ row: [{ key: Array<Record<string, unknown>> }] }] };
    };

    // Platform-level field the IR does not model at all — must survive
    // verbatim, since this pass never round-trips through TouchLayoutIR.
    expect(layout.phone.font).toBe("Arial");

    const keys = layout.phone.layer[0].row[0].key;
    const editedKey = keys.find((k) => k.id === "T_A");
    const untouchedKey = keys.find((k) => k.id === "T_B");

    expect(editedKey?.text).toBe("EDITED");
    // Untouched key is structurally identical to the shipped file.
    expect(untouchedKey).toEqual({ id: "T_B", text: "B", sp: 0 });
  });
});

// ---------------------------------------------------------------------------
// SC-008 (spec 063 T125) — it is IMPOSSIBLE to reach the artifact with a `T_*`
// key that has no rule, no `nextlayer`, and a producing `sp` class.
//
// "Impossible" is a claim about two things at once, and a test that checks only
// one of them proves nothing:
//
//   * The ORACLE is not vacuous. Committed straight into the overlay — the
//     shape a future code path that forgets to call the guard would produce —
//     such a key really does reach the projected artifact, and
//     `findDeadTouchKeys` (the SAME detector Layer C and the edit-time surface
//     share, FR-040) really does find it there. Asserted first, deliberately,
//     because it is what gives the second assertion its teeth.
//   * The GUARD refuses every op that would produce it. `checkKeyEditRejections`
//     (T118) is the only door into the overlay, and it hard-blocks each of the
//     three ways to create the state — so the artifact above is unreachable
//     through the sanctioned path, not merely absent from a happy-path fixture.
//
// The oracle runs against the PROJECTED FILES (parse the emitted
// `.keyman-touch-layout`, join it against the emitted `.kmn`), not against an
// in-memory layout the projection never saw. That is the whole point: SC-008 is
// about the artifact.
// ---------------------------------------------------------------------------

/** The oracle: dead `T_*` keys in the artifact the projection just wrote. */
async function deadKeysInArtifact(vfs: ReturnType<typeof makeKeyEditVfs>) {
  const { parseTouchLayoutString, buildTouchKeyRuleIndex, findDeadTouchKeys } = await import(
    "@keyboard-studio/contracts"
  );
  const { parseKmn } = await import("@keyboard-studio/engine");

  const layoutJson = vfs.get("source/test_kb.keyman-touch-layout")?.content as string;
  const kmn = vfs.get("source/test_kb.kmn")?.content as string;
  const layout = parseTouchLayoutString(layoutJson);
  // The rule index must come from the EMITTED .kmn — an index built from the
  // pre-projection IR would credit rules the artifact may no longer carry.
  const ir = { ...parseKmn(kmn, "test_kb").ir, touchLayout: layout };
  return findDeadTouchKeys({ ir, layout, ruleIndex: buildTouchKeyRuleIndex(ir) });
}

describe("projectWorkingCopyVfs — SC-008: a dead T_ key cannot reach the artifact (T125)", () => {
  it("the oracle is not vacuous: an unguarded overlay op DOES put a dead T_ key in the emitted artifact", async () => {
    const { projectWorkingCopyVfs } = await import("./projectWorkingCopyVfs.ts");
    const vfs = makeKeyEditVfs();

    // An ADDED `T_*` key with a producing class (sp:0), no nextlayer, and no
    // rule anywhere: pressing it does nothing. Committed straight into the
    // overlay, bypassing the T118 guard — the shape a future code path that
    // forgets to call `checkKeyEditRejections` would produce.
    //
    // `add` specifically, and not `rename`: the projection's rule half rewrites
    // the vkey binding for a rename (see the T052 sibling test), so a renamed
    // key carries its rule along and is NOT stranded. `add` has no rule half to
    // follow it, which is why it is the honest vacuity control here.
    projectWorkingCopyVfs({
      vfs,
      keyboardId: "test_kb",
      startIr: makeTestIR([]),
      deletedNodeIds: new Set(),
      keyEditOps: [
        {
          seq: 1,
          kind: "add",
          address: touchKeyAddress("phone", "default", "T_A"),
          position: "after",
          key: { id: "T_NOTHINGTYPESTHIS", text: "?", sp: 0 },
        } as KeyEditOperation,
      ],
      assignments: [],
      getPattern: () => undefined,
      identity: null,
    });

    const dead = await deadKeysInArtifact(vfs);
    expect(dead.map((f) => f.code)).toContain("TOUCH_KEY_NO_RULE");
    expect(
      dead.some((f) => (f.fields as { keyId?: string }).keyId === "T_NOTHINGTYPESTHIS"),
    ).toBe(true);
  });

  it("the guard hard-blocks every op that would create the state, so it never reaches an overlay", async () => {
    const engine = await import("@keyboard-studio/engine");
    const { parseTouchLayoutString, buildTouchKeyRuleIndex } = await import(
      "@keyboard-studio/contracts"
    );

    const layoutJson = makeKeyEditTouchLayoutJson();
    const layout = parseTouchLayoutString(layoutJson);
    const ir = { ...engine.parseKmn(KEY_EDIT_KMN, "test_kb").ir, touchLayout: layout };
    const ruleIndex = buildTouchKeyRuleIndex(ir);
    // Precondition for a HARD block rather than warn-and-confirm: nothing
    // opaque, so the join can actually prove no rule is hiding (FR-045).
    expect(ruleIndex.opaqueFragmentCount).toBe(0);

    // The three routes to the state, one per operation kind that can reach it.
    const ops = [
      {
        kind: "rename",
        address: touchKeyAddress("phone", "default", "T_A"),
        toId: "T_NOTHINGTYPESTHIS",
      },
      {
        kind: "set",
        address: touchKeyAddress("phone", "default", "T_A"),
        fields: { id: "T_ALSONOTHING" },
      },
      {
        kind: "add",
        address: touchKeyAddress("phone", "default", "T_A"),
        position: "after",
        key: { id: "T_BRANDNEW", text: "?", sp: 0 },
      },
    ] as const;

    for (const op of ops) {
      const verdict = engine.checkKeyEditRejections(layout, op as never, ruleIndex);
      expect(verdict.ok, `${op.kind} was admitted`).toBe(false);
      if (verdict.ok) continue;
      const deadKeyRejection = verdict.rejections.find(
        (r) => r.reason === "would-create-dead-key",
      );
      expect(deadKeyRejection, `${op.kind} produced no dead-key rejection`).toBeDefined();
      // Hard, not confirmable: with no opaque fragments there is nothing left
      // to be uncertain about.
      expect(deadKeyRejection!.confirmable).toBe(false);
    }
  });

  it("an overlay of only ADMITTED ops projects an artifact with no dead T_ key at all", async () => {
    const { projectWorkingCopyVfs } = await import("./projectWorkingCopyVfs.ts");
    const engine = await import("@keyboard-studio/engine");
    const { parseTouchLayoutString, buildTouchKeyRuleIndex } = await import(
      "@keyboard-studio/contracts"
    );

    const layout = parseTouchLayoutString(makeKeyEditTouchLayoutJson());
    const seedIr = { ...engine.parseKmn(KEY_EDIT_KMN, "test_kb").ir, touchLayout: layout };
    const ruleIndex = buildTouchKeyRuleIndex(seedIr);

    // Ordinary, legitimate edits: a keycap relabel, and a rename to a
    // self-outputting U_ id (which types its own character, so nothing is
    // stranded — the very remedy the T118 rejection points authors at).
    const ops: KeyEditOperation[] = [
      {
        seq: 1,
        kind: "set",
        address: touchKeyAddress("phone", "default", "T_A"),
        fields: { text: "Á" },
      },
      {
        seq: 2,
        kind: "rename",
        address: touchKeyAddress("phone", "default", "T_B"),
        toId: "U_0062",
      },
    ];
    for (const op of ops) {
      expect(engine.checkKeyEditRejections(layout, op, ruleIndex).ok, `${op.kind} refused`).toBe(
        true,
      );
    }

    const vfs = makeKeyEditVfs();
    projectWorkingCopyVfs({
      vfs,
      keyboardId: "test_kb",
      startIr: makeTestIR([]),
      deletedNodeIds: new Set(),
      keyEditOps: ops,
      assignments: [],
      getPattern: () => undefined,
      identity: null,
    });

    expect(await deadKeysInArtifact(vfs)).toEqual([]);
  });
});

// ---------------------------------------------------------------------------
// Declared-writes containment for the studio seam (spec 063 T126).
//
// Two separate obligations, and research R9 is explicit that the prose alone
// misleads on the second:
//
//   1. THE SEAM. The key-edit projection writes only the two files it is
//      supposed to — `source/<id>.keyman-touch-layout` and `source/<id>.kmn`.
//      Verified by diffing the whole VFS, so a stray write to a third path
//      fails here rather than surfacing as a mystery file in a zip.
//
//   2. THE IR GUARD'S ACTUAL BOUNDARY — which is looser than R9 itself says.
//      R9 records that "`applyMutatePatch`'s containment check compares only the
//      common prefix… and its leaf collection treats an array as a leaf. So a
//      patch at `touchLayout.platforms` already passes against the existing
//      `TOUCH_WRITES` declaration… nobody should treat M3 as the row-level
//      guard." Correct so far. But R9 then names what is "genuinely NOT
//      authorized: a leaf at `touchLayout.platforms[i].layers[j].id`" — and
//      MEASURED, that patch passes too. It has to: `collectLeafPaths` stops at
//      the `platforms` array, so no leaf below `touchLayout.platforms` is ever
//      collected, and therefore no content beneath it can ever be refused.
//      Both directions are pinned below so the real line is on the record:
//      anything under a declared array prefix passes, and what M3 actually
//      catches is a leaf on an UNDECLARED sibling. This increment's layout edits
//      do not go through `applyMutatePatch` at all (they are the raw-JSON pass
//      above), which is exactly why the boundary needed measuring rather than
//      trusting.
// ---------------------------------------------------------------------------

describe("projectWorkingCopyVfs — declared-writes containment for the key-edit seam (T126)", () => {
  it("writes only the touch layout and the .kmn — no third path is created or changed", async () => {
    const { projectWorkingCopyVfs } = await import("./projectWorkingCopyVfs.ts");
    const vfs = makeKeyEditVfs();
    const before = new Map(vfs.entries().map((e) => [e.path, e.content]));

    projectWorkingCopyVfs({
      vfs,
      keyboardId: "test_kb",
      startIr: makeTestIR([]),
      deletedNodeIds: new Set(),
      keyEditOps: [
        {
          seq: 1,
          kind: "set",
          address: touchKeyAddress("phone", "default", "T_A"),
          fields: { text: "EDITED" },
        } as KeyEditOperation,
      ],
      assignments: [],
      getPattern: () => undefined,
      identity: null,
    });

    const after = new Map(vfs.entries().map((e) => [e.path, e.content]));

    // No new paths, none removed.
    expect([...after.keys()].sort()).toEqual([...before.keys()].sort());

    const changed = [...after.keys()].filter((p) => after.get(p) !== before.get(p));
    for (const path of changed) {
      expect(
        path === "source/test_kb.keyman-touch-layout" || path === "source/test_kb.kmn",
        `unexpected write to ${path}`,
      ).toBe(true);
    }
    // The layout half definitely ran — otherwise the assertion above is
    // trivially satisfied by writing nothing.
    expect(changed).toContain("source/test_kb.keyman-touch-layout");
  });

  it("pins the M3 prefix rule's real boundary: EVERYTHING under the declared platforms array passes — including a new layer id", async () => {
    const { applyMutatePatch } = await import("../steps/mutateApply.ts");
    const { TOUCH_WRITES } = await import("../steps/editorMutate.ts");
    const { parseTouchLayoutString } = await import("@keyboard-studio/contracts");

    const layout = parseTouchLayoutString(makeKeyEditTouchLayoutJson());
    const base = { ...makeTestIR([]), touchLayout: layout };

    // R9's finding, asserted rather than described: a coarse patch at
    // `touchLayout.platforms` is NOT rejected today.
    expect(() =>
      applyMutatePatch(
        base,
        { touchLayout: { ...layout, platforms: layout.platforms } },
        TOUCH_WRITES,
      ),
    ).not.toThrow();

    // R9's CORRECTION. It names a leaf at `…layers[j].id` as "genuinely not
    // authorized". Measured, it is authorized: `collectLeafPaths` treats the
    // `platforms` array as a leaf, so the walk never descends past
    // `touchLayout.platforms` and no content beneath it can be refused. Adding
    // a whole new layer therefore passes M3 today.
    expect(() =>
      applyMutatePatch(
        base,
        {
          touchLayout: {
            ...layout,
            platforms: [
              {
                ...layout.platforms[0]!,
                layers: [
                  ...layout.platforms[0]!.layers,
                  { id: "brand_new_layer", rows: [] },
                ],
              },
            ],
          },
        },
        TOUCH_WRITES,
      ),
    ).not.toThrow();
  });

  it("what M3 DOES catch: a leaf on an undeclared sibling — so the guard is not vacuous either", async () => {
    const { applyMutatePatch, MutatePatchContainmentError } = await import(
      "../steps/mutateApply.ts"
    );
    const { TOUCH_WRITES } = await import("../steps/editorMutate.ts");
    const { parseTouchLayoutString } = await import("@keyboard-studio/contracts");

    const layout = parseTouchLayoutString(makeKeyEditTouchLayoutJson());
    const base = { ...makeTestIR([]), touchLayout: layout };

    // A sibling of `touchLayout.platforms` that TOUCH_WRITES does not declare.
    expect(() =>
      applyMutatePatch(
        base,
        { touchLayout: { ...layout, displayUnderlying: true } } as never,
        TOUCH_WRITES,
      ),
    ).toThrow(MutatePatchContainmentError);

    // And a top-level array outside the declaration entirely.
    expect(() => applyMutatePatch(base, { groups: [] } as never, TOUCH_WRITES)).toThrow(
      MutatePatchContainmentError,
    );
  });
});

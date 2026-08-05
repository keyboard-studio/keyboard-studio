// Tests for projectWorkingCopyVfs — the shared pure projection helper.
//
// Coverage:
//   1. Empty deletedNodeIds + no assignments + no identity → fast path, no mutations.
//   2. Carve deletion — applyCarveToVfs called with the correct args.
//   3. Assignments — applyAssignmentsToVfs called with physical-only assignments.
//   4. Touch assignments silently excluded (modality filter).
//   5. Identity — applyIdentityStubMutation called with correct args.
//   6. Warnings from all three layers are accumulated and returned.
//   7. Identity projection skipped when identity is null.
//   8. Assignments skipped when there are no physical assignments.
//   9. VFS is mutated in-place (same object reference before/after).
//  10. Caller-supplied `getPattern` resolver is forwarded to applyAssignmentsToVfs.
//  11. (spec 058 T052) Key edit overlay projection: step 1.7 (layout half) and
//      its rule-half sibling run after step 1.6 and before step 2; an empty
//      overlay leaves both `.keyman-touch-layout` and `.kmn` byte-identical;
//      a pass failure in either half is reported as a warning and does not
//      abort the chain; a `set` op preserves every untouched key and
//      platform-level field the IR does not model (Case B, SC-006).

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { createVirtualFS } from "@keyboard-studio/contracts";
import { makeTestIR } from "@keyboard-studio/contracts/fixtures";
import type { MechanismAssignment } from "@keyboard-studio/contracts";
import type { KeyEditOperation } from "@keyboard-studio/engine";

// `touchKeyAddress` itself is not imported here (a static top-level value
// import of the mocked "@keyboard-studio/engine" module would force the
// vi.mock factory below to run during THIS file's own ESM link phase,
// before the spy `const`s it references have been initialized — a
// `ReferenceError`, not a hoisting quirk to work around). The
// "<platform>:<layerId>:<keyId>" format is a stable, documented wire
// format (touchKeyAddress.ts), so it is safe to build inline here.
function touchKeyAddress(platform: string, layerId: string, keyId: string): string {
  return `${platform}:${layerId}:${keyId}`;
}

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

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makeVfs() {
  return createVirtualFS([
    { path: "source/test_kb.kmn", content: "c test\n", isBinary: false },
  ]);
}

function makePhysicalAssignment(patternId: string): MechanismAssignment {
  return {
    scope: "keyboard-default",
    target: "",
    modality: "physical",
    mechanisms: [{ patternId }],
    source: "user",
  };
}

function makeTouchAssignment(patternId: string): MechanismAssignment {
  return {
    scope: "keyboard-default",
    target: "",
    modality: "touch",
    mechanisms: [{ patternId }],
    source: "user",
  };
}

beforeEach(() => {
  vi.clearAllMocks();
  callOrder.length = 0;
});

afterEach(() => {
  vi.clearAllMocks();
  callOrder.length = 0;
});

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe("projectWorkingCopyVfs — always calls applyCarveToVfs (step 1)", () => {
  it("calls applyCarveToVfs even when deletedNodeIds is empty", async () => {
    const { projectWorkingCopyVfs } = await import("./projectWorkingCopyVfs.ts");
    const vfs = makeVfs();
    const ir = makeTestIR([]);
    projectWorkingCopyVfs({
      vfs,
      keyboardId: "test_kb",
      baseIr: ir,
      deletedNodeIds: new Set(),
      assignments: [],
      getPattern: () => undefined,
      identity: null,
    });
    expect(applyCarveToVfsSpy).toHaveBeenCalledWith(vfs, "test_kb", ir, new Set(), { forceEmit: false });
  });

  it("forwards deletedNodeIds to applyCarveToVfs", async () => {
    const { projectWorkingCopyVfs } = await import("./projectWorkingCopyVfs.ts");
    const vfs = makeVfs();
    const ir = makeTestIR([]);
    const deleted = new Set(["rule#0", "rule#1"]);
    projectWorkingCopyVfs({
      vfs,
      keyboardId: "test_kb",
      baseIr: ir,
      deletedNodeIds: deleted,
      assignments: [],
      getPattern: () => undefined,
      identity: null,
    });
    expect(applyCarveToVfsSpy).toHaveBeenCalledWith(vfs, "test_kb", ir, deleted, { forceEmit: false });
  });

  // AC#2 regression: deletedItemIds-only path must merge into the applyCarveToVfs call.
  it("merges deletedItemIds (only) into the set passed to applyCarveToVfs", async () => {
    const { projectWorkingCopyVfs } = await import("./projectWorkingCopyVfs.ts");
    const vfs = makeVfs();
    const ir = makeTestIR([]);
    projectWorkingCopyVfs({
      vfs,
      keyboardId: "test_kb",
      baseIr: ir,
      deletedNodeIds: new Set(),
      deletedItemIds: new Set(["rule#0", "rule#1"]),
      assignments: [],
      getPattern: () => undefined,
      identity: null,
    });
    expect(applyCarveToVfsSpy).toHaveBeenCalledWith(
      vfs,
      "test_kb",
      ir,
      new Set(["rule#0", "rule#1"]),
      { forceEmit: false },
    );
  });

  // AC#2 regression: when both non-empty, the merged union must be passed.
  it("merges deletedNodeIds + deletedItemIds into a union set for applyCarveToVfs", async () => {
    const { projectWorkingCopyVfs } = await import("./projectWorkingCopyVfs.ts");
    const vfs = makeVfs();
    const ir = makeTestIR([]);
    projectWorkingCopyVfs({
      vfs,
      keyboardId: "test_kb",
      baseIr: ir,
      deletedNodeIds: new Set(["group#A"]),
      deletedItemIds: new Set(["rule#0"]),
      assignments: [],
      getPattern: () => undefined,
      identity: null,
    });
    expect(applyCarveToVfsSpy).toHaveBeenCalledWith(
      vfs,
      "test_kb",
      ir,
      new Set(["group#A", "rule#0"]),
      { forceEmit: false },
    );
  });
});

describe("projectWorkingCopyVfs — assignments (step 2)", () => {
  it("calls applyAssignmentsToVfs when physical assignments exist", async () => {
    const { projectWorkingCopyVfs } = await import("./projectWorkingCopyVfs.ts");
    const vfs = makeVfs();
    const assignment = makePhysicalAssignment("pattern-a");
    projectWorkingCopyVfs({
      vfs,
      keyboardId: "test_kb",
      baseIr: makeTestIR([]),
      deletedNodeIds: new Set(),
      assignments: [assignment],
      getPattern: () => undefined,
      identity: null,
    });
    expect(applyAssignmentsToVfsSpy).toHaveBeenCalledWith(
      vfs,
      "test_kb",
      [assignment],
      expect.any(Function),
    );
  });

  it("excludes touch assignments — only physical assignments are forwarded", async () => {
    const { projectWorkingCopyVfs } = await import("./projectWorkingCopyVfs.ts");
    const vfs = makeVfs();
    const physical = makePhysicalAssignment("pattern-a");
    const touch = makeTouchAssignment("pattern-b");
    projectWorkingCopyVfs({
      vfs,
      keyboardId: "test_kb",
      baseIr: makeTestIR([]),
      deletedNodeIds: new Set(),
      assignments: [physical, touch],
      getPattern: () => undefined,
      identity: null,
    });
    expect(applyAssignmentsToVfsSpy).toHaveBeenCalledWith(
      vfs,
      "test_kb",
      [physical], // touch excluded
      expect.any(Function),
    );
  });

  it("does NOT call applyAssignmentsToVfs when there are no physical assignments", async () => {
    const { projectWorkingCopyVfs } = await import("./projectWorkingCopyVfs.ts");
    projectWorkingCopyVfs({
      vfs: makeVfs(),
      keyboardId: "test_kb",
      baseIr: makeTestIR([]),
      deletedNodeIds: new Set(),
      assignments: [makeTouchAssignment("pattern-b")], // touch only
      getPattern: () => undefined,
      identity: null,
    });
    expect(applyAssignmentsToVfsSpy).not.toHaveBeenCalled();
  });

  it("does NOT call applyAssignmentsToVfs when assignments is empty", async () => {
    const { projectWorkingCopyVfs } = await import("./projectWorkingCopyVfs.ts");
    projectWorkingCopyVfs({
      vfs: makeVfs(),
      keyboardId: "test_kb",
      baseIr: makeTestIR([]),
      deletedNodeIds: new Set(),
      assignments: [],
      getPattern: () => undefined,
      identity: null,
    });
    expect(applyAssignmentsToVfsSpy).not.toHaveBeenCalled();
  });

  it("forwards the getPattern resolver to applyAssignmentsToVfs", async () => {
    const { projectWorkingCopyVfs } = await import("./projectWorkingCopyVfs.ts");
    const resolver = vi.fn(() => undefined);
    projectWorkingCopyVfs({
      vfs: makeVfs(),
      keyboardId: "test_kb",
      baseIr: makeTestIR([]),
      deletedNodeIds: new Set(),
      assignments: [makePhysicalAssignment("p")],
      getPattern: resolver,
      identity: null,
    });
    // The resolver passed to applyAssignmentsToVfs should be the same function
    // we supplied (or a wrapper that calls it — verify by calling the passed fn).
    const passedFn = applyAssignmentsToVfsSpy.mock.calls[0]?.[3] as ((id: string) => unknown) | undefined;
    expect(passedFn).toBeDefined();
    passedFn?.("some-id");
    expect(resolver).toHaveBeenCalledWith("some-id");
  });
});

describe("projectWorkingCopyVfs — identity (step 3)", () => {
  it("calls applyIdentityStubMutation when identity.displayName is set", async () => {
    const { projectWorkingCopyVfs } = await import("./projectWorkingCopyVfs.ts");
    const vfs = makeVfs();
    projectWorkingCopyVfs({
      vfs,
      keyboardId: "test_kb",
      baseIr: makeTestIR([]),
      deletedNodeIds: new Set(),
      assignments: [],
      getPattern: () => undefined,
      identity: { displayName: "My Keyboard" },
    });
    expect(applyIdentityStubMutationSpy).toHaveBeenCalledWith(
      vfs,
      "test_kb",
      expect.objectContaining({ name: "My Keyboard" }),
    );
  });

  it("does NOT call applyIdentityStubMutation when identity is null", async () => {
    const { projectWorkingCopyVfs } = await import("./projectWorkingCopyVfs.ts");
    projectWorkingCopyVfs({
      vfs: makeVfs(),
      keyboardId: "test_kb",
      baseIr: makeTestIR([]),
      deletedNodeIds: new Set(),
      assignments: [],
      getPattern: () => undefined,
      identity: null,
    });
    expect(applyIdentityStubMutationSpy).not.toHaveBeenCalled();
  });

  it("does NOT call applyIdentityStubMutation when identity has no fields set", async () => {
    const { projectWorkingCopyVfs } = await import("./projectWorkingCopyVfs.ts");
    projectWorkingCopyVfs({
      vfs: makeVfs(),
      keyboardId: "test_kb",
      baseIr: makeTestIR([]),
      deletedNodeIds: new Set(),
      assignments: [],
      getPattern: () => undefined,
      identity: {}, // non-null but no fields
    });
    expect(applyIdentityStubMutationSpy).not.toHaveBeenCalled();
  });

  it("catches identity errors and returns them as warnings", async () => {
    const { projectWorkingCopyVfs } = await import("./projectWorkingCopyVfs.ts");
    applyIdentityStubMutationSpy.mockImplementationOnce(() => {
      throw new Error("file not found");
    });
    const { warnings } = projectWorkingCopyVfs({
      vfs: makeVfs(),
      keyboardId: "test_kb",
      baseIr: makeTestIR([]),
      deletedNodeIds: new Set(),
      assignments: [],
      getPattern: () => undefined,
      identity: { displayName: "Test" },
    });
    expect(warnings.some((w) => w.includes("identity projection skipped"))).toBe(true);
    expect(warnings.some((w) => w.includes("file not found"))).toBe(true);
  });
});

describe("projectWorkingCopyVfs — warnings accumulation", () => {
  it("accumulates warnings from carve, assignments, and identity layers", async () => {
    const { projectWorkingCopyVfs } = await import("./projectWorkingCopyVfs.ts");
    applyCarveToVfsSpy.mockReturnValueOnce({ warnings: ["carve-warn"] });
    applyAssignmentsToVfsSpy.mockReturnValueOnce({ kmn: "", warnings: ["assign-warn"] });
    const { warnings } = projectWorkingCopyVfs({
      vfs: makeVfs(),
      keyboardId: "test_kb",
      baseIr: makeTestIR([]),
      deletedNodeIds: new Set(),
      assignments: [makePhysicalAssignment("p")],
      getPattern: () => undefined,
      identity: null,
    });
    expect(warnings).toContain("carve-warn");
    expect(warnings).toContain("assign-warn");
  });

  it("returns empty warnings when all steps succeed with no warnings", async () => {
    const { projectWorkingCopyVfs } = await import("./projectWorkingCopyVfs.ts");
    const { warnings } = projectWorkingCopyVfs({
      vfs: makeVfs(),
      keyboardId: "test_kb",
      baseIr: makeTestIR([]),
      deletedNodeIds: new Set(),
      assignments: [],
      getPattern: () => undefined,
      identity: null,
    });
    expect(warnings).toHaveLength(0);
  });
});

describe("projectWorkingCopyVfs — in-place mutation", () => {
  it("mutates the provided vfs in-place (same object returned via callers)", async () => {
    const { projectWorkingCopyVfs } = await import("./projectWorkingCopyVfs.ts");
    // Make applyCarveToVfs actually write to the VFS so we can verify mutation.
    applyCarveToVfsSpy.mockImplementationOnce((vfs: { set: (p: string, c: string) => void }) => {
      vfs.set("source/test_kb.kmn", "c mutated\n");
      return { warnings: [] };
    });
    const vfs = makeVfs();
    projectWorkingCopyVfs({
      vfs,
      keyboardId: "test_kb",
      baseIr: makeTestIR([]),
      deletedNodeIds: new Set(["some-node"]),
      assignments: [],
      getPattern: () => undefined,
      identity: null,
    });
    // The VFS was mutated in-place by the mock.
    expect(vfs.get("source/test_kb.kmn")?.content).toBe("c mutated\n");
  });
});

describe("projectWorkingCopyVfs — touch layout injection (step 0)", () => {
  it("writes touchLayoutJson into source/<keyboardId>.keyman-touch-layout when provided", async () => {
    const { projectWorkingCopyVfs } = await import("./projectWorkingCopyVfs.ts");
    const vfs = makeVfs();
    const touchJson = '{"phone":{"displayUnderlying":false,"layer":[]}}';
    projectWorkingCopyVfs({
      vfs,
      keyboardId: "test_kb",
      baseIr: makeTestIR([]),
      deletedNodeIds: new Set(),
      assignments: [],
      getPattern: () => undefined,
      identity: null,
      touchLayoutJson: touchJson,
    });
    const entry = vfs.get("source/test_kb.keyman-touch-layout");
    expect(entry).toBeDefined();
    expect(entry?.content).toBe(touchJson);
  });

  it("does NOT create a .keyman-touch-layout entry when touchLayoutJson is null", async () => {
    const { projectWorkingCopyVfs } = await import("./projectWorkingCopyVfs.ts");
    const vfs = makeVfs();
    projectWorkingCopyVfs({
      vfs,
      keyboardId: "test_kb",
      baseIr: makeTestIR([]),
      deletedNodeIds: new Set(),
      assignments: [],
      getPattern: () => undefined,
      identity: null,
      touchLayoutJson: null,
    });
    expect(vfs.get("source/test_kb.keyman-touch-layout")).toBeUndefined();
  });

  it("does NOT create a .keyman-touch-layout entry when touchLayoutJson is undefined (omitted)", async () => {
    const { projectWorkingCopyVfs } = await import("./projectWorkingCopyVfs.ts");
    const vfs = makeVfs();
    projectWorkingCopyVfs({
      vfs,
      keyboardId: "test_kb",
      baseIr: makeTestIR([]),
      deletedNodeIds: new Set(),
      assignments: [],
      getPattern: () => undefined,
      identity: null,
      // touchLayoutJson intentionally omitted
    });
    expect(vfs.get("source/test_kb.keyman-touch-layout")).toBeUndefined();
  });

  it("leaves a pre-existing base .keyman-touch-layout entry unchanged when touchLayoutJson is null", async () => {
    const { projectWorkingCopyVfs } = await import("./projectWorkingCopyVfs.ts");
    const baseContent = '{"phone":{"displayUnderlying":false,"layer":[]}}';
    const vfs = createVirtualFS([
      { path: "source/test_kb.kmn", content: "c test\n", isBinary: false },
      { path: "source/test_kb.keyman-touch-layout", content: baseContent, isBinary: false },
    ]);
    projectWorkingCopyVfs({
      vfs,
      keyboardId: "test_kb",
      baseIr: makeTestIR([]),
      deletedNodeIds: new Set(),
      assignments: [],
      getPattern: () => undefined,
      identity: null,
      touchLayoutJson: null,
    });
    // Pre-existing entry must not be overwritten.
    expect(vfs.get("source/test_kb.keyman-touch-layout")?.content).toBe(baseContent);
  });

  it("injected .keyman-touch-layout is renamed to source/<targetKeyboardId>.keyman-touch-layout by the id-rename pass", async () => {
    const { projectWorkingCopyVfs } = await import("./projectWorkingCopyVfs.ts");
    const touchJson = '{"tablet":{"displayUnderlying":false,"layer":[]}}';
    const vfs = createVirtualFS([
      { path: "source/sil_base.kmn", content: "c stub\n", isBinary: false },
    ]);
    projectWorkingCopyVfs({
      vfs,
      keyboardId: "sil_base",
      targetKeyboardId: "ha_sil",
      baseIr: makeTestIR([]),
      deletedNodeIds: new Set(),
      assignments: [],
      getPattern: () => undefined,
      identity: { displayName: "Hausa" },
      touchLayoutJson: touchJson,
    });
    // Old path must be gone after rename.
    expect(vfs.get("source/sil_base.keyman-touch-layout")).toBeUndefined();
    // New path must hold the injected content.
    const renamed = vfs.get("source/ha_sil.keyman-touch-layout");
    expect(renamed).toBeDefined();
    expect(renamed?.content).toBe(touchJson);
  });
});

describe("projectWorkingCopyVfs — id rename (step 4)", () => {
  it("renames sibling files and rewrites kmw-keyboard-<baseId> CSS selectors when targetKeyboardId differs", async () => {
    const { projectWorkingCopyVfs } = await import("./projectWorkingCopyVfs.ts");
    const vfs = createVirtualFS([
      { path: "source/sil_akebu.kmn", content: "c stub\n", isBinary: false },
      {
        path: "source/sil_akebu.css",
        content:
          ".kmw-keyboard-sil_akebu .kmw-key { color: red; }\n" +
          ".ios .kmw-keyboard-sil_akebu .kmw-key[id*='T_0300'] { background: green; }\n",
        isBinary: false,
      },
      {
        path: "source/sil_akebu.kvks",
        content: "<VisualKeyboard><kbdname>sil_akebu</kbdname></VisualKeyboard>",
        isBinary: false,
      },
    ]);
    projectWorkingCopyVfs({
      vfs,
      keyboardId: "sil_akebu",
      targetKeyboardId: "ewondo",
      baseIr: makeTestIR([]),
      deletedNodeIds: new Set(),
      assignments: [],
      getPattern: () => undefined,
      identity: { displayName: "Ewondo" },
    });

    // Files renamed.
    expect(vfs.get("source/sil_akebu.css")).toBeUndefined();
    expect(vfs.get("source/sil_akebu.kvks")).toBeUndefined();
    const renamedCss = vfs.get("source/ewondo.css");
    expect(renamedCss).toBeDefined();
    // CSS selectors rewritten to the new id.
    expect(renamedCss?.content).toContain(".kmw-keyboard-ewondo");
    expect(renamedCss?.content).not.toContain("kmw-keyboard-sil_akebu");
    // kvks <kbdname> rewritten.
    const renamedKvks = vfs.get("source/ewondo.kvks");
    expect(renamedKvks?.content).toContain("<kbdname>ewondo</kbdname>");
  });

  it("is a no-op when targetKeyboardId is omitted", async () => {
    const { projectWorkingCopyVfs } = await import("./projectWorkingCopyVfs.ts");
    const vfs = createVirtualFS([
      { path: "source/sil_akebu.kmn", content: "c stub\n", isBinary: false },
      {
        path: "source/sil_akebu.css",
        content: ".kmw-keyboard-sil_akebu .x{}",
        isBinary: false,
      },
    ]);
    projectWorkingCopyVfs({
      vfs,
      keyboardId: "sil_akebu",
      baseIr: makeTestIR([]),
      deletedNodeIds: new Set(),
      assignments: [],
      getPattern: () => undefined,
      identity: null,
    });
    // Sibling files untouched.
    expect(vfs.get("source/sil_akebu.css")?.content).toContain(
      "kmw-keyboard-sil_akebu",
    );
    expect(vfs.get("source/ewondo.css")).toBeUndefined();
  });

  // Regression coverage for the adapt-a-base compile-after-rename bug: the
  // compile step (useKeyboardArtifact) cannot know the VFS was renamed unless
  // the transform result tells it so.
  it("returns effectiveKeyboardId === targetKeyboardId when the rename pass fires", async () => {
    const { projectWorkingCopyVfs } = await import("./projectWorkingCopyVfs.ts");
    const vfs = createVirtualFS([
      { path: "source/sil_akebu.kmn", content: "c stub\n", isBinary: false },
    ]);
    const result = projectWorkingCopyVfs({
      vfs,
      keyboardId: "sil_akebu",
      targetKeyboardId: "ewondo",
      baseIr: makeTestIR([]),
      deletedNodeIds: new Set(),
      assignments: [],
      getPattern: () => undefined,
      identity: { displayName: "Ewondo" },
    });
    expect(result.effectiveKeyboardId).toBe("ewondo");
    // And the renamed .kmn is really what compile() would read.
    expect(vfs.get("source/ewondo.kmn")).toBeDefined();
    expect(vfs.get("source/sil_akebu.kmn")).toBeUndefined();
  });

  it("does NOT return effectiveKeyboardId when targetKeyboardId is omitted", async () => {
    const { projectWorkingCopyVfs } = await import("./projectWorkingCopyVfs.ts");
    const vfs = createVirtualFS([
      { path: "source/sil_akebu.kmn", content: "c stub\n", isBinary: false },
    ]);
    const result = projectWorkingCopyVfs({
      vfs,
      keyboardId: "sil_akebu",
      baseIr: makeTestIR([]),
      deletedNodeIds: new Set(),
      assignments: [],
      getPattern: () => undefined,
      identity: null,
    });
    expect(result.effectiveKeyboardId).toBeUndefined();
  });

  it("does NOT return effectiveKeyboardId when targetKeyboardId equals keyboardId", async () => {
    const { projectWorkingCopyVfs } = await import("./projectWorkingCopyVfs.ts");
    const vfs = createVirtualFS([
      { path: "source/sil_akebu.kmn", content: "c stub\n", isBinary: false },
    ]);
    const result = projectWorkingCopyVfs({
      vfs,
      keyboardId: "sil_akebu",
      targetKeyboardId: "sil_akebu",
      baseIr: makeTestIR([]),
      deletedNodeIds: new Set(),
      assignments: [],
      getPattern: () => undefined,
      identity: null,
    });
    expect(result.effectiveKeyboardId).toBeUndefined();
  });
});

// ---------------------------------------------------------------------------
// Id-rename (Track-1 copy) preserves the base keyboard release version.
// Regression: resetIdentity previously defaulted &KEYBOARDVERSION to "1.0" on
// the copy path while the .kps <Version> and zip filename kept the base
// version, leaving the package internally inconsistent.
// ---------------------------------------------------------------------------

describe("projectWorkingCopyVfs — id rename preserves base version", () => {
  const BASE_KMN = `store(&VERSION) '10.0'
store(&NAME) 'Base KB'
store(&TARGETS) 'any'
store(&KEYBOARDVERSION) '2.3'

begin Unicode > use(main)

group(main) using keys
+ [K_A] > U+0061
`;

  it("keeps &KEYBOARDVERSION from the base when renaming to a new id", async () => {
    const { projectWorkingCopyVfs } = await import("./projectWorkingCopyVfs.ts");
    const vfs = createVirtualFS([
      { path: "source/base_kb.kmn", content: BASE_KMN, isBinary: false },
    ]);
    const result = projectWorkingCopyVfs({
      vfs,
      keyboardId: "base_kb",
      targetKeyboardId: "new_kb",
      baseIr: makeTestIR([]),
      deletedNodeIds: new Set(),
      assignments: [],
      getPattern: () => undefined,
      identity: null,
    });

    expect(result.effectiveKeyboardId).toBe("new_kb");
    const renamed = vfs.entries().find((e) => e.path === "source/new_kb.kmn");
    expect(renamed).toBeDefined();
    const kmn = renamed?.content as string;
    expect(kmn).toContain("store(&KEYBOARDVERSION) '2.3'");
    expect(kmn).not.toContain("store(&KEYBOARDVERSION) '1.0'");
  });
});

// ---------------------------------------------------------------------------
// spec 058 T052 — key edit overlay projection (step 1.7 layout half + the
// rule-half sibling). Uses the REAL applyKeyEditsToVfs / parseKmn / emitKmn
// (the mock above passes them through by default), not canned mocks, so
// these tests exercise genuine Case B splicing and genuine .kmn re-emit.
// ---------------------------------------------------------------------------

const KEY_EDIT_KMN = `store(&VERSION) '10.0'
store(&NAME) 'Test'
store(&TARGETS) 'any'

begin Unicode > use(main)

group(main) using keys
+ [T_A] > 'a'
+ [T_B] > 'b'
`;

/** A touch layout with a platform-level field (`font`) the IR does not
 *  model, and two keys — used by the "untouched key + platform field
 *  survives" (SC-006) test. */
function makeKeyEditTouchLayoutJson(): string {
  return JSON.stringify({
    phone: {
      font: "Arial",
      layer: [
        {
          id: "default",
          row: [
            {
              id: 1,
              key: [
                { id: "T_A", text: "A", sp: 0 },
                { id: "T_B", text: "B", sp: 0 },
              ],
            },
          ],
        },
      ],
    },
  });
}

function makeKeyEditVfs() {
  return createVirtualFS([
    { path: "source/test_kb.kmn", content: KEY_EDIT_KMN, isBinary: false },
    {
      path: "source/test_kb.keyman-touch-layout",
      content: makeKeyEditTouchLayoutJson(),
      isBinary: false,
    },
  ]);
}

describe("projectWorkingCopyVfs — key edit overlay: empty overlay is a no-op", () => {
  it("leaves .keyman-touch-layout and .kmn byte-identical when keyEditOps is empty", async () => {
    const { projectWorkingCopyVfs } = await import("./projectWorkingCopyVfs.ts");
    const vfs = makeKeyEditVfs();
    const beforeTouch = vfs.get("source/test_kb.keyman-touch-layout")?.content;
    const beforeKmn = vfs.get("source/test_kb.kmn")?.content;

    const { warnings } = projectWorkingCopyVfs({
      vfs,
      keyboardId: "test_kb",
      baseIr: makeTestIR([]),
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
      baseIr: makeTestIR([]),
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
      baseIr: makeTestIR([]),
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
      baseIr: makeTestIR([]),
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
      baseIr: makeTestIR([]),
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
      baseIr: makeTestIR([]),
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
      baseIr: makeTestIR([]),
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
      baseIr: makeTestIR([]),
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
      baseIr: makeTestIR([]),
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
// SC-008 (spec 058 T125) — it is IMPOSSIBLE to reach the artifact with a `T_*`
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
      baseIr: makeTestIR([]),
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
      baseIr: makeTestIR([]),
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
// Declared-writes containment for the studio seam (spec 058 T126).
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
      baseIr: makeTestIR([]),
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

// ---------------------------------------------------------------------------
// Step 3.6 — package-descriptor identity (spec 057 T015)
// ---------------------------------------------------------------------------
//
// The projection is the seam FR-004 names: the author's language reaches the
// `.kps` because it rides the same helper the OSK preview, the zip, and the pull
// request all call. These tests exercise the REAL engine writer (it is not among
// the three functions this file spies on), so what they assert is the descriptor
// the artifact actually carries.

describe("projectWorkingCopyVfs — package descriptor (step 3.6)", () => {
  /** A French base's scaffolded descriptor — the copy track's starting state. */
  const FRENCH_KPS =
    '<?xml version="1.0" encoding="utf-8"?>\n' +
    "<Package>\n" +
    "  <System>\n    <KeymanDeveloperVersion>17.0.0.0</KeymanDeveloperVersion>\n  </System>\n" +
    "  <Options>\n    <FollowKeyboardVersion/>\n  </Options>\n" +
    '  <Info>\n    <Name URL="">French AZERTY</Name>\n' +
    '    <Description URL="">French AZERTY keyboard, generated by Keyboard Studio.</Description>\n  </Info>\n' +
    "  <Files>\n    <File>\n      <Name>..\\build\\basic_kbdfr.kmx</Name>\n      <FileType>.kmx</FileType>\n    </File>\n  </Files>\n" +
    "  <Keyboards>\n    <Keyboard>\n      <Name>French AZERTY</Name>\n      <ID>basic_kbdfr</ID>\n" +
    "      <Version>1.0</Version>\n      <Languages>\n" +
    '        <Language ID="fr">fr</Language>\n' +
    "      </Languages>\n    </Keyboard>\n  </Keyboards>\n" +
    "</Package>\n";

  function copyTrackVfs() {
    return createVirtualFS([
      { path: "source/basic_kbdfr.kmn", content: "c base\nstore(&TARGETS) 'any'\n", isBinary: false },
      { path: "source/basic_kbdfr.kps", content: FRENCH_KPS, isBinary: false },
    ]);
  }

  const BAMBARA = { displayName: "Bambara", bcp47: "bm-Latn", languageName: "Bambara" };

  it("declares the author's language and name, not the base's (US1, FR-001…FR-003)", async () => {
    const { projectWorkingCopyVfs } = await import("./projectWorkingCopyVfs.ts");
    const vfs = copyTrackVfs();
    const { warnings } = projectWorkingCopyVfs({
      vfs,
      keyboardId: "basic_kbdfr",
      baseIr: makeTestIR([]),
      deletedNodeIds: new Set(),
      assignments: [],
      getPattern: () => undefined,
      identity: BAMBARA,
    });

    const kps = vfs.get("source/basic_kbdfr.kps")?.content;
    expect(typeof kps).toBe("string");
    expect(kps).toContain('<Language ID="bm-Latn">Bambara</Language>');
    expect(kps).not.toContain('ID="fr"');
    expect(kps).toContain('<Name URL="">Bambara</Name>');
    expect(kps).not.toContain("French AZERTY");
    expect(warnings).toEqual([]);
  });

  // D-02: step 3.6 runs BEFORE the rename, writing under the pre-rename id, and
  // rewriteKpsFilePaths's skip of non-path-shaped <Name> values is what carries the
  // display names through. Inverting the two steps breaks one or the other.
  it("survives the step-4 rename with the identity intact", async () => {
    const { projectWorkingCopyVfs } = await import("./projectWorkingCopyVfs.ts");
    const vfs = copyTrackVfs();
    projectWorkingCopyVfs({
      vfs,
      keyboardId: "basic_kbdfr",
      targetKeyboardId: "bm_sil",
      baseIr: makeTestIR([]),
      deletedNodeIds: new Set(),
      assignments: [],
      getPattern: () => undefined,
      identity: BAMBARA,
    });

    expect(vfs.get("source/basic_kbdfr.kps")).toBeUndefined();
    const kps = vfs.get("source/bm_sil.kps")?.content;
    expect(kps).toContain('<Language ID="bm-Latn">Bambara</Language>');
    expect(kps).toContain('<Name URL="">Bambara</Name>');
    // The rename pass owns <ID> and the <Files> paths — step 3.6 left both alone
    // and this is what it looks like when the two compose.
    expect(kps).toContain("<ID>bm_sil</ID>");
    expect(kps).toContain("..\\build\\bm_sil.kmx");
  });

  it("generates a descriptor when the track has none (US3, FR-006)", async () => {
    const { projectWorkingCopyVfs } = await import("./projectWorkingCopyVfs.ts");
    const vfs = createVirtualFS([
      { path: "source/bm_sil.kmn", content: "c adapt\nstore(&TARGETS) 'any'\n", isBinary: false },
    ]);
    const { warnings } = projectWorkingCopyVfs({
      vfs,
      keyboardId: "bm_sil",
      baseIr: makeTestIR([]),
      deletedNodeIds: new Set(),
      assignments: [],
      getPattern: () => undefined,
      identity: BAMBARA,
    });

    const kps = vfs.get("source/bm_sil.kps")?.content;
    expect(kps).toContain('<Language ID="bm-Latn">Bambara</Language>');
    // Named, not silent (FR-006) — the pre-057 adapt path failed invisibly.
    expect(warnings).toEqual([
      "[package-descriptor] generated a package descriptor for bm_sil (none was present)",
    ]);
  });

  it("declares the und placeholder, never the base's tag, on a blank code (US1-3, FR-007)", async () => {
    const { projectWorkingCopyVfs } = await import("./projectWorkingCopyVfs.ts");
    const vfs = copyTrackVfs();
    projectWorkingCopyVfs({
      vfs,
      keyboardId: "basic_kbdfr",
      baseIr: makeTestIR([]),
      deletedNodeIds: new Set(),
      assignments: [],
      getPattern: () => undefined,
      identity: { displayName: "Bambara" },
    });

    const kps = vfs.get("source/basic_kbdfr.kps")?.content;
    expect(kps).toContain('<Language ID="und">und</Language>');
    expect(kps).not.toContain('ID="fr"');
  });

  it("leaves the descriptor untouched when there is no identity overlay at all", async () => {
    const { projectWorkingCopyVfs } = await import("./projectWorkingCopyVfs.ts");
    const vfs = copyTrackVfs();
    projectWorkingCopyVfs({
      vfs,
      keyboardId: "basic_kbdfr",
      baseIr: makeTestIR([]),
      deletedNodeIds: new Set(),
      assignments: [],
      getPattern: () => undefined,
      identity: null,
    });
    expect(vfs.get("source/basic_kbdfr.kps")?.content).toBe(FRENCH_KPS);
  });
});

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

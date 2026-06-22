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

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { createVirtualFS } from "@keyboard-studio/contracts";
import { makeTestIR } from "@keyboard-studio/contracts/fixtures";
import type { MechanismAssignment } from "@keyboard-studio/contracts";

// ---------------------------------------------------------------------------
// Spy on the three engine functions
// ---------------------------------------------------------------------------

const applyCarveToVfsSpy = vi.fn(
  (_vfs: unknown, _id: string, _ir: unknown, _ids: unknown) => ({
    warnings: [] as string[],
  }),
);
const applyAssignmentsToVfsSpy = vi.fn(
  (_vfs: unknown, _id: string, _a: unknown, _fn: unknown) => ({
    kmn: "c mock",
    warnings: [] as string[],
  }),
);
const applyIdentityStubMutationSpy = vi.fn(
  (_vfs: unknown, _id: string, _identity: unknown): void => {
    /* no-op */
  },
);

vi.mock("@keyboard-studio/engine", async (importOriginal) => {
  const original = await importOriginal<typeof import("@keyboard-studio/engine")>();
  return {
    ...original,
    applyCarveToVfs: applyCarveToVfsSpy,
    applyAssignmentsToVfs: applyAssignmentsToVfsSpy,
    applyIdentityStubMutation: applyIdentityStubMutationSpy,
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
});

afterEach(() => {
  vi.clearAllMocks();
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
    expect(applyCarveToVfsSpy).toHaveBeenCalledWith(vfs, "test_kb", ir, new Set());
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
    expect(applyCarveToVfsSpy).toHaveBeenCalledWith(vfs, "test_kb", ir, deleted);
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
});

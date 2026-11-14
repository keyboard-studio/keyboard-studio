// projectWorkingCopyVfs tests: carve, assignments, identity, warnings, touch layout, id rename.
// Split from the former projectWorkingCopyVfs.test.ts; shared fixtures live in
// ../test/projectWorkingCopyVfsTestkit.ts.

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { createVirtualFS } from "@keyboard-studio/contracts";
import { makeTestIR } from "@keyboard-studio/contracts/fixtures";
import { makeVfs, makePhysicalAssignment, makeTouchAssignment } from "../test/projectWorkingCopyVfsTestkit.ts";

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
      startIr: ir,
      deletedNodeIds: new Set(),
      assignments: [],
      getPattern: () => undefined,
      identity: null,
    });
    expect(applyCarveToVfsSpy).toHaveBeenCalledWith(vfs, "test_kb", ir, new Set(), { irRewritten: false });
  });

  // Spec 089 T021/T022: deletions no longer reach applyCarveToVfs as a set.
  // The (now unconditional) seam path runs applyCarveMutate over the base IR
  // first — deletedNodeIds/deletedItemIds are consumed THERE — and hands
  // applyCarveToVfs the already-filtered IR with an EMPTY deletion set and
  // irRewritten: true. The byte-level proof that the deletions still take
  // effect lives in projectWorkingCopyVfs.flagParity.test.ts (real pipeline,
  // golden artifacts); these tests pin the new call shape.
  it("forwards deletedNodeIds into the seam carve (filtered IR + empty set to applyCarveToVfs)", async () => {
    const { projectWorkingCopyVfs } = await import("./projectWorkingCopyVfs.ts");
    const vfs = makeVfs();
    const ir = makeTestIR([]);
    const deleted = new Set(["rule#0", "rule#1"]);
    projectWorkingCopyVfs({
      vfs,
      keyboardId: "test_kb",
      startIr: ir,
      deletedNodeIds: deleted,
      assignments: [],
      getPattern: () => undefined,
      identity: null,
    });
    expect(applyCarveToVfsSpy).toHaveBeenCalledWith(
      vfs,
      "test_kb",
      expect.any(Object),
      new Set(),
      { irRewritten: true },
    );
    // The IR handed over is the seam's output, not the base IR itself.
    const seamIr = applyCarveToVfsSpy.mock.calls[0]![2];
    expect(seamIr).not.toBe(ir);
  });

  // AC#2 regression, re-pinned: a deletedItemIds-only edit likewise routes
  // through the seam (the union merge now happens inside the projection,
  // feeding applyCarveMutate — see effectiveItemIds there).
  it("merges deletedItemIds (only) into the seam carve", async () => {
    const { projectWorkingCopyVfs } = await import("./projectWorkingCopyVfs.ts");
    const vfs = makeVfs();
    const ir = makeTestIR([]);
    projectWorkingCopyVfs({
      vfs,
      keyboardId: "test_kb",
      startIr: ir,
      deletedNodeIds: new Set(),
      deletedItemIds: new Set(["rule#0", "rule#1"]),
      assignments: [],
      getPattern: () => undefined,
      identity: null,
    });
    expect(applyCarveToVfsSpy).toHaveBeenCalledWith(
      vfs,
      "test_kb",
      expect.any(Object),
      new Set(),
      { irRewritten: true },
    );
  });

  // AC#2 regression, re-pinned: when both are non-empty, both feed the seam.
  it("merges deletedNodeIds + deletedItemIds into the seam carve", async () => {
    const { projectWorkingCopyVfs } = await import("./projectWorkingCopyVfs.ts");
    const vfs = makeVfs();
    const ir = makeTestIR([]);
    projectWorkingCopyVfs({
      vfs,
      keyboardId: "test_kb",
      startIr: ir,
      deletedNodeIds: new Set(["group#A"]),
      deletedItemIds: new Set(["rule#0"]),
      assignments: [],
      getPattern: () => undefined,
      identity: null,
    });
    expect(applyCarveToVfsSpy).toHaveBeenCalledWith(
      vfs,
      "test_kb",
      expect.any(Object),
      new Set(),
      { irRewritten: true },
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
      startIr: makeTestIR([]),
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
      startIr: makeTestIR([]),
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
      startIr: makeTestIR([]),
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
      startIr: makeTestIR([]),
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
      startIr: makeTestIR([]),
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
      startIr: makeTestIR([]),
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
      startIr: makeTestIR([]),
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
      startIr: makeTestIR([]),
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
      startIr: makeTestIR([]),
      deletedNodeIds: new Set(),
      assignments: [],
      getPattern: () => undefined,
      // Must DIFFER from makeTestIR's base name ("Test") to be treated as an
      // edit — step 3 only invokes applyIdentityStubMutation on a changed name,
      // which is what makes the throw path reachable here.
      identity: { displayName: "My Keyboard" },
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
      startIr: makeTestIR([]),
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
      startIr: makeTestIR([]),
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
      startIr: makeTestIR([]),
      deletedNodeIds: new Set(["some-node"]),
      assignments: [],
      getPattern: () => undefined,
      identity: null,
    });
    // The VFS was mutated in-place by the mock.
    // (The always-on TARGETS step then prepends store(&TARGETS) 'any'.)
    expect(vfs.get("source/test_kb.kmn")?.content).toContain("c mutated\n");
  });
});

describe("projectWorkingCopyVfs — target platforms (step 3.1)", () => {
  const project = async (kmn: string): Promise<string> => {
    const { projectWorkingCopyVfs } = await import("./projectWorkingCopyVfs.ts");
    const vfs = createVirtualFS([{ path: "source/test_kb.kmn", content: kmn, isBinary: false }]);
    projectWorkingCopyVfs({
      vfs,
      keyboardId: "test_kb",
      startIr: makeTestIR([]),
      deletedNodeIds: new Set(),
      assignments: [],
      getPattern: () => undefined,
      identity: null,
    });
    return vfs.get("source/test_kb.kmn")?.content as string;
  };

  it("rewrites a start keyboard's store(&TARGETS) 'windows' to 'any'", async () => {
    const out = await project("store(&NAME) 'K'\nstore(&TARGETS) 'windows'\nbegin Unicode > use(main)\n");
    expect(out).toContain("store(&TARGETS) 'any'");
    expect(out).not.toContain("'windows'");
  });

  it("inserts store(&TARGETS) 'any' when the start keyboard declares none", async () => {
    const out = await project("store(&NAME) 'K'\nbegin Unicode > use(main)\n");
    expect(out.match(/store\(&TARGETS\) 'any'/g)).toHaveLength(1);
    // After the last system store, before `begin`.
    expect(out.indexOf("store(&TARGETS)")).toBeGreaterThan(out.indexOf("store(&NAME)"));
    expect(out.indexOf("store(&TARGETS)")).toBeLessThan(out.indexOf("begin Unicode"));
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
      startIr: makeTestIR([]),
      deletedNodeIds: new Set(),
      assignments: [],
      getPattern: () => undefined,
      identity: null,
      touchLayoutJson: touchJson,
    });
    const entry = vfs.get("source/test_kb.keyman-touch-layout");
    expect(entry).toBeDefined();
    // A one-line layout (e.g. restored from a draft saved before every writer
    // tabulated its output) is re-indented: Keyman Developer cannot open it.
    expect(entry?.content).toBe(JSON.stringify(JSON.parse(touchJson), null, 2));
  });

  it("leaves an already-tabulated touchLayoutJson byte-identical", async () => {
    const { projectWorkingCopyVfs } = await import("./projectWorkingCopyVfs.ts");
    const vfs = makeVfs();
    const touchJson = '{\n  "phone": {\n    "layer": []\n  }\n}';
    projectWorkingCopyVfs({
      vfs,
      keyboardId: "test_kb",
      startIr: makeTestIR([]),
      deletedNodeIds: new Set(),
      assignments: [],
      getPattern: () => undefined,
      identity: null,
      touchLayoutJson: touchJson,
    });
    expect(vfs.get("source/test_kb.keyman-touch-layout")?.content).toBe(touchJson);
  });

  it("does NOT create a .keyman-touch-layout entry when touchLayoutJson is null", async () => {
    const { projectWorkingCopyVfs } = await import("./projectWorkingCopyVfs.ts");
    const vfs = makeVfs();
    projectWorkingCopyVfs({
      vfs,
      keyboardId: "test_kb",
      startIr: makeTestIR([]),
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
      startIr: makeTestIR([]),
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
      startIr: makeTestIR([]),
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
      startIr: makeTestIR([]),
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
    expect(renamed?.content).toBe(JSON.stringify(JSON.parse(touchJson), null, 2));
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
      startIr: makeTestIR([]),
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

  it("relinks the author's start-id CSS when the VFS is already scaffolded under the new id", async () => {
    // The Track 1 preview: the scaffolder already renamed everything, so step 4 has nothing to do and step 0b must relink.
    const { projectWorkingCopyVfs } = await import("./projectWorkingCopyVfs.ts");
    const vfs = createVirtualFS([
      { path: "source/ewondo.kmn", content: "c stub\n", isBinary: false },
      { path: "source/ewondo.css", content: ".kmw-keyboard-ewondo .x{}", isBinary: false },
    ]);
    projectWorkingCopyVfs({
      vfs,
      keyboardId: "ewondo",
      startKeyboardId: "sil_akebu",
      customCss: ".kmw-keyboard-sil_akebu .kmw-key { color: red; }",
      startIr: makeTestIR([]),
      deletedNodeIds: new Set(),
      assignments: [],
      getPattern: () => undefined,
      identity: null,
    });
    expect(vfs.get("source/ewondo.css")?.content).toBe(".kmw-keyboard-ewondo .kmw-key { color: red; }");
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
      startIr: makeTestIR([]),
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
      startIr: makeTestIR([]),
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
      startIr: makeTestIR([]),
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
      startIr: makeTestIR([]),
      deletedNodeIds: new Set(),
      assignments: [],
      getPattern: () => undefined,
      identity: null,
    });
    expect(result.effectiveKeyboardId).toBeUndefined();
  });
});

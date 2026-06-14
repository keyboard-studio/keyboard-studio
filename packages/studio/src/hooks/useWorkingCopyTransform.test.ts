// Tests for useWorkingCopyTransform.
//
// Coverage goals:
//   1. Returns null when workingCopyStore has no baseIr (not yet instantiated).
//   2. Returns a VfsTransform function when baseIr is set.
//   3. The transform applies carve deletions (calls applyCarveToVfs).
//   4. The transform applies assignments when patternMap is supplied.
//   5. The transform applies identity (calls applyIdentityStubMutation).
//   6. The transform returns accumulated warnings from all three layers.
//   7. Memoization: same transform reference returned when no layer changes.
//   8. Different transform reference when a layer changes (deletedNodeIds).
//   9. When patternMap is null and assignments exist, a warning is added.
//
// Approach: mock @keyboard-studio/engine to spy on the three projection
// functions. Render the hook via renderHook with the store seeded.

import { describe, it, expect, vi, afterEach, beforeEach } from "vitest";
import { renderHook, act } from "@testing-library/react";
import { useWorkingCopyStore } from "../stores/workingCopyStore.ts";
import { createVirtualFS } from "@keyboard-studio/contracts";
import { makeTestIR, basicKbdus } from "@keyboard-studio/contracts/fixtures";
import type { Pattern } from "@keyboard-studio/contracts";

// ---------------------------------------------------------------------------
// Spies on the three projection functions
// ---------------------------------------------------------------------------

const applyCarveToVfsSpy = vi.fn((_vfs: unknown, _id: string, _ir: unknown, _ids: unknown) => ({
  warnings: [] as string[],
}));
const applyAssignmentsToVfsSpy = vi.fn((_vfs: unknown, _id: string, _a: unknown, _fn: unknown) => ({
  kmn: "c mock",
  warnings: [] as string[],
}));
const applyIdentityStubMutationSpy = vi.fn((_vfs: unknown, _id: string, _identity: unknown) => {
  /* no-op */
});

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

function resetStore() {
  useWorkingCopyStore.getState().reset();
}

function seedBase() {
  const vfs = createVirtualFS([
    { path: "source/basic_kbdus.kmn", content: "c test\n", isBinary: false },
  ]);
  useWorkingCopyStore.getState().instantiateFromBase(basicKbdus, {
    vfs,
    ir: makeTestIR([]),
  });
}

beforeEach(resetStore);
afterEach(() => {
  resetStore();
  vi.clearAllMocks();
});

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe("useWorkingCopyTransform — null when not instantiated", () => {
  it("returns null when baseIr is null (not yet instantiated)", async () => {
    const { useWorkingCopyTransform } = await import("./useWorkingCopyTransform.ts");
    const { result } = renderHook(() => useWorkingCopyTransform());
    expect(result.current).toBeNull();
  });
});

describe("useWorkingCopyTransform — returns a function when instantiated", () => {
  it("returns a VfsTransform function after instantiation", async () => {
    const { useWorkingCopyTransform } = await import("./useWorkingCopyTransform.ts");
    seedBase();
    const { result } = renderHook(() => useWorkingCopyTransform());
    expect(result.current).not.toBeNull();
    expect(typeof result.current).toBe("function");
  });
});

describe("useWorkingCopyTransform — projection steps", () => {
  it("always calls applyCarveToVfs (step 1)", async () => {
    const { useWorkingCopyTransform } = await import("./useWorkingCopyTransform.ts");
    seedBase();
    const { result } = renderHook(() => useWorkingCopyTransform());
    const vfs = createVirtualFS([
      { path: "source/basic_kbdus.kmn", content: "c test\n", isBinary: false },
    ]);
    result.current!(vfs, "basic_kbdus");
    expect(applyCarveToVfsSpy).toHaveBeenCalledWith(
      vfs,
      "basic_kbdus",
      expect.anything(), // baseIr
      expect.anything(), // deletedNodeIds (empty Set)
    );
  });

  it("calls applyAssignmentsToVfs when patternMap is supplied and assignments exist", async () => {
    const { useWorkingCopyTransform } = await import("./useWorkingCopyTransform.ts");
    seedBase();
    // Add a Phase C assignment to the store.
    useWorkingCopyStore.getState().recordAssignments([
      {
        scope: "keyboard-default",
        target: "",
        modality: "physical",
        mechanisms: [{ patternId: "test-pattern" }],
        source: "user",
      },
    ]);
    const mockPattern: Pattern = {
      id: "test-pattern",
      title: "Test",
      description: "A test pattern",
      questions: [],
      demo: null,
      template: "",
      appliesTo: [],
    };
    const patternMap = new Map([["test-pattern", mockPattern]]);
    const { result } = renderHook(() => useWorkingCopyTransform({ patternMap }));
    const vfs = createVirtualFS([
      { path: "source/basic_kbdus.kmn", content: "c test\n", isBinary: false },
    ]);
    result.current!(vfs, "basic_kbdus");
    expect(applyAssignmentsToVfsSpy).toHaveBeenCalledWith(
      vfs,
      "basic_kbdus",
      expect.arrayContaining([
        expect.objectContaining({ modality: "physical" }),
      ]),
      expect.any(Function),
    );
  });

  it("does NOT call applyAssignmentsToVfs when there are no assignments", async () => {
    const { useWorkingCopyTransform } = await import("./useWorkingCopyTransform.ts");
    seedBase();
    const patternMap = new Map<string, Pattern>();
    const { result } = renderHook(() => useWorkingCopyTransform({ patternMap }));
    const vfs = createVirtualFS([
      { path: "source/basic_kbdus.kmn", content: "c test\n", isBinary: false },
    ]);
    result.current!(vfs, "basic_kbdus");
    expect(applyAssignmentsToVfsSpy).not.toHaveBeenCalled();
  });

  it("calls applyIdentityStubMutation when identity.displayName is set (step 3)", async () => {
    const { useWorkingCopyTransform } = await import("./useWorkingCopyTransform.ts");
    seedBase();
    useWorkingCopyStore.getState().setIdentity({ displayName: "Hausa Keyboard" });
    const { result } = renderHook(() => useWorkingCopyTransform());
    const vfs = createVirtualFS([
      { path: "source/basic_kbdus.kmn", content: "c test\n", isBinary: false },
    ]);
    result.current!(vfs, "basic_kbdus");
    expect(applyIdentityStubMutationSpy).toHaveBeenCalledWith(
      vfs,
      "basic_kbdus",
      expect.objectContaining({ name: "Hausa Keyboard" }),
    );
  });

  it("does NOT call applyIdentityStubMutation when identity is null", async () => {
    const { useWorkingCopyTransform } = await import("./useWorkingCopyTransform.ts");
    seedBase();
    // identity is null after instantiateFromBase (Track 1).
    expect(useWorkingCopyStore.getState().identity).toBeNull();
    const { result } = renderHook(() => useWorkingCopyTransform());
    const vfs = createVirtualFS([
      { path: "source/basic_kbdus.kmn", content: "c test\n", isBinary: false },
    ]);
    result.current!(vfs, "basic_kbdus");
    expect(applyIdentityStubMutationSpy).not.toHaveBeenCalled();
  });

  it("accumulates warnings from all three layers and returns them", async () => {
    const { useWorkingCopyTransform } = await import("./useWorkingCopyTransform.ts");
    seedBase();
    // Make carve and assignments each return a warning.
    applyCarveToVfsSpy.mockReturnValueOnce({ warnings: ["carve-warning"] });
    applyAssignmentsToVfsSpy.mockReturnValueOnce({ kmn: "", warnings: ["assign-warning"] });
    useWorkingCopyStore.getState().recordAssignments([
      {
        scope: "keyboard-default",
        target: "",
        modality: "physical",
        mechanisms: [{ patternId: "p" }],
        source: "user",
      },
    ]);
    const mockPattern: Pattern = {
      id: "p",
      title: "P",
      description: "",
      questions: [],
      demo: null,
      template: "",
      appliesTo: [],
    };
    const patternMap = new Map([["p", mockPattern]]);
    const { result } = renderHook(() => useWorkingCopyTransform({ patternMap }));
    const vfs = createVirtualFS([
      { path: "source/basic_kbdus.kmn", content: "c test\n", isBinary: false },
    ]);
    const { warnings } = result.current!(vfs, "basic_kbdus");
    expect(warnings).toContain("carve-warning");
    expect(warnings).toContain("assign-warning");
  });
});

describe("useWorkingCopyTransform — memoization", () => {
  it("returns the same transform reference when no layer changes between renders", async () => {
    const { useWorkingCopyTransform } = await import("./useWorkingCopyTransform.ts");
    seedBase();
    const { result, rerender } = renderHook(() => useWorkingCopyTransform());
    const first = result.current;
    rerender();
    expect(result.current).toBe(first);
  });

  it("returns a new transform reference when deletedNodeIds changes", async () => {
    const { useWorkingCopyTransform } = await import("./useWorkingCopyTransform.ts");
    seedBase();
    const { result } = renderHook(() => useWorkingCopyTransform());
    const first = result.current;
    // Add a deletion.
    act(() => {
      useWorkingCopyStore.getState().deleteNode("rule#0");
    });
    // The hook re-renders because the store changed — result.current should be new.
    expect(result.current).not.toBe(first);
  });
});

describe("useWorkingCopyTransform — assignment-warning when patternMap is null", () => {
  it("adds a warning when assignments exist but patternMap is null", async () => {
    const { useWorkingCopyTransform } = await import("./useWorkingCopyTransform.ts");
    seedBase();
    useWorkingCopyStore.getState().recordAssignments([
      {
        scope: "keyboard-default",
        target: "",
        modality: "physical",
        mechanisms: [{ patternId: "test" }],
        source: "user",
      },
    ]);
    // No patternMap supplied.
    const { result } = renderHook(() => useWorkingCopyTransform());
    const vfs = createVirtualFS([
      { path: "source/basic_kbdus.kmn", content: "c test\n", isBinary: false },
    ]);
    const { warnings } = result.current!(vfs, "basic_kbdus");
    expect(warnings.some((w) => w.includes("assignment projection skipped"))).toBe(true);
    expect(applyAssignmentsToVfsSpy).not.toHaveBeenCalled();
  });
});

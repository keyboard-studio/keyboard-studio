// Hook test for useCriteriaFindings (spec 084, Phase 2, T2.2/T2.3;
// Batch 4 inventory wiring).
//
// The hook is handed a ready stage (the host owns the one artifact
// pipeline instance — see the hook's header) over the same fixture VFS
// shape as assembleLintContext.test.ts, and must surface the engine's
// §18 touch finding, report §18.6 as context-missing when no inventory
// can be built (here: the working-copy store is untouched, so no
// language target is recorded and no baseline can be formed), and flip
// `ready` only once the engine run for that exact VFS has settled.
// With an identity tag recorded, the Batch 4 build runs: exemplar
// resolution is mocked at the services seam (the pattern
// useSourcedExemplars.test.tsx sets), and §18.6 produces real findings.

import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, renderHook, waitFor } from "@testing-library/react";

import { createVirtualFS } from "@keyboard-studio/contracts";
import type { VirtualFS } from "@keyboard-studio/contracts";

const { exemplarLookup } = vi.hoisted(() => ({ exemplarLookup: vi.fn() }));

vi.mock("../lib/services.ts", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../lib/services.ts")>();
  return {
    ...actual,
    sourcedExemplars: (tag: string) => exemplarLookup(tag),
  };
});

import type { SourcedInventory } from "../lib/services.ts";
import { useWorkingCopyStore } from "../stores/workingCopyStore.ts";
import { useCriteriaFindings } from "./useCriteriaFindings.ts";
import type { Stage } from "./useKeyboardArtifact.ts";

const initialWorkingCopy = useWorkingCopyStore.getState();

afterEach(() => {
  // Unmount the hook roots while jsdom is still alive (see
  // useCompareCriteria.test.ts: no RTL auto-cleanup with globals off,
  // and a late commit after teardown fails the suite as an unhandled
  // error). Runs first so effect cleanups cancel in-flight runs before
  // the store reset below.
  cleanup();
  useWorkingCopyStore.setState(initialWorkingCopy, true);
  exemplarLookup.mockReset();
});

const KEYBOARD_ID = "criteria_hook_fixture";

const KMN = [
  "store(&VERSION) '10.0'",
  "store(&NAME) 'Criteria Hook Fixture'",
  "store(&KEYBOARDVERSION) '1.0'",
  "",
  "begin Unicode > use(main)",
  "",
  "group(main) using keys",
  "",
  "+ [K_A] > 'a'",
  "",
].join("\n");

const TOUCH_LAYOUT = JSON.stringify({
  phone: {
    layer: [
      {
        id: "default",
        row: [{ id: 1, key: [{ id: "K_A", text: "a" }] }],
      },
    ],
  },
});

function fixtureVfs(): VirtualFS {
  return createVirtualFS([
    { path: `source/${KEYBOARD_ID}.kmn`, content: KMN, isBinary: false },
    {
      path: `source/${KEYBOARD_ID}.keyman-touch-layout`,
      content: TOUCH_LAYOUT,
      isBinary: false,
    },
  ]);
}

function readyStage(vfs: VirtualFS): Stage {
  // Only the fields the hook reads are real; the compile-result/blob
  // fields belong to the host pipeline and are irrelevant here.
  return {
    kind: "ready",
    vfs,
    keyboardId: KEYBOARD_ID,
    compileResult: { diagnostics: [] },
    jsBlobUrl: "",
    scaffoldWarnings: [],
  } as unknown as Stage;
}

describe("useCriteriaFindings", () => {
  it("is not ready and judges nothing for a non-ready stage", () => {
    const { result } = renderHook(() => useCriteriaFindings({ kind: "idle" }));
    expect(result.current.ready).toBe(false);
    expect(result.current.keyboardId).toBeNull();
    expect(result.current.vfs).toBeNull();
    expect(result.current.lintFindings).toEqual([]);
  });

  it("runs the engine over the handed-in stage VFS once ready", async () => {
    const vfs = fixtureVfs();
    const { result } = renderHook(() => useCriteriaFindings(readyStage(vfs)));

    await waitFor(() => expect(result.current.ready).toBe(true));

    expect(result.current.keyboardId).toBe(KEYBOARD_ID);
    expect(result.current.vfs).toBe(vfs);
    const codes = result.current.lintFindings.map((f) => f.code);
    expect(codes).toContain("KM_WARN_TOUCH_ROW_COUNT");
    expect(codes).not.toContain("KM_LINT_INVENTORY_UNCOVERED");
    // No working copy => no language target recorded => the Batch 4
    // build skips and §18.6 names the un-formable baseline.
    expect(result.current.contextMissing["KM_LINT_INVENTORY_UNCOVERED"]).toContain(
      "no language target is recorded",
    );
    expect(exemplarLookup).not.toHaveBeenCalled();
  });

  it("builds the inventory from the identity tag and runs §18.6 (Batch 4)", async () => {
    exemplarLookup.mockImplementation((tag: string) =>
      Promise.resolve(
        tag === "ewo"
          ? ({
              resolvedTag: "ewo",
              source: "cldr",
              confidence: "approved",
              characters: [
                { char: "a", tier: "main", source: "cldr", confidence: "approved" },
                { char: "ə", tier: "main", source: "cldr", confidence: "approved" },
                { char: "5", tier: "numbers", source: "cldr", confidence: "approved" },
              ],
              digraphs: [],
            } as unknown as SourcedInventory)
          : null,
      ),
    );
    useWorkingCopyStore.setState({ identity: { bcp47: "ewo" } });

    const vfs = fixtureVfs();
    const { result } = renderHook(() => useCriteriaFindings(readyStage(vfs)));

    await waitFor(() => expect(result.current.ready).toBe(true));

    // The fixture .kmn produces only 'a': the baseline's ə and 5 are
    // uncovered, and §18.6 is NOT context-missing — the check ran.
    const uncovered = result.current.lintFindings.filter(
      (f) => f.code === "KM_LINT_INVENTORY_UNCOVERED",
    );
    expect(uncovered).toHaveLength(2);
    expect(
      result.current.contextMissing["KM_LINT_INVENTORY_UNCOVERED"],
    ).toBeUndefined();
  });

  it("names the tag when its CLDR/SLDR lookup comes back empty (Batch 4 skip)", async () => {
    exemplarLookup.mockResolvedValue(null);
    useWorkingCopyStore.setState({ identity: { bcp47: "xyz" } });

    const vfs = fixtureVfs();
    const { result } = renderHook(() => useCriteriaFindings(readyStage(vfs)));

    await waitFor(() => expect(result.current.ready).toBe(true));

    const codes = result.current.lintFindings.map((f) => f.code);
    expect(codes).not.toContain("KM_LINT_INVENTORY_UNCOVERED");
    expect(result.current.contextMissing["KM_LINT_INVENTORY_UNCOVERED"]).toContain(
      "no CLDR/SLDR entry for xyz",
    );
  });
});

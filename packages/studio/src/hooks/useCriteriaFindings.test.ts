// Hook test for useCriteriaFindings (spec 084, Phase 2, T2.2/T2.3).
//
// The hook is handed a ready stage (the host owns the one artifact
// pipeline instance — see the hook's header) over the same fixture VFS
// shape as assembleLintContext.test.ts, and must surface the engine's
// §18 touch finding, report §18.6 as context-missing (no inventory is
// built in production), and flip `ready` only once the engine run for
// that exact VFS has settled. The working-copy store is untouched, so
// useDocumentationFindings contributes no doc findings here.

import { describe, expect, it } from "vitest";
import { renderHook, waitFor } from "@testing-library/react";

import { createVirtualFS } from "@keyboard-studio/contracts";
import type { VirtualFS } from "@keyboard-studio/contracts";

import { useCriteriaFindings } from "./useCriteriaFindings.ts";
import type { Stage } from "./useKeyboardArtifact.ts";

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
    expect(result.current.contextMissing["KM_LINT_INVENTORY_UNCOVERED"]).toContain(
      "linguist inventory",
    );
  });
});

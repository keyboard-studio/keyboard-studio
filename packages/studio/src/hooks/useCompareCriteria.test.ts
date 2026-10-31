// Hook test for useCompareCriteria (spec 084, Phase 5, T5.2).
//
// The hook is handed a CompareArtifact-shaped value (the host owns the
// artifact pipeline — see useCompareArtifact) over the same fixture VFS
// shape as useCriteriaFindings.test.ts, and must stay unready until the
// run for that exact VFS settles, then resolve the full catalog in
// foreign mode: no scaffolder-bake Met claims, §18.6 Not yet checkable
// (no inventory), and §§15–16 applicable by default (the facts warning
// in the hook header: no reliable deprecation/partner signal exists for
// a foreign keyboard, so they must NOT resolve Not applicable).

import { afterEach, describe, expect, it } from "vitest";
import { cleanup, renderHook, waitFor } from "@testing-library/react";

// Explicit cleanup is required: vitest runs with globals off, so React
// Testing Library's auto-cleanup never registers. Without it the hook
// roots stay mounted past the file's jsdom teardown and a late React
// commit lands after `window` is gone — vitest reports that as an
// unhandled "window is not defined" error and fails the whole suite
// even though every test passed (CI on 537de794).
afterEach(cleanup);

import { createVirtualFS } from "@keyboard-studio/contracts";
import type { VirtualFS } from "@keyboard-studio/contracts";

import { useCompareCriteria } from "./useCompareCriteria.ts";
import type { CompareArtifact } from "./useCompareArtifact.ts";
import type { Stage } from "./useKeyboardArtifact.ts";

const KEYBOARD_ID = "compare_criteria_fixture";

const KMN = [
  "store(&VERSION) '10.0'",
  "store(&NAME) 'Compare Criteria Fixture'",
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

function artifactFor(stage: Stage): CompareArtifact {
  return {
    startKeyboard: { id: KEYBOARD_ID, displayName: "Compare Criteria Fixture" },
    stage,
  } as unknown as CompareArtifact;
}

function readyStage(vfs: VirtualFS): Stage {
  return {
    kind: "ready",
    vfs,
    keyboardId: KEYBOARD_ID,
    compileResult: { diagnostics: [] },
    jsBlobUrl: "",
    scaffoldWarnings: [],
  } as unknown as Stage;
}

describe("useCompareCriteria", () => {
  it("is not ready and judges nothing for a non-ready stage", () => {
    const { result } = renderHook(() => useCompareCriteria(artifactFor({ kind: "idle" })));
    expect(result.current.ready).toBe(false);
    expect(result.current.result).toBeNull();
  });

  it("resolves the full catalog in foreign mode once the run settles", async () => {
    const vfs = fixtureVfs();
    const { result } = renderHook(() => useCompareCriteria(artifactFor(readyStage(vfs))));

    await waitFor(() => expect(result.current.ready).toBe(true));

    const judged = result.current.result;
    expect(judged).not.toBeNull();
    expect(judged?.total).toBe(188);
    expect(judged?.rows).toHaveLength(188);

    // Foreign mode offers no controls on any row (FR-023 / plan D2).
    expect(judged?.rows.every((row) => row.controls === null)).toBe(true);

    // D6: no scaffolder ran for a foreign keyboard, so no bake row is Met.
    const bakeRows = judged?.rows.filter((row) => row.criterion.band === "scaffolder-bake") ?? [];
    expect(bakeRows.length).toBeGreaterThan(0);
    expect(bakeRows.every((row) => row.status === "not-yet-checkable")).toBe(true);

    // §18.6 needs an inventory a foreign keyboard does not have: it must
    // resolve Not yet checkable, never Met.
    const inventoryRow = judged?.rows.find(
      (row) => row.criterion.id === "18.6-inventory-fully-covered",
    );
    expect(inventoryRow?.status).toBe("not-yet-checkable");

    // Facts warning: §§15–16 are applicable by default — no row there may
    // resolve Not applicable on absent deprecation/partner data.
    for (const prefix of ["15.", "16."]) {
      const rows = judged?.rows.filter((row) => row.criterion.section.startsWith(prefix)) ?? [];
      expect(rows.length).toBeGreaterThan(0);
      expect(rows.every((row) => row.status !== "not-applicable")).toBe(true);
    }

    // §9 font criteria DO resolve Not applicable on a positive VFS fact:
    // this fixture bundles no font.
    const fontRows = judged?.rows.filter((row) => row.criterion.section.startsWith("9.")) ?? [];
    expect(fontRows.length).toBeGreaterThan(0);
    expect(fontRows.every((row) => row.status === "not-applicable")).toBe(true);
  });

  it("does not carry a settled result over to a different VFS identity", async () => {
    const first = fixtureVfs();
    const { result, rerender } = renderHook(
      ({ artifact }: { artifact: CompareArtifact }) => useCompareCriteria(artifact),
      { initialProps: { artifact: artifactFor(readyStage(first)) } },
    );
    await waitFor(() => expect(result.current.ready).toBe(true));

    rerender({ artifact: artifactFor(readyStage(fixtureVfs())) });
    // The new VFS has not been judged yet: no stale verdicts are shown.
    expect(result.current.ready).toBe(false);
    expect(result.current.result).toBeNull();

    await waitFor(() => expect(result.current.ready).toBe(true));
  });
});

// Tests for useInventoryDiff — §8 inventory diff hook.
//
// Coverage:
//   1. baseIr null: lettersToAdd = full inventory, alreadyProduced = [].
//   2. baseIr with {a,e}: inventory {a,e,ŋ,ɓ} → lettersToAdd={ŋ,ɓ}, alreadyProduced={a,e}.
//   3. Empty inventory: lettersToAdd=[], alreadyProduced=[].
//   4. Base produces full inventory: lettersToAdd=[], alreadyProduced=all.
//   5. NFC edge: decomposed inventory entry matches precomposed base output.
//   6. Memoization: same InventoryDiff reference when nothing changes.
//   7. New reference when baseIr changes (mock a new produced set).
//   8. New reference when inventory changes.

import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { renderHook, act } from "@testing-library/react";
import { useWorkingCopyStore } from "../stores/workingCopyStore.ts";
import { createVirtualFS } from "@keyboard-studio/contracts";
import { makeTestIR } from "@keyboard-studio/contracts/fixtures";
import { basicKbdus } from "@keyboard-studio/contracts/fixtures";
import type { IRGroup } from "@keyboard-studio/contracts";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function resetStore() {
  useWorkingCopyStore.getState().reset();
}

/**
 * Build an IRGroup that emits the given characters as individual {kind:"char"}
 * rules (one rule per character). This is the simplest way to populate a base IR
 * with a known produced-glyph set.
 */
function makeGroupWithChars(chars: string[]): IRGroup {
  return {
    nodeId: "g0",
    name: "main",
    usingKeys: false,
    readonly: false,
    rules: chars.map((char, i) => ({
      nodeId: `rule#${i}`,
      context: [],
      output: [{ kind: "char" as const, value: char }],
    })),
  };
}

function seedBaseWithChars(chars: string[]) {
  const ir = makeTestIR([makeGroupWithChars(chars)]);
  const vfs = createVirtualFS([
    { path: "source/basic_kbdus.kmn", content: "c test\n", isBinary: false },
  ]);
  useWorkingCopyStore.getState().instantiateFromBase(basicKbdus, { vfs, ir });
}

function setInventory(chars: string[]) {
  // Record a Phase B result that carries confirmedInventory as a direct field.
  // mergePhaseResults() reads phase.confirmedInventory (not answers) to build
  // session.confirmedInventory — see contracts/src/surveySession.ts.
  useWorkingCopyStore.getState().recordPhase({
    phase: "B",
    answers: [],
    confirmedInventory: chars,
  });
}

beforeEach(resetStore);
afterEach(resetStore);

// ---------------------------------------------------------------------------
// 1. baseIr null — fallback to full inventory
// ---------------------------------------------------------------------------

describe("useInventoryDiff — baseIr null fallback", () => {
  it("returns lettersToAdd = full inventory when baseIr is null", async () => {
    const { useInventoryDiff } = await import("./useInventoryDiff.ts");
    // Set inventory without instantiating (baseIr stays null).
    setInventory(["a", "e", "ŋ", "ɓ"]);
    const { result } = renderHook(() => useInventoryDiff());
    expect(result.current.lettersToAdd).toEqual(["a", "e", "ŋ", "ɓ"]);
    expect(result.current.alreadyProduced).toEqual([]);
  });

  it("returns empty arrays when inventory is empty and baseIr is null", async () => {
    const { useInventoryDiff } = await import("./useInventoryDiff.ts");
    const { result } = renderHook(() => useInventoryDiff());
    expect(result.current.lettersToAdd).toEqual([]);
    expect(result.current.alreadyProduced).toEqual([]);
  });
});

// ---------------------------------------------------------------------------
// 2. Core diff: base produces {a,e}, inventory {a,e,ŋ,ɓ}
// ---------------------------------------------------------------------------

describe("useInventoryDiff — core diff", () => {
  it("lettersToAdd = {ŋ,ɓ} and alreadyProduced = {a,e} when base produces {a,e}", async () => {
    const { useInventoryDiff } = await import("./useInventoryDiff.ts");
    seedBaseWithChars(["a", "e"]);
    setInventory(["a", "e", "ŋ", "ɓ"]);
    const { result } = renderHook(() => useInventoryDiff());
    expect(result.current.lettersToAdd).toEqual(["ŋ", "ɓ"]);
    expect(result.current.alreadyProduced).toEqual(["a", "e"]);
  });

  it("lettersToAdd is empty when base produces the full inventory", async () => {
    const { useInventoryDiff } = await import("./useInventoryDiff.ts");
    seedBaseWithChars(["a", "e", "ŋ", "ɓ"]);
    setInventory(["a", "e", "ŋ", "ɓ"]);
    const { result } = renderHook(() => useInventoryDiff());
    expect(result.current.lettersToAdd).toEqual([]);
    expect(result.current.alreadyProduced).toEqual(["a", "e", "ŋ", "ɓ"]);
  });

  it("alreadyProduced is empty when base produces nothing in the inventory", async () => {
    const { useInventoryDiff } = await import("./useInventoryDiff.ts");
    // Base produces only 'x'; inventory has none of those.
    seedBaseWithChars(["x"]);
    setInventory(["a", "e", "ŋ", "ɓ"]);
    const { result } = renderHook(() => useInventoryDiff());
    expect(result.current.lettersToAdd).toEqual(["a", "e", "ŋ", "ɓ"]);
    expect(result.current.alreadyProduced).toEqual([]);
  });

  it("empty inventory always gives empty arrays regardless of what the base produces", async () => {
    const { useInventoryDiff } = await import("./useInventoryDiff.ts");
    seedBaseWithChars(["a", "e"]);
    // No Phase B answer — confirmedInventory defaults to [].
    const { result } = renderHook(() => useInventoryDiff());
    expect(result.current.lettersToAdd).toEqual([]);
    expect(result.current.alreadyProduced).toEqual([]);
  });
});

// ---------------------------------------------------------------------------
// 5. NFC edge: decomposed inventory entry vs precomposed base output
// ---------------------------------------------------------------------------

describe("useInventoryDiff — NFC normalization", () => {
  it("NFC precomposed entry matches NFC precomposed base output (round-trip)", async () => {
    const { useInventoryDiff } = await import("./useInventoryDiff.ts");
    // Both sides are NFC. session.confirmedInventory is always NFC (mergePhaseResults
    // normalizes it); buildProducedSet output is also NFC. The hook's own
    // .normalize("NFC") guard is defense-in-depth for any hypothetical bypass.
    const eAcute = "\u00e9"; // é precomposed NFC (U+00E9)
    seedBaseWithChars([eAcute]);
    setInventory([eAcute, "\u014b"]); // ŋ = eng (U+014B)
    const { result } = renderHook(() => useInventoryDiff());
    expect(result.current.alreadyProduced).toContain(eAcute);
    expect(result.current.lettersToAdd).toContain("\u014b");
    expect(result.current.lettersToAdd).not.toContain(eAcute);
  });

  it("NFD entry via confirmedInventory is normalized by mergePhaseResults then matched", async () => {
    const { useInventoryDiff } = await import("./useInventoryDiff.ts");
    // mergePhaseResults always NFC-normalizes confirmedInventory entries.
    // NFD "e + combining acute" (U+0065 U+0301) becomes U+00E9 (NFC) in the session.
    // The hook receives NFC and the lookup works correctly.
    const nfdEntry = "e\u0301"; // NFD: e + combining acute accent
    const nfcForm  = "\u00e9";  // NFC: é precomposed
    seedBaseWithChars([nfcForm]);
    setInventory([nfdEntry, "\u014b"]);
    // After mergePhaseResults normalization, nfdEntry becomes nfcForm in the session.
    const { result } = renderHook(() => useInventoryDiff());
    expect(result.current.alreadyProduced).toContain(nfcForm);
    expect(result.current.lettersToAdd).toContain("\u014b");
    expect(result.current.lettersToAdd).not.toContain(nfcForm);
  });
});

// ---------------------------------------------------------------------------
// 6-8. Memoization stability
// ---------------------------------------------------------------------------

describe("useInventoryDiff — memoization", () => {
  it("returns the same object reference when nothing changes between renders", async () => {
    const { useInventoryDiff } = await import("./useInventoryDiff.ts");
    seedBaseWithChars(["a", "e"]);
    setInventory(["a", "e", "ŋ", "ɓ"]);
    const { result, rerender } = renderHook(() => useInventoryDiff());
    const first = result.current;
    rerender();
    expect(result.current).toBe(first);
  });

  it("returns a new object when baseIr changes (new base instantiated)", async () => {
    const { useInventoryDiff } = await import("./useInventoryDiff.ts");
    seedBaseWithChars(["a", "e"]);
    setInventory(["a", "e", "ŋ", "ɓ"]);
    const { result } = renderHook(() => useInventoryDiff());
    const first = result.current;

    act(() => {
      // Re-instantiate with a different base IR (different base id not required
      // here — instantiateFromBase idempotence guard keys on base.id, but we
      // want to force a new IR. Use a different keyboard id via the store reset
      // + re-instantiate cycle.)
      resetStore();
      seedBaseWithChars(["a", "e", "ŋ"]); // base now produces ŋ too
      setInventory(["a", "e", "ŋ", "ɓ"]);
    });

    expect(result.current).not.toBe(first);
  });

  it("returns a new object when inventory changes", async () => {
    const { useInventoryDiff } = await import("./useInventoryDiff.ts");
    seedBaseWithChars(["a", "e"]);
    setInventory(["a", "e", "ŋ"]);
    const { result } = renderHook(() => useInventoryDiff());
    const first = result.current;

    act(() => {
      setInventory(["a", "e", "ŋ", "ɓ"]); // add ɓ
    });

    expect(result.current).not.toBe(first);
  });
});

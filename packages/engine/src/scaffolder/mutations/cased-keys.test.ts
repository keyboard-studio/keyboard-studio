/**
 * Tests for mutateInsertCasedKeys.
 */

import { describe, it, expect } from "vitest";
import type { KeyboardIR } from "@keyboard-studio/contracts";
import { mutateInsertCasedKeys } from "./cased-keys.js";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makeIR(extraStores: KeyboardIR["stores"] = []): KeyboardIR {
  return {
    origin: "scaffolded",
    header: {
      keyboardId: "test",
      name: "Test",
      bcp47: [],
      copyright: "",
      version: "1.0",
      targets: [],
      storeDirectives: [],
    },
    stores: extraStores,
    groups: [],
    comments: [],
    raw: [],
    recognizedPatterns: [],
  };
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe("mutateInsertCasedKeys", () => {
  it("inserts &CasedKeys for qwerty-qwertz group", () => {
    const ir = makeIR();
    const result = mutateInsertCasedKeys(ir, "qwerty-qwertz");
    const store = result.stores.find((s) => s.isSystem && s.name === "CasedKeys");
    expect(store).toBeDefined();
    expect(store!.items[0].kind).toBe("raw");
    if (store!.items[0].kind === "raw") {
      expect(store!.items[0].text).toBe("[K_A]..[K_Z]");
    }
  });

  it("inserts &CasedKeys with full azerty value for azerty group", () => {
    const ir = makeIR();
    const result = mutateInsertCasedKeys(ir, "azerty");
    const store = result.stores.find((s) => s.isSystem && s.name === "CasedKeys");
    expect(store).toBeDefined();
    if (store!.items[0].kind === "raw") {
      expect(store!.items[0].text).toContain("[K_A]..[K_Z]");
      expect(store!.items[0].text).toContain("[K_0]..[K_9]");
      expect(store!.items[0].text).toContain("[K_COLON]");
    }
  });

  it("does not insert &CasedKeys for non-roman group", () => {
    const ir = makeIR();
    const result = mutateInsertCasedKeys(ir, "non-roman");
    const store = result.stores.find((s) => s.isSystem && s.name.toUpperCase() === "CASEDKEYS");
    expect(store).toBeUndefined();
    // IR should be referentially identical (no clone)
    expect(result).toBe(ir);
  });

  it("is idempotent — does not insert a second &CasedKeys when one already exists", () => {
    const ir = makeIR([
      {
        nodeId: "store#0",
        name: "CasedKeys",
        isSystem: true,
        items: [{ kind: "raw", text: "[K_A]..[K_Z]" }],
      },
    ]);
    const result = mutateInsertCasedKeys(ir, "qwerty-qwertz");
    const count = result.stores.filter((s) => s.name.toUpperCase() === "CASEDKEYS").length;
    expect(count).toBe(1);
    // Should be the same object (no-op path)
    expect(result).toBe(ir);
  });

  it("assigns a nodeId to the new store", () => {
    const ir = makeIR();
    const result = mutateInsertCasedKeys(ir, "qwerty-qwertz");
    const store = result.stores.find((s) => s.name === "CasedKeys");
    expect(store?.nodeId).toMatch(/^store#/);
  });

  it("does not mutate input in-place", () => {
    const original = makeIR();
    const originalLen = original.stores.length;
    mutateInsertCasedKeys(original, "qwerty-qwertz");
    expect(original.stores.length).toBe(originalLen);
  });
});

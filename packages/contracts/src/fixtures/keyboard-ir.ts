// Shared test fixture helpers for KeyboardIR construction.
// See spec.md §5a — used by engine recognizer tests and any future test suite
// that needs to build a minimal in-memory IR without the full codec.

import type { KeyboardIR, IRGroup, IRStore, StoreItem, RawKmnFragment } from "../keyboard-ir.js";

/**
 * Build a minimal KeyboardIR from groups, optional stores, and optional opaque
 * fragments. Header fields are set to safe test defaults.
 */
export function makeTestIR(
  groups: IRGroup[],
  stores: IRStore[] = [],
  raw: RawKmnFragment[] = [],
): KeyboardIR {
  return {
    origin: "imported",
    header: {
      keyboardId: "test",
      name: "Test",
      bcp47: [],
      copyright: "",
      version: "1.0",
      targets: [],
      storeDirectives: [],
    },
    stores,
    groups,
    comments: [],
    raw,
    recognizedPatterns: [],
  };
}

/**
 * Convert a string to an array of char StoreItems, one per code unit.
 * Useful for building simple from/to store pairs in S-02 tests.
 */
export function charItems(chars: string): StoreItem[] {
  return [...chars].map((c) => ({ kind: "char" as const, value: c }));
}

/**
 * Build a non-system IRStore from a string of characters (one char StoreItem
 * per code unit). Shared by recognizer tests that construct from/to store pairs.
 */
export function makeCharStore(nodeId: string, name: string, chars: string): IRStore {
  return { nodeId, name, items: charItems(chars), isSystem: false };
}

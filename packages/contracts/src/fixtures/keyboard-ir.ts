// Shared test fixture helpers for KeyboardIR construction.
// See spec.md §5a — used by engine recognizer tests and any future test suite
// that needs to build a minimal in-memory IR without the full codec.

import type {
  KeyboardIR,
  IRGroup,
  IRStore,
  IRComment,
  IRHeader,
  IROrigin,
  StoreItem,
  RawKmnFragment,
} from "../keyboard-ir.js";

/**
 * Overrides for {@link makeTestIR}. Every field is optional; anything left out
 * keeps the test default. `header` is merged field-by-field over the default
 * header, so `{ header: { version: "10.0" } }` changes only the version.
 * The optional top-level KeyboardIR fields (`touchLayout`, `visualKeyboard`,
 * `facets`, `facetOverrides`) are set only when given, so an IR built without
 * them has no such key at all.
 */
export interface TestIROptions {
  origin?: IROrigin | undefined;
  header?: Partial<IRHeader> | undefined;
  groups?: IRGroup[] | undefined;
  stores?: IRStore[] | undefined;
  raw?: RawKmnFragment[] | undefined;
  comments?: IRComment[] | undefined;
  recognizedPatterns?: KeyboardIR["recognizedPatterns"] | undefined;
  touchLayout?: KeyboardIR["touchLayout"] | undefined;
  visualKeyboard?: KeyboardIR["visualKeyboard"] | undefined;
  facets?: KeyboardIR["facets"] | undefined;
  facetOverrides?: KeyboardIR["facetOverrides"] | undefined;
}

/** Overrides accepted after the positional groups/stores/raw arguments. */
export type TestIRPositionalOptions = Omit<TestIROptions, "groups" | "stores" | "raw">;

/**
 * Build a minimal KeyboardIR with safe test defaults: origin "imported",
 * keyboardId "test", name "Test", version "1.0", and every list empty.
 *
 * Two call shapes:
 * - `makeTestIR(groups, stores?, raw?, options?)` — the original positional form.
 * - `makeTestIR(options?)` — everything by name, including groups/stores/raw.
 */
export function makeTestIR(options?: TestIROptions): KeyboardIR;
export function makeTestIR(
  groups: IRGroup[],
  stores?: IRStore[],
  raw?: RawKmnFragment[],
  options?: TestIRPositionalOptions,
): KeyboardIR;
export function makeTestIR(
  groupsOrOptions: IRGroup[] | TestIROptions = {},
  stores: IRStore[] = [],
  raw: RawKmnFragment[] = [],
  options: TestIRPositionalOptions = {},
): KeyboardIR {
  const opts: TestIROptions = Array.isArray(groupsOrOptions)
    ? { ...options, groups: groupsOrOptions, stores, raw }
    : groupsOrOptions;
  const ir: KeyboardIR = {
    origin: opts.origin ?? "imported",
    header: {
      keyboardId: "test",
      name: "Test",
      bcp47: [],
      copyright: "",
      version: "1.0",
      targets: [],
      storeDirectives: [],
      ...opts.header,
    },
    stores: opts.stores ?? [],
    groups: opts.groups ?? [],
    comments: opts.comments ?? [],
    raw: opts.raw ?? [],
    recognizedPatterns: opts.recognizedPatterns ?? [],
  };
  if (opts.touchLayout !== undefined) ir.touchLayout = opts.touchLayout;
  if (opts.visualKeyboard !== undefined) ir.visualKeyboard = opts.visualKeyboard;
  if (opts.facets !== undefined) ir.facets = opts.facets;
  if (opts.facetOverrides !== undefined) ir.facetOverrides = opts.facetOverrides;
  return ir;
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

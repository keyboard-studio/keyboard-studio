// Unit tests for useKeyEditGuards (spec 058 T088; FR-036f).
//
// Coverage:
//   1. The FR-036f canonical case — suppressing a key that carries a
//      longpress assigned for ɛ warns and names ɛ.
//   2. One test per operation kind that CAN invalidate an assignment: set
//      (clearing output via an id change), rename, remove, suppress,
//      setSubKey, removeSubKey.
//   3. `add` never invalidates anything.
//   4. An edit that invalidates nothing (no by-character assignment is
//      touched) warns nothing.
//   5. The warning is available synchronously at edit time — calling
//      `checkOperation` never returns a Promise / never needs a timer tick,
//      proving it is usable immediately before `commitKeyEdit`, not only at
//      a later gate.
//   6. Characters not tracked as a by-character assignment are not warned
//      about even when an op removes them.

import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { cleanup, renderHook } from "@testing-library/react";
import type { TouchKeyIR, TouchLayoutIR } from "@keyboard-studio/contracts";
import { touchKeyAddress } from "@keyboard-studio/engine";
import {
  useWorkingCopyStore,
  type PendingKeyEditOperation,
} from "../../../stores/workingCopyStore.ts";
import {
  findInvalidatedAssignedCharacters,
  useKeyEditGuards,
} from "./useKeyEditGuards.ts";

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------

function makeKey(id: string, overrides: Partial<TouchKeyIR> = {}): TouchKeyIR {
  return { nodeId: `node_${id}`, id, ...overrides };
}

function makeLayout(keys: TouchKeyIR[]): TouchLayoutIR {
  return {
    platforms: [{ id: "phone", layers: [{ id: "default", rows: [{ keys }] }] }],
    nodeIds: [],
  };
}

const ADDR = (keyId: string) => touchKeyAddress("phone", "default", keyId);

function seedAssignedChars(chars: readonly string[]): void {
  useWorkingCopyStore.getState().setTouchDraft({
    charTouchEntries: chars.map((char) => [
      char,
      { scope: "individual", target: char, modality: "touch", mechanisms: [] },
    ]),
    suggestionResolvedChars: [],
  });
}

beforeEach(() => {
  useWorkingCopyStore.getState().reset();
});

afterEach(() => {
  cleanup();
});

// ---------------------------------------------------------------------------
// Pure function tests (findInvalidatedAssignedCharacters) — exercise the
// diff directly, independent of the store/hook wiring.
// ---------------------------------------------------------------------------

describe("findInvalidatedAssignedCharacters", () => {
  it("FR-036f canonical case: suppressing a key that carries a longpress assigned for ɛ names ɛ", () => {
    const layout = makeLayout([
      makeKey("K_E", { text: "e", output: "e", sk: [makeKey("U_025B")] }),
    ]);
    const op: PendingKeyEditOperation = {
      kind: "suppress",
      address: ADDR("K_E"),
      spClass: 9,
      sentinelId: "T_suppressed_K_E",
    };

    const lost = findInvalidatedAssignedCharacters(layout, op, undefined, new Set(["ɛ"]));

    expect(lost).toEqual(["ɛ"]);
  });

  it("set: clearing output via an id change (no output re-supplied) invalidates the old character", () => {
    const layout = makeLayout([makeKey("K_E", { text: "e", output: "e" })]);
    const op: PendingKeyEditOperation = {
      kind: "set",
      address: ADDR("K_E"),
      fields: { id: "K_E2" },
    };

    const lost = findInvalidatedAssignedCharacters(layout, op, undefined, new Set(["e"]));

    expect(lost).toEqual(["e"]);
  });

  it("rename: an id change that drops the old id's decoded character invalidates it", () => {
    const layout = makeLayout([makeKey("U_0065")]); // decodes to "e"
    const op: PendingKeyEditOperation = {
      kind: "rename",
      address: ADDR("U_0065"),
      toId: "U_0066", // decodes to "f" instead
    };

    const lost = findInvalidatedAssignedCharacters(layout, op, undefined, new Set(["e"]));

    expect(lost).toEqual(["e"]);
  });

  it("remove: removing a key invalidates every character it (and its sub-entries) carried", () => {
    const layout = makeLayout([
      makeKey("K_E", { text: "e", output: "e", sk: [makeKey("U_025B")] }),
    ]);
    const op: PendingKeyEditOperation = {
      kind: "remove",
      address: ADDR("K_E"),
      outcome: "reflow",
    };

    const lost = findInvalidatedAssignedCharacters(layout, op, undefined, new Set(["e", "ɛ"]));

    expect(lost.sort()).toEqual(["e", "ɛ"].sort());
  });

  it("suppress: invalidates the main key's own output too, not only its sub-entries", () => {
    const layout = makeLayout([makeKey("K_E", { text: "e", output: "e" })]);
    const op: PendingKeyEditOperation = {
      kind: "suppress",
      address: ADDR("K_E"),
      spClass: 9,
      sentinelId: "T_suppressed_K_E",
    };

    const lost = findInvalidatedAssignedCharacters(layout, op, undefined, new Set(["e"]));

    expect(lost).toEqual(["e"]);
  });

  it("removeSubKey: removing one longpress entry invalidates only that entry's character", () => {
    const layout = makeLayout([
      makeKey("K_E", {
        text: "e",
        output: "e",
        sk: [makeKey("U_025B"), makeKey("U_00E9")], // ɛ, é — two distinct longpress entries
      }),
    ]);
    const op: PendingKeyEditOperation = {
      kind: "removeSubKey",
      address: ADDR("K_E"),
      sub: { kind: "sk", id: "U_025B" },
    };

    const lost = findInvalidatedAssignedCharacters(
      layout,
      op,
      undefined,
      new Set(["e", "ɛ", "é"]),
    );

    expect(lost).toEqual(["ɛ"]);
  });

  it("setSubKey: overwriting a longpress entry's output invalidates the character it replaces", () => {
    // Deliberately a non-`U_`-id sub-entry (`T_alt1`) rather than `U_025B`:
    // a self-decoding id would still credit "ɛ" via `decodeUnicodeKeyId`
    // after the `output` override, which is a real but separate ambiguity
    // this test is not about.
    const layout = makeLayout([
      makeKey("K_E", { text: "e", output: "e", sk: [makeKey("T_alt1", { output: "ɛ" })] }),
    ]);
    const op: PendingKeyEditOperation = {
      kind: "setSubKey",
      address: ADDR("K_E"),
      sub: { kind: "sk", id: "T_alt1" },
      fields: { output: "ə" },
    };

    const lost = findInvalidatedAssignedCharacters(layout, op, undefined, new Set(["ɛ"]));

    expect(lost).toEqual(["ɛ"]);
  });

  it("add never invalidates anything", () => {
    const layout = makeLayout([makeKey("K_E", { text: "e", output: "e" })]);
    const op: PendingKeyEditOperation = {
      kind: "add",
      address: ADDR("K_E"),
      position: "after",
      key: { id: "K_F", text: "f", output: "f", sp: 0 },
    };

    const lost = findInvalidatedAssignedCharacters(layout, op, undefined, new Set(["e", "f"]));

    expect(lost).toEqual([]);
  });

  it("an edit that invalidates nothing reports nothing", () => {
    const layout = makeLayout([makeKey("K_E", { text: "e", output: "e" })]);
    const op: PendingKeyEditOperation = {
      kind: "set",
      address: ADDR("K_E"),
      fields: { text: "E" }, // keycap-only change; output/id untouched
    };

    const lost = findInvalidatedAssignedCharacters(layout, op, undefined, new Set(["e"]));

    expect(lost).toEqual([]);
  });

  it("does not warn about a character that was never tracked as a by-character assignment", () => {
    const layout = makeLayout([makeKey("K_E", { text: "e", output: "e" })]);
    const op: PendingKeyEditOperation = {
      kind: "remove",
      address: ADDR("K_E"),
      outcome: "reflow",
    };

    // assignedChars is empty — "e" is real content the op removes, but it was
    // never placed via the by-character walk.
    const lost = findInvalidatedAssignedCharacters(layout, op, undefined, new Set());

    expect(lost).toEqual([]);
  });
});

// ---------------------------------------------------------------------------
// The hook — reads the by-character assignment set from the store, and is
// available SYNCHRONOUSLY (no timer, no debounce) at the moment of the edit.
// ---------------------------------------------------------------------------

describe("useKeyEditGuards", () => {
  it("names the affected character in a localized, ready-to-render message (canonical FR-036f case)", () => {
    seedAssignedChars(["ɛ"]);
    const layout = makeLayout([
      makeKey("K_E", { text: "e", output: "e", sk: [makeKey("U_025B")] }),
    ]);

    const { result } = renderHook(() => useKeyEditGuards({ layout }));

    // No timer, no await — the result is available in the SAME synchronous
    // call that a commit handler would make immediately before
    // commitKeyEdit(op), which is the entire point of FR-036f's "at the
    // moment of the edit" (not deferred to any later gate/microtask).
    const warnings = result.current.checkOperation({
      kind: "suppress",
      address: ADDR("K_E"),
      spClass: 9,
      sentinelId: "T_suppressed_K_E",
    });

    expect(warnings).toHaveLength(1);
    expect(warnings[0]!.char).toBe("ɛ");
    expect(warnings[0]!.message).toContain("ɛ");
    expect(warnings[0]!.message).toContain("U+025B");
  });

  it("returns no warnings when the touch draft has no by-character assignments yet", () => {
    const layout = makeLayout([
      makeKey("K_E", { text: "e", output: "e", sk: [makeKey("U_025B")] }),
    ]);

    const { result } = renderHook(() => useKeyEditGuards({ layout }));

    const warnings = result.current.checkOperation({
      kind: "suppress",
      address: ADDR("K_E"),
      spClass: 9,
      sentinelId: "T_suppressed_K_E",
    });

    expect(warnings).toEqual([]);
  });
});

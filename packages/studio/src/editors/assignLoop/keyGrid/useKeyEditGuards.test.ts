// Unit tests for useKeyEditGuards (spec 058 T088/T106; FR-036f/FR-061/FR-062).
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
//   7. FR-062/T106 `findCharactersLostForGood` / `returnsToWorklist`: a
//      character that loses its LAST mechanism anywhere in the layout is
//      classified as returning to the worklist; a character that remains
//      reachable via a completely different key is not (FR-061).
//   8. T119/US5 AS3 `inventoryChars` / `blocksContinue`: a CONFIRMED INVENTORY
//      character that loses its last mechanism warns inline even though the
//      by-character walk never assigned it (the entry-parity gap this task
//      closes), and is marked as blocking the FR-008 Continue gate; an
//      assignment-only character is warned about but NOT marked as blocking;
//      an inventory character still reachable elsewhere blocks nothing; and
//      the edit is never refused (no rejection is produced for this class),
//      because an editor must permit invalid intermediate states.

import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { cleanup, renderHook } from "@testing-library/react";
import type { TouchKeyIR, TouchLayoutIR } from "@keyboard-studio/contracts";
import { touchKeyAddress } from "@keyboard-studio/engine";
import {
  useWorkingCopyStore,
  type PendingKeyEditOperation,
} from "../../../stores/workingCopyStore.ts";
import {
  findCharactersLostForGood,
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
      sentinelId: "T_BLANK",
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
      sentinelId: "T_BLANK",
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
// findCharactersLostForGood (spec 058 T106; FR-061/FR-062) — of the invalidated
// characters, which ones lose their LAST mechanism anywhere in the layout
// (must return to the unplaced worklist) versus which remain reachable via a
// completely different key (must NOT be treated as lost).
// ---------------------------------------------------------------------------

describe("findCharactersLostForGood", () => {
  it("FR-062: a character with no OTHER producer anywhere in the layout returns to the worklist", () => {
    const layout = makeLayout([
      makeKey("K_E", { text: "e", output: "e", sk: [makeKey("U_025B")] }),
    ]);
    const op: PendingKeyEditOperation = {
      kind: "suppress",
      address: ADDR("K_E"),
      spClass: 9,
      sentinelId: "T_BLANK",
    };

    const lostForGood = findCharactersLostForGood(layout, op, undefined, new Set(["ɛ"]));

    expect(lostForGood).toEqual(["ɛ"]);
  });

  it("FR-061: a character still produced by a completely different key does NOT return to the worklist", () => {
    const layout = makeLayout([
      makeKey("K_E", { text: "e", output: "e", sk: [makeKey("U_025B")] }),
      // A second, unrelated key that also produces ɛ — e.g. moved to a
      // symbol layer, the FR-061 worked example.
      makeKey("K_X", { text: "ɛ", output: "ɛ" }),
    ]);
    const op: PendingKeyEditOperation = {
      kind: "suppress",
      address: ADDR("K_E"),
      spClass: 9,
      sentinelId: "T_BLANK",
    };

    // findInvalidatedAssignedCharacters still reports ɛ (K_E's OWN address
    // stopped producing it) — that FR-036f warning is unaffected. But it must
    // not be treated as having lost its last mechanism.
    expect(findInvalidatedAssignedCharacters(layout, op, undefined, new Set(["ɛ"]))).toEqual(["ɛ"]);

    const lostForGood = findCharactersLostForGood(layout, op, undefined, new Set(["ɛ"]));

    expect(lostForGood).toEqual([]);
  });

  it("short-circuits to [] when nothing is invalidated (no extra layout apply/coverage pass needed)", () => {
    const layout = makeLayout([makeKey("K_E", { text: "e", output: "e" })]);
    const op: PendingKeyEditOperation = {
      kind: "set",
      address: ADDR("K_E"),
      fields: { text: "E" }, // keycap-only change; output/id untouched
    };

    const lostForGood = findCharactersLostForGood(layout, op, undefined, new Set(["e"]));

    expect(lostForGood).toEqual([]);
  });
});

// ---------------------------------------------------------------------------
// The hook — reads the by-character assignment set from the store, and is
// available SYNCHRONOUSLY (no timer, no debounce) at the moment of the edit.
// ---------------------------------------------------------------------------

describe("useKeyEditGuards", () => {
  it("names the affected character in a localized, ready-to-render message, and marks it as returning to the worklist (canonical FR-036f/FR-062 case)", () => {
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
      sentinelId: "T_BLANK",
    });

    expect(warnings).toHaveLength(1);
    expect(warnings[0]!.char).toBe("ɛ");
    expect(warnings[0]!.message).toContain("ɛ");
    expect(warnings[0]!.message).toContain("U+025B");
    // ɛ has no other producer in this layout — FR-062 says it must return to
    // the unplaced worklist.
    expect(warnings[0]!.returnsToWorklist).toBe(true);
  });

  it("FR-061: marks a character as NOT returning to the worklist when it remains reachable via a different key", () => {
    seedAssignedChars(["ɛ"]);
    const layout = makeLayout([
      makeKey("K_E", { text: "e", output: "e", sk: [makeKey("U_025B")] }),
      makeKey("K_X", { text: "ɛ", output: "ɛ" }),
    ]);

    const { result } = renderHook(() => useKeyEditGuards({ layout }));

    const warnings = result.current.checkOperation({
      kind: "suppress",
      address: ADDR("K_E"),
      spClass: 9,
      sentinelId: "T_BLANK",
    });

    // The FR-036f warning still fires (K_E's own longpress for ɛ is gone) —
    // but FR-061/FR-062 say a still-available-elsewhere character must not be
    // reported as returning to the worklist.
    expect(warnings).toHaveLength(1);
    expect(warnings[0]!.char).toBe("ɛ");
    expect(warnings[0]!.returnsToWorklist).toBe(false);
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
      sentinelId: "T_BLANK",
    });

    expect(warnings).toEqual([]);
  });
});

// ---------------------------------------------------------------------------
// T119 (US5 AS3) — the confirmed inventory as a SECOND watched set, and
// `blocksContinue` as the prediction of the FR-008 gate's verdict.
// ---------------------------------------------------------------------------

describe("useKeyEditGuards — inventory scope (T119, US5 AS3)", () => {
  const SUPPRESS_K_E: PendingKeyEditOperation = {
    kind: "suppress",
    address: ADDR("K_E"),
    spClass: 9,
    sentinelId: "T_BLANK",
  };

  it("warns about an inventory character the by-character walk never assigned — the entry-parity gap", () => {
    // No seedAssignedChars: this is the canonical import-fix-up case. The
    // shipped layout already typed ɛ, so the walk never stopped on it and
    // there is no charTouchEntries row — yet ɛ IS in the confirmed inventory,
    // and this edit strands it.
    const layout = makeLayout([
      makeKey("K_E", { text: "e", output: "e", sk: [makeKey("U_025B")] }),
    ]);

    const { result } = renderHook(() =>
      useKeyEditGuards({ layout, inventoryChars: ["e", "ɛ"] }),
    );

    const warnings = result.current.checkOperation(SUPPRESS_K_E);

    // Both of K_E's characters are in the inventory and both are stranded.
    expect(warnings.map((w) => w.char).sort()).toEqual(["e", "ɛ"].sort());
    for (const w of warnings) {
      expect(w.returnsToWorklist).toBe(true);
      expect(w.blocksContinue).toBe(true);
    }
  });

  it("names the character and states that the step cannot be finished", () => {
    const layout = makeLayout([
      makeKey("K_E", { text: "e", output: "e", sk: [makeKey("U_025B")] }),
    ]);

    const { result } = renderHook(() =>
      useKeyEditGuards({ layout, inventoryChars: ["ɛ"] }),
    );

    const warnings = result.current.checkOperation(SUPPRESS_K_E);

    expect(warnings).toHaveLength(1);
    expect(warnings[0]!.message).toContain("ɛ");
    // docs/accessibility.md rule 10: the codepoint-derived name, never the
    // bare glyph alone.
    expect(warnings[0]!.message).toContain("U+025B");
    expect(warnings[0]!.message).toMatch(/cannot be finished/i);
  });

  it("does NOT mark an assignment-only character as blocking Continue — it is not in the FR-008 denominator", () => {
    seedAssignedChars(["ɛ"]);
    const layout = makeLayout([
      makeKey("K_E", { text: "e", output: "e", sk: [makeKey("U_025B")] }),
    ]);

    // ɛ was assigned by the walk but is NOT in the confirmed inventory (e.g.
    // the author placed a character the survey never confirmed).
    const { result } = renderHook(() =>
      useKeyEditGuards({ layout, inventoryChars: ["e"] }),
    );

    const warnings = result.current.checkOperation(SUPPRESS_K_E);
    const epsilon = warnings.find((w) => w.char === "ɛ");

    expect(epsilon).toBeDefined();
    // Still returns to the worklist (FR-062) — it lost its last mechanism…
    expect(epsilon!.returnsToWorklist).toBe(true);
    // …but the Continue gate does not audit it, so claiming otherwise would
    // send the author chasing a block that will not happen.
    expect(epsilon!.blocksContinue).toBe(false);
  });

  it("FR-061: an inventory character still reachable via a different key blocks nothing", () => {
    const layout = makeLayout([
      makeKey("K_E", { text: "e", output: "e", sk: [makeKey("U_025B")] }),
      makeKey("K_X", { text: "ɛ", output: "ɛ" }),
    ]);

    const { result } = renderHook(() =>
      useKeyEditGuards({ layout, inventoryChars: ["ɛ"] }),
    );

    const warnings = result.current.checkOperation(SUPPRESS_K_E);

    expect(warnings).toHaveLength(1);
    expect(warnings[0]!.char).toBe("ɛ");
    expect(warnings[0]!.returnsToWorklist).toBe(false);
    expect(warnings[0]!.blocksContinue).toBe(false);
  });

  it("permits the invalid intermediate state: an inventory-stranding edit is warned about, never refused", () => {
    const layout = makeLayout([
      makeKey("K_E", { text: "e", output: "e", sk: [makeKey("U_025B")] }),
    ]);

    const { result } = renderHook(() =>
      useKeyEditGuards({ layout, inventoryChars: ["e", "ɛ"] }),
    );

    // The warning fires…
    expect(result.current.checkOperation(SUPPRESS_K_E).length).toBeGreaterThan(0);
    // …and the rejection path — the ONLY path that can stop a commit (T118,
    // FR-045) — stays silent for this class. "An editor must permit invalid
    // intermediate states" is a behavioural claim, so it is asserted, not
    // merely documented.
    expect(result.current.checkRejections(SUPPRESS_K_E)).toEqual([]);
  });

  it("omitting inventoryChars narrows back to the FR-036f assignment-only scope", () => {
    const layout = makeLayout([
      makeKey("K_E", { text: "e", output: "e", sk: [makeKey("U_025B")] }),
    ]);

    const { result } = renderHook(() => useKeyEditGuards({ layout }));

    expect(result.current.checkOperation(SUPPRESS_K_E)).toEqual([]);
  });
});

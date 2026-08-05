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
//   9. Opaque fragment: a char produced only via a fragment's producedOutput
//      sketch lands in alreadyProduced, not lettersToAdd.

import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { renderHook, act } from "@testing-library/react";
import { useWorkingCopyStore } from "../stores/workingCopyStore.ts";
import { createVirtualFS } from "@keyboard-studio/contracts";
import { makeTestIR } from "@keyboard-studio/contracts/fixtures";
import { basicKbdus } from "@keyboard-studio/contracts/fixtures";
import type { IRGroup, IRStore, RawKmnFragment } from "@keyboard-studio/contracts";

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
// 10. Composability: precomposed char available from separately-produced parts
// ---------------------------------------------------------------------------

describe("useInventoryDiff — composability", () => {
  it("a precomposed inventory char lands in alreadyProduced when its base + combining mark are both produced", async () => {
    const { useInventoryDiff } = await import("./useInventoryDiff.ts");
    // Base produces "U" and the bare combining circumflex accent (U+0302)
    // separately, but never the precomposed "Û" (U+00DB) directly.
    seedBaseWithChars(["U", "̂"]);
    setInventory(["Û", "ŋ"]); // Û (precomposed), ŋ
    const { result } = renderHook(() => useInventoryDiff());
    expect(result.current.alreadyProduced).toContain("Û");
    expect(result.current.lettersToAdd).not.toContain("Û");
    expect(result.current.lettersToAdd).toContain("ŋ");
  });

  it("a precomposed inventory char stays in lettersToAdd when only the base letter is produced", async () => {
    const { useInventoryDiff } = await import("./useInventoryDiff.ts");
    // Base produces "U" only — no combining circumflex anywhere.
    seedBaseWithChars(["U"]);
    setInventory(["Û"]); // Û
    const { result } = renderHook(() => useInventoryDiff());
    expect(result.current.lettersToAdd).toContain("Û");
    expect(result.current.alreadyProduced).not.toContain("Û");
  });
});

// ---------------------------------------------------------------------------
// 11. Lowercase-first walk ordering
// ---------------------------------------------------------------------------

describe("useInventoryDiff — lowercase-first ordering", () => {
  it("moves an uppercase letter after all lowercase/non-letter entries, stably", async () => {
    const { useInventoryDiff } = await import("./useInventoryDiff.ts");
    // "B" (uppercase) precedes "a" (lowercase) in the raw confirmedInventory
    // order; the sort must move "B" after "a" (and after the non-letter "1"),
    // while "C" (also uppercase) keeps its position relative to "B" — both
    // land after everything else, in their original relative order.
    setInventory(["B", "a", "1", "C", "d"]);
    const { result } = renderHook(() => useInventoryDiff());
    expect(result.current.lettersToAdd).toEqual(["a", "1", "d", "B", "C"]);
  });

  it("does not disturb order when there are no uppercase letters", async () => {
    const { useInventoryDiff } = await import("./useInventoryDiff.ts");
    setInventory(["ŋ", "ɓ", "a"]);
    const { result } = renderHook(() => useInventoryDiff());
    expect(result.current.lettersToAdd).toEqual(["ŋ", "ɓ", "a"]);
  });

  it("orders a lowercase letter before its own uppercase counterpart", async () => {
    const { useInventoryDiff } = await import("./useInventoryDiff.ts");
    setInventory(["Θ", "θ"]);
    const { result } = renderHook(() => useInventoryDiff());
    expect(result.current.lettersToAdd).toEqual(["θ", "Θ"]);
  });

  it("applies the same ordering after the base-diff filter (post-lettersToAdd)", async () => {
    const { useInventoryDiff } = await import("./useInventoryDiff.ts");
    seedBaseWithChars(["x"]); // base produces none of the inventory below
    setInventory(["E", "a", "D"]);
    const { result } = renderHook(() => useInventoryDiff());
    expect(result.current.lettersToAdd).toEqual(["a", "E", "D"]);
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

// ---------------------------------------------------------------------------
// 9. Opaque fragment producedOutput — the bj_cree_woods over-prompt shape
// ---------------------------------------------------------------------------

describe("useInventoryDiff — opaque fragment producedOutput", () => {
  it("a char produced only via an opaque rule's index() sketch counts as alreadyProduced", async () => {
    const { useInventoryDiff } = await import("./useInventoryDiff.ts");
    // Base: 'a' via a typed rule, 'ᐌ' only via an opaque if()-guarded rule
    // whose codec-extracted sketch references the typed store C_efc.
    const store: IRStore = {
      nodeId: "store#C_efc",
      name: "C_efc",
      items: [{ kind: "char", value: "ᐌ" }],
      isSystem: false,
    };
    const frag: RawKmnFragment = {
      nodeId: "raw#93",
      origin: "imported",
      sourceText: "if(option_key = '') U+1427 any(C_ef) > index(C_efc,3)",
      reason: "if-option-store",
      producedOutput: [{ kind: "index", storeRef: "C_efc", offset: 3 }],
    };
    const ir = makeTestIR([makeGroupWithChars(["a"])], [store], [frag]);
    const vfs = createVirtualFS([
      { path: "source/basic_kbdus.kmn", content: "c test\n", isBinary: false },
    ]);
    useWorkingCopyStore.getState().instantiateFromBase(basicKbdus, { vfs, ir });
    setInventory(["a", "ᐌ", "ɓ"]);
    const { result } = renderHook(() => useInventoryDiff());
    expect(result.current.alreadyProduced).toEqual(["a", "ᐌ"]);
    expect(result.current.lettersToAdd).toEqual(["ɓ"]);
  });
});

// ---------------------------------------------------------------------------
// 12. Session-aware composability (symptom-2 fix) — a SESSION assignment
// (Phase C MechanismAssignment[]), NOT base-IR rules, makes "ж" (U+0436) and
// the bare combining diaeresis "̈" (U+0308) produced THIS session; the
// composition surface (producedSet, via augmentWithComposable) must then
// recognize the precomposed "ӝ" (U+04DD = "ж" + U+0308) as implementable, and
// the criterion 18.6 completion gate (unimplementedDesktopChars) must stop
// listing it as unimplemented — even though NO assignment's own `target` is
// "ӝ" and the base keyboard produces nothing at all.
//
// Uses the REAL `deadkey_single_tap` (S-02) content pattern
// (content/patterns/desktop-input/deadkey-single-tap.yaml), resolved through
// the studio's real getPatternByIdSync (no services mock — USE_REAL is not
// overridden in this file), exactly the path useInventoryDiff's
// buildSessionProducedSet call goes through in the running app.
//
// This is deliberately the SESSION-ASSIGNMENT path: the existing composition-
// row tests above (§10, "composability") seed the composable parts via
// seedBaseWithChars — i.e. base-IR rules already present before any session
// assignment exists — which does NOT exercise buildSessionProducedSet's
// physical-assignment round trip at all (that call short-circuits to the
// base-only set whenever there are no physical assignments). This suite is
// the one that actually walks that round trip.
// ---------------------------------------------------------------------------

describe("useInventoryDiff — session-aware composability (symptom-2 fix)", () => {
  function makeDeadkeyAssignment(
    target: string,
    slotValues: {
      triggerKey: string;
      deadkeyName: string;
      baseLetters: string;
      accentedForms: string;
      accentChar: string;
    },
  ) {
    return {
      scope: "individual" as const,
      target,
      modality: "physical" as const,
      mechanisms: [
        {
          patternId: "deadkey_single_tap",
          strategyId: "S-02",
          slotValues,
        },
      ],
      source: "user" as const,
    };
  }

  function setPhaseCAssignments(assignments: ReturnType<typeof makeDeadkeyAssignment>[]) {
    useWorkingCopyStore.getState().recordPhase({
      phase: "C",
      answers: [],
      assignments,
    });
  }

  it("producedSet contains the precomposed 'ӝ' (U+04DD) once separate session assignments produce 'ж' and the bare U+0308 byproduct — via augmentWithComposable, not a direct target match", async () => {
    const { useInventoryDiff } = await import("./useInventoryDiff.ts");
    // Base produces nothing at all — every glyph below is session-introduced.
    seedBaseWithChars([]);
    setInventory(["ж", "ӝ"]);

    // Assignment 1: an unrelated deadkey whose COMPOSED OUTPUT store happens
    // to include "ж" (base letter "p", arbitrary — the produced-set walk is
    // static over rule/store contents, not a simulated key sequence).
    const producesZhe = makeDeadkeyAssignment("ж", {
      triggerKey: "K_QUOTE",
      deadkeyName: "d1",
      baseLetters: "p",
      accentedForms: "ж",
      accentChar: "́", // acute — irrelevant to this assignment's own byproduct use here
    });

    // Assignment 2: a DIFFERENT deadkey (different triggerKey/deadkeyName, so
    // applyAssignments' same-triggerKey merge never fires) whose double-tap
    // trigger rule emits the bare combining diaeresis U+0308 as a byproduct —
    // never this assignment's own `target` ("q", a placeholder).
    const producesBareDiaeresis = makeDeadkeyAssignment("q", {
      triggerKey: "K_BKQUOTE",
      deadkeyName: "d2",
      baseLetters: "q",
      accentedForms: "Q",
      accentChar: "̈", // U+0308 combining diaeresis
    });

    setPhaseCAssignments([producesZhe, producesBareDiaeresis]);

    const { result } = renderHook(() => useInventoryDiff());

    // The session-aware produced set recognizes "ӝ" as implementable, even
    // though it was never any assignment's own target.
    expect(result.current.producedSet.has("ӝ")).toBe(true);
    // Sanity: the two underlying components are genuinely there too.
    expect(result.current.producedSet.has("ж")).toBe(true);
    expect(result.current.producedSet.has("̈")).toBe(true);

    // The STATIC walk denominator must NOT reflow — "ӝ" (and "ж") still show
    // as needing addition, per useInventoryDiff's own documented contract
    // that lettersToAdd never reacts to session assignments.
    expect(result.current.lettersToAdd).toContain("ӝ");
    expect(result.current.lettersToAdd).toContain("ж");
  });

  it("the criterion 18.6 completion gate (unimplementedDesktopChars) stops listing 'ӝ' as unimplemented once producedSet is passed, though it's still uncovered by uncoveredTargets alone", async () => {
    const { useInventoryDiff } = await import("./useInventoryDiff.ts");
    const { unimplementedDesktopChars } = await import("../lib/unimplementedInventory.ts");

    seedBaseWithChars([]);
    setInventory(["ж", "ӝ"]);

    const producesZhe = makeDeadkeyAssignment("ж", {
      triggerKey: "K_QUOTE",
      deadkeyName: "d1",
      baseLetters: "p",
      accentedForms: "ж",
      accentChar: "́",
    });
    const producesBareDiaeresis = makeDeadkeyAssignment("q", {
      triggerKey: "K_BKQUOTE",
      deadkeyName: "d2",
      baseLetters: "q",
      accentedForms: "Q",
      accentChar: "̈",
    });
    setPhaseCAssignments([producesZhe, producesBareDiaeresis]);

    const { result } = renderHook(() => useInventoryDiff());
    const { lettersToAdd, producedSet } = result.current;

    // No assignment's `target` is literally "ӝ" — without the session-aware
    // produced set, the gate still flags it as unimplemented.
    const withoutSessionAwareness = unimplementedDesktopChars(
      [producesZhe, producesBareDiaeresis],
      lettersToAdd,
    );
    expect(withoutSessionAwareness).toContain("ӝ");

    // With the session-aware produced set supplied, the gate relaxation
    // recognizes "ӝ" as already typeable and stops nagging for it.
    const withSessionAwareness = unimplementedDesktopChars(
      [producesZhe, producesBareDiaeresis],
      lettersToAdd,
      producedSet,
    );
    expect(withSessionAwareness).not.toContain("ӝ");
  });
});

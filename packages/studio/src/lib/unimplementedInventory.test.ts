// Unit tests for unimplementedInventory.ts — the shared "which inventory
// characters still lack an implementation in this modality" helpers used by
// MechanismGallery, TouchGallery, and StepHost/PhaseFGate's Phase F hard
// gate. See that file's header comment for why these two functions are a
// single source of truth rather than forked per call site.

import { describe, it, expect } from "vitest";
import {
  unimplementedDesktopChars,
  unimplementedTouchChars,
  inventoryCoverageGate,
  formatUncoveredCharsList,
} from "./unimplementedInventory.ts";
import type { MechanismAssignment } from "@keyboard-studio/contracts";

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------

function swapAssignment(target: string): MechanismAssignment {
  return {
    scope: "individual",
    target,
    modality: "physical",
    mechanisms: [{ patternId: "simple_swap", strategyId: "S-01", slotValues: { kmnRules: `+ [K_X] > U+0000` } }],
    source: "user",
  };
}

/** A minimal phone-platform touch layout JSON whose default layer emits
 * exactly `chars` (one key per char), matching the shape `computeTouchCoverage`
 * (via `touchCoverage`/`parseTouchLayout`) walks — same shape the TouchGallery
 * test suite's own mock builds. */
function touchLayoutJsonWith(chars: string[]): string {
  return JSON.stringify({
    phone: {
      layer: [
        {
          id: "default",
          row: [
            {
              id: 1,
              key: chars.map((c, i) => ({ id: `T_${i}`, output: c })),
            },
          ],
        },
      ],
    },
  });
}

// ---------------------------------------------------------------------------
// unimplementedDesktopChars
// ---------------------------------------------------------------------------

describe("unimplementedDesktopChars", () => {
  it("returns [] when lettersToAdd is empty (empty-inventory case)", () => {
    expect(unimplementedDesktopChars([], [])).toEqual([]);
  });

  it("returns every letter when there are no assignments at all", () => {
    expect(unimplementedDesktopChars([], ["á", "é"])).toEqual(["á", "é"]);
  });

  it("excludes a letter with an individual-scope mechanism assignment", () => {
    const result = unimplementedDesktopChars([swapAssignment("á")], ["á", "é"]);
    expect(result).toEqual(["é"]);
  });

  it("excludes every letter when a keyboard-default assignment covers the whole inventory", () => {
    const dflt: MechanismAssignment = {
      scope: "keyboard-default",
      target: "",
      modality: "physical",
      mechanisms: [{ patternId: "p_default" }],
    };
    expect(unimplementedDesktopChars([dflt], ["á", "é"])).toEqual([]);
  });

  it("ignores a touch-modality assignment for the same target (modality is not conflated)", () => {
    const touchOnly: MechanismAssignment = {
      scope: "individual",
      target: "á",
      modality: "touch",
      mechanisms: [{ patternId: "longpress_alternates", strategyId: "S-05" }],
    };
    // A touch-only assignment must not satisfy the desktop/physical check —
    // "á" still has zero PHYSICAL mechanisms.
    expect(unimplementedDesktopChars([touchOnly], ["á"])).toEqual(["á"]);
  });
});

// ---------------------------------------------------------------------------
// unimplementedTouchChars
// ---------------------------------------------------------------------------

describe("unimplementedTouchChars", () => {
  it("returns [] when touchLayoutJson is null — 'nothing to gate on', never a false-positive full-covered signal", () => {
    expect(unimplementedTouchChars(null, ["á", "é"])).toEqual([]);
  });

  it("returns [] when the inventory is empty (empty-inventory case), even with a real layout", () => {
    expect(unimplementedTouchChars(touchLayoutJsonWith(["á"]), [])).toEqual([]);
  });

  it("returns the FULL inventory (fail closed) when the stored JSON fails to parse — a corrupted layout must never silently satisfy the gate", () => {
    expect(unimplementedTouchChars("{ not json", ["á", "é"])).toEqual(["á", "é"]);
  });

  it("returns only the inventory characters absent from the rendered layout", () => {
    const json = touchLayoutJsonWith(["á"]);
    expect(unimplementedTouchChars(json, ["á", "é"])).toEqual(["é"]);
  });

  it("returns [] when every inventory character is present in the rendered layout", () => {
    const json = touchLayoutJsonWith(["á", "é"]);
    expect(unimplementedTouchChars(json, ["á", "é"])).toEqual([]);
  });

  it("treats a character reachable ONLY via inheritance (no MechanismAssignment at all) as covered — the function never consults assignment records, only the rendered layout, so a touch_inherited placeholder mechanism can never cause a miscount", () => {
    // "a" is present in the rendered layout (e.g. inherited from the base
    // scaffold's default layer) with no corresponding MechanismAssignment
    // passed in at all — unimplementedTouchChars's signature doesn't even
    // accept an assignments parameter, so this is the direct proof that
    // coverage is derived from the render, not from bookkeeping records.
    const json = touchLayoutJsonWith(["a"]);
    expect(unimplementedTouchChars(json, ["a"])).toEqual([]);
  });
});

// ---------------------------------------------------------------------------
// inventoryCoverageGate — the single shared selector StepHost, PhaseFGate,
// and usePreviewArtifact's canDownload (OutputScreen) all call, so the
// desktop-always/touch-only-if-authored booleans can never drift across the
// three call sites (P0 fix regression: the extraction itself).
// ---------------------------------------------------------------------------

describe("inventoryCoverageGate", () => {
  it("blocked is false when every desktop char is covered and no touch layout was authored", () => {
    const gate = inventoryCoverageGate({
      desktopAssignments: [swapAssignment("á")],
      lettersToAdd: ["á"],
      touchLayoutJson: null,
      confirmedInventory: ["á"],
    });
    expect(gate.blockedOnDesktop).toBe(false);
    expect(gate.blockedOnTouch).toBe(false);
    expect(gate.blocked).toBe(false);
  });

  it("blockedOnDesktop is true (and blocked is true) when a desktop char has no physical mechanism", () => {
    const gate = inventoryCoverageGate({
      desktopAssignments: [],
      lettersToAdd: ["á"],
      touchLayoutJson: null,
      confirmedInventory: ["á"],
    });
    expect(gate.unimplementedDesktop).toEqual(["á"]);
    expect(gate.blockedOnDesktop).toBe(true);
    expect(gate.blocked).toBe(true);
  });

  it("a desktop-only session (touchLayoutJson === null) is never gated on touch, even with an uncovered touch char", () => {
    // touchLayoutJson === null means "nothing to gate on" for touch — see
    // unimplementedTouchChars's own contract above.
    const gate = inventoryCoverageGate({
      desktopAssignments: [swapAssignment("á")],
      lettersToAdd: ["á"],
      touchLayoutJson: null,
      confirmedInventory: ["á", "é"],
    });
    expect(gate.blockedOnTouch).toBe(false);
    expect(gate.blocked).toBe(false);
  });

  it("blockedOnTouch is true (and blocked is true) once a touch layout is authored and leaves a char uncovered", () => {
    const gate = inventoryCoverageGate({
      desktopAssignments: [swapAssignment("á"), swapAssignment("é")],
      lettersToAdd: ["á", "é"],
      touchLayoutJson: touchLayoutJsonWith(["á"]),
      confirmedInventory: ["á", "é"],
    });
    expect(gate.unimplementedTouch).toEqual(["é"]);
    expect(gate.blockedOnTouch).toBe(true);
    expect(gate.blocked).toBe(true);
  });

  it("blocked is true when EITHER modality is blocked (desktop covered, touch not)", () => {
    const gate = inventoryCoverageGate({
      desktopAssignments: [swapAssignment("á")],
      lettersToAdd: ["á"],
      touchLayoutJson: touchLayoutJsonWith([]),
      confirmedInventory: ["á"],
    });
    expect(gate.blockedOnDesktop).toBe(false);
    expect(gate.blockedOnTouch).toBe(true);
    expect(gate.blocked).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// inventoryCoverageGate — touchLayoutCorrupted: the three touch-modality
// cases (absent / valid / corrupted) the gate must tell apart. A corrupted
// persisted touch layout must FAIL CLOSED (block, with `touchLayoutCorrupted`
// set) rather than silently satisfying the gate like "absent" does.
// ---------------------------------------------------------------------------

describe("inventoryCoverageGate — touchLayoutCorrupted", () => {
  it("absent (touchLayoutJson === null): not blocked, not corrupted", () => {
    const gate = inventoryCoverageGate({
      desktopAssignments: [swapAssignment("á")],
      lettersToAdd: ["á"],
      touchLayoutJson: null,
      confirmedInventory: ["á", "é"],
    });
    expect(gate.touchLayoutCorrupted).toBe(false);
    expect(gate.blockedOnTouch).toBe(false);
    expect(gate.blocked).toBe(false);
  });

  it("valid (fully covered): not blocked, not corrupted", () => {
    const gate = inventoryCoverageGate({
      desktopAssignments: [swapAssignment("á")],
      lettersToAdd: ["á"],
      touchLayoutJson: touchLayoutJsonWith(["á"]),
      confirmedInventory: ["á"],
    });
    expect(gate.touchLayoutCorrupted).toBe(false);
    expect(gate.blockedOnTouch).toBe(false);
    expect(gate.blocked).toBe(false);
  });

  it("corrupted (non-null, unparseable touchLayoutJson): blocked === true, touchLayoutCorrupted === true, and unimplementedTouch is the FULL touch inventory (fail closed) — not silently treated as covered", () => {
    const gate = inventoryCoverageGate({
      desktopAssignments: [swapAssignment("á")],
      lettersToAdd: ["á"],
      touchLayoutJson: "{ not json",
      confirmedInventory: ["á", "é", "í"],
    });
    expect(gate.touchLayoutCorrupted).toBe(true);
    expect(gate.unimplementedTouch).toEqual(["á", "é", "í"]);
    expect(gate.blockedOnTouch).toBe(true);
    expect(gate.blocked).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// formatUncoveredCharsList — the display formatter PhaseFGate and
// OutputScreen both call so a long uncovered list degrades (truncates) the
// same way in both blocked banners rather than each call site inlining its
// own `.join(", ")` with no cap.
// ---------------------------------------------------------------------------

describe("formatUncoveredCharsList", () => {
  it("returns an empty string for an empty list", () => {
    expect(formatUncoveredCharsList([])).toBe("");
  });

  it("joins every character with no suffix when at or under the limit", () => {
    const chars = ["á", "é", "í"];
    expect(formatUncoveredCharsList(chars, 12)).toBe("á, é, í");
  });

  it("truncates past the limit and appends a '+N more' suffix", () => {
    const chars = ["a", "b", "c", "d", "e"];
    expect(formatUncoveredCharsList(chars, 3)).toBe("a, b, c, +2 more");
  });

  it("uses the default limit (12) when none is supplied", () => {
    const chars = Array.from({ length: 34 }, (_, i) => `c${i}`);
    const result = formatUncoveredCharsList(chars);
    expect(result).toBe(`${chars.slice(0, 12).join(", ")}, +22 more`);
  });
});

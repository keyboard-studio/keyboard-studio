// Unit tests for FindPanel (spec 058 T071; FR-020e, FR-020i).
//
// Grouped:
//   1. The three find-by-value paths: by id, by character (reusing
//      enumerateTouchMethodsForChar, including the host-address resolution
//      for a longpress/multitap/flick sub-entry match), and the "no assigned
//      output" worklist (US2).
//   2. Result ordering respects direction (FR-020i) — by never re-sorting
//      away from the layout's own array/reading order.
//   3. Selecting a result (Enter, and click) fires `onJumpToResult`.

import { describe, it, expect, vi, afterEach } from "vitest";
import { cleanup, fireEvent, screen } from "@testing-library/react";
import { render } from "../../../test/renderWithI18n.tsx";
import type { TouchKeyRuleIndex, TouchKeyIR, TouchLayoutIR } from "@keyboard-studio/contracts";
import { buildTouchKeyRuleIndex } from "@keyboard-studio/contracts";
import {
  makeTouchKeyRuleJoinFixture,
  TOUCH_JOIN_IDS,
  TOUCH_JOIN_LAYERS,
} from "@keyboard-studio/contracts/fixtures";
import { touchKeyAddress } from "@keyboard-studio/engine";
import { FindPanel } from "./FindPanel.tsx";

afterEach(() => {
  cleanup();
});

/** A `TouchKeyRuleIndex` satisfying the interface directly — id/char-mode
 * tests below never consult it (only "no output" mode does), so a real
 * `KeyboardIR` fixture would be unnecessary ceremony for those. */
const EMPTY_RULE_INDEX: TouchKeyRuleIndex = {
  byId: new Map(),
  spellings: new Map(),
  producingIds: new Set(),
  opaqueFragmentCount: 0,
};

function key(id: string, extra: Partial<Omit<TouchKeyIR, "nodeId" | "id">> = {}): TouchKeyIR {
  return { nodeId: `n-${id}`, id, ...extra };
}

/** A small, hand-built layout for the id-search and ordering tests — deliberately NOT the shared touch-join fixture (whose duplicate ids would muddy an ordering assertion). */
function simpleLayout(): TouchLayoutIR {
  return {
    platforms: [
      {
        id: "phone",
        layers: [
          {
            id: "default",
            rows: [
              {
                keys: [key("T_AAA", { text: "a" }), key("T_BBB", { text: "b" })],
              },
            ],
          },
        ],
      },
    ],
  };
}

function fixtureLayout(): TouchLayoutIR {
  return makeTouchKeyRuleJoinFixture().touchLayout!;
}

function fixtureRuleIndex(): TouchKeyRuleIndex {
  return buildTouchKeyRuleIndex(makeTouchKeyRuleJoinFixture());
}

// ---------------------------------------------------------------------------
// 1a. Find by id
// ---------------------------------------------------------------------------

describe("FindPanel — find by key id", () => {
  it("lists every key whose id contains the (case-insensitive) query substring", () => {
    render(
      <FindPanel layout={simpleLayout()} ruleIndex={EMPTY_RULE_INDEX} onJumpToResult={vi.fn()} />,
    );
    // "By key id" is the default mode.
    fireEvent.change(screen.getByRole("combobox"), { target: { value: "aaa" } });

    const results = screen.getByTestId("find-panel-results");
    expect(results.textContent).toContain("T_AAA");
    expect(results.textContent).not.toContain("T_BBB");
  });

  it("shows no results for an empty query", () => {
    render(
      <FindPanel layout={simpleLayout()} ruleIndex={EMPTY_RULE_INDEX} onJumpToResult={vi.fn()} />,
    );
    expect(screen.queryAllByRole("option")).toHaveLength(0);
  });
});

// ---------------------------------------------------------------------------
// 1b. Find by character — reuses enumerateTouchMethodsForChar
// ---------------------------------------------------------------------------

describe("FindPanel — find by character", () => {
  function selectCharMode() {
    fireEvent.click(screen.getByRole("radio", { name: "By character" }));
  }

  it("finds a main key that produces the queried character", () => {
    const onJump = vi.fn();
    render(<FindPanel layout={fixtureLayout()} ruleIndex={fixtureRuleIndex()} onJumpToResult={onJump} />);
    selectCharMode();

    // T_FCFA's OWN keycap text is "FCFA" — `enumerateTouchMethodsForChar`
    // matches on the layout's own text/output/decoded-id (see its own doc
    // comment), not the rule join, so this is the multi-char keycap case,
    // not a mark key whose keycap glyph ("◌̀") differs from what the rule
    // actually emits.
    fireEvent.change(screen.getByRole("combobox"), { target: { value: "FCFA" } });

    const results = screen.getByTestId("find-panel-results");
    expect(results.textContent).toContain(TOUCH_JOIN_IDS.multiChar);
  });

  it("resolves a longpress sub-entry match to its HOST key's jumpable address, not a sub address", () => {
    const onJump = vi.fn();
    render(<FindPanel layout={fixtureLayout()} ruleIndex={fixtureRuleIndex()} onJumpToResult={onJump} />);
    selectCharMode();

    // U_00A1's text is "¡", a longpress sub-key under T_0021 (longpressHost).
    fireEvent.change(screen.getByRole("combobox"), { target: { value: "¡" } });
    fireEvent.keyDown(screen.getByRole("combobox"), { key: "Enter" });

    expect(onJump).toHaveBeenCalledTimes(1);
    const result = onJump.mock.calls[0]?.[0];
    expect(result.address).toBe(
      touchKeyAddress("phone", TOUCH_JOIN_LAYERS.default, TOUCH_JOIN_IDS.longpressHost),
    );
    // NOT the sub-key address form.
    expect(result.address).not.toContain(":sk:");
  });

  it("shows no results for an empty query", () => {
    render(<FindPanel layout={fixtureLayout()} ruleIndex={fixtureRuleIndex()} onJumpToResult={vi.fn()} />);
    selectCharMode();
    expect(screen.queryAllByRole("option")).toHaveLength(0);
  });
});

// ---------------------------------------------------------------------------
// 1c. Keys with no assigned output — the US2 worklist
// ---------------------------------------------------------------------------

describe("FindPanel — keys with no assigned output (US2 worklist)", () => {
  function selectNoOutputMode() {
    fireEvent.click(screen.getByRole("radio", { name: "Keys with no output" }));
  }

  it("is a first-class mode: results appear immediately, no query field required", () => {
    render(<FindPanel layout={fixtureLayout()} ruleIndex={fixtureRuleIndex()} onJumpToResult={vi.fn()} />);
    selectNoOutputMode();

    // No text input in this mode.
    expect(screen.queryByRole("combobox")).toBeNull();
    expect(screen.getByTestId("find-panel-results").textContent).toContain(TOUCH_JOIN_IDS.dead);
  });

  it("excludes a blank/spacer key (sp:9) from the worklist", () => {
    render(<FindPanel layout={fixtureLayout()} ruleIndex={fixtureRuleIndex()} onJumpToResult={vi.fn()} />);
    selectNoOutputMode();

    expect(screen.getByTestId("find-panel-results").textContent).not.toContain(TOUCH_JOIN_IDS.blank);
  });

  it("excludes a key that already has a produced character", () => {
    render(<FindPanel layout={fixtureLayout()} ruleIndex={fixtureRuleIndex()} onJumpToResult={vi.fn()} />);
    selectNoOutputMode();

    expect(screen.getByTestId("find-panel-results").textContent).not.toContain(TOUCH_JOIN_IDS.mark);
  });
});

// ---------------------------------------------------------------------------
// 2. Result ordering respects direction (FR-020i) — by never re-sorting
// ---------------------------------------------------------------------------

describe("FindPanel — result ordering (FR-020i)", () => {
  it("returns id-search results in the layout's own array/reading order, never re-sorted", () => {
    render(
      <FindPanel layout={simpleLayout()} ruleIndex={EMPTY_RULE_INDEX} onJumpToResult={vi.fn()} />,
    );
    fireEvent.change(screen.getByRole("combobox"), { target: { value: "T_" } });

    const options = screen.getAllByRole("option");
    expect(options).toHaveLength(2);
    // T_AAA is FIRST in the row's array — array order IS reading order in
    // both directions (KeyGrid.tsx's own established convention: the grid
    // never reverses the DOM for RTL, only the CSS `dir` mirror flips the
    // VISUAL position). Re-sorting these results by any other key (e.g.
    // alphabetically by keycap, or by "visual" position) would break that
    // guarantee for an RTL layer — this test pins that it does not happen.
    expect(options[0]?.textContent).toContain("T_AAA");
    expect(options[1]?.textContent).toContain("T_BBB");
  });
});

// ---------------------------------------------------------------------------
// 3. Selecting a result
// ---------------------------------------------------------------------------

describe("FindPanel — selecting a result", () => {
  it("fires onJumpToResult on Enter for the active (first) result", () => {
    const onJump = vi.fn();
    render(<FindPanel layout={simpleLayout()} ruleIndex={EMPTY_RULE_INDEX} onJumpToResult={onJump} />);
    const input = screen.getByRole("combobox");
    fireEvent.change(input, { target: { value: "T_" } });

    fireEvent.keyDown(input, { key: "Enter" });

    expect(onJump).toHaveBeenCalledTimes(1);
    expect(onJump.mock.calls[0]?.[0]).toMatchObject({
      keyId: "T_AAA",
      platform: "phone",
      layerId: "default",
    });
  });

  it("fires onJumpToResult on a result click", () => {
    const onJump = vi.fn();
    render(<FindPanel layout={simpleLayout()} ruleIndex={EMPTY_RULE_INDEX} onJumpToResult={onJump} />);
    fireEvent.change(screen.getByRole("combobox"), { target: { value: "T_" } });

    fireEvent.click(screen.getAllByRole("option")[1]!);

    expect(onJump).toHaveBeenCalledTimes(1);
    expect(onJump.mock.calls[0]?.[0]).toMatchObject({ keyId: "T_BBB" });
  });

  it("ArrowDown moves the active result before Enter commits it", () => {
    const onJump = vi.fn();
    render(<FindPanel layout={simpleLayout()} ruleIndex={EMPTY_RULE_INDEX} onJumpToResult={onJump} />);
    const input = screen.getByRole("combobox");
    fireEvent.change(input, { target: { value: "T_" } });

    fireEvent.keyDown(input, { key: "ArrowDown" });
    fireEvent.keyDown(input, { key: "Enter" });

    expect(onJump.mock.calls[0]?.[0]).toMatchObject({ keyId: "T_BBB" });
  });
});

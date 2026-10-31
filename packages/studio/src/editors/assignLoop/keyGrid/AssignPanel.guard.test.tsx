// AssignPanel × per-mark "start of line" box (#2374 Track B): the box map
// threads into the panel's proposals — unticked (or no box at all, e.g. a
// late-added mark with no survey row) mints a combining mark as guarded
// T_, ticked keeps U_ — and the old guard question is gone entirely:
// selecting a mark with no box never routes anywhere, it takes the
// guarded default. Harness mirrors AssignPanel.test.tsx.

import { describe, it, expect, vi, afterEach } from "vitest";
import { cleanup, fireEvent, screen } from "@testing-library/react";
import { render } from "../../../test/renderWithI18n.tsx";
import type { KeyboardIR, TouchKeyRuleIndex, TouchLayoutIR } from "@keyboard-studio/contracts";
import { buildTouchKeyRuleIndex } from "@keyboard-studio/contracts";
import { makeTouchKeyRuleJoinFixture, TOUCH_JOIN_IDS } from "@keyboard-studio/contracts/fixtures";
import { touchKeyAddress } from "@keyboard-studio/engine";
import { AssignPanel } from "./AssignPanel.tsx";
import type { KeyGridAnnotationCounts, KeyGridCellViewModel } from "./keyGridViewModel.ts";

afterEach(() => {
  cleanup();
});

const EMPTY_ANNOTATIONS: KeyGridAnnotationCounts = { longpress: 0, multitap: 0, flick: 0 };

function deadKeyCell(): KeyGridCellViewModel {
  return {
    address: touchKeyAddress("phone", "default", TOUCH_JOIN_IDS.dead),
    id: TOUCH_JOIN_IDS.dead,
    keycap: TOUCH_JOIN_IDS.dead,
    padPct: 15,
    widthPct: 100,
    producedChars: [],
    annotations: EMPTY_ANNOTATIONS,
    findings: [],
  };
}

function defaultProps(overrides: {
  bareMarkAllowedByMark?: Readonly<Record<string, boolean>>;
  onCommit?: ReturnType<typeof vi.fn>;
} = {}) {
  const ir: KeyboardIR = makeTouchKeyRuleJoinFixture({ withoutOpaqueFragments: true });
  const ruleIndex: TouchKeyRuleIndex = buildTouchKeyRuleIndex(ir);
  const layout: TouchLayoutIR = ir.touchLayout!;
  return {
    selectedCell: deadKeyCell(),
    layout,
    ir,
    ruleIndex,
    inventoryChars: [],
    capsHandled: false,
    repertoire: [" ", ".", ","],
    onCommit: overrides.onCommit ?? vi.fn(),
    ...(overrides.bareMarkAllowedByMark !== undefined
      ? { bareMarkAllowedByMark: overrides.bareMarkAllowedByMark }
      : {}),
  };
}

function charField(): HTMLElement {
  return screen.getByLabelText("Character or code point");
}

function committedId(props: ReturnType<typeof defaultProps>): string {
  const result = (props.onCommit as ReturnType<typeof vi.fn>).mock.calls[0]![0] as {
    op: { fields: { id: string } };
  };
  return result.op.fields.id;
}

describe("AssignPanel — per-mark start-of-line box (#2374)", () => {
  it("with no box at all, a selected mark takes the guarded default — no question, committable", () => {
    const props = defaultProps();
    render(<AssignPanel {...props} />);
    fireEvent.change(charField(), { target: { value: "U+0300" } });

    // The guard question is gone: no prompt testid anywhere, and the
    // proposal is the guarded T_ form straight away.
    expect(screen.queryByTestId("guard-question-prompt")).toBeNull();
    expect(screen.getByTestId("assign-panel-proposal").textContent).toContain("T_0300");
    expect(screen.getByTestId("assign-panel-guard-pair")).toBeTruthy();
    expect((screen.getByTestId("assign-panel-confirm") as HTMLButtonElement).disabled).toBe(false);

    fireEvent.submit(screen.getByTestId("assign-panel"));
    expect(props.onCommit).toHaveBeenCalledTimes(1);
    expect(committedId(props)).toBe("T_0300");
  });

  it("with an unticked box the mark proposal is the guarded T_ form", () => {
    const props = defaultProps({ bareMarkAllowedByMark: { "̀": false } });
    render(<AssignPanel {...props} />);
    fireEvent.change(charField(), { target: { value: "U+0300" } });

    expect(screen.queryByTestId("guard-question-prompt")).toBeNull();
    expect(screen.getByTestId("assign-panel-proposal").textContent).toContain("T_0300");
    expect(screen.getByTestId("assign-panel-guard-pair")).toBeTruthy();

    fireEvent.submit(screen.getByTestId("assign-panel"));
    expect(props.onCommit).toHaveBeenCalledTimes(1);
    expect(committedId(props)).toBe("T_0300");
  });

  it("with a ticked box the mark proposal stays U_", () => {
    const props = defaultProps({ bareMarkAllowedByMark: { "̀": true } });
    render(<AssignPanel {...props} />);
    fireEvent.change(charField(), { target: { value: "U+0300" } });

    expect(screen.queryByTestId("guard-question-prompt")).toBeNull();
    // Arm (d): no rule, no alternative — the block carries no rule lines;
    // the committed id is the assertion that matters.
    fireEvent.submit(screen.getByTestId("assign-panel"));
    expect(props.onCommit).toHaveBeenCalledTimes(1);
    expect(committedId(props)).toBe("U_0300");
  });

  it("a plain letter is unaffected by the box map", () => {
    const props = defaultProps({ bareMarkAllowedByMark: { "̀": true } });
    render(<AssignPanel {...props} />);
    fireEvent.change(charField(), { target: { value: "e" } });

    expect(screen.queryByTestId("guard-question-prompt")).toBeNull();
    expect(screen.getByTestId("assign-panel-proposal")).toBeTruthy();
  });
});

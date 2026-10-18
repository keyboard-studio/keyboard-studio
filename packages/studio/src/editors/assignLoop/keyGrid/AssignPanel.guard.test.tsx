// AssignPanel × guard specification (spec 104 FR-013 / T013): the
// recorded specification threads into the panel's proposals — "swallow"
// mints a combining mark as guarded T_, "emit" keeps U_ — and when no
// specification exists yet, selecting a mark routes the author to the
// guard question instead of minting unguarded by default (FR-013's
// tail). Harness mirrors AssignPanel.test.tsx.

import { describe, it, expect, vi, afterEach } from "vitest";
import { cleanup, fireEvent, screen } from "@testing-library/react";
import { render } from "../../../test/renderWithI18n.tsx";
import type { GuardSpecification, KeyboardIR, TouchKeyRuleIndex, TouchLayoutIR } from "@keyboard-studio/contracts";
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

function spec(behaviour: "swallow" | "emit"): GuardSpecification {
  return {
    recordId: `guard-specification:asked:${behaviour}`,
    behaviour,
    origin: "asked",
    confirmed: true,
    recordedAt: 1,
    supersedes: null,
  };
}

function defaultProps(overrides: {
  guardSpecification?: GuardSpecification;
  onGuardAnswer?: (behaviour: "swallow" | "emit") => void;
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
    ...(overrides.guardSpecification !== undefined
      ? { guardSpecification: overrides.guardSpecification }
      : {}),
    ...(overrides.onGuardAnswer !== undefined ? { onGuardAnswer: overrides.onGuardAnswer } : {}),
  };
}

function charField(): HTMLElement {
  return screen.getByLabelText("Character or code point");
}

describe("AssignPanel — guard specification threading (spec 104 FR-013)", () => {
  it("routes to the question when a mark is selected and no specification exists", () => {
    const onGuardAnswer = vi.fn();
    render(<AssignPanel {...defaultProps({ onGuardAnswer })} />);
    fireEvent.change(charField(), { target: { value: "U+0300" } });

    expect(screen.getByTestId("guard-question-prompt")).toBeTruthy();
    expect(screen.queryByTestId("assign-panel-proposal")).toBeNull();
    expect((screen.getByTestId("assign-panel-confirm") as HTMLButtonElement).disabled).toBe(true);

    fireEvent.click(screen.getByTestId("guard-prompt-swallow"));
    expect(onGuardAnswer).toHaveBeenCalledWith("swallow");
  });

  it("does not route for a plain letter — the question is marks-only", () => {
    const onGuardAnswer = vi.fn();
    render(<AssignPanel {...defaultProps({ onGuardAnswer })} />);
    fireEvent.change(charField(), { target: { value: "e" } });

    expect(screen.queryByTestId("guard-question-prompt")).toBeNull();
    expect(screen.getByTestId("assign-panel-proposal")).toBeTruthy();
  });

  it("under a swallow specification the mark proposal is the guarded T_ form", () => {
    const props = defaultProps({ guardSpecification: spec("swallow"), onGuardAnswer: vi.fn() });
    render(<AssignPanel {...props} />);
    fireEvent.change(charField(), { target: { value: "U+0300" } });

    expect(screen.queryByTestId("guard-question-prompt")).toBeNull();
    expect(screen.getByTestId("assign-panel-proposal").textContent).toContain("T_0300");
    expect(screen.getByTestId("assign-panel-guard-pair")).toBeTruthy();

    fireEvent.submit(screen.getByTestId("assign-panel"));
    expect(props.onCommit).toHaveBeenCalledTimes(1);
    const result = (props.onCommit as ReturnType<typeof vi.fn>).mock.calls[0]![0] as {
      op: { fields: { id: string } };
    };
    expect(result.op.fields.id).toBe("T_0300");
  });

  it("under an emit specification the mark proposal stays U_", () => {
    const props = defaultProps({ guardSpecification: spec("emit"), onGuardAnswer: vi.fn() });
    render(<AssignPanel {...props} />);
    fireEvent.change(charField(), { target: { value: "U+0300" } });

    expect(screen.queryByTestId("guard-question-prompt")).toBeNull();
    // Arm (d): no rule, no alternative — the block carries no rule lines;
    // the committed id is the assertion that matters.
    fireEvent.submit(screen.getByTestId("assign-panel"));
    expect(props.onCommit).toHaveBeenCalledTimes(1);
    const result = (props.onCommit as ReturnType<typeof vi.fn>).mock.calls[0]![0] as {
      op: { fields: { id: string } };
    };
    expect(result.op.fields.id).toBe("U_0300");
  });
});

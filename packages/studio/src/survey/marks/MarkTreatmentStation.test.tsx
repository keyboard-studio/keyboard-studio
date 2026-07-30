// MarkTreatmentStation — the demonstration widget (spec 052 US2) and the key
// budget's effect on the promotion gate (spec 052 US3).
//
// The station is rendered directly here rather than walked to through the
// series: US2's assertions are about one screen's controls, and driving them
// through MarksSeriesStep would make every failure a navigation puzzle. The
// series-level assertions (station count, skip, re-proposal, the FR-007/FR-008
// wording matrix) live in MarksSeriesStep.test.tsx.

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { screen, cleanup, fireEvent, within } from "@testing-library/react";
import { render } from "../../test/renderWithI18n.tsx";
import type {
  MarkClass,
  MarkTreatmentAnswer,
  MarkTreatmentPrefill,
} from "@keyboard-studio/engine";
import { MarkTreatmentStation } from "./MarkTreatmentStation.tsx";

const ACUTE = "́";
const GRAVE = "̀";

const CLASS_ID = "above-1";

const CLASSES: MarkClass[] = [
  { id: CLASS_ID, label: "Marks above", marks: [ACUTE, GRAVE] },
];

function prefill(over: Partial<MarkTreatmentPrefill> = {}): MarkTreatmentPrefill {
  return {
    classId: CLASS_ID,
    recommended: "own-key",
    promotionProposal: ["á", "é"],
    signals: { productivitySpread: 3, baseMechanism: null, promotionAffordable: true },
    ...over,
  };
}

function answer(over: Partial<MarkTreatmentAnswer> = {}): MarkTreatmentAnswer {
  return {
    classTreatment: { [CLASS_ID]: "own-key" },
    markTreatment: {},
    promoted: [],
    inputOrder: "postfix",
    ...over,
  };
}

interface RenderOpts {
  prefills?: MarkTreatmentPrefill[];
  answer?: MarkTreatmentAnswer;
  promotable?: Record<string, string[]>;
  demoLetters?: string[];
}

function renderStation(opts: RenderOpts = {}) {
  const onClassTreatmentChange = vi.fn();
  const onMarkTreatmentChange = vi.fn();
  const onPromotionToggle = vi.fn();
  const onInputOrderChange = vi.fn();
  render(
    <MarkTreatmentStation
      classes={CLASSES}
      prefills={opts.prefills ?? [prefill()]}
      answer={opts.answer ?? answer()}
      promotable={opts.promotable ?? { [CLASS_ID]: ["á", "é"] }}
      demoLetters={opts.demoLetters ?? ["a", "e"]}
      onClassTreatmentChange={onClassTreatmentChange}
      onMarkTreatmentChange={onMarkTreatmentChange}
      onPromotionToggle={onPromotionToggle}
      onInputOrderChange={onInputOrderChange}
      orderPrefilledFromImport={false}
    />,
  );
  return {
    onClassTreatmentChange,
    onMarkTreatmentChange,
    onPromotionToggle,
    onInputOrderChange,
  };
}

afterEach(() => {
  cleanup();
});

// ---------------------------------------------------------------------------
// US2 — the demonstration
// ---------------------------------------------------------------------------

describe("MarkTreatmentStation — demonstrations (spec 052 US2)", () => {
  it("FR-010/SC-005: every offered option has its own operable demonstration", () => {
    renderStation();
    for (const value of ["own-key", "composed"]) {
      const demo = screen.getByTestId(`demo-${CLASS_ID}-${value}`);
      expect(demo).toBeTruthy();
      // Two or three keys, drawn from the author's own letters and marks.
      const keys = demo.querySelectorAll('[data-testid^="demo-key-"]');
      expect(keys.length).toBeGreaterThanOrEqual(2);
      expect(keys.length).toBeLessThanOrEqual(3);
    }
  });

  it("the demo keys are built from the author's own confirmed letters and marks (FR-010)", () => {
    renderStation({ demoLetters: ["e"] });
    const demo = screen.getByTestId(`demo-${CLASS_ID}-own-key`);
    const keyText = [...demo.querySelectorAll('[data-testid^="demo-key-"]')]
      .map((k) => k.textContent ?? "")
      .join("");
    expect(keyText).toContain("e");
  });

  it("FR-011/SC-006/US2 AC2: in the prefix demo EVERY press leaves a pending state or non-empty output", () => {
    renderStation({ answer: answer({ inputOrder: "prefix" }) });
    const demo = screen.getByTestId(`demo-${CLASS_ID}-own-key`);
    const keys = [...demo.querySelectorAll('[data-testid^="demo-key-"]')] as HTMLElement[];
    expect(keys.length).toBeGreaterThan(0);

    for (const key of keys) {
      fireEvent.click(key);
      const live = screen.getByTestId(`demo-${CLASS_ID}-own-key`);
      const pending = live.querySelector('[data-testid="demo-pending"]');
      const output = live.querySelector('[data-testid="demo-output"]')?.textContent ?? "";
      // There is no press after which the demo appears to have done nothing.
      expect(pending !== null || output.trim() !== "").toBe(true);
    }
  });

  it("FR-011: the pending state announces itself to assistive technology", () => {
    renderStation({ answer: answer({ inputOrder: "prefix" }) });
    const demo = screen.getByTestId(`demo-${CLASS_ID}-own-key`);
    // Press the mark key only, then stop.
    fireEvent.click(within(demo).getByTestId("demo-key-1"));
    const pending = screen.getByTestId("demo-pending");
    expect(pending.getAttribute("role")).toBe("status");
    expect(pending.getAttribute("aria-live")).toBe("polite");
    expect(pending.textContent?.trim()).not.toBe("");
  });

  it("US2 AC3: in the postfix demo the first press shows the bare letter", () => {
    renderStation({ answer: answer({ inputOrder: "postfix" }) });
    const demo = screen.getByTestId(`demo-${CLASS_ID}-own-key`);
    fireEvent.click(within(demo).getByTestId("demo-key-1"));
    const output = within(screen.getByTestId(`demo-${CLASS_ID}-own-key`)).getByTestId(
      "demo-output",
    );
    expect(output.textContent).toBe("a");
    // And no pending state — that is the side-by-side contrast with prefix.
    expect(
      screen.getByTestId(`demo-${CLASS_ID}-own-key`).querySelector('[data-testid="demo-pending"]'),
    ).toBeNull();
  });

  it("the prefix demo produces the same finished text as the postfix demo", () => {
    // Both orders type the same marked character; only the intermediate state
    // differs. That is what makes the demonstration honest.
    for (const order of ["prefix", "postfix"] as const) {
      cleanup();
      renderStation({ answer: answer({ inputOrder: order }) });
      const demo = screen.getByTestId(`demo-${CLASS_ID}-own-key`);
      for (const key of [...demo.querySelectorAll('[data-testid^="demo-key-"]')]) {
        fireEvent.click(key);
      }
      const output = within(screen.getByTestId(`demo-${CLASS_ID}-own-key`)).getByTestId(
        "demo-output",
      );
      expect(output.textContent, order).toBe(("a" + ACUTE).normalize("NFC"));
    }
  });

  it("FR-012/US2 AC1: operating a demo does NOT change the selection", () => {
    const { onClassTreatmentChange } = renderStation();
    const demo = screen.getByTestId(`demo-${CLASS_ID}-composed`);
    // `own-key` is the recorded answer; operate the OTHER option's demo.
    for (const key of [...demo.querySelectorAll('[data-testid^="demo-key-"]')]) {
      fireEvent.click(key);
    }
    expect(onClassTreatmentChange).not.toHaveBeenCalled();
    const selected = screen.getByTestId(`treatment-option-${CLASS_ID}-own-key`);
    expect(selected.querySelector("input")?.checked).toBe(true);
  });

  it("FR-012/US2 AC5: operating a demo emits no diagnostic and touches no store", () => {
    // The widget is a local text transform: it receives no store handle and no
    // diagnostic sink, so the only thing that could break this contract is a
    // module-level import. Asserting the props surface is the honest check.
    const { onPromotionToggle, onInputOrderChange, onMarkTreatmentChange } = renderStation();
    const demo = screen.getByTestId(`demo-${CLASS_ID}-own-key`);
    for (const key of [...demo.querySelectorAll('[data-testid^="demo-key-"]')]) {
      fireEvent.click(key);
    }
    expect(onPromotionToggle).not.toHaveBeenCalled();
    expect(onInputOrderChange).not.toHaveBeenCalled();
    expect(onMarkTreatmentChange).not.toHaveBeenCalled();
  });

  it("FR-013: a demo advances only on author action — never on a timer", () => {
    vi.useFakeTimers();
    try {
      renderStation({ answer: answer({ inputOrder: "prefix" }) });
      const before =
        within(screen.getByTestId(`demo-${CLASS_ID}-own-key`)).getByTestId("demo-output")
          .textContent ?? "";
      vi.advanceTimersByTime(10_000);
      const after =
        within(screen.getByTestId(`demo-${CLASS_ID}-own-key`)).getByTestId("demo-output")
          .textContent ?? "";
      expect(after).toBe(before);
    } finally {
      vi.useRealTimers();
    }
  });

  it("a demo can be reset to its initial state", () => {
    renderStation({ answer: answer({ inputOrder: "postfix" }) });
    const demo = screen.getByTestId(`demo-${CLASS_ID}-own-key`);
    fireEvent.click(within(demo).getByTestId("demo-key-1"));
    expect(
      within(screen.getByTestId(`demo-${CLASS_ID}-own-key`)).getByTestId("demo-output").textContent,
    ).not.toBe("");
    fireEvent.click(
      within(screen.getByTestId(`demo-${CLASS_ID}-own-key`)).getByTestId("demo-reset"),
    );
    expect(
      within(screen.getByTestId(`demo-${CLASS_ID}-own-key`)).getByTestId("demo-output").textContent,
    ).toBe("");
  });

  it("US2 AC6: option controls and demo controls are separately reachable and neither traps focus", () => {
    renderStation();
    const option = screen
      .getByTestId(`treatment-option-${CLASS_ID}-own-key`)
      .querySelector("input");
    const demoKey = within(screen.getByTestId(`demo-${CLASS_ID}-own-key`)).getByTestId(
      "demo-key-1",
    );
    expect(option).not.toBeNull();
    // Both are natively focusable elements, and neither is removed from the tab
    // order or given a focus trap.
    expect(option?.getAttribute("tabindex")).not.toBe("-1");
    expect(demoKey.tagName.toLowerCase()).toBe("button");
    expect(demoKey.getAttribute("tabindex")).not.toBe("-1");
    option?.focus();
    expect(document.activeElement).toBe(option);
    demoKey.focus();
    expect(document.activeElement).toBe(demoKey);
    option?.focus();
    expect(document.activeElement).toBe(option);
  });

  it("no demo is rendered for an option that is not offered", () => {
    // Promotion checkboxes are not options; the two treatment values are. There
    // must be no orphan demo node for anything else.
    renderStation();
    const demos = [...document.querySelectorAll('[data-testid^="demo-above-1-"]')];
    expect(demos.map((d) => d.getAttribute("data-testid")).sort()).toEqual([
      `demo-${CLASS_ID}-composed`,
      `demo-${CLASS_ID}-own-key`,
    ]);
  });
});

// ---------------------------------------------------------------------------
// US3 — the key budget's effect on the promotion gate
// ---------------------------------------------------------------------------

describe("MarkTreatmentStation — promotion gate (spec 052 US3)", () => {
  it("US3 AC1/SC-007: a fully-booked base makes promotion UNAVAILABLE with a plain-language reason", () => {
    renderStation({
      prefills: [
        prefill({
          promotionProposal: [],
          signals: {
            productivitySpread: 3,
            baseMechanism: null,
            promotionAffordable: false,
            unaffordableReason: "There is no room left on the keyboard you started from.",
          },
        }),
      ],
    });
    const group = screen.getByTestId(`promotion-${CLASS_ID}`);
    expect(group).toBeTruthy(); // present, not absent
    expect(group.hasAttribute("disabled")).toBe(true);
    const reason = screen.getByTestId(`promotion-unavailable-reason-${CLASS_ID}`);
    expect(reason.textContent?.trim()).not.toBe("");
    // Plain language: no production jargon in the reason.
    expect(reason.textContent ?? "").not.toMatch(/dead ?key|unicode|normali[sz]|codepoint/i);
  });

  it("US3 AC2: an ample base offers promotion, enabled", () => {
    renderStation();
    const group = screen.getByTestId(`promotion-${CLASS_ID}`);
    expect(group.hasAttribute("disabled")).toBe(false);
    expect(screen.getByTestId(`promotion-${CLASS_ID}-á`)).toBeTruthy();
    expect(screen.queryByTestId(`promotion-unavailable-reason-${CLASS_ID}`)).toBeNull();
  });

  it("ABSENT is distinct from UNAVAILABLE: nothing to promote renders no group at all", () => {
    renderStation({ promotable: { [CLASS_ID]: [] } });
    expect(screen.queryByTestId(`promotion-${CLASS_ID}`)).toBeNull();
    expect(screen.queryByTestId(`promotion-unavailable-reason-${CLASS_ID}`)).toBeNull();
  });

  it("FR-017/US3 AC3: composed stays selectable at every band — the author is never left with nothing", () => {
    for (const affordable of [true, false]) {
      cleanup();
      renderStation({
        prefills: [
          prefill({
            signals: {
              productivitySpread: 3,
              baseMechanism: null,
              promotionAffordable: affordable,
              ...(affordable ? {} : { unaffordableReason: "No room left." }),
            },
          }),
        ],
      });
      for (const value of ["own-key", "composed"]) {
        const input = screen
          .getByTestId(`treatment-option-${CLASS_ID}-${value}`)
          .querySelector("input");
        expect(input?.disabled, `${value} @ affordable=${affordable}`).toBe(false);
      }
    }
  });

  it("edge case: an exhausted budget AND high productivity still leaves the station completable", () => {
    renderStation({
      prefills: [
        prefill({
          recommended: "own-key",
          promotionProposal: [],
          signals: {
            productivitySpread: 12,
            baseMechanism: "combining-keystroke",
            promotionAffordable: false,
            unaffordableReason: "No room left.",
          },
        }),
      ],
    });
    // A recommendation is selected, so there is an answer to continue with.
    const selected = screen
      .getByTestId(`treatment-option-${CLASS_ID}-own-key`)
      .querySelector("input");
    expect(selected?.checked).toBe(true);
    expect(selected?.disabled).toBe(false);
  });

  it("promotion is a set of CHECKBOXES, independent of the treatment radios (FR-002/FR-003)", () => {
    renderStation();
    const group = screen.getByTestId(`promotion-${CLASS_ID}`);
    const inputs = [...group.querySelectorAll("input")];
    expect(inputs.length).toBeGreaterThan(0);
    for (const input of inputs) expect(input.type).toBe("checkbox");
  });

  it("toggling a promotion reports the character, and does not touch treatment", () => {
    const { onPromotionToggle, onClassTreatmentChange } = renderStation();
    const label = screen.getByTestId(`promotion-${CLASS_ID}-á`);
    fireEvent.click(label.querySelector("input") as HTMLInputElement);
    expect(onPromotionToggle).toHaveBeenCalledWith("á", true);
    expect(onClassTreatmentChange).not.toHaveBeenCalled();
  });
});

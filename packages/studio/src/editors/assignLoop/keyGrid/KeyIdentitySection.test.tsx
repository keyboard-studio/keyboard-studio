// KeyIdentitySection — spec 104 FR-025 / T020 + FR-029 / T020b.
//
// Raw DOM assertions, matching this package's convention. The view models
// here are literal: the builder has its own suite; this file covers only
// what the section renders and the re-link confirm flow.

import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, screen } from "@testing-library/react";
import type { TransplantRecord } from "@keyboard-studio/contracts";
import { render } from "../../../test/renderWithI18n.tsx";
import { KeyIdentitySection } from "./KeyIdentitySection.tsx";
import type { KeyIdentityViewModel } from "./keyIdentityViewModel.ts";

afterEach(() => {
  cleanup();
});

const TRANSPLANT: TransplantRecord = {
  recordId: "transplant:test:1",
  sourceId: "K_2",
  targetId: "T_0310",
  layersAffected: ["default", "shift"],
  clonedRuleNodeIds: [
    { sourceNodeId: "rule#1", cloneNodeId: "clone#1" },
    { sourceNodeId: "rule#2", cloneNodeId: "clone#2" },
  ],
  outcome: "completed",
};

function makeInfo(overrides: Partial<KeyIdentityViewModel> = {}): KeyIdentityViewModel {
  return {
    keyRef: "tablet:default:T_0310",
    keyId: "T_0310",
    form: "T_",
    criterion: {
      source: "recorded",
      criterion: "FR-008",
      action: "severed",
      detail: "Severed from K_2 under FR-008; the transplant record carries the detail.",
    },
    productionRows: [
      {
        layerId: "default",
        stateLabel: "state 0",
        viaSubkey: false,
        production: {
          productions: [
            { output: { kind: "text", text: "̍" }, condition: "otherwise" },
            { output: { kind: "none" }, condition: "context: any(diablock)" },
          ],
          source: "rule",
          contextConditional: true,
          ruleRefs: ["clone#1"],
          fallbackCertain: true,
        },
      },
      {
        layerId: "shift",
        stateLabel: "SHIFT",
        viaSubkey: false,
        production: {
          productions: [{ output: { kind: "text", text: "̍" } }],
          source: "rule",
          contextConditional: false,
          ruleRefs: ["clone#2"],
          fallbackCertain: true,
        },
      },
    ],
    decisions: [
      {
        recordId: "decision:sever:1",
        keyRef: "tablet:default:K_2",
        action: "severed",
        criterion: "FR-008",
        track: "adapt",
        proposer: "criteria",
        authorAnswer: "accepted",
        hostSet: ["US"],
        recordedAt: 1_700_000_000_000,
        supersedes: null,
      },
    ],
    transplant: TRANSPLANT,
    relink: { record: TRANSPLANT, sourceId: "K_2" },
    ...overrides,
  };
}

describe("KeyIdentitySection — criterion + provenance (FR-025)", () => {
  it("shows the recorded criterion detail and the decision provenance", () => {
    render(<KeyIdentitySection info={makeInfo()} />);
    const section = screen.getByTestId("key-identity-section");
    expect(section.textContent).toContain("Severed from K_2 under FR-008");
    expect(section.textContent).toContain("From the recorded decision for this key.");
    expect(section.textContent).toContain("Checked against the US keyboard");
    expect(section.textContent).toContain("severed · FR-008");
    expect(section.textContent).toContain("accepted");
    expect(section.textContent).toContain("2 rules were copied from K_2");
  });

  it("keeps the production table inside a disclosure closed by default", () => {
    const { container } = render(<KeyIdentitySection info={makeInfo()} />);
    const details = container.querySelector("details");
    expect(details).not.toBeNull();
    expect(details?.hasAttribute("open")).toBe(false);
    // The rows exist in the DOM (screen readers / find-in-page) with layer,
    // state, production, condition and named source.
    const text = details?.textContent ?? "";
    expect(text).toContain("default");
    expect(text).toContain("SHIFT");
    expect(text).toContain("context: any(diablock)");
    expect(text).toContain("Rule");
  });

  it("shows the derived note (not the recorded one) for an unrecorded key", () => {
    render(
      <KeyIdentitySection
        info={makeInfo({
          criterion: {
            source: "derived",
            criterion: "a",
            detail: "Rule logic is required and the key already carries a ruled T_ identity.",
          },
          decisions: [],
          transplant: undefined,
          relink: undefined,
        })}
      />,
    );
    const section = screen.getByTestId("key-identity-section");
    expect(section.textContent).toContain("no decision has been recorded for this key yet");
    expect(section.textContent).not.toContain("How this key got its form");
  });

  it("shows the per-mark start-of-line state when the key types a combining mark (#2374)", () => {
    render(<KeyIdentitySection info={makeInfo({ bareMarkAllowed: true })} />);
    let section = screen.getByTestId("key-identity-section");
    expect(section.textContent).toContain("At the start of a line");
    expect(section.textContent).toContain("The mark appears");
    cleanup();
    render(<KeyIdentitySection info={makeInfo({ bareMarkAllowed: false })} />);
    section = screen.getByTestId("key-identity-section");
    expect(section.textContent).toContain("At the start of a line");
    expect(section.textContent).toContain("The mark types nothing");
  });

  it("shows no start-of-line row when the view model carries none", () => {
    render(<KeyIdentitySection info={makeInfo()} />);
    const section = screen.getByTestId("key-identity-section");
    expect(section.textContent).not.toContain("At the start of a line");
  });
});

describe("KeyIdentitySection — FR-029 re-link", () => {
  it("offers the action only with a handler, behind an inline confirm", () => {
    const onRelink = vi.fn();
    render(<KeyIdentitySection info={makeInfo()} onRelink={onRelink} />);
    const button = screen.getByRole("button", { name: "Re-link to K_2" });
    fireEvent.click(button);
    // Explainer first (FR-018 pattern) — nothing invoked yet.
    expect(onRelink).not.toHaveBeenCalled();
    expect(screen.getByTestId("key-identity-section").textContent).toContain(
      "behaves exactly as K_2 does in every state",
    );
    fireEvent.click(screen.getByRole("button", { name: "Re-link this key" }));
    expect(onRelink).toHaveBeenCalledTimes(1);
    expect(onRelink).toHaveBeenCalledWith(TRANSPLANT);
  });

  it("cancel keeps the key separate and invokes nothing", () => {
    const onRelink = vi.fn();
    render(<KeyIdentitySection info={makeInfo()} onRelink={onRelink} />);
    fireEvent.click(screen.getByRole("button", { name: "Re-link to K_2" }));
    fireEvent.click(screen.getByRole("button", { name: "Keep it separate" }));
    expect(onRelink).not.toHaveBeenCalled();
    expect(screen.getByRole("button", { name: "Re-link to K_2" })).toBeDefined();
  });

  it("renders NO re-link affordance without a handler (absent, never disabled)", () => {
    render(<KeyIdentitySection info={makeInfo()} />);
    expect(screen.queryByRole("button", { name: "Re-link to K_2" })).toBeNull();
  });
});

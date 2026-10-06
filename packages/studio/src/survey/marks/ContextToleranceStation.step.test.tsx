// ContextToleranceStation, normalization-step branch (spec 086 US3): the intro
// carries the rule count, the examples list, one confirm and one decline with no
// per-site ticks, and the 062 fallback names why the step was not offered.

import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, screen } from "@testing-library/react";
import type { RuleToleranceFinding } from "@keyboard-studio/contracts";

import { render } from "../../test/renderWithI18n.tsx";
import { ContextToleranceStation } from "./ContextToleranceStation.tsx";
import { buildContextToleranceProposal, buildNormalizationStepProposal } from "./contextToleranceProposal.ts";

afterEach(cleanup);

const FINGERPRINT = "normalization-step|abc|1";
const NAMES = new Map<number, string>([
  [0x65, "LATIN SMALL LETTER E"],
  [0x323, "COMBINING DOT BELOW"],
  [0x1eb9, "LATIN SMALL LETTER E WITH DOT BELOW"],
]);
const loadNames = () => Promise.resolve(NAMES as ReadonlyMap<number, string>);

const stepProposal = () =>
  buildNormalizationStepProposal({ ruleCount: 9, framing: "Convert pasted text", description: "Adds 9 rules." });

function renderStep(prior?: Parameters<typeof ContextToleranceStation>[0]["prior"]) {
  const onDecide = vi.fn();
  render(
    <ContextToleranceStation
      proposal={stepProposal()}
      disclosures={{}}
      ruleLines={{}}
      fingerprint={FINGERPRINT}
      step={{ ruleCount: 9, examples: [{ pasted: "ẹ", result: "ẹ" }] }}
      loadNames={loadNames}
      {...(prior !== undefined ? { prior } : {})}
      onDecide={onDecide}
    />,
  );
  return onDecide;
}

describe("ContextToleranceStation, normalization step", () => {
  it("shows the rule count, the examples and the rewrite disclosure, with no per-site ticks", async () => {
    renderStep();
    expect(screen.getByText("Adds 9 rules. None of your rules change.")).toBeTruthy();
    expect(screen.getByRole("list")).toBeTruthy();
    await screen.findByText(/U\+0323 COMBINING DOT BELOW/);
    expect(screen.getByText(/converted to this keyboard's own form when you type/)).toBeTruthy();
    expect(screen.queryAllByRole("checkbox")).toHaveLength(0);
    // One confirm and one decline, both native buttons.
    expect(screen.getByRole("button", { name: "Add this step" }).tagName).toBe("BUTTON");
    expect(screen.getByRole("button", { name: "Leave my keyboard as it is" }).tagName).toBe("BUTTON");
  });

  it("uses the singular for a one-rule step", () => {
    const onDecide = vi.fn();
    render(
      <ContextToleranceStation
        proposal={stepProposal()}
        disclosures={{}}
        ruleLines={{}}
        fingerprint={FINGERPRINT}
        step={{ ruleCount: 1, examples: [] }}
        loadNames={loadNames}
        onDecide={onDecide}
      />,
    );
    expect(screen.getByText("Adds 1 rule. None of your rules change.")).toBeTruthy();
  });

  it("accept records an accept decision naming the single site, never partial", () => {
    const onDecide = renderStep();
    fireEvent.click(screen.getByRole("button", { name: "Add this step" }));
    expect(onDecide).toHaveBeenCalledTimes(1);
    expect(onDecide).toHaveBeenCalledWith({
      decision: "accept",
      acceptedSiteIds: ["normalization-step"],
      proposedSiteIds: ["normalization-step"],
      fingerprint: FINGERPRINT,
    });
  });

  it("decline records a decline decision with no accepted site", () => {
    const onDecide = renderStep();
    fireEvent.click(screen.getByRole("button", { name: "Leave my keyboard as it is" }));
    expect(onDecide).toHaveBeenCalledWith({
      decision: "decline",
      acceptedSiteIds: [],
      proposedSiteIds: ["normalization-step"],
      fingerprint: FINGERPRINT,
    });
  });

  it("shows a prior accept read-only with a change control", () => {
    renderStep({
      decision: "accept",
      acceptedSiteIds: ["normalization-step"],
      proposedSiteIds: ["normalization-step"],
      fingerprint: FINGERPRINT,
    });
    expect(screen.getByText(/step that converts pasted text/)).toBeTruthy();
    expect(screen.getByTestId("context-tolerance-change")).toBeTruthy();
  });
});

describe("ContextToleranceStation, fallback after a refusal", () => {
  const FINDINGS: RuleToleranceFinding[] = [
    { ruleId: "r10", location: { file: "k.kmn", line: 10 }, status: "not-analysed", failingKeystrokes: [{ vkey: "K_LBRKT", modifiers: [] }] },
  ];
  const variantsProposal = () =>
    buildContextToleranceProposal({
      fixableRuleIds: ["r10"],
      findings: FINDINGS,
      addedRuleCount: 2,
      text: { siteFraming: (line) => `rule on line ${line}`, description: () => "Adds 2 rules." },
    });

  it("renders the 062 station with per-site ticks plus one line naming the reason", () => {
    render(
      <ContextToleranceStation
        proposal={variantsProposal()}
        disclosures={{}}
        ruleLines={{ r10: 10 }}
        fingerprint="f"
        fallbackReason="opaque-output-store"
        onDecide={vi.fn()}
      />,
    );
    expect(screen.getByTestId("context-tolerance-fallback-reason").textContent).toMatch(/could not be read in full/);
    expect(screen.getAllByRole("checkbox")).toHaveLength(1);
    expect(screen.getByRole("button", { name: "Add these rules" })).toBeTruthy();
  });

  it("shows no reason line when the variants are offered without a refusal", () => {
    render(
      <ContextToleranceStation
        proposal={variantsProposal()}
        disclosures={{}}
        ruleLines={{ r10: 10 }}
        fingerprint="f"
        onDecide={vi.fn()}
      />,
    );
    expect(screen.queryByTestId("context-tolerance-fallback-reason")).toBeNull();
  });
});

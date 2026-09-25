// ContextToleranceStation (spec 078 T029/T044): pre-ticked sites, disclosure
// rows, accept / partial / decline outcomes, labelled keyboard-operable ticks
// (FR-014), accept in at most two interactions (SC-002), and the read-only
// prior-decision view with a change control (FR-009).

import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, screen } from "@testing-library/react";
import type { MarksContextToleranceDecision, RuleToleranceFinding } from "@keyboard-studio/contracts";

import { render } from "../../test/renderWithI18n.tsx";
import { ContextToleranceStation, type SiteDisclosure } from "./ContextToleranceStation.tsx";
import { buildContextToleranceProposal } from "./contextToleranceProposal.ts";

afterEach(cleanup);

const FINDINGS: RuleToleranceFinding[] = [
  { ruleId: "r10", location: { file: "k.kmn", line: 10 }, status: "not-analysed", failingKeystrokes: [{ vkey: "K_LBRKT", modifiers: [] }] },
  { ruleId: "r12", location: { file: "k.kmn", line: 12 }, status: "not-analysed", failingKeystrokes: [{ vkey: "K_RBRKT", modifiers: [] }] },
  { ruleId: "r20", location: { file: "k.kmn", line: 20 }, status: "tolerant" },
];

const FINGERPRINT = "abcdef0123456789";

function proposal() {
  return buildContextToleranceProposal({
    fixableRuleIds: ["r10", "r12"],
    findings: FINDINGS,
    addedRuleCount: 4,
    text: {
      siteFraming: (line, key) => `The ${key} key (rule on line ${line})`,
      description: (added, sites) => `Adds ${added} rules for ${sites} keys.`,
    },
  });
}

const DISCLOSURES: Record<string, SiteDisclosure> = {
  r10: { shadows: [{ ruleId: "r20", relation: "shadows", fallback: false }], markOrderNote: "dot below is typed before the tone" },
  r12: { shadows: [], unobservable: "mnemonic-backspace" },
};
const LINES = { r10: 10, r12: 12, r20: 20 };

function renderStation(prior?: MarksContextToleranceDecision) {
  const onDecide = vi.fn();
  render(
    <ContextToleranceStation
      proposal={proposal()}
      disclosures={DISCLOSURES}
      ruleLines={LINES}
      fingerprint={FINGERPRINT}
      {...(prior !== undefined ? { prior } : {})}
      onDecide={onDecide}
    />,
  );
  return onDecide;
}

describe("ContextToleranceStation — proposal", () => {
  it("pre-ticks every site, each tick labelled by its own rule", () => {
    renderStation();
    const ticks = screen.getAllByRole("checkbox");
    expect(ticks).toHaveLength(2);
    for (const tick of ticks) expect((tick as HTMLInputElement).checked).toBe(true);
    expect(screen.getByRole("checkbox", { name: /The \[ key \(rule on line 10\)/ })).toBeTruthy();
    expect(screen.getByRole("checkbox", { name: /The \] key \(rule on line 12\)/ })).toBeTruthy();
  });

  it("renders the disclosure rows: shadowed rules, the mnemonic note, the mark-order note", () => {
    renderStation();
    const rows = screen.getByTestId("context-tolerance-disclosures");
    expect(rows.textContent).toMatch(/take priority over the rule on line 20/);
    expect(rows.textContent).toMatch(/Backspace does here cannot be demonstrated/);
    expect(rows.textContent).toMatch(/dot below is typed before the tone/);
  });

  it("confirming with every site ticked is accept, in one interaction (SC-002)", () => {
    const onDecide = renderStation();
    fireEvent.click(screen.getByRole("button", { name: "Add these rules" }));
    expect(onDecide).toHaveBeenCalledTimes(1);
    expect(onDecide).toHaveBeenCalledWith({
      decision: "accept",
      acceptedSiteIds: ["r10", "r12"],
      proposedSiteIds: ["r10", "r12"],
      fingerprint: FINGERPRINT,
    });
  });

  it("unticking one site gives partial with the right accepted ids", () => {
    const onDecide = renderStation();
    fireEvent.click(screen.getByRole("checkbox", { name: /rule on line 12/ }));
    fireEvent.click(screen.getByRole("button", { name: "Add these rules" }));
    expect(onDecide).toHaveBeenCalledWith(
      expect.objectContaining({ decision: "partial", acceptedSiteIds: ["r10"], proposedSiteIds: ["r10", "r12"] }),
    );
  });

  it("unticking every site is a decline", () => {
    const onDecide = renderStation();
    for (const tick of screen.getAllByRole("checkbox")) fireEvent.click(tick);
    fireEvent.click(screen.getByRole("button", { name: "Add these rules" }));
    expect(onDecide).toHaveBeenCalledWith(expect.objectContaining({ decision: "decline", acceptedSiteIds: [] }));
  });

  it("'Leave my keyboard as it is' declines with no accepted sites (T044)", () => {
    const onDecide = renderStation();
    fireEvent.click(screen.getByRole("button", { name: "Leave my keyboard as it is" }));
    expect(onDecide).toHaveBeenCalledWith({
      decision: "decline",
      acceptedSiteIds: [],
      proposedSiteIds: ["r10", "r12"],
      fingerprint: FINGERPRINT,
    });
  });

  it("every control is a native, keyboard-operable element (FR-014)", () => {
    renderStation();
    for (const el of [...screen.getAllByRole("checkbox"), ...screen.getAllByRole("button")]) {
      expect(["INPUT", "BUTTON"]).toContain(el.tagName);
      expect(el.getAttribute("tabindex")).not.toBe("-1");
    }
  });
});

describe("ContextToleranceStation — prior decision (FR-009)", () => {
  const prior = (fingerprint: string): MarksContextToleranceDecision => ({
    decision: "decline",
    acceptedSiteIds: [],
    proposedSiteIds: ["r10", "r12"],
    fingerprint,
  });

  it("an identical fingerprint shows the prior outcome read-only, not the proposal", () => {
    renderStation(prior(FINGERPRINT));
    expect(screen.getByText(/You chose to leave your keyboard as it is/)).toBeTruthy();
    expect(screen.queryAllByRole("checkbox")).toHaveLength(0);
    expect(screen.getByTestId("context-tolerance-station").getAttribute("data-prior")).toBe("decline");
  });

  it("the change control re-opens the pre-filled proposal", () => {
    renderStation(prior(FINGERPRINT));
    fireEvent.click(screen.getByRole("button", { name: "Change this decision" }));
    const ticks = screen.getAllByRole("checkbox");
    expect(ticks).toHaveLength(2);
    for (const tick of ticks) expect((tick as HTMLInputElement).checked).toBe(true);
  });

  it("a changed fingerprint raises the proposal again, pre-filled", () => {
    renderStation(prior("1111111111111111"));
    expect(screen.queryByText(/You chose to leave your keyboard as it is/)).toBeNull();
    expect(screen.getAllByRole("checkbox")).toHaveLength(2);
  });
});

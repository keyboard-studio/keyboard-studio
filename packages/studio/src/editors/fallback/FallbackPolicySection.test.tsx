// FallbackPolicySection — fallback to the base keyboard (spec 109 US1).

import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { uniformFallbackPolicy } from "@keyboard-studio/contracts";
import { cleanup, fireEvent, screen, within } from "@testing-library/react";
import { render } from "../../test/renderWithI18n.tsx";
import { irGroup, makeTestIR, vkeyRule } from "@keyboard-studio/contracts/fixtures";
import { FallbackPolicySection } from "./FallbackPolicySection.tsx";
import { useWorkingCopyStore } from "../../stores/workingCopyStore.ts";
import { useDecisionStore } from "../../stores/decisionStore.ts";
import { fallbackLeaksForProjection, currentPickedLayoutIds } from "../../lib/fallbackLeaks.ts";

const USE_COMPUTER = "Use the computer's layout";

const store = () => useWorkingCopyStore.getState();

/** A keyboard that binds K_A on the default and AltGr layers; every other key is unhandled. */
function overlayIr(bcp47: string[] = ["en"]) {
  return makeTestIR({
    header: { bcp47 },
    groups: [
      irGroup({
        nodeId: "group#main",
        rules: [
          vkeyRule({ nodeId: "r1", vkey: "K_A", output: "a" }),
          vkeyRule({ nodeId: "r2", vkey: "K_A", modifiers: ["RALT"], output: "x" }),
        ],
      }),
    ],
  });
}

function loadIr(ir = overlayIr()): void {
  useWorkingCopyStore.setState({ startIr: ir, ir });
}

function pick(layoutIds: string[]): void {
  useDecisionStore.getState().record({
    id: "windows-layout",
    value: { layoutIds, origin: "confirmed" },
    provenance: "asked",
    step: "layout",
  });
}

beforeEach(() => {
  useWorkingCopyStore.getState().reset();
  useDecisionStore.getState().reset();
});
afterEach(() => cleanup());

describe("FallbackPolicySection", () => {
  it("names the base keyboards in its title (FR-001)", () => {
    loadIr();
    pick(["basic_kbduk"]);
    render(<FallbackPolicySection />);
    const title = screen.getByTestId("fallback-policy-title").textContent ?? "";
    expect(title).toMatch(/^Fallback to the base keyboard: /);
    expect(title).toContain("United Kingdom");
  });

  it("lists AltGr+4 with the euro sign on a picked UK English base keyboard (SC-001)", () => {
    loadIr();
    pick(["basic_kbduk"]);
    render(<FallbackPolicySection defaultOpen />);
    const entry = screen.getByTestId("fallback-leak-basic_kbduk-RALT-K_4");
    expect(entry.textContent).toContain("RALT + 4");
    expect(within(entry).getByRole("img", { name: "U+20AC" }).textContent).toBe("€");
    // It sits in the punctuation-and-symbols group, apart from letters and digits.
    expect(
      within(screen.getByTestId("fallback-group-basic_kbduk-punctuation")).getByTestId(
        "fallback-leak-basic_kbduk-RALT-K_4",
      ),
    ).toBeTruthy();
  });

  it("shows one list per picked base keyboard, primary open and the others expandable (FR-002)", () => {
    loadIr();
    pick(["basic_kbdus", "basic_kbdfr"]);
    render(<FallbackPolicySection defaultOpen />);
    expect(screen.getByTestId("fallback-list-basic_kbdus")).toBeTruthy();
    const extra = screen.getByTestId("fallback-extra-basic_kbdfr");
    expect(extra.tagName).toBe("DETAILS");
    expect(within(extra).getByTestId("fallback-list-basic_kbdfr")).toBeTruthy();
    // The same position carries each base keyboard's own character: digit 1 is "1" on US, "&" on AZERTY.
    expect(
      within(screen.getByTestId("fallback-list-basic_kbdus")).getByTestId("fallback-leak-basic_kbdus--K_1").textContent,
    ).toContain("1");
    expect(
      within(screen.getByTestId("fallback-list-basic_kbdfr")).getByTestId("fallback-leak-basic_kbdfr--K_1").textContent,
    ).toContain("&");
  });

  it("says unknown for every position of a base keyboard with no data, and guesses nothing", () => {
    loadIr();
    pick(["basic_kbdnodata"]);
    render(<FallbackPolicySection defaultOpen />);
    const unknown = screen.getByTestId("fallback-group-basic_kbdnodata-unknown");
    expect(within(unknown).getAllByRole("listitem").every((li) => li.textContent?.includes("unknown"))).toBe(true);
    expect(screen.queryByTestId("fallback-group-basic_kbdnodata-letters")).toBeNull();
  });

  it("shows a deadkey entry as starting a deadkey", () => {
    loadIr();
    pick(["basic_kbdusx"]);
    render(<FallbackPolicySection defaultOpen />);
    const group = screen.getByTestId("fallback-group-basic_kbdusx-deadkey");
    expect(within(group).getAllByRole("listitem")[0]?.textContent).toContain("starts a deadkey");
  });

  it("marks positions on a layer the keyboard does not bind as not covered", () => {
    // Only the AltGr layer is bound: the default layer has no binding, so a swallow would not cover it.
    loadIr(
      makeTestIR({
        header: { bcp47: ["en"] },
        groups: [irGroup({ nodeId: "group#main", rules: [vkeyRule({ nodeId: "r2", vkey: "K_A", modifiers: ["RALT"], output: "x" })] })],
      }),
    );
    pick(["basic_kbduk"]);
    render(<FallbackPolicySection defaultOpen />);
    expect(screen.getByTestId("fallback-leak-basic_kbduk--K_4").textContent).toContain("not covered");
    expect(screen.getByTestId("fallback-leak-basic_kbduk-RALT-K_4").textContent).not.toContain("not covered");
  });

  it("the collapsed summary counts what each class types on the primary base keyboard (FR-006)", () => {
    loadIr();
    pick(["basic_kbdus"]);
    render(<FallbackPolicySection />);
    const letters = screen.getByTestId("fallback-summary-letters").textContent ?? "";
    expect(letters).toMatch(/Letters: \d+ positions type something on US/);
    expect(Number(/(\d+) positions/.exec(letters)?.[1])).toBeGreaterThan(0);
    expect(screen.getByTestId("fallback-summary-digits").textContent).toContain("Digits:");
    expect(screen.getByTestId("fallback-summary-punctuation").textContent).toContain("Punctuation and symbols:");
  });

  it("with no picks, uses the likely base keyboards and labels them the studio's guess (FR-003)", () => {
    loadIr(overlayIr(["en-GB"]));
    render(<FallbackPolicySection defaultOpen />);
    expect(screen.getByTestId("fallback-host-caption").textContent).toMatch(/best guess/);
    expect(screen.getByTestId("fallback-host-caption").textContent).toMatch(/not sight/);
  });

  it("omits the guess caption once the author has picked a base keyboard", () => {
    loadIr();
    pick(["basic_kbdus"]);
    render(<FallbackPolicySection defaultOpen />);
    expect(screen.queryByTestId("fallback-host-caption")).toBeNull();
  });

  it("each class is a native radio group whose options state their own risk (A2)", () => {
    loadIr();
    render(<FallbackPolicySection defaultOpen />);
    for (const cls of ["letters", "digits", "punctuation"]) {
      const group = screen.getByTestId(`fallback-class-${cls}`);
      expect(group.tagName).toBe("FIELDSET");
      expect(group.querySelector("legend")).not.toBeNull();
      const radios = within(group).getAllByRole("radio");
      expect(radios).toHaveLength(2);
      for (const r of radios) {
        const desc = document.getElementById(r.getAttribute("aria-describedby") ?? "");
        expect((desc?.textContent ?? "").length).toBeGreaterThan(20);
      }
    }
    expect(screen.queryByText(/recommended|safe|best choice/i)).toBeNull();
  });

  it("shows a per-class proposal with evidence, and nothing is applied until confirmed (FR-020, FR-021)", () => {
    loadIr(overlayIr(["ko-Kore"]));
    pick(["basic_kbdus"]);
    render(<FallbackPolicySection defaultOpen />);
    expect(screen.getByTestId("fallback-evidence-digits").textContent).not.toBe("");
    expect(screen.getByTestId("fallback-policy-status").textContent).toMatch(/proposals/);
    expect(store().fallbackPolicyConfirmed).toBe(false);
    fireEvent.click(screen.getByTestId("fallback-policy-confirm"));
    expect(store().fallbackPolicyConfirmed).toBe(true);
    expect(screen.queryByTestId("fallback-policy-confirm")).toBeNull();
  });

  it("choosing an option for one class confirms and changes only that class", () => {
    loadIr();
    pick(["basic_kbdus"]);
    store().setFallbackPolicy(uniformFallbackPolicy("swallow"));
    store().setFallbackPolicyConfirmed(true);
    render(<FallbackPolicySection defaultOpen />);
    fireEvent.click(within(screen.getByTestId("fallback-class-digits")).getByRole("radio", { name: USE_COMPUTER }));
    expect(store().fallbackPolicy).toEqual({ letters: "swallow", digits: "pass-through", punctuation: "swallow" });
    expect(store().fallbackPolicyConfirmed).toBe(true);
  });

  it("states the deadkey rule as a rule, not a choice", () => {
    loadIr();
    render(<FallbackPolicySection defaultOpen />);
    expect(screen.getByTestId("fallback-policy-deadkey-rule").textContent).toBe(
      "Deadkey combinations always do nothing — allowing fallback would leave the deadkey armed.",
    );
    expect(screen.getAllByRole("radio")).toHaveLength(6);
  });

  it("recomputes from the working copy when a key is carved", () => {
    loadIr();
    pick(["basic_kbdus"]);
    const { rerender } = render(<FallbackPolicySection defaultOpen />);
    expect(screen.queryByTestId("fallback-leak-basic_kbdus--K_A")).toBeNull();
    useWorkingCopyStore.setState({ deletedNodeIds: new Set(["r1"]) });
    rerender(<FallbackPolicySection defaultOpen />);
    expect(screen.getByTestId("fallback-leak-basic_kbdus--K_A")).toBeTruthy();
  });

  describe("copy variant follows swallowUndefined (SC-003)", () => {
    const cases: Array<{ name: string; confirmed: boolean; policy: ReturnType<typeof uniformFallbackPolicy> }> = [
      { name: "unconfirmed Do nothing", confirmed: false, policy: uniformFallbackPolicy("swallow") },
      { name: "confirmed Do nothing", confirmed: true, policy: uniformFallbackPolicy("swallow") },
      { name: "confirmed pass-through", confirmed: true, policy: uniformFallbackPolicy("pass-through") },
      {
        name: "confirmed mixed",
        confirmed: true,
        policy: { letters: "pass-through", digits: "swallow", punctuation: "pass-through" },
      },
    ];
    it.each(cases)("$name: shown copy matches whether the projection suppresses", ({ confirmed, policy }) => {
      const ir = overlayIr();
      loadIr(ir);
      pick(["basic_kbdus"]);
      store().setFallbackPolicy(policy);
      store().setFallbackPolicyConfirmed(confirmed);
      render(<FallbackPolicySection defaultOpen />);
      const active = fallbackLeaksForProjection(ir, policy, confirmed, currentPickedLayoutIds()) !== undefined;
      const text = screen.getByTestId("fallback-desc-letters-swallow").textContent ?? "";
      if (active) {
        expect(text).toMatch(/^Keys not in your keyboard do nothing\. Silent on every computer/);
      } else {
        expect(text).toMatch(/never defined are not covered yet/);
        expect(text).toMatch(/still come through/);
      }
    });
  });

  it("the retired one-sided slogan appears nowhere in the rendered section (FR-004)", () => {
    loadIr();
    pick(["basic_kbdus"]);
    render(<FallbackPolicySection defaultOpen />);
    const text = screen.getByTestId("fallback-policy-section").textContent ?? "";
    expect(text).not.toMatch(/predictable/i);
  });

  it("is labelled and structured for assistive tech: summary, legends, labelled radios, named glyphs (spec 056)", () => {
    loadIr();
    pick(["basic_kbduk"]);
    render(<FallbackPolicySection defaultOpen />);
    for (const r of screen.getAllByRole("radio")) {
      expect((r as HTMLInputElement).labels?.length).toBeGreaterThan(0);
    }
    expect(screen.getByTestId("fallback-policy-section").querySelector("summary")).not.toBeNull();
    for (const img of screen.getAllByRole("img")) {
      expect(img.getAttribute("aria-label")).toMatch(/^U\+[0-9A-F]{4,}/);
    }
    expect(screen.getAllByRole("heading").length).toBeGreaterThan(1);
  });
});

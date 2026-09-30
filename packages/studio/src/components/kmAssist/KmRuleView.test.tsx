// Tests for KmRuleView — the read-only spec-082 rule card (Track C v1).
//
// Verifies: highlighted KMN renders with typed spans, the explanation line
// shows, the kind badge shows, diagnostics render when provided, the filter
// contract defaults plain-output to hidden, and — critically — the component
// exposes NO editing affordances (no inputs, textareas, or contentEditable).

import { describe, it, expect, afterEach } from "vitest";
import { cleanup, screen } from "@testing-library/react";
import { render } from "../../test/renderWithI18n.tsx";
import {
  highlightRule,
  type RuleKind,
  type TokenSpan,
} from "@keyboard-studio/engine/kmAssist";
import {
  DEFAULT_RULE_FILTER,
  KmRuleView,
  rulePassesFilter,
  type RuleFilter,
} from "./KmRuleView.tsx";

afterEach(() => {
  cleanup();
});

const KMN = "any(diablock) + [RALT K_C] > context";
const SPANS: TokenSpan[] = highlightRule(KMN);
const EXPLANATION =
  'Swallows the key when a character from the "diablock" store precedes it.';
const KIND: RuleKind = "blocking";

function renderView(overrides: Partial<Parameters<typeof KmRuleView>[0]> = {}) {
  return render(
    <KmRuleView
      kmnText={KMN}
      spans={SPANS}
      explanation={EXPLANATION}
      kind={KIND}
      {...overrides}
    />,
  );
}

describe("KmRuleView", () => {
  it("renders the highlighted KMN source with typed spans", () => {
    renderView();
    const source = screen.getByTestId("km-rule-view-source");
    expect(source.textContent).toBe(KMN);
    const keyed = source.querySelectorAll("[data-span-kind]");
    expect(keyed.length).toBeGreaterThan(0);
    const kinds = [...keyed].map((el) => el.getAttribute("data-span-kind"));
    expect(kinds).toContain("store-ref");
    expect(kinds).toContain("key");
    expect(kinds).toContain("operator");
    expect(kinds).toContain("output");
  });

  it("falls back to plain kmnText when no spans are provided", () => {
    renderView({ spans: [] });
    expect(screen.getByTestId("km-rule-view-source").textContent).toBe(KMN);
  });

  it("renders the kind badge and the explanation line", () => {
    renderView();
    expect(screen.getByTestId("km-rule-view-kind").textContent).toBe("Blocking");
    expect(screen.getByTestId("km-rule-view-explanation").textContent).toBe(EXPLANATION);
    expect(screen.getByTestId("km-rule-view").getAttribute("data-kind")).toBe("blocking");
  });

  it("renders diagnostics when provided, and none otherwise", () => {
    const { rerender } = renderView();
    expect(screen.queryByTestId("km-rule-view-diagnostics")).toBeNull();
    rerender(
      <KmRuleView
        kmnText={KMN}
        spans={SPANS}
        explanation={EXPLANATION}
        kind={KIND}
        diagnostics={["Shadows the plain C binding."]}
      />,
    );
    expect(screen.getByTestId("km-rule-view-diagnostics").textContent).toContain(
      "Shadows the plain C binding.",
    );
    expect(screen.getByTestId("km-rule-view-diagnostic-count").textContent).toBe("1 issue");
  });

  it("exposes no editing affordances", () => {
    const { container } = renderView();
    expect(container.querySelector("input, textarea, select, [contenteditable]")).toBeNull();
  });
});

describe("RuleFilter contract", () => {
  it("hides plain-output rules by default", () => {
    const def: RuleFilter = DEFAULT_RULE_FILTER;
    expect(def.showPlainOutput).toBe(false);
    expect(rulePassesFilter("plain-output", def)).toBe(false);
    expect(rulePassesFilter("blocking", def)).toBe(true);
    expect(rulePassesFilter("context", def)).toBe(true);
    expect(rulePassesFilter("reorder", def)).toBe(true);
    expect(rulePassesFilter("opaque", def)).toBe(true);
  });

  it("shows plain-output rules when the filter opts in", () => {
    expect(rulePassesFilter("plain-output", { showPlainOutput: true })).toBe(true);
  });
});

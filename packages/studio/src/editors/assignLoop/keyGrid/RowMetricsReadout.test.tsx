// RowMetricsReadout — spec 061 T025 (FR-013, FR-014, FR-015).
//
// No @testing-library/jest-dom — raw DOM assertions, matching this package's
// established convention (RemoveKeyDialog.test.tsx, Field.test.tsx).

import { describe, it, expect, afterEach } from "vitest";
import { cleanup, screen } from "@testing-library/react";
import { render } from "../../../test/renderWithI18n.tsx";
import { computeRowMetrics, type RowMetricKey } from "@keyboard-studio/engine";
import { RowMetricsReadout } from "./RowMetricsReadout.tsx";

afterEach(() => {
  cleanup();
});

function renderReadout(keys: readonly RowMetricKey[], platform: string, rowIndex = 0) {
  return render(
    <RowMetricsReadout rowIndex={rowIndex} metrics={computeRowMetrics(keys, platform)} />,
  );
}

function readoutText(rowIndex = 0): string {
  return screen.getByTestId(`key-grid-row-metrics-${rowIndex}`).textContent ?? "";
}

/** `n` letter keys with explicit geometry, so the expected totals are arithmetic rather than defaults. */
function letters(n: number, width: number, pad: number): RowMetricKey[] {
  return Array.from({ length: n }, () => ({ sp: 0, width, pad }));
}

describe("RowMetricsReadout — the four figures (FR-013)", () => {
  it("reports interactive key count, declared width total, padding total and row total", () => {
    renderReadout(letters(3, 100, 10), "phone");
    const text = readoutText();
    expect(text).toContain("3 keys");
    expect(text).toContain("300 declared width");
    expect(text).toContain("30 padding");
    expect(text).toContain("330 total");
  });

  it("counts a spacer's width but not the spacer itself", () => {
    renderReadout([...letters(2, 100, 0), { sp: 10, width: 50, pad: 0 }], "phone");
    const text = readoutText();
    expect(text).toContain("2 keys");
    expect(text).toContain("250 declared width");
  });

  it("prints a redistributed fractional width at one decimal, not at float precision", () => {
    // 400 shared across 3 keys — the shape `redistributeFreedWidth` produces.
    renderReadout(letters(3, 400 / 3, 0), "phone");
    const text = readoutText();
    expect(text).toContain("400 declared width");
    expect(text).not.toContain("33333");
  });

  it("keys its test id off the row index it was given", () => {
    renderReadout(letters(1, 100, 0), "phone", 3);
    expect(screen.getByTestId("key-grid-row-metrics-3")).toBeTruthy();
  });

  it("labels the width as DECLARED and explains the stretch (FR-015)", () => {
    renderReadout(letters(2, 100, 0), "phone");
    expect(readoutText()).toContain("declared width");
    const labelled = screen
      .getByTestId("key-grid-row-metrics-0")
      .querySelector<HTMLElement>("[title]");
    expect(labelled?.getAttribute("title") ?? "").toContain("stretching");
  });
});

describe("RowMetricsReadout — the crowding complaint (FR-014)", () => {
  it("says nothing about crowding for a row within the platform maximum", () => {
    renderReadout(letters(10, 100, 0), "phone");
    expect(screen.queryByTestId("key-grid-row-crowded-0")).toBeNull();
  });

  it("complains for a phone row over the maximum, naming the overage", () => {
    renderReadout(letters(12, 100, 0), "phone");
    const complaint = screen.getByTestId("key-grid-row-crowded-0").textContent ?? "";
    expect(complaint).toContain("Crowded");
    expect(complaint).toContain("2 over");
    expect(complaint).toContain("10");
  });

  it("does not complain about the same row on tablet, whose maximum is higher", () => {
    renderReadout(letters(12, 100, 0), "tablet");
    expect(screen.queryByTestId("key-grid-row-crowded-0")).toBeNull();
  });

  it("does not complain on an unruled platform however long the row", () => {
    renderReadout(letters(30, 100, 0), "desktop");
    expect(screen.queryByTestId("key-grid-row-crowded-0")).toBeNull();
  });

  it("never complains about a row of nothing but spacers", () => {
    renderReadout(Array(20).fill({ sp: 9, width: 10, pad: 0 }), "phone");
    expect(screen.queryByTestId("key-grid-row-crowded-0")).toBeNull();
  });

  it("states that the author may leave it — FR-014 forbids blocking", () => {
    renderReadout(letters(12, 100, 0), "phone");
    expect(screen.getByTestId("key-grid-row-crowded-0").textContent ?? "").toContain(
      "You can leave it",
    );
  });

  it("carries the complaint in words, not colour alone (accessibility rule 7)", () => {
    renderReadout(letters(12, 100, 0), "phone");
    const complaint = screen.getByTestId("key-grid-row-crowded-0");
    // Meaningful with all styling stripped.
    expect((complaint.textContent ?? "").trim().length).toBeGreaterThan(0);
  });
});

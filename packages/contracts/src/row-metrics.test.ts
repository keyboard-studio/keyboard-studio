// row-metrics — spec 061 T019 (FR-013, FR-014, research D6).
//
// The suite's real subject is that the phone-10 / tablet-13 pair has ONE
// statement. The threshold assertions below are deliberately written against
// `PLATFORM_MAX_KEYS_PER_ROW` as data rather than against the literals 10 and
// 13, EXCEPT in `describe("the table itself")`, which pins the numbers once so a
// silent recalibration of the corpus-derived thresholds cannot pass unnoticed.

import { describe, it, expect } from "vitest";
import {
  DEFAULT_KEY_PAD_PCT,
  DEFAULT_KEY_WIDTH_PCT,
  PLATFORM_MAX_KEYS_PER_ROW,
  computeRowMetrics,
  countInteractiveRowKeys,
  platformMaxKeysPerRow,
  type RowMetricKey,
} from "./row-metrics";

/** `n` ordinary letter keys, each carrying the declared geometry given. */
function letters(n: number, geometry: Partial<RowMetricKey> = {}): RowMetricKey[] {
  return Array.from({ length: n }, () => ({ sp: 0, ...geometry }));
}

describe("the table itself", () => {
  it("states phone 10 and tablet 13, and leaves desktop unruled", () => {
    expect(PLATFORM_MAX_KEYS_PER_ROW).toEqual({ phone: 10, tablet: 13 });
  });

  it("resolves an unruled platform to undefined rather than a sentinel number", () => {
    expect(platformMaxKeysPerRow("desktop")).toBeUndefined();
    expect(platformMaxKeysPerRow("watch")).toBeUndefined();
    expect(platformMaxKeysPerRow("phone")).toBe(10);
  });
});

describe("countInteractiveRowKeys", () => {
  it("excludes blank (sp:9) and spacer (sp:10) keys", () => {
    expect(
      countInteractiveRowKeys([{ sp: 0 }, { sp: 9 }, { sp: 10 }, { sp: undefined }]),
    ).toBe(2);
  });

  it("counts deadkey-styled (sp:8) keys — they are interactive and do crowd", () => {
    expect(countInteractiveRowKeys([{ sp: 8 }, { sp: 8 }])).toBe(2);
  });

  it("counts a row of nothing but spacers as zero", () => {
    expect(countInteractiveRowKeys(letters(0).concat(Array(14).fill({ sp: 10 })))).toBe(0);
  });
});

describe("computeRowMetrics — declared geometry (FR-015)", () => {
  it("defaults an absent width and pad to the 100-unit model's constants", () => {
    const metrics = computeRowMetrics([{ sp: 0 }, { sp: 0 }], "phone");
    expect(metrics.keyWidthTotal).toBe(2 * DEFAULT_KEY_WIDTH_PCT);
    expect(metrics.padTotal).toBe(2 * DEFAULT_KEY_PAD_PCT);
    expect(metrics.rowTotal).toBe(metrics.keyWidthTotal + metrics.padTotal);
  });

  it("sums the declared values when present, never a rendered width", () => {
    const metrics = computeRowMetrics(
      [
        { sp: 0, width: 150, pad: 0 },
        { sp: 0, width: 50, pad: 20 },
      ],
      "phone",
    );
    expect(metrics).toMatchObject({
      keyWidthTotal: 200,
      padTotal: 20,
      rowTotal: 220,
    });
  });

  it("counts a spacer's width and pad — it occupies space even though it does not crowd", () => {
    const metrics = computeRowMetrics([{ sp: 10, width: 40, pad: 0 }], "phone");
    expect(metrics.interactiveKeyCount).toBe(0);
    expect(metrics.keyWidthTotal).toBe(40);
  });

  it("measures an empty row as all zeroes rather than throwing", () => {
    expect(computeRowMetrics([], "phone")).toMatchObject({
      interactiveKeyCount: 0,
      keyWidthTotal: 0,
      padTotal: 0,
      rowTotal: 0,
    });
  });
});

describe("computeRowMetrics — the platform maximum", () => {
  const phoneMax = PLATFORM_MAX_KEYS_PER_ROW.phone as number;
  const tabletMax = PLATFORM_MAX_KEYS_PER_ROW.tablet as number;

  it("reports the maximum but no overage for a row exactly at the limit", () => {
    const metrics = computeRowMetrics(letters(phoneMax), "phone");
    expect(metrics.platformMaxKeys).toBe(phoneMax);
    expect(metrics.overMaximumBy).toBeUndefined();
  });

  it("reports the overage for a row over the limit", () => {
    const metrics = computeRowMetrics(letters(phoneMax + 1), "phone");
    expect(metrics.overMaximumBy).toBe(1);
  });

  it("does not flag the same row on tablet, whose limit is higher", () => {
    const metrics = computeRowMetrics(letters(phoneMax + 1), "tablet");
    expect(metrics.platformMaxKeys).toBe(tabletMax);
    expect(metrics.overMaximumBy).toBeUndefined();
  });

  it("omits both fields entirely on an unruled platform", () => {
    const metrics = computeRowMetrics(letters(40), "desktop");
    expect(metrics.platformMaxKeys).toBeUndefined();
    expect(metrics.overMaximumBy).toBeUndefined();
    expect("platformMaxKeys" in metrics).toBe(false);
    expect("overMaximumBy" in metrics).toBe(false);
  });

  it("never flags a row of nothing but spacers, however long", () => {
    const metrics = computeRowMetrics(Array(30).fill({ sp: 9 }), "phone");
    expect(metrics.interactiveKeyCount).toBe(0);
    expect(metrics.overMaximumBy).toBeUndefined();
  });
});

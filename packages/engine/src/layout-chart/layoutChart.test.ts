import { describe, it, expect } from "vitest";
import type { KeyboardIR, KvksIR, LayoutChartInput, TouchLayoutIR } from "@keyboard-studio/contracts";
import { makeTestIR } from "@keyboard-studio/contracts/fixtures";

import {
  renderLayoutCharts,
  layoutChartFilename,
  LAYOUT_CHART_PREFIX,
  isLayoutChartFilename,
  layoutChartPlatformFromFilename,
  sanitizeLayerIdForFilename,
  DOTTED_CIRCLE,
  EMPTY_KEYCAP_CLASS,
  NO_GLYPH_LABEL_CLASS,
} from "./index.js";

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------

/** A base K_A rule plus a SHIFT-cased K_A rule — one non-empty combo in use. */
function baseIr(): KeyboardIR {
  return makeTestIR([
    {
      nodeId: "g1",
      name: "main",
      usingKeys: true,
      readonly: false,
      rules: [
        {
          nodeId: "r1",
          context: [{ kind: "vkey", name: "K_A", modifiers: [] }],
          output: [{ kind: "char", value: "a" }],
        },
        {
          nodeId: "r2",
          context: [{ kind: "vkey", name: "K_A", modifiers: ["SHIFT"] }],
          output: [{ kind: "char", value: "A" }],
        },
      ],
    },
  ]);
}

function touchLayoutFixture(): TouchLayoutIR {
  return {
    platforms: [
      {
        id: "phone",
        layers: [
          {
            id: "default",
            rows: [{ keys: [{ nodeId: "n1", id: "K_A", text: "a", output: "a", width: 100, pad: 15 }] }],
          },
        ],
      },
      {
        id: "tablet",
        layers: [
          {
            id: "default",
            rows: [{ keys: [{ nodeId: "n2", id: "K_A", text: "a", output: "a", width: 100, pad: 15 }] }],
          },
        ],
      },
    ],
    nodeIds: [],
  };
}

function desktopOnlyInput(): LayoutChartInput {
  return { displayName: "Test KB", kvks: null, ir: baseIr(), touchLayout: null };
}

function desktopAndTouchInput(): LayoutChartInput {
  return { displayName: "Test KB", kvks: null, ir: baseIr(), touchLayout: touchLayoutFixture() };
}

function legibilityKvksInput(): LayoutChartInput {
  const kvks: KvksIR = {
    layers: [
      {
        shift: "",
        keys: [
          { vkey: "K_A", label: "a" },
          { vkey: "K_QUOTE", label: "́" }, // combining acute accent, standalone
          { vkey: "K_1", label: "中" }, // outside the coverage table
          { vkey: "K_2", label: "" }, // no output on this layer
        ],
      },
    ],
    usealtgr: false,
    nodeIds: [],
  };
  return { displayName: "Legibility KB", kvks, ir: makeTestIR([]), touchLayout: null };
}

// ---------------------------------------------------------------------------
// FR-014 determinism
// ---------------------------------------------------------------------------

describe("renderLayoutCharts — determinism (FR-014)", () => {
  it("renders the same input to byte-identical SVG across two calls", () => {
    const input = desktopAndTouchInput();
    const first = renderLayoutCharts(input);
    const second = renderLayoutCharts(input);
    expect(second).toEqual(first);
    for (let i = 0; i < first.length; i++) {
      expect(first[i]!.svg).toBe(second[i]!.svg);
    }
  });

  it("never embeds a timestamp-shaped substring", () => {
    const files = renderLayoutCharts(desktopAndTouchInput());
    for (const file of files) {
      expect(file.svg).not.toMatch(/\d{4}-\d{2}-\d{2}T\d{2}:\d{2}/);
    }
  });
});

// ---------------------------------------------------------------------------
// One file per (platform, layer); desktop-only / touch fixtures
// ---------------------------------------------------------------------------

describe("renderLayoutCharts — one file per (platform, layer)", () => {
  it("a desktop-only keyboard (no touchLayout) renders zero touch files and every desktop combo in use", () => {
    const files = renderLayoutCharts(desktopOnlyInput());
    expect(files.every((f) => f.platform === "desktop")).toBe(true);
    expect(files.some((f) => f.layerId === "default")).toBe(true);
    expect(files.some((f) => f.layerId === "shift")).toBe(true);
    expect(files).toHaveLength(2);
  });

  it("a keyboard with a touch layout renders one file per (platform, layer) in the model, in model order", () => {
    const files = renderLayoutCharts(desktopAndTouchInput());
    const desktopFiles = files.filter((f) => f.platform === "desktop");
    const phoneFiles = files.filter((f) => f.platform === "phone");
    const tabletFiles = files.filter((f) => f.platform === "tablet");
    expect(desktopFiles).toHaveLength(2);
    expect(phoneFiles).toHaveLength(1);
    expect(tabletFiles).toHaveLength(1);
    expect(phoneFiles[0]!.layerId).toBe("default");
    expect(tabletFiles[0]!.layerId).toBe("default");

    const platforms = files.map((f) => f.platform);
    expect(platforms.indexOf("phone")).toBeGreaterThan(platforms.lastIndexOf("desktop"));
    expect(platforms.indexOf("tablet")).toBeGreaterThan(platforms.lastIndexOf("phone"));
  });

  it("a keyboard with an IR always has at least the default desktop layer — never zero desktop files", () => {
    const files = renderLayoutCharts(desktopOnlyInput());
    expect(files.length).toBeGreaterThan(0);
  });

  it("renders zero touch files when touchLayout is null", () => {
    const files = renderLayoutCharts(desktopOnlyInput());
    expect(files.some((f) => f.platform === "phone" || f.platform === "tablet")).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// FR-015 filename sanitization + reserved prefix
// ---------------------------------------------------------------------------

describe("layoutChartFilename / sanitization (FR-015)", () => {
  it("emits the reserved prefix followed by platform and layer id", () => {
    expect(layoutChartFilename("desktop", "shift")).toBe("ks-layout-desktop-shift.svg");
    expect(layoutChartFilename("phone", "rightalt-caps")).toBe("ks-layout-phone-rightalt-caps.svg");
  });

  it("sanitizes disallowed characters to a deterministic hex escape, matching [a-z0-9_-]", () => {
    const sanitized = sanitizeLayerIdForFilename("Layer One!");
    expect(sanitized).toMatch(/^[a-z0-9_-]+$/);
    expect(sanitized).toBe(sanitizeLayerIdForFilename("Layer One!"));
    expect(sanitized).not.toBe(sanitizeLayerIdForFilename("Layer One?"));
  });

  it("is a pure function of (platform, layerId)", () => {
    expect(layoutChartFilename("tablet", "symbol")).toBe(layoutChartFilename("tablet", "symbol"));
  });

  it("carries the reserved ks-layout- prefix, recognized by isLayoutChartFilename", () => {
    const filename = layoutChartFilename("desktop", "default");
    expect(filename.startsWith(LAYOUT_CHART_PREFIX)).toBe(true);
    expect(isLayoutChartFilename(filename)).toBe(true);
    expect(isLayoutChartFilename("hand_drawn.png")).toBe(false);
  });

  it("layoutChartPlatformFromFilename recovers the platform from a generated filename only", () => {
    expect(layoutChartPlatformFromFilename(layoutChartFilename("phone", "shift"))).toBe("phone");
    expect(layoutChartPlatformFromFilename("hand_drawn.png")).toBeUndefined();
  });
});

// ---------------------------------------------------------------------------
// SC-008 legibility
// ---------------------------------------------------------------------------

describe("renderLayoutCharts — SC-008 legibility", () => {
  it("renders a standalone combining mark on the dotted-circle carrier", () => {
    const [chart] = renderLayoutCharts(legibilityKvksInput());
    expect(chart!.svg).toContain(`>${DOTTED_CIRCLE}́<`);
  });

  it("renders an uncovered code point as its U+XXXX scalar name in the no-glyph label class", () => {
    const [chart] = renderLayoutCharts(legibilityKvksInput());
    expect(chart!.svg).toContain(">U+4E2D<");
    expect(chart!.svg).toContain(`class="${NO_GLYPH_LABEL_CLASS}"`);
  });

  it("renders a key with no output on this layer in the distinct empty-keycap class", () => {
    const [chart] = renderLayoutCharts(legibilityKvksInput());
    expect(chart!.svg).toContain(`class="${EMPTY_KEYCAP_CLASS}"`);
  });
});

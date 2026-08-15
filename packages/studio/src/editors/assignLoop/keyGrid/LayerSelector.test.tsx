// Unit tests for LayerSelector (spec 065-touch-editor-parity T011; FR-004,
// FR-005). See LayerSelector.tsx's own module doc for the full contract this
// exercises: the layer list is never derived from a key's `nextlayer`
// (trivially true here, since this component never sees a key at all — only
// the declared `layerIds` array), grouping comes from the engine's real
// `groupLayerFamilies`/`classifyPlane` rather than a re-derived string match,
// counts come from the caller's already-computed map, and the >=2 / exactly-1
// / zero split renders a tablist, a label, or nothing at all respectively.

import { describe, it, expect, vi, afterEach } from "vitest";
import { cleanup, fireEvent, screen } from "@testing-library/react";
import { render } from "../../../test/renderWithI18n.tsx";
import { LayerSelector } from "./LayerSelector.tsx";

afterEach(() => {
  cleanup();
});

describe("LayerSelector — FR-004: every declared layer appears", () => {
  it("renders an option for every id in `layerIds`, including one no key would ever reach", () => {
    // This component takes no key/nextlayer data at all — "orphan" here
    // stands in for a layer no key's `nextlayer` points at. It must still
    // appear, because the list comes from the declaration, not from a scan.
    render(
      <LayerSelector
        layerIds={["default", "shift", "orphan"]}
        activeLayerId="default"
        onSelectLayer={vi.fn()}
        findingCountsByLayerId={new Map()}
      />,
    );

    expect(screen.getByTestId("key-layer-selector-option-default")).toBeTruthy();
    expect(screen.getByTestId("key-layer-selector-option-shift")).toBeTruthy();
    expect(screen.getByTestId("key-layer-selector-option-orphan")).toBeTruthy();
  });
});

describe("LayerSelector — FR-005: grouping by family and plane", () => {
  it("groups the base alphabetic family under 'base', a named plane's family under its own plane name, and unparseable ids under 'freeform'", () => {
    // default/shift decompose to the base (undefined-plane) family;
    // symbol/symbol-caps decompose to the "symbol" plane family; "vowels"
    // has no recognized modifier-fragment run and isn't a plane-only
    // sentinel, so it falls to freeform (mirrors the engine module's own
    // fv_southern_carrier worked example).
    render(
      <LayerSelector
        layerIds={["default", "shift", "symbol", "symbol-caps", "vowels"]}
        activeLayerId="default"
        onSelectLayer={vi.fn()}
        findingCountsByLayerId={new Map()}
      />,
    );

    const baseGroup = screen.getByTestId("key-layer-selector-group-base");
    const symbolGroup = screen.getByTestId("key-layer-selector-group-symbol");
    const freeformGroup = screen.getByTestId("key-layer-selector-group-freeform");

    expect(baseGroup.querySelector('[data-testid="key-layer-selector-option-default"]')).toBeTruthy();
    expect(baseGroup.querySelector('[data-testid="key-layer-selector-option-shift"]')).toBeTruthy();

    expect(symbolGroup.querySelector('[data-testid="key-layer-selector-option-symbol"]')).toBeTruthy();
    expect(symbolGroup.querySelector('[data-testid="key-layer-selector-option-symbol-caps"]')).toBeTruthy();

    expect(freeformGroup.querySelector('[data-testid="key-layer-selector-option-vowels"]')).toBeTruthy();

    // Never cross-contaminated: the freeform id doesn't also show up in a
    // family group, and vice versa.
    expect(baseGroup.querySelector('[data-testid="key-layer-selector-option-vowels"]')).toBeNull();
    expect(symbolGroup.querySelector('[data-testid="key-layer-selector-option-vowels"]')).toBeNull();
  });
});

describe("LayerSelector — FR-005: rolled-up finding counts", () => {
  it("renders a real-text count badge for a layer with findings, naming the count in the option's accessible name", () => {
    render(
      <LayerSelector
        layerIds={["default", "shift"]}
        activeLayerId="default"
        onSelectLayer={vi.fn()}
        findingCountsByLayerId={new Map([["shift", 3]])}
      />,
    );

    const countBadge = screen.getByTestId("key-layer-selector-count-shift");
    expect(countBadge.textContent).toBe("3");

    const shiftTab = screen.getByTestId("key-layer-selector-option-shift");
    const accessibleName = shiftTab.getAttribute("aria-label") ?? "";
    expect(accessibleName).toContain("3");
    expect(accessibleName.toLowerCase()).toContain("finding");
  });

  it("renders no badge at all for a layer with zero (or no) findings — a 0 badge on every option would be noise", () => {
    render(
      <LayerSelector
        layerIds={["default", "shift"]}
        activeLayerId="default"
        onSelectLayer={vi.fn()}
        findingCountsByLayerId={new Map([["shift", 0]])}
      />,
    );

    expect(screen.queryByTestId("key-layer-selector-count-default")).toBeNull();
    expect(screen.queryByTestId("key-layer-selector-count-shift")).toBeNull();
  });
});

describe("LayerSelector — two or more layers: role=\"tablist\" with roving tabindex", () => {
  it("renders one tab per layer, the active one aria-selected and the sole Tab stop", () => {
    render(
      <LayerSelector
        layerIds={["default", "shift", "symbol"]}
        activeLayerId="shift"
        onSelectLayer={vi.fn()}
        findingCountsByLayerId={new Map()}
      />,
    );

    expect(screen.getByRole("tablist")).toBeTruthy();
    expect(screen.getAllByRole("tab")).toHaveLength(3);

    const shiftTab = screen.getByTestId("key-layer-selector-option-shift");
    const defaultTab = screen.getByTestId("key-layer-selector-option-default");
    expect(shiftTab.getAttribute("aria-selected")).toBe("true");
    expect(shiftTab.getAttribute("tabindex")).toBe("0");
    expect(defaultTab.getAttribute("aria-selected")).toBe("false");
    expect(defaultTab.getAttribute("tabindex")).toBe("-1");
  });

  it("calls onSelectLayer with the clicked layer's id", () => {
    const onSelectLayer = vi.fn();
    render(
      <LayerSelector
        layerIds={["default", "shift"]}
        activeLayerId="default"
        onSelectLayer={onSelectLayer}
        findingCountsByLayerId={new Map()}
      />,
    );

    fireEvent.click(screen.getByTestId("key-layer-selector-option-shift"));

    expect(onSelectLayer).toHaveBeenCalledTimes(1);
    expect(onSelectLayer).toHaveBeenCalledWith("shift");
  });

  it("moves selection to the next tab on ArrowRight, wrapping from the last tab back to the first", () => {
    const onSelectLayer = vi.fn();
    render(
      <LayerSelector
        layerIds={["default", "shift", "symbol"]}
        activeLayerId="symbol"
        onSelectLayer={onSelectLayer}
        findingCountsByLayerId={new Map()}
      />,
    );

    fireEvent.keyDown(screen.getByRole("tablist"), { key: "ArrowRight" });

    expect(onSelectLayer).toHaveBeenCalledWith("default");
  });

  it("moves selection to the previous tab on ArrowLeft, wrapping from the first tab back to the last", () => {
    const onSelectLayer = vi.fn();
    render(
      <LayerSelector
        layerIds={["default", "shift", "symbol"]}
        activeLayerId="default"
        onSelectLayer={onSelectLayer}
        findingCountsByLayerId={new Map()}
      />,
    );

    fireEvent.keyDown(screen.getByRole("tablist"), { key: "ArrowLeft" });

    expect(onSelectLayer).toHaveBeenCalledWith("symbol");
  });

  it("Home selects the first tab and End selects the last tab in layout order", () => {
    const onSelectLayer = vi.fn();
    render(
      <LayerSelector
        layerIds={["default", "shift", "symbol"]}
        activeLayerId="shift"
        onSelectLayer={onSelectLayer}
        findingCountsByLayerId={new Map()}
      />,
    );

    fireEvent.keyDown(screen.getByRole("tablist"), { key: "Home" });
    expect(onSelectLayer).toHaveBeenLastCalledWith("default");

    fireEvent.keyDown(screen.getByRole("tablist"), { key: "End" });
    expect(onSelectLayer).toHaveBeenLastCalledWith("symbol");
  });
});

describe("LayerSelector — exactly one layer: a label, never a control", () => {
  it("renders no tablist and no tab/button, only a plain label naming the sole layer", () => {
    render(
      <LayerSelector
        layerIds={["default"]}
        activeLayerId="default"
        onSelectLayer={vi.fn()}
        findingCountsByLayerId={new Map()}
      />,
    );

    expect(screen.queryByRole("tablist")).toBeNull();
    expect(screen.queryByRole("tab")).toBeNull();
    expect(screen.queryByRole("button")).toBeNull();

    const option = screen.getByTestId("key-layer-selector-option-default");
    expect(option.textContent).toContain("default");
  });

  it("still shows the layer's finding count when the sole layer has findings", () => {
    render(
      <LayerSelector
        layerIds={["default"]}
        activeLayerId="default"
        onSelectLayer={vi.fn()}
        findingCountsByLayerId={new Map([["default", 2]])}
      />,
    );

    expect(screen.getByTestId("key-layer-selector-count-default").textContent).toBe("2");
  });
});

describe("LayerSelector — zero layers: render nothing", () => {
  it("renders no wrapper element at all when `layerIds` is empty", () => {
    render(
      <LayerSelector
        layerIds={[]}
        activeLayerId="default"
        onSelectLayer={vi.fn()}
        findingCountsByLayerId={new Map()}
      />,
    );

    expect(screen.queryByTestId("key-layer-selector")).toBeNull();
  });
});

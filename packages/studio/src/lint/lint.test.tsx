// Vitest unit tests for LintChip and LintSummary. Requires jsdom environment (see vitest.config.ts).

import { describe, it, expect, afterEach, vi } from "vitest";
import { render, screen, fireEvent, cleanup } from "@testing-library/react";
import {
  layerAFindings,
  layerBFindings,
  layerCFindings,
  fatalFindings,
} from "@keyboard-studio/contracts/fixtures";
import type { LintFinding } from "@keyboard-studio/contracts";
import { LintChip } from "./LintChip";
import { LintSummary } from "./LintSummary";

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Collect every `navigateToLocation` event fired on document during `fn()`. */
async function captureNavigateEvents(
  fn: () => void,
): Promise<CustomEvent[]> {
  const captured: CustomEvent[] = [];
  const listener = (e: Event) => captured.push(e as CustomEvent);
  document.addEventListener("navigateToLocation", listener);
  fn();
  document.removeEventListener("navigateToLocation", listener);
  return captured;
}

// ---------------------------------------------------------------------------
// LintChip — severity rendering
// ---------------------------------------------------------------------------

describe("LintChip — severity rendering", () => {
  // All five severities are represented across the real fixture sets.
  const allFixtureFindings: LintFinding[] = [
    ...fatalFindings,           // fatal
    ...layerAFindings,          // error, warning
    ...layerBFindings,          // hint
    ...layerCFindings,          // error, warning, info
  ];

  // Deduplicate by severity so we get exactly one representative per level.
  const severityMap = new Map<string, LintFinding>();
  for (const f of allFixtureFindings) {
    if (!severityMap.has(f.severity)) severityMap.set(f.severity, f);
  }
  const oneFindingPerSeverity = Array.from(severityMap.values());

  it.each(oneFindingPerSeverity)(
    "renders code and truncated (≤60 chars) message for severity=$severity",
    (finding: LintFinding) => {
      render(<LintChip finding={finding} />);

      // Code badge is present.
      expect(screen.getByText(finding.code)).toBeTruthy();

      // Message is present, possibly truncated.
      const expectedMessage =
        finding.message.length > 60
          ? finding.message.slice(0, 60) + "…"
          : finding.message;
      expect(screen.getByText(expectedMessage)).toBeTruthy();

      cleanup();
    },
  );
});

// ---------------------------------------------------------------------------
// LintChip — opacity / origin
// ---------------------------------------------------------------------------

describe("LintChip — opacity", () => {
  it("renders at full opacity when origin is absent", () => {
    // layerBFindings[0] has no origin field.
    const finding = layerBFindings[0]!;
    expect(finding.origin).toBeUndefined();

    const { container } = render(<LintChip finding={finding} />);
    const wrapper = container.firstElementChild as HTMLElement;
    expect(wrapper.style.opacity).toBe("");
  });

  it("renders at full opacity when origin is 'authored'", () => {
    const finding: LintFinding = {
      ...layerAFindings[0]!,
      origin: "authored",
    };
    const { container } = render(<LintChip finding={finding} />);
    const wrapper = container.firstElementChild as HTMLElement;
    // opacity 1 or empty string both mean fully visible.
    expect(["", "1"]).toContain(wrapper.style.opacity);
  });

  it("renders at 50% opacity when origin is 'upstream'", () => {
    const finding: LintFinding = {
      ...layerAFindings[0]!,
      origin: "upstream",
    };
    const { container } = render(<LintChip finding={finding} />);
    const wrapper = container.firstElementChild as HTMLElement;
    expect(wrapper.style.opacity).toBe("0.5");
  });
});

// ---------------------------------------------------------------------------
// LintChip — hint button
// ---------------------------------------------------------------------------

describe("LintChip — hint toggle", () => {
  it("does NOT render 'Show hint' button when hint is absent", () => {
    // KM_FATAL_MISSING_WASM_MODULE has a hint; pick one without location
    // but we need one without hint. Build a minimal finding from a fixture.
    const finding: LintFinding = {
      code: "KM_WARN_DEPRECATED_STORE_ID",
      severity: "warning",
      layer: "A",
      message: "Store 'KMW_RTL' is deprecated.",
      // no hint
    };
    render(<LintChip finding={finding} />);
    expect(screen.queryByRole("button", { name: /show hint/i })).toBeNull();
  });

  it("renders 'Show hint' button when hint is present", () => {
    // layerAFindings[0] has a hint.
    const finding = layerAFindings[0]!;
    expect(finding.hint).toBeDefined();

    render(<LintChip finding={finding} />);
    expect(screen.getByRole("button", { name: /show hint/i })).toBeTruthy();
  });

  it("toggles hint popover on button click", () => {
    const finding = layerAFindings[0]!;
    render(<LintChip finding={finding} />);

    const button = screen.getByRole("button", { name: /show hint/i });

    // Popover not yet visible — hint text not in DOM.
    expect(screen.queryByText(finding.hint!)).toBeNull();

    // First click — opens.
    fireEvent.click(button);
    expect(screen.getByText(finding.hint!)).toBeTruthy();
    expect(screen.getByRole("button", { name: /hide hint/i })).toBeTruthy();

    // Second click — closes.
    fireEvent.click(screen.getByRole("button", { name: /hide hint/i }));
    expect(screen.queryByText(finding.hint!)).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// LintChip — navigation dispatch
// ---------------------------------------------------------------------------

describe("LintChip — navigateToLocation dispatch", () => {
  it("dispatches navigateToLocation when location is defined and chip is clicked", async () => {
    // layerAFindings[0] has a location.
    const finding = layerAFindings[0]!;
    expect(finding.location).toBeDefined();

    render(<LintChip finding={finding} />);
    const chipBody = screen.getByRole("button", {
      name: new RegExp(`Go to ${finding.code}`),
    });

    const events = await captureNavigateEvents(() => fireEvent.click(chipBody));
    expect(events).toHaveLength(1);
    expect((events[0]! as CustomEvent).detail.location).toEqual(finding.location);
  });

  it("does NOT dispatch navigateToLocation when location is undefined", async () => {
    // fatalFindings[0] has no location.
    const finding = fatalFindings[0]!;
    expect(finding.location).toBeUndefined();

    const { container } = render(<LintChip finding={finding} />);

    // No button role — chip is not navigable; click the outer wrapper.
    const wrapper = container.firstElementChild as HTMLElement;
    const events = await captureNavigateEvents(() => fireEvent.click(wrapper));
    expect(events).toHaveLength(0);
  });
});

// ---------------------------------------------------------------------------
// LintSummary — zero state
// ---------------------------------------------------------------------------

describe("LintSummary — empty findings", () => {
  it("renders 'No issues found' when findings array is empty", () => {
    render(<LintSummary findings={[]} />);
    expect(screen.getByRole("status").textContent).toContain("No issues found");
  });

  it("does NOT render the findings list when empty", () => {
    render(<LintSummary findings={[]} />);
    expect(screen.queryByRole("list")).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// LintSummary — badge row
// ---------------------------------------------------------------------------

describe("LintSummary — severity badge row", () => {
  // Build a 3-finding set: 2 errors (layerA[0] + layerC[0]) + 1 warning (layerA[1]).
  const mixedFindings: LintFinding[] = [
    layerAFindings[0]!, // error
    layerAFindings[1]!, // warning
    layerCFindings[0]!, // error
  ];

  it("renders '2 errors' and '1 warning' badges for 2-error + 1-warning set", () => {
    render(<LintSummary findings={mixedFindings} />);
    expect(screen.getByText(/2 errors/)).toBeTruthy();
    expect(screen.getByText(/1 warning/)).toBeTruthy();
  });

  it("does NOT render badges for absent severities", () => {
    render(<LintSummary findings={mixedFindings} />);
    expect(screen.queryByText(/\d fatals?/)).toBeNull();
    expect(screen.queryByText(/\d hints?/)).toBeNull();
    expect(screen.queryByText(/\d infos?/)).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// LintSummary — badge order (fatal > error > warning > hint > info)
// ---------------------------------------------------------------------------

describe("LintSummary — badge order", () => {
  const orderedFindings: LintFinding[] = [
    ...fatalFindings,                     // fatal
    layerAFindings[0]!,                   // error
    layerAFindings[1]!,                   // warning
    layerBFindings[0]!,                   // hint
    layerCFindings[2]!,                   // info
  ];

  it("renders badges in fatal > error > warning > hint > info order", () => {
    render(<LintSummary findings={orderedFindings} />);
    // Grab all badge text nodes from the header area.
    const allText = document.body.textContent ?? "";
    const fatalIdx   = allText.indexOf("fatal");
    const errorIdx   = allText.indexOf("error");
    const warningIdx = allText.indexOf("warning");
    const hintIdx    = allText.indexOf("hint");
    const infoIdx    = allText.indexOf("info");

    expect(fatalIdx).toBeGreaterThanOrEqual(0);
    expect(fatalIdx).toBeLessThan(errorIdx);
    expect(errorIdx).toBeLessThan(warningIdx);
    expect(warningIdx).toBeLessThan(hintIdx);
    expect(hintIdx).toBeLessThan(infoIdx);
  });
});

// ---------------------------------------------------------------------------
// LintSummary — one LintChip per finding
// ---------------------------------------------------------------------------

describe("LintSummary — chip count", () => {
  it("renders one LintChip (list item) per finding", () => {
    const findings = [...layerAFindings, ...layerBFindings, ...layerCFindings];
    render(<LintSummary findings={findings} />);

    const list = screen.getByRole("list");
    const items = list.querySelectorAll("li");
    expect(items).toHaveLength(findings.length);
  });

  it("renders each finding's code inside the list", () => {
    const findings = [...layerAFindings, ...layerBFindings];
    render(<LintSummary findings={findings} />);

    for (const f of findings) {
      expect(screen.getByText(f.code)).toBeTruthy();
    }
  });
});

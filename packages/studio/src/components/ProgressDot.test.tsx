// ProgressDot — layout="row" (the narrow journey contents) vs the bare dot.
import { describe, it, expect, afterEach, vi } from "vitest";
import { screen, cleanup, fireEvent } from "@testing-library/react";
import { render } from "../test/renderWithI18n.tsx";
import { ProgressDot } from "./ProgressDot.tsx";
import type { ProgressDot as ProgressDotData } from "../decisions/progressDots.ts";

afterEach(cleanup);

function makeDot(over: Partial<ProgressDotData> = {}): ProgressDotData {
  const base: ProgressDotData = {
    kind: "completed",
    tier: "section",
    fill: "full",
    id: "identity",
    location: { route: "survey", step: "identity" },
    label: "Identity",
    resolution: {
      kind: "reachable",
      location: { route: "survey", step: "identity" },
    },
  };
  return { ...base, ...over };
}

describe("ProgressDot layout", () => {
  it("dot layout has an accessible name but no visible label text", () => {
    render(<ProgressDot dot={makeDot()} onActivate={() => {}} />);
    const button = screen.getByRole("button", { name: "Identity — completed" });
    expect(button.textContent).toBe("");
    expect(button.getAttribute("title")).toBe("Identity — completed");
  });

  it("row layout shows the label text with the same accessible name as the dot layout", () => {
    const dot = makeDot();
    const { unmount } = render(<ProgressDot dot={dot} onActivate={() => {}} />);
    const dotName = screen.getByRole("button").getAttribute("aria-label");
    unmount();

    render(<ProgressDot dot={dot} layout="row" onActivate={() => {}} />);
    const row = screen.getByRole("button");
    expect(row.getAttribute("aria-label")).toBe(dotName);
    expect(row.textContent).toBe("Identity");
    expect(screen.getByText("Identity")).toBeTruthy();
  });

  it("row layout: the current mark has aria-current=step and never activates", () => {
    const onActivate = vi.fn();
    render(
      <ProgressDot
        dot={makeDot({ kind: "current", fill: "none" })}
        layout="row"
        onActivate={onActivate}
      />,
    );
    const row = screen.getByRole("button", { name: "Identity — you are here" });
    expect(row.getAttribute("aria-current")).toBe("step");
    fireEvent.click(row);
    expect(onActivate).not.toHaveBeenCalled();
  });

  it("row layout: a non-current mark activates with its dot data", () => {
    const onActivate = vi.fn();
    const dot = makeDot();
    render(<ProgressDot dot={dot} layout="row" onActivate={onActivate} />);
    fireEvent.click(screen.getByRole("button"));
    expect(onActivate).toHaveBeenCalledWith(dot);
    expect(screen.getByRole("button").getAttribute("aria-current")).toBeNull();
  });

  it("row layout keeps the badge suffix in the accessible name", () => {
    render(
      <ProgressDot
        dot={makeDot({ badge: ["unassigned"] })}
        layout="row"
        onActivate={() => {}}
      />,
    );
    expect(screen.getByRole("button").getAttribute("aria-label")).toMatch(
      /Identity — completed — work waiting: assign a key/,
    );
  });

  it("row layout: passedReason wins over the fill state in the name", () => {
    render(
      <ProgressDot
        dot={makeDot({ passedReason: "passed — nothing to do" })}
        layout="row"
        onActivate={() => {}}
      />,
    );
    expect(screen.getByRole("button").getAttribute("aria-label")).toBe(
      "Identity — passed — nothing to do",
    );
  });
});

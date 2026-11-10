// OutputGateBanners — the gate-explaining banners shared by the Trial and
// Publish steps (spec 113), ported from the retired OutputScreen's
// blockers/coverageBanner tests.
//
// The banners explain WHY a download / test build / submit is unavailable,
// rather than leaving a silently-disabled button. The "Open" / "Go finish
// them now" controls jump with `jumpToLocation` and a `returnTo` naming the
// CALLER's step (Trial or Publish), so StepHost's revise-and-return banner
// brings the author straight back.

import { describe, it, expect, vi, afterEach } from "vitest";
import { cleanup, fireEvent, screen } from "@testing-library/react";
import { render } from "../test/renderWithI18n.tsx";
import type { InventoryCoverageGate } from "../lib/unimplementedInventory.ts";
import { OutputGateBanners } from "./OutputGateBanners.tsx";

const jumpToLocation = vi.fn(
  (..._args: unknown[]): unknown => ({ kind: "arrived", at: { route: "survey", step: "touch" } }),
);
vi.mock("../lib/jumpToLocation.ts", async (importOriginal) => ({
  ...(await importOriginal<typeof import("../lib/jumpToLocation.ts")>()),
  jumpToLocation: (...args: unknown[]) => jumpToLocation(...args),
}));

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

const OPEN_GATE: InventoryCoverageGate = {
  unimplementedDesktop: [],
  unimplementedTouch: [],
  blockedOnDesktop: false,
  blockedOnTouch: false,
  touchLayoutCorrupted: false,
  blocked: false,
};

function renderBanners(overrides: Partial<React.ComponentProps<typeof OutputGateBanners>> = {}) {
  const resolveStartHolder = vi.fn();
  render(
    <OutputGateBanners
      returnToStep="trial"
      touchStale={false}
      coverageGate={OPEN_GATE}
      licenseUnparseable={null}
      attributionMissing={false}
      resolveStartHolder={resolveStartHolder}
      {...overrides}
    />,
  );
  return { resolveStartHolder };
}

describe("OutputGateBanners — coverage-blocked banner", () => {
  it("renders the real uncovered characters (not empty) and a non-empty gallery label when desktop characters are unimplemented", () => {
    const inventory = ["á", "é", "í", "ó", "ú"];
    renderBanners({
      coverageGate: {
        ...OPEN_GATE,
        unimplementedDesktop: inventory,
        blockedOnDesktop: true,
        blocked: true,
      },
    });
    const bodyText = document.body.textContent ?? "";
    for (const char of inventory) {
      expect(bodyText).toContain(char);
    }
    expect(bodyText).not.toMatch(/\{\d+\}/);
    expect(bodyText).toMatch(/Go back to the .*Gallery.* to finish them/);
    expect(bodyText).toContain("Mechanism Gallery");
  });

  it("truncates a long uncovered-character list with a '+N more' suffix instead of listing all of them", () => {
    const inventory = Array.from({ length: 34 }, (_, i) => String.fromCharCode(0x0410 + i));
    renderBanners({
      coverageGate: {
        ...OPEN_GATE,
        unimplementedDesktop: inventory,
        blockedOnDesktop: true,
        blocked: true,
      },
    });
    const bodyText = document.body.textContent ?? "";
    expect(bodyText).toContain("34 characters");
    expect(bodyText).toMatch(/\+22 more/);
  });

  it("renders the distinct 'touch layout corrupted' message (not the generic count) and routes back to the Touch Gallery", () => {
    renderBanners({
      coverageGate: {
        ...OPEN_GATE,
        unimplementedDesktop: [],
        unimplementedTouch: ["á", "é"],
        blockedOnDesktop: false,
        blockedOnTouch: true,
        touchLayoutCorrupted: true,
        blocked: true,
      },
    });
    const bodyText = document.body.textContent ?? "";
    expect(bodyText).toMatch(/couldn't be read/);
    expect(bodyText).toContain("Touch Gallery");
    fireEvent.click(screen.getByTestId("output-coverage-goto-gallery"));
    expect(jumpToLocation).toHaveBeenCalledWith(
      { route: "survey", step: "touch" },
      { returnTo: { route: "survey", step: "trial" } },
    );
  });

  it("'Go finish them now' jumps to the mechanisms gallery when desktop is blocked", () => {
    renderBanners({
      coverageGate: {
        ...OPEN_GATE,
        unimplementedDesktop: ["á"],
        blockedOnDesktop: true,
        blocked: true,
      },
    });
    fireEvent.click(screen.getByTestId("output-coverage-goto-gallery"));
    expect(jumpToLocation).toHaveBeenCalledWith(
      { route: "survey", step: "mechanisms" },
      { returnTo: { route: "survey", step: "trial" } },
    );
  });
});

describe("OutputGateBanners — touch-stale / licence / attribution banners", () => {
  it("shows the touch-stale banner and its 'Open Touch layout' returns to the caller's step", () => {
    renderBanners({ touchStale: true, touchBlockerStep: "touch", returnToStep: "publish" });
    expect(document.body.textContent).toMatch(/out of date/);
    fireEvent.click(screen.getByTestId("output-open-touch"));
    expect(jumpToLocation).toHaveBeenCalledWith(
      { route: "survey", step: "touch" },
      { returnTo: { route: "survey", step: "publish" } },
    );
  });

  it("shows the licence banner with the unreadable line, and Confirm passes the typed holder through", () => {
    const { resolveStartHolder } = renderBanners({
      licenseUnparseable: { reason: "unparseable", line: "Copyright (c) Some Author" },
    });
    expect(screen.getByTestId("license-unreadable")).toBeTruthy();
    expect(document.body.textContent).toContain("Copyright (c) Some Author");
    const input = screen.getByLabelText("Original copyright holder") as HTMLInputElement;
    fireEvent.change(input, { target: { value: "Some Author" } });
    fireEvent.click(screen.getByTestId("resolve-base-holder"));
    expect(resolveStartHolder).toHaveBeenCalledWith("Some Author");
  });

  it("shows the attribution banner and its 'Open language step' returns to the caller's step", () => {
    renderBanners({ attributionMissing: true, attributionBlockerStep: "attribution" });
    expect(screen.getByTestId("attribution-required")).toBeTruthy();
    fireEvent.click(screen.getByTestId("output-open-identity"));
    expect(jumpToLocation).toHaveBeenCalledWith(
      { route: "survey", step: "attribution" },
      { returnTo: { route: "survey", step: "trial" } },
    );
  });

  it("renders no banner when nothing blocks", () => {
    renderBanners();
    expect(screen.queryByRole("alert")).toBeNull();
    expect(screen.queryByTestId("attribution-required")).toBeNull();
  });

  it("a refused jump says why in the one polite status line", () => {
    jumpToLocation.mockReturnValueOnce({
      kind: "refused",
      reason: "beyond-gate",
    });
    renderBanners({ touchStale: true, touchBlockerStep: "touch" });
    fireEvent.click(screen.getByTestId("output-open-touch"));
    expect(screen.getByTestId("output-jump-status").textContent).toMatch(/Not yet reached/);
  });
});

// Structural accessibility assertions for the two crash surfaces
// (spec 060, FR-072, FR-073, FR-125, SC-008).
//
// THIS IS THE JSDOM HALF OF A TWO-LANE SPLIT (research D3).
//
// What lives here: the structural properties jsdom can see — which ARIA role is
// present, where focus lands, whether a control is a real button. What does NOT
// live here: the automated axe scan. `expectNoSeriousAxeViolations` does not
// exist in the vitest lane, and `@axe-core/playwright` is the repository's only
// axe dependency, so the scan is a Playwright spec
// (e2e/crash-recovery-a11y.spec.ts).
//
// The split matters because the two surfaces differ on the one property most
// easily got wrong, and a reviewer needs to see both assertions side by side:
// the recovery screen MOVES focus and the notice MUST NOT. Testing only one
// would let a well-meaning "make them consistent" change through.

import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { screen, cleanup, act } from "@testing-library/react";
import { render } from "../test/renderWithI18n.tsx";
import { CrashRecoveryScreen } from "./CrashRecoveryScreen.tsx";
import { CrashNotice } from "./CrashNotice.tsx";
import { resetCrashSendState, _setCrashSendStateForTest } from "../crash/send.ts";

const ISSUE_URL = "https://github.com/keyboard-studio/crash-reports/issues/42";

beforeEach(() => {
  resetCrashSendState();
});

afterEach(() => {
  cleanup();
  resetCrashSendState();
  vi.useRealTimers();
});

// ---------------------------------------------------------------------------
// Recovery screen — whole-page state change (FR-072)
// ---------------------------------------------------------------------------

describe("CrashRecoveryScreen — accessibility", () => {
  it("exposes role=alert", () => {
    render(<CrashRecoveryScreen />);
    expect(screen.getByRole("alert")).toBeTruthy();
  });

  it("moves focus to its heading on mount", () => {
    // The tree the author was using is gone and their focus is on a detached
    // node. Without this move, a screen-reader user has no way to discover the
    // page was replaced (docs/accessibility.md rule 4).
    render(<CrashRecoveryScreen />);
    const heading = screen.getByRole("heading", { level: 1 });
    expect(document.activeElement).toBe(heading);
  });

  it("makes the heading programmatically focusable without adding it to the tab order", () => {
    render(<CrashRecoveryScreen />);
    expect(screen.getByRole("heading", { level: 1 }).getAttribute("tabindex")).toBe(
      "-1",
    );
  });

  it("renders the issue link as a real anchor with an href (FR-125)", () => {
    render(<CrashRecoveryScreen issueUrl={ISSUE_URL} />);
    const link = screen.getByRole("link");
    expect(link.tagName).toBe("A");
    expect(link.getAttribute("href")).toBe(ISSUE_URL);
  });

  it("omits the link entirely when no issue was filed", () => {
    render(<CrashRecoveryScreen />);
    expect(screen.queryByRole("link")).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// Notice — the page is still usable (FR-073)
// ---------------------------------------------------------------------------

describe("CrashNotice — accessibility", () => {
  function renderSentNotice(onRetract?: () => void) {
    _setCrashSendStateForTest({
      status: "sent",
      issueUrl: ISSUE_URL,
      issueNumber: 42,
      action: "created",
      // Undo renders only when a retraction token is held (FR-074a).
      retractionToken: "stub-token",
    });
    return render(
      <CrashNotice {...(onRetract !== undefined ? { onRetract } : {})} />,
    );
  }

  it("announces politely rather than assertively", () => {
    renderSentNotice();
    const live = document.querySelector("[aria-live]");
    expect(live?.getAttribute("aria-live")).toBe("polite");
  });

  it("is NOT an alert — that role is the recovery screen's", () => {
    renderSentNotice();
    expect(screen.queryByRole("alert")).toBeNull();
  });

  it("never moves focus", () => {
    // The author is mid-task on a page that still works. Stealing focus to
    // announce telemetry would be disruptive, not helpful.
    const sentinel = document.createElement("button");
    document.body.appendChild(sentinel);
    sentinel.focus();
    expect(document.activeElement).toBe(sentinel);

    renderSentNotice();

    expect(document.activeElement).toBe(sentinel);
    sentinel.remove();
  });

  it("renders Undo as a real button, not a click-handling div", () => {
    renderSentNotice(() => undefined);
    const button = screen.getByRole("button");
    expect(button.tagName).toBe("BUTTON");
    expect(button.getAttribute("type")).toBe("button");
  });

  it("renders nothing at all when no report was sent (FR-078)", () => {
    const { container } = render(<CrashNotice />);
    expect(container.textContent).toBe("");
  });

  it("renders nothing when the send failed — the author is told nothing", () => {
    _setCrashSendStateForTest({ status: "failed" });
    const { container } = render(<CrashNotice />);
    expect(container.textContent).toBe("");
  });
});

// ---------------------------------------------------------------------------
// The two surfaces, contrasted (the property most easily got wrong)
// ---------------------------------------------------------------------------

describe("recovery screen vs notice", () => {
  it("differ on role and on focus, deliberately", () => {
    render(<CrashRecoveryScreen />);
    const heading = screen.getByRole("heading", { level: 1 });
    expect(screen.getByRole("alert")).toBeTruthy();
    expect(document.activeElement).toBe(heading);
    cleanup();

    const sentinel = document.createElement("button");
    document.body.appendChild(sentinel);
    sentinel.focus();

    act(() => {
      _setCrashSendStateForTest({
        status: "sent",
        issueUrl: ISSUE_URL,
        issueNumber: 42,
        action: "created",
      });
    });
    render(<CrashNotice />);

    expect(screen.queryByRole("alert")).toBeNull();
    expect(document.activeElement).toBe(sentinel);
    sentinel.remove();
  });
});

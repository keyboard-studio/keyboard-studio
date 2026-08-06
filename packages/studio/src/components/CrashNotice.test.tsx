// Undo affordance and its window (spec 060 US6 — FR-074 – FR-077, SC-013).
//
// The window assertion uses fake timers and checks BOTH edges. Checking only
// "Undo appears" would pass against an affordance that never expires, which is
// the actual risk: an Undo still on screen after the window has closed is a
// button that silently does nothing, and the author has no way to tell that
// from one that worked.
//
// The server-side halves of the retraction contract — a "created" report closes
// the issue with a retraction comment, a "commented" report deletes only this
// session's comment, and neither ever deletes the ISSUE — are asserted against
// the pipeline in utilities/oauth-backend/src/crash-report-dedupe.test.ts.

import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { screen, cleanup, act } from "@testing-library/react";
import { render } from "../test/renderWithI18n.tsx";
import { CrashNotice, CRASH_REPORT_UNDO_WINDOW_MS } from "./CrashNotice.tsx";
import {
  resetCrashSendState,
  _setCrashSendStateForTest,
} from "../crash/send.ts";

const ISSUE_URL = "https://github.com/keyboard-studio/crash-reports/issues/42";

function sent(overrides: Record<string, unknown> = {}) {
  _setCrashSendStateForTest({
    status: "sent",
    issueUrl: ISSUE_URL,
    issueNumber: 42,
    action: "created",
    // The Undo affordance is gated on holding a server-issued retraction token
    // (FR-074a), not on knowing an issue number. Tests that want the button must
    // supply one; the `offers no Undo without a token` case below omits it.
    retractionToken: "stub-token",
    ...overrides,
  });
}

beforeEach(() => {
  resetCrashSendState();
});

afterEach(() => {
  cleanup();
  resetCrashSendState();
  vi.useRealTimers();
});

// ---------------------------------------------------------------------------
// SC-013 — the window, at both edges
// ---------------------------------------------------------------------------

describe("Undo window (FR-074, SC-013)", () => {
  it("is present immediately after the report is sent", () => {
    sent();
    render(<CrashNotice onRetract={() => undefined} />);
    expect(screen.queryByRole("button")).not.toBeNull();
  });

  it("is still present one millisecond before the window closes", () => {
    vi.useFakeTimers();
    sent();
    render(<CrashNotice onRetract={() => undefined} />);

    act(() => {
      vi.advanceTimersByTime(CRASH_REPORT_UNDO_WINDOW_MS - 1);
    });
    expect(screen.queryByRole("button")).not.toBeNull();
  });

  it("is absent immediately after the window closes", () => {
    vi.useFakeTimers();
    sent();
    render(<CrashNotice onRetract={() => undefined} />);

    act(() => {
      vi.advanceTimersByTime(CRASH_REPORT_UNDO_WINDOW_MS);
    });
    // Once the window elapses the report stands — a button that is still on
    // screen but no longer works is worse than no button.
    expect(screen.queryByRole("button")).toBeNull();
  });

  it("keeps the notice and its issue link after the window closes", () => {
    vi.useFakeTimers();
    sent();
    render(<CrashNotice onRetract={() => undefined} />);

    act(() => {
      vi.advanceTimersByTime(CRASH_REPORT_UNDO_WINDOW_MS + 1_000);
    });
    expect(screen.getByRole("link").getAttribute("href")).toBe(ISSUE_URL);
  });

  it("offers no Undo when no retract handler is wired", () => {
    sent();
    render(<CrashNotice />);
    expect(screen.queryByRole("button")).toBeNull();
  });

  it("offers no Undo when the server issued no retraction token (FR-074a)", () => {
    // Nothing the client could send: the route accepts only a token. An Undo
    // button here would be one that silently does nothing, which is exactly the
    // failure the window's expiry exists to prevent.
    sent({ retractionToken: undefined });
    render(<CrashNotice onRetract={() => undefined} />);
    expect(screen.queryByRole("button")).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// Retraction
// ---------------------------------------------------------------------------

describe("retraction", () => {
  it("invokes the handler with no arguments — the target is the token's, not ours", () => {
    // The retract route derives the issue from the signed token (FR-074a), so
    // this surface passes nothing. A component that still passed an issue number
    // would imply it has a say in which report is retracted.
    const retract = vi.fn();
    sent();
    render(<CrashNotice onRetract={retract} />);

    act(() => {
      screen.getByRole("button").click();
    });
    expect(retract).toHaveBeenCalledTimes(1);
    expect(retract).toHaveBeenCalledWith();
  });

  it("confirms the retraction and removes the Undo affordance", () => {
    sent();
    render(<CrashNotice onRetract={() => undefined} />);

    act(() => {
      screen.getByRole("button").click();
    });
    expect(screen.queryByRole("button")).toBeNull();
    expect(screen.getByText(/retracted/i)).toBeTruthy();
  });

  it("confirms even when the retraction request fails", () => {
    // Best-effort, like the send. Telling the author their un-send failed
    // would be the third unactionable message in a row.
    sent();
    render(<CrashNotice onRetract={() => Promise.reject(new Error("offline"))} />);

    act(() => {
      screen.getByRole("button").click();
    });
    expect(screen.getByText(/retracted/i)).toBeTruthy();
  });

  it("does not imply deletion in its copy (FR-077)", () => {
    // A true delete is unavailable to an installation token, so copy promising
    // one would promise something the retraction path cannot deliver.
    sent();
    const { container } = render(<CrashNotice onRetract={() => undefined} />);
    expect(container.textContent?.toLowerCase()).not.toContain("delete");

    act(() => {
      screen.getByRole("button").click();
    });
    expect(container.textContent?.toLowerCase()).not.toContain("delete");
  });

  it("offers Undo for a commented report too", () => {
    sent({ action: "commented", commentId: 7 });
    render(<CrashNotice onRetract={() => undefined} />);
    expect(screen.queryByRole("button")).not.toBeNull();
  });
});

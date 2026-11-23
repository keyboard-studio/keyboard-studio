// The central leave guard (spec 111 FR-046): every route change asks about unapplied code-view text.

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { act, cleanup, fireEvent, screen, waitFor } from "@testing-library/react";
import { createVirtualFS } from "@keyboard-studio/contracts";
import type { StartKeyboard } from "@keyboard-studio/contracts";
import { parseKmn } from "@keyboard-studio/engine";
import { render } from "../test/renderWithI18n.tsx";
import { UnappliedTextDialog } from "../components/UnappliedTextDialog.tsx";
import { guardLeave, useUnappliedTextStore, type UnappliedTextHandle } from "../stores/unappliedTextStore.ts";
import { useWorkingCopyStore } from "../stores/workingCopyStore.ts";
import { navigateTo } from "./navigate.ts";
import { installHashGuard } from "./navigationGuard.ts";
import { renderHook } from "@testing-library/react";
import { useSurveyBrowserHistorySync } from "../hooks/useSurveyBrowserHistorySync.ts";
import { useSurveySessionStore } from "../stores/surveySessionStore.ts";
import { jumpToLocation } from "./jumpToLocation.ts";

const KMN = "store(&NAME) 'Kb'\nbegin Unicode > use(main)\ngroup(main) using keys\n+ [K_A] > 'a'\n";
const KB: StartKeyboard = { id: "kb", path: "release/k/kb", script: "Latn", targets: ["windows"], displayName: "Kb", version: "1.0" };

function handle(over: Partial<UnappliedTextHandle> = {}): UnappliedTextHandle {
  return { label: "the stylesheet", hasUnapplied: () => true, apply: () => Promise.resolve(true), discard: () => undefined, ...over };
}
const asked = (): boolean => screen.queryByTestId("unapplied-text-dialog") !== null;
const settleHash = (): Promise<void> => new Promise((r) => setTimeout(r, 20));

beforeEach(() => {
  const vfs = createVirtualFS();
  vfs.set("source/kb.kmn", KMN, false);
  vfs.set("source/kb.kps", "<Package/>", false);
  useWorkingCopyStore.getState().instantiateFromExisting(KB, { vfs, ir: parseKmn(KMN, "kb").ir });
  window.location.hash = "#output";
});
afterEach(() => {
  cleanup();
  useUnappliedTextStore.setState({ handles: new Map(), asking: null });
  useWorkingCopyStore.getState().reset();
});

describe("navigateTo", () => {
  it("asks first; Keep editing leaves the hash, Discard goes there", async () => {
    render(<UnappliedTextDialog />);
    await settleHash();
    useUnappliedTextStore.getState().register("a", handle());
    act(() => navigateTo("profile"));
    expect(asked()).toBe(true);
    expect(window.location.hash).toBe("#output");
    fireEvent.click(screen.getByTestId("unapplied-text-cancel"));
    await waitFor(() => expect(asked()).toBe(false));
    expect(window.location.hash).toBe("#output");
    act(() => navigateTo("profile"));
    fireEvent.click(screen.getByTestId("unapplied-text-discard"));
    await waitFor(() => expect(window.location.hash).toBe("#profile"));
  });

  it("goes at once when nothing is unapplied", () => {
    navigateTo("profile");
    expect(window.location.hash).toBe("#profile");
  });
});

describe("jumpToLocation", () => {
  it("is held behind the question and reports pending; the jump runs after Discard", async () => {
    render(<UnappliedTextDialog />);
    useUnappliedTextStore.getState().register("a", handle());
    let outcome: ReturnType<typeof jumpToLocation> | undefined;
    act(() => {
      outcome = jumpToLocation({ route: "survey" });
    });
    expect(outcome?.kind).toBe("pending");
    expect(asked()).toBe(true);
    expect(window.location.hash).toBe("#output");
    fireEvent.click(screen.getByTestId("unapplied-text-discard"));
    await waitFor(() => expect(window.location.hash).toBe("#survey"));
  });
});

describe("browser Back and links (hashchange)", () => {
  it("puts the previous hash back and asks; Discard then goes to the requested hash", async () => {
    const off = installHashGuard();
    render(<UnappliedTextDialog />);
    window.location.hash = "#profile";
    await settleHash();
    expect(window.location.hash).toBe("#profile");
    useUnappliedTextStore.getState().register("a", handle());
    window.location.hash = "#privacy";
    await waitFor(() => expect(asked()).toBe(true));
    expect(window.location.hash).toBe("#profile");
    fireEvent.click(screen.getByTestId("unapplied-text-discard"));
    await waitFor(() => expect(window.location.hash).toBe("#privacy"));
    off();
  });

  it("Keep editing stays on the previous hash", async () => {
    const off = installHashGuard();
    render(<UnappliedTextDialog />);
    await settleHash();
    useUnappliedTextStore.getState().register("a", handle());
    window.location.hash = "#privacy";
    await waitFor(() => expect(asked()).toBe(true));
    fireEvent.click(screen.getByTestId("unapplied-text-cancel"));
    await waitFor(() => expect(asked()).toBe(false));
    expect(window.location.hash).toBe("#output");
    off();
  });
});

describe("guardLeave", () => {
  it("ignores a second leave while an answered Apply is still being carried out", async () => {
    render(<UnappliedTextDialog />);
    let finish: (ok: boolean) => void = () => undefined;
    useUnappliedTextStore.getState().register("a", handle({ apply: () => new Promise<boolean>((r) => (finish = r)) }));
    const first = vi.fn();
    const second = vi.fn();
    act(() => void guardLeave(first));
    fireEvent.click(screen.getByTestId("unapplied-text-apply"));
    await waitFor(() => expect(asked()).toBe(false));
    expect(guardLeave(second)).toBe(false);
    expect(asked()).toBe(false);
    await act(async () => finish(true));
    await waitFor(() => expect(first).toHaveBeenCalledTimes(1));
    expect(second).not.toHaveBeenCalled();
  });

  it("returns focus to the control the author left from after Keep editing", async () => {
    render(<><button type="button" data-testid="origin">leave</button><UnappliedTextDialog /></>);
    useUnappliedTextStore.getState().register("a", handle());
    screen.getByTestId("origin").focus();
    act(() => void guardLeave(() => undefined));
    fireEvent.click(screen.getByTestId("unapplied-text-cancel"));
    await waitFor(() => expect(document.activeElement).toBe(screen.getByTestId("origin")));
  });

  it("returns focus after a refused apply", async () => {
    render(<><button type="button" data-testid="origin">leave</button><UnappliedTextDialog /></>);
    useUnappliedTextStore.getState().register("a", handle({ apply: () => Promise.resolve(false) }));
    screen.getByTestId("origin").focus();
    act(() => void guardLeave(() => undefined));
    fireEvent.click(screen.getByTestId("unapplied-text-apply"));
    await waitFor(() => expect(document.activeElement).toBe(screen.getByTestId("origin")));
  });

  it("falls back to the step navigation when the origin is gone", async () => {
    render(<><div id="step-navigation" tabIndex={-1} data-testid="nav" /><UnappliedTextDialog /></>);
    // The control the author left from is outside React here, so it can vanish while the question is open.
    const origin = document.createElement("button");
    document.body.appendChild(origin);
    useUnappliedTextStore.getState().register("a", handle());
    origin.focus();
    act(() => void guardLeave(() => undefined));
    origin.remove();
    fireEvent.click(screen.getByTestId("unapplied-text-cancel"));
    await waitFor(() => expect(document.activeElement).toBe(screen.getByTestId("nav")));
  });

  it("offers only Discard and Keep editing when apply would defeat the leave (Undo)", async () => {
    render(<UnappliedTextDialog />);
    useUnappliedTextStore.getState().register("a", handle());
    const leave = vi.fn();
    act(() => void guardLeave(leave, { allowApply: false }));
    expect(screen.queryByTestId("unapplied-text-apply")).toBeNull();
    expect(screen.getByTestId("unapplied-text-body").textContent).toContain("Undo");
    fireEvent.click(screen.getByTestId("unapplied-text-discard"));
    await waitFor(() => expect(leave).toHaveBeenCalledTimes(1));
  });
});

describe("the browser Back bridge with unapplied text", () => {
  const back = (state: unknown): void => {
    act(() => {
      window.dispatchEvent(new PopStateEvent("popstate", { state }));
    });
  };
  beforeEach(() => {
    useSurveySessionStore.getState().advance("choose_base");
  });

  it("same route: Keep editing does not pop the step, Discard does", async () => {
    renderHook(() => useSurveyBrowserHistorySync());
    render(<UnappliedTextDialog />);
    useUnappliedTextStore.getState().register("a", handle());
    const before = useSurveySessionStore.getState().activeStepId;
    back({ ksStep: "identity" });
    expect(asked()).toBe(true);
    fireEvent.click(screen.getByTestId("unapplied-text-cancel"));
    await waitFor(() => expect(asked()).toBe(false));
    expect(useSurveySessionStore.getState().activeStepId).toBe(before);
    back({ ksStep: "identity" });
    fireEvent.click(screen.getByTestId("unapplied-text-discard"));
    await waitFor(() => expect(useSurveySessionStore.getState().activeStepId).toBe("identity"));
  });

  it("crossing routes: the step pop follows the answer so step and route agree", async () => {
    const off = installHashGuard();
    renderHook(() => useSurveyBrowserHistorySync());
    render(<UnappliedTextDialog />);
    await settleHash();
    useUnappliedTextStore.getState().register("a", handle());
    const before = useSurveySessionStore.getState().activeStepId;
    window.location.hash = "#privacy";
    back({ ksStep: "identity" });
    await waitFor(() => expect(asked()).toBe(true));
    expect(useSurveySessionStore.getState().activeStepId).toBe(before);
    fireEvent.click(screen.getByTestId("unapplied-text-discard"));
    await waitFor(() => expect(window.location.hash).toBe("#privacy"));
    expect(useSurveySessionStore.getState().activeStepId).toBe("identity");
    off();
  });
});

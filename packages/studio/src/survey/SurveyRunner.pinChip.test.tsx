// Component tests for the SurveyRunner debug pin chip.
// Uses React Testing Library (jsdom environment, configured in vitest.config.ts).
//
// Strategy:
//   - Stub VITE_KM_DEBUG and re-import SurveyRunner via vi.resetModules() so the
//     module-level debugPinsStore picks up the new env.
//   - Minimal FlowDef with a single short_text question.
//   - Verify chip presence/absence, pin/unpin toggle, and store update.

import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { render, screen, fireEvent, act, cleanup } from "@testing-library/react";
import type { SurveyPhaseResult } from "@keyboard-studio/contracts";

// ---------------------------------------------------------------------------
// Minimal flow fixture
// ---------------------------------------------------------------------------

const MINIMAL_FLOW = {
  flow_id: "test-flow",
  phase: "A" as const,
  questions: [
    {
      id: "q-first",
      type: "short_text" as const,
      prompt: "What is your name?",
      required: false,
      next: null,
    },
  ],
};

// ---------------------------------------------------------------------------
// Dynamic import helper
// ---------------------------------------------------------------------------

async function importSurveyRunner() {
  vi.resetModules();
  const mod = await import("./SurveyRunner.tsx");
  return mod.SurveyRunner;
}

async function importDebugPinsStore() {
  // Do NOT call vi.resetModules() here — we want the same cached instance that
  // SurveyRunner already imported (importSurveyRunner already called resetModules
  // and SurveyRunner's static import of debugPinsStore populated the module cache).
  const mod = await import("../stores/debugPinsStore.ts");
  return mod.debugPinsStore;
}

// ---------------------------------------------------------------------------
// Tests — chip visible when debug enabled
// ---------------------------------------------------------------------------

describe("SurveyRunner pin chip — debug ENABLED", () => {
  beforeEach(() => {
    vi.stubEnv("VITE_KM_DEBUG", "1");
    window.sessionStorage.clear();
  });

  afterEach(() => {
    cleanup();
    vi.unstubAllEnvs();
    vi.unstubAllGlobals();
    vi.resetModules();
    window.sessionStorage.clear();
  });

  it("renders the pin chip when debug is enabled", async () => {
    const SurveyRunner = await importSurveyRunner();
    const onComplete = vi.fn<[SurveyPhaseResult], void>();

    render(
      <SurveyRunner
        key="test-flow"
        flow={MINIMAL_FLOW}
        onComplete={onComplete}
      />,
    );

    // The chip should be present — either label is fine
    expect(
      screen.queryByText("[+] Pin this answer") ?? screen.queryByText("[PIN] Pinned"),
    ).not.toBeNull();
  });

  it("chip label is 'Pin this answer' when not yet pinned", async () => {
    const SurveyRunner = await importSurveyRunner();
    const onComplete = vi.fn<[SurveyPhaseResult], void>();

    render(
      <SurveyRunner
        key="test-flow"
        flow={MINIMAL_FLOW}
        onComplete={onComplete}
      />,
    );

    expect(screen.getByText("[+] Pin this answer")).toBeTruthy();
  });

  it("clicking pin chip writes to the store and updates label to Pinned", async () => {
    const SurveyRunner = await importSurveyRunner();
    const store = await importDebugPinsStore();
    const onComplete = vi.fn<[SurveyPhaseResult], void>();

    render(
      <SurveyRunner
        key="test-flow"
        flow={MINIMAL_FLOW}
        onComplete={onComplete}
      />,
    );

    // Type a value into the input so pin(id, value) has a non-undefined value.
    // pin(id, undefined) is defined as equivalent to unpin, so we need a real value.
    const input = screen.getByRole("textbox");
    await act(async () => {
      fireEvent.change(input, { target: { value: "test-answer" } });
    });

    const pinBtn = screen.getByText("[+] Pin this answer");
    await act(async () => {
      fireEvent.click(pinBtn);
    });

    // Verify via sessionStorage directly (source-of-truth regardless of module instance)
    const raw = window.sessionStorage.getItem("km-debug-pins");
    const pins = raw !== null ? (JSON.parse(raw) as Record<string, unknown>) : {};
    expect(Object.prototype.hasOwnProperty.call(pins, "q-first")).toBe(true);
    expect(pins["q-first"]).toBe("test-answer");
    // Also verify via the store instance (shares the same module cache)
    expect(store.isPinned("q-first")).toBe(true);
    expect(screen.getByText("[PIN] Pinned")).toBeTruthy();
  });

  it("clicking Pinned chip unpins the question and resets label", async () => {
    // Seed storage directly so the freshly-imported store sees the pin on first read
    window.sessionStorage.setItem(
      "km-debug-pins",
      JSON.stringify({ "q-first": "prefilled" }),
    );

    const SurveyRunner = await importSurveyRunner();
    const store = await importDebugPinsStore();
    const onComplete = vi.fn<[SurveyPhaseResult], void>();

    render(
      <SurveyRunner
        key="test-flow"
        flow={MINIMAL_FLOW}
        onComplete={onComplete}
      />,
    );

    const pinnedBtn = screen.getByText("[PIN] Pinned");
    await act(async () => {
      fireEvent.click(pinnedBtn);
    });

    expect(store.isPinned("q-first")).toBe(false);
    expect(screen.getByText("[+] Pin this answer")).toBeTruthy();
  });

  it("chip has correct aria-pressed attribute", async () => {
    const SurveyRunner = await importSurveyRunner();
    const onComplete = vi.fn<[SurveyPhaseResult], void>();

    render(
      <SurveyRunner
        key="test-flow"
        flow={MINIMAL_FLOW}
        onComplete={onComplete}
      />,
    );

    const btn = screen.getByRole("button", { name: /pin current answer/i });
    expect(btn.getAttribute("aria-pressed")).toBe("false");
  });
});

// ---------------------------------------------------------------------------
// Tests — chip absent when debug DISABLED
// ---------------------------------------------------------------------------

describe("SurveyRunner pin chip — debug DISABLED", () => {
  beforeEach(() => {
    vi.stubEnv("VITE_KM_DEBUG", "");
    vi.stubGlobal("location", {
      ...window.location,
      search: "",
    });
    window.sessionStorage.clear();
  });

  afterEach(() => {
    cleanup();
    vi.unstubAllEnvs();
    vi.unstubAllGlobals();
    vi.resetModules();
    window.sessionStorage.clear();
  });

  it("does NOT render the pin chip when debug is disabled", async () => {
    const SurveyRunner = await importSurveyRunner();
    const onComplete = vi.fn<[SurveyPhaseResult], void>();

    render(
      <SurveyRunner
        key="test-flow"
        flow={MINIMAL_FLOW}
        onComplete={onComplete}
      />,
    );

    expect(screen.queryByText("[+] Pin this answer")).toBeNull();
    expect(screen.queryByText("[PIN] Pinned")).toBeNull();
    // Also verify by role
    expect(screen.queryByRole("button", { name: /pin/i })).toBeNull();
  });

  it("pin chip absence: store is never written", async () => {
    const SurveyRunner = await importSurveyRunner();
    const store = await importDebugPinsStore();
    const onComplete = vi.fn<[SurveyPhaseResult], void>();

    render(
      <SurveyRunner
        key="test-flow"
        flow={MINIMAL_FLOW}
        onComplete={onComplete}
      />,
    );

    // There's no chip to click, but confirm the store wasn't touched
    expect(store.isPinned("q-first")).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// Tests — seed precedence (caller seed > debug pin > undefined)
// ---------------------------------------------------------------------------

describe("SurveyRunner seed precedence", () => {
  afterEach(() => {
    cleanup();
    vi.unstubAllEnvs();
    vi.unstubAllGlobals();
    vi.resetModules();
    window.sessionStorage.clear();
  });

  it("caller getSeedValue takes precedence over debug pin", async () => {
    vi.stubEnv("VITE_KM_DEBUG", "1");
    // Seed storage directly so the freshly-imported module reads it
    window.sessionStorage.setItem(
      "km-debug-pins",
      JSON.stringify({ "q-first": "pin-value" }),
    );

    const SurveyRunner = await importSurveyRunner();
    const onComplete = vi.fn<[SurveyPhaseResult], void>();

    render(
      <SurveyRunner
        key="test-flow"
        flow={MINIMAL_FLOW}
        onComplete={onComplete}
        getSeedValue={() => "caller-seed"}
      />,
    );

    // The input should show the caller-provided seed, not the pin
    const input = screen.getByRole("textbox");
    expect((input as HTMLInputElement).value).toBe("caller-seed");
  });

  it("debug pin is used when caller returns undefined", async () => {
    vi.stubEnv("VITE_KM_DEBUG", "1");
    // Seed storage directly so the freshly-imported module reads it
    window.sessionStorage.setItem(
      "km-debug-pins",
      JSON.stringify({ "q-first": "pinned-default" }),
    );

    const SurveyRunner = await importSurveyRunner();
    const onComplete = vi.fn<[SurveyPhaseResult], void>();

    render(
      <SurveyRunner
        key="test-flow"
        flow={MINIMAL_FLOW}
        onComplete={onComplete}
        getSeedValue={() => undefined}
      />,
    );

    const input = screen.getByRole("textbox");
    expect((input as HTMLInputElement).value).toBe("pinned-default");
  });
});

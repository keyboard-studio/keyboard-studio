// useDocsPreview — spec 061 Story 2 tests (FR-015/SC-006).
//
// Asserts the preview matches Story 1's shipped-file assertions for the same
// answers, and that editing helpDocs (no output package produced) is
// reflected on the next render.

import { describe, it, expect, vi, afterEach } from "vitest";
import { renderHook } from "@testing-library/react";
import { createVirtualFS } from "@keyboard-studio/contracts";
import { makeTestIR, basicKbdus } from "@keyboard-studio/contracts/fixtures";
import { useWorkingCopyStore } from "../stores/workingCopyStore.ts";
import { useDocsPreview } from "./useDocsPreview.ts";
import { DEADKEY_RIGHT_ALT_FIXTURE, ROTA_FIXTURE } from "../lib/docContent.fixtures.ts";

function instantiate() {
  const vfs = createVirtualFS([
    { path: `source/${basicKbdus.id}.kmn`, content: "c test\n", isBinary: false },
  ]);
  useWorkingCopyStore.getState().instantiateFromStart(basicKbdus, { vfs, ir: makeTestIR([]) });
}

describe("useDocsPreview", () => {
  it("renders the no-answer forms before any answers exist (spec 095 FR-029/FR-030)", () => {
    instantiate();
    const { result } = renderHook(() => useDocsPreview());

    expect(result.current.readmeMd).toBe(
      `# ${basicKbdus.displayName}\n\n## Links\n- Online help: https://help.keyman.com/keyboard/${basicKbdus.id}\n`,
    );
    expect(result.current.welcomeHtm).toBe(
      `<html><body><p>Welcome to ${basicKbdus.displayName}</p></body></html>`,
    );
  });

  it("reflects the description in all four previews once helpDocs is set", () => {
    instantiate();
    useWorkingCopyStore.getState().setHelpDocs({
      description: "A keyboard for testing.",
      usageTips: [],
    });

    const { result } = renderHook(() => useDocsPreview());

    expect(result.current.readmeMd).toContain("A keyboard for testing.");
    expect(result.current.readmeHtm).toContain("A keyboard for testing.");
    expect(result.current.welcomeHtm).toContain("A keyboard for testing.");
    expect(result.current.helpPhp).toContain("A keyboard for testing.");
  });

  it("updates on the next render after an edit — no output package involved", () => {
    instantiate();
    useWorkingCopyStore.getState().setHelpDocs({ description: "First answer.", usageTips: [] });

    const { result, rerender } = renderHook(() => useDocsPreview());
    expect(result.current.welcomeHtm).toContain("First answer.");

    useWorkingCopyStore.getState().setHelpDocs({ description: "Revised answer.", usageTips: [] });
    rerender();

    expect(result.current.welcomeHtm).toContain("Revised answer.");
    expect(result.current.welcomeHtm).not.toContain("First answer.");
  });
});

// spec 095 US2: the derived sections ride the same memoised derivation (D3).
describe("useDocsPreview derived documentation (spec 095)", () => {
  afterEach(() => {
    vi.useRealTimers();
  });

  function instantiateWith(fixture: typeof ROTA_FIXTURE) {
    const vfs = createVirtualFS([{ path: `source/${basicKbdus.id}.kmn`, content: fixture.kmn, isBinary: false }]);
    useWorkingCopyStore.getState().instantiateFromStart(basicKbdus, { vfs, ir: fixture.ir });
    useWorkingCopyStore.setState({ ir: fixture.ir });
  }

  it("shows the derived sections on welcome and help with no answers", () => {
    instantiateWith(DEADKEY_RIGHT_ALT_FIXTURE);
    const { result } = renderHook(() => useDocsPreview());
    for (const page of [result.current.welcomeHtm, result.current.helpPhp]) {
      expect(page).toContain("<h2>Typing Guide</h2>");
      expect(page).toContain("<h2>How This Keyboard Works</h2>");
      expect(page).toContain("<h2>Characters on This Keyboard</h2>");
    }
    expect(result.current.typingGuideSuppressed).toBe(false);
  });

  it("updates the derived sections when the working-copy IR changes", () => {
    instantiateWith(DEADKEY_RIGHT_ALT_FIXTURE);
    const { result, rerender } = renderHook(() => useDocsPreview());
    expect(result.current.welcomeHtm).toContain("ŋ");
    expect(result.current.welcomeHtm).not.toContain("ɔ");

    useWorkingCopyStore.setState({ ir: ROTA_FIXTURE.ir });
    rerender();

    expect(result.current.welcomeHtm).toContain("ɔ");
    expect(result.current.welcomeHtm).not.toContain("ŋ");
  });

  it("creates no timer", () => {
    vi.useFakeTimers();
    instantiateWith(ROTA_FIXTURE);
    renderHook(() => useDocsPreview());
    expect(vi.getTimerCount()).toBe(0);
  });
});

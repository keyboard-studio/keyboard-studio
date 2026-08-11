// useDocsPreview — spec 061 Story 2 tests (FR-015/SC-006).
//
// Asserts the preview matches Story 1's shipped-file assertions for the same
// answers, and that editing helpDocs (no output package produced) is
// reflected on the next render.

import { describe, it, expect, afterEach } from "vitest";
import { renderHook } from "@testing-library/react";
import { createVirtualFS } from "@keyboard-studio/contracts";
import { makeTestIR, basicKbdus } from "@keyboard-studio/contracts/fixtures";
import { useWorkingCopyStore } from "../stores/workingCopyStore.ts";
import { useDocsPreview } from "./useDocsPreview.ts";

afterEach(() => {
  useWorkingCopyStore.getState().reset();
});

function instantiate() {
  const vfs = createVirtualFS([
    { path: `source/${basicKbdus.id}.kmn`, content: "c test\n", isBinary: false },
  ]);
  useWorkingCopyStore.getState().instantiateFromBase(basicKbdus, { vfs, ir: makeTestIR([]) });
}

describe("useDocsPreview", () => {
  it("falls back to today's placeholders before any answers exist", () => {
    instantiate();
    const { result } = renderHook(() => useDocsPreview());

    expect(result.current.readmeMd).toBe(`# ${basicKbdus.displayName}\n`);
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

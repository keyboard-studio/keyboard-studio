import { describe, it, expect, vi, beforeEach } from "vitest";
import { createElement, type ReactNode } from "react";
import { renderHook, waitFor } from "@testing-library/react";
import { createVirtualFS } from "@keyboard-studio/contracts";
import { DocPreviewProjectionContext } from "../lib/docPreviewProjection.ts";
import { useDocPreviewAssets } from "./useDocPreviewAssets.ts";

const project = vi.fn();

function wrapper({ children }: { children: ReactNode }) {
  return createElement(DocPreviewProjectionContext.Provider, { value: project }, children);
}

function decode(dataUrl: string): string {
  const b64 = dataUrl.slice(dataUrl.indexOf(",") + 1);
  return new TextDecoder().decode(Uint8Array.from(atob(b64), (c) => c.charCodeAt(0)));
}

describe("useDocPreviewAssets", () => {
  // Braces matter: a function returned from beforeEach is run as a cleanup
  // hook, and mockReset() returns the mock itself.
  beforeEach(() => {
    project.mockReset();
  });

  it("serves the projected assets as data: URLs, with stylesheet images resolved", async () => {
    const vfs = createVirtualFS([
      { path: "source/welcome/welcome.htm", content: "<h1>Hi</h1>", isBinary: false },
      { path: "source/welcome/kb.css", content: ".a{background:url(bg.png)}", isBinary: false },
      { path: "source/welcome/bg.png", content: new Uint8Array([1, 2, 3]), isBinary: true },
      { path: "source/help/kb.css", content: "h1{color:red}", isBinary: false },
    ]);
    project.mockResolvedValue({ vfs });

    const { result } = renderHook(() => useDocPreviewAssets(), { wrapper });
    await waitFor(() => expect(result.current.ready).toBe(true));

    expect(result.current.welcomePath).toBe("source/welcome/welcome.htm");
    expect(result.current.helpCssPaths).toEqual(["source/help/kb.css"]);
    expect(result.current.lookup("source/welcome/bg.png")?.startsWith("data:image/png;base64,")).toBe(true);
    expect(decode(result.current.lookup("source/welcome/kb.css") ?? "")).toContain("data:image/png;base64,");
    expect(result.current.lookup("source/welcome/welcome.htm")).toBeUndefined();
  });

  it("encodes a file only when the page asks for it", async () => {
    const vfs = createVirtualFS([
      { path: "shared/fonts/Big.ttf", content: new Uint8Array(1024), isBinary: true },
      { path: "source/welcome/bg.png", content: new Uint8Array([1, 2, 3]), isBinary: true },
    ]);
    project.mockResolvedValue({ vfs });
    const btoaSpy = vi.spyOn(globalThis, "btoa");
    try {
      const { result } = renderHook(() => useDocPreviewAssets(), { wrapper });
      await waitFor(() => expect(result.current.ready).toBe(true));
      expect(btoaSpy).not.toHaveBeenCalled();
      result.current.lookup("source/welcome/bg.png");
      result.current.lookup("source/welcome/bg.png");
      expect(btoaSpy).toHaveBeenCalledTimes(1);
    } finally {
      btoaSpy.mockRestore();
    }
  });

  it("stays empty when nothing is instantiated", async () => {
    project.mockResolvedValue(null);
    const { result } = renderHook(() => useDocPreviewAssets(), { wrapper });
    await waitFor(() => expect(project).toHaveBeenCalled());
    expect(result.current.ready).toBe(false);
    expect(result.current.lookup("x")).toBeUndefined();
  });

  it("stays empty, without throwing, when the projection fails", async () => {
    project.mockRejectedValue(new Error("projection failed"));
    const { result } = renderHook(() => useDocPreviewAssets(), { wrapper });
    await waitFor(() => expect(project).toHaveBeenCalled());
    expect(result.current.ready).toBe(false);
    expect(result.current.lookup("x")).toBeUndefined();
  });

  it("stays empty when no shell supplies a projection", () => {
    const { result } = renderHook(() => useDocPreviewAssets());
    expect(result.current.ready).toBe(false);
    expect(result.current.lookup("x")).toBeUndefined();
  });
});

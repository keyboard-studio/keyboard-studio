import { describe, it, expect, vi, afterEach } from "vitest";
import { act, screen, cleanup, waitFor } from "@testing-library/react";
import { createVirtualFS } from "@keyboard-studio/contracts";
import { render } from "../../test/renderWithI18n.tsx";
import { DocPreviewProjectionContext } from "../../lib/docPreviewProjection.ts";
import { DocPreviewFrame } from "./DocPreviewFrame.tsx";

function doc(): string {
  return screen.getByTestId("html-preview-frame").getAttribute("srcdoc") ?? "";
}

describe("DocPreviewFrame", () => {
  afterEach(() => {
    cleanup();
    vi.useRealTimers();
  });

  it("renders a flat-convention welcome page with its stylesheet and the stylesheet's image resolved", async () => {
    const vfs = createVirtualFS([
      { path: "source/welcome.htm", content: "<html></html>", isBinary: false },
      { path: "source/kb.css", content: "body{background:url(img/bg.png)}", isBinary: false },
      { path: "source/img/bg.png", content: new Uint8Array([1, 2, 3]), isBinary: true },
    ]);
    const project = vi.fn().mockResolvedValue({ vfs });
    render(
      <DocPreviewProjectionContext.Provider value={project}>
        <DocPreviewFrame
          member="welcome-htm"
          text={'<html><head><link rel="stylesheet" href="kb.css"></head><body><p>Hi</p></body></html>'}
          fileLabel="source/welcome.htm"
        />
      </DocPreviewProjectionContext.Provider>,
    );
    await waitFor(() => expect(doc()).toContain('href="data:text/css;base64,'));
    const css = /href="data:text\/css;base64,([^"]+)"/.exec(doc())?.[1] ?? "";
    expect(atob(css)).toContain("data:image/png;base64,");
  });

  it("waits for typing to pause before reloading the page", () => {
    vi.useFakeTimers();
    const { rerender } = render(<DocPreviewFrame member="readme-htm" text="<p>one</p>" fileLabel="source/readme.htm" />);
    expect(doc()).toContain("one");
    rerender(<DocPreviewFrame member="readme-htm" text="<p>two</p>" fileLabel="source/readme.htm" />);
    expect(doc()).toContain("one");
    act(() => {
      vi.advanceTimersByTime(300);
    });
    expect(doc()).toContain("two");
  });
});

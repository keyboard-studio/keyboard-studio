// Leave guard on the stylesheet editor (CssEditor with its real code pane) of a keyboard opened for update (spec 111 FR-046).

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { act, cleanup, fireEvent, screen, waitFor } from "@testing-library/react";
import { render } from "../../test/renderWithI18n.tsx";
import { createVirtualFS } from "@keyboard-studio/contracts";
import { CssEditor } from "./CssEditor.tsx";
import { navigateTo } from "../../lib/navigate.ts";
import { installHashGuard } from "../../lib/navigationGuard.ts";
import { useWorkingCopyStore } from "../../stores/workingCopyStore.ts";
import { useOpenUndoStore } from "../../stores/openUndoStore.ts";
import { LeaveProbe, WithHost, answer, askedQuestion } from "../../test/unappliedGuardHarness.tsx";

// The compile pipeline and the preview pane (KeymanWeb iframe) are not under test here.
vi.mock("../../hooks/useKeyboardArtifact.ts", () => ({
  useKeyboardArtifact: () => ({ stage: { kind: "idle" }, retry: () => undefined }),
}));
vi.mock("./PreviewPane.tsx", () => ({ GalleryPreviewPane: () => <div data-testid="osk-frame" /> }));
vi.mock("@monaco-editor/react", async () => {
  const React = await import("react");
  return {
    default: function MockEditor(props: { value?: string; onChange?: (value: string | undefined) => void }) {
      return React.createElement("textarea", {
        "data-testid": "mock-editor",
        value: props.value ?? "",
        onChange: (e: { target: { value: string } }) => props.onChange?.(e.target.value),
      });
    },
  };
});

const KMN = "store(&NAME) 'T'\nstore(&KMW_EMBEDCSS) 'kb.css'\n\nbegin Unicode > use(main)\ngroup(main) using keys\n";
const ORIGINAL = ".kmw-key { color: red; }";
const EDITED = ".kmw-key { color: blue; }";

beforeEach(() => {
  const startVfs = createVirtualFS();
  startVfs.set("source/t.kmn", KMN, false);
  startVfs.set("source/t.kps", "<Package/>", false);
  startVfs.set("source/kb.css", ORIGINAL, false);
  useWorkingCopyStore.setState({
    instantiationMode: "adapt-existing",
    startKeyboard: { id: "t", displayName: "T" } as never,
    startVfs,
    identity: null,
    customCss: null,
  });
});

const fileText = (): string | undefined => {
  const c = useWorkingCopyStore.getState().startVfs?.get("source/kb.css")?.content;
  return typeof c === "string" ? c : undefined;
};
const typeInto = (value: string): void => {
  fireEvent.change(screen.getByTestId("mock-editor"), { target: { value } });
};
const ready = async (): Promise<void> => {
  await screen.findByTestId("mock-editor");
};
const view = (leave: () => void) => (
  <WithHost>
    <CssEditor onComplete={() => undefined} onBack={() => undefined} />
    <LeaveProbe onLeave={leave} />
  </WithHost>
);

afterEach(() => {
  cleanup();
  useWorkingCopyStore.getState().reset();
  useOpenUndoStore.getState().clear();
});

describe("the stylesheet editor leave guard", () => {
  it("asks when leaving with unapplied text, and writes nothing yet", async () => {
    const leave = vi.fn();
    render(view(leave));
    await ready();
    typeInto(EDITED);
    fireEvent.click(screen.getByTestId("leave"));
    expect(askedQuestion()).toBe(true);
    expect(leave).not.toHaveBeenCalled();
    expect(fileText()).toBe(ORIGINAL);
  });

  it("Apply writes the text and then leaves", async () => {
    const leave = vi.fn();
    render(view(leave));
    await ready();
    typeInto(EDITED);
    fireEvent.click(screen.getByTestId("leave"));
    await answer("apply");
    await waitFor(() => expect(leave).toHaveBeenCalledTimes(1));
    expect(fileText()).toBe(EDITED);
  });

  it("Discard leaves without writing", async () => {
    const leave = vi.fn();
    render(view(leave));
    await ready();
    typeInto(EDITED);
    fireEvent.click(screen.getByTestId("leave"));
    await answer("discard");
    await waitFor(() => expect(leave).toHaveBeenCalledTimes(1));
    expect(fileText()).toBe(ORIGINAL);
    expect((screen.getByTestId("mock-editor") as HTMLTextAreaElement).value).toBe(ORIGINAL);
  });

  it("Keep editing stays, keeping the text", async () => {
    const leave = vi.fn();
    render(view(leave));
    await ready();
    typeInto(EDITED);
    fireEvent.click(screen.getByTestId("leave"));
    await answer("cancel");
    expect(leave).not.toHaveBeenCalled();
    expect(fileText()).toBe(ORIGINAL);
    expect((screen.getByTestId("mock-editor") as HTMLTextAreaElement).value).toBe(EDITED);
  });

  it("does not ask when nothing is unapplied", async () => {
    const leave = vi.fn();
    render(view(leave));
    await ready();
    fireEvent.click(screen.getByTestId("leave"));
    expect(askedQuestion()).toBe(false);
    expect(leave).toHaveBeenCalledTimes(1);
  });

  it("a refused apply stays, with the text kept and nothing written", async () => {
    const leave = vi.fn();
    render(view(leave));
    await ready();
    typeInto(".kmw-key { color: red;");
    fireEvent.click(screen.getByTestId("leave"));
    await answer("apply");
    expect(leave).not.toHaveBeenCalled();
    expect(fileText()).toBe(ORIGINAL);
    expect((screen.getByTestId("mock-editor") as HTMLTextAreaElement).value).toBe(".kmw-key { color: red;");
  });

  it("the footer Continue asks first, and completes only after Apply writes", async () => {
    const onComplete = vi.fn();
    render(
      <WithHost>
        <CssEditor onComplete={onComplete} onBack={() => undefined} />
        <LeaveProbe onLeave={() => undefined} />
      </WithHost>,
      { withStepNav: true },
    );
    await ready();
    typeInto(EDITED);
    fireEvent.click(screen.getByTestId("css-continue"));
    expect(askedQuestion()).toBe(true);
    expect(onComplete).not.toHaveBeenCalled();
    await answer("apply");
    await waitFor(() => expect(onComplete).toHaveBeenCalledTimes(1));
    expect(fileText()).toBe(EDITED);
    // Continue carries the text that was just applied, not the one the step opened on.
    expect(onComplete).toHaveBeenCalledWith({ css: EDITED });
  });

  it("the footer Undo asks first, and Keep editing leaves the log alone", async () => {
    render(
      <WithHost>
        <CssEditor onComplete={() => undefined} onBack={() => undefined} />
        <LeaveProbe onLeave={() => undefined} />
      </WithHost>,
      { withStepNav: true },
    );
    await ready();
    // One applied change, so the log has something to undo; then more text that is not applied.
    typeInto(EDITED);
    fireEvent.click(screen.getByRole("button", { name: "Apply" }));
    await waitFor(() => expect(fileText()).toBe(EDITED));
    await screen.findByTestId("mock-editor");
    typeInto(".kmw-key { color: green; }");
    fireEvent.click(screen.getByTestId("open-undo-button"));
    expect(askedQuestion()).toBe(true);
    // Applying would only be undone again, so Undo offers no Apply.
    expect(screen.queryByTestId("unapplied-text-apply")).toBeNull();
    await answer("cancel");
    expect(fileText()).toBe(EDITED);
  });

  it("Discard then a route change asks once and lands (no stale unapplied text after Discard)", async () => {
    window.location.hash = "#output";
    const off = installHashGuard();
    render(
      <WithHost>
        <CssEditor onComplete={() => undefined} onBack={() => undefined} />
        <LeaveProbe onLeave={() => undefined} />
      </WithHost>,
    );
    await ready();
    typeInto(EDITED);
    act(() => navigateTo("profile"));
    expect(askedQuestion()).toBe(true);
    fireEvent.click(screen.getByTestId("unapplied-text-discard"));
    await waitFor(() => expect(window.location.hash).toBe("#profile"));
    await new Promise((r) => setTimeout(r, 50));
    expect(askedQuestion()).toBe(false);
    expect(window.location.hash).toBe("#profile");
    off();
  });
});

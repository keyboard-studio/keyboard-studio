// Leave guard on the documentation page code mode (HtmlEditor with its real code pane) of a keyboard opened for update (spec 111 FR-046).

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, screen, waitFor } from "@testing-library/react";
import { render } from "../../test/renderWithI18n.tsx";
import { createVirtualFS } from "@keyboard-studio/contracts";
import { HtmlEditor } from "./HtmlEditor.tsx";
import { useWorkingCopyStore } from "../../stores/workingCopyStore.ts";
import { useOpenUndoStore } from "../../stores/openUndoStore.ts";
import { LeaveProbe, WithHost, answer, askedQuestion } from "../../test/unappliedGuardHarness.tsx";

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
vi.mock("./HtmlRichTextPane.tsx", () => ({
  HtmlRichTextPane: () => <div data-testid="rich-pane" />,
}));
vi.mock("../../hooks/useDocsPreview.ts", () => ({
  useDocsPreview: () => ({ welcomeHtm: "", readmeHtm: "", readmeMd: "", helpPhp: "", typingGuideSuppressed: false }),
}));
vi.mock("../../hooks/useDocMemberStates.ts", () => ({ useDocMemberStates: () => [] }));

const ORIGINAL = "<!DOCTYPE html><html><head><title>T</title></head><body><p>FILE-WELCOME</p></body></html>";
const EDITED = ORIGINAL.replace("FILE-WELCOME", "FILE-WELCOME edited");

beforeEach(() => {
  const startVfs = createVirtualFS();
  startVfs.set("source/t.kps", "<Package></Package>", false);
  startVfs.set("source/welcome/welcome.htm", ORIGINAL, false);
  startVfs.set("README.md", "FILE-README", false);
  useWorkingCopyStore.setState({
    instantiationMode: "adapt-existing",
    startKeyboard: { id: "t", displayName: "T" } as never,
    startVfs,
    identity: null,
    startWelcomeHtmText: null,
    startHelpPhpText: null,
    startReadmeMdText: null,
    startHistoryMdText: null,
    startLicenseText: null,
    authoredWelcomeHtm: null,
    authoredReadmeHtm: null,
    authoredReadmeMd: null,
    authoredHelpPhp: null,
  });
});

const fileText = (): string | undefined => {
  const c = useWorkingCopyStore.getState().startVfs?.get("source/welcome/welcome.htm")?.content;
  return typeof c === "string" ? c : undefined;
};
const typeInto = (value: string): void => {
  fireEvent.change(screen.getByTestId("mock-editor"), { target: { value } });
};
const ready = async (): Promise<void> => {
  fireEvent.click(await screen.findByRole("button", { name: "Code" }));
  await screen.findByTestId("mock-editor");
};
const view = (leave: () => void) => (
  <WithHost>
    <HtmlEditor onComplete={() => undefined} onBack={() => undefined} />
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
    typeInto("<p>unclosed");
    fireEvent.click(screen.getByTestId("leave"));
    await answer("apply");
    expect(leave).not.toHaveBeenCalled();
    expect(fileText()).toBe(ORIGINAL);
    expect((screen.getByTestId("mock-editor") as HTMLTextAreaElement).value).toBe("<p>unclosed");
  });

  it("the footer Continue asks first, and completes only after Apply writes", async () => {
    const onComplete = vi.fn();
    render(
      <WithHost>
        <HtmlEditor onComplete={onComplete} onBack={() => undefined} />
        <LeaveProbe onLeave={() => undefined} />
      </WithHost>,
      { withStepNav: true },
    );
    await ready();
    typeInto(EDITED);
    fireEvent.click(screen.getByTestId("html-continue"));
    expect(askedQuestion()).toBe(true);
    expect(onComplete).not.toHaveBeenCalled();
    await answer("apply");
    await waitFor(() => expect(onComplete).toHaveBeenCalledTimes(1));
    expect(fileText()).toBe(EDITED);
  });

  it("switching page asks first; Discard switches without writing", async () => {
    render(<WithHost><HtmlEditor onComplete={() => undefined} onBack={() => undefined} /><LeaveProbe onLeave={() => undefined} /></WithHost>);
    await ready();
    typeInto(EDITED);
    fireEvent.click(screen.getByTestId("html-file-readme-md"));
    expect(askedQuestion()).toBe(true);
    await answer("discard");
    await waitFor(() => expect(screen.queryByTestId("mock-editor")).not.toBeNull());
    expect(fileText()).toBe(ORIGINAL);
  });

  it("switching mode away from Code asks first; Keep editing stays in Code", async () => {
    render(<WithHost><HtmlEditor onComplete={() => undefined} onBack={() => undefined} /><LeaveProbe onLeave={() => undefined} /></WithHost>);
    await ready();
    typeInto(EDITED);
    fireEvent.click(screen.getByRole("button", { name: "Write" }));
    expect(askedQuestion()).toBe(true);
    await answer("cancel");
    expect((screen.getByTestId("mock-editor") as HTMLTextAreaElement).value).toBe(EDITED);
  });
});

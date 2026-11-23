// Leave guard on the on-screen keyboard Code tab of a keyboard opened for update (spec 111 FR-046).

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, screen, waitFor } from "@testing-library/react";
import { render } from "../../test/renderWithI18n.tsx";
import { createVirtualFS } from "@keyboard-studio/contracts";
import type { StartKeyboard } from "@keyboard-studio/contracts";
import { parseKmn, parseKvks } from "@keyboard-studio/engine";
import { useWorkingCopyStore } from "../../stores/workingCopyStore.ts";
import { useOpenUndoStore } from "../../stores/openUndoStore.ts";
import { OskCodePane } from "./OskCodePane.tsx";
import { LeaveProbe, WithHost, answer, askedQuestion } from "../../test/unappliedGuardHarness.tsx";

vi.mock("./touchBuilder/monacoSetup.ts", () => ({}));
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

const KMN = "store(&NAME) 'Kb'\nbegin Unicode > use(main)\ngroup(main) using keys\n+ [K_A] > 'a'\n";
const KB: StartKeyboard = { id: "kb", path: "release/k/kb", script: "Latn", targets: ["windows"], displayName: "Kb", version: "1.0" };
const ORIGINAL = "<?xml version=\"1.0\" encoding=\"UTF-8\"?>\n<visualkeyboard>\n  <header><version>10.0</version><kbdname>kb</kbdname></header>\n  <encoding name=\"unicode\" fontname=\"Arial\" fontsize=\"10\"><layer shift=\"\"><key vkey=\"K_A\">a</key></layer></encoding>\n</visualkeyboard>\n";
const EDITED = ORIGINAL.replace("version>10.0", "version>10.0 ");

beforeEach(() => {
  const vfs = createVirtualFS();
  vfs.set("source/kb.kmn", KMN, false);
  vfs.set("source/kb.kps", "<Package/>", false);
  vfs.set("source/kb.kvks", ORIGINAL, false);
  useWorkingCopyStore.getState().instantiateFromExisting(KB, { vfs, ir: parseKmn(KMN, "kb").ir });
});

const fileText = (): string | undefined => {
  const c = useWorkingCopyStore.getState().startVfs?.get("source/kb.kvks")?.content;
  return typeof c === "string" ? c : undefined;
};
const typeInto = (value: string): void => {
  fireEvent.change(screen.getByTestId("mock-editor"), { target: { value } });
};
const view = (leave: () => void) => (
  <WithHost>
    <OskCodePane kvks={parseKvks(ORIGINAL)} onApply={() => undefined} />
    <LeaveProbe onLeave={leave} />
  </WithHost>
);

afterEach(() => {
  cleanup();
  useWorkingCopyStore.getState().reset();
  useOpenUndoStore.getState().clear();
});

describe("the on-screen keyboard Code tab leave guard", () => {
  it("asks when leaving with unapplied text, and writes nothing yet", () => {
    const leave = vi.fn();
    render(view(leave));
    typeInto(EDITED);
    fireEvent.click(screen.getByTestId("leave"));
    expect(askedQuestion()).toBe(true);
    expect(leave).not.toHaveBeenCalled();
    expect(fileText()).toBe(ORIGINAL);
  });

  it("Apply writes the text and then leaves", async () => {
    const leave = vi.fn();
    render(view(leave));
    typeInto(EDITED);
    fireEvent.click(screen.getByTestId("leave"));
    await answer("apply");
    await waitFor(() => expect(leave).toHaveBeenCalledTimes(1));
    expect(fileText()).toBe(EDITED);
  });

  it("Discard leaves without writing", async () => {
    const leave = vi.fn();
    render(view(leave));
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
    typeInto(EDITED);
    fireEvent.click(screen.getByTestId("leave"));
    await answer("cancel");
    expect(leave).not.toHaveBeenCalled();
    expect(fileText()).toBe(ORIGINAL);
    expect((screen.getByTestId("mock-editor") as HTMLTextAreaElement).value).toBe(EDITED);
  });

  it("does not ask when nothing is unapplied", () => {
    const leave = vi.fn();
    render(view(leave));
    fireEvent.click(screen.getByTestId("leave"));
    expect(askedQuestion()).toBe(false);
    expect(leave).toHaveBeenCalledTimes(1);
  });

  it("a refused apply stays, with the text kept and nothing written", async () => {
    const leave = vi.fn();
    render(view(leave));
    typeInto("<visualkeyboard><header>");
    fireEvent.click(screen.getByTestId("leave"));
    await answer("apply");
    expect(leave).not.toHaveBeenCalled();
    expect(fileText()).toBe(ORIGINAL);
    expect((screen.getByTestId("mock-editor") as HTMLTextAreaElement).value).toBe("<visualkeyboard><header>");
  });
});

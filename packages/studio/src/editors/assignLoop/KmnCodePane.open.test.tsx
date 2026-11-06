// Open mode (spec 111 FR-009): the .kmn Code tab shows the file's own text and
// Apply replaces the starting point with it.

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, screen } from "@testing-library/react";
import { render } from "../../test/renderWithI18n.tsx";
import { createVirtualFS } from "@keyboard-studio/contracts";
import type { StartKeyboard } from "@keyboard-studio/contracts";
import { parseKmn } from "@keyboard-studio/engine";
import { useWorkingCopyStore } from "../../stores/workingCopyStore.ts";
import { KmnCodePane } from "./KmnCodePane.tsx";

vi.mock("./touchBuilder/monacoSetup.ts", () => ({}));

vi.mock("@monaco-editor/react", async () => {
  const React = await import("react");
  return {
    default: function MockEditor(props: {
      value?: string;
      onChange?: (value: string | undefined) => void;
    }) {
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

function vfsText(path: string): string | undefined {
  const c = useWorkingCopyStore.getState().startVfs?.get(path)?.content;
  return typeof c === "string" ? c : undefined;
}
function typeInto(value: string): void {
  fireEvent.change(screen.getByTestId("mock-editor"), { target: { value } });
}
afterEach(() => {
  cleanup();
  useWorkingCopyStore.getState().reset();
});

// A comment line plus a rule whose spacing the codec would normalize.
const TEXT = "c author comment\n" + KMN;

beforeEach(() => {
  const vfs = createVirtualFS();
  vfs.set("source/kb.kmn", TEXT, false);
  useWorkingCopyStore.getState().instantiateFromExisting(KB, { vfs, ir: parseKmn(TEXT, "kb").ir });
});

describe("KmnCodePane on Open", () => {
  it("shows the file text verbatim", () => {
    render(<KmnCodePane />);
    expect((screen.getByTestId("mock-editor") as HTMLTextAreaElement).value).toBe(TEXT);
  });

  it("applies a comment edit as exactly that file text", () => {
    render(<KmnCodePane />);
    const edited = TEXT.replace("author comment", "author comment, edited");
    typeInto(edited);
    fireEvent.click(screen.getByTestId("kmn-code-apply"));
    expect(vfsText("source/kb.kmn")).toBe(edited);
  });

  it("applies a formatting-only change", () => {
    render(<KmnCodePane />);
    const formatted = TEXT.replace("+ [K_A]", "+   [K_A]");
    typeInto(formatted);
    expect((screen.getByTestId("kmn-code-apply") as HTMLButtonElement).disabled).toBe(false);
    fireEvent.click(screen.getByTestId("kmn-code-apply"));
    expect(vfsText("source/kb.kmn")).toBe(formatted);
  });

  it("blocks Apply on a parse error and leaves the file alone", () => {
    render(<KmnCodePane />);
    typeInto("store(&NAME 'unterminated\n+ > [[[ ((");
    fireEvent.click(screen.getByTestId("kmn-code-apply"));
    expect(vfsText("source/kb.kmn")).toBe(TEXT);
  });
});

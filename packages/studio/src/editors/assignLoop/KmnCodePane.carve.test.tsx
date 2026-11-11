// Regression: the Mechanical Gallery's Code tab must show the CARVED keyboard,
// not the base source (Matthew's Bafut walk, 2026-11-11).
//
// Adapting Bafut from SIL Cameroon QWERTY: after carving the five non-Bafut
// diacritics (U+0304, U+0330, U+1DC5, U+1DC6, U+0327) the preview was carved
// and correct, but the Code tab showed Cameroon QWERTY unedited.
//
// Root cause: carve deletions live only in the overlay sets (deletedNodeIds /
// deletedItemIds / carveChars) — `deleteNode` / `deleteItem` / `cascadeDelete`
// never touch store `ir`. The preview and the download apply the overlay at
// projection time (projectWorkingCopyVfs from startIr), but KmnCodePane's
// canonical text was `emitKmn(ir)` — the pre-carve working IR.
//
// The test pins the behaviour, not the implementation: with the carve overlay
// set, the pane's text must not contain any rule that outputs a carved mark,
// and must differ from the uncarved emit. The projected side (the preview's
// source, via applyCarveMutate) is asserted alongside so a failure here
// distinguishes "the carve doesn't remove this rule" from "the pane is stale".

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { act, cleanup, fireEvent, screen } from "@testing-library/react";
import { render } from "../../test/renderWithI18n.tsx";
import { applyCarveMutate } from "../../steps/editorMutate.ts";
import { createVirtualFS, type StartKeyboard } from "@keyboard-studio/contracts";
import { emitKmn, parseKmn } from "@keyboard-studio/engine";
import { useWorkingCopyStore } from "../../stores/workingCopyStore.ts";
import { KmnCodePane } from "./KmnCodePane.tsx";

vi.mock("./touchBuilder/monacoSetup.ts", () => ({}));

vi.mock("@monaco-editor/react", async () => {
  const React = await import("react");
  return {
    default: function MockEditor(props: {
      value?: string;
      onChange?: (value: string | undefined) => void;
      onMount?: (editor: unknown, monaco: unknown) => void;
    }) {
      const mounted = React.useRef(false);
      React.useEffect(() => {
        if (!mounted.current) {
          mounted.current = true;
          props.onMount?.(
            { getModel: () => ({ dispose: () => undefined }) },
            {
              editor: { setModelMarkers: () => undefined },
              MarkerSeverity: { Error: 8, Warning: 4, Info: 2, Hint: 1 },
            },
          );
        }
        // eslint-disable-next-line react-hooks/exhaustive-deps
      }, []);
      return React.createElement("textarea", {
        "data-testid": "mock-editor",
        value: props.value ?? "",
        onChange: (e: { target: { value: string } }) =>
          props.onChange?.(e.target.value),
      });
    },
  };
});

const __dir = dirname(fileURLToPath(import.meta.url));
const KMN_PATH = resolve(
  __dir,
  "../../lib/__fixtures__/sil_cameroon_qwerty.kmn",
);

// The five non-Bafut diacritics carved out of Cameroon QWERTY (PR #2643).
const CARVED_MARKS = ["\u0304", "\u0330", "\u1DC5", "\u1DC6", "\u0327"] as const;

function editorText(): string {
  return (screen.getByTestId("mock-editor") as HTMLTextAreaElement).value;
}

/** Rule lines in `text` whose output is one of the carved marks. */
function carvedRuleLines(text: string): string[] {
  const marks = new Set(CARVED_MARKS.map((m) => `U+${m.codePointAt(0)!.toString(16).toUpperCase().padStart(4, "0")}`));
  return text.split("\n").filter((line) => {
    const trimmed = line.trim();
    if (!trimmed.startsWith("+")) return false;
    const output = trimmed.split(">").at(-1)?.trim();
    return output !== undefined && marks.has(output);
  });
}

beforeEach(() => {
  const kmn = readFileSync(KMN_PATH, "utf8");
  const baseIr = parseKmn(kmn, "sil_cameroon_qwerty").ir;
  useWorkingCopyStore.setState({
    ir: baseIr,
    startIr: baseIr,
    deletedNodeIds: new Set(),
    deletedItemIds: new Set(),
    carveChars: new Set<string>(CARVED_MARKS),
  });
});

afterEach(() => {
  cleanup();
  useWorkingCopyStore.setState({
    ir: null,
    startIr: null,
    startVfs: null,
    startKeyboard: null,
    deletedNodeIds: new Set(),
    deletedItemIds: new Set(),
    carveChars: new Set(),
  });
});

describe("KmnCodePane with a carve overlay (Bafut from Cameroon QWERTY)", () => {
  it("shows the carved keyboard, not the unedited base source", () => {
    const { ir, startIr } = useWorkingCopyStore.getState();
    const uncarved = emitKmn(ir!);
    const carvedLines = carvedRuleLines(uncarved);
    // Grounding: the base source really does carry rules for the carved marks.
    expect(carvedLines.length).toBeGreaterThan(0);

    // The projection (the preview's source) removes those rules.
    const projected = emitKmn(
      applyCarveMutate(startIr!, new Set(), new Set(), new Set(CARVED_MARKS)),
    );
    expect(carvedRuleLines(projected)).toEqual([]);

    render(<KmnCodePane />);
    const paneText = editorText();
    expect(paneText).not.toBe(uncarved);
    expect(carvedRuleLines(paneText)).toEqual([]);
  });

  it("shows the carved keyboard through the real projection when a startVfs is present", () => {
    const kmn = readFileSync(KMN_PATH, "utf8");
    const { ir } = useWorkingCopyStore.getState();
    const uncarved = emitKmn(ir!);
    expect(carvedRuleLines(uncarved).length).toBeGreaterThan(0);
    act(() => {
      useWorkingCopyStore.setState({
        startVfs: createVirtualFS([
          {
            path: "source/sil_cameroon_qwerty.kmn",
            content: kmn,
            isBinary: false,
          },
        ]),
        startKeyboard: {
          id: "sil_cameroon_qwerty",
          path: "release/s/sil_cameroon_qwerty",
          script: "Latn",
          targets: [],
          displayName: "SIL Cameroon QWERTY",
          version: "1.0",
        } as unknown as StartKeyboard,
      });
    });
    render(<KmnCodePane />);
    const paneText = editorText();
    expect(paneText).not.toBe(uncarved);
    expect(carvedRuleLines(paneText)).toEqual([]);
  });

  it("Apply keeps the carve overlay, and restoring the carve resurrects the rules in the pane", () => {
    const kmn = readFileSync(KMN_PATH, "utf8");
    const { ir } = useWorkingCopyStore.getState();
    const uncarved = emitKmn(ir!);
    expect(carvedRuleLines(uncarved).length).toBeGreaterThan(0);
    act(() => {
      useWorkingCopyStore.setState({
        startVfs: createVirtualFS([
          {
            path: "source/sil_cameroon_qwerty.kmn",
            content: kmn,
            isBinary: false,
          },
        ]),
        startKeyboard: {
          id: "sil_cameroon_qwerty",
          path: "release/s/sil_cameroon_qwerty",
          script: "Latn",
          targets: [],
          displayName: "SIL Cameroon QWERTY",
          version: "1.0",
        } as unknown as StartKeyboard,
      });
    });
    render(<KmnCodePane />);
    expect(carvedRuleLines(editorText())).toEqual([]);

    // A formatting-only edit + Apply: the overlay must survive the write.
    act(() => {
      fireEvent.change(screen.getByTestId("mock-editor"), {
        target: { value: editorText() + "\n" },
      });
    });
    act(() => {
      fireEvent.click(screen.getByTestId("kmn-code-apply"));
    });
    expect(useWorkingCopyStore.getState().carveChars).toEqual(
      new Set(CARVED_MARKS),
    );
    expect(carvedRuleLines(editorText())).toEqual([]);

    // Restoring the carve resurrects the rules in the code view.
    act(() => {
      useWorkingCopyStore.setState({ carveChars: new Set<string>() });
    });
    expect(carvedRuleLines(editorText()).length).toBeGreaterThan(0);
  });

  it("a dirty draft survives a carve restore instead of snapping to the new canonical", () => {
    const kmn = readFileSync(KMN_PATH, "utf8");
    act(() => {
      useWorkingCopyStore.setState({
        startVfs: createVirtualFS([
          {
            path: "source/sil_cameroon_qwerty.kmn",
            content: kmn,
            isBinary: false,
          },
        ]),
        startKeyboard: {
          id: "sil_cameroon_qwerty",
          path: "release/s/sil_cameroon_qwerty",
          script: "Latn",
          targets: [],
          displayName: "SIL Cameroon QWERTY",
          version: "1.0",
        } as unknown as StartKeyboard,
      });
    });
    render(<KmnCodePane />);
    expect(carvedRuleLines(editorText())).toEqual([]);
    const draft = editorText() + "\n";
    act(() => {
      fireEvent.change(screen.getByTestId("mock-editor"), {
        target: { value: draft },
      });
    });
    expect(screen.getByTestId("kmn-code-dirty")).toBeTruthy();

    // Restoring the carve changes the canonical (the rules come back) —
    // the dirty draft must stay put, not snap to the new canonical.
    act(() => {
      useWorkingCopyStore.setState({ carveChars: new Set<string>() });
    });
    expect(editorText()).toBe(draft);
    expect(carvedRuleLines(editorText())).toEqual([]);
    expect(screen.getByTestId("kmn-code-dirty")).toBeTruthy();
    // Note: Apply clearing dirty on the projection path is covered in
    // KmnCodePane.test.tsx (real-edit and formatting-only Apply tests):
    // handleApply resyncs the draft bookkeeping directly, since the
    // projected canonical never moves on a setWorkingIR and the snap
    // effect cannot be relied on.
  });
});

// Component tests for the Mechanical Gallery's Code tab (KmnCodePane.tsx).
//
// Monaco itself is mocked (a textarea stand-in): these tests pin the pane's
// wiring — dirty tracking, Apply → setWorkingIR, the null-ir disabled
// state — not Monaco's rendering. The lint pipeline has its own
// pure-module suite.

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  act,
  cleanup,
  fireEvent,
  screen,
} from "@testing-library/react";
import { render } from "../../test/renderWithI18n.tsx";
import { emitKmn, parseKmn } from "@keyboard-studio/engine";
import type { KeyboardIR } from "@keyboard-studio/contracts";
import { useWorkingCopyStore } from "../../stores/workingCopyStore.ts";
import { KmnCodePane, lineForNode } from "./KmnCodePane.tsx";

vi.mock("./touchBuilder/monacoSetup.ts", () => ({}));

const editorMocks = vi.hoisted(() => ({
  setModelMarkers: vi.fn(),
  revealLineInCenter: vi.fn(),
  setSelection: vi.fn(),
}));

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
            {
              getModel: () => ({
                dispose: () => undefined,
                getLineMaxColumn: () => 40,
              }),
              revealLineInCenter: editorMocks.revealLineInCenter,
              setSelection: editorMocks.setSelection,
            },
            {
              editor: { setModelMarkers: editorMocks.setModelMarkers },
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

function makeIR(): KeyboardIR {
  return {
    origin: "import",
    header: { name: "testkbd", version: "1.0" },
    stores: [],
    groups: [],
    comments: [],
    raw: [],
    recognizedPatterns: [],
  } as unknown as KeyboardIR;
}

function editorText(): string {
  return (screen.getByTestId("mock-editor") as HTMLTextAreaElement).value;
}

function applyButton(): HTMLButtonElement {
  return screen.getByTestId("kmn-code-apply") as HTMLButtonElement;
}

beforeEach(() => {
  editorMocks.setModelMarkers.mockClear();
  editorMocks.revealLineInCenter.mockClear();
  editorMocks.setSelection.mockClear();
  useWorkingCopyStore.setState({ ir: makeIR() });
});

afterEach(() => {
  cleanup();
  useWorkingCopyStore.setState({ ir: null });
});

describe("KmnCodePane", () => {
  it("renders the disabled empty state when ir is null", () => {
    useWorkingCopyStore.setState({ ir: null });
    render(<KmnCodePane />);
    expect(screen.getByTestId("kmn-code-pane-empty")).toBeTruthy();
    expect(screen.queryByTestId("mock-editor")).toBeNull();
  });

  it("starts clean: Apply disabled, editor shows the canonical emit", () => {
    const ir = makeIR();
    useWorkingCopyStore.setState({ ir });
    render(<KmnCodePane />);
    expect(editorText()).toBe(emitKmn(ir));
    expect(applyButton().disabled).toBe(true);
    expect(screen.queryByTestId("kmn-code-dirty")).toBeNull();
  });

  it("typing marks the pane dirty and enables Apply", () => {
    useWorkingCopyStore.setState({ ir: makeIR() });
    render(<KmnCodePane />);
    act(() => {
      fireEvent.change(screen.getByTestId("mock-editor"), {
        target: { value: editorText() + "\n" },
      });
    });
    expect(screen.getByTestId("kmn-code-dirty")).toBeTruthy();
    expect(applyButton().disabled).toBe(false);
  });

  it("Apply parses the KMN and writes via setWorkingIR", () => {
    const ir = makeIR();
    useWorkingCopyStore.setState({ ir });
    render(<KmnCodePane />);
    const edited = editorText() + "\n";
    act(() => {
      fireEvent.change(screen.getByTestId("mock-editor"), {
        target: { value: edited },
      });
    });
    act(() => {
      fireEvent.click(applyButton());
    });
    // setWorkingIR wrote the re-parsed IR back to the store: the stored
    // IR is a new object (fresh parse), not the original.
    const next = useWorkingCopyStore.getState().ir;
    expect(next).not.toBeNull();
    expect(next).not.toBe(ir);
  });

  it("Apply is blocked while the KMN has syntax errors", () => {
    const ir = makeIR();
    useWorkingCopyStore.setState({ ir });
    render(<KmnCodePane />);
    act(() => {
      fireEvent.change(screen.getByTestId("mock-editor"), {
        target: { value: "store(&NAME 'unterminated" },
      });
    });
    expect(screen.getByTestId("kmn-code-dirty")).toBeTruthy();
    const before = useWorkingCopyStore.getState().ir;
    act(() => {
      fireEvent.click(applyButton());
    });
    // The synchronous lint gate blocks the Apply; the store IR is untouched.
    expect(useWorkingCopyStore.getState().ir).toBe(before);
  });

  describe("revealNodeId", () => {
    const KMN = [
      "store(&NAME) 'testkbd'",
      "begin Unicode > use(main)",
      "group(main) using keys",
      "+ 'a' > 'b'",
      "+ 'c' > 'd'",
      "",
    ].join("\n");

    function parsedIr(): KeyboardIR {
      return parseKmn(KMN, "testkbd").ir;
    }

    it("scrolls to and selects the line of a rule", () => {
      const ir = parsedIr();
      useWorkingCopyStore.setState({ ir });
      const rule = ir.groups[0]!.rules[1]!;
      const { lineByNodeId } = emitKmn(ir, { lineMap: true });
      const line = lineByNodeId.get(rule.nodeId)!;
      render(<KmnCodePane revealNodeId={rule.nodeId} />);
      expect(editorMocks.revealLineInCenter).toHaveBeenCalledTimes(1);
      expect(editorMocks.revealLineInCenter).toHaveBeenCalledWith(line);
      expect(editorMocks.setSelection).toHaveBeenCalledWith(
        expect.objectContaining({ startLineNumber: line, endLineNumber: line }),
      );
    });

    it("falls back to the owning group's header line for a node with no line", () => {
      const ir = parsedIr();
      const group = ir.groups[0]!;
      const rule = group.rules[0]!;
      const lines = new Map([[group.nodeId, 3]]);
      expect(lineForNode(ir, lines, rule.nodeId)).toBe(3);
      expect(lineForNode(ir, lines, group.nodeId)).toBe(3);
      expect(lineForNode(ir, lines, "no-such-node")).toBeUndefined();
    });

    it("does nothing for an unknown node id", () => {
      useWorkingCopyStore.setState({ ir: parsedIr() });
      render(<KmnCodePane revealNodeId="no-such-node" />);
      expect(editorMocks.revealLineInCenter).not.toHaveBeenCalled();
    });

    it("does not re-scroll on later edits, but does when the id changes", () => {
      const ir = parsedIr();
      useWorkingCopyStore.setState({ ir });
      const [r0, r1] = [ir.groups[0]!.rules[0]!, ir.groups[0]!.rules[1]!];
      const { rerender } = render(<KmnCodePane revealNodeId={r0.nodeId} />);
      act(() => {
        fireEvent.change(screen.getByTestId("mock-editor"), {
          target: { value: editorText() + " " },
        });
      });
      expect(editorMocks.revealLineInCenter).toHaveBeenCalledTimes(1);
      rerender(<KmnCodePane revealNodeId={r1.nodeId} />);
      expect(editorMocks.revealLineInCenter).toHaveBeenCalledTimes(2);
    });
  });
});

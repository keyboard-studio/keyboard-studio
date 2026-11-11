// Component tests for the Mechanical Gallery's Code tab (KmnCodePane.tsx).
//
// Monaco itself is mocked (a textarea stand-in): these tests pin the pane's
// wiring — dirty tracking, Apply, and the null-ir disabled
// state — not Monaco's rendering. The lint pipeline has its own
// pure-module suite.

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  act,
  cleanup,
  fireEvent,
  screen,
  waitFor,
} from "@testing-library/react";
import { render } from "../../test/renderWithI18n.tsx";
import { emitKmn, parseKmn } from "@keyboard-studio/engine";
import type { KeyboardIR } from "@keyboard-studio/contracts";
import { useWorkingCopyStore } from "../../stores/workingCopyStore.ts";
import { installDialogShim } from "../../test/dialogShim.ts";
import { useDecisionStore } from "../../stores/decisionStore.ts";
import { KmnCodePane, lineForNode } from "./KmnCodePane.tsx";
import type { CandidateCompileResult } from "../../lib/compileCandidateKmn.ts";
import type { CodeEdit, KmnEditsValue } from "@keyboard-studio/contracts";

vi.mock("./touchBuilder/monacoSetup.ts", () => ({}));

const compileMock = vi.hoisted(() => ({ fn: vi.fn() }));
vi.mock("../../lib/compileCandidateKmn.ts", () => ({
  compileCandidateKmn: (changes: unknown) => compileMock.fn(changes),
}));

const assignedMock = vi.hoisted(() => ({ fn: vi.fn() }));
vi.mock("../../lib/assignedKeys.ts", () => ({
  loadAssignedKeys: () => assignedMock.fn(),
}));

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

installDialogShim();

beforeEach(() => {
  compileMock.fn.mockReset();
  compileMock.fn.mockResolvedValue({ status: "ok" } satisfies CandidateCompileResult);
  useDecisionStore.getState().reset();
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

describe("KmnCodePane Apply (spec 117 US8)", () => {
  const KMN = [
    "store(&NAME) 'testkbd'",
    "begin Unicode > use(main)",
    "group(main) using keys",
    "+ 'a' > 'b'",
    "+ 'c' > 'd'",
    "",
  ].join("\n");

  const startOf = (): KeyboardIR => parseKmn(KMN, "testkbd").ir;

  function seed(ir: KeyboardIR = startOf(), startIr: KeyboardIR = startOf()): KeyboardIR {
    useWorkingCopyStore.setState({ ir, startIr, undoStack: [], desktopLocked: false });
    return ir;
  }

  const edit = (text: string) =>
    act(() => {
      fireEvent.change(screen.getByTestId("mock-editor"), { target: { value: text } });
    });

  const clickApply = async () => {
    await act(async () => {
      fireEvent.click(applyButton());
    });
  };

  const recorded = (): KmnEditsValue | undefined =>
    useDecisionStore.getState().decisions["kmn-edits"]?.value as KmnEditsValue | undefined;

  const changedRule = () => editorText().replace("+ U+0063 > U+0064", "+ U+0063 > U+0065");

  beforeEach(() => assignedMock.fn.mockResolvedValue([]));

  afterEach(() => {
    useWorkingCopyStore.setState({ startIr: null, undoStack: [] });
  });

  it("a parse error records nothing and leaves the IR unchanged", async () => {
    const ir = seed();
    render(<KmnCodePane />);
    edit("store(&NAME 'unterminated");
    await clickApply();
    expect(useWorkingCopyStore.getState().ir).toBe(ir);
    expect(recorded()).toBeUndefined();
    expect(compileMock.fn).not.toHaveBeenCalled();
  });

  it("a Layer A error records nothing, is shown at its line, and skips the compile", async () => {
    const ir = seed();
    render(<KmnCodePane />);
    edit(`store(&LANGUAGE) 'x'\n${changedRule()}`);
    await clickApply();
    expect(useWorkingCopyStore.getState().ir).toBe(ir);
    expect(recorded()).toBeUndefined();
    expect(screen.getByTestId("kmn-code-apply-error").textContent).toMatch(/Line 1/);
    expect(compileMock.fn).not.toHaveBeenCalled();
  });

  it("a compile error records nothing and is shown at its line", async () => {
    const ir = seed();
    compileMock.fn.mockResolvedValue({
      status: "errors",
      diagnostics: [
        { code: "KM_ERROR_X", severity: "error", layer: "A", message: "bad rule", location: { file: "", line: 5, column: 1 } },
      ],
    } satisfies CandidateCompileResult);
    render(<KmnCodePane />);
    edit(changedRule());
    await clickApply();
    expect(compileMock.fn).toHaveBeenCalledTimes(1);
    expect(useWorkingCopyStore.getState().ir).toBe(ir);
    expect(recorded()).toBeUndefined();
    expect(screen.getByTestId("kmn-code-apply-error").textContent).toMatch(/Line 5: bad rule/);
  });

  it("a change the projection cannot place blocks the Apply: the download would lose it", async () => {
    const ir = seed();
    compileMock.fn.mockResolvedValue({ status: "unplaceable" } satisfies CandidateCompileResult);
    render(<KmnCodePane />);
    edit(changedRule());
    await clickApply();
    expect(useWorkingCopyStore.getState().ir).toBe(ir);
    expect(recorded()).toBeUndefined();
    expect(screen.getByTestId("kmn-code-apply-error").textContent).toMatch(/does not fit/);
  });

  it("a compile service that is wired but fails (no diagnostics) blocks the Apply", async () => {
    const ir = seed();
    compileMock.fn.mockResolvedValue({ status: "errors", diagnostics: [] } satisfies CandidateCompileResult);
    render(<KmnCodePane />);
    edit(changedRule());
    await clickApply();
    expect(useWorkingCopyStore.getState().ir).toBe(ir);
    expect(recorded()).toBeUndefined();
    expect(screen.getByTestId("kmn-code-apply-error").textContent).toMatch(/does not compile/);
  });

  it("an unavailable compile service (mock engine) does not block: Layer A already ran", async () => {
    seed();
    compileMock.fn.mockResolvedValue({ status: "unavailable" } satisfies CandidateCompileResult);
    render(<KmnCodePane />);
    edit(changedRule());
    await clickApply();
    expect(recorded()?.entries).toHaveLength(1);
  });

  it("a formatting-only change records nothing and does not compile", async () => {
    const ir = seed();
    render(<KmnCodePane />);
    edit(editorText().replace("group(main) using keys", "group(main)   using   keys\n\n"));
    await clickApply();
    expect(recorded()).toBeUndefined();
    expect(useWorkingCopyStore.getState().ir).toBe(ir);
    expect(compileMock.fn).not.toHaveBeenCalled();
  });

  it("a formatting-only change records nothing when the IR holds a freestanding comment", async () => {
    const ir = startOf();
    ir.comments.push({ nodeId: "comment#900", text: "", anchor: "freestanding", sourceLine: 1 });
    seed(ir, startOf());
    render(<KmnCodePane />);
    edit(`${editorText()}

`);
    await clickApply();
    expect(recorded()).toBeUndefined();
    expect(compileMock.fn).not.toHaveBeenCalled();
  });

  it("an Apply records one CodeEdit, pushes undo kind c, and never calls setWorkingIR with a re-parsed IR", async () => {
    const ir = seed();
    const setWorkingIR = vi.fn();
    useWorkingCopyStore.setState({ setWorkingIR });
    render(<KmnCodePane />);
    edit(changedRule());
    await clickApply();
    const entries = recorded()?.entries ?? [];
    expect(entries).toHaveLength(1);
    const entry = entries[0] as CodeEdit;
    expect(entry.op).toBe("code-apply");
    expect(entry.overrides).toEqual([]);
    const stack = useWorkingCopyStore.getState().undoStack;
    expect(stack[stack.length - 1]?.k).toBe("c");
    expect(setWorkingIR).not.toHaveBeenCalled();
    const next = useWorkingCopyStore.getState().ir!;
    expect(emitKmn(next)).toContain("+ U+0063 > U+0065");
    // The untouched rule keeps its identity (no wholesale replacement).
    expect(next.groups[0]!.rules[0]!.nodeId).toBe(ir.groups[0]!.rules[0]!.nodeId);
  });

  function seedOverride(): KeyboardIR {
    const start = parseKmn(KMN.replace("+ 'c' > 'd'\n", ""), "testkbd").ir;
    const ir = startOf();
    ir.groups[0]!.rules[1]!.rulesStepAdded = true;
    return seed(ir, start);
  }

  it("an override shows the owner confirm; nothing is recorded until it is confirmed", async () => {
    seedOverride();
    render(<KmnCodePane />);
    edit(changedRule());
    await clickApply();
    expect(screen.getByTestId("kmn-code-owner-confirm").textContent).toMatch(/rules step/);
    expect(recorded()).toBeUndefined();
    await act(async () => {
      fireEvent.click(screen.getByText("Apply anyway"));
    });
    await waitFor(() => expect(recorded()?.entries).toHaveLength(1));
    const entry = recorded()!.entries[0] as CodeEdit;
    expect(entry.overrides.map((o) => o.owner)).toEqual(["rules-step"]);
    const stack = useWorkingCopyStore.getState().undoStack;
    expect(stack[stack.length - 1]?.k).toBe("c");
  });

  it("cancelling the owner confirm records nothing", async () => {
    const ir = seedOverride();
    render(<KmnCodePane />);
    edit(changedRule());
    await clickApply();
    await act(async () => {
      fireEvent.click(screen.getByText("Cancel"));
    });
    expect(recorded()).toBeUndefined();
    expect(useWorkingCopyStore.getState().ir).toBe(ir);
  });

  describe("a key the Assign tab owns (ruling 10)", () => {
    const KEYED = [
      "store(&NAME) 'testkbd'",
      "begin Unicode > use(main)",
      "group(main) using keys",
      "+ [K_G] > 'g'",
      "+ [K_H] > 'h'",
      "",
    ].join("\n");
    const keyedIr = (): KeyboardIR => parseKmn(KEYED, "testkbd").ir;
    const changedG = () => editorText().replace("+ [K_G] > U+0067", "+ [K_G] > U+011D");

    it("anchors the edit by key, names the Assign tab in the confirm, and the gate sees the keystroke", async () => {
      seed(keyedIr(), keyedIr());
      assignedMock.fn.mockResolvedValue([{ vkey: "K_G", modifiers: [] }]);
      compileMock.fn.mockResolvedValue({ status: "ok" } satisfies CandidateCompileResult);
      render(<KmnCodePane />);
      edit(changedG());
      await clickApply();
      const gated = compileMock.fn.mock.calls.at(-1)![0] as Array<{ at: { keystroke?: unknown } }>;
      expect(gated[0]!.at.keystroke).toEqual({ vkey: "K_G", modifiers: [] });
      expect(screen.getByTestId("kmn-code-owner-confirm").textContent).toMatch(/Assign tab/);
      await act(async () => {
        fireEvent.click(screen.getByText("Apply anyway"));
      });
      await waitFor(() => expect(recorded()?.entries).toHaveLength(1));
      const entry = recorded()!.entries[0] as CodeEdit;
      expect(entry.overrides).toContainEqual({ change: 0, owner: "assign-tab" });
    });

    it("does not anchor or flag an edit on a key no assignment claims", async () => {
      seed(keyedIr(), keyedIr());
      assignedMock.fn.mockResolvedValue([{ vkey: "K_H", modifiers: [] }]);
      compileMock.fn.mockResolvedValue({ status: "ok" } satisfies CandidateCompileResult);
      render(<KmnCodePane />);
      edit(changedG());
      await clickApply();
      await waitFor(() => expect(recorded()?.entries).toHaveLength(1));
      const entry = recorded()!.entries[0] as CodeEdit;
      expect(entry.overrides).toEqual([]);
      expect((entry.changes[0] as { at: { keystroke?: unknown } }).at.keystroke).toBeUndefined();
    });
  });

  it("Apply is blocked when the edit adds a raw-Ctrl rule (issue #2359)", () => {
    const ir = makeIR();
    useWorkingCopyStore.setState({ ir });
    render(<KmnCodePane />);
    act(() => {
      fireEvent.change(screen.getByTestId("mock-editor"), {
        target: {
          value: `store(&VERSION) '10.0'\nstore(&NAME) 'testkbd'\n\nbegin Unicode > use(main)\n\ngroup(main) using keys\n\n+ [K_A] > 'a'\n+ [CTRL K_A] > 'é'\n`,
        },
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

 it("Apply still goes through for an edit that keeps a grandfathered raw-Ctrl rule", async () => {
   const ir = parseKmn(
     `store(&VERSION) '10.0'\nstore(&NAME) 'testkbd'\n\nbegin Unicode > use(main)\n\ngroup(main) using keys\n\n+ [CTRL K_A] > 'é'\n+ [K_B] > 'b'\n`,
     "testkbd",
   ).ir;
   seed(ir, ir);
   render(<KmnCodePane />);
   edit(editorText().replace("+ [K_B] > U+0062", "+ [K_B] > U+0063"));
   await clickApply();
   if (screen.queryByTestId("kmn-code-owner-confirm")) {
     await act(async () => {
       fireEvent.click(screen.getByText("Apply anyway"));
     });
   }
   await waitFor(() => expect(recorded()?.entries).toHaveLength(1));
   expect(screen.queryByTestId("kmn-code-apply-error")).toBeNull();
   expect(useWorkingCopyStore.getState().ir).not.toBe(ir);
 });
});

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
  renderHook,
  screen,
  waitFor,
} from "@testing-library/react";
import { render } from "../../test/renderWithI18n.tsx";
import { createVirtualFS, type StartKeyboard } from "@keyboard-studio/contracts";
import { emitKmn, parseKmn } from "@keyboard-studio/engine";
import type { KeyboardIR } from "@keyboard-studio/contracts";
import { useWorkingCopyStore } from "../../stores/workingCopyStore.ts";
import { installDialogShim } from "../../test/dialogShim.ts";
import { useDecisionStore } from "../../stores/decisionStore.ts";
import type { MarksTreatmentValue } from "../../survey/marks/marksValue.ts";
import { KmnCodePane, lineForNode } from "./KmnCodePane.tsx";
import { useWorkingCopyTransform } from "../../hooks/useWorkingCopyTransform.ts";
import { projectWorkingCopyForOutput } from "../../lib/serializeWorkingCopy.ts";
import { getPatternByIdSync } from "../../lib/services.ts";
import type { CandidateCompileResult } from "../../lib/compileCandidateKmn.ts";
import type { CodeEdit, KmnEditsValue } from "@keyboard-studio/contracts";
import { reviewFlags } from "./reviewFlags.ts";

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
  useWorkingCopyStore.getState().recordAssignments([]);
  useDecisionStore.setState({ decisions: {} as never });
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

// A minimal parseable base for projection tests: the pane's canonical text
// comes from the projected VFS .kmn, so the seed file and the parsed startIr
// must agree.
const BASE_KMN =
  "store(&VERSION) '10.0'\n" +
  "store(&NAME) 'Test'\n" +
  "store(&TARGETS) 'any'\n" +
  "begin Unicode > use(main)\n" +
  "\n" +
  "group(main) using keys\n" +
  "+ [K_A] > 'a'\n";

const TEST_KEYBOARD = {
  id: "testkbd",
  path: "release/t/testkbd",
  script: "Latn",
  targets: [],
  displayName: "Test Keyboard",
  version: "1.0",
} as unknown as StartKeyboard;

function seedProjectedBase(): KeyboardIR {
  const ir = parseKmn(BASE_KMN, "testkbd").ir;
  useWorkingCopyStore.setState({
    ir,
    startIr: ir,
    startVfs: createVirtualFS([
      { path: "source/testkbd.kmn", content: BASE_KMN, isBinary: false },
    ]),
    startKeyboard: TEST_KEYBOARD,
  });
  return ir;
}

const CARON = "\u030C";

/** One S-02 deadkey pair (a → ǎ via K_COLON), the engine's caron() shape. */
function recordCaronDeadkey(): void {
  useWorkingCopyStore.getState().recordAssignments([
    {
      scope: "individual",
      target: "ǎ",
      modality: "physical",
      mechanisms: [
        {
          patternId: "deadkey_single_tap",
          strategyId: "S-02",
          slotValues: {
            triggerKey: "K_COLON",
            deadkeyName: "3000",
            baseLetters: "a",
            accentedForms: "ǎ",
            accentChar: ";",
          },
        },
      ],
      source: "user",
    },
  ]);
}

describe("KmnCodePane", () => {
  it("renders the disabled empty state when ir is null", () => {
    useWorkingCopyStore.setState({ ir: null });
    render(<KmnCodePane />);
    expect(screen.getByTestId("kmn-code-pane-empty")).toBeTruthy();
    expect(screen.queryByTestId("mock-editor")).toBeNull();
  });

  it("starts clean: Apply disabled, editor shows the canonical emit (no startVfs fallback)", () => {
    const ir = makeIR();
    useWorkingCopyStore.setState({ ir });
    render(<KmnCodePane />);
    // No startVfs in this test, so the pane falls back to the carve-filtered
    // emit — with no overlay that is emitKmn(ir).
    expect(editorText()).toBe(emitKmn(ir));
    expect(applyButton().disabled).toBe(true);
    expect(screen.queryByTestId("kmn-code-dirty")).toBeNull();
  });

  it("with a startVfs, shows the projected .kmn text, not the emit of the working IR", () => {
    const ir = makeIR();
    const fileText = "c the base file's own text, verbatim\n";
    useWorkingCopyStore.setState({
      ir,
      startIr: ir,
      startVfs: createVirtualFS([
        { path: "source/testkbd.kmn", content: fileText, isBinary: false },
      ]),
      startKeyboard: {
        id: "testkbd",
        path: "release/t/testkbd",
        script: "Latn",
        targets: [],
        displayName: "Test Keyboard",
        version: "1.0",
      } as unknown as StartKeyboard,
    });
    render(<KmnCodePane />);
    // No carve/assignment/identity layers: the projection leaves the file's own text (it only
    // adds the `any` targets store every copy ships), which differs from emitKmn(ir) for this
    // synthetic IR.
    expect(editorText()).toContain(fileText.trim());
    expect(editorText()).toContain("store(&TARGETS) 'any'");
    expect(editorText()).not.toBe(emitKmn(ir));
    expect(applyButton().disabled).toBe(true);
  });

  it("with a startVfs that holds no .kmn, shows the carve-filtered emit instead of going blank", () => {
    const ir = parseKmn(BASE_KMN, "testkbd").ir;
    useWorkingCopyStore.setState({
      ir,
      startIr: ir,
      startVfs: createVirtualFS([
        // A VFS with no .kmn entry at all: findKmnPath finds nothing, so
        // the projected text is null and the carve floor applies.
        { path: "source/testkbd.kvks", content: "not a kmn", isBinary: false },
      ]),
      startKeyboard: TEST_KEYBOARD,
    });
    render(<KmnCodePane />);
    // No carve overlay: the carve floor is emitKmn(ir).
    expect(editorText()).toBe(emitKmn(ir));
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
    "store(&TARGETS) 'any'",
    "begin Unicode > use(main)",
    "group(main) using keys",
    "+ 'a' > 'b'",
    "+ 'c' > 'd'",
    "",
  ].join("\n");

  const startOf = (): KeyboardIR => parseKmn(KMN, "testkbd").ir;

  // Copy: the pane shows the built keyboard, so each test seeds a startVfs holding the starting
  // point's text (`vfsKmn`, default the same keyboard) beside the working IR and startIr.
  function seed(
    ir: KeyboardIR = startOf(),
    startIr: KeyboardIR = startOf(),
    vfsKmn: string = KMN,
  ): KeyboardIR {
    useWorkingCopyStore.setState({
      ir,
      startIr,
      startVfs: createVirtualFS([{ path: "source/testkbd.kmn", content: vfsKmn, isBinary: false }]),
      startKeyboard: TEST_KEYBOARD,
      undoStack: [],
      desktopLocked: false,
    });
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

  // The built text is the file's own (raw `'c' > 'd'`) until a step re-emits it (`U+0063 > U+0064`).
  const changedRule = () => editorText().replace(/(\+ (?:U\+0063|'c') > )(?:U\+0064|'d')/, "$1'e'");

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

  it("a formatting-only change records nothing when the built text holds a freestanding comment", async () => {
    // The diff base is the parse of the text on screen, so a comment the parser reads one way is
    // read the same way on both sides (this replaces the base-is-the-working-IR variant).
    const withComment = KMN.replace("group(main) using keys", "c note\n\ngroup(main) using keys");
    seed(parseKmn(withComment, "testkbd").ir, parseKmn(withComment, "testkbd").ir, withComment);
    render(<KmnCodePane />);
    expect(editorText()).toBe(withComment);
    edit(`${editorText()}

`);
    await clickApply();
    expect(recorded()).toBeUndefined();
    expect(compileMock.fn).not.toHaveBeenCalled();
    expect(screen.queryByTestId("kmn-code-dirty")).toBeNull();
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
    const startKmn = KMN.replace("+ 'c' > 'd'\n", "");
    const start = parseKmn(startKmn, "testkbd").ir;
    const ir = startOf();
    ir.groups[0]!.rules[1]!.rulesStepAdded = true;
    // The rules step's rule reaches the built text through the projection's rule additions.
    return seed(ir, start, startKmn);
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
      "store(&TARGETS) 'any'",
      "begin Unicode > use(main)",
      "group(main) using keys",
      "+ [K_G] > 'g'",
      "+ [K_H] > 'h'",
      "",
    ].join("\n");
    const keyedIr = (): KeyboardIR => parseKmn(KEYED, "testkbd").ir;
    const changedG = () => editorText().replace("+ [K_G] > 'g'", "+ [K_G] > U+011D");

    it("anchors the edit by key, names the Assign tab in the confirm, and the gate sees the keystroke", async () => {
      seed(keyedIr(), keyedIr(), KEYED);
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
      seed(keyedIr(), keyedIr(), KEYED);
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
    const kmn = `store(&VERSION) '10.0'\nstore(&NAME) 'testkbd'\nstore(&TARGETS) 'any'\n\nbegin Unicode > use(main)\n\ngroup(main) using keys\n\n+ [CTRL K_A] > 'é'\n+ [K_B] > 'b'\n`;
    const ir = parseKmn(kmn, "testkbd").ir;
    seed(ir, ir, kmn);
    render(<KmnCodePane />);
    edit(editorText().replace("+ [K_B] > 'b'", "+ [K_B] > 'c'"));
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

describe("KmnCodePane built view (Copy)", () => {
  describe("recorded assignments in the projected text", () => {
    it("shows a recorded mechanism assignment's rule through the real projection", () => {
      const ir = seedProjectedBase();
      render(<KmnCodePane />);
      // Grounding: before any assignment the pane shows the base file text.
      expect(editorText()).toBe(BASE_KMN);
      act(() => {
        useWorkingCopyStore.getState().recordAssignments([
          {
            scope: "individual",
            target: "ŋ",
            modality: "physical",
            mechanisms: [
              {
                patternId: "simple_swap",
                strategyId: "S-01",
                slotValues: { kmnRules: "+ [K_N] > U+014B" },
              },
            ],
            source: "user",
          },
        ]);
      });
      expect(editorText()).toContain("+ [K_N] > U+014B");
      expect(editorText()).not.toBe(emitKmn(ir));
      // The projection clones the VFS: the base file itself is untouched.
      expect(
        useWorkingCopyStore.getState().startVfs?.get("source/testkbd.kmn")
          ?.content,
      ).toBe(BASE_KMN);
    });

    it("without a recorded output form, a deadkey assignment shows its precomposed pair", () => {
      seedProjectedBase();
      act(() => {
        recordCaronDeadkey();
      });
      render(<KmnCodePane />);
      expect(editorText()).toMatch(/store\(dk_3000_output\)\s+'ǎ'/);
      expect(editorText()).not.toContain("index(dk_3000_bases, 2)");
    });

    it("with base-plus-mark recorded, the same deadkey shows the NFD seam shape", () => {
      seedProjectedBase();
      const marksTreatment: MarksTreatmentValue = {
        answers: {},
        completion: {
          worklist: {
            ownLetterUnits: ["a"],
            markUnits: [{ mark: CARON, inputOrder: "postfix" }],
            blockedCombinations: [],
          },
          outputForm: "base-plus-mark",
        },
        contextTolerance: null,
      };
      act(() => {
        useDecisionStore.setState({
          decisions: {
            "marks-treatment": {
              id: "marks-treatment",
              value: marksTreatment,
            } as never,
          },
        });
        recordCaronDeadkey();
      });
      render(<KmnCodePane />);
      // The NFD seam shape — reachable only because the pane preloads
      // OUTPUT_FORM_SEAM_PATTERN_IDS (deadkey_single_tap_nfd) into the
      // projection's pattern map alongside the recorded assignment's own id.
      // The pane shows the projection's re-emitted .kmn, so stores use
      // single-space alignment and the mark is written as U+030C (unlike
      // the raw fragment text applyAssignments returns at engine level).
      expect(editorText()).toContain("store(dk_3000_bases) 'a'");
      expect(editorText()).toContain(
        "dk(3000) + any(dk_3000_bases) > index(dk_3000_bases, 2) U+030C",
      );
      expect(editorText()).not.toContain("dk_3000_output");
    });
  });

  describe("Apply and dirty drafts on the projected text", () => {
    const recorded = (): KmnEditsValue | undefined =>
      useDecisionStore.getState().decisions["kmn-edits"]?.value as KmnEditsValue | undefined;

    beforeEach(() => {
      assignedMock.fn.mockResolvedValue([]);
      useWorkingCopyStore.setState({ undoStack: [], desktopLocked: false });
    });

    it("Apply of a real edit records a kept edit, and the built text then shows it (the edit stays visible)", async () => {
      const ir = seedProjectedBase();
      render(<KmnCodePane />);
      expect(editorText()).toBe(BASE_KMN);
      act(() => {
        fireEvent.change(screen.getByTestId("mock-editor"), {
          target: { value: BASE_KMN.replace("+ [K_A] > 'a'", "+ [K_A] > 'b'") },
        });
      });
      await act(async () => {
        fireEvent.click(applyButton());
      });
      expect(recorded()?.entries).toHaveLength(1);
      const next = useWorkingCopyStore.getState().ir;
      expect(next).not.toBe(ir);
      // The emitter writes the 'b' output as its U+ codepoint.
      expect(emitKmn(next!)).toContain("+ [K_A] > U+0062");
      // The canonical moved because the edit is now in the build: the editor shows the built text
      // (re-emitted by the replay), not a draft the build ignores, and nothing is left unapplied.
      await waitFor(() => expect(editorText()).toContain("+ [K_A] > U+0062"));
      expect(screen.queryByTestId("kmn-code-dirty")).toBeNull();
      expect(applyButton().disabled).toBe(true);
    });

    it("a formatting-only Apply records nothing, clears the dirty badge and keeps the draft", async () => {
      seedProjectedBase();
      render(<KmnCodePane />);
      expect(editorText()).toBe(BASE_KMN);
      const draft = BASE_KMN + "\n";
      act(() => {
        fireEvent.change(screen.getByTestId("mock-editor"), {
          target: { value: draft },
        });
      });
      expect(screen.getByTestId("kmn-code-dirty")).toBeTruthy();
      await act(async () => {
        fireEvent.click(applyButton());
      });
      expect(recorded()).toBeUndefined();
      expect(editorText()).toBe(draft);
      expect(screen.queryByTestId("kmn-code-dirty")).toBeNull();
      expect(applyButton().disabled).toBe(true);
    });

    it("an Apply does not leave a stale flag that wipes a later dirty draft", async () => {
      seedProjectedBase();
      render(<KmnCodePane />);
      act(() => {
        fireEvent.change(screen.getByTestId("mock-editor"), {
          target: { value: BASE_KMN.replace("+ [K_A] > 'a'", "+ [K_A] > 'b'") },
        });
      });
      await act(async () => {
        fireEvent.click(applyButton());
      });
      await waitFor(() => expect(screen.queryByTestId("kmn-code-dirty")).toBeNull());
      const draft = editorText() + "\n+ [K_C] > 'c'\n";
      act(() => {
        fireEvent.change(screen.getByTestId("mock-editor"), { target: { value: draft } });
      });
      // A change to the built text (an assignment) while the draft is dirty must not snap it.
      act(() => {
        useWorkingCopyStore.getState().recordAssignments([
          {
            scope: "individual",
            target: "ŋ",
            modality: "physical",
            mechanisms: [
              { patternId: "simple_swap", strategyId: "S-01", slotValues: { kmnRules: "+ [K_N] > U+014B" } },
            ],
            source: "user",
          },
        ]);
      });
      expect(editorText()).toBe(draft);
      expect(screen.getByTestId("kmn-code-dirty")).toBeTruthy();
    });

    it("a dirty draft survives a recorded assignment instead of snapping to the new canonical", () => {
      seedProjectedBase();
      render(<KmnCodePane />);
      expect(editorText()).toBe(BASE_KMN);
      const draft = editorText() + "\n";
      act(() => {
        fireEvent.change(screen.getByTestId("mock-editor"), {
          target: { value: draft },
        });
      });
      expect(screen.getByTestId("kmn-code-dirty")).toBeTruthy();
      // Recording an assignment changes the canonical (the ŋ rule arrives
      // via the projection) — the dirty draft must stay put.
      act(() => {
        useWorkingCopyStore.getState().recordAssignments([
          {
            scope: "individual",
            target: "ŋ",
            modality: "physical",
            mechanisms: [
              {
                patternId: "simple_swap",
                strategyId: "S-01",
                slotValues: { kmnRules: "+ [K_N] > U+014B" },
              },
            ],
            source: "user",
          },
        ]);
      });
      expect(editorText()).toBe(draft);
      expect(editorText()).not.toContain("+ [K_N] > U+014B");
      expect(screen.getByTestId("kmn-code-dirty")).toBeTruthy();
    });
  });
});

// Owner ruling 2026-11-13, "built view plus kept edits" (research R15): on Copy the Code tab shows
// the keyboard as it will be built, and Apply records the difference from that view as a kept
// `kmn-edits` entry, so the tab, the preview and the download agree.
describe("KmnCodePane built view plus kept edits", () => {
  const norm = (text: string): string => emitKmn(parseKmn(text, "testkbd").ir);
  const recorded = (): KmnEditsValue | undefined =>
    useDecisionStore.getState().decisions["kmn-edits"]?.value as KmnEditsValue | undefined;
  const edit = (text: string) =>
    act(() => {
      fireEvent.change(screen.getByTestId("mock-editor"), { target: { value: text } });
    });
  const clickApply = async () => {
    await act(async () => {
      fireEvent.click(applyButton());
    });
  };
  const confirmIfAsked = async () => {
    if (screen.queryByTestId("kmn-code-owner-confirm") !== null) {
      await act(async () => {
        fireEvent.click(screen.getByText("Apply anyway"));
      });
    }
  };
  const assign = (target: string, rules: string) =>
    act(() => {
      useWorkingCopyStore.getState().recordAssignments([
        {
          scope: "individual",
          target,
          modality: "physical",
          mechanisms: [{ patternId: "simple_swap", strategyId: "S-01", slotValues: { kmnRules: rules } }],
          source: "user",
        },
      ]);
    });

  beforeEach(() => {
    assignedMock.fn.mockResolvedValue([]);
    seedProjectedBase();
    useWorkingCopyStore.setState({ undoStack: [], desktopLocked: false });
  });

  // The version-stamp lines are the only ones the routes may differ on.
  const stripStamps = (text: string): string =>
    text
      .split("\n")
      .filter((l) => !/VERSION|COPYRIGHT/i.test(l))
      .join("\n");

  /** The preview route: the OSK preview's transform over a clone of the starting VFS. */
  function previewKmn(): string {
    const startVfs = useWorkingCopyStore.getState().startVfs!;
    const simpleSwap = getPatternByIdSync("simple_swap");
    const { result } = renderHook(() =>
      useWorkingCopyTransform({
        previewedStartId: "testkbd",
        patternMap: new Map(simpleSwap === undefined ? [] : [["simple_swap", simpleSwap]]),
      }),
    );
    const vfs = createVirtualFS(startVfs.entries());
    result.current!(vfs, "testkbd");
    return vfs.get("source/testkbd.kmn")!.content as string;
  }

  /** The download route: the output projection the zip and the pull request read. */
  async function downloadKmn(): Promise<string> {
    const projected = await projectWorkingCopyForOutput();
    expect(projected).not.toBeNull();
    const entry = [...projected!.vfs.entries()].find((e) => e.path.startsWith("source/") && e.path.endsWith(".kmn"));
    return entry!.content as string;
  }

  /** Apply `applied`, then prove the pane, the preview and the download all hold exactly that text. */
  async function applyAndExpectBuilt(applied: string): Promise<void> {
    render(<KmnCodePane />);
    edit(applied);
    await clickApply();
    await confirmIfAsked();
    await waitFor(() => expect(recorded()?.entries).toHaveLength(1));
    // The pane's own (re-)projection after the recorded entry is the text the author applied.
    await waitFor(() => expect(norm(editorText())).toBe(norm(applied)));
    expect(screen.queryByTestId("kmn-code-dirty")).toBeNull();
    const pane = editorText();
    // A fresh pane, projecting from the stores alone (a rebuild), shows the same text.
    cleanup();
    render(<KmnCodePane />);
    expect(norm(editorText())).toBe(norm(applied));
    cleanup();
    // The preview and the download agree with the pane and with each other.
    const preview = previewKmn();
    const download = await downloadKmn();
    expect(stripStamps(norm(preview))).toBe(stripStamps(norm(download)));
    expect(stripStamps(norm(pane))).toBe(stripStamps(norm(download)));
    expect(stripStamps(norm(applied))).toBe(stripStamps(norm(download)));
    render(<KmnCodePane />);
  }

  it("an edit to a starting-point rule: record, rebuild, and the projection is the applied text", async () => {
    await applyAndExpectBuilt(BASE_KMN.replace("+ [K_A] > 'a'", "+ [K_A] > 'b'"));
  });

  it("an added rule and a removed rule: the projection is the applied text", async () => {
    await applyAndExpectBuilt(BASE_KMN.replace("+ [K_A] > 'a'\n", "+ [K_B] > 'b'\n"));
  });

  it("an edit to an Assign-tab rule: the projection is the applied text and the live IR is not refused", async () => {
    assign("ŋ", "+ [K_N] > U+014B");
    const before = emitKmn(useWorkingCopyStore.getState().ir!);
    render(<KmnCodePane />);
    expect(editorText()).toContain("+ [K_N] > U+014B");
    const applied = editorText().replace("+ [K_N] > U+014B", "+ [K_N] > U+014A");
    cleanup();
    await applyAndExpectBuilt(applied);
    expect(editorText()).not.toContain("U+014B");
    // The working IR holds no assignment rule, so the change could not anchor there: it is
    // skipped live, not refused, and the recorded entry carries it.
    expect(emitKmn(useWorkingCopyStore.getState().ir!)).toBe(before);
  });

  it("a second Apply with no further typing records nothing; formatting-only typing records nothing", async () => {
    await applyAndExpectBuilt(BASE_KMN.replace("+ [K_A] > 'a'", "+ [K_A] > 'b'"));
    cleanup();
    render(<KmnCodePane />);
    expect(applyButton().disabled).toBe(true);
    edit(editorText().replace("group(main) using keys", "group(main)   using   keys\n\n"));
    await clickApply();
    expect(recorded()?.entries).toHaveLength(1);
    expect(screen.queryByTestId("kmn-code-dirty")).toBeNull();
    expect(compileMock.fn).toHaveBeenCalledTimes(1);
  });

  describe("a key the Assign tab owns", () => {
    it("the most recent edit wins: the edit is keyed to the keystroke, so it survives a re-assignment", async () => {
      assign("ā", "+ [K_A] > U+0101");
      assignedMock.fn.mockResolvedValue([{ vkey: "K_A", modifiers: [] }]);
      cleanup();
      render(<KmnCodePane />);
      // The assignment's rule replaced the starting rule on K_A in the built text.
      expect(editorText()).toContain("+ [K_A] > U+0101");
      expect(editorText()).not.toContain("+ [K_A] > 'a'");
      edit(editorText().replace("+ [K_A] > U+0101", "+ [K_A] > U+0102"));
      await clickApply();
      expect(screen.getByTestId("kmn-code-owner-confirm").textContent).toMatch(/Assign tab/);
      await confirmIfAsked();
      await waitFor(() => expect(recorded()?.entries).toHaveLength(1));
      const entry = recorded()!.entries[0] as CodeEdit;
      expect(entry.overrides).toContainEqual({ change: 0, owner: "assign-tab" });
      await waitFor(() => expect(editorText()).toContain("+ [K_A] > U+0102"));
      // Re-assign the key with a different output: the edit, keyed to K_A, still wins.
      assign("ā", "+ [K_A] > U+0103");
      await waitFor(() => expect(editorText()).toContain("+ [K_A] > U+0102"));
      expect(editorText()).not.toContain("U+0103");
    });
  });

  describe("rules made by a build step after the kmn-edits replay", () => {
    const CASED = [
      "store(&VERSION) '10.0'",
      "store(&NAME) 'Test'",
      "store(&TARGETS) 'any'",
      "begin Unicode > use(main)",
      "",
      "group(main) using keys",
      "+ [K_A] > 'a'",
      "+ [SHIFT K_A] > 'A'",
      "+ [K_B] > 'b'",
      "",
    ].join("\n");

    function seedCased(): void {
      const ir = parseKmn(CASED, "testkbd").ir;
      useWorkingCopyStore.setState({
        ir,
        startIr: ir,
        startVfs: createVirtualFS([{ path: "source/testkbd.kmn", content: CASED, isBinary: false }]),
      });
      useDecisionStore.getState().recordAll([
        { id: "character-inventory", value: { chars: ["a", "A", "b"] }, provenance: "asked" },
        { id: "caps-handling", value: { mode: "cased-keys" }, provenance: "default" },
      ] as never);
      cleanup();
      render(<KmnCodePane />);
    }

    /**
     * The owner ruling of 2026-11-13: generated rules are ordinary text by the time the author edits.
     * Apply asks the owner confirm naming the step, records ONE entry, and the pane, the preview and
     * the download all hold the edit; the entry is flagged for review.
     */
    async function applyGeneratedEdit(applied: string, step: RegExp, needle: string): Promise<void> {
      edit(applied);
      await clickApply();
      expect(screen.queryByTestId("kmn-code-apply-error")).toBeNull();
      expect(screen.getByTestId("kmn-code-owner-confirm").textContent).toMatch(step);
      expect(recorded()).toBeUndefined();
      await confirmIfAsked();
      await waitFor(() => expect(recorded()?.entries).toHaveLength(1));
      await waitFor(() => expect(editorText()).toContain(needle));
      expect(screen.queryByTestId("kmn-code-dirty")).toBeNull();
      const pane = editorText();
      cleanup();
      const preview = previewKmn();
      const download = await downloadKmn();
      expect(preview).toContain(needle);
      expect(download).toContain(needle);
      expect(stripStamps(norm(pane))).toBe(stripStamps(norm(download)));
      expect(stripStamps(norm(preview))).toBe(stripStamps(norm(download)));
      const flags = reviewFlags(recorded(), [], useWorkingCopyStore.getState().ir);
      expect(flags).toContainEqual(expect.objectContaining({ kind: "overrode", seq: 1 }));
      // The flag names the generating step, not the generic "another step".
      expect(flags.some((f) => f.kind === "overrode" && f.steps.length === 1)).toBe(true);
      render(<KmnCodePane />);
    }

    function seedCapsRewritten(): void {
      // The caps step rewrites these four rules into the two the pane shows.
      const kmn = CASED.replace(
        "+ [K_A] > 'a'\n+ [SHIFT K_A] > 'A'\n",
        "+ [NCAPS K_A] > 'a'\n+ [NCAPS SHIFT K_A] > 'A'\n+ [CAPS K_A] > 'A'\n+ [CAPS SHIFT K_A] > 'a'\n",
      );
      const ir = parseKmn(kmn, "testkbd").ir;
      useWorkingCopyStore.setState({
        ir,
        startIr: ir,
        startVfs: createVirtualFS([{ path: "source/testkbd.kmn", content: kmn, isBinary: false }]),
      });
      useDecisionStore.getState().recordAll([
        { id: "character-inventory", value: { chars: ["a", "A", "b"] }, provenance: "asked" },
        { id: "caps-handling", value: { mode: "cased-keys" }, provenance: "default" },
      ] as never);
      cleanup();
      render(<KmnCodePane />);
    }

    it("an edit to a rule the caps step generated is kept: the confirm names the step, and the build holds the edit", async () => {
      seedCapsRewritten();
      expect(editorText()).toContain("+ [K_A] > U+0061");
      expect(editorText()).not.toContain("NCAPS");
      await applyGeneratedEdit(editorText().replace("+ [K_A] > U+0061", "+ [K_A] > U+0078"), /caps handling choice/, "+ [K_A] > U+0078");
    });

    it("an edit to the caps store the caps step wrote is kept the same way", async () => {
      seedCased();
      expect(editorText()).toContain("store(&CasedKeys)");
      await applyGeneratedEdit(
        editorText().replace(/store\(&CasedKeys\) .*/, "store(&CasedKeys) [K_A K_B]"),
        /caps handling choice/,
        "store(&CasedKeys) [K_A K_B]",
      );
    });

    it("an edit to an ordinary rule is still recorded when a later step is active, and the other step's output stays", async () => {
      seedCased();
      edit(editorText().replace("+ [K_B] > U+0062", "+ [K_B] > U+0063"));
      await clickApply();
      await waitFor(() => expect(recorded()?.entries).toHaveLength(1));
      await waitFor(() => expect(editorText()).toContain("+ [K_B] > U+0063"));
      expect(editorText()).toContain("store(&CasedKeys)");
    });

    it("an NCAPS rule the caps step would rewrite is kept as written: the edit replays after the step", async () => {
      seedCased();
      edit(editorText().replace("+ [K_A] > U+0061", "+ [K_A] > U+0061\n+ [NCAPS K_A] > U+0078"));
      await clickApply();
      await waitFor(() => expect(recorded()?.entries).toHaveLength(1));
      expect(screen.queryByTestId("kmn-code-apply-error")).toBeNull();
      await waitFor(() => expect(editorText()).toContain("+ [NCAPS K_A] > U+0078"));
      expect(useWorkingCopyStore.getState().undoStack).toHaveLength(1);
    });

    describe("a mark-guard rule", () => {
      const ACUTE = "\u0301";
      const MARKS_KMN =
        "store(&VERSION) '10.0'\nstore(&NAME) 'Test'\nstore(&TARGETS) 'any'\nbegin Unicode > use(main)\n\n" +
        "group(main) using keys\n+ [K_A] > 'a'\n+ [K_5] > U+0301\n";

      function seedGuarded(): void {
        const ir = parseKmn(MARKS_KMN, "testkbd").ir;
        useWorkingCopyStore.setState({
          ir,
          startIr: ir,
          startVfs: createVirtualFS([{ path: "source/testkbd.kmn", content: MARKS_KMN, isBinary: false }]),
        });
        const value: MarksTreatmentValue = {
          answers: {},
          completion: {
            worklist: {
              ownLetterUnits: ["a", "k"],
              markUnits: [{ mark: ACUTE, inputOrder: "postfix" }],
              blockedCombinations: [{ base: "k", mark: ACUTE }],
            },
            outputForm: "base-plus-mark",
          },
          contextTolerance: null,
        };
        useDecisionStore.setState({
          decisions: { "marks-treatment": { id: "marks-treatment", value } as never },
        });
        cleanup();
        render(<KmnCodePane />);
      }

      it("an edit to the guard the marks step writes is kept: the confirm names the step, and the build holds it", async () => {
        seedGuarded();
        expect(editorText()).toContain("nul U+0301 > nul");
        await applyGeneratedEdit(editorText().replace("nul U+0301 > nul", "nul U+0301 > U+0041"), /marks step/, "nul U+0301 > U+0041");
      });
    });

    describe("a context-tolerance rule", () => {
      const TOL_KMN =
        "store(&VERSION) '10.0'\nstore(&NAME) 'Test'\nstore(&TARGETS) 'any'\nbegin Unicode > use(main)\n\n" +
        "group(main) using keys\nU+00E0 + ']' > U+00E2\n+ ']' > U+00B4\n";

      it("an edit to a rule the tolerance fix adds is kept: the confirm names the step, and the build holds it", async () => {
        const ir = parseKmn(TOL_KMN, "testkbd").ir;
        useWorkingCopyStore.setState({
          ir,
          startIr: ir,
          startVfs: createVirtualFS([{ path: "source/testkbd.kmn", content: TOL_KMN, isBinary: false }]),
        });
        useWorkingCopyStore.getState().setContextToleranceOverlay({
          fingerprint: "f1",
          acceptedSiteIds: ["site-1"],
          overlay: {
            batches: [
              {
                siteKey: "site-1",
                groupName: "main",
                beforeRuleText: "+ U+005D > U+00B4",
                comment: "Accept the decomposed form too.",
                rules: [
                  {
                    nodeId: "decomposed_accent_r1_0",
                    context: [
                      { kind: "char", value: "a" },
                      { kind: "char", value: "\u0300" },
                      { kind: "raw", text: "+" },
                      { kind: "char", value: "]" },
                    ],
                    output: [{ kind: "char", value: "\u00E2" }],
                  },
                ],
              },
            ],
          },
        });
        cleanup();
        render(<KmnCodePane />);
        expect(editorText()).toContain("Accept the decomposed form too.");
        const added = editorText().split("\n").find((l) => l.includes("U+0300") && l.includes("+"))!;
        expect(added).toBeDefined();
        const edited = added.replace(/> .*$/, "> U+0041");
        try {
          await applyGeneratedEdit(editorText().replace(added, edited), /context-tolerance/, edited.trim());
        } finally {
          useWorkingCopyStore.getState().setContextToleranceOverlay(null);
        }
      });
    });

    describe("the header", () => {
      it("an edit to &TARGETS is refused, naming that rule: the build forces it to any", async () => {
        seedCased();
        edit(editorText().replace("store(&TARGETS) 'any'", "store(&TARGETS) 'windows'"));
        await clickApply();
        expect(recorded()).toBeUndefined();
        expect(compileMock.fn).not.toHaveBeenCalled();
        expect(screen.getByTestId("kmn-code-apply-error").textContent).toMatch(/&TARGETS/);
      });

      it("an edit to the &NAME the identity step wrote reaches the identity confirm, not the late-rule refusal", async () => {
        seedCased();
        useWorkingCopyStore.getState().setIdentity({ displayName: "My Keyboard" } as never);
        cleanup();
        render(<KmnCodePane />);
        expect(editorText()).toContain("My Keyboard");
        edit(editorText().replace("My Keyboard", "Other Name"));
        await clickApply();
        expect(screen.queryByTestId("kmn-code-apply-error")).toBeNull();
        expect(screen.getByTestId("kmn-code-owner-confirm").textContent).toMatch(/keyboard identity/);
        useWorkingCopyStore.getState().setIdentity(null as never);
      });
    });

    it("an Apply that changes &TARGETS and an ordinary rule records neither (all or nothing)", async () => {
      seedCased();
      edit(
        editorText()
          .replace("store(&TARGETS) 'any'", "store(&TARGETS) 'windows'")
          .replace("+ [K_B] > U+0062", "+ [K_B] > U+0063"),
      );
      await clickApply();
      expect(recorded()).toBeUndefined();
      expect(compileMock.fn).not.toHaveBeenCalled();
      expect(screen.getByTestId("kmn-code-apply-error").textContent).toMatch(/&TARGETS/);
    });

    it("a generated-rule edit that does not compile is rejected by the compile gate and records nothing", async () => {
      seedCapsRewritten();
      compileMock.fn.mockResolvedValue({
        status: "errors",
        diagnostics: [{ severity: "error", code: "KM0XX", message: "boom", line: 9 }],
      } as never);
      edit(editorText().replace("+ [K_A] > U+0061", "+ [K_A] > U+0078"));
      await clickApply();
      expect(compileMock.fn).toHaveBeenCalledTimes(1);
      expect(recorded()).toBeUndefined();
      expect(screen.getByTestId("kmn-code-apply-error")).toBeTruthy();
      expect(useWorkingCopyStore.getState().undoStack).toHaveLength(0);
    });

    it("after a kept edit to a generated rule, a later assignment that changes the generated rules leaves the edit unplaced: flagged, nothing crashes", async () => {
      seedCapsRewritten();
      await applyGeneratedEdit(editorText().replace("+ [K_A] > U+0061", "+ [K_A] > U+0078"), /caps handling choice/, "+ [K_A] > U+0078");
      // An assignment on K_A takes the key: step 2 drops the starting rules there, so the caps step
      // has nothing to rewrite and the entry's anchor (the caps-made rule) is gone.
      assign("ā", "+ [K_A] > U+0101");
      const projected = await projectWorkingCopyForOutput();
      expect(projected).not.toBeNull();
      const missWarning = projected!.warnings.find((w) => /layout edit 1 skipped/.test(w));
      expect(missWarning).toBeDefined();
      const text = [...projected!.vfs.entries()].find((e) => e.path.startsWith("source/") && e.path.endsWith(".kmn"))!.content as string;
      // The rest of the build is intact: the assignment, the other rules, the caps store.
      expect(text).toContain("U+0101");
      expect(text).toContain("[K_B]");
      const misses = [...projected!.warnings.flatMap((w) => {
        const m = /layout edit (\d+) skipped: (.*)$/.exec(w);
        return m?.[1] !== undefined && m[2] !== undefined ? [{ seq: Number(m[1]), reason: m[2] }] : [];
      })];
      expect(reviewFlags(recorded(), misses, useWorkingCopyStore.getState().ir)).toContainEqual(
        expect.objectContaining({ kind: "missed", seq: 1 }),
      );
    });
  });

  describe("view in code on the built text", () => {
    it("reveals the line of the rule in the projected text, which an assignment has shifted", () => {
      assign("ŋ", "+ [K_N] > U+014B\n+ [K_M] > U+0271");
      const ir = useWorkingCopyStore.getState().ir!;
      const rule = ir.groups.find((g) => g.name === "main")!.rules[0]!;
      cleanup();
      render(<KmnCodePane revealNodeId={rule.nodeId} />);
      const lines = editorText().split("\n");
      const line = lines.findIndex((l) => l.includes("[K_A]")) + 1;
      expect(line).toBeGreaterThan(0);
      expect(editorMocks.revealLineInCenter).toHaveBeenCalledWith(line);
    });
  });
});

describe("KmnCodePane Apply guards and drafts", () => {
  const edit = (text: string) =>
    act(() => {
      fireEvent.change(screen.getByTestId("mock-editor"), { target: { value: text } });
    });
  const recorded = (): KmnEditsValue | undefined =>
    useDecisionStore.getState().decisions["kmn-edits"]?.value as KmnEditsValue | undefined;
  const assign = (target: string, rules: string) =>
    act(() => {
      useWorkingCopyStore.getState().recordAssignments([
        {
          scope: "individual",
          target,
          modality: "physical",
          mechanisms: [{ patternId: "simple_swap", strategyId: "S-01", slotValues: { kmnRules: rules } }],
          source: "user",
        },
      ]);
    });

  beforeEach(() => {
    assignedMock.fn.mockResolvedValue([]);
    seedProjectedBase();
    useWorkingCopyStore.setState({ undoStack: [], desktopLocked: false });
  });

  it("a double click starts one Apply: one compile, one entry, no 'changed while Apply was running'", async () => {
    render(<KmnCodePane />);
    edit(BASE_KMN.replace("+ [K_A] > 'a'", "+ [K_A] > 'b'"));
    await act(async () => {
      fireEvent.click(applyButton());
      fireEvent.click(applyButton());
    });
    await waitFor(() => expect(recorded()?.entries).toHaveLength(1));
    expect(compileMock.fn).toHaveBeenCalledTimes(1);
    expect(screen.queryByTestId("kmn-code-apply-error")).toBeNull();
    expect(useWorkingCopyStore.getState().undoStack).toHaveLength(1);
  });

  it("an Apply is possible again after the first one finished", async () => {
    render(<KmnCodePane />);
    edit(BASE_KMN.replace("+ [K_A] > 'a'", "+ [K_A] > 'b'"));
    await act(async () => {
      fireEvent.click(applyButton());
    });
    await waitFor(() => expect(recorded()?.entries).toHaveLength(1));
    await waitFor(() => expect(screen.queryByTestId("kmn-code-dirty")).toBeNull());
    edit(editorText().replace("+ [K_A] > U+0062", "+ [K_A] > U+0063"));
    await act(async () => {
      fireEvent.click(applyButton());
    });
    // The rule is the earlier edit's, so the owner confirm asks first.
    await act(async () => {
      fireEvent.click(screen.getByText("Apply anyway"));
    });
    await waitFor(() => expect(recorded()?.entries).toHaveLength(2));
  });

  describe("a dirty draft whose build changed underneath it", () => {
    it("refuses to apply, keeps the draft, and offers to reload the current text", async () => {
      render(<KmnCodePane />);
      const draft = BASE_KMN.replace("+ [K_A] > 'a'", "+ [K_A] > 'b'");
      edit(draft);
      assign("ŋ", "+ [K_N] > U+014B");
      expect(screen.getByTestId("kmn-code-draft-stale")).toBeTruthy();
      await act(async () => {
        fireEvent.click(applyButton());
      });
      expect(recorded()).toBeUndefined();
      expect(compileMock.fn).not.toHaveBeenCalled();
      expect(screen.getByTestId("kmn-code-apply-error").textContent).toMatch(/changed underneath your draft/);
      // The draft is still there.
      expect(editorText()).toBe(draft);
      await act(async () => {
        fireEvent.click(screen.getByTestId("kmn-code-reload"));
      });
      expect(editorText()).toContain("+ [K_N] > U+014B");
      expect(screen.queryByTestId("kmn-code-dirty")).toBeNull();
      expect(screen.queryByTestId("kmn-code-draft-stale")).toBeNull();
    });
  });

  describe("view in code", () => {
    it("says so when the built keyboard has no line for the rule (an assignment replaced it)", () => {
      const rule = useWorkingCopyStore.getState().ir!.groups.find((g) => g.name === "main")!.rules[0]!;
      assign("ā", "+ [K_A] > U+0101");
      cleanup();
      render(<KmnCodePane revealNodeId={rule.nodeId} />);
      expect(editorText()).not.toContain("+ [K_A] > 'a'");
      expect(screen.getByTestId("kmn-code-reveal-missing")).toBeTruthy();
    });
  });
});

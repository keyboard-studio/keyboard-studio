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
import { createVirtualFS, type StartKeyboard } from "@keyboard-studio/contracts";
import { emitKmn, parseKmn } from "@keyboard-studio/engine";
import type { KeyboardIR } from "@keyboard-studio/contracts";
import { useWorkingCopyStore } from "../../stores/workingCopyStore.ts";
import { useDecisionStore } from "../../stores/decisionStore.ts";
import type { MarksTreatmentValue } from "../../survey/marks/marksValue.ts";
import { KmnCodePane } from "./KmnCodePane.tsx";

vi.mock("./touchBuilder/monacoSetup.ts", () => ({}));

const editorMocks = vi.hoisted(() => ({
  setModelMarkers: vi.fn(),
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
            { getModel: () => ({ dispose: () => undefined }) },
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
    // No carve/assignment/identity layers: the projection leaves the fetched
    // base .kmn untouched, so the pane shows the file text — which differs
    // from emitKmn(ir) for this synthetic IR.
    expect(editorText()).toBe(fileText);
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
    const { parseKmn } = await import("@keyboard-studio/engine");
    const ir = parseKmn(
      `store(&VERSION) '10.0'\nstore(&NAME) 'testkbd'\n\nbegin Unicode > use(main)\n\ngroup(main) using keys\n\n+ [CTRL K_A] > 'é'\n`,
      "testkbd",
    ).ir;
    useWorkingCopyStore.setState({ ir });
    render(<KmnCodePane />);
    act(() => {
      fireEvent.change(screen.getByTestId("mock-editor"), {
        target: { value: editorText() + "\n" },
      });
    });
    act(() => {
      fireEvent.click(applyButton());
    });
    // The rule was already in the working copy, so it warns but never blocks.
    const next = useWorkingCopyStore.getState().ir;
    expect(next).not.toBeNull();
    expect(next).not.toBe(ir);
  });

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
    it("Apply of a real edit writes the edited IR to the store, even though the projection still shows the base", () => {
      const ir = seedProjectedBase();
      render(<KmnCodePane />);
      expect(editorText()).toBe(BASE_KMN);
      act(() => {
        fireEvent.change(screen.getByTestId("mock-editor"), {
          target: { value: BASE_KMN.replace("+ [K_A] > 'a'", "+ [K_A] > 'b'") },
        });
      });
      act(() => {
        fireEvent.click(applyButton());
      });
      // The edit lands in the working IR (gallery-visible) — it does not
      // reach the preview/download, which project from startIr + overlays
      // (the pre-existing Apply limitation, now visible in the pane).
      const next = useWorkingCopyStore.getState().ir;
      expect(next).not.toBeNull();
      expect(next).not.toBe(ir);
      // The emitter writes the 'b' output as its U+ codepoint.
      expect(emitKmn(next!)).toContain("+ [K_A] > U+0062");
      // The editor keeps the applied text and the dirty badge clears:
      // the projected canonical never changes on this path, so Apply
      // resyncs the draft bookkeeping directly instead of relying on the
      // [canonical]-keyed snap effect (see handleApply).
      expect(editorText()).toContain("+ [K_A] > 'b'");
      expect(screen.queryByTestId("kmn-code-dirty")).toBeNull();
      expect(applyButton().disabled).toBe(true);
    });

    it("a formatting-only Apply on the projection path also clears the dirty badge", () => {
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
      act(() => {
        fireEvent.click(applyButton());
      });
      // Same mechanism as a real edit: the write lands in the store and
      // Apply resyncs the draft bookkeeping, so the badge clears and the
      // editor keeps the applied (trailing-newline) text — the projection
      // canonical never moves, so nothing snaps the newline away.
      expect(useWorkingCopyStore.getState().ir).not.toBeNull();
      expect(editorText()).toBe(draft);
      expect(screen.queryByTestId("kmn-code-dirty")).toBeNull();
      expect(applyButton().disabled).toBe(true);
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

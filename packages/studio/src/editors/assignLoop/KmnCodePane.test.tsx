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
import { emitKmn } from "@keyboard-studio/engine";
import type { KeyboardIR } from "@keyboard-studio/contracts";
import { useWorkingCopyStore } from "../../stores/workingCopyStore.ts";
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
});

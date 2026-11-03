// Component tests for the OSK editor's Code tab (OskCodePane.tsx).
//
// Monaco itself is mocked (a textarea stand-in): these tests pin the pane's
// wiring — dirty tracking, Apply → onApply, the null-kvks disabled state —
// not Monaco's rendering. The lint pipeline has its own pure-module suite.

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  act,
  cleanup,
  fireEvent,
  screen,
} from "@testing-library/react";
import { render } from "../../test/renderWithI18n.tsx";
import { emitKvks } from "@keyboard-studio/engine";
import type { KvksIR } from "@keyboard-studio/contracts";
import { OskCodePane } from "./OskCodePane.tsx";

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

function kvks(): KvksIR {
  return {
    kvksVersion: "10.0",
    kbdname: "test",
    layers: [
      {
        shift: "",
        keys: [{ vkey: "K_A", label: "a", chars: "a" }],
      },
    ],
    usealtgr: false,
    nodeIds: [],
  };
}

function editorText(): string {
  return (screen.getByTestId("mock-editor") as HTMLTextAreaElement).value;
}

function applyButton(): HTMLButtonElement {
  return screen.getByTestId("osk-code-apply") as HTMLButtonElement;
}

beforeEach(() => {
  editorMocks.setModelMarkers.mockClear();
});

afterEach(() => {
  cleanup();
});

describe("OskCodePane", () => {
  it("renders the disabled empty state when kvks is null", () => {
    render(<OskCodePane kvks={null} onApply={() => undefined} />);
    expect(screen.getByTestId("osk-code-pane-empty")).toBeTruthy();
    expect(screen.queryByTestId("mock-editor")).toBeNull();
  });

  it("starts clean: Apply disabled, editor shows the canonical emit", () => {
    render(<OskCodePane kvks={kvks()} onApply={() => undefined} />);
    expect(editorText()).toBe(emitKvks(kvks()));
    expect(applyButton().disabled).toBe(true);
    expect(screen.queryByTestId("osk-code-dirty")).toBeNull();
  });

  it("typing marks the pane dirty and enables Apply", () => {
    render(<OskCodePane kvks={kvks()} onApply={() => undefined} />);
    act(() => {
      fireEvent.change(screen.getByTestId("mock-editor"), {
        target: { value: editorText().replace(">a<", ">A<") },
      });
    });
    expect(screen.getByTestId("osk-code-dirty")).toBeTruthy();
    expect(applyButton().disabled).toBe(false);
  });

  it("Apply parses the XML and calls onApply with the KvksIR", () => {
    const onApply = vi.fn();
    render(<OskCodePane kvks={kvks()} onApply={onApply} />);
    act(() => {
      fireEvent.change(screen.getByTestId("mock-editor"), {
        target: { value: editorText().replace(">a<", ">A<") },
      });
    });
    act(() => {
      fireEvent.click(applyButton());
    });
    expect(onApply).toHaveBeenCalledTimes(1);
    const applied = onApply.mock.calls[0]?.[0] as KvksIR;
    expect(applied.layers[0]?.keys[0]?.label).toBe("A");
  });

  it("Apply is blocked while the XML is malformed", () => {
    const onApply = vi.fn();
    render(<OskCodePane kvks={kvks()} onApply={onApply} />);
    act(() => {
      fireEvent.change(screen.getByTestId("mock-editor"), {
        target: { value: "<visualkeyboard><unclosed>" },
      });
    });
    expect(screen.getByTestId("osk-code-dirty")).toBeTruthy();
    // The synchronous lint gate in handleApply blocks the Apply even
    // before the debounced lint state catches up.
    act(() => {
      fireEvent.click(applyButton());
    });
    expect(onApply).not.toHaveBeenCalled();
  });
});

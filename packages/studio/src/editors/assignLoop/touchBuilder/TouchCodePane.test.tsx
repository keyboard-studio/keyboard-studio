// Component tests for the Code tab (TouchCodePane.tsx).
//
// Monaco itself is mocked (a textarea stand-in): these tests pin the pane's
// wiring — dirty tracking, Apply → commitKeyEditBatch, batch undo, the
// null-layout disabled state — not Monaco's rendering. The lint pipeline
// and the diff decomposition have their own pure-module suites.

import { beforeEach, afterEach, describe, expect, it, vi } from "vitest";
import {
  act,
  cleanup,
  fireEvent,
  screen,
  waitFor,
} from "@testing-library/react";
import { render } from "../../../test/renderWithI18n.tsx";
import { parseTouchLayoutString } from "@keyboard-studio/contracts";
import {
  emitTouchLayout,
  replayKeyEditOverlay,
} from "@keyboard-studio/engine";
import { useWorkingCopyStore } from "../../../stores/workingCopyStore.ts";
import { TouchCodePane } from "./TouchCodePane.tsx";

vi.mock("./monacoSetup.ts", () => ({}));

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

const LAYOUT_JSON = `{
  "phone": {
    "layer": [
      {
        "id": "default",
        "row": [
          { "id": 1, "key": [{ "id": "K_Q", "text": "q" }, { "id": "K_W", "text": "w" }] },
          { "id": 2, "key": [{ "id": "K_A", "text": "a" }] }
        ]
      }
    ]
  }
}`;

function layout() {
  return parseTouchLayoutString(LAYOUT_JSON);
}

function editorText(): string {
  return (screen.getByTestId("mock-editor") as HTMLTextAreaElement).value;
}

function applyButton(): HTMLButtonElement {
  return screen.getByTestId("touch-code-apply") as HTMLButtonElement;
}

beforeEach(() => {
  editorMocks.setModelMarkers.mockClear();
});

// This repo runs vitest with `globals: false`, so @testing-library/react's
// auto-cleanup never registers — the TouchGallery suites clean up through
// their harness; this file does it directly.
afterEach(() => {
  cleanup();
});

describe("TouchCodePane", () => {
  it("renders the disabled empty state when the layout is null", () => {
    render(<TouchCodePane layout={null} />);
    expect(screen.getByTestId("touch-code-pane-empty")).toBeTruthy();
    expect(screen.queryByTestId("mock-editor")).toBeNull();
  });

  it("starts clean: Apply disabled, editor shows the canonical emit", () => {
    render(<TouchCodePane layout={layout()} />);
    expect(editorText()).toBe(emitTouchLayout(layout()));
    expect(applyButton().disabled).toBe(true);
    expect(screen.queryByTestId("touch-code-dirty")).toBeNull();
  });

  it("typing marks the pane dirty and enables Apply", () => {
    render(<TouchCodePane layout={layout()} />);
    act(() => {
      fireEvent.change(screen.getByTestId("mock-editor"), {
        target: { value: editorText().replace('"q"', '"Q"') },
      });
    });
    expect(screen.getByTestId("touch-code-dirty")).toBeTruthy();
    expect(applyButton().disabled).toBe(false);
  });

  it("Apply commits the diff as ONE undo batch and snaps to canonical", async () => {
    const before = layout();
    const { rerender } = render(<TouchCodePane layout={before} />);

    act(() => {
      fireEvent.change(screen.getByTestId("mock-editor"), {
        target: { value: editorText().replace('"q"', '"Q"') },
      });
    });
    act(() => {
      fireEvent.click(applyButton());
    });

    // One 'kb' entry, one op: the text edit decomposed to a set.
    const s = useWorkingCopyStore.getState();
    expect(s.undoStack).toEqual([{ k: "kb", seqs: [0] }]);
    expect(s.keyEditOverlay.ops).toHaveLength(1);
    expect(s.keyEditOverlay.ops[0]).toMatchObject({
      kind: "set",
      address: "phone:default:K_Q",
      fields: { text: "Q" },
      seq: 0,
    });

    // The gallery re-renders the pane with the replayed layout (the shared
    // selector); the pane snaps the editor to the new canonical text.
    const replayed = replayKeyEditOverlay(before, s.keyEditOverlay).layout;
    rerender(<TouchCodePane layout={replayed} />);
    await waitFor(() => {
      expect(editorText()).toBe(emitTouchLayout(replayed));
    });
    expect(applyButton().disabled).toBe(true);
    expect(screen.queryByTestId("touch-code-dirty")).toBeNull();
  });

  it("undo after Apply removes the whole batch (one undo step)", () => {
    const before = layout();
    const { rerender } = render(<TouchCodePane layout={before} />);

    act(() => {
      fireEvent.change(screen.getByTestId("mock-editor"), {
        target: { value: editorText().replace('"q"', '"Q"') },
      });
    });
    act(() => {
      fireEvent.click(applyButton());
    });
    expect(useWorkingCopyStore.getState().keyEditOverlay.ops).toHaveLength(1);

    act(() => {
      useWorkingCopyStore.getState().undoDelete();
    });
    expect(useWorkingCopyStore.getState().keyEditOverlay.ops).toHaveLength(0);
    expect(useWorkingCopyStore.getState().undoStack).toHaveLength(0);

    // The shared stack is restored (replaying the emptied overlay over the
    // base layout reproduces the original canonical text exactly).
    const s = useWorkingCopyStore.getState();
    const restored = replayKeyEditOverlay(before, s.keyEditOverlay).layout;
    expect(emitTouchLayout(restored)).toBe(emitTouchLayout(before));

    // Q4 hybrid undo: the text buffer is the author's until they Apply — the
    // pane keeps the dirty draft across the external undo rather than
    // silently overwriting it, and the dirty flag stays honest.
    rerender(<TouchCodePane layout={restored} />);
    expect(editorText()).toContain('"Q"');
    expect(screen.getByTestId("touch-code-dirty")).toBeTruthy();
  });

  it("an external undo while clean snaps the editor to the restored canonical", async () => {
    const before = layout();
    const { rerender } = render(<TouchCodePane layout={before} />);

    act(() => {
      fireEvent.change(screen.getByTestId("mock-editor"), {
        target: { value: editorText().replace('"q"', '"Q"') },
      });
    });
    act(() => {
      fireEvent.click(applyButton());
    });

    // The gallery re-renders with the replayed layout; the pane snaps clean.
    const s1 = useWorkingCopyStore.getState();
    const replayed = replayKeyEditOverlay(before, s1.keyEditOverlay).layout;
    rerender(<TouchCodePane layout={replayed} />);
    await waitFor(() => {
      expect(applyButton().disabled).toBe(true);
    });

    // Undo elsewhere (the tab strip's undo button), then back to the Code
    // tab: the canonical text changed under a clean pane, so it follows.
    act(() => {
      useWorkingCopyStore.getState().undoDelete();
    });
    const s2 = useWorkingCopyStore.getState();
    const restored = replayKeyEditOverlay(before, s2.keyEditOverlay).layout;
    rerender(<TouchCodePane layout={restored} />);
    await waitFor(() => {
      expect(editorText()).toBe(emitTouchLayout(before));
    });
    expect(screen.queryByTestId("touch-code-dirty")).toBeNull();
  });

  it("Apply is disabled while the text is not valid JSON", async () => {
    render(<TouchCodePane layout={layout()} />);
    act(() => {
      fireEvent.change(screen.getByTestId("mock-editor"), {
        target: { value: `{"phone": {` },
      });
    });
    // The debounced lint marks the text unparsed → Apply disabled.
    await waitFor(() => {
      expect(applyButton().disabled).toBe(true);
    });
    expect(editorMocks.setModelMarkers).toHaveBeenCalled();
    const markers = editorMocks.setModelMarkers.mock.calls.at(-1)?.[2] as Array<{
      code: string;
      severity: number;
    }>;
    expect(markers).toHaveLength(1);
    expect(markers[0]!.code).toBe("JSON_SYNTAX");
    expect(markers[0]!.severity).toBe(8); // MarkerSeverity.Error
  });

  it("a structural edit surfaces a named apply error instead of applying", () => {
    const before = layout();
    render(<TouchCodePane layout={before} />);

    // Add a row: row-structure is outside the op contract.
    const raw = JSON.parse(LAYOUT_JSON) as {
      phone: { layer: Array<{ row: Array<{ id: number; key: unknown[] }> }> };
    };
    raw.phone.layer[0].row.push({ id: 3, key: [{ id: "K_Z", text: "z" }] });
    act(() => {
      fireEvent.change(screen.getByTestId("mock-editor"), {
        target: { value: JSON.stringify(raw) },
      });
    });
    act(() => {
      fireEvent.click(applyButton());
    });

    expect(screen.getByTestId("touch-code-apply-error")).toBeTruthy();
    expect(
      screen.getByTestId("touch-code-apply-error").textContent,
    ).toContain("row");
    // Nothing committed.
    expect(useWorkingCopyStore.getState().keyEditOverlay.ops).toHaveLength(0);
    expect(useWorkingCopyStore.getState().undoStack).toHaveLength(0);
  });
});

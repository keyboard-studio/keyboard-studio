// Fallback when the projection throws in KmnCodePane.
//
// The pane's canonical text is `openText ?? projectedKmn ?? carveFallback ??
// emitKmn(ir)`. The projected path is covered by KmnCodePane.test.tsx and
// KmnCodePane.carve.test.tsx, and the no-.kmn fallback (findKmnPath finds
// nothing) by KmnCodePane.test.tsx. This file pins the remaining way the
// projection can come back empty: the try/catch around vfsTransform.
//
// No real input makes the projection throw reliably — the projection is
// built never-throw — so the hook is mocked to a throwing transform in this
// file only (vi.mock is per-file; the other pane suites keep the real hook).

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { act, cleanup, screen } from "@testing-library/react";
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

// The projection throws on every call: the pane must fall back, not blank.
vi.mock("../../hooks/useWorkingCopyTransform.ts", () => ({
  useWorkingCopyTransform: () => () => {
    throw new Error("projection boom (test)");
  },
}));

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

describe("KmnCodePane when the projection throws", () => {
  it("falls back to the carve-filtered emit", () => {
    const kmn = readFileSync(KMN_PATH, "utf8");
    const { startIr } = useWorkingCopyStore.getState();
    const uncarved = emitKmn(startIr!);
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
    // The mocked transform throws, so the pane shows exactly the carve
    // floor — the carve-applied working IR — not the uncarved emit.
    expect(editorText()).toBe(
      emitKmn(
        applyCarveMutate(
          startIr!,
          new Set(),
          new Set(),
          new Set<string>(CARVED_MARKS),
        ),
      ),
    );
    expect(editorText()).not.toBe(uncarved);
    expect(carvedRuleLines(editorText())).toEqual([]);
  });
});

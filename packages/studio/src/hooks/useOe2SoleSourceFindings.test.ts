// useOe2SoleSourceFindings — focused unit test.
//
// Strategy: seed workingCopyStore directly via setState with a hand-built
// IR whose only route to "§" is the oe2 key, render the hook under an
// I18nProvider (the hook resolves its copy through useLingui), and assert
// the published finding. A second case gives the glyph another key and
// asserts the warning clears.

import { describe, it, expect, afterEach } from "vitest";
import type { ReactNode } from "react";
import { createElement } from "react";
import { renderHook } from "@testing-library/react";
import { i18n } from "@lingui/core";
import { I18nProvider } from "@lingui/react";
import type { KeyboardIR } from "@keyboard-studio/contracts";
import { messages as enMessages } from "../locales/en/messages.json?lingui";
import { useWorkingCopyStore } from "../stores/workingCopyStore.ts";
import { useOe2SoleSourceFindings } from "./useOe2SoleSourceFindings.ts";

i18n.load("en", enMessages);
i18n.activate("en");

function wrapper({ children }: { children: ReactNode }) {
  return createElement(I18nProvider, { i18n }, children);
}

function makeIr(secondRoute: boolean): KeyboardIR {
  return {
    origin: "imported",
    header: {
      keyboardId: "oe2_test",
      name: "Test",
      bcp47: [],
      copyright: "",
      version: "1.0",
      targets: [],
      storeDirectives: [],
    },
    stores: [],
    groups: [
      {
        nodeId: "g1",
        name: "main",
        usingKeys: true,
        readonly: false,
        rules: [
          {
            nodeId: "r1",
            context: [{ kind: "vkey", name: "K_oE2", modifiers: [] }],
            output: [{ kind: "char", value: "§" }],
          },
          {
            nodeId: "r2",
            context: [{ kind: "vkey", name: "K_A", modifiers: [] }],
            output: [{ kind: "char", value: "a" }],
          },
          ...(secondRoute
            ? [
                {
                  nodeId: "r3",
                  context: [{ kind: "vkey", name: "K_BKSLASH", modifiers: [] }],
                  output: [{ kind: "char", value: "§" }],
                },
              ]
            : []),
        ],
      },
    ],
    comments: [],
    raw: [],
    recognizedPatterns: [],
  };
}

describe("useOe2SoleSourceFindings", () => {
  afterEach(() => {
    useWorkingCopyStore.setState({ ir: null, startIr: null, phaseResults: [] });
  });

  it("returns no findings before a working copy exists", () => {
    useWorkingCopyStore.setState({ ir: null, startIr: null, phaseResults: [] });
    const { result } = renderHook(() => useOe2SoleSourceFindings(), { wrapper });
    expect(result.current).toEqual([]);
  });

  it("publishes one warning finding for a glyph whose only route is the oe2 key", () => {
    useWorkingCopyStore.setState({ ir: null, startIr: makeIr(false), phaseResults: [] });
    const { result } = renderHook(() => useOe2SoleSourceFindings(), { wrapper });
    expect(result.current).toHaveLength(1);
    expect(result.current[0]!.code).toBe("KM_LINT_OE2_SOLE_SOURCE_GLYPH");
    expect(result.current[0]!.severity).toBe("warning");
    expect(result.current[0]!.layer).toBe("C");
    expect(result.current[0]!.message).toContain("§");
  });

  it("publishes nothing when the glyph also sits on another key", () => {
    useWorkingCopyStore.setState({ ir: null, startIr: makeIr(true), phaseResults: [] });
    const { result } = renderHook(() => useOe2SoleSourceFindings(), { wrapper });
    expect(result.current).toEqual([]);
  });
});

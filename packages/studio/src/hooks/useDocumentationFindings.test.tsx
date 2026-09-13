// useDocumentationFindings — spec 076 US7 (T074): memoised recompute on input
// change only; the FR-020 upstream classification flips once the member is
// authored; nothing here can block output (FR-018).

import { describe, it, expect, afterEach } from "vitest";
import { renderHook } from "@testing-library/react";
import { createVirtualFS } from "@keyboard-studio/contracts";
import { makeTestIR, basicKbdus } from "@keyboard-studio/contracts/fixtures";
import { useWorkingCopyStore } from "../stores/workingCopyStore.ts";
import { useDocumentationFindings } from "./useDocumentationFindings.ts";
import { computeBaselineDocFindings } from "../lib/collectDocLintInput.ts";

const KMN = [
  "store(&NAME) 'US English (Basic)'",
  "store(&KEYBOARDVERSION) '1.0'",
  "store(&TARGETS) 'any'",
  "begin Unicode > use(main)",
  "group(main) using keys",
].join("\n");

// A base help page whose $pagename does not follow the help-site form.
const BAD_BASE_HELP =
  "<?php\n  $pagename = 'Some Other Page';\n  $pagetitle = $pagename;\n  require_once('header.php');\n?>\n<html><body><p>Base help.</p></body></html>";
const BASE_WELCOME = "<html><body><p>Base help.</p></body></html>";

afterEach(() => {
  useWorkingCopyStore.getState().reset();
});

function vfs() {
  return createVirtualFS([{ path: `source/${basicKbdus.id}.kmn`, content: KMN, isBinary: false }]);
}

function instantiateAdaptation() {
  const ir = makeTestIR([]);
  ir.header.version = "1.0";
  useWorkingCopyStore.getState().instantiateFromExisting(basicKbdus, { vfs: vfs(), ir });
  const wc = useWorkingCopyStore.getState();
  wc.setBaseWelcomeHtmText(BASE_WELCOME);
  wc.setBaseHelpPhpText(BAD_BASE_HELP);
  wc.setBaselineDocFindings(
    computeBaselineDocFindings({
      keyboardId: basicKbdus.id,
      displayName: basicKbdus.displayName,
      kmnText: KMN,
      kpsText: null,
      kvksText: null,
      touchLayoutJson: null,
      base: { welcomeHtmText: BASE_WELCOME, helpPhpText: BAD_BASE_HELP, readmeMdText: null, historyMdText: null, licenseText: null },
    }),
  );
}

describe("useDocumentationFindings", () => {
  it("returns the shared empty array before instantiation", () => {
    const { result, rerender } = renderHook(() => useDocumentationFindings());
    expect(result.current).toEqual([]);
    const first = result.current;
    rerender();
    expect(result.current).toBe(first);
  });

  it("recomputes only when an input changes (same reference across an unrelated rerender)", () => {
    const ir = makeTestIR([]);
    ir.header.version = "1.0";
    useWorkingCopyStore.getState().instantiateFromBase(basicKbdus, { vfs: vfs(), ir });
    const { result, rerender } = renderHook(() => useDocumentationFindings());
    const first = result.current;
    rerender();
    expect(result.current).toBe(first);
    useWorkingCopyStore.getState().setHelpDocs({ description: "A keyboard for testing.", usageTips: [] });
    rerender();
    expect(result.current).not.toBe(first);
  });

  it("every documentation finding is a warning (Layer C ceiling, FR-018)", () => {
    instantiateAdaptation();
    const { result } = renderHook(() => useDocumentationFindings());
    expect(result.current.length).toBeGreaterThan(0);
    for (const f of result.current) {
      expect(f.severity).toBe("warning");
      expect(f.layer).toBe("C");
    }
  });

  it("FR-020: a finding the base already carried on a still-inherited member is upstream; it flips to authored once the member is edited", () => {
    instantiateAdaptation();
    const { result, rerender } = renderHook(() => useDocumentationFindings());
    const pagename = result.current.filter((f) => f.code === "KM_LINT_PHP_PAGENAME_FORMAT");
    expect(pagename).toHaveLength(1);
    expect(pagename[0]!.origin).toBe("upstream");

    // The author answers the description: the help page is now authored (the
    // merge keeps the base's header, so the same code fires) — no longer upstream.
    useWorkingCopyStore.getState().setHelpDocs({ description: "My own description.", usageTips: [] });
    rerender();
    const after = result.current.filter((f) => f.code === "KM_LINT_PHP_PAGENAME_FORMAT");
    expect(after).toHaveLength(1);
    expect(after[0]!.origin).toBeUndefined();
  });

  it("a Track 1 copy never classifies anything upstream (no inherited prose)", () => {
    const ir = makeTestIR([]);
    ir.header.version = "1.0";
    useWorkingCopyStore.getState().instantiateFromBase(basicKbdus, { vfs: vfs(), ir });
    useWorkingCopyStore.getState().setBaselineDocFindings([]);
    const { result } = renderHook(() => useDocumentationFindings());
    expect(result.current.every((f) => f.origin !== "upstream")).toBe(true);
  });
});

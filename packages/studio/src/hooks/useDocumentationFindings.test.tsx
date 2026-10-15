// useDocumentationFindings — spec 079 US7 (T074): memoised recompute on input
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
  wc.setStartWelcomeHtmText(BASE_WELCOME);
  wc.setStartHelpPhpText(BAD_BASE_HELP);
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
    useWorkingCopyStore.getState().instantiateFromStart(basicKbdus, { vfs: vfs(), ir });
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

  it("11.8 (issue #2139): the startDocCssTexts kb.css constrains a class image — only the genuinely unconstrained image fires, classified upstream", () => {
    const HELP_WITH_IMAGES =
      "<?php\n  $pagename = 'Some Other Page';\n  $pagetitle = $pagename;\n  require_once('header.php');\n?>\n" +
      '<html><body><p>Base help.</p><img src="QwertyColor.png" class="full qw"><img src="globe.png"></body></html>';
    const KB_CSS = ".full { width: 98%; min-width: 700px; }";
    const ir = makeTestIR([]);
    ir.header.version = "1.0";
    useWorkingCopyStore.getState().instantiateFromExisting(basicKbdus, { vfs: vfs(), ir });
    const wc = useWorkingCopyStore.getState();
    wc.setStartWelcomeHtmText(BASE_WELCOME);
    wc.setStartHelpPhpText(HELP_WITH_IMAGES);
    wc.setStartDocCssTexts([KB_CSS]);
    wc.setBaselineDocFindings(
      computeBaselineDocFindings({
        keyboardId: basicKbdus.id,
        displayName: basicKbdus.displayName,
        kmnText: KMN,
        kpsText: null,
        kvksText: null,
        touchLayoutJson: null,
        cssTexts: [KB_CSS],
        base: { welcomeHtmText: BASE_WELCOME, helpPhpText: HELP_WITH_IMAGES, readmeMdText: null, historyMdText: null, licenseText: null },
      }),
    );
    const { result } = renderHook(() => useDocumentationFindings());
    const image = result.current.filter((f) => f.code === "KM_LINT_PHP_OSK_IMAGE_UNCONSTRAINED");
    expect(image).toHaveLength(1);
    expect(image[0]!.message).toContain("globe.png");
    expect(image[0]!.message).not.toContain("QwertyColor.png");
    expect(image[0]!.origin).toBe("upstream");
  });

  it("a Track 1 copy never classifies anything upstream (no inherited prose)", () => {
    const ir = makeTestIR([]);
    ir.header.version = "1.0";
    useWorkingCopyStore.getState().instantiateFromStart(basicKbdus, { vfs: vfs(), ir });
    useWorkingCopyStore.getState().setBaselineDocFindings([]);
    const { result } = renderHook(() => useDocumentationFindings());
    expect(result.current.every((f) => f.origin !== "upstream")).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// Issue #1908: the recorded documentation-fix proposals. Fixtures are
// sil_cameroon_qwerty-shaped: a "(SIL)"-carrying $pagename and welcome/help
// bodies that diverge in the copyright line.
// ---------------------------------------------------------------------------

const CAMEROON_HELP =
  "<?php\n  $pagename = 'Cameroon QWERTY (SIL) Keyboard Help';\n  $pagetitle = $pagename;\n  require_once('header.php');\n?>\n<html><body><p>Copyright SIL Cameroon</p></body></html>";
const CAMEROON_WELCOME = "<html><body><p>Copyright 2018-2022 SIL Cameroon</p></body></html>";
const CAMEROON_WELCOME_WITH_IMAGE =
  '<html><body><p>Copyright 2018-2022 SIL Cameroon</p><p><img src="globe.png"></p></body></html>';
const CAMEROON_HELP_WITH_IMAGE =
  "<?php\n  $pagename = 'Cameroon QWERTY (SIL) Keyboard Help';\n  $pagetitle = $pagename;\n  require_once('header.php');\n?>\n<html><body><p>Copyright 2018-2022 SIL Cameroon</p><p><img src=\"globe.png\"></p></body></html>";

function instantiateCameroon(withKbCss = false) {
  const entries = [{ path: `source/${basicKbdus.id}.kmn`, content: KMN, isBinary: false }];
  if (withKbCss) {
    entries.push({ path: "source/help/kb.css", content: ".full {\n  width: 98%;\n}\n", isBinary: false });
  }
  const ir = makeTestIR([]);
  ir.header.version = "1.0";
  useWorkingCopyStore.getState().instantiateFromExisting(basicKbdus, {
    vfs: createVirtualFS(entries),
    ir,
  });
  const wc = useWorkingCopyStore.getState();
  wc.setStartWelcomeHtmText(withKbCss ? CAMEROON_WELCOME_WITH_IMAGE : CAMEROON_WELCOME);
  wc.setStartHelpPhpText(withKbCss ? CAMEROON_HELP_WITH_IMAGE : CAMEROON_HELP);
}

describe("useDocumentationFindings — doc-fix proposals (issue #1908)", () => {
  it("11.7: the pagename finding stays when declined and clears when accepted", () => {
    instantiateCameroon();
    const { result, rerender } = renderHook(() => useDocumentationFindings());
    const code = "KM_LINT_PHP_PAGENAME_FORMAT";
    expect(result.current.filter((f) => f.code === code)).toHaveLength(1);

    useWorkingCopyStore.getState().setDocFixProposals({ pagename: "declined" });
    rerender();
    expect(result.current.filter((f) => f.code === code)).toHaveLength(1);

    useWorkingCopyStore.getState().setDocFixProposals({ pagename: "accepted" });
    rerender();
    expect(result.current.filter((f) => f.code === code)).toHaveLength(0);
  });

  it("11.9: the body-parity finding stays when declined and clears when accepted, from either canonical side", () => {
    instantiateCameroon();
    const { result, rerender } = renderHook(() => useDocumentationFindings());
    const code = "KM_LINT_PHP_HTM_BODY_MISMATCH";
    expect(result.current.filter((f) => f.code === code)).toHaveLength(1);

    useWorkingCopyStore.getState().setDocFixProposals({ bodySync: "declined" });
    rerender();
    expect(result.current.filter((f) => f.code === code)).toHaveLength(1);

    useWorkingCopyStore.getState().setDocFixProposals({ bodySync: "welcome" });
    rerender();
    expect(result.current.filter((f) => f.code === code)).toHaveLength(0);

    useWorkingCopyStore.getState().setDocFixProposals({ bodySync: "help" });
    rerender();
    expect(result.current.filter((f) => f.code === code)).toHaveLength(0);
  });

  it("11.8: with a kb.css in the working copy, the image finding stays when declined and clears when accepted", () => {
    instantiateCameroon(true);
    const { result, rerender } = renderHook(() => useDocumentationFindings());
    const code = "KM_LINT_PHP_OSK_IMAGE_UNCONSTRAINED";
    expect(result.current.filter((f) => f.code === code).length).toBeGreaterThan(0);

    useWorkingCopyStore.getState().setDocFixProposals({ imageWidth: "declined" });
    rerender();
    expect(result.current.filter((f) => f.code === code).length).toBeGreaterThan(0);

    useWorkingCopyStore.getState().setDocFixProposals({ imageWidth: "accepted" });
    rerender();
    expect(result.current.filter((f) => f.code === code)).toHaveLength(0);
  });

  it("recorded proposals never engage on the copy track", () => {
    const ir = makeTestIR([]);
    ir.header.version = "1.0";
    useWorkingCopyStore.getState().instantiateFromStart(basicKbdus, { vfs: vfs(), ir });
    const { result, rerender } = renderHook(() => useDocumentationFindings());
    const before = result.current;
    useWorkingCopyStore
      .getState()
      .setDocFixProposals({ pagename: "accepted", bodySync: "welcome", imageWidth: "accepted" });
    rerender();
    expect(result.current).toEqual(before);
  });
});

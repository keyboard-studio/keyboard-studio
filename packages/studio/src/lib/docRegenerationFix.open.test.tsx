// Documentation regeneration fixes on a keyboard opened for update (spec 111 "live files",
// FR-028, FR-047, SC-014): the fix compares the file with the raw render (never with itself),
// accepting writes the previewed text into the file through the apply host as one undo step,
// and the editor seed, the preview and the download all read that file.

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { act, cleanup, fireEvent, render, renderHook, screen } from "@testing-library/react";
import { I18nProvider } from "@lingui/react";
import { i18n } from "@lingui/core";
import { createVirtualFS, makePattern, type MechanismAssignment, type Pattern, type StartKeyboard } from "@keyboard-studio/contracts";
import { parseKmn } from "@keyboard-studio/engine";
import { useWorkingCopyStore } from "../stores/workingCopyStore.ts";
import { useDecisionLogStore } from "../decisions/decisionLogStore.ts";
import { useDecisionStore } from "../stores/decisionStore.ts";
import { clearOpenSession, useOpenUndoStore } from "../stores/openUndoStore.ts";
import { useDocsPreview } from "../hooks/useDocsPreview.ts";
import { useDocRegenerationFixes } from "../hooks/useDocRegenerationFixes.ts";
import { OpenApplyHost, useApplyOnOpen, type ApplyOnOpen } from "../components/OpenApplyHost.tsx";
import { projectWorkingCopyForOutput } from "./serializeWorkingCopy.ts";
import { CriteriaScreen } from "../components/CriteriaScreen.tsx";
import { OpenUndoButton } from "../components/OpenUndoButton.tsx";
import { applyOpenChange, undoLastOpenApply } from "./openApply.ts";
import { applyDocRegeneration, docRegenerationFix } from "./docRegenerationFix.ts";
import { commitDocPagesThroughSeam } from "./docsOpenCommit.ts";
import { readVfsText } from "./vfsText.ts";

vi.mock("../hooks/usePreviewArtifact.ts", () => ({ usePreviewArtifact: () => ({ stage: { kind: "ready", keyboardId: "tiny" } }) }));
vi.mock("../hooks/useAuthoredCriteria.ts", () => ({ useAuthoredCriteria: () => ({ rows: [] }) }));
vi.mock("../hooks/useOpenRatchet.ts", () => ({ useOpenRatchet: () => null }));
vi.mock("../hooks/usePublishStepNav.ts", async (orig) => ({ ...(await orig<object>()), usePublishStepNav: () => {} }));
vi.mock("../criteria/CriteriaPage.tsx", () => ({ CriteriaPage: () => null }));

const SWAP: Pattern = makePattern({
  id: "simple_swap",
  title: "simple_swap",
  description: "simple_swap",
  category: "desktop",
  appliesTo: [],
  questions: [{ id: "kmnRules", prompt: "kmnRules", answerType: "text" as const }],
  kmnFragment: "{{kmnRules}}\n",
  tests: [],
  validatedForFamilies: [],
  sourceKeyboards: [],
  reviewedBy: "",
  reviewDate: "2026-10-29",
});

vi.mock("./services.ts", () => ({
  getToZip: vi.fn(async () => vi.fn(async () => new Uint8Array())),
  getPatternLibraryService: vi.fn(() => ({ getById: async (id: string) => (id === "simple_swap" ? SWAP : undefined) })),
  getPatternByIdSync: (id: string) => (id === "simple_swap" ? SWAP : undefined),
}));

const S = "<!-- ks:generated:start -->";
const E = "<!-- ks:generated:end -->";
const ID = "tiny";
const KMN_PATH = `source/${ID}.kmn`;
const HELP = `source/help/${ID}.php`;
const KMN = ["store(&NAME) 'Tiny'", "store(&VERSION) '10.0'", "", "begin Unicode > use(main)", "", "group(main) using keys", "+ [K_A] > 'a'", "+ [K_B] > 'b'", ""].join("\n");
const KB = { id: ID, path: "release/t/tiny", script: "Latn", targets: ["desktop"], displayName: "Tiny", version: "1.0", languages: ["en"] } as StartKeyboard;
const HELP_ORIGINAL = `<?php $pagename = 'tiny'; ?>\n<p>Mine.</p>\n${S}\nstale\n${E}\n`;

const README_ORIGINAL = `# Tiny\n\nMine.\n\n${S}\nstale\n${E}\n`;

function open(mode: "open" | "copy" = "open"): void {
  const vfs = createVirtualFS([
    { path: KMN_PATH, content: KMN, isBinary: false },
    { path: `source/${ID}.kps`, content: "<Package/>", isBinary: false },
    { path: HELP, content: HELP_ORIGINAL, isBinary: false },
    { path: "README.md", content: README_ORIGINAL, isBinary: false },
  ]);
  clearOpenSession();
  useDecisionStore.getState().reset();
  const wc = useWorkingCopyStore.getState();
  wc.reset();
  const seed = { vfs, ir: parseKmn(KMN, ID).ir };
  if (mode === "open") wc.instantiateFromExisting(KB, seed);
  else wc.instantiateFromStart(KB, seed);
  wc.setAttribution({ authorName: "T", copyrightHolder: "T" });
  wc.setFallbackPolicy("pass-through");
  // The loader's slices: the pages' inherited prose, which is what carries the generated markers.
  wc.setStartHelpPhpText(HELP_ORIGINAL);
  wc.setStartReadmeMdText(README_ORIGINAL);
}

const helpNow = (): string => readVfsText(useWorkingCopyStore.getState().startVfs!, HELP)!;
const helpFix = (fixes: ReturnType<typeof useDocRegenerationFixes>) => fixes.find((f) => f.id.startsWith("docs:regenerate:help-php:"));

let apply: ApplyOnOpen;
function Probe() {
  apply = useApplyOnOpen();
  return null;
}
function mount() {
  render(
    <I18nProvider i18n={i18n}>
      <OpenApplyHost><Probe /></OpenApplyHost>
    </I18nProvider>,
  );
}

const realReplace = useWorkingCopyStore.getState().replaceStartingPointFiles;
beforeEach(() => {
  i18n.load("en", {});
  i18n.activate("en");
});
afterEach(() => {
  cleanup();
  useWorkingCopyStore.setState({ replaceStartingPointFiles: realReplace });
});

describe("documentation regeneration on Open", () => {
  it("SC-014: edit a page, accept its regeneration fix, editor/preview/output show the regenerated text", async () => {
    open();
    mount();
    // The author edits the page: their text outside the markers.
    const edited = HELP_ORIGINAL.replace("Mine.", "Mine, edited.");
    const wc = useWorkingCopyStore.getState();
    expect(commitDocPagesThroughSeam({ edits: { "help-php": edited }, keyboardId: ID, startVfs: wc.startVfs, convention: wc.startWelcomeConvention }).written).toEqual(["help-php"]);
    expect(helpNow()).toBe(edited);

    const fixes = renderHook(() => useDocRegenerationFixes());
    const fix = helpFix(fixes.result.current);
    // The edited page still gets its fix: the file is compared with the raw render, not with itself.
    expect(fix).toBeDefined();
    expect(fix!.preview[0]!.before).toBe(edited);
    const after = fix!.preview[0]!.after;
    expect(after).not.toBe(edited);
    expect(after).toContain("Mine, edited.");
    expect(after).not.toContain("stale");

    let ok = false;
    await act(async () => {
      ok = await applyDocRegeneration(fix!, apply);
    });
    expect(ok).toBe(true);
    // The editor seed (the file the editor reads), the preview and the download.
    expect(helpNow()).toBe(after);
    const preview = renderHook(() => useDocsPreview());
    expect(preview.result.current.helpPhp).toBe(after);
    const projected = await projectWorkingCopyForOutput();
    expect(readVfsText(projected!.vfs, HELP)).toBe(after);
    // The fix is recomputed (FR-047): nothing is left to regenerate for that page.
    expect(helpFix(renderHook(() => useDocRegenerationFixes()).result.current)).toBeUndefined();
    expect(useOpenUndoStore.getState().records.at(-1)!.labelKey).toBe("docs-regenerate");
  });

  it("an assign apply on Open produces a fix on an edited page (FR-047)", async () => {
    open();
    const wc = useWorkingCopyStore.getState();
    commitDocPagesThroughSeam({ edits: { "help-php": HELP_ORIGINAL.replace("Mine.", "Mine, edited.") }, keyboardId: ID, startVfs: wc.startVfs, convention: wc.startWelcomeConvention });
    const fixes = renderHook(() => useDocRegenerationFixes());
    const before = fixes.result.current.find((f) => f.id.startsWith("docs:regenerate:help-php:"));
    expect(before).toBeDefined();
    // Accept it, then change the keyboard: the page is out of date again, so a fix reappears without a timer.
    await act(async () => {
      await applyDocRegeneration(before!, (c) => Promise.resolve(applyOpenChange(c)));
    });
    fixes.rerender();
    expect(fixes.result.current.find((f) => f.id.startsWith("docs:regenerate:help-php:"))).toBeUndefined();
    const assignment: MechanismAssignment = {
      scope: "individual",
      target: "a",
      modality: "physical",
      mechanisms: [{ patternId: "simple_swap", strategyId: "S-01", slotValues: { kmnRules: "+ [K_Q] > 'q'" } }],
      source: "user",
    };
    const r = applyOpenChange({ kind: "assign", add: [assignment], remove: [] });
    expect(r.status).toBe("applied");
    fixes.rerender();
    const helpRegen = fixes.result.current.find((f) => f.id.startsWith("docs:regenerate:help-php:"));
    expect(helpRegen).toBeDefined();
    expect(helpRegen!.preview[0]!.after).toContain("Mine, edited.");
    expect(helpRegen!.preview[0]!.after).toContain("U+0071");
  });

  it("undo of an accepted fix restores the file exactly", async () => {
    open();
    mount();
    const fix = helpFix(renderHook(() => useDocRegenerationFixes()).result.current)!;
    expect(fix).toBeDefined();
    await act(async () => {
      await applyDocRegeneration(fix, apply);
    });
    expect(helpNow()).not.toBe(HELP_ORIGINAL);
    expect(undoLastOpenApply().ok).toBe(true);
    expect(helpNow()).toBe(HELP_ORIGINAL);
  });

  it("a failed apply shows the host notice and changes nothing", async () => {
    open();
    mount();
    const fix = helpFix(renderHook(() => useDocRegenerationFixes()).result.current)!;
    useWorkingCopyStore.setState({
      replaceStartingPointFiles: () => {
        throw new Error("boom");
      },
    });
    let ok = true;
    await act(async () => {
      ok = await applyDocRegeneration(fix, apply);
    });
    expect(ok).toBe(false);
    expect(screen.getByRole("status").textContent).toContain("could not be applied");
    expect(helpNow()).toBe(HELP_ORIGINAL);
    expect(useOpenUndoStore.getState().records).toHaveLength(0);
  });

  it("Copy path is unchanged: no fixes are offered and the old write path is used", async () => {
    open("copy");
    expect(renderHook(() => useDocRegenerationFixes()).result.current).toEqual([]);
    const fix = {
      id: "docs:regenerate:help-php",
      kind: "docs" as const,
      findingKey: null,
      preview: [{ file: HELP, before: HELP_ORIGINAL, after: "x" }],
      status: "pending" as const,
      title: "t",
      action: { target: "docs" as const, change: "refresh" as const, subject: "help-php" as const },
    };
    let called = false;
    expect(await applyDocRegeneration(fix, () => { called = true; return Promise.resolve({ status: "unchanged" }); })).toBe(true);
    expect(called).toBe(false);
    expect(helpNow()).toBe("x");
    expect(useOpenUndoStore.getState().records).toHaveLength(0);
  });

  it("a live Open with no host writes nothing (never the store path)", async () => {
    open();
    const fix = helpFix(renderHook(() => useDocRegenerationFixes()).result.current)!;
    expect(await applyDocRegeneration(fix)).toBe(false);
    expect(helpNow()).toBe(HELP_ORIGINAL);
  });

  it("a file that changed after the fix was built is left alone", async () => {
    open();
    mount();
    const fix = helpFix(renderHook(() => useDocRegenerationFixes()).result.current)!;
    const wc = useWorkingCopyStore.getState();
    commitDocPagesThroughSeam({ edits: { "help-php": HELP_ORIGINAL.replace("Mine.", "Changed since.") }, keyboardId: ID, startVfs: wc.startVfs, convention: wc.startWelcomeConvention });
    const changed = helpNow();
    const records = useOpenUndoStore.getState().records.length;
    let ok = true;
    await act(async () => {
      ok = await applyDocRegeneration(fix, apply);
    });
    expect(ok).toBe(false);
    expect(helpNow()).toBe(changed);
    expect(useOpenUndoStore.getState().records).toHaveLength(records);
  });

  it("the fix id follows the proposal, so a new proposal is a new fix", () => {
    const a = docRegenerationFix({ member: "help-php", path: HELP, current: HELP_ORIGINAL, generated: "one" })!;
    const b = docRegenerationFix({ member: "help-php", path: HELP, current: HELP_ORIGINAL, generated: "two" })!;
    expect(a.id).not.toBe(b.id);
    expect(a.id).toBe(docRegenerationFix({ member: "help-php", path: HELP, current: HELP_ORIGINAL, generated: "one" })!.id);
  });

  it("a page without markers gets a marked block appended; a welcome page too", () => {
    const a = docRegenerationFix({ member: "readme-md", path: "README.md", current: "# Tiny\n", generated: "gen" })!;
    expect(a.preview[0]!.after).toContain(`${S}\ngen\n${E}`);
    expect(a.preview[0]!.after.startsWith("# Tiny")).toBe(true);
    const w = docRegenerationFix({ member: "welcome-htm", path: "source/welcome/welcome.htm", current: "<body><p>W</p></body>", generated: "gen" })!;
    expect(w.preview[0]!.after).toContain(`${S}\ngen\n${E}`);
    expect(w.preview[0]!.after).toContain("<p>W</p>");
  });

  it("descriptor-less Open (isOpenMode, not live): fixes are offered and apply by the store path", async () => {
    open();
    const wc = useWorkingCopyStore.getState();
    const vfs = createVirtualFS([
      { path: KMN_PATH, content: KMN, isBinary: false },
      { path: HELP, content: HELP_ORIGINAL, isBinary: false },
    ]);
    useWorkingCopyStore.setState({ startVfs: vfs });
    void wc;
    const fix = helpFix(renderHook(() => useDocRegenerationFixes()).result.current);
    expect(fix).toBeDefined();
    expect(await applyDocRegeneration(fix!, () => Promise.reject(new Error("host must not be used")))).toBe(true);
    expect(helpNow()).toBe(fix!.preview[0]!.after);
  });
});

describe("the Criteria screen's documentation fixes", () => {
  function mountScreen() {
    render(
      <I18nProvider i18n={i18n}>
        <OpenApplyHost><Probe /><CriteriaScreen /><OpenUndoButton /></OpenApplyHost>
      </I18nProvider>,
    );
  }
  const fixItems = () => screen.queryAllByTestId("suggested-fix").filter((li) => /help/i.test(li.textContent ?? ""));
  const accepted = () => useDecisionLogStore.getState().record.entries.filter((e) => e.payload.kind === "decision" && e.payload.decisionId.startsWith("suggestion:docs:regenerate:") && JSON.stringify(e.payload.value).includes("accepted"));

  beforeEach(() => useDecisionLogStore.getState().reset());

  it("accept, change the keyboard, the fix reappears; skip also lets the next proposal in", async () => {
    open();
    mountScreen();
    expect(fixItems()).toHaveLength(1);
    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: /^Accept: .*help/i }));
    });
    expect(helpNow()).not.toBe(HELP_ORIGINAL);
    expect(accepted()).toHaveLength(1);
    expect(fixItems()).toHaveLength(0);
    const assignment: MechanismAssignment = {
      scope: "individual", target: "a", modality: "physical",
      mechanisms: [{ patternId: "simple_swap", strategyId: "S-01", slotValues: { kmnRules: "+ [K_Q] > 'q'" } }],
      source: "user",
    };
    await act(async () => {
      expect(applyOpenChange({ kind: "assign", add: [assignment], remove: [] }).status).toBe("applied");
    });
    expect(fixItems()).toHaveLength(1);
    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: /^Skip: .*help/i }));
    });
    expect(fixItems()).toHaveLength(0);
    // A further change to the page is a new proposal, not the skipped one.
    await act(async () => {
      applyOpenChange({ kind: "files", files: { [HELP]: helpNow().replace("Mine.", "Mine again.") }, label: "x" });
    });
    expect(fixItems()).toHaveLength(1);
  });

  it("undo after an accepted regeneration offers the fix again", async () => {
    open();
    mountScreen();
    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: /^Accept: .*help/i }));
    });
    expect(fixItems()).toHaveLength(0);
    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: /^Undo/ }));
    });
    expect(helpNow()).toBe(HELP_ORIGINAL);
    expect(fixItems()).toHaveLength(1);
  });

  it("a failed apply leaves the fix visible and records no acceptance", async () => {
    open();
    mountScreen();
    useWorkingCopyStore.setState({
      replaceStartingPointFiles: () => {
        throw new Error("boom");
      },
    });
    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: /^Accept: .*help/i }));
    });
    expect(helpNow()).toBe(HELP_ORIGINAL);
    expect(accepted()).toHaveLength(0);
    expect(fixItems()).toHaveLength(1);
    expect(screen.getAllByRole("status").some((n) => /could not be applied/.test(n.textContent ?? ""))).toBe(true);
  });
});

// The two patch sinks (the reducer's and the gallery host's) are ONE function
// (`applyPatchToWorkingCopy`); on Open an `ir` write goes into the files through
// the apply seam, and one that cannot be written silently reaches the author
// through OpenApplyHost (consent dialog or notice), never silently dropped.

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { act, cleanup, render, renderHook, screen } from "@testing-library/react";
import { I18nProvider } from "@lingui/react";
import { i18n } from "@lingui/core";
import { createVirtualFS, irPath, type StartKeyboard } from "@keyboard-studio/contracts";
import { devLog } from "@keyboard-studio/contracts/dev-log";
import { parseKmn } from "@keyboard-studio/engine";
import { useWorkingCopyStore } from "../stores/workingCopyStore.ts";
import { useOpenUndoStore } from "../stores/openUndoStore.ts";
import { useDecisionStore } from "../stores/decisionStore.ts";
import { decideGalleryValue, runGalleryApply } from "../steps/galleryHost.tsx";
import { buildDecisionSummaryBlock } from "@keyboard-studio/engine";
import { getDecisionSnapshot } from "../stores/decisionStore.ts";
import { useDecisionLogStore } from "../decisions/decisionLogStore.ts";
import deadkeysDefined from "../survey/questions/gallery/deadkeysDefined.ts";
import { useWorkingCopyTransform } from "../hooks/useWorkingCopyTransform.ts";
import { OpenApplyHost } from "../components/OpenApplyHost.tsx";
import { buildGalleryHostDeps } from "./galleryHostDeps.ts";
import { createStudioReducerDeps } from "./studioReducerDeps.ts";
import { projectWorkingCopyForOutput } from "./serializeWorkingCopy.ts";
import { applyPatchToWorkingCopy, irForApply } from "./applyPatchToWorkingCopy.ts";
import { readVfsText } from "./vfsText.ts";
import { scopeToWrites } from "./openApply/scopeToWrites.ts";
import { commitOverlay } from "./contextToleranceCommit.ts";

vi.mock("./services.ts", () => ({
  getToZip: vi.fn(async () => vi.fn(async () => new Uint8Array())),
  getPatternLibraryService: vi.fn(() => ({ getById: async () => undefined })),
  getPatternByIdSync: () => undefined,
}));

const ID = "tiny";
const KMN_PATH = `source/${ID}.kmn`;
const KMN = [
  "store(&NAME) 'Tiny'", "store(&VERSION) '10.0'", "", "begin Unicode > use(main)", "", "group(main) using keys",
  "+ [K_A] > 'a'", "+ [K_B] > 'b'", "",
].join("\r\n");
const KB = {
  id: ID, path: "release/t/tiny", script: "Latn", targets: ["desktop"],
  displayName: "Tiny", version: "1.0", languages: ["en"],
} as StartKeyboard;
const realReplace = useWorkingCopyStore.getState().replaceStartingPointFiles;

function open(): void {
  useOpenUndoStore.getState().clear();
  useDecisionStore.getState().reset();
  const vfs = createVirtualFS([
    { path: KMN_PATH, content: KMN, isBinary: false },
    { path: `source/${ID}.kps`, content: "<Package/>", isBinary: false },
  ]);
  const wc = useWorkingCopyStore.getState();
  wc.reset();
  wc.instantiateFromExisting(KB, { vfs, ir: parseKmn(KMN, ID).ir });
  wc.setFallbackPolicy("pass-through");
  wc.setAttribution({ authorName: "T", copyrightHolder: "T" });
}
const fileText = (): string => readVfsText(useWorkingCopyStore.getState().startVfs!, KMN_PATH)!;
const noVersion = (t: string): string =>
  t.split(/(?<=\n)/).filter((l) => !/&KEYBOARDVERSION|&VERSION/i.test(l)).join("");

function mountHost(): void {
  render(
    <I18nProvider i18n={i18n}>
      <OpenApplyHost><span /></OpenApplyHost>
    </I18nProvider>,
  );
}

/** A patch removing the K_B rule (a groups write, as a decision's apply returns it). */
function removeBPatch() {
  const groups = useWorkingCopyStore.getState().ir!.groups.map((g) => ({
    ...g,
    rules: g.rules.filter((r) => !JSON.stringify(r).includes("K_B")),
  }));
  return { ir: { groups } } as never;
}
const sinks = {
  reducer: () => createStudioReducerDeps({ instantiateFromStart: vi.fn(), clearTouchSeedChoice: vi.fn(), recordDecision: vi.fn() as never }).applyWorkingCopyPatch!,
  gallery: () => buildGalleryHostDeps().applyWorkingCopyPatch,
};

beforeEach(() => {
  i18n.load("en", {});
  i18n.activate("en");
  open();
});
afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
  useWorkingCopyStore.setState({ replaceStartingPointFiles: realReplace });
});

describe("one sink", () => {
  it("both deps use the same function", () => {
    expect(sinks.gallery()).toBe(applyPatchToWorkingCopy);
    expect(sinks.reducer()).toBe(applyPatchToWorkingCopy);
  });
});

describe("deadkeysDefined through the gallery host on Open", () => {
  it("writes the file, and the preview and download agree; one undo record", async () => {
    const value = { ops: [{ kind: "define", triggerKey: "e", id: 0x3001, accentChar: "́" }] } as never;
    runGalleryApply(deadkeysDefined, value, {
      ...buildGalleryHostDeps(),
    });
    const text = fileText();
    expect(text).not.toBe(KMN);
    expect(text).toMatch(/deadkey|dk\(/i);
    expect(useOpenUndoStore.getState().records).toHaveLength(1);
    const s = useWorkingCopyStore.getState();
    expect(s.ir).toBe(s.startIr);
    const { result } = renderHook(() => useWorkingCopyTransform({ previewedStartId: ID }));
    const preview = createVirtualFS(s.startVfs!.entries());
    result.current!(preview, ID);
    const projected = await projectWorkingCopyForOutput();
    expect(noVersion(readVfsText(preview, KMN_PATH)!)).toBe(noVersion(text));
    expect(noVersion(projected!.vfs.get(KMN_PATH)!.content as string)).toBe(noVersion(text));
  });
});

describe.each(Object.entries(sinks))("%s sink on Open: a change that needs consent or fails reaches the author", (_name, sink) => {
  const unplaceable = (): void => {
    for (const g of useWorkingCopyStore.getState().startIr!.groups) {
      for (const r of g.rules) delete (r as { sourceLine?: number }).sourceLine;
    }
  };

  it("needs consent: nothing is written yet, the dialog asks, agreeing writes it once", async () => {
    mountHost();
    unplaceable();
    await act(async () => { sink()(removeBPatch(), [irPath("groups")]); });
    expect(fileText()).toBe(KMN);
    await screen.findByTestId("reformat-consent-dialog");
    await act(async () => { screen.getByTestId("reformat-consent-agree").click(); });
    await vi.waitFor(() => expect(fileText()).not.toContain("[K_B]"));
    expect(fileText()).toContain("[K_A]");
    expect(useOpenUndoStore.getState().records).toHaveLength(1);
  });

  it("needs consent and the author declines: files unchanged, and the author is told", async () => {
    mountHost();
    unplaceable();
    await act(async () => { sink()(removeBPatch(), [irPath("groups")]); });
    await screen.findByTestId("reformat-consent-dialog");
    await act(async () => { screen.getByTestId("reformat-consent-keep").click(); });
    expect(fileText()).toBe(KMN);
    expect((await screen.findByTestId("open-apply-notice")).textContent).toContain("not applied");
  });

  it("fails: the author gets the could-not-be-applied notice and the files are unchanged", async () => {
    mountHost();
    useWorkingCopyStore.setState({
      replaceStartingPointFiles: () => {
        throw new Error("boom");
      },
    });
    await act(async () => { sink()(removeBPatch(), [irPath("groups")]); });
    expect((await screen.findByTestId("open-apply-notice")).textContent).toContain("could not be applied");
    expect(fileText()).toBe(KMN);
  });

  it("with no host mounted the change is reported, not dropped silently", () => {
    const warn = vi.spyOn(devLog, "warn").mockImplementation(() => {});
    useWorkingCopyStore.setState({
      replaceStartingPointFiles: () => {
        throw new Error("boom");
      },
    });
    sink()(removeBPatch(), [irPath("groups")]);
    expect(warn).toHaveBeenCalledWith(expect.stringContaining("not written to the files"));
  });
});

describe("a declined or failed change is taken back out of the record", () => {
  const DEFINE = { ops: [{ kind: "define", triggerKey: "e", id: 0x3001, accentChar: "́" }] } as never;
  const EARLIER = { ops: [{ kind: "define", triggerKey: "e", id: 0x3002, accentChar: "̀" }] } as never;
  const unplaceable = (): void => {
    for (const g of useWorkingCopyStore.getState().startIr!.groups) {
      for (const r of g.rules) delete (r as { sourceLine?: number }).sourceLine;
    }
  };
  /** Decide through the gallery host, then (as the step's recorder does after the sink) append the trail entry. */
  async function decide(value: never): Promise<void> {
    await act(async () => {
      decideGalleryValue(deadkeysDefined, value, { provenance: "asked" }, "deadkeys", buildGalleryHostDeps());
      useDecisionLogStore.getState().append({
        stepId: "deadkeys",
        payload: { kind: "decision", decisionId: "deadkeys-defined", value: value as never, summary: "defines a deadkey" },
        provenance: "asked",
      });
    });
  }
  const listed = (): boolean => buildDecisionSummaryBlock(useDecisionLogStore.getState().read()).includes("defines a deadkey");

  beforeEach(() => useDecisionLogStore.getState().reset());

  it("decline: a newly recorded decision is removed, the trail and PR summary do not list it, and a later compose does not re-attempt it", async () => {
    mountHost();
    unplaceable();
    await decide(DEFINE);
    expect(getDecisionSnapshot()["deadkeys-defined"]).toBeDefined(); // recorded while the dialog is open
    await screen.findByTestId("reformat-consent-dialog");
    await act(async () => { screen.getByTestId("reformat-consent-keep").click(); });
    await vi.waitFor(() => expect(getDecisionSnapshot()["deadkeys-defined"]).toBeUndefined());
    expect(listed()).toBe(false);
    expect(useDecisionLogStore.getState().read().entries).toHaveLength(0);
    // pass 2 composes from the recorded decisions: nothing left to re-attempt
    expect(deadkeysDefined.apply(undefined, { ir: useWorkingCopyStore.getState().ir, writes: deadkeysDefined.writes, decisions: getDecisionSnapshot(), currentHistoryEntryState: null })).toEqual({});
    expect(fileText()).toBe(KMN);
  });

  it("decline: an earlier answer is put back as it was", async () => {
    mountHost();
    runGalleryApply(deadkeysDefined, EARLIER, buildGalleryHostDeps()); // placed precisely
    useDecisionStore.getState().record({ id: "deadkeys-defined", value: EARLIER, provenance: "asked" });
    const before = getDecisionSnapshot()["deadkeys-defined"];
    unplaceable();
    await decide({ ops: [{ kind: "define", triggerKey: "o", id: 0x3001, accentChar: "̂" }] } as never);
    await screen.findByTestId("reformat-consent-dialog");
    await act(async () => { screen.getByTestId("reformat-consent-keep").click(); });
    await vi.waitFor(() => expect(getDecisionSnapshot()["deadkeys-defined"]).toEqual(before));
  });

  it("failed: the record is put back too", async () => {
    mountHost();
    useWorkingCopyStore.setState({
      replaceStartingPointFiles: () => {
        throw new Error("boom");
      },
    });
    await decide(DEFINE);
    await vi.waitFor(() => expect(getDecisionSnapshot()["deadkeys-defined"]).toBeUndefined());
    expect(listed()).toBe(false);
  });

  it("agree: the decision stays recorded and the change is applied", async () => {
    mountHost();
    unplaceable();
    await decide(DEFINE);
    await screen.findByTestId("reformat-consent-dialog");
    await act(async () => { screen.getByTestId("reformat-consent-agree").click(); });
    await vi.waitFor(() => expect(fileText()).not.toBe(KMN));
    expect(getDecisionSnapshot()["deadkeys-defined"]).toBeDefined();
    expect(listed()).toBe(true);
  });

  it("a queued change is not applied over a later one: it no longer applies, the later change stays, the record is put back", async () => {
    mountHost();
    unplaceable();
    await decide(DEFINE);
    await screen.findByTestId("reformat-consent-dialog");
    // meanwhile another change is applied precisely
    const edited = fileText().replace("+ [K_B] > 'b'", "+ [K_B] > 'b'\r\n+ [K_C] > 'c'");
    expect((await import("./openApply.ts")).applyOpenChange({ kind: "files", files: { [KMN_PATH]: edited }, label: "Edit" }).status).toBe("applied");
    await act(async () => { screen.getByTestId("reformat-consent-agree").click(); });
    await vi.waitFor(() => expect(getDecisionSnapshot()["deadkeys-defined"]).toBeUndefined());
    expect(fileText()).toBe(edited); // the later change is untouched, nothing was reverted
    expect(fileText()).toContain("[K_C]");
    expect((await screen.findByTestId("open-apply-notice")).textContent).toContain("could not be applied");
  });

  it("a queued change and a later change to something it does not write are both in the file after the author agrees", async () => {
    mountHost();
    unplaceable();
    await decide(DEFINE);
    await screen.findByTestId("reformat-consent-dialog");
    // a later change to a file the queued change does not write
    expect((await import("./openApply.ts")).applyOpenChange({ kind: "files", files: { [`source/${ID}.kps`]: "<Package><!--two--></Package>" }, label: "Edit" }).status).toBe("applied");
    await act(async () => { screen.getByTestId("reformat-consent-agree").click(); });
    await vi.waitFor(() => expect(fileText()).toContain("dk(3001)"));
    expect(readVfsText(useWorkingCopyStore.getState().startVfs!, `source/${ID}.kps`)).toContain("two");
    expect(getDecisionSnapshot()["deadkeys-defined"]).toBeDefined();
  });

  it("a different rule in the same .kmn changed while a change waits: the waiting change is rejected, with the notice, and the later one stays", async () => {
    // The change writes whole `groups`, so any change to a rule in the file means it no longer applies.
    mountHost();
    unplaceable();
    await decide(DEFINE);
    await screen.findByTestId("reformat-consent-dialog");
    const edited = fileText().replace("+ [K_A] > 'a'", "+ [K_A] > 'A'");
    expect((await import("./openApply.ts")).applyOpenChange({ kind: "files", files: { [KMN_PATH]: edited }, label: "Edit" }).status).toBe("applied");
    await act(async () => { screen.getByTestId("reformat-consent-agree").click(); });
    await vi.waitFor(() => expect(getDecisionSnapshot()["deadkeys-defined"]).toBeUndefined());
    expect(fileText()).toBe(edited);
    expect((await screen.findByTestId("open-apply-notice")).textContent).toContain("could not be applied");
  });

  it("the author answers the same decision again while the change waits: declining the old one keeps the newer answer and its trail entry", async () => {
    mountHost();
    unplaceable();
    await decide(DEFINE);
    await screen.findByTestId("reformat-consent-dialog");
    const newer = { ops: [{ kind: "define", triggerKey: "o", id: 0x3005, accentChar: "̂" }] } as never;
    useDecisionStore.getState().record({ id: "deadkeys-defined", value: newer, provenance: "asked" });
    useDecisionLogStore.getState().append({
      stepId: "deadkeys",
      payload: { kind: "decision", decisionId: "deadkeys-defined", value: newer, summary: "newer answer" },
      provenance: "asked",
    });
    await act(async () => { screen.getByTestId("reformat-consent-keep").click(); });
    await screen.findByTestId("open-apply-notice");
    expect(getDecisionSnapshot()["deadkeys-defined"]?.value).toEqual(newer);
    expect(JSON.stringify(useDecisionLogStore.getState().read().entries)).toContain("newer answer");
  });
});

describe("writers of the working IR on Open", () => {
  const strayGroups = () =>
    useWorkingCopyStore.getState().ir!.groups.map((g, i) => (i === 0 ? { ...g, rules: [...g.rules, g.rules[0]!] } : g));

  it("scopeToWrites takes only the written subtrees from the next IR", () => {
    const base = parseKmn(KMN, ID).ir;
    const next = { ...base, groups: [], stores: [], header: { ...base.header, name: "Other" } };
    const out = scopeToWrites(base, next, [irPath("groups")]);
    expect(out.groups).toEqual([]);
    expect(out.stores).toBe(base.stores);
    expect(out.header).toBe(base.header);
    // A path below a leaf object keeps its siblings.
    const nested = scopeToWrites(base, next, [irPath("header", "name")]);
    expect(nested.header.name).toBe("Other");
    expect(nested.groups).toBe(base.groups);
  });

  it("a stray difference in the working IR outside the change's writes is never swept into the file, and is reported", () => {
    const error = vi.spyOn(devLog, "error").mockImplementation(() => {});
    useWorkingCopyStore.getState().setWorkingIR({ ...useWorkingCopyStore.getState().ir!, groups: strayGroups() });
    sinks.gallery()({ ir: { raw: useWorkingCopyStore.getState().ir!.raw } } as never, [irPath("raw")]);
    expect(fileText()).toBe(KMN);
    expect(error).toHaveBeenCalledWith(expect.stringContaining("bypassed the apply seam"));
  });

  it("no report while the working IR is the file's parse", () => {
    const error = vi.spyOn(devLog, "error").mockImplementation(() => {});
    sinks.gallery()(removeBPatch(), [irPath("groups")]);
    expect(error).not.toHaveBeenCalled();
    expect(fileText()).not.toContain("K_B");
  });

  it("a context-tolerance commit on Open holds the overlay only and leaves the working IR as the file's parse", () => {
    commitOverlay({ fingerprint: "f", acceptedSiteIds: [], overlay: { batches: [] } });
    const s = useWorkingCopyStore.getState();
    expect(s.ir).toBe(s.startIr);
    expect(s.contextToleranceOverlay?.fingerprint).toBe("f");
  });

  it("a header.copyright write on Open changes no file, is reported, and the attribution channel still lands", () => {
    const warn = vi.spyOn(devLog, "warn").mockImplementation(() => {});
    sinks.reducer()(
      { ir: { header: { copyright: "(c) Someone" } }, attribution: { authorName: "A", copyrightHolder: "H" } } as never,
      [irPath("header", "copyright")],
    );
    expect(fileText()).toBe(KMN);
    expect(warn).toHaveBeenCalledWith(expect.stringContaining("header.copyright"));
    expect(useWorkingCopyStore.getState().attribution?.copyrightHolder).toBe("H");
  });

  it("a deadkey surface write on Open (overlay held) is not carried into the file by a later unrelated groups patch", () => {
    const wc = useWorkingCopyStore.getState();
    const strayIr = { ...wc.ir!, groups: strayGroups() };
    wc.setWorkingIR(strayIr); // what DeadkeySurface does beside its overlay op
    wc.commitDeadkeyOp({ kind: "define", triggerKey: "e", id: 0x3009, accentChar: "́" } as never);
    vi.spyOn(devLog, "error").mockImplementation(() => {});
    const base = irForApply()!;
    const groups = base.groups.map((g) => ({ ...g, rules: g.rules.filter((r) => !JSON.stringify(r).includes("K_B")) }));
    sinks.gallery()({ ir: { groups } } as never, [irPath("groups")]);
    expect(fileText()).not.toContain("K_B");
    expect(fileText().match(/\[K_A\]/g)).toHaveLength(1); // the stray duplicate never reached the file
    expect(useWorkingCopyStore.getState().deadkeyOverlay.ops).toHaveLength(1); // the overlay still replays it at output
  });

  it("a stray difference is reported even while a deadkey overlay is held", () => {
    const error = vi.spyOn(devLog, "error").mockImplementation(() => {});
    const wc = useWorkingCopyStore.getState();
    wc.setWorkingIR({ ...wc.ir!, groups: strayGroups() });
    wc.commitDeadkeyOp({ kind: "define", triggerKey: "e", id: 0x3009, accentChar: "́" } as never);
    sinks.gallery()({ ir: { raw: wc.ir!.raw } } as never, [irPath("raw")]);
    expect(error).toHaveBeenCalled();
  });
});

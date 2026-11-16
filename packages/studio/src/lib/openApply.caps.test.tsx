// An answered caps decision on a keyboard opened for update is written into the
// files when it is answered (spec 111 "live files", FR-041), through the apply seam's
// `caps` kind: one undo record, consent asked at apply time when the splice cannot
// place it precisely (FR-009), a declined answer rolled back out of the decision
// record, and nothing left for the output to replay. Copy is unchanged (FR-030).

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { act, cleanup, render, screen } from "@testing-library/react";
import { I18nProvider } from "@lingui/react";
import { i18n } from "@lingui/core";
import { createVirtualFS, type StartKeyboard, type VirtualFS } from "@keyboard-studio/contracts";
import { parseKmn } from "@keyboard-studio/engine";
import { useWorkingCopyStore } from "../stores/workingCopyStore.ts";
import { clearOpenSession, useOpenUndoStore } from "../stores/openUndoStore.ts";
import { getDecisionSnapshot, useDecisionStore } from "../stores/decisionStore.ts";
import { decideGalleryValue } from "../steps/galleryHost.tsx";
import capsHandlingModule from "../survey/questions/gallery/capsHandling.ts";
import { OpenApplyHost } from "../components/OpenApplyHost.tsx";
import { buildGalleryHostDeps } from "./galleryHostDeps.ts";
import { projectWorkingCopyVfs } from "./projectWorkingCopyVfs.ts";
import { PROJECTION_STEPS } from "./projectionSteps.ts";
import { applyOpenChange, undoLastOpenApply } from "./openApply.ts";
import { readVfsText } from "./vfsText.ts";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { expectSc010 } from "../test/openSc010.ts";
import { CapsHandlingRenderer } from "../survey/caps/CapsHandlingRenderer.tsx";

const control = vi.hoisted(() => ({ forceSkipped: false }));
vi.mock("./projectWorkingCopyVfs.ts", async (importOriginal) => {
  const real = await importOriginal<typeof import("./projectWorkingCopyVfs.ts")>();
  return {
    ...real,
    // The caps step reports its own failure as this warning and leaves the file.
    projectWorkingCopyVfs: (input: Parameters<typeof real.projectWorkingCopyVfs>[0]) => {
      const result = real.projectWorkingCopyVfs(input);
      return control.forceSkipped
        ? { ...result, warnings: [...result.warnings, "[project-working-copy] caps handling projection skipped: boom"] }
        : result;
    },
  };
});
vi.mock("./services.ts", () => ({
  getToZip: vi.fn(async () => vi.fn(async () => new Uint8Array())),
  getPatternLibraryService: vi.fn(() => ({ getById: async () => undefined })),
  getPatternByIdSync: () => undefined,
}));

const ID = "tiny";
const KMN_PATH = `source/${ID}.kmn`;
const KB = {
  id: ID, path: "release/t/tiny", script: "Latn", targets: ["desktop"],
  displayName: "Tiny", version: "1.0", languages: ["en"],
} as StartKeyboard;

/** A keyboard the splice places precisely (CRLF, a trailing comment, caps rules). */
const SPLICEABLE = [
  "c hand-written",
  "store(&NAME) 'Tiny'",
  "begin Unicode > use(main)",
  "group(main) using keys",
  "+ [K_A] > 'a'   c keep this spacing",
  "+ [SHIFT K_A] > 'A'",
  "+ [CAPS K_A] > 'A'",
  "",
].join("\r\n");
/** No `&NAME` store: the store write has no place to go, so the splice needs the author's agreement. */
const UNSPLICEABLE = ["begin Unicode > use(main)", "group(main) using keys", "+ [K_A] > 'a'", "+ [CAPS K_A] > 'A'", ""].join("\n");

let initial: VirtualFS;
function open(kmn: string, extraFiles: Array<{ path: string; content: string }> = []): void {
  clearOpenSession();
  useDecisionStore.getState().reset();
  const entries = [
    { path: KMN_PATH, content: kmn, isBinary: false },
    { path: `source/${ID}.kps`, content: "<Package/>", isBinary: false },
    ...extraFiles.map((f) => ({ ...f, isBinary: false })),
  ];
  initial = createVirtualFS(entries);
  const wc = useWorkingCopyStore.getState();
  wc.reset();
  wc.instantiateFromExisting(KB, { vfs: createVirtualFS(entries), ir: parseKmn(kmn, ID).ir });
  wc.setAttribution({ authorName: "T", copyrightHolder: "T" });
  wc.setFallbackPolicy("pass-through");
  // A cased alphabet, so the caps decision is asked at all.
  useDecisionStore.getState().record({ id: "character-inventory", value: { chars: ["a", "b", "A", "B"] }, provenance: "asked" } as never);
}
const fileText = (): string => readVfsText(useWorkingCopyStore.getState().startVfs!, KMN_PATH)!;
const records = () => useOpenUndoStore.getState().records;
const answer = (mode: "cased-keys" | "explicit-rules" | "none", provenance: "asked" | "default" = "asked") =>
  decideGalleryValue(capsHandlingModule, { mode }, { provenance }, "layout", buildGalleryHostDeps());

function mountHost(): void {
  render(
    <I18nProvider i18n={i18n}>
      <OpenApplyHost><span /></OpenApplyHost>
    </I18nProvider>,
  );
}

beforeEach(() => {
  control.forceSkipped = false;
  i18n.load("en", {});
  i18n.activate("en");
});
afterEach(() => cleanup());

describe("the caps apply kind on a spliceable .kmn", () => {
  beforeEach(() => open(SPLICEABLE));

  it("writes the store and rules into the file as one undo record that undoes byte-identically", () => {
    const result = applyOpenChange({ kind: "caps", value: { mode: "cased-keys" } });
    expect(result.status).toBe("applied");
    const out = fileText();
    expect(out).toContain("&CasedKeys");
    // A splice, not a re-emit: lines the step has no reason to touch are byte-identical, CRLF kept.
    expect(out).toContain("c hand-written\r\n");
    expect(out).toContain("+ [K_A] > 'a'   c keep this spacing\r\n");
    expect(out).not.toMatch(/[^\r]\n/);
    expect(records()).toHaveLength(1);
    expect(records()[0]).toMatchObject({ labelKey: "caps", label: "Apply caps handling" });

    expect(undoLastOpenApply().ok).toBe(true);
    expect(fileText()).toBe(SPLICEABLE);
    expect(records()).toHaveLength(0);
  });

  it("applying the same answer again changes nothing; explicit-rules writes nothing", () => {
    applyOpenChange({ kind: "caps", value: { mode: "cased-keys" } });
    expect(applyOpenChange({ kind: "caps", value: { mode: "cased-keys" } }).status).toBe("unchanged");
    expect(records()).toHaveLength(1);
    open(SPLICEABLE);
    expect(applyOpenChange({ kind: "caps", value: { mode: "explicit-rules" } }).status).toBe("unchanged");
    expect(fileText()).toBe(SPLICEABLE);
    expect(records()).toHaveLength(0);
  });

  it("the output on Open no longer runs the caps step", () => {
    const s = useWorkingCopyStore.getState();
    const vfs = createVirtualFS(s.startVfs!.entries());
    projectWorkingCopyVfs({
      vfs, keyboardId: ID, startIr: s.startIr!, deletedNodeIds: new Set(), assignments: [], getPattern: () => undefined,
      identity: null, capsHandling: { mode: "cased-keys" },
      openMode: { kps: { nameEdited: false }, steps: PROJECTION_STEPS.output, consentedReemit: true },
    });
    expect(readVfsText(vfs, KMN_PATH)).toBe(SPLICEABLE);
  });

  it("answering through the gallery host writes at answer time; code view, preview and download agree (SC-010)", async () => {
    answer("cased-keys");
    expect(fileText()).toContain("&CasedKeys");
    expect(records()).toHaveLength(1);
    await expectSc010({ fetched: initial, id: ID }, [KMN_PATH], "answered caps");
    expect(undoLastOpenApply().ok).toBe(true);
    expect(fileText()).toBe(SPLICEABLE);
    await expectSc010({ fetched: initial, id: ID }, [KMN_PATH], "undone caps");
  });

  it("a seeded default is a record, not a change: nothing is written", () => {
    answer("cased-keys", "default");
    expect(fileText()).toBe(SPLICEABLE);
    expect(records()).toHaveLength(0);
  });
});

describe("the none mode and the touch layout on Open", () => {
  it("none removes the caps rules at answer time: one record, undo byte-identical, SC-010", async () => {
    open(SPLICEABLE);
    answer("none");
    expect(fileText()).not.toContain("[CAPS K_A]");
    expect(fileText()).not.toContain("&CasedKeys");
    expect(fileText()).toContain("c hand-written\r\n");
    expect(records()).toHaveLength(1);
    await expectSc010({ fetched: initial, id: ID }, [KMN_PATH], "caps none");
    expect(undoLastOpenApply().ok).toBe(true);
    expect(fileText()).toBe(SPLICEABLE);
  });

  it("cased-keys on a keyboard with a touch layout also writes the caps layer: code view, preview and download agree (SC-010)", async () => {
    const dir = resolve(process.cwd(), "../engine/src/caps/__fixtures__/upstream_basic_kbdus");
    const touchPath = `source/${ID}.keyman-touch-layout`;
    open(readFileSync(resolve(dir, "basic_kbdus.kmn"), "utf8"), [
      { path: touchPath, content: readFileSync(resolve(dir, "basic_kbdus.keyman-touch-layout"), "utf8") },
    ]);
    const touchBefore = readVfsText(useWorkingCopyStore.getState().startVfs!, touchPath)!;
    answer("cased-keys");
    expect(records()).toHaveLength(1);
    expect(fileText()).toContain("&CasedKeys");
    const touchAfter = readVfsText(useWorkingCopyStore.getState().startVfs!, touchPath)!;
    expect(touchAfter).not.toBe(touchBefore);
    expect(touchAfter).toContain('"caps"');
    expect(Object.keys(records()[0]!.files)).toContain(touchPath);
    await expectSc010({ fetched: initial, id: ID }, [KMN_PATH, touchPath], "caps cased-keys with touch");
    expect(undoLastOpenApply().ok).toBe(true);
    expect(readVfsText(useWorkingCopyStore.getState().startVfs!, touchPath)).toBe(touchBefore);
  });
});

describe("a caps step that reports it was skipped is a failed apply", () => {
  beforeEach(() => open(SPLICEABLE));

  it("the seam fails and writes nothing", () => {
    control.forceSkipped = true;
    expect(applyOpenChange({ kind: "caps", value: { mode: "cased-keys" } })).toMatchObject({ status: "failed" });
    expect(fileText()).toBe(SPLICEABLE);
    expect(records()).toHaveLength(0);
  });

  it("answering: the notice says it could not be applied and the decision is rolled back", async () => {
    mountHost();
    control.forceSkipped = true;
    await act(async () => { answer("cased-keys"); });
    expect((await screen.findByTestId("open-apply-notice")).textContent).toContain("could not be applied");
    expect(fileText()).toBe(SPLICEABLE);
    expect(records()).toHaveLength(0);
    await vi.waitFor(() => expect(getDecisionSnapshot()["caps-handling"]).toBeUndefined());
  });
});

describe("the caps answer on a .kmn the splice cannot place", () => {
  beforeEach(() => open(UNSPLICEABLE));

  it("the seam asks first: nothing is written until consent, then one record", () => {
    expect(applyOpenChange({ kind: "caps", value: { mode: "cased-keys" } })).toMatchObject({ status: "needs-consent" });
    expect(fileText()).toBe(UNSPLICEABLE);
    expect(records()).toHaveLength(0);
    expect(applyOpenChange({ kind: "caps", value: { mode: "cased-keys" } }, { consentedReemit: true }).status).toBe("applied");
    expect(fileText()).toContain("&CasedKeys");
    expect(records()).toHaveLength(1);
  });

  it("asked at answer time; declining writes nothing and rolls the decision back", async () => {
    mountHost();
    await act(async () => { answer("cased-keys"); });
    await screen.findByTestId("reformat-consent-dialog");
    expect(fileText()).toBe(UNSPLICEABLE);
    await act(async () => { screen.getByTestId("reformat-consent-keep").click(); });
    expect(fileText()).toBe(UNSPLICEABLE);
    expect(records()).toHaveLength(0);
    expect(getDecisionSnapshot()["caps-handling"]).toBeUndefined();
    expect((await screen.findByTestId("open-apply-notice")).textContent).toContain("not applied");
  });

  it("agreeing writes it once and keeps the decision", async () => {
    mountHost();
    await act(async () => { answer("cased-keys"); });
    await screen.findByTestId("reformat-consent-dialog");
    await act(async () => { screen.getByTestId("reformat-consent-agree").click(); });
    await vi.waitFor(() => expect(fileText()).toContain("&CasedKeys"));
    expect(records()).toHaveLength(1);
    expect(getDecisionSnapshot()["caps-handling"]?.value).toEqual({ mode: "cased-keys" });
  });
});

describe("Copy is unchanged", () => {
  it("recording the answer on a working copy not opened for update writes nothing through the seam", () => {
    clearOpenSession();
    useDecisionStore.getState().reset();
    useWorkingCopyStore.getState().reset();
    buildGalleryHostDeps().recordDecision({ id: "caps-handling", value: { mode: "cased-keys" }, provenance: "asked" } as never);
    expect(records()).toHaveLength(0);
    expect(getDecisionSnapshot()["caps-handling"]?.value).toEqual({ mode: "cased-keys" });
  });
});

describe("the note when the answer moves away from rules already written", () => {
  beforeEach(() => open(SPLICEABLE));
  const view = () => render(
    <I18nProvider i18n={i18n}><CapsHandlingRenderer value={{ mode: "explicit-rules" }} onChange={() => {}} provenance="asked" /></I18nProvider>,
  );

  it("is shown, politely, once explicit-rules follows an answer that wrote rules", async () => {
    answer("cased-keys");
    answer("explicit-rules");
    view();
    const note = await screen.findByTestId("caps-kept-rules");
    expect(note.getAttribute("role")).toBe("status");
    expect(note.textContent).toContain("Use Undo");
  });

  it("is not shown when nothing was written, or after the write is undone", () => {
    answer("explicit-rules");
    view();
    expect(screen.getByTestId("caps-kept-rules").textContent).toBe("");
    cleanup();
    answer("cased-keys");
    undoLastOpenApply();
    view();
    expect(screen.getByTestId("caps-kept-rules").textContent).toBe("");
  });
});

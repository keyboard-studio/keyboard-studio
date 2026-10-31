// Spec 102 US4: an adaptation (Track 2) keeps the original keyboard's
// welcome/help prose first and adds the generated sections after it, inside
// the ks:generated markers. A Copy (Track 1) carries none of the original
// prose. A start page that already has a typing table suppresses the guide;
// an earlier generated block is replaced, never stacked.
//
// Real engine renderers run; services.ts is mocked to avoid WASM / network
// I/O, as in serializeWorkingCopy.stubCompletion.test.ts.

import { beforeEach, describe, expect, it, vi } from "vitest";
import { createVirtualFS } from "@keyboard-studio/contracts";
import { basicKbdus } from "@keyboard-studio/contracts/fixtures";
import { DOC_GENERATED_END, DOC_GENERATED_START } from "@keyboard-studio/engine";
import { useWorkingCopyStore } from "../stores/workingCopyStore.ts";
import { projectWorkingCopyForOutput } from "./serializeWorkingCopy.ts";
import { readVfsText } from "./vfsText.ts";
import { DEADKEY_RIGHT_ALT_FIXTURE } from "./docContent.fixtures.ts";

vi.mock("./services.ts", () => ({
  getToZip: vi.fn(async () => vi.fn(async () => new Uint8Array())),
  getPatternLibraryService: vi.fn(() => ({ getById: async () => undefined })),
}));

const KEYBOARD_ID = basicKbdus.id;
const WELCOME_PATH = "source/welcome/welcome.htm";
const HELP_PATH = `source/help/${KEYBOARD_ID}.php`;

const ORIGINAL_WELCOME = "<html><body><p>Original welcome prose.</p></body></html>";
const ORIGINAL_HELP = "<?php require_once('header.php'); ?>\n<p>Original help prose.</p>";

function fixtureVfs() {
  return createVirtualFS([
    { path: `source/${KEYBOARD_ID}.kmn`, content: DEADKEY_RIGHT_ALT_FIXTURE.kmn, isBinary: false },
  ]);
}

function adapt(welcome: string | null, help: string | null): void {
  const store = useWorkingCopyStore.getState();
  store.instantiateFromExisting(basicKbdus, { vfs: fixtureVfs(), ir: DEADKEY_RIGHT_ALT_FIXTURE.ir });
  store.setStartWelcomeHtmText(welcome);
  store.setStartHelpPhpText(help);
}

async function project(): Promise<{ welcome: string; help: string }> {
  const projected = await projectWorkingCopyForOutput();
  expect(projected).not.toBeNull();
  return {
    welcome: readVfsText(projected!.vfs, WELCOME_PATH)!,
    help: readVfsText(projected!.vfs, HELP_PATH)!,
  };
}

function countOf(text: string, needle: string): number {
  return text.split(needle).length - 1;
}

beforeEach(() => {
  vi.clearAllMocks();
});

describe("Track 2 keeps the original documentation (spec 102 US4)", () => {
  it("puts the original prose first and the generated sections after it, inside the markers", async () => {
    adapt(ORIGINAL_WELCOME, ORIGINAL_HELP);
    const { welcome, help } = await project();

    for (const [page, prose] of [
      [welcome, "Original welcome prose."],
      [help, "Original help prose."],
    ] as const) {
      expect(countOf(page, DOC_GENERATED_START)).toBe(1);
      expect(countOf(page, DOC_GENERATED_END)).toBe(1);
      const start = page.indexOf(DOC_GENERATED_START);
      const end = page.indexOf(DOC_GENERATED_END);
      expect(page.indexOf(prose)).toBeGreaterThan(-1);
      expect(page.indexOf(prose)).toBeLessThan(start);
      const block = page.slice(start, end);
      expect(block).toContain("<h2>Typing Guide</h2>");
      expect(block).toContain("<h2>How This Keyboard Works</h2>");
      expect(block).toContain("<h2>Characters on This Keyboard</h2>");
    }
  });

  it("omits the typing guide when an original table covers at least half its characters, keeping the other sections", async () => {
    // The fixture's guide lists é and ŋ; this table holds é, so 1 of 2 (50 %).
    const withTable =
      "<html><body><p>Original welcome prose.</p><table><tr><td>é</td><td>' then e</td></tr></table></body></html>";
    adapt(withTable, null);
    const { welcome, help } = await project();

    for (const page of [welcome, help]) {
      expect(page).not.toContain("<h2>Typing Guide</h2>");
      expect(page).toContain("<h2>How This Keyboard Works</h2>");
      expect(page).toContain("<h2>Characters on This Keyboard</h2>");
      expect(countOf(page, "Original welcome prose.")).toBe(1);
    }
  });

  it("keeps the typing guide when an original table covers less than half its characters", async () => {
    adapt("<html><body><ul><li>x</li></ul></body></html>", null);
    const { welcome } = await project();
    expect(welcome).toContain("<h2>Typing Guide</h2>");
  });

  it("replaces a generated block the original already carries, so the sections appear once", async () => {
    const earlier = `<html><body><p>Original welcome prose.</p>${DOC_GENERATED_START}\n<h2>Typing Guide</h2><p>stale</p>\n${DOC_GENERATED_END}\n</body></html>`;
    adapt(earlier, null);
    const { welcome } = await project();

    expect(countOf(welcome, DOC_GENERATED_START)).toBe(1);
    expect(countOf(welcome, "<h2>Typing Guide</h2>")).toBe(1);
    expect(welcome).not.toContain("stale");
    expect(countOf(welcome, "Original welcome prose.")).toBe(1);
  });

  it("gives byte-identical files on two productions", async () => {
    adapt(ORIGINAL_WELCOME, ORIGINAL_HELP);
    const first = await project();
    const second = await project();
    expect(second).toEqual(first);
  });
});

describe("Track 1 carries none of the original prose (spec 102 FR-032)", () => {
  it("renders the generated sections with no markers and no inherited text", async () => {
    const store = useWorkingCopyStore.getState();
    store.instantiateFromStart(basicKbdus, { vfs: fixtureVfs(), ir: DEADKEY_RIGHT_ALT_FIXTURE.ir });
    // The loader clears the prose slices on the copy path (useKeyboardArtifact).
    store.setStartWelcomeHtmText(null);
    store.setStartHelpPhpText(null);
    const { welcome, help } = await project();

    for (const page of [welcome, help]) {
      expect(page).not.toContain("Original");
      expect(page).not.toContain(DOC_GENERATED_START);
      expect(page).toContain("<h2>Typing Guide</h2>");
    }
  });

  it("ignores start-page prose a copy's store still holds, rendering the fresh pages", async () => {
    // A view-only artifact run (the Compare screen) or a re-pick at the
    // starting-keyboard step can refill the prose slices after the copy
    // scaffold cleared them. The projection must not trust the slices alone.
    const store = useWorkingCopyStore.getState();
    store.instantiateFromStart(basicKbdus, { vfs: fixtureVfs(), ir: DEADKEY_RIGHT_ALT_FIXTURE.ir });
    store.setStartWelcomeHtmText(ORIGINAL_WELCOME);
    store.setStartHelpPhpText(ORIGINAL_HELP);
    const { welcome, help } = await project();

    for (const page of [welcome, help]) {
      expect(page).not.toContain("Original");
      expect(page).not.toContain(DOC_GENERATED_START);
      expect(page).toContain("<h2>Typing Guide</h2>");
    }
    expect(welcome).toContain("<title>Start Using ");
    expect(countOf(welcome, "<h1")).toBe(1);
  });
});

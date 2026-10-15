// Spec 102 US3: the documentation forms' guarantees, end to end over the real
// output projection. The mechanics live in the engine (renderDocForm,
// helpDocsRender) and the content in doc-forms.json; this proves what a
// downloaded package actually carries, for every fixture keyboard.

import { beforeEach, describe, expect, it, vi } from "vitest";
import { createVirtualFS, DOC_FORMS } from "@keyboard-studio/contracts";
import { basicKbdus } from "@keyboard-studio/contracts/fixtures";
import { useWorkingCopyStore } from "../stores/workingCopyStore.ts";
import { projectWorkingCopyForOutput } from "./serializeWorkingCopy.ts";
import { readVfsText } from "./vfsText.ts";
import { DEADKEY_RIGHT_ALT_FIXTURE, DOC_FIXTURES, type DocFixture } from "./docContent.fixtures.ts";

vi.mock("./services.ts", () => ({
  getToZip: vi.fn(async () => vi.fn(async () => new Uint8Array())),
  getPatternLibraryService: vi.fn(() => ({ getById: async () => undefined })),
}));

// A swappable `body` form, so one test can edit a heading the way the content
// team would, with no engine code touched (SC-006). Every other test sees the
// shipped form.
const forms = vi.hoisted(() => ({ bodyOverride: null as string | null }));
vi.mock("@keyboard-studio/contracts", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@keyboard-studio/contracts")>();
  const docForms = {
    mechanisms: actual.DOC_FORMS.mechanisms,
    forms: new Proxy(actual.DOC_FORMS.forms, {
      get: (target, key) =>
        key === "body" && forms.bodyOverride !== null ? forms.bodyOverride : Reflect.get(target, key),
    }),
  };
  return { ...actual, DOC_FORMS: docForms };
});

const HOLDER = "Doc Fixture Authors";
const KEYBOARD_ID = basicKbdus.id;

async function project(fixture: DocFixture, answers: Parameters<ReturnType<typeof useWorkingCopyStore.getState>["setHelpDocs"]>[0] | null) {
  const vfs = createVirtualFS([{ path: `source/${KEYBOARD_ID}.kmn`, content: fixture.kmn, isBinary: false }]);
  const wc = useWorkingCopyStore.getState();
  wc.instantiateFromStart(basicKbdus, { vfs, ir: fixture.ir });
  wc.setAttribution({ authorName: HOLDER, copyrightHolder: HOLDER });
  wc.setTouchLayoutJson(fixture.touchLayoutJson);
  wc.setHelpDocs(answers);
  const projected = await projectWorkingCopyForOutput();
  expect(projected).not.toBeNull();
  const read = (path: string): string => readVfsText(projected!.vfs, path) ?? "";
  return {
    readme: read("README.md"),
    readmeHtm: read("source/readme.htm"),
    welcome: read("source/welcome/welcome.htm"),
    help: read(`source/help/${KEYBOARD_ID}.php`),
    history: read("HISTORY.md"),
    license: read("LICENSE.md"),
    kps: read(`source/${KEYBOARD_ID}.kps`),
    kmn: read(`source/${KEYBOARD_ID}.kmn`),
  };
}

/** The welcome page's body: inside <body>, with the welcome-only layout section set aside. */
function welcomeBody(welcome: string): string {
  const inner = /<body>([\s\S]*)<\/body>/.exec(welcome)?.[1] ?? "";
  return inner.replace(/\n<h2>Keyboard Layout<\/h2>[\s\S]*$/, "");
}

/** The help page's body: the help-site header set aside. */
function helpBody(help: string): string {
  return help.replace(/^<\?php[\s\S]*?\?>\n/, "");
}

/** A rough well-formedness check for the generated pages: no raw `<` or `&` outside a tag or entity. */
function expectWellFormed(html: string): void {
  expect(html).not.toMatch(/&(?!(?:amp|lt|gt|quot|#\d+|#x[0-9a-f]+);)/i);
  const tags = html.match(/<[^>]*>/g) ?? [];
  for (const tag of tags) expect(tag).not.toMatch(/^<[^a-z/!?]/i);
}

beforeEach(() => {
  vi.clearAllMocks();
  forms.bodyOverride = null;
});

describe.each(DOC_FIXTURES.map((f) => [f.id, f] as const))("documentation forms on %s", (_id, fixture) => {
  it("states the version only in HISTORY.md and the year only in LICENSE.md", async () => {
    const docs = await project(fixture, null);
    expect(docs.history).toMatch(/^## 1\.0 \(/);
    const year = /Copyright © (\d{4})/.exec(docs.license)?.[1];
    expect(year).toBeDefined();
    for (const text of [docs.readme, docs.readmeHtm, docs.welcome, docs.help]) {
      expect(text).not.toMatch(/\b1\.0\b/);
      expect(text).not.toContain(year!);
    }
  });

  it("names one copyright holder everywhere a holder appears", async () => {
    const docs = await project(fixture, null);
    expect(docs.license).toContain(`Copyright © `);
    expect(docs.license).toContain(HOLDER);
    for (const text of [docs.license, docs.kps, docs.kmn, docs.readme, docs.readmeHtm, docs.welcome, docs.help]) {
      for (const m of text.matchAll(/(?:Copyright|©)\s*(?:©\s*)?(?:\d{4}(?:-\d{4})?\s+)?([^<\n'"]+)/g)) {
        expect(m[1]!.trim()).toContain(HOLDER);
      }
    }
  });

  it("gives welcome and help the same body", async () => {
    const docs = await project(fixture, {
      description: "A keyboard for testing.",
      usageTips: ["Press the keys."],
      credits: "Thanks.",
    });
    expect(welcomeBody(docs.welcome)).toBe(helpBody(docs.help));
  });

  it("with no answers, drops empty sections and ships complete documents", async () => {
    const docs = await project(fixture, null);
    expect(docs.welcome).not.toContain("Usage Tips");
    expect(docs.help).not.toContain("Usage Tips");
    expect(docs.welcome).not.toContain("<h2></h2>");
    // Not today's one-line placeholders: the README links its help page, and
    // the welcome and help pages carry the derived character list.
    expect(docs.readme).toContain("## Links");
    expect(docs.help).not.toContain("<?php /*");
    expect(welcomeBody(docs.welcome)).toContain("<h2>Characters on This Keyboard</h2>");
    expect(helpBody(docs.help)).toContain("<h2>Characters on This Keyboard</h2>");
    expectWellFormed(docs.welcome);
    expectWellFormed(docs.readmeHtm);
  });

  it("shows an answer containing < and & literally in a well-formed page", async () => {
    const docs = await project(fixture, { description: "Type <x> & <y>.", usageTips: ["a < b & c"] });
    for (const page of [docs.welcome, docs.help, docs.readmeHtm]) {
      expect(page).toContain("Type &lt;x&gt; &amp; &lt;y&gt;.");
      expectWellFormed(page);
    }
    expect(docs.welcome).toContain("a &lt; b &amp; c");
  });
});

describe("documentation forms are content-owned (SC-006)", () => {
  it("a heading edited in the body form appears on welcome and help and nowhere else", async () => {
    const before = await project(DEADKEY_RIGHT_ALT_FIXTURE, null);
    const shipped = DOC_FORMS.forms.body;
    forms.bodyOverride = shipped.replace("<h2>Typing Guide</h2>", "<h2>How to Type</h2>");
    expect(forms.bodyOverride).not.toBe(shipped);
    const after = await project(DEADKEY_RIGHT_ALT_FIXTURE, null);

    expect(after.welcome).toContain("<h2>How to Type</h2>");
    expect(after.help).toContain("<h2>How to Type</h2>");
    expect(after.welcome).toBe(before.welcome.replace("<h2>Typing Guide</h2>", "<h2>How to Type</h2>"));
    expect(after.help).toBe(before.help.replace("<h2>Typing Guide</h2>", "<h2>How to Type</h2>"));
    expect(after.readme).toBe(before.readme);
    expect(after.readmeHtm).toBe(before.readmeHtm);
    expect(after.license).toBe(before.license);
    expect(after.history).toBe(before.history);
  });
});

// Story 3 scenario 3 (spec 108 T070): the exported project builds. For each corpus export the
// keyboard3 document compiles to a `.kmx` and a `.kvk`, and the package descriptor builds a `.kmp`
// through the engine's own packager with no errors and package info equal to the metadata.
//
// A missing corpus is a failed precondition, never a skip.
import { createVirtualFS } from "@keyboard-studio/contracts";
import { strFromU8, unzipSync } from "fflate";
import { describe, expect, it } from "vitest";
import { buildKmp } from "../output/kmp.js";
import { CORPUS, loadCorpusKeyboard } from "./__testing__/corpus.js";
import { corpusAvailable, corpusExportInput, KEYBOARDS_ROOT } from "./__testing__/corpusExport.js";
import { keymanCompile } from "./__testing__/keymanCompile.js";
import { buildLdmlExport } from "./package.js";
import type { LdmlExportInput } from "./types.js";

describe("LDML project corpus: precondition", () => {
  it("the sibling ../keyboards corpus is present", () => {
    expect(corpusAvailable, `${KEYBOARDS_ROOT}/release is missing: the project corpus suite proves nothing without it`).toBe(true);
  });
});

interface KmpInfo {
  name?: { description?: string };
  copyright?: { description?: string };
  author?: { description?: string; url?: string };
  description?: { description?: string };
  website?: { description?: string; url?: string };
}

/** The corpus input, given the documentation a real export would carry. */
function withDocs(input: LdmlExportInput): LdmlExportInput {
  return {
    ...input,
    metadata: {
      ...input.metadata,
      author: "Corpus Author",
      authorEmail: "corpus@example.org",
      copyright: "Corpus Team",
      description: `The ${input.keyboardId} keyboard, exported to LDML.`,
      homePage: "https://example.org/corpus",
    },
    packageFiles: {
      readmeHtm: "<html><body>readme</body></html>",
      welcomeHtm: "<html><body>welcome</body></html>",
      licenseMd: "MIT License\n",
      readmeMd: "# Corpus\n",
      historyMd: "## 1.0\n",
      icon: null,
      fonts: [],
    },
  };
}

for (const entry of CORPUS) {
  if (!entry.profiles.includes(46)) continue;
  describe(`${entry.id}`, () => {
    it("builds a .kmx, a .kvk and a .kmp whose info equals the metadata", async () => {
      const kb = loadCorpusKeyboard(entry.id);
      expect(kb, `${entry.id} is not in the corpus checkout`).toBeDefined();
      if (kb?.kmn === undefined) {
        console.info(`[INFO] ${entry.id}: no KMN source (${entry.role}); not exported`);
        return;
      }
      const built = corpusExportInput(kb, "46");
      expect(built).not.toBeNull();
      const input = withDocs(built!.input);
      const result = await buildLdmlExport(input);
      expect(result.ok, `${entry.id}: export refused`).toBe(true);
      if (!result.ok) return;
      const id = input.metadata.projectId;

      const xml = result.files.get(`source/${id}.xml`) as string;
      const compiled = await keymanCompile(xml, { build: true });
      const errors = compiled.messages.filter((m) => m.severity === "error" || m.severity === "fatal");
      expect(errors.map((m) => m.code), `${entry.id}: keyman compile`).toEqual([]);
      expect(compiled.kmx?.byteLength ?? 0).toBeGreaterThan(0);
      expect(compiled.kvk?.byteLength ?? 0).toBeGreaterThan(0);

      const vfs = createVirtualFS();
      for (const [path, content] of result.files) vfs.set(path, content, typeof content !== "string");
      const kmp = await buildKmp(vfs, id, { kmx: compiled.kmx as Uint8Array, kvk: compiled.kvk as Uint8Array });
      const problems = kmp.diagnostics.filter((d) => d.severity === "error" || d.severity === "fatal");
      expect(problems.map((d) => `${d.code}: ${d.message}`), `${entry.id}: package build`).toEqual([]);
      expect(kmp.success).toBe(true);

      const members = unzipSync(kmp.bytes);
      const json = JSON.parse(strFromU8(members["kmp.json"] as Uint8Array)) as { info?: KmpInfo };
      const info = json.info ?? {};
      const m = input.metadata;
      expect(info.name?.description).toBe(m.name);
      expect(info.copyright?.description).toBe(m.copyright);
      expect(info.author?.description).toBe(m.author);
      expect(info.author?.url).toBe(`mailto:${m.authorEmail}`);
      // kmc-package renders the descriptor's description as a paragraph.
      expect((info.description?.description ?? "").replace(/^<p>|<\/p>$/g, "")).toBe(m.description);
      expect(info.website?.description).toBe(m.homePage);
      expect(Object.keys(members)).toEqual(expect.arrayContaining([`${id}.kmx`, `${id}.kvk`, "readme.htm", "welcome.htm", "LICENSE.md"]));
    }, 120_000);
  });
}

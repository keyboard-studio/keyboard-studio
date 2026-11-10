// One emit stage (spec 118 FR-014, SC-001): preview, download tree, source archive,
// pull-request path and LDML export read the same emitted .kmn text. Runs the real
// projection (no mock of it) over two fixture walks: the committed fullSpine
// keyboard (an opened keyboard with a carve) and the reference keyboard
// sil_euro_latin from the sibling corpus.

import { existsSync, readFileSync, readdirSync, statSync } from "node:fs";
import { dirname, join, relative, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { renderHook } from "@testing-library/react";
import { createVirtualFS, makeStartKeyboard } from "@keyboard-studio/contracts";
import type { VirtualFS } from "@keyboard-studio/contracts";
import { basicKbdus } from "@keyboard-studio/contracts/fixtures";
import { parseKmn } from "@keyboard-studio/engine";

// Capture what the archive path hands to the zipper; everything else is real.
const zipped = vi.hoisted(() => ({ vfs: undefined as VirtualFS | undefined }));
vi.mock("./serializeWorkingCopy.ts", async (importOriginal) => {
  const original = await importOriginal<typeof import("./serializeWorkingCopy.ts")>();
  return {
    ...original,
    zipProjectedVfs: vi.fn(async (vfs: VirtualFS) => {
      zipped.vfs = vfs;
      return new Uint8Array([1]);
    }),
  };
});
// The compiler is not under test: a stub hands back the one artifact the bundle needs.
vi.mock("./services.ts", async (importOriginal) => ({
  ...(await importOriginal<typeof import("./services.ts")>()),
  getToZip: vi.fn(async () => vi.fn(async () => new Uint8Array())),
  getPatternLibraryService: vi.fn(() => ({ getById: async () => undefined })),
  getCompile: vi.fn(async () =>
    vi.fn(async () => ({ diagnostics: [], artifacts: [{ filename: "k.kmx", data: new Uint8Array([1]) }] })),
  ),
}));

import { useWorkingCopyStore } from "../stores/workingCopyStore.ts";
import { useWorkingCopyTransform } from "../hooks/useWorkingCopyTransform.ts";
import { emitOutputTree } from "./emitAdapter.ts";
import { emitLdmlProjection } from "./ldmlExportInputs.ts";
import { buildSourceZipForDownload } from "./buildOutputBundle.ts";

const here = dirname(fileURLToPath(import.meta.url));
const CORPUS = resolve(here, "../../../../../keyboards/release");
const REF = { id: "sil_euro_latin", group: "sil" } as const;
const FULL_SPINE = readFileSync(join(here, "__fixtures__/flagParity/fullSpine.kmn"), "utf-8");

/** Every keyboard source .kmn in a tree, keyed by path (the download adds a generated tests/ stub of its own). */
function kmnTexts(vfs: VirtualFS | undefined): Record<string, string> {
  const out: Record<string, string> = {};
  for (const e of vfs?.entries() ?? []) {
    if (e.path.startsWith("source/") && e.path.endsWith(".kmn")) out[e.path] = String(e.content);
  }
  return out;
}

/** Only the download side stamps the release version; nothing else may differ. */
function stripVersion(texts: Record<string, string>): Record<string, string> {
  return Object.fromEntries(
    Object.entries(texts).map(([p, t]) => [
      p,
      t.split(/\r?\n/).filter((l) => !l.startsWith("store(&KEYBOARDVERSION)")).join("\n"),
    ]),
  );
}

function loadCorpusVfs(): VirtualFS {
  const root = join(CORPUS, REF.group, REF.id);
  const files: { path: string; content: string | Uint8Array; isBinary: boolean }[] = [];
  const binary = /\.(ico|png|jpg|jpeg|gif|kmx|kvk|ttf|woff2?)$/i;
  const walk = (dir: string): void => {
    for (const name of readdirSync(dir)) {
      const abs = join(dir, name);
      const rel = relative(root, abs).replaceAll("\\", "/");
      if (statSync(abs).isDirectory()) {
        if (rel === "build" || rel === ".git") continue;
        walk(abs);
      } else if (binary.test(rel)) {
        files.push({ path: rel, content: new Uint8Array(readFileSync(abs)), isBinary: true });
      } else {
        files.push({ path: rel, content: readFileSync(abs, "utf-8"), isBinary: false });
      }
    }
  };
  walk(root);
  return createVirtualFS(files);
}

async function expectAgreement(keyboardId: string, startVfs: VirtualFS): Promise<void> {
  const { result } = renderHook(() => useWorkingCopyTransform({ previewedStartId: keyboardId }));
  const previewVfs = createVirtualFS(startVfs.entries());
  result.current!(previewVfs, keyboardId);

  const tree = await emitOutputTree();
  const pullRequest = await emitOutputTree();
  const ldml = await emitLdmlProjection();
  zipped.vfs = undefined;
  await buildSourceZipForDownload();

  const reference = kmnTexts(tree?.vfs);
  expect(Object.keys(reference).length).toBeGreaterThan(0);
  expect(kmnTexts(pullRequest?.vfs)).toEqual(reference);
  expect(kmnTexts(ldml?.vfs)).toEqual(reference);
  expect(kmnTexts(zipped.vfs)).toEqual(reference);
  expect(stripVersion(kmnTexts(previewVfs))).toEqual(stripVersion(reference));
}

beforeEach(() => {
  useWorkingCopyStore.getState().reset?.();
});

describe("every output path reads the one emit stage", () => {
  it("agrees on the fullSpine keyboard opened with a carved rule", async () => {
    const id = basicKbdus.id;
    const { ir } = parseKmn(FULL_SPINE, id);
    const vfs = createVirtualFS([
      { path: `source/${id}.kmn`, content: FULL_SPINE, isBinary: false },
      { path: `source/${id}.kps`, content: "<Package></Package>\n", isBinary: false },
    ]);
    const wc = useWorkingCopyStore.getState();
    wc.instantiateFromExisting(basicKbdus, { vfs, ir });
    wc.setAttribution({ authorName: "T", copyrightHolder: "T" });
    const rule = ir.groups.flatMap((g) => g.rules)[0]!;
    wc.deleteNode(rule.nodeId);
    await expectAgreement(id, vfs);
  });

  it.skipIf(!existsSync(join(CORPUS, REF.group, REF.id)))(
    "agrees on the reference keyboard sil_euro_latin",
    async () => {
      const vfs = loadCorpusVfs();
      const kmn = String(vfs.get(`source/${REF.id}.kmn`)?.content);
      const { ir } = parseKmn(kmn, REF.id);
      const base = makeStartKeyboard({
        id: REF.id,
        script: "Latn",
        path: `release/${REF.group}/${REF.id}`,
        targets: ["windows"],
        displayName: REF.id,
        version: "1.0",
        languages: ["aae"],
      });
      const wc = useWorkingCopyStore.getState();
      wc.instantiateFromStart(base, { vfs, ir });
      wc.setAttribution({ authorName: "T", copyrightHolder: "T" });
      await expectAgreement(REF.id, vfs);
    },
    60_000,
  );
});

describe("the pull-request panel reads the adapter", () => {
  it("imports emitOutputTree and not the projection directly", () => {
    const src = readFileSync(join(here, "../components/ManagedPRSubmitPanel.tsx"), "utf-8");
    expect(src).toMatch(/from "\.\.\/lib\/emitAdapter\.ts"/);
    expect(src).not.toMatch(/import\s*\{[^}]*projectWorkingCopyForOutput[^}]*\}\s*from/);
  });
});

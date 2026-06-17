/**
 * Smoke-artifact generator — issue #54 (Day-7 E2E smoke with real Keyman Developer).
 *
 * Drives the real studio output pipeline end-to-end OUTSIDE the browser:
 *
 *   pick base keyboard → createScaffolderService().scaffold() → toZip()
 *
 * and writes a `.zip` that mirrors exactly what the studio's output service
 * would serialise (engine `toZip`, spec §12 VirtualFS layout). The zip is the
 * input artifact for AC #1/#2 of #54: extract it, open the `.kpj` in Keyman
 * Developer 17+, and Build.
 *
 * Why this exists: the studio download button already emits a `.zip` via
 * `toZip`; this generator exists to produce the same artifact reproducibly,
 * outside the browser, from a pinned base.
 *
 * Standalone CLI (modelled on utilities/supportability-scanner) — run with tsx:
 *   TSX_TSCONFIG_PATH=utilities/smoke-artifact/tsconfig.json \
 *     pnpm dlx tsx utilities/smoke-artifact/gen.ts [--base <id>] [--out <path>]
 */

import { readFileSync, writeFileSync, mkdirSync, existsSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";

import { createScaffolderService } from "../../packages/engine/src/scaffolder/index.ts";
import { toZip } from "../../packages/engine/src/output/zip.ts";
import { makeBaseKeyboard, type BaseKeyboard } from "@keyboard-studio/contracts";
import { silEuroLatin } from "@keyboard-studio/contracts/fixtures";
import type { FetchFn } from "../../packages/engine/src/loader/fetchKeyboardSourceToVfs.ts";

const HERE = dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = resolve(HERE, "..", "..");
const KEYBOARDS_ROOT = resolve(REPO_ROOT, "..", "keyboards");
const PROXY = "local:";

/**
 * Known bases that exist in the local keymanapp/keyboards clone.
 * Built via makeBaseKeyboard() so the entries satisfy BaseKeyboard at the type
 * level (no casts) — in particular `targets` must be KeymanPlatformTarget[],
 * not the free-form "any" this fixture originally used.
 */
const DESKTOP_AND_WEB = ["windows", "macosx", "linux", "web"] as const;

const BASES: Record<string, BaseKeyboard> = {
  khmer_angkor: makeBaseKeyboard({
    id: "khmer_angkor",
    path: "release/k/khmer_angkor",
    script: "Khmr",
    targets: [...DESKTOP_AND_WEB],
    displayName: "Khmer Angkor",
    version: "1.0",
  }),
  sil_euro_latin: silEuroLatin,
  akan: makeBaseKeyboard({
    id: "akan",
    path: "release/a/akan",
    script: "Latn",
    targets: [...DESKTOP_AND_WEB],
    displayName: "Akan",
    version: "1.0",
    languages: ["ak"],
  }),
};

/**
 * Map `${PROXY}/<path>` URLs to local reads under the keyboards clone.
 * The real loader's `init` (headers) is intentionally ignored — local-disk
 * reads have no use for them; flagged so a reviewer doesn't mistake the
 * single-arg signature for an oversight.
 */
const localFetch: FetchFn = async (url) => {
  const rel = url.startsWith(`${PROXY}/`) ? url.slice(`${PROXY}/`.length) : url;
  const abs = resolve(KEYBOARDS_ROOT, rel);
  if (!existsSync(abs)) {
    return {
      ok: false,
      status: 404,
      text: async () => "",
      arrayBuffer: async () => new ArrayBuffer(0),
    };
  }
  const buf = readFileSync(abs);
  return {
    ok: true,
    status: 200,
    text: async () => buf.toString("utf8"),
    arrayBuffer: async () =>
      buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength) as ArrayBuffer,
  };
};

function arg(name: string, fallback: string): string {
  const i = process.argv.indexOf(name);
  return i !== -1 && process.argv[i + 1] ? String(process.argv[i + 1]) : fallback;
}

async function main(): Promise<void> {
  const baseId = arg("--base", "akan");
  const base = BASES[baseId];
  if (!base) {
    console.error(`[ERROR] unknown --base ${baseId}. Known: ${Object.keys(BASES).join(", ")}`);
    process.exit(2);
  }
  if (!existsSync(KEYBOARDS_ROOT)) {
    console.error(`[ERROR] keyboards clone not found at ${KEYBOARDS_ROOT}`);
    process.exit(2);
  }

  const keyboardId = `e2e_smoke_${baseId.replace(/^sil_/, "")}`;
  const displayName = `E2E Smoke ${base.displayName}`;
  // Default lands in the scratch dir two levels above the repo (e.g. E:\Temp\
  // when the repo is E:\Projects\keyboard-studio). Override with --out.
  const outPath = resolve(arg("--out", resolve(REPO_ROOT, "..", "..", "Temp", `${keyboardId}.zip`)));
  console.error(`[INFO] output path: ${outPath}`);

  const svc = createScaffolderService({ proxyBase: PROXY, fetchImpl: localFetch });
  const { vfs, warnings } = await svc.scaffold(base, keyboardId, displayName);

  if (warnings.length) {
    for (const w of warnings) console.error(`[WARN] ${w}`);
  }
  const files = vfs.list();
  console.error(`[OK] scaffolded ${keyboardId} from ${baseId} — ${files.length} VFS files:`);
  for (const p of files) console.error(`       ${p}`);

  const zip = await toZip(vfs);
  mkdirSync(dirname(outPath), { recursive: true });
  writeFileSync(outPath, zip);
  console.error(`[OK] wrote ${outPath} (${zip.length} bytes)`);
}

main().catch((err: unknown) => {
  console.error(err);
  process.exit(1);
});

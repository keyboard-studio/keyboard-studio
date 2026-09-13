#!/usr/bin/env node
// welcome-sweep — the offline SC-002 corpus sweep for spec 076 (research R13).
//
// For every folder-convention base in the sibling `../keyboards` checkout
// (`release/<x>/<id>/source/welcome/`), run the REAL loader welcome resolution
// (`fetchKeyboardSourceToVfs`, fed by a disk-backed fetch) and the REAL
// descriptor writer (`buildKpsContent`), and assert:
//
//   1. the base resolves as the folder convention with a welcome page;
//   2. every `welcome\…` image the base's `.kps` lists AND ships on disk is
//      carried into `baseWelcomeImages`;
//   3. the descriptor the projection would generate lists the page and every
//      carried image as `welcome\…`.
//
// Reported, not failed (they are the base's own defects, and the output must
// still build): images the `.kps` lists but the base does not ship (ghost
// entries), images the welcome page references that were not carried, and
// files on disk the `.kps` never listed.
//
// Plain node; imports the ENGINE DIST, so build it first:
//   pnpm --filter @keyboard-studio/engine build
//   node utilities/welcome-sweep/run.mjs [--keyboards <path>] [--limit N] [--only <id>] [--verbose]
//
// Exit code: 0 when every base passes, 1 on any failure, 2 on a setup problem.
// Console output uses [OK] / [WARN] / [ERROR] — no emoji (house convention).

import { readFile, readdir } from "node:fs/promises";
import { existsSync } from "node:fs";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

// ---------------------------------------------------------------------------
// Arguments
// ---------------------------------------------------------------------------

const args = process.argv.slice(2);
function flag(name) {
  const i = args.indexOf(name);
  return i >= 0 ? args[i + 1] : undefined;
}
const verbose = args.includes("--verbose");
const limit = flag("--limit") !== undefined ? Number(flag("--limit")) : Infinity;
const only = flag("--only");

const here = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(here, "..", "..");
const keyboardsRoot = path.resolve(repoRoot, flag("--keyboards") ?? path.join("..", "keyboards"));
const engineDist = path.join(repoRoot, "packages", "engine", "dist");

// ---------------------------------------------------------------------------
// Engine imports (dist, not src — this is a plain-node utility)
// ---------------------------------------------------------------------------

const loaderFile = path.join(engineDist, "loader", "fetchKeyboardSourceToVfs.js");
if (!existsSync(loaderFile)) {
  console.error(`[ERROR] engine dist not found at ${engineDist}; run: pnpm --filter @keyboard-studio/engine build`);
  process.exit(2);
}
if (!existsSync(path.join(keyboardsRoot, "release"))) {
  console.error(`[ERROR] keyboards corpus not found at ${keyboardsRoot} (expected the sibling keyboard-studio/keyboards checkout)`);
  process.exit(2);
}

const { fetchKeyboardSourceToVfs } = await import(pathToFileURL(loaderFile).href);
const { buildKpsContent } = await import(pathToFileURL(path.join(engineDist, "package-descriptor", "build.js")).href);
const { parseKpsFiles } = await import(pathToFileURL(path.join(engineDist, "base-browser", "kps-parser.js")).href);
const { extractWelcomeImageRefs } = await import(pathToFileURL(path.join(engineDist, "shared", "helpDocsRender.js")).href);
// The contracts dist is emitted with extensionless relative imports (bundler
// resolution), which bare node cannot load, so the VirtualFS is not imported.
// The loader touches only `get` / `set` / `list`; this Map-backed stand-in honours
// the same entry shape ({ path, content, isBinary }). Nothing here inspects the
// VFS beyond the `.kmn` text, so a fuller implementation would prove nothing more.
function createVirtualFS() {
  const entries = new Map();
  return {
    get: (p) => entries.get(p),
    set: (p, content, isBinary = false) => {
      entries.set(p, { path: p, content, isBinary });
    },
    delete: (p) => entries.delete(p),
    list: (prefix = "") => [...entries.keys()].filter((k) => k.startsWith(prefix)),
    entries: () => [...entries.values()],
    get size() {
      return entries.size;
    },
  };
}

// ---------------------------------------------------------------------------
// Disk-backed fetch: `<proxyBase>/<repo-relative path>` -> file under the corpus
// ---------------------------------------------------------------------------

const PROXY = "corpus";
const notFound = { ok: false, status: 404, text: async () => "", arrayBuffer: async () => new ArrayBuffer(0) };

async function diskFetch(url) {
  const rel = url.startsWith(`${PROXY}/`) ? url.slice(PROXY.length + 1) : url;
  const file = path.join(keyboardsRoot, ...rel.split("/"));
  let bytes;
  try {
    bytes = await readFile(file);
  } catch {
    return notFound;
  }
  return {
    ok: true,
    status: 200,
    text: async () => bytes.toString("utf8"),
    arrayBuffer: async () => bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength),
  };
}

// ---------------------------------------------------------------------------
// Corpus walk
// ---------------------------------------------------------------------------

async function listFolderConventionBases() {
  const bases = [];
  const releaseDir = path.join(keyboardsRoot, "release");
  for (const shard of (await readdir(releaseDir, { withFileTypes: true })).filter((d) => d.isDirectory())) {
    // `release/packages/` holds multi-keyboard PACKAGES (a .kps bundling several
    // keyboards, no .kmn of its own). They are not bases the studio can adapt,
    // so they are outside SC-002's population.
    if (shard.name === "packages") continue;
    const shardDir = path.join(releaseDir, shard.name);
    for (const kb of (await readdir(shardDir, { withFileTypes: true })).filter((d) => d.isDirectory())) {
      if (existsSync(path.join(shardDir, kb.name, "source", "welcome"))) {
        bases.push({ id: kb.name, path: `release/${shard.name}/${kb.name}` });
      }
    }
  }
  bases.sort((a, b) => a.id.localeCompare(b.id));
  return bases;
}

const toPosix = (name) => name.trim().replace(/\\/g, "/").replace(/^\.\//, "");

// ---------------------------------------------------------------------------
// Per-base check
// ---------------------------------------------------------------------------

async function checkBase(base) {
  const failures = [];
  const notes = [];
  const kb = { id: base.id, path: base.path, script: "", targets: [], displayName: base.id, version: "" };
  const vfs = createVirtualFS();

  let result;
  try {
    result = await fetchKeyboardSourceToVfs(kb, vfs, { proxyBase: PROXY, fetchImpl: diskFetch });
  } catch (err) {
    failures.push(`loader threw: ${err instanceof Error ? err.message : String(err)}`);
    return { failures, notes, images: 0 };
  }

  if (result.baseWelcomeConvention !== "folder") {
    failures.push(`resolved as "${result.baseWelcomeConvention}", expected "folder"`);
  }
  if (result.baseWelcomeHtmText === undefined) {
    failures.push("no welcome page text resolved");
  }

  // What the base's own .kps lists under welcome\ (besides the page).
  const kpsPath = path.join(keyboardsRoot, ...base.path.split("/"), "source", `${base.id}.kps`);
  let listed = [];
  if (existsSync(kpsPath)) {
    const kpsText = await readFile(kpsPath, "utf8");
    listed = parseKpsFiles(kpsText)
      .map((e) => toPosix(e.name))
      .filter((n) => n.startsWith("welcome/") && n.toLowerCase() !== "welcome/welcome.htm");
  } else {
    notes.push("no .kps");
  }
  const welcomeDir = path.join(keyboardsRoot, ...base.path.split("/"), "source", "welcome");
  const onDisk = new Set(
    (await readdir(welcomeDir, { withFileTypes: true }))
      .filter((d) => d.isFile() && d.name.toLowerCase() !== "welcome.htm")
      .map((d) => `welcome/${d.name}`),
  );

  const carried = new Map((result.baseWelcomeImages ?? []).map((img) => [img.path.toLowerCase(), img]));
  const ghosts = [];
  for (const rel of listed) {
    if (!onDisk.has(rel) && !existsSync(path.join(keyboardsRoot, ...base.path.split("/"), "source", ...rel.split("/")))) {
      ghosts.push(rel);
      continue;
    }
    const img = carried.get(rel.toLowerCase());
    if (img === undefined) {
      failures.push(`listed image not carried: ${rel}`);
    } else if (!(img.bytes instanceof Uint8Array) || img.bytes.byteLength === 0) {
      failures.push(`carried image has no bytes: ${rel}`);
    }
  }
  if (ghosts.length > 0) notes.push(`${ghosts.length} listed-but-unshipped (ghost): ${ghosts.join(", ")}`);

  const unlisted = [...onDisk].filter((rel) => !listed.some((l) => l.toLowerCase() === rel.toLowerCase()));
  if (unlisted.length > 0) notes.push(`${unlisted.length} on-disk-but-unlisted (not carried): ${unlisted.join(", ")}`);

  if (result.baseWelcomeHtmText !== undefined) {
    const refs = extractWelcomeImageRefs(result.baseWelcomeHtmText);
    const missingRefs = refs.filter((ref) => {
      const key = ref.toLowerCase().replace(/^welcome\//, "");
      return !carried.has(`welcome/${key}`);
    });
    if (missingRefs.length > 0) notes.push(`${missingRefs.length} referenced-but-not-carried: ${missingRefs.join(", ")}`);
  }

  // The descriptor the projection would generate must list the page and every carried image.
  const kmnEntry = vfs.get(`source/${base.id}.kmn`);
  const kmnText = kmnEntry !== undefined && typeof kmnEntry.content === "string" ? kmnEntry.content : "";
  const carriedNames = [...carried.values()].map((img) => img.path.slice("welcome/".length));
  const kps = buildKpsContent(base.id, { displayName: base.id }, kmnText, "1.0", carriedNames);
  const descriptorNames = new Set(parseKpsFiles(kps).map((e) => e.name.toLowerCase()));
  if (!descriptorNames.has("welcome\\welcome.htm")) failures.push("descriptor does not list welcome\\welcome.htm");
  if (!/<WelcomeFile>welcome\\welcome\.htm<\/WelcomeFile>/.test(kps)) failures.push("descriptor <WelcomeFile> is not welcome\\welcome.htm");
  for (const name of carriedNames) {
    const ref = `welcome\\${name.replace(/\//g, "\\")}`.toLowerCase();
    if (!descriptorNames.has(ref)) failures.push(`descriptor does not list carried image ${ref}`);
  }
  if (/<Name>welcome\.htm<\/Name>/.test(kps)) failures.push("descriptor lists the flat welcome.htm");

  return { failures, notes, images: carried.size };
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------

let bases = await listFolderConventionBases();
if (only !== undefined) bases = bases.filter((b) => b.id === only);
if (Number.isFinite(limit)) bases = bases.slice(0, limit);

let passed = 0;
let failed = 0;
let imagesCarried = 0;
let withNotes = 0;

for (const base of bases) {
  const { failures, notes, images } = await checkBase(base);
  imagesCarried += images;
  if (failures.length > 0) {
    failed += 1;
    console.log(`[ERROR] ${base.id}: ${failures.join("; ")}`);
  } else {
    passed += 1;
    if (verbose) console.log(`[OK] ${base.id} (${images} images)`);
  }
  if (notes.length > 0) {
    withNotes += 1;
    if (verbose || failures.length > 0) console.log(`[WARN] ${base.id}: ${notes.join("; ")}`);
  }
}

console.log(
  `[${failed === 0 ? "OK" : "ERROR"}] welcome-sweep: ${passed}/${bases.length} folder-convention bases pass; ` +
    `${imagesCarried} images carried and listed; ${withNotes} bases with notes (re-run with --verbose to see them)`,
);
process.exit(failed === 0 ? 0 : 1);

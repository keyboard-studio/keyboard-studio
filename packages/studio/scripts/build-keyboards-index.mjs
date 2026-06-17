// Build-time: materialise the keyboard catalog into dist/local-kbd-api/list
// so the SPA's /local-kbd-api/list fetch resolves in production (Vercel and
// `vite preview`).
//
// Source resolution:
//   1. If KEYBOARDS_REPO is set and points to an existing directory, scan it.
//      (Dev / local builds with the sibling keymanapp/keyboards clone.)
//   2. Otherwise, shallow-clone (or refresh) KEYBOARDS_REPO_URL into
//      <repoRoot>/.cache/keyboards and scan that. (Vercel build.)
//
// Pairs with vercel.json's rewrite /local-kbd-proxy/* -> raw.githubusercontent
// so the live source files for each keyboard come from GitHub raw, not from
// the deploy bundle.

import { execFileSync } from "node:child_process";
import * as fs from "node:fs";
import * as path from "node:path";
import { fileURLToPath } from "node:url";

const SCRIPT_DIR = path.dirname(fileURLToPath(import.meta.url));
const STUDIO_DIR = path.resolve(SCRIPT_DIR, "..");
const REPO_ROOT = path.resolve(STUDIO_DIR, "..", "..");
const DEFAULT_CACHE = path.join(REPO_ROOT, ".cache", "keyboards");

const REPO_URL =
  process.env["KEYBOARDS_REPO_URL"] ??
  "https://github.com/keymanapp/keyboards.git";
const REPO_BRANCH = process.env["KEYBOARDS_REPO_BRANCH"] ?? "master";

const OUT_DIR = path.join(STUDIO_DIR, "dist", "local-kbd-api");
const OUT_FILE = path.join(OUT_DIR, "list");

const STORE_NAME_RE = /^\s*store\s*\(\s*&NAME\s*\)\s*'([^']*)'/im;
const STORE_VERSION_RE = /^\s*store\s*\(\s*&VERSION\s*\)\s*'([^']*)'/im;
const KPS_LANGUAGE_ID_RE = /<Language\s+ID="([^"]+)"/g;

function log(msg) {
  process.stdout.write(`[build-keyboards-index] ${msg}\n`);
}

function run(cmd, args, opts = {}) {
  execFileSync(cmd, args, { stdio: "inherit", ...opts });
}

function resolveRepoDir() {
  const envRepo = process.env["KEYBOARDS_REPO"];
  if (envRepo !== undefined && envRepo !== "") {
    if (fs.existsSync(envRepo)) {
      log(`using KEYBOARDS_REPO=${envRepo}`);
      return envRepo;
    }
    log(`KEYBOARDS_REPO=${envRepo} does not exist — falling back to clone`);
  }
  ensureClone(DEFAULT_CACHE);
  return DEFAULT_CACHE;
}

function ensureClone(target) {
  const gitDir = path.join(target, ".git");
  if (fs.existsSync(gitDir)) {
    log(`refreshing existing clone at ${target}`);
    try {
      run("git", ["-C", target, "fetch", "--depth", "1", "origin", REPO_BRANCH]);
      run("git", ["-C", target, "reset", "--hard", `origin/${REPO_BRANCH}`]);
      return;
    } catch (e) {
      log(`refresh failed (${String(e)}); re-cloning`);
      fs.rmSync(target, { recursive: true, force: true });
    }
  }
  fs.mkdirSync(path.dirname(target), { recursive: true });
  log(`cloning ${REPO_URL} (branch=${REPO_BRANCH}, depth=1) -> ${target}`);
  run("git", [
    "clone",
    "--depth", "1",
    "--branch", REPO_BRANCH,
    REPO_URL,
    target,
  ]);
}

function parseKpsLanguages(kpsPath) {
  if (!fs.existsSync(kpsPath)) return [];
  let xml;
  try {
    xml = fs.readFileSync(kpsPath, "utf8");
  } catch {
    return [];
  }
  const ids = [];
  let m;
  KPS_LANGUAGE_ID_RE.lastIndex = 0;
  while ((m = KPS_LANGUAGE_ID_RE.exec(xml)) !== null) {
    if (m[1] !== undefined && m[1].length > 0) ids.push(m[1]);
  }
  return ids;
}

function parseKmnMetadata(kmnPath) {
  try {
    const fd = fs.openSync(kmnPath, "r");
    const buf = Buffer.alloc(4096);
    const n = fs.readSync(fd, buf, 0, 4096, 0);
    fs.closeSync(fd);
    const head = buf.slice(0, n).toString("utf8");
    const nameMatch = STORE_NAME_RE.exec(head);
    const versionMatch = STORE_VERSION_RE.exec(head);
    return {
      name: nameMatch?.[1] ?? "",
      version: versionMatch?.[1] ?? "1.0",
    };
  } catch {
    return { name: "", version: "1.0" };
  }
}

function scan(keyboardsRepoRoot, sourceRepoSlug) {
  const releaseDir = path.join(keyboardsRepoRoot, "release");
  if (!fs.existsSync(releaseDir)) return [];
  const out = [];
  for (const vendor of fs.readdirSync(releaseDir)) {
    const vendorDir = path.join(releaseDir, vendor);
    let stat;
    try {
      stat = fs.statSync(vendorDir);
    } catch {
      continue;
    }
    if (!stat.isDirectory()) continue;
    let kbDirs;
    try {
      kbDirs = fs.readdirSync(vendorDir);
    } catch {
      continue;
    }
    for (const id of kbDirs) {
      const kbDir = path.join(vendorDir, id);
      try {
        if (!fs.statSync(kbDir).isDirectory()) continue;
      } catch {
        continue;
      }
      const kmnPath = path.join(kbDir, "source", `${id}.kmn`);
      if (!fs.existsSync(kmnPath)) continue;
      const meta = parseKmnMetadata(kmnPath);
      const kpsPath = path.join(kbDir, "source", `${id}.kps`);
      const languages = parseKpsLanguages(kpsPath);
      const entry = {
        id,
        path: `release/${vendor}/${id}`,
        // [SCAFFOLD] script hardcoded to "Latn" — mirrors localKeyboards.ts;
        // derive from .kpj BaseLanguage once that parsing lands.
        script: "Latn",
        targets: ["windows", "macosx", "linux", "web"],
        displayName: meta.name !== "" ? meta.name : id,
        version: meta.version,
        sourceUrl: `https://github.com/${sourceRepoSlug}/tree/${REPO_BRANCH}/release/${vendor}/${id}`,
      };
      if (languages.length > 0) entry.languages = languages;
      out.push(entry);
    }
  }
  out.sort((a, b) => a.id.localeCompare(b.id));
  return out;
}

function repoSlugFromUrl(url) {
  // strip optional .git suffix; accept https or ssh forms
  const m = url.match(/[:/]([^/:]+\/[^/]+?)(?:\.git)?$/);
  return m !== null ? m[1] : "keymanapp/keyboards";
}

function main() {
  if (!fs.existsSync(path.join(STUDIO_DIR, "dist"))) {
    log("dist/ not present — did vite build run? skipping index emit.");
    return;
  }
  const repoDir = resolveRepoDir();
  const slug = repoSlugFromUrl(REPO_URL);
  const catalog = scan(repoDir, slug);
  fs.mkdirSync(OUT_DIR, { recursive: true });
  fs.writeFileSync(OUT_FILE, JSON.stringify(catalog), "utf8");
  log(`emitted ${catalog.length} keyboards to ${path.relative(STUDIO_DIR, OUT_FILE)}`);
}

main();

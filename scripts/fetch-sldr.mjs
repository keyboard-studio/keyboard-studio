#!/usr/bin/env node
/**
 * Fetches the SIL SLDR locale tree for keyboard-studio.
 *
 * Reads the pinned commit + tarball SHA-256 from scripts/sldr-version.json,
 * downloads the ONE source tarball from codeload.github.com, verifies it
 * (fails loudly on a placeholder pin, a checksum mismatch, a zero-length or
 * truncated body, or an HTML error page masquerading as a tarball), extracts
 * the sldr/ locale XML tree into the gitignored packages/engine/data/sldr/,
 * and refreshes the SOURCES.json manifest beside it.
 *
 * One tarball, not 2726 file fetches: the whole point of the pin is that the
 * build input is a single byte-verified artifact.
 *
 * Output: packages/engine/data/sldr/sldr/<letter>/<locale>.xml   (gitignored)
 *         packages/engine/data/sldr/SOURCES.json                  (committed)
 *         packages/engine/data/sldr/LICENSE                       (committed)
 *
 * Usage:
 *   node scripts/fetch-sldr.mjs                verify + extract
 *   node scripts/fetch-sldr.mjs --compute-sha  print/record the measured hash
 */

import { createHash } from "node:crypto";
import { mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { gunzipSync } from "node:zlib";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import https from "node:https";

const HERE = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(HERE, "..");
const PIN_FILE = join(HERE, "sldr-version.json");
const OUT_DIR = join(ROOT, "packages", "engine", "data", "sldr");
const TREE_DIR = join(OUT_DIR, "sldr");
const SOURCES_FILE = join(OUT_DIR, "SOURCES.json");

/**
 * A GitHub source tarball of a repo this size is never smaller than this.
 * Guards against a zero-length body, a truncated transfer, and the
 * "0-byte placeholder committed by mistake" case.
 */
const MIN_PLAUSIBLE_BYTES = 64 * 1024;

/** gzip member header — the first two bytes of any valid .tar.gz. */
const GZIP_MAGIC = [0x1f, 0x8b];

// ---------------------------------------------------------------------------
// Verification (exported so the test suite can drive every failure mode
// without hitting the network)
// ---------------------------------------------------------------------------

/**
 * Thrown by verifyTarball. Carries a stable `reason` so tests can assert on the
 * failure mode rather than on prose.
 *
 * reason: "placeholder-pin" | "empty" | "not-gzip" | "checksum-mismatch"
 */
export class SldrFetchError extends Error {
  constructor(reason, message) {
    super(message);
    this.name = "SldrFetchError";
    this.reason = reason;
  }
}

/**
 * Verifies a downloaded body really is the pinned tarball.
 *
 * Order matters: the shape checks run BEFORE the checksum so an HTML error page
 * reports "not a gzip stream" rather than the far less actionable
 * "SHA-256 mismatch".
 *
 * @param {Buffer} buf            the downloaded body
 * @param {string} expectedSha256 hex digest from the pin file
 * @returns {string} the measured hex digest
 */
export function verifyTarball(buf, expectedSha256) {
  const expected = String(expectedSha256 ?? "").toLowerCase();
  if (!expected || expected.startsWith("placeholder")) {
    throw new SldrFetchError(
      "placeholder-pin",
      "scripts/sldr-version.json contains a placeholder SHA-256. " +
        "Run: node scripts/fetch-sldr.mjs --compute-sha",
    );
  }

  if (buf.length < MIN_PLAUSIBLE_BYTES) {
    throw new SldrFetchError(
      "empty",
      `downloaded body is ${buf.length} bytes — too small to be the SLDR tarball ` +
        `(expected at least ${MIN_PLAUSIBLE_BYTES}). Zero-length or truncated download.`,
    );
  }

  if (buf[0] !== GZIP_MAGIC[0] || buf[1] !== GZIP_MAGIC[1]) {
    const head = buf.subarray(0, 64).toString("utf8").replace(/\s+/g, " ").trim();
    throw new SldrFetchError(
      "not-gzip",
      `downloaded body is not a gzip stream — an HTML error page or a redirect ` +
        `body served as a tarball. First bytes: ${JSON.stringify(head)}`,
    );
  }

  const actual = createHash("sha256").update(buf).digest("hex");
  if (actual !== expected) {
    throw new SldrFetchError(
      "checksum-mismatch",
      "SHA-256 mismatch — download may be corrupt or tampered.\n" +
        `        Expected: ${expected}\n        Got:      ${actual}`,
    );
  }
  return actual;
}

// ---------------------------------------------------------------------------
// Minimal tar reader
// ---------------------------------------------------------------------------

/**
 * Iterates the regular-file entries of an uncompressed tar buffer.
 *
 * Deliberately dependency-free: a ustar reader is ~40 lines and adding a tar
 * package (or shelling out to the system `tar`, whose flags differ across
 * bsdtar/GNU tar/Windows) for one prebuild step is not worth it. Handles the
 * GNU/POSIX long-name extensions ('L' and 'x') well enough to skip them, which
 * is all this tarball needs — SLDR paths are short.
 *
 * @param {Buffer} tar
 * @returns {Generator<{ name: string, body: Buffer }>}
 */
export function* tarEntries(tar) {
  let offset = 0;
  while (offset + 512 <= tar.length) {
    const header = tar.subarray(offset, offset + 512);
    // Two consecutive zero blocks terminate the archive.
    if (header.every((b) => b === 0)) break;

    const name = header.subarray(0, 100).toString("utf8").replace(/\0.*$/, "");
    const sizeField = header.subarray(124, 136).toString("utf8").replace(/\0.*$/, "").trim();
    const size = parseInt(sizeField, 8) || 0;
    const typeFlag = String.fromCharCode(header[156]);
    const prefix = header.subarray(345, 500).toString("utf8").replace(/\0.*$/, "");
    const fullName = prefix ? `${prefix}/${name}` : name;

    const bodyStart = offset + 512;
    const bodyEnd = bodyStart + size;
    // '0' and '\0' are regular files; everything else (directories, links,
    // long-name/pax extension records) is skipped.
    if (typeFlag === "0" || typeFlag === "\0") {
      yield { name: fullName, body: tar.subarray(bodyStart, bodyEnd) };
    }

    offset = bodyStart + Math.ceil(size / 512) * 512;
  }
}

/** Matches `<repo>-<sha>/sldr/<letter>/<locale>.xml` — the only entries we keep. */
const LOCALE_ENTRY_RE = /^[^/]+\/sldr\/([a-z])\/([^/]+\.xml)$/;

/**
 * Extracts the SLDR locale XML tree from a gzipped tarball into `destDir`.
 * Returns the number of locale files written.
 *
 * Every path is rebuilt from the two captured, validated components, never
 * joined from the archive's own string — a tar entry cannot escape destDir.
 */
export function extractLocaleTree(gzipped, destDir) {
  const tar = gunzipSync(gzipped);
  rmSync(destDir, { recursive: true, force: true });
  let count = 0;
  for (const { name, body } of tarEntries(tar)) {
    const m = LOCALE_ENTRY_RE.exec(name);
    if (m === null) continue;
    const [, letter, file] = m;
    const dir = join(destDir, letter);
    mkdirSync(dir, { recursive: true });
    writeFileSync(join(dir, file), body);
    count++;
  }
  return count;
}

// ---------------------------------------------------------------------------
// Download
// ---------------------------------------------------------------------------

export function download(url, redirects = 0) {
  if (redirects > 5) return Promise.reject(new Error("Too many redirects"));
  return new Promise((res, rej) => {
    const req = https.get(
      url,
      { headers: { "User-Agent": "keyboard-studio/fetch-sldr" } },
      (resp) => {
        if (resp.statusCode >= 300 && resp.statusCode < 400 && resp.headers.location) {
          res(download(resp.headers.location, redirects + 1));
          resp.resume();
          return;
        }
        if (resp.statusCode !== 200) {
          rej(new Error(`HTTP ${resp.statusCode} from ${url}`));
          resp.resume();
          return;
        }
        const chunks = [];
        resp.on("data", (c) => chunks.push(c));
        resp.on("end", () => res(Buffer.concat(chunks)));
        resp.on("error", rej);
      },
    );
    req.on("error", rej);
  });
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------

async function main() {
  const computeSha = process.argv.slice(2).includes("--compute-sha");
  const cfg = JSON.parse(readFileSync(PIN_FILE, "utf8"));
  const { commit, urlTemplate, sha256, notice } = cfg;
  const url = urlTemplate.replace("{commit}", commit);

  console.log(`[OK] Downloading SLDR @ ${commit.slice(0, 12)}...`);
  console.log(`     ${url}`);

  let buf;
  try {
    buf = await download(url);
  } catch (err) {
    fail(`Download failed: ${err.message}`);
  }

  if (computeSha) {
    const measured = createHash("sha256").update(buf).digest("hex");
    cfg.sha256 = measured;
    writeFileSync(PIN_FILE, JSON.stringify(cfg, null, 2) + "\n", "utf8");
    console.log(`[OK] wrote measured SHA-256 into scripts/sldr-version.json`);
    console.log(`     ${measured}`);
    console.log("[OK] re-run without --compute-sha to extract.");
    return;
  }

  let actual;
  try {
    actual = verifyTarball(buf, sha256);
  } catch (err) {
    fail(err.message);
  }
  console.log(`[OK] verified tarball (${buf.length} bytes)`);

  mkdirSync(OUT_DIR, { recursive: true });
  let recordCount;
  try {
    recordCount = extractLocaleTree(buf, TREE_DIR);
  } catch (err) {
    fail(`Extraction failed: ${err.message}`);
  }
  if (recordCount === 0) {
    fail("extracted zero locale files — tarball layout changed?");
  }
  console.log(`[OK] ${rel(TREE_DIR)} — ${recordCount} locale files`);

  writeFileSync(
    SOURCES_FILE,
    JSON.stringify(
      { commit, sha256: actual, url, notice, bytes: buf.length, recordCount },
      null,
      2,
    ) + "\n",
    "utf8",
  );
  console.log(`[OK] ${rel(SOURCES_FILE)}`);
}

function rel(p) {
  return p.slice(ROOT.length + 1).replace(/\\/g, "/");
}

function fail(msg) {
  console.error(`[ERROR] ${msg}`);
  process.exit(1);
}

// Only run when invoked as a script — the test suite imports the verifiers.
if (import.meta.url === pathToFileURL(process.argv[1] ?? "").href) {
  await main();
}

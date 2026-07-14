#!/usr/bin/env node
/**
 * Fetches the pinned glottolog-cldf CLDF tables for keyboard-studio.
 *
 * Reads the pinned commit + per-file SHA-256 from scripts/glottolog-version.json,
 * downloads each raw CLDF file, SHA-256-verifies it (fails loudly on placeholder
 * or mismatch — non-zero exit, no partial write), writes the vendored files to
 * packages/glottolog/data/glottolog/, and updates the SOURCES.json manifest.
 *
 * This release's languages.csv has no Parent_ID column, so the classification
 * tree is read from values.csv (the `classification` parameter). Both files are
 * pinned + verified (spec 036, FR-001/FR-002, research.md D1/D2).
 *
 * Ported from scripts/fetch-langtags.mjs.
 *
 * Usage:
 *   node scripts/fetch-glottolog.mjs               fetch + verify + write all files
 *   node scripts/fetch-glottolog.mjs --compute-sha download each file and print
 *                                                  its SHA-256 (no verify, no
 *                                                  write — used when bumping the pin)
 *
 * Output: packages/glottolog/data/glottolog/{languages,values}.csv
 *         packages/glottolog/data/glottolog/SOURCES.json
 */

import { createHash } from 'node:crypto';
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import https from 'node:https';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(__dirname, '..');
// OUT_DIR and the version file are overridable via env solely so the fetch-guard
// test can exercise the fail-loud path hermetically (placeholder SHA → non-zero
// exit, no partial write) against a throwaway pin + output dir. Production always
// uses the defaults below.
const OUT_DIR = process.env.GLOTTOLOG_OUT_DIR ?? join(ROOT, 'packages', 'glottolog', 'data', 'glottolog');
const SOURCES_FILE = join(OUT_DIR, 'SOURCES.json');
const VERSION_FILE = process.env.GLOTTOLOG_VERSION_FILE ?? join(__dirname, 'glottolog-version.json');

const computeShaOnly = process.argv.includes('--compute-sha');

const cfg = JSON.parse(readFileSync(VERSION_FILE, 'utf8'));
const { commit, urlTemplate, files, notice } = cfg;

if (!Array.isArray(files) || files.length === 0) {
  console.error('[ERROR] scripts/glottolog-version.json: "files" must be a non-empty array.');
  process.exit(1);
}

const isPlaceholder = (sha) => !sha || sha.startsWith('PLACEHOLDER') || sha.startsWith('TODO');

// --compute-sha: download each file and print its hash, then exit without writing.
if (computeShaOnly) {
  for (const f of files) {
    const url = urlTemplate.replace('{commit}', commit).replace('{path}', f.path);
    console.log(`[OK] Downloading ${f.path} @ ${commit.slice(0, 12)}...`);
    let buf;
    try {
      buf = await download(url);
    } catch (err) {
      console.error(`[ERROR] Download failed: ${err.message}`);
      process.exit(1);
    }
    console.log(`     ${f.path} SHA-256: ${createHash('sha256').update(buf).digest('hex')}`);
  }
  console.log('     Write these values into scripts/glottolog-version.json "files[].sha256".');
  process.exit(0);
}

// Fetch + verify every file BEFORE writing any, so a failed verification never
// leaves a partial/inconsistent vendored set behind (FR-002).
const fetched = [];
for (const f of files) {
  if (isPlaceholder(f.sha256)) {
    console.error(`[ERROR] scripts/glottolog-version.json: placeholder SHA-256 for "${f.path}".`);
    console.error('        Compute the real hash and write it into the "sha256" field.');
    console.error('        Hint: node scripts/fetch-glottolog.mjs --compute-sha will print it.');
    process.exit(1);
  }

  const url = urlTemplate.replace('{commit}', commit).replace('{path}', f.path);
  console.log(`[OK] Downloading ${f.path} @ ${commit.slice(0, 12)}...`);
  console.log(`     ${url}`);

  let buf;
  try {
    buf = await download(url);
  } catch (err) {
    console.error(`[ERROR] Download failed: ${err.message}`);
    process.exit(1);
  }

  const actual = createHash('sha256').update(buf).digest('hex');
  const expected = f.sha256.toLowerCase();
  if (actual !== expected) {
    console.error(`[ERROR] SHA-256 mismatch for "${f.path}" — download may be corrupt or tampered.`);
    console.error(`        Expected: ${expected}`);
    console.error(`        Got:      ${actual}`);
    process.exit(1);
  }

  fetched.push({ path: f.path, url, buf, sha256: actual });
}

// All verified — safe to write.
mkdirSync(OUT_DIR, { recursive: true });
const manifestFiles = [];
for (const f of fetched) {
  const outFile = join(OUT_DIR, f.path);
  writeFileSync(outFile, f.buf);
  const recordCount = countRows(f.buf);
  console.log(`[OK] ${outFile} (${f.buf.length} bytes, ${recordCount} rows)`);
  manifestFiles.push({ path: f.path, sha256: f.sha256, url: f.url, bytes: f.buf.length, recordCount });
}

const sources = {
  commit,
  notice,
  files: manifestFiles,
};
writeFileSync(SOURCES_FILE, JSON.stringify(sources, null, 2) + '\n', 'utf8');
console.log(`[OK] ${SOURCES_FILE}`);

// --- helpers ----------------------------------------------------------------

/** Count data rows (non-empty lines minus the header). */
function countRows(buf) {
  try {
    const lines = buf.toString('utf8').split('\n').filter((l) => l.length > 0);
    return Math.max(0, lines.length - 1);
  } catch {
    return 0;
  }
}

function download(url, redirects = 0) {
  if (redirects > 5) {
    return Promise.reject(new Error('Too many redirects'));
  }
  return new Promise((res, rej) => {
    const req = https.get(url, { headers: { 'User-Agent': 'keyboard-studio/fetch-glottolog' } }, (resp) => {
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
      resp.on('data', (c) => chunks.push(c));
      resp.on('end', () => res(Buffer.concat(chunks)));
      resp.on('error', rej);
    });
    req.on('error', rej);
  });
}

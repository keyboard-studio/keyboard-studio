#!/usr/bin/env node
/**
 * Fetches source/langtags.json from silnrsi/langtags for keyboard-studio.
 *
 * Reads the pinned commit + SHA-256 from scripts/langtags-version.json,
 * downloads the raw file, SHA-256-verifies it (fails loudly on placeholder or
 * mismatch), writes the vendored file to packages/engine/data/langtags/langtags.json,
 * and updates the SOURCES.json manifest in the same directory.
 *
 * Output: packages/engine/data/langtags/langtags.json
 *         packages/engine/data/langtags/SOURCES.json
 */

import { createHash } from 'node:crypto';
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import https from 'node:https';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(__dirname, '..');
const OUT_DIR = join(ROOT, 'packages', 'engine', 'data', 'langtags');
const OUT_FILE = join(OUT_DIR, 'langtags.json');
const SOURCES_FILE = join(OUT_DIR, 'SOURCES.json');

const cfg = JSON.parse(readFileSync(join(__dirname, 'langtags-version.json'), 'utf8'));

const { commit, urlTemplate, sha256, notice } = cfg;

if (!sha256 || sha256.startsWith('PLACEHOLDER')) {
  console.error('[ERROR] scripts/langtags-version.json contains a placeholder SHA-256.');
  console.error('        Compute the real hash and write it into the "sha256" field.');
  console.error('        Hint: node scripts/fetch-langtags.mjs --compute-sha will print it.');
  process.exit(1);
}

const url = urlTemplate.replace('{commit}', commit);
console.log(`[OK] Downloading langtags @ ${commit.slice(0, 12)}...`);
console.log(`     ${url}`);

let buf;
try {
  buf = await download(url);
} catch (err) {
  console.error(`[ERROR] Download failed: ${err.message}`);
  process.exit(1);
}
const actual = createHash('sha256').update(buf).digest('hex');
const expected = sha256.toLowerCase();

if (actual !== expected) {
  console.error('[ERROR] SHA-256 mismatch — download may be corrupt or tampered.');
  console.error(`        Expected: ${expected}`);
  console.error(`        Got:      ${actual}`);
  process.exit(1);
}

mkdirSync(OUT_DIR, { recursive: true });
writeFileSync(OUT_FILE, buf);
console.log(`[OK] ${OUT_FILE} (${buf.length} bytes)`);

// Count records in the langtags array (top-level array or object with array)
let recordCount = 0;
try {
  const parsed = JSON.parse(buf.toString('utf8'));
  if (Array.isArray(parsed)) {
    recordCount = parsed.length;
  } else if (parsed && typeof parsed === 'object') {
    // Some versions have a wrapper object
    const arr = Object.values(parsed).find(v => Array.isArray(v));
    recordCount = arr ? arr.length : 0;
  }
} catch {
  // non-fatal; just leave recordCount 0
}

// Write/update SOURCES.json manifest
const sources = {
  commit,
  sha256: actual,
  url,
  notice,
  bytes: buf.length,
  recordCount,
};
writeFileSync(SOURCES_FILE, JSON.stringify(sources, null, 2) + '\n', 'utf8');
console.log(`[OK] ${SOURCES_FILE}`);
console.log(`[OK] ${recordCount} records, ${buf.length} bytes`);

// --- helpers ----------------------------------------------------------------

function download(url, redirects = 0) {
  if (redirects > 5) {
    return Promise.reject(new Error('Too many redirects'));
  }
  return new Promise((res, rej) => {
    const req = https.get(url, { headers: { 'User-Agent': 'keyboard-studio/fetch-langtags' } }, resp => {
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
      resp.on('data', c => chunks.push(c));
      resp.on('end', () => res(Buffer.concat(chunks)));
      resp.on('error', rej);
    });
    req.on('error', rej);
  });
}

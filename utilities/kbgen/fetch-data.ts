#!/usr/bin/env -S npx tsx
// Vendor the canonical Unicode data the engine needs, at PINNED versions.
//
// Why vendor instead of querying the web at runtime: a codegen tool must be
// deterministic, offline-capable, and version-pinned -- the same inputs must always
// yield the same placement mapping, and an upstream Unicode bump must never
// silently move where a character lands. This mirrors the repo's external-keyboard
// policy (pinned source + SHA256). The human-readable specs are referenced for
// maintainers; the engine consumes only the machine-readable files fetched here.
//
//   UnicodeData.txt  - char names, general category, canonical decomposition (UAX #44)
//                      https://www.unicode.org/reports/tr44/
//   confusables.txt  - visual confusable skeletons (UTS #39)
//                      https://www.unicode.org/reports/tr39/
//
// CLDR exemplar characters are NOT fetched here any more: kbgen's per-locale
// data/cldr/*.json snapshots were retired in favor of the engine's pinned
// CLDR+SLDR exemplar index (spec 044 FR-015 -- one exemplar path repo-wide).
// See sources/cldr.ts and INTEGRATION.md "Retirement note".
//
// Usage:
//   npx tsx utilities/kbgen/fetch-data.ts

import fs from 'node:fs';
import path from 'node:path';
import https from 'node:https';
import crypto from 'node:crypto';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

const UNICODE_VERSION = '16.0.0';
const DATA = path.join(__dirname, 'data');

const UNICODE_FILES: Record<string, string> = {
  'unicode/UnicodeData.txt': `https://www.unicode.org/Public/${UNICODE_VERSION}/ucd/UnicodeData.txt`,
  'unicode/confusables.txt': `https://www.unicode.org/Public/security/${UNICODE_VERSION}/confusables.txt`,
};

interface FetchResult {
  status: number;
  buffer: Buffer;
}

// Resolve to { status, buffer }. Non-200 (incl. 404) returns its status, not an error.
function get(url: string, redirects = 0): Promise<FetchResult> {
  return new Promise((resolve, reject) => {
    const req = https.get(url, (res) => {
      if ([301, 302, 307, 308].includes(res.statusCode!) && res.headers.location && redirects < 5) {
        res.resume();
        return resolve(get(new URL(res.headers.location, url).toString(), redirects + 1));
      }
      const chunks: Buffer[] = [];
      res.on('data', (c: Buffer) => chunks.push(c));
      res.on('end', () => resolve({ status: res.statusCode!, buffer: Buffer.concat(chunks) }));
    });
    req.on('error', reject);
    req.setTimeout(60000, () => { req.destroy(); reject(new Error('timeout: ' + url)); });
  });
}

interface FileManifest {
  url: string;
  bytes: number;
  sha256: string;
}

async function fetchUnicode(manifest: Record<string, FileManifest>) {
  console.log(`Fetching Unicode ${UNICODE_VERSION} data:`);
  for (const [rel, url] of Object.entries(UNICODE_FILES)) {
    const dest = path.join(DATA, rel);
    fs.mkdirSync(path.dirname(dest), { recursive: true });
    process.stdout.write(`  ${rel} ... `);
    const { status, buffer } = await get(url);
    if (status !== 200) throw new Error(`HTTP ${status} for ${url}`);
    fs.writeFileSync(dest, buffer);
    const sha256 = crypto.createHash('sha256').update(buffer).digest('hex');
    manifest[rel] = { url, bytes: buffer.length, sha256 };
    console.log(`${buffer.length} bytes  sha256=${sha256.slice(0, 16)}...`);
  }
}

async function main() {
  const manifest: Record<string, FileManifest> = {};
  await fetchUnicode(manifest);

  const sources = {
    unicodeVersion: UNICODE_VERSION,
    fetchedAt: new Date().toISOString(),
    specs: {
      UnicodeData: 'https://www.unicode.org/reports/tr44/',
      confusables: 'https://www.unicode.org/reports/tr39/',
    },
    files: manifest,
  };
  fs.writeFileSync(path.join(DATA, 'SOURCES.json'), JSON.stringify(sources, null, 2) + '\n');
  console.log(`\nWrote data/SOURCES.json  (Unicode ${UNICODE_VERSION}).`);
}

main().catch((e: Error) => { console.error('fetch failed: ' + e.message); process.exit(1); });

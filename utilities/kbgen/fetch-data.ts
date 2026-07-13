#!/usr/bin/env -S npx tsx
// Vendor the canonical Unicode + CLDR data the engine needs, at PINNED versions.
//
// Why vendor instead of querying the web at runtime: a codegen tool must be
// deterministic, offline-capable, and version-pinned -- the same inputs must always
// yield the same placement mapping, and an upstream Unicode/CLDR bump must never
// silently move where a character lands. This mirrors the repo's external-keyboard
// policy (pinned source + SHA256). The human-readable specs are referenced for
// maintainers; the engine consumes only the machine-readable files fetched here.
//
//   UnicodeData.txt  - char names, general category, canonical decomposition (UAX #44)
//                      https://www.unicode.org/reports/tr44/
//   confusables.txt  - visual confusable skeletons (UTS #39)
//                      https://www.unicode.org/reports/tr39/
//   characters.json  - per-locale exemplar characters (CLDR / UTS #35 LDML)
//                      https://cldr.unicode.org/   https://github.com/unicode-org/cldr-json
//
// CLDR proper is hundreds of MB; this tool needs only ONE slice -- exemplarCharacters per
// locale, from cldr-misc-full/main/<locale>/characters.json (~1-2 KB each). "Full" here
// therefore means every available locale's characters.json (~1 MB total), not all of CLDR.
//
// Usage:
//   npx tsx utilities/kbgen/fetch-data.ts --all          # every available locale (the full set)
//   npx tsx utilities/kbgen/fetch-data.ts ha ig yo ak     # just these locales
//   npx tsx utilities/kbgen/fetch-data.ts                 # default: ha

import fs from 'node:fs';
import path from 'node:path';
import https from 'node:https';
import crypto from 'node:crypto';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

const UNICODE_VERSION = '16.0.0';
const CLDR_VERSION = '46.1.0';
const CONCURRENCY = 16;
const DATA = path.join(__dirname, 'data');

const UNICODE_FILES: Record<string, string> = {
  'unicode/UnicodeData.txt': `https://www.unicode.org/Public/${UNICODE_VERSION}/ucd/UnicodeData.txt`,
  'unicode/confusables.txt': `https://www.unicode.org/Public/security/${UNICODE_VERSION}/confusables.txt`,
};
const cldrUrl = (loc: string) =>
  `https://raw.githubusercontent.com/unicode-org/cldr-json/${CLDR_VERSION}/cldr-json/cldr-misc-full/main/${loc}/characters.json`;
const AVAILABLE_LOCALES_URL =
  `https://raw.githubusercontent.com/unicode-org/cldr-json/${CLDR_VERSION}/cldr-json/cldr-core/availableLocales.json`;

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

async function pool<T, R>(items: T[], n: number, fn: (item: T) => Promise<R>): Promise<R[]> {
  const out: R[] = [];
  let i = 0;
  const workers = Array.from({ length: Math.min(n, items.length) }, async () => {
    while (i < items.length) {
      const idx = i++;
      out[idx] = await fn(items[idx]);
    }
  });
  await Promise.all(workers);
  return out;
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

async function fetchCldr(locales: string[]): Promise<string[]> {
  fs.mkdirSync(path.join(DATA, 'cldr'), { recursive: true });
  let done = 0;
  let ok = 0;
  let missing = 0;
  const succeeded: string[] = [];

  await pool(locales, CONCURRENCY, async (loc: string) => {
    let r: FetchResult;
    try {
      r = await get(cldrUrl(loc));
    } catch {
      r = { status: 0, buffer: Buffer.alloc(0) };
    }

    if (r.status === 200) {
      fs.writeFileSync(path.join(DATA, 'cldr', `${loc}.json`), r.buffer);
      succeeded.push(loc);
      ok++;
    } else {
      missing++;
    }

    done++;
    if (done % 50 === 0 || done === locales.length) {
      process.stdout.write(`\r  ${done}/${locales.length} attempted  (${ok} fetched, ${missing} without characters.json)`);
    }
  });

  process.stdout.write('\n');
  return succeeded.sort();
}

async function main() {
  const argv = process.argv.slice(2);
  const all = argv.includes('--all');
  let locales = argv.filter((a) => !a.startsWith('--'));

  const manifest: Record<string, FileManifest> = {};
  await fetchUnicode(manifest);

  if (all) {
    process.stdout.write('Resolving CLDR locale list ... ');
    const { status, buffer } = await get(AVAILABLE_LOCALES_URL);
    if (status !== 200) throw new Error(`HTTP ${status} for availableLocales.json`);
    locales = (JSON.parse(buffer.toString()) as { availableLocales: { full: string[] } }).availableLocales.full;
    console.log(`${locales.length} locales`);
  } else if (!locales.length) {
    locales = ['ha'];
  }

  console.log(`Fetching CLDR ${CLDR_VERSION} exemplar characters:`);
  const fetched = await fetchCldr(locales);

  const sources = {
    unicodeVersion: UNICODE_VERSION,
    cldrVersion: CLDR_VERSION,
    fetchedAt: new Date().toISOString(),
    specs: {
      UnicodeData: 'https://www.unicode.org/reports/tr44/',
      confusables: 'https://www.unicode.org/reports/tr39/',
      cldr: 'https://cldr.unicode.org/',
    },
    files: manifest,
    cldr: {
      version: CLDR_VERSION,
      source: all ? AVAILABLE_LOCALES_URL : `explicit: ${locales.join(' ')}`,
      localeCount: fetched.length,
      locales: fetched,
    },
  };
  fs.writeFileSync(path.join(DATA, 'SOURCES.json'), JSON.stringify(sources, null, 2) + '\n');
  console.log(`\nWrote data/SOURCES.json  (Unicode ${UNICODE_VERSION}, CLDR ${CLDR_VERSION}, ${fetched.length} locales).`);
}

main().catch((e: Error) => { console.error('fetch failed: ' + e.message); process.exit(1); });

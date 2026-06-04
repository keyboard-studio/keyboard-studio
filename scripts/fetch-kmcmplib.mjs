#!/usr/bin/env node
/**
 * Fetches kmcmplib.wasm for keyboard-studio.
 *
 * Mode (KEYBOARD_STUDIO_KMCMPLIB_SOURCE env var, default: prod):
 *   prod — downloads the pinned release artifact from keymanapp/keyman;
 *          verifies SHA-256 against scripts/kmcmplib-version.json.
 *   dev  — invokes the keyman build in ../keyman and copies the artifact.
 *
 * Output: packages/compiler/wasm/kmcmplib.wasm (same path in both modes).
 * See issue #125 to replace placeholder SHA-256 / URL in kmcmplib-version.json.
 */

import { createHash } from 'node:crypto';
import { copyFileSync, existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { execSync } from 'node:child_process';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import https from 'node:https';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(__dirname, '..');
const OUT_DIR = join(ROOT, 'packages', 'compiler', 'wasm');
const OUT_FILE = join(OUT_DIR, 'kmcmplib.wasm');

const cfg = JSON.parse(readFileSync(join(__dirname, 'kmcmplib-version.json'), 'utf8'));

const mode = (process.env.KEYBOARD_STUDIO_KMCMPLIB_SOURCE ?? 'prod').toLowerCase();

mkdirSync(OUT_DIR, { recursive: true });

if (mode === 'prod') {
  await fetchProd();
} else if (mode === 'dev') {
  await fetchDev();
} else {
  console.error(`[ERROR] KEYBOARD_STUDIO_KMCMPLIB_SOURCE must be "dev" or "prod", got: ${mode}`);
  process.exit(1);
}

// --- prod -------------------------------------------------------------------

async function fetchProd() {
  const { version, sha256, urlTemplate } = cfg;

  if (!sha256 || sha256.startsWith('PLACEHOLDER')) {
    console.error('[ERROR] scripts/kmcmplib-version.json contains a placeholder SHA-256.');
    console.error('        See issue #125 to set the real hash for version ' + version + '.');
    process.exit(1);
  }

  const url = urlTemplate.replace('{version}', version);
  console.log(`[OK] Downloading kmcmplib ${version}`);
  console.log(`     ${url}`);

  const buf = await download(url);
  const actual = createHash('sha256').update(buf).digest('hex');
  const expected = sha256.toLowerCase();

  if (actual !== expected) {
    console.error('[ERROR] SHA-256 mismatch — download may be corrupt or tampered.');
    console.error(`        Expected: ${expected}`);
    console.error(`        Got:      ${actual}`);
    process.exit(1);
  }

  writeFileSync(OUT_FILE, buf);
  console.log(`[OK] ${OUT_FILE}`);
}

// --- dev --------------------------------------------------------------------

async function fetchDev() {
  const keyman = resolve(ROOT, '..', 'keyman');

  if (!existsSync(keyman)) {
    console.error(`[ERROR] Keyman working tree not found at: ${keyman}`);
    console.error('        Clone keymanapp/keyman as a sibling of keyboard-studio.');
    process.exit(1);
  }

  const cmd = cfg.devBuildCmd ?? 'bash build.sh --target kmcmplib';
  console.log(`[OK] Building kmcmplib in ${keyman}`);
  console.log(`     ${cmd}`);
  execSync(cmd, { cwd: keyman, stdio: 'inherit' });

  const artifact = resolve(keyman, cfg.devArtifactPath);

  if (!existsSync(artifact)) {
    console.error(`[ERROR] Build succeeded but artifact not found at: ${artifact}`);
    console.error('        Check devArtifactPath in scripts/kmcmplib-version.json (issue #125).');
    process.exit(1);
  }

  copyFileSync(artifact, OUT_FILE);
  console.log(`[OK] ${OUT_FILE}`);
}

// --- helpers ----------------------------------------------------------------

function download(url, redirects = 0) {
  if (redirects > 5) {
    return Promise.reject(new Error('Too many redirects'));
  }
  return new Promise((res, rej) => {
    const req = https.get(url, { headers: { 'User-Agent': 'keyboard-studio/fetch-kmcmplib' } }, resp => {
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

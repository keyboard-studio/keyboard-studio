/**
 * Fixture tests for privacy-record-check (spec 096, FR-005):
 * the check must pass a tree the record fully names, and fail loudly on
 * a planted unregistered store. Run: node --test utilities/privacy-record-check/
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const script = fileURLToPath(new URL('./index.js', import.meta.url));

function fixture({ extraApi = null } = {}) {
  const rootDir = mkdtempSync(join(tmpdir(), 'prc-'));
  const put = (rel, content) => {
    const p = join(rootDir, rel);
    mkdirSync(join(p, '..'), { recursive: true });
    writeFileSync(p, content);
  };
  put('api/drafts/index.ts', `import { put as blobPut } from '@vercel/blob';\nimport { sql } from '@vercel/postgres';\n`);
  put('utilities/oauth-backend/src/verify.ts', `fetch('https://api.github.com/user'); fetch('https://oauth2.googleapis.com/token');\n`);
  if (extraApi) put(extraApi.rel, extraApi.content);
  put(
    'docs/privacy/processing-record.md',
    '# Record\nServer drafts in Vercel Blob and Vercel Postgres. GitHub sign-in; Google sign-in.\n',
  );
  return rootDir;
}

function run(rootDir) {
  return spawnSync(process.execPath, [script, '--root', rootDir], { encoding: 'utf8' });
}

test('passes when the record names the whole enumerated surface', () => {
  const r = run(fixture());
  assert.equal(r.status, 0, r.stderr);
  assert.match(r.stdout, /OK/);
});

test('fails on a planted unregistered store (new route group + SDK)', () => {
  const rootDir = fixture({
    extraApi: { rel: 'api/telemetry/index.ts', content: `import { kv } from '@vercel/kv';\n` },
  });
  const r = run(rootDir);
  assert.equal(r.status, 1);
  assert.match(r.stderr, /telemetry/);
});

test('fails when a store in use is not named in the record', () => {
  const rootDir = fixture();
  writeFileSync(
    join(rootDir, 'docs/privacy/processing-record.md'),
    '# Record\nGitHub sign-in; Google sign-in. Drafts.\n',
  );
  const r = run(rootDir);
  assert.equal(r.status, 1);
  assert.match(r.stderr, /@vercel\/blob/);
});

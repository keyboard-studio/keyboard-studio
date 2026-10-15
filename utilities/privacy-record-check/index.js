#!/usr/bin/env node
/**
 * privacy-record-check (spec 096, FR-005)
 *
 * Enumerates the server-side personal-data surface from the tree and
 * fails if any enumerated item is not named in the processing record.
 * Enumeration is mechanical; naming is the record's job. If this check
 * fails, either the record is missing a row (fix the record in the
 * same change — Constitution Art. XII) or the surface grew without a
 * privacy decision (stop and make one).
 *
 * Usage:
 *   node utilities/privacy-record-check/index.js [--root <dir>] [--record <file>]
 * Defaults: --root = repo root (two levels up), --record =
 * <root>/docs/privacy/processing-record.md
 */
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join, relative, sep } from 'node:path';
import { fileURLToPath } from 'node:url';

const args = process.argv.slice(2);
function argValue(name, fallback) {
  const i = args.indexOf(name);
  return i >= 0 && args[i + 1] ? args[i + 1] : fallback;
}
const here = fileURLToPath(new URL('.', import.meta.url));
const root = argValue('--root', join(here, '..', '..'));
const recordPath = argValue('--record', join(root, 'docs', 'privacy', 'processing-record.md'));

function walk(dir, out = []) {
  let entries;
  try {
    entries = readdirSync(dir, { withFileTypes: true });
  } catch {
    return out;
  }
  for (const e of entries) {
    const p = join(dir, e.name);
    if (e.isDirectory()) walk(p, out);
    else out.push(p);
  }
  return out;
}
const isSource = (p) => /\.ts$/.test(p) && !/\.test\.ts$/.test(p) && !p.endsWith(`${sep}_test.ts`);

// --- enumerate -------------------------------------------------------------

// 1. API route groups under api/ (first path segment below api/).
const apiFiles = walk(join(root, 'api')).filter(isSource);
const apiGroups = new Set();
for (const f of apiFiles) {
  const rel = relative(join(root, 'api'), f).split(sep);
  if (rel.length > 1) apiGroups.add(rel[0]);
}

// 2. Store/analytics SDK imports across api/ and the OAuth backend.
const scanDirs = [join(root, 'api'), join(root, 'utilities', 'oauth-backend', 'src')];
const KNOWN_PACKAGES = new Map([
  ['@vercel/blob', ['vercel blob']],
  ['@vercel/postgres', ['vercel postgres', 'postgres']],
]);
const SUSPICIOUS = /(@vercel\/(kv|analytics)|posthog|plausible|mixpanel|@sentry|segment|amplitude|@google-analytics)/i;
const foundPackages = new Set();
const suspiciousPackages = new Set();
for (const d of scanDirs) {
  for (const f of walk(d).filter(isSource)) {
    const src = readFileSync(f, 'utf8');
    for (const m of src.matchAll(/from\s+['"]([^'"]+)['"]/g)) {
      const pkg = m[1];
      if (KNOWN_PACKAGES.has(pkg)) foundPackages.add(pkg);
      else if (SUSPICIOUS.test(pkg)) suspiciousPackages.add(pkg);
    }
  }
}

// 3. Outbound identity endpoints in the OAuth backend.
const IDENTITY = [
  { pattern: /api\.github\.com|github\.com\/login\/oauth/, token: 'github', label: 'GitHub identity endpoint' },
  { pattern: /googleapis\.com|accounts\.google\.com/, token: 'google', label: 'Google identity endpoint' },
];
const foundIdentity = new Set();
for (const f of walk(join(root, 'utilities', 'oauth-backend', 'src')).filter(isSource)) {
  const src = readFileSync(f, 'utf8');
  for (const { pattern, token } of IDENTITY) if (pattern.test(src)) foundIdentity.add(token);
}

// Route-group naming: a group is "named" if the record mentions the
// group or one of its curated aliases (the record speaks in activities,
// not directory names — the aliases are the honest bridge).
const GROUP_ALIASES = new Map([
  ['drafts', ['draft']],
  ['oauth', ['oauth', 'sign-in', 'sign in']],
  ['report', ['crash']],
  ['submit', ['submission', 'submit']],
]);

// --- check against the record ----------------------------------------------

let record;
try {
  record = readFileSync(recordPath, 'utf8').toLowerCase();
} catch {
  console.error(`privacy-record-check: cannot read record at ${recordPath}`);
  process.exit(2);
}
const named = (tokens) => tokens.some((t) => record.includes(t));

const failures = [];
for (const g of [...apiGroups].sort()) {
  const aliases = GROUP_ALIASES.get(g);
  if (!aliases) {
    failures.push(`api/${g}/ — new API route group with no alias mapping; add a processing-record row and map it here`);
  } else if (!named([g, ...aliases])) {
    failures.push(`api/${g}/ — route group not named in the processing record`);
  }
}
for (const pkg of [...foundPackages].sort()) {
  if (!named(KNOWN_PACKAGES.get(pkg))) {
    failures.push(`${pkg} — store SDK in use but not named in the processing record`);
  }
}
for (const pkg of [...suspiciousPackages].sort()) {
  failures.push(`${pkg} — data/analytics SDK in use with no mapping; it needs a processing-record row before it may ship`);
}
for (const { token, label } of IDENTITY) {
  if (foundIdentity.has(token) && !named([token])) {
    failures.push(`${label} (${token}) — in use but not named in the processing record`);
  }
}

if (failures.length > 0) {
  console.error('privacy-record-check: the processing record does not name everything the code does:');
  for (const f of failures) console.error(`  - ${f}`);
  console.error('Fix: add the missing row(s) to docs/privacy/processing-record.md in this change (Constitution Art. XII).');
  process.exit(1);
}
const summary = [
  `${apiGroups.size} api group(s)`,
  `${foundPackages.size} store SDK(s)`,
  `${foundIdentity.size} identity endpoint(s)`,
].join(', ');
console.log(`privacy-record-check: OK — record names the enumerated surface (${summary}).`);

#!/usr/bin/env node
// build-repo-map.mjs — Phase 0 of the repo-wide /simplify plan.
//
// Produces one compact "repo map" the 64k local model can hold alongside a shard:
//   Part 1: export inventory   (every module's exported symbols)
//   Part 2: import graph        (module -> module edges; depcruise if available, regex fallback)
//   Part 3: boundary rules      (the forbidden rules from .dependency-cruiser.cjs, in plain list)
//
// Writes repo-map.json (full) and prints the approximate token size (chars/4) to stdout.
// Pass `--package <name>` to emit only that package's slice (filtered to the package + its deps).
//
// Dependency-free: Node built-ins only. Run from the repo root:
//   node build-repo-map.mjs
//   node build-repo-map.mjs --package contracts

import { readFileSync, writeFileSync, readdirSync, statSync, existsSync } from 'node:fs';
import { join, relative, sep } from 'node:path';
import { execSync } from 'node:child_process';

const ROOT = process.cwd();

// --- CLI -------------------------------------------------------------------
const argv = process.argv.slice(2);
const pkgIdx = argv.indexOf('--package');
const ONLY_PACKAGE = pkgIdx !== -1 ? argv[pkgIdx + 1] : null;

// Roots we scan (hand-written source only).
const SCAN_ROOTS = [
  'packages/contracts/src',
  'packages/engine/src',
  'packages/keyboard-lint/src',
  'packages/llm/src',
  'packages/studio/src',
  'api',
  'utilities/oauth-backend/src',
];

// Path fragments to skip entirely.
const EXCLUDE_RE =
  /(\.test\.[tj]sx?$|\.d\.ts$|vitest\.config\.[tj]s$|[/\\]__tests__[/\\]|[/\\]__fixtures__[/\\]|[/\\]generated[/\\]|[/\\]simulator[/\\]vendor[/\\]|[/\\]dist[/\\]|[/\\]node_modules[/\\])/;

// --- file walk -------------------------------------------------------------
function walk(dir, out = []) {
  if (!existsSync(dir)) return out;
  for (const name of readdirSync(dir)) {
    const full = join(dir, name);
    let st;
    try {
      st = statSync(full);
    } catch {
      continue;
    }
    if (st.isDirectory()) {
      if (name === 'node_modules' || name === 'dist') continue;
      walk(full, out);
    } else if (/\.(ts|tsx)$/.test(name)) {
      const rel = relative(ROOT, full).split(sep).join('/');
      if (!EXCLUDE_RE.test(rel)) out.push(rel);
    }
  }
  return out;
}

let files = [];
for (const r of SCAN_ROOTS) walk(join(ROOT, r), files);
files = [...new Set(files)].sort();

// Derive a package label for a file path (for --package filtering + graph collapse).
function pkgOf(rel) {
  const m = rel.match(/^packages\/([^/]+)\//);
  if (m) return m[1];
  if (rel.startsWith('api/')) return 'api';
  if (rel.startsWith('utilities/oauth-backend/')) return 'oauth-backend';
  return 'other';
}

// --- Part 1: export inventory ---------------------------------------------
// Regex-scan for `export function/const/class/interface/type/enum NAME` and `export { ... }`.
const EXPORT_DECL_RE =
  /export\s+(?:default\s+)?(?:async\s+)?(?:abstract\s+)?(?:function\*?|const|let|var|class|interface|type|enum)\s+([A-Za-z0-9_$]+)/g;
const EXPORT_LIST_RE = /export\s*\{([^}]*)\}/g; // export { a, b as c }

function extractExports(src) {
  const names = new Set();
  let m;
  while ((m = EXPORT_DECL_RE.exec(src))) names.add(m[1]);
  while ((m = EXPORT_LIST_RE.exec(src))) {
    for (const piece of m[1].split(',')) {
      const t = piece.trim();
      if (!t) continue;
      // `a as b` re-exports as b; bare `a` exports a.
      const asMatch = t.match(/\bas\s+([A-Za-z0-9_$]+)/);
      const name = asMatch ? asMatch[1] : t.replace(/^type\s+/, '').split(/\s+/)[0];
      if (name && name !== 'from') names.add(name);
    }
  }
  return [...names].sort();
}

// --- Part 2: import graph (regex fallback path) ----------------------------
const IMPORT_RE = /import\s+(?:type\s+)?[^'"]*?from\s*['"]([^'"]+)['"]/g;
const BARE_IMPORT_RE = /import\s*['"]([^'"]+)['"]/g;

function extractImports(src) {
  const specs = new Set();
  let m;
  while ((m = IMPORT_RE.exec(src))) specs.add(m[1]);
  while ((m = BARE_IMPORT_RE.exec(src))) specs.add(m[1]);
  return [...specs];
}

// Resolve a relative import specifier to a repo-relative module path (module->module edges).
// Tries `.ts`, `.tsx`, and `/index.{ts,tsx}`; returns null if nothing resolves.
function resolveRelative(fromRel, spec) {
  const fromDir = fromRel.split('/').slice(0, -1).join('/');
  // TS ESM often writes the compiled `.js`/`.jsx` suffix on a `.ts`/`.tsx` source — strip it.
  const bareSpec = spec.replace(/\.(js|jsx)$/, '');
  const base = join(ROOT, fromDir, bareSpec);
  const candidates = [
    base + '.ts',
    base + '.tsx',
    join(base, 'index.ts'),
    join(base, 'index.tsx'),
  ];
  for (const c of candidates) {
    if (existsSync(c)) return relative(ROOT, c).split(sep).join('/');
  }
  return null;
}

// Map a cross-package `@keymanapp/<pkg>` specifier to a package-level target node.
function specToPackage(spec) {
  if (spec.startsWith('@keymanapp/')) return `package:${spec.split('/')[1]}`;
  return null;
}

// --- build inventory + fallback edges --------------------------------------
const inventory = [];
const fallbackEdges = new Set(); // "fromPkg -> toPkg"

for (const rel of files) {
  let src;
  try {
    src = readFileSync(join(ROOT, rel), 'utf8');
  } catch {
    continue;
  }
  const exps = extractExports(src);
  inventory.push({ module: rel, package: pkgOf(rel), exports: exps });

  for (const spec of extractImports(src)) {
    if (spec.startsWith('.')) {
      // Relative — resolve to a concrete module for a module->module edge.
      const target = resolveRelative(rel, spec);
      if (target && target !== rel) fallbackEdges.add(`${rel} -> ${target}`);
    } else {
      // Cross-package workspace import (@keymanapp/*) -> package-level node.
      const toPkg = specToPackage(spec);
      if (toPkg) fallbackEdges.add(`${rel} -> ${toPkg}`);
    }
  }
}

// --- Part 2 (rich path): try dependency-cruiser ----------------------------
let importGraph = { source: 'regex-fallback', edges: [...fallbackEdges].sort() };
let depcruiseWarning = null;

// Resolve `packages/*/src` ourselves instead of relying on shell glob expansion —
// Windows cmd.exe doesn't expand `*`, so the glob would otherwise reach depcruise
// as a literal, unmatched string.
function resolvePackageSrcDirs() {
  const packagesRoot = join(ROOT, 'packages');
  if (!existsSync(packagesRoot)) return [];
  const dirs = [];
  for (const name of readdirSync(packagesRoot)) {
    const pkgDir = join(packagesRoot, name);
    const srcDir = join(pkgDir, 'src');
    if (statSync(pkgDir).isDirectory() && existsSync(srcDir)) {
      dirs.push(relative(ROOT, srcDir).split(sep).join('/'));
    }
  }
  return dirs;
}

try {
  const srcDirs = resolvePackageSrcDirs();
  if (srcDirs.length === 0) throw new Error('no packages/*/src directories found');
  // Resolve depcruise deps-first; capture JSON. stderr is suppressed via the `stdio`
  // option (not a POSIX `2>/dev/null` shell redirect), so this also works under
  // Windows cmd.exe.
  const quotedDirs = srcDirs.map((d) => JSON.stringify(d)).join(' ');
  const raw = execSync(`pnpm depcruise --output-type json ${quotedDirs}`, {
    cwd: ROOT,
    encoding: 'utf8',
    maxBuffer: 64 * 1024 * 1024,
    stdio: ['ignore', 'pipe', 'ignore'],
    windowsHide: true,
  });
  const parsed = JSON.parse(raw);
  const modules = parsed.modules || [];
  const edges = new Set();
  for (const mod of modules) {
    const fromPkg = pkgOf(mod.source);
    for (const dep of mod.dependencies || []) {
      const toPkg = pkgOf(dep.resolved || dep.module || '');
      if (fromPkg && toPkg && fromPkg !== 'other' && toPkg !== 'other' && fromPkg !== toPkg) {
        edges.add(`${fromPkg} -> ${toPkg}`);
      }
    }
  }
  importGraph = { source: 'dependency-cruiser', edges: [...edges].sort() };
} catch (err) {
  depcruiseWarning =
    'WARNING: `pnpm depcruise` not runnable (deps likely not installed) — using regex import ' +
    'fallback. For the richer, resolved graph run `pnpm install` then re-run this script.';
}

// --- Part 3: boundary rules from .dependency-cruiser.cjs -------------------
function extractBoundaryRules() {
  const cfgPath = join(ROOT, '.dependency-cruiser.cjs');
  if (!existsSync(cfgPath)) return [];
  const cfg = readFileSync(cfgPath, 'utf8');
  const rules = [];
  // Match each rule object's name + comment fields (comment may be a '+'-concatenated string).
  const nameRe = /name:\s*'([^']+)'/g;
  let nm;
  // We walk name matches and, for each, grab the nearest following comment block.
  const commentRe = /comment:\s*((?:'(?:[^'\\]|\\.)*'\s*\+?\s*)+)/g;
  const names = [];
  while ((nm = nameRe.exec(cfg))) names.push({ name: nm[1], index: nm.index });
  const comments = [];
  let cm;
  while ((cm = commentRe.exec(cfg))) {
    // Join the concatenated string literals into one plain string.
    const joined = cm[1]
      .split('+')
      .map((s) => s.trim().replace(/^'/, '').replace(/'$/, ''))
      .join('')
      .replace(/\\'/g, "'");
    comments.push({ text: joined, index: cm.index });
  }
  // Pair each name with the first comment that follows it.
  for (const n of names) {
    const c = comments.find((c) => c.index > n.index);
    rules.push({ name: n.name, comment: c ? c.text.trim() : '' });
  }
  return rules;
}

const boundaryRules = extractBoundaryRules();

// --- assemble map ----------------------------------------------------------
let map = {
  generatedAt: new Date().toISOString(),
  scope: ONLY_PACKAGE ? `package:${ONLY_PACKAGE}` : 'full',
  exportInventory: inventory,
  importGraph,
  boundaryRules,
};

// --package slice: keep only the named package's modules + edges touching it.
if (ONLY_PACKAGE) {
  map.exportInventory = inventory.filter((m) => m.package === ONLY_PACKAGE);
  map.importGraph = {
    source: importGraph.source,
    edges: importGraph.edges.filter((e) => e.includes(ONLY_PACKAGE)),
  };
}

const outName = ONLY_PACKAGE ? `repo-map.${ONLY_PACKAGE}.json` : 'repo-map.json';
const pretty = JSON.stringify(map, null, 2); // written to disk (human-readable artifact)
const minified = JSON.stringify(map); // what actually rides along to the model
writeFileSync(join(ROOT, outName), pretty);

// --- report ----------------------------------------------------------------
// Token estimate is on the minified form — that's what you feed the model per pass.
const approxTokens = Math.round(minified.length / 4);
console.log(`Wrote ${outName}`);
console.log(`  modules:         ${map.exportInventory.length}`);
console.log(`  import edges:    ${map.importGraph.edges.length} (source: ${map.importGraph.source})`);
console.log(`  boundary rules:  ${map.boundaryRules.length}`);
console.log(`  size (min):      ${minified.length} chars`);
console.log(`  approx tokens:   ~${approxTokens} (minified chars/4)`);
console.log(`  (feed per-package slices via --package for the <8k-token per-pass context)`);
if (depcruiseWarning) console.log(depcruiseWarning);

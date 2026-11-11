#!/usr/bin/env node
/**
 * Vendor Keyman's next-generation .kmn parser front end into
 * packages/engine/src/codec/ng/.
 *
 * Usage: node scripts/vendor-ng-parser.mjs <keyman-checkout> <commit>
 *
 * Each file is read with `git show <commit>:<path>` (the working tree of the
 * checkout is never read), gets one provenance line added under its MIT
 * header, and has its import specifiers rewritten to the `.js` ESM
 * convention. Local patches are NOT applied here: re-apply them from
 * packages/engine/src/codec/ng/PROVENANCE.md after a re-sync.
 */
import { execFileSync } from "node:child_process";
import * as fs from "node:fs";
import * as path from "node:path";
import { fileURLToPath } from "node:url";

const UPSTREAM_DIR = "developer/src/kmc-kmn/src/ng-compiler";
const FILES = [
  "lexer.ts",
  "scan-recognizer.ts",
  "token-type.ts",
  "token-buffer.ts",
  "recursive-descent.ts",
  "tree-construction.ts",
  "ast-rebuild.ts",
  "node-type.ts",
  "token-to-node.ts",
  "kmn-analyzer.ts",
  "statement-analyzer.ts",
  "store-analyzer.ts",
  "kmn-file.bnf",
];

const [checkout, commit] = process.argv.slice(2);
if (!checkout || !commit) {
  console.error("[ERROR] usage: node scripts/vendor-ng-parser.mjs <keyman-checkout> <commit>");
  process.exit(2);
}

const here = path.dirname(fileURLToPath(import.meta.url));
const dest = path.resolve(here, "../packages/engine/src/codec/ng");
fs.mkdirSync(dest, { recursive: true });

/** Rewrite relative import/export specifiers to carry a `.js` suffix. */
function fixSpecifiers(src) {
  return src.replace(/(\bfrom\s+)(['"])(\.{1,2}\/[^'"]+?)(\.js)?\2/g, (_m, kw, q, spec) => `${kw}${q}${spec}.js${q}`);
}

/** Add the provenance line directly under the leading MIT header comment. */
function addProvenance(src, upstreamPath, isTs) {
  const line = `Vendored from keymanapp/keyman ${upstreamPath} at ${commit}`;
  if (!isTs) return `# ${line}\n${src}`;
  const m = /^\/\*[\s\S]*?\*\/\n?/.exec(src);
  if (!m) return `/* ${line} */\n${src}`;
  const header = m[0];
  // Insert a ` * ` line before the closing `*/` so the header stays one block.
  const closed = header.replace(/\s*\*\/\n?$/, `\n *\n * ${line}\n */\n`);
  return closed + src.slice(header.length);
}

for (const f of FILES) {
  const upstreamPath = `${UPSTREAM_DIR}/${f}`;
  const raw = execFileSync("git", ["-C", checkout, "show", `${commit}:${upstreamPath}`], {
    encoding: "utf8",
    maxBuffer: 64 * 1024 * 1024,
  }).replace(/\r\n/g, "\n");
  const isTs = f.endsWith(".ts");
  const out = addProvenance(isTs ? fixSpecifiers(raw) : raw, upstreamPath, isTs);
  fs.writeFileSync(path.join(dest, f), out);
  console.log(`[OK] ${f}`);
}

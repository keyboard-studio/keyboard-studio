#!/usr/bin/env node
// spec-number-lint — fails on two `specs/NNN-*` folders claiming the same
// number (issue #1505's own root-cause fix: "a pnpm lint check that fails
// on a duplicate specs/NNN-* prefix would have caught all three collisions
// [057, 058 x2] at the moment they were introduced").
//
// Feature numbers are claimed on a branch and only become visible to other
// branches at merge — nothing checks the number is still free at merge
// time. utilities/spec-trace keys on the FULL directory name, so two
// differently-slugged specs sharing a number report as clean there; this
// check is the one that actually catches the collision.
//
// CommonJS, plain `node`. No external dependencies (only fs + path).

const { readdirSync, statSync } = require("node:fs");
const path = require("node:path");

const REPO_ROOT = path.resolve(__dirname, "../..");
const SPECS_DIR = path.join(REPO_ROOT, "specs");

const DIR_RE = /^(\d{3})-(.+)$/;

function main() {
  const entries = readdirSync(SPECS_DIR).filter((name) =>
    statSync(path.join(SPECS_DIR, name)).isDirectory(),
  );

  const byNumber = new Map(); // "057" -> ["057-bulletproof-navigation", ...]
  for (const name of entries) {
    const m = DIR_RE.exec(name);
    if (!m) continue; // non-numbered dirs (if any) aren't this lint's concern
    const number = m[1];
    if (!byNumber.has(number)) byNumber.set(number, []);
    byNumber.get(number).push(name);
  }

  const collisions = [...byNumber.entries()]
    .filter(([, names]) => names.length > 1)
    .sort((a, b) => a[0].localeCompare(b[0]));

  if (collisions.length === 0) {
    console.log(`[OK] spec-number-lint: ${entries.length} spec folder(s), no number collisions`);
    process.exit(0);
  }

  console.error(`[ERROR] spec-number-lint: ${collisions.length} spec number collision(s):`);
  for (const [number, names] of collisions) {
    console.error(`  [ERROR] ${number} claimed by ${names.length} folders:`);
    for (const name of names.sort()) console.error(`      specs/${name}`);
  }
  console.error("  Renumber one of each colliding pair (git mv + relabel its in-code");
  console.error("  `spec NNN` comments) before merging — see issue #1505.");
  process.exit(1);
}

main();

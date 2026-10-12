// test:affected — run only the package tests a change can reach.
//
// The full suite is ~10,000 tests and stays the CI merge gate. Locally
// (and for agent crews) most edits only touch one package, so this runs
// `vitest related` per affected package against the files changed since
// a base ref (default: the merge-base with origin/main), including
// uncommitted and untracked changes. A change to a package's manifest,
// vitest config or tsconfig falls back to that package's full suite —
// `related` cannot see through a config change.
//
// Usage: pnpm run test:affected [base-ref]   e.g. pnpm run test:affected origin/km/derived-keyboard

import { execFileSync, spawnSync } from "node:child_process";
import { readFileSync, readdirSync } from "node:fs";
import { join, relative } from "node:path";

const baseRef = process.argv[2] ?? "origin/main";

function git(args) {
  return execFileSync("git", args, { encoding: "utf8" });
}

function changedFiles() {
  const files = new Set();
  let mergeBase = baseRef;
  try {
    mergeBase = git(["merge-base", "HEAD", baseRef]).trim();
  } catch {
    // No merge-base (shallow clone, unknown ref) — diff against the ref.
  }
  for (const range of [`${mergeBase}...HEAD`, "HEAD"]) {
    try {
      for (const f of git(["diff", "--name-only", range]).split("\n")) {
        if (f.trim()) files.add(f.trim());
      }
    } catch {
      // Working-tree diff against HEAD can fail on a fresh clone; ignore.
    }
  }
  for (const f of git(["ls-files", "--others", "--exclude-standard"]).split("\n")) {
    if (f.trim()) files.add(f.trim());
  }
  return [...files];
}

function packageDirs() {
  const dirs = new Map(); // dir -> package name
  for (const entry of readdirSync("packages", { withFileTypes: true })) {
    if (!entry.isDirectory()) continue;
    const dir = join("packages", entry.name);
    try {
      const pkg = JSON.parse(readFileSync(join(dir, "package.json"), "utf8"));
      if (pkg.name && pkg.scripts?.test) dirs.set(dir, pkg.name);
    } catch {
      // Not a package directory — skip.
    }
  }
  return dirs;
}

const files = changedFiles();
const packages = packageDirs();
const byPackage = new Map(); // dir -> { name, files: [], full: bool }

for (const file of files) {
  const dir = [...packages.keys()].find((d) => file.startsWith(d + "/"));
  if (!dir) continue;
  const entry = byPackage.get(dir) ?? { name: packages.get(dir), files: [], full: false };
  const rel = relative(dir, file);
  if (/(^|\/)(package\.json|vitest\.config\.[tj]s|tsconfig[^/]*\.json)$/.test(rel)) {
    entry.full = true;
  } else if (/(^|\/)index\.tsx?$/.test(rel)) {
    // Barrel files re-export a whole subtree; `vitest related` resolves
    // no tests for them (verified on engine/src/index.ts), which would
    // silently run nothing. Fall back to the full suite.
    entry.full = true;
  } else if (/\.(ts|tsx|mts|cts)$/.test(rel)) {
    entry.files.push(rel);
  } else {
    // Non-code change inside a package (fixtures, data): be safe, run it all.
    entry.full = true;
  }
  byPackage.set(dir, entry);
}

if (byPackage.size === 0) {
  console.log(`test:affected — no package source changed since ${baseRef}; nothing to run.`);
  process.exit(0);
}

let failed = false;
for (const [dir, entry] of byPackage) {
  // Cross-package imports resolve through the dependency's built dist/
  // (the same reason CI builds before it tests) — build just this
  // package's workspace dependencies, not the whole repo.
  const build = spawnSync("pnpm", ["--filter", `${entry.name}^...`, "build"], {
    stdio: "inherit",
  });
  if (build.status !== 0) failed = true;
  let args;
  if (entry.full) {
    console.log(`\n== ${entry.name} (${dir}): full suite (config/data/barrel change — full suite is the safe fallback)`);
    args = ["--filter", entry.name, "test"];
  } else {
    console.log(`\n== ${entry.name} (${dir}): vitest related for ${entry.files.length} changed file(s)`);
    args = ["--filter", entry.name, "exec", "vitest", "related", "--run", ...entry.files];
  }
  const result = spawnSync("pnpm", args, { stdio: "inherit" });
  if (result.status !== 0) failed = true;
}
process.exit(failed ? 1 : 0);

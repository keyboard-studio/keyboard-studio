// test:pr — the per-pull-request test gate (km/ci-fast-gate, 2026-10-15).
//
// The full suite (~10,000 tests, ~23 min) plus the corpus gates made a
// keyboard-adjacent PR run ~77 min, so verdicts were routinely skipped or
// read off stale heads — the failure mode behind three red-main incidents
// in October 2026 (#2029, #2070, #2182 fallout, #2191). Per the owner's
// 2026-10-15 ruling, per-PR CI is capped at ~10 minutes instead:
//
//   * every package the PR touches runs `vitest related` for its changed
//     files (same reachability logic as scripts/test-affected.mjs), and
//   * engine and studio additionally run a CURATED CORE list on every
//     touch — the suites that actually caught the October breaks
//     (working-copy serialization, flow parity, the Phase B/F survey
//     seams, the codec/compiler/simulator pipeline, import fidelity).
//
// Where test:affected falls back to a package's FULL suite (barrel,
// config, manifest or data changes), test:pr runs the curated core
// instead — the full suite is the overnight gate's job (ci.yml schedule
// and every non-PR event run it unchanged). A root config change
// (package.json, lockfile, workspace, CI, this script) puts every
// package in core mode.
//
// The curated lists are a maintained contract: if a listed file is
// missing, this script fails loudly rather than silently running less.
//
// Usage: pnpm run test:pr -- [base-ref]   (default: origin/main)

import { execFileSync, spawnSync } from "node:child_process";
import { existsSync, readdirSync, readFileSync } from "node:fs";
import { join, relative } from "node:path";

// Tolerate a stray `--` separator (pnpm run forwards it verbatim on
// some versions): the base ref is the first non-`--` argument.
const baseRef = process.argv.slice(2).find((a) => a !== "--") ?? "origin/main";

// Curated core suites, per package directory. Entries are paths relative
// to the package dir; a trailing `*` globs within that directory.
const CURATED_CORE = {
  "packages/engine": [
    "src/codec/emit.test.ts",
    "src/codec/roundtrip.test.ts",
    "src/compiler/compile.test.ts",
    "src/simulator/simulate.test.ts",
    "src/validator/index-import-fidelity.test.ts",
  ],
  "packages/studio": [
    "src/lib/serializeWorkingCopy*.test.ts",
    "src/lib/projectWorkingCopyVfs.test.ts",
    "src/hooks/useWorkingCopyTransform.test.ts",
    "src/survey/PhaseBExemplarPrefill.test.tsx",
    "src/survey/PhaseFAdaptiveDescription.integration.test.tsx",
    "src/survey/PhaseFContactSeed.integration.test.tsx",
    "src/steps/stepOrder.parity.test.ts",
    "tests/survey/flow-parity.test.ts",
    // Spec 107 FR-014: the headless-author non-divergence boundary runs on every PR.
    "src/test/headlessAuthor/boundary.test.ts",
  ],
};

// Packages whose full suites are small enough to stay whole on PRs.
const SMALL_PACKAGES = new Set([
  "packages/contracts",
  "packages/glottolog",
  "packages/keyboard-lint",
]);

// Changes that can reach every package's tests.
const ROOT_CONFIG =
  /^(package\.json|pnpm-lock\.yaml|pnpm-workspace\.yaml|tsconfig[^/]*\.json|\.github\/workflows\/ci\.yml|scripts\/test-(affected|pr)\.mjs)$/;

function git(args) {
  return execFileSync("git", args, { encoding: "utf8" });
}

let mergeBaseOk = true;

function changedFiles() {
  const files = new Set();
  let mergeBase = baseRef;
  try {
    mergeBase = git(["merge-base", "HEAD", baseRef]).trim();
  } catch {
    // No merge-base (shallow clone, unknown ref) — diff against the ref.
    mergeBaseOk = false;
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

function resolveCurated(dir) {
  const resolved = [];
  for (const entry of CURATED_CORE[dir] ?? []) {
    if (!entry.includes("*")) {
      if (!existsSync(join(dir, entry))) {
        console.error(
          `test:pr — curated core file missing: ${join(dir, entry)}. ` +
            "The curated list in scripts/test-pr.mjs is a maintained contract; update it in this change.",
        );
        process.exit(1);
      }
      resolved.push(entry);
      continue;
    }
    const [prefix, suffix] = entry.split("*");
    const parent = join(dir, prefix.split("/").slice(0, -1).join("/"));
    const base = prefix.split("/").pop();
    const matches = readdirSync(parent)
      .filter((f) => f.startsWith(base) && f.endsWith(suffix))
      .map((f) => prefix.split("/").slice(0, -1).join("/") + "/" + f)
      .sort();
    if (matches.length === 0) {
      console.error(
        `test:pr — curated core glob matched nothing: ${join(dir, entry)}. ` +
          "The curated list in scripts/test-pr.mjs is a maintained contract; update it in this change.",
      );
      process.exit(1);
    }
    resolved.push(...matches);
  }
  return resolved;
}

const files = changedFiles();
const packages = packageDirs();
const rootConfigChanged = files.some((f) => ROOT_CONFIG.test(f));

const byPackage = new Map(); // dir -> { name, files: [], full: bool }
for (const file of files) {
  const dir = [...packages.keys()].find((d) => file.startsWith(d + "/"));
  if (!dir) continue;
  const entry = byPackage.get(dir) ?? { name: packages.get(dir), files: [], full: false };
  const rel = relative(dir, file);
  if (/(^|\/)(package\.json|vitest\.config\.[tj]s|tsconfig[^/]*\.json)$/.test(rel)) {
    entry.full = true;
  } else if (/(^|\/)index\.tsx?$/.test(rel)) {
    entry.full = true;
  } else if (/\.(ts|tsx|mts|cts)$/.test(rel)) {
    entry.files.push(rel);
  } else {
    entry.full = true;
  }
  byPackage.set(dir, entry);
}
if (rootConfigChanged) {
  for (const [dir, name] of packages) {
    const entry = byPackage.get(dir) ?? { name, files: [], full: false };
    entry.full = true;
    byPackage.set(dir, entry);
  }
}

if (byPackage.size === 0) {
  if (!mergeBaseOk && files.length === 0) {
    // A vacuous pass here is how the first live run of this script
    // silently ran zero tests: the CI checkout was shallow, so no
    // merge-base existed and every diff came back empty. Refuse to
    // pass on a diff we could not compute.
    console.error(
      `test:pr — could not compute a merge-base against ${baseRef} and the diff is empty. ` +
        "This checkout is likely shallow; fetch full history (fetch-depth: 0) or pass a reachable base ref. " +
        "Refusing to pass with zero tests.",
    );
    process.exit(1);
  }
  console.log(`test:pr — no package source changed since ${baseRef}; nothing to run.`);
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

  const run = (args, label) => {
    console.log(`\n== ${entry.name} (${dir}): ${label}`);
    const result = spawnSync("pnpm", args, { stdio: "inherit" });
    if (result.status !== 0) failed = true;
  };

  if (SMALL_PACKAGES.has(dir)) {
    run(["--filter", entry.name, "test"], "full suite (small package)");
    continue;
  }
  if (entry.full) {
    const core = resolveCurated(dir);
    if (core.length === 0) {
      run(["--filter", entry.name, "test"], "full suite (config/data/barrel change, no curated core for this package)");
    } else {
      run(
        ["--filter", entry.name, "exec", "vitest", "run", ...core],
        `curated core, ${core.length} file(s) (config/data/barrel change — full suite runs overnight)`,
      );
    }
    continue;
  }
  if (entry.files.length > 0) {
    run(
      ["--filter", entry.name, "exec", "vitest", "related", "--run", ...entry.files],
      `vitest related for ${entry.files.length} changed file(s)`,
    );
  }
  const core = resolveCurated(dir);
  if (core.length > 0) {
    run(
      ["--filter", entry.name, "exec", "vitest", "run", ...core],
      `curated core, ${core.length} file(s)`,
    );
  }
}
process.exit(failed ? 1 : 0);

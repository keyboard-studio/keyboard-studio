#!/usr/bin/env node
// Installs .githooks/pre-push into this clone's git hooks directory (run from the
// `prepare` script, so `pnpm install` sets it up). It copies the one file instead of
// setting core.hooksPath, so hooks other tools keep in the same directory still run.
// Never overwrites a pre-push hook that does not carry our marker. Silent no-op
// outside a git checkout (tarballs, some CI images).

import { execFileSync } from "node:child_process";
import { chmodSync, copyFileSync, existsSync, mkdirSync, readFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const MARKER = "KS-PRE-PUSH-GUARD";
const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const source = join(root, ".githooks", "pre-push");

let hooksDir;
try {
  const common = execFileSync("git", ["rev-parse", "--git-common-dir"], { cwd: root, encoding: "utf8" }).trim();
  hooksDir = join(resolve(root, common), "hooks");
} catch {
  process.exit(0);
}

// A briefly-shipped husky setup pointed core.hooksPath at .husky/_, which no longer
// exists; while it is set git ignores the hooks directory, so clear it.
try {
  const hooksPath = execFileSync("git", ["config", "--get", "core.hooksPath"], { cwd: root, encoding: "utf8" }).trim();
  if (hooksPath === ".husky/_") execFileSync("git", ["config", "--unset", "core.hooksPath"], { cwd: root });
} catch {
  // Unset (git exits 1): nothing to clear.
}

const target = join(hooksDir, "pre-push");
if (existsSync(target) && !readFileSync(target, "utf8").includes(MARKER)) {
  console.warn("[WARN] install-git-hooks: a different pre-push hook exists; leaving it alone.");
  process.exit(0);
}

mkdirSync(hooksDir, { recursive: true });
copyFileSync(source, target);
chmodSync(target, 0o755);
console.log("[OK] install-git-hooks: pre-push lint guard installed");

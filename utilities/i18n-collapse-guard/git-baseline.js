// git-baseline — resolves "what did this catalog look like before" for the
// baseline regression guard.
//
// Deliberately separate from index.js's pure measureRegression/
// checkBaselineRegression: those take plain objects and are exercised by
// vitest with in-memory fixtures. Nothing in this file is unit-tested that
// way, because its whole job is running real git commands against the real
// repo -- callers (the two lint scripts' `main()`) invoke it directly and
// tolerate failure (offline, shallow clone, no origin remote, first commit)
// by treating "can't resolve a baseline" as "skip, don't crash."
//
// resolveBaselineRef is called ONCE per lint run (it may do a network fetch);
// readCatalogAtRef is called per catalog/locale (a local `git show`, no
// network) against the ref resolveBaselineRef already produced.

"use strict";

const { execFileSync } = require("node:child_process");
const path = require("node:path");

// This module's whole design goal is "tolerate failure by skipping, don't
// crash the lint run" -- offline, no origin remote, shallow clone. A stalled
// network connection defeats that goal a different way: execFileSync blocks
// until the OS-level TCP timeout (can be minutes) rather than failing fast
// into the catch block below. Every git call here gets a generous but finite
// ceiling so a bad connection degrades like any other failure instead of
// hanging `pnpm lint` for everyone.
const GIT_TIMEOUT_MS = 10_000;

function git(args, cwd) {
  return execFileSync("git", args, {
    cwd,
    stdio: ["ignore", "pipe", "ignore"],
    timeout: GIT_TIMEOUT_MS,
  }).toString("utf8");
}

/**
 * Resolve a git ref to compare catalogs against: "what main looked like"
 * rather than "what this branch's own parent commit looked like" -- the
 * question that matters is whether MERGING this branch would revert
 * translations currently on the base branch, not what the branch's own
 * history says. That also sidesteps needing merge-base or deep history: just
 * the base branch's tip is enough.
 *
 * `--depth=1` is applied ONLY when the clone is ALREADY shallow (CI: the
 * Actions checkout is shallow by default, so the flag costs nothing and
 * saves a full history download). Against a developer's full clone it does
 * the opposite of what it looks like: `git fetch --depth=1` CONVERTS a
 * complete clone into a shallow one, permanently, until someone runs
 * `--unshallow` -- and since this runs from `pnpm lint` with stdio ignored,
 * it did so silently. A shallow main then breaks every ancestry question
 * asked of the repo afterwards (`merge-base` returns nothing,
 * `--is-ancestor` says no, `main..branch` counts the whole history as
 * unique) with no error to explain why.
 *
 * @param {string} cwd  repo root
 * @returns {string|null} a resolvable ref, or null if none could be found
 */
function resolveBaselineRef(cwd) {
  if (process.env.I18N_BASELINE_REF) return process.env.I18N_BASELINE_REF;

  // GITHUB_BASE_REF is set by Actions on pull_request events to the PR's
  // target branch name (e.g. "main") -- exactly the baseline we want. Falls
  // back to "main" for a direct push or a local run.
  const baseBranch = process.env.GITHUB_BASE_REF || "main";
  try {
    // See the note above: shallow-fetch only a clone that is already shallow.
    // `--is-shallow-repository` is plumbing (git >= 2.15) and prints exactly
    // "true"/"false"; if it throws, treat the clone as full -- the safe side,
    // since a plain fetch never damages a shallow clone either.
    let alreadyShallow = false;
    try {
      alreadyShallow = git(["rev-parse", "--is-shallow-repository"], cwd).trim() === "true";
    } catch {
      alreadyShallow = false;
    }
    const depthArgs = alreadyShallow ? ["--depth=1"] : [];

    execFileSync("git", ["fetch", "--quiet", ...depthArgs, "origin", baseBranch], {
      cwd,
      stdio: "ignore",
      timeout: GIT_TIMEOUT_MS,
    });
    git(["rev-parse", "--verify", `origin/${baseBranch}`], cwd);
    return `origin/${baseBranch}`;
  } catch {
    // Offline, no "origin" remote, base branch renamed, etc. Fall back to the
    // immediate parent commit, which still catches a direct-push regression
    // without needing network.
  }

  try {
    git(["rev-parse", "--verify", "HEAD^"], cwd);
    return "HEAD^";
  } catch {
    return null; // e.g. a single-commit shallow clone with no network -- genuinely nothing to compare against
  }
}

/**
 * Read and parse a JSON catalog as it existed at `ref`. Returns null --
 * "no usable baseline for this file" -- when the ref can't be resolved, the
 * file did not exist at that ref (a brand-new catalog has nothing to regress
 * from), or the content there isn't valid JSON. Never throws.
 *
 * @param {string|null} ref      a ref from resolveBaselineRef, or null
 * @param {string}      absPath  absolute path to the file, as it exists now
 * @param {string}      cwd      repo root
 * @returns {object|null}
 */
function readCatalogAtRef(ref, absPath, cwd) {
  if (!ref) return null;
  try {
    const rel = path.relative(cwd, absPath).split(path.sep).join("/");
    return JSON.parse(git(["show", `${ref}:${rel}`], cwd));
  } catch {
    return null;
  }
}

module.exports = { resolveBaselineRef, readCatalogAtRef, GIT_TIMEOUT_MS };

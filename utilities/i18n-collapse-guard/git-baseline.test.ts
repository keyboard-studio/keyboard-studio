// Tests for the git-plumbing half of the baseline regression guard (#1489).
//
// Unlike measureRegression/checkBaselineRegression (pure, tested with plain
// objects from utilities/content-i18n-lint/index.test.ts), resolveBaselineRef
// and readCatalogAtRef's whole job is running real git commands. Mocking
// child_process would only prove the mock behaves as scripted, not that the
// fallback chain (env override -> fetch the base branch -> HEAD^ -> null)
// actually degrades correctly against real git failures -- shallow clones, a
// missing "origin" remote, an unresolvable branch name. So these spin up
// small, real, LOCAL-ONLY git repos (a plain directory as the "origin" remote
// -- git fetches from a filesystem path exactly like it does from a network
// remote, no server needed) and exercise the real functions against them.
//
// Slower than a typical unit test (each spins up one or two repos), but still
// fast in absolute terms, and this is the exact code path km-qc flagged as
// having zero coverage on PR #1535 -- the fallback chain the review asked
// about shipped unverified.

import { afterEach, describe, expect, it } from "vitest";
import { execFileSync } from "node:child_process";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { resolveBaselineRef, readCatalogAtRef } from "./git-baseline.js";

const dirs: string[] = [];
function tempDir(prefix: string): string {
  const dir = mkdtempSync(join(tmpdir(), prefix));
  dirs.push(dir);
  return dir;
}

function git(args: string[], cwd: string): string {
  // stderr ignored: git's LF/CRLF autocrlf notice on every commit is noise on
  // Windows CI/dev boxes, not a signal these tests care about.
  return execFileSync("git", args, { cwd, encoding: "utf8", stdio: ["ignore", "pipe", "ignore"] });
}

/** A commit needs no global git config in CI/dev boxes without one set. */
function commit(cwd: string, message: string): void {
  git(["add", "-A"], cwd);
  git(["-c", "user.email=t@t.com", "-c", "user.name=t", "commit", "-q", "-m", message], cwd);
}

function initRepo(branch: string): string {
  const dir = tempDir("git-baseline-repo-");
  git(["init", "-q", "-b", branch], dir);
  writeFileSync(join(dir, "seed.txt"), "seed\n");
  commit(dir, "init");
  return dir;
}

const ENV_KEYS = ["I18N_BASELINE_REF", "GITHUB_BASE_REF"] as const;
let savedEnv: Record<string, string | undefined> = {};

function saveEnv(): void {
  savedEnv = {};
  for (const key of ENV_KEYS) savedEnv[key] = process.env[key];
}

function clearEnv(): void {
  for (const key of ENV_KEYS) delete process.env[key];
}

afterEach(() => {
  for (const key of ENV_KEYS) {
    if (savedEnv[key] === undefined) delete process.env[key];
    else process.env[key] = savedEnv[key];
  }
  while (dirs.length > 0) {
    const dir = dirs.pop();
    if (dir) rmSync(dir, { recursive: true, force: true });
  }
});

describe("resolveBaselineRef", () => {
  it("returns the env override without touching git at all", () => {
    saveEnv();
    process.env.I18N_BASELINE_REF = "some-ref-nothing-resolves-to";
    // A cwd that isn't even a directory proves this never shells out --
    // env override is checked and returned before any git call.
    const cwd = join(tmpdir(), "does-not-exist-" + Math.random().toString(36).slice(2));
    expect(resolveBaselineRef(cwd)).toBe("some-ref-nothing-resolves-to");
  });

  it("resolves origin/<GITHUB_BASE_REF> when the fetch succeeds", () => {
    saveEnv();
    clearEnv();
    const origin = initRepo("main");
    const work = tempDir("git-baseline-work-");
    git(["init", "-q", "-b", "main"], work);
    writeFileSync(join(work, "own.txt"), "own\n");
    commit(work, "own init");
    git(["remote", "add", "origin", origin], work);

    process.env.GITHUB_BASE_REF = "main";
    expect(resolveBaselineRef(work)).toBe("origin/main");
  });

  it("defaults to 'main' when GITHUB_BASE_REF is unset (local run, not a PR)", () => {
    saveEnv();
    clearEnv(); // no GITHUB_BASE_REF -- exercises the "|| main" fallback
    const origin = initRepo("main");
    const work = tempDir("git-baseline-work-");
    git(["init", "-q", "-b", "main"], work);
    writeFileSync(join(work, "own.txt"), "own\n");
    commit(work, "own init");
    git(["remote", "add", "origin", origin], work);

    expect(resolveBaselineRef(work)).toBe("origin/main");
  });

  it("respects a non-'main' GITHUB_BASE_REF (e.g. a PR targeting 'dev')", () => {
    saveEnv();
    clearEnv();
    const origin = initRepo("main");
    git(["checkout", "-q", "-b", "dev"], origin);
    writeFileSync(join(origin, "dev-only.txt"), "dev\n");
    commit(origin, "dev branch");

    const work = tempDir("git-baseline-work-");
    git(["init", "-q", "-b", "main"], work);
    writeFileSync(join(work, "own.txt"), "own\n");
    commit(work, "own init");
    git(["remote", "add", "origin", origin], work);

    process.env.GITHUB_BASE_REF = "dev";
    expect(resolveBaselineRef(work)).toBe("origin/dev");
  });

  it("falls back to HEAD^ when there is no 'origin' remote to fetch", () => {
    saveEnv();
    clearEnv();
    const work = initRepo("main"); // one commit
    writeFileSync(join(work, "second.txt"), "second\n");
    commit(work, "second commit"); // now HEAD^ exists, no remote at all

    expect(resolveBaselineRef(work)).toBe("HEAD^");
  });

  it("falls back to HEAD^ when 'origin' exists but the branch can't be fetched", () => {
    saveEnv();
    clearEnv();
    const origin = initRepo("main");
    const work = tempDir("git-baseline-work-");
    git(["init", "-q", "-b", "main"], work);
    writeFileSync(join(work, "own1.txt"), "own1\n");
    commit(work, "own init");
    writeFileSync(join(work, "own2.txt"), "own2\n");
    commit(work, "own second"); // HEAD^ exists on the work repo itself
    git(["remote", "add", "origin", origin], work);

    // A branch name the origin repo genuinely does not have -- the fetch
    // fails cleanly rather than hanging, and the fallback kicks in.
    process.env.GITHUB_BASE_REF = "a-branch-that-does-not-exist";
    expect(resolveBaselineRef(work)).toBe("HEAD^");
  });

  it("returns null when neither the fetch nor HEAD^ resolves (single-commit, no remote)", () => {
    saveEnv();
    clearEnv();
    const work = initRepo("main"); // exactly one commit, no remote

    expect(resolveBaselineRef(work)).toBeNull();
  });
});

describe("readCatalogAtRef", () => {
  it("returns null immediately for a null ref, without touching git", () => {
    const cwd = join(tmpdir(), "does-not-exist-" + Math.random().toString(36).slice(2));
    expect(readCatalogAtRef(null, join(cwd, "whatever.json"), cwd)).toBeNull();
  });

  it("reads and parses a JSON file as it existed at a real ref", () => {
    const repo = initRepo("main");
    const file = join(repo, "catalog.json");
    writeFileSync(file, JSON.stringify({ "a.b": "hello" }));
    commit(repo, "add catalog");
    const sha = git(["rev-parse", "HEAD"], repo).trim();

    expect(readCatalogAtRef(sha, file, repo)).toEqual({ "a.b": "hello" });
    expect(readCatalogAtRef("HEAD", file, repo)).toEqual({ "a.b": "hello" });
  });

  it("returns null when the file did not exist at that ref (brand-new catalog)", () => {
    const repo = initRepo("main");
    const oldSha = git(["rev-parse", "HEAD"], repo).trim();
    writeFileSync(join(repo, "new-catalog.json"), JSON.stringify({ k: "v" }));
    commit(repo, "add new catalog");

    expect(readCatalogAtRef(oldSha, join(repo, "new-catalog.json"), repo)).toBeNull();
  });

  it("returns null when the content at that ref isn't valid JSON", () => {
    const repo = initRepo("main");
    const file = join(repo, "not-json.json");
    writeFileSync(file, "{ not valid json");
    commit(repo, "broken json");

    expect(readCatalogAtRef("HEAD", file, repo)).toBeNull();
  });

  it("returns null for a ref that doesn't resolve", () => {
    const repo = initRepo("main");
    const file = join(repo, "seed.txt");

    expect(readCatalogAtRef("not-a-real-ref", file, repo)).toBeNull();
  });
});

/**
 * Corpus-commit provenance label unit tests (issue #1203).
 *
 * `resolveCorpusCommit()` used to hardcode `keymanapp/keyboards@<sha>`
 * regardless of which fork was actually checked out. These tests lock the
 * fix: the `<org>/<repo>` label is derived from the checkout's `origin`
 * remote (SSH and HTTPS forms), and falls back to `unknown/unknown` (never
 * back to the old hardcoded literal) when the remote can't be resolved.
 */

import { describe, it, expect } from "vitest";
import { execSync } from "node:child_process";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { normalizeGithubRemote, resolveCorpusCommit } from "./scan.js";

describe("normalizeGithubRemote", () => {
  it("normalizes an https github.com remote", () => {
    expect(normalizeGithubRemote("https://github.com/keyboard-studio/keyboards")).toBe(
      "keyboard-studio/keyboards",
    );
  });

  it("normalizes an https github.com remote with a .git suffix", () => {
    expect(normalizeGithubRemote("https://github.com/keyboard-studio/keyboards.git")).toBe(
      "keyboard-studio/keyboards",
    );
  });

  it("normalizes an ssh github.com remote", () => {
    expect(normalizeGithubRemote("git@github.com:keyboard-studio/keyboards.git")).toBe(
      "keyboard-studio/keyboards",
    );
  });

  it("normalizes an ssh github.com remote without a .git suffix", () => {
    expect(normalizeGithubRemote("git@github.com:keymanapp/keyboards")).toBe(
      "keymanapp/keyboards",
    );
  });

  it("returns null for an unrecognized remote shape", () => {
    expect(normalizeGithubRemote("https://gitlab.com/foo/bar.git")).toBeNull();
    expect(normalizeGithubRemote("not-a-url")).toBeNull();
  });
});

describe("resolveCorpusCommit", () => {
  it("falls back to unknown/unknown@unknown when the dir isn't a git checkout", () => {
    const dir = mkdtempSync(join(tmpdir(), "facet-index-provenance-"));
    expect(resolveCorpusCommit(dir)).toBe("unknown/unknown@unknown");
  });

  it("falls back to unknown/unknown@<sha> when origin isn't set", () => {
    const dir = mkdtempSync(join(tmpdir(), "facet-index-provenance-"));
    execSync("git init -q", { cwd: dir });
    execSync('git -c user.email=t@t.com -c user.name=t commit -q --allow-empty -m init', {
      cwd: dir,
    });
    const sha = execSync("git rev-parse HEAD", { cwd: dir, encoding: "utf8" }).trim();
    expect(resolveCorpusCommit(dir)).toBe(`unknown/unknown@${sha}`);
  });

  it("derives the label from an https origin remote (not the old hardcoded literal)", () => {
    const dir = mkdtempSync(join(tmpdir(), "facet-index-provenance-"));
    execSync("git init -q", { cwd: dir });
    execSync('git -c user.email=t@t.com -c user.name=t commit -q --allow-empty -m init', {
      cwd: dir,
    });
    execSync("git remote add origin https://github.com/keyboard-studio/keyboards.git", {
      cwd: dir,
    });
    const sha = execSync("git rev-parse HEAD", { cwd: dir, encoding: "utf8" }).trim();
    expect(resolveCorpusCommit(dir)).toBe(`keyboard-studio/keyboards@${sha}`);
  });

  it("derives the label from an ssh origin remote", () => {
    const dir = mkdtempSync(join(tmpdir(), "facet-index-provenance-"));
    execSync("git init -q", { cwd: dir });
    execSync('git -c user.email=t@t.com -c user.name=t commit -q --allow-empty -m init', {
      cwd: dir,
    });
    execSync("git remote add origin git@github.com:keyboard-studio/keyboards.git", {
      cwd: dir,
    });
    const sha = execSync("git rev-parse HEAD", { cwd: dir, encoding: "utf8" }).trim();
    expect(resolveCorpusCommit(dir)).toBe(`keyboard-studio/keyboards@${sha}`);
  });
});

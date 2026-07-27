/**
 * Keyboards-checkout provenance label unit tests (issue #1203).
 *
 * `resolveKeyboardsProvenance()` used to hardcode `keymanapp/keyboards@<sha>`
 * regardless of which fork was actually checked out. These tests lock the
 * fix: the `<org>/<repo>` label is derived from the checkout's `origin`
 * remote (SSH and HTTPS forms), and falls back to `unknown/unknown` (never
 * back to the old hardcoded literal) when the remote can't be resolved.
 * Mirrors facet-index/scan.test.ts.
 */

import { describe, it, expect } from "vitest";
import { execSync } from "node:child_process";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { normalizeGithubRemote, resolveKeyboardsProvenance } from "./scan.js";

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

describe("resolveKeyboardsProvenance", () => {
  // resolveKeyboardsProvenance takes a `releaseDir` and derives the checkout
  // root via dirname(releaseDir), mirroring how the CLI calls it with
  // args.releaseDir (the corpus's release/ subdirectory).

  it("falls back to unknown/unknown@unknown when the dir isn't a git checkout", () => {
    const root = mkdtempSync(join(tmpdir(), "supportability-provenance-"));
    expect(resolveKeyboardsProvenance(join(root, "release"))).toBe("unknown/unknown@unknown");
  });

  it("falls back to unknown/unknown@<sha> when origin isn't set", () => {
    const root = mkdtempSync(join(tmpdir(), "supportability-provenance-"));
    execSync("git init -q", { cwd: root });
    execSync('git -c user.email=t@t.com -c user.name=t commit -q --allow-empty -m init', {
      cwd: root,
    });
    const sha = execSync("git rev-parse HEAD", { cwd: root, encoding: "utf8" }).trim();
    expect(resolveKeyboardsProvenance(join(root, "release"))).toBe(`unknown/unknown@${sha}`);
  });

  it("derives the label from an https origin remote (not the old hardcoded literal)", () => {
    const root = mkdtempSync(join(tmpdir(), "supportability-provenance-"));
    execSync("git init -q", { cwd: root });
    execSync('git -c user.email=t@t.com -c user.name=t commit -q --allow-empty -m init', {
      cwd: root,
    });
    execSync("git remote add origin https://github.com/keyboard-studio/keyboards.git", {
      cwd: root,
    });
    const sha = execSync("git rev-parse HEAD", { cwd: root, encoding: "utf8" }).trim();
    expect(resolveKeyboardsProvenance(join(root, "release"))).toBe(
      `keyboard-studio/keyboards@${sha}`,
    );
  });

  it("derives the label from an ssh origin remote", () => {
    const root = mkdtempSync(join(tmpdir(), "supportability-provenance-"));
    execSync("git init -q", { cwd: root });
    execSync('git -c user.email=t@t.com -c user.name=t commit -q --allow-empty -m init', {
      cwd: root,
    });
    execSync("git remote add origin git@github.com:keyboard-studio/keyboards.git", {
      cwd: root,
    });
    const sha = execSync("git rev-parse HEAD", { cwd: root, encoding: "utf8" }).trim();
    expect(resolveKeyboardsProvenance(join(root, "release"))).toBe(
      `keyboard-studio/keyboards@${sha}`,
    );
  });
});

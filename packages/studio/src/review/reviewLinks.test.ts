import { describe, expect, it } from "vitest";

import { hardLinkForTarget, parseReviewPath } from "./reviewLinks.ts";

describe("parseReviewPath — links that skip the picker", () => {
  it("a PR link may name the keyboard", () => {
    expect(
      parseReviewPath("/review/keymanapp/keyboards/pull/4200/experimental/g/gikuyukanya"),
    ).toEqual({
      kind: "pr",
      owner: "keymanapp",
      prNumber: 4200,
      keyboardPath: "experimental/g/gikuyukanya",
    });
  });

  it("accepts a pasted GitHub PR URL, tab suffix and all", () => {
    expect(
      parseReviewPath("/review/https://github.com/keymanapp/keyboards/pull/4200/files"),
    ).toEqual({ kind: "pr", owner: "keymanapp", prNumber: 4200 });
  });

  it("accepts a GitHub tree/blob URL and trims to the keyboard folder", () => {
    expect(
      parseReviewPath(
        "/review/https:/github.com/keymanapp/keyboards/blob/master/release/s/sisaali/source/sisaali.kmn",
      ),
    ).toEqual({ kind: "repo", owner: "keymanapp", keyboardPath: "release/s/sisaali" });
  });

  it("rejects a path that is not a keyboard folder", () => {
    expect(parseReviewPath("/review/keymanapp/keyboards/README.md")).toBeNull();
  });
});

describe("hardLinkForTarget", () => {
  it("a PR link names the keyboard, so a shared multi-keyboard PR link runs directly", () => {
    const url = hardLinkForTarget({
      source: "km-prs",
      owner: "keymanapp",
      repo: "keyboards",
      path: "release/i/ibibio_tonal",
      keyboardId: "ibibio_tonal",
      displayName: "ibibio_tonal",
      sha: "a".repeat(40),
      prNumber: 4193,
    });
    expect(url).toBe("/review/keymanapp/keyboards/pull/4193/release/i/ibibio_tonal");
    expect(parseReviewPath(url)).toEqual({
      kind: "pr",
      owner: "keymanapp",
      prNumber: 4193,
      keyboardPath: "release/i/ibibio_tonal",
    });
  });
});

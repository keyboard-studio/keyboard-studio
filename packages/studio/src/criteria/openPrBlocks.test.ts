import { describe, expect, it } from "vitest";
import type { FindingKey, ReviewNote } from "@keyboard-studio/contracts";

import { buildReviewBlock, buildSourceBlock, escapeMarkdown } from "./openPrBlocks.ts";

const note = (text: string): ReviewNote => ({
  key: "KM_X:a" as FindingKey,
  criterionId: "18.15",
  text,
  writtenAt: "2026-01-01T00:00:00Z",
});

describe("buildSourceBlock", () => {
  it("matches the contract text", () => {
    expect(
      buildSourceBlock({
        owner: "keymanapp",
        repo: "keyboards",
        shortSha: "abc1234",
        path: "release/sil/sil_cameroon_qwerty",
        fromVersion: "6.0.4",
        toVersion: "6.0.5",
      }),
    ).toBe(
      [
        "### Updated from",
        "- Repository: keymanapp/keyboards @ `abc1234`",
        "- Path: `release/sil/sil_cameroon_qwerty`",
        "- Version: 6.0.4 → 6.0.5",
      ].join("\n"),
    );
  });

  it("adds the curated-copy note and omits an unknown sha", () => {
    const text = buildSourceBlock({
      owner: "keymanapp",
      repo: "keyboards",
      path: "release/b/basic_kbdus",
      fromVersion: "1.0",
      toVersion: "1.1",
      replacesCuratedSha: "def5678",
    });
    expect(text).toContain("- Repository: keymanapp/keyboards\n");
    expect(text).toContain(
      "- Note: replaces the curated keyboard-studio/keyboards copy (`def5678`).",
    );
  });
});

describe("buildReviewBlock", () => {
  it("is null with nothing to report", () => {
    expect(buildReviewBlock({ kept: [], inherited: [] })).toBeNull();
  });

  it("matches the contract text for kept and inherited entries", () => {
    expect(
      buildReviewBlock({
        kept: [
          {
            criterionId: "18.15",
            description: "Touch and desktop produce the same characters",
            note: note("intentional"),
          },
        ],
        inherited: [
          { criterionId: "5.5b", description: "README links to the keyboard's Keyman page" },
        ],
      }),
    ).toBe(
      [
        "### Criteria review",
        "**Kept despite a new failure** (author's reasons):",
        '- 18.15 Touch and desktop produce the same characters: "intentional"',
        "",
        "**Inherited** (failing before this update; not introduced here):",
        "- 5.5b README links to the keyboard's Keyman page",
      ].join("\n"),
    );
  });

  it("escapes markdown and newlines in a note so it cannot break the block", () => {
    const block = buildReviewBlock({
      kept: [
        {
          criterionId: "1.1",
          description: "d",
          note: note("x\n### Evil [l](http://e) `c` *b*"),
        },
      ],
      inherited: [],
    })!;
    expect(block.split("\n")).toHaveLength(3);
    expect(block).not.toContain("\n###  Evil");
    expect(block).toContain("\\#\\#\\# Evil \\[l\\]\\(http://e\\) \\`c\\` \\*b\\*");
  });

  it("escapeMarkdown escapes a bare backslash", () => {
    expect(escapeMarkdown("a\\b")).toBe("a\\\\b");
  });
});

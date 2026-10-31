// Tests for the Group A2 Batch 5 repo-context twins
// (1.2b/1.3b/1.4b/19.1b/19.2b) and the Group C extraneous-files check.

import { describe, expect, it } from "vitest";
import {
  checkAttribution,
  checkFilesOutsideFolder,
  checkHistoryAttributionBad,
  checkKeyboardIdConflict,
  checkPrAttributionBad,
  checkRepoContext,
  checkRepoNoOrganizingFolder,
  checkRepoPlacementBad,
  checkRepoRootSource,
  type RepoContextFacts,
} from "./check-repo-context.js";
import type { ReviewContext } from "@keyboard-studio/contracts";

const ID = "gff_amharic";

function facts(overrides: Partial<ReviewContext> = {}): RepoContextFacts {
  return {
    keyboardId: ID,
    review: {
      repoPath: "release/gff/gff_amharic",
      treePaths: [
        "release/gff/gff_amharic/HISTORY.md",
        "release/gff/gff_amharic/source/gff_amharic.kmn",
      ],
      isPr: false,
      ...overrides,
    },
  };
}

describe("repo-context twins", () => {
  it("passes a well-placed keyboard", () => {
    expect(checkRepoContext(facts()).findings).toEqual([]);
  });

  it("1.2b flags a folder outside release/ or experimental/", () => {
    const { findings: f } = checkRepoPlacementBad(
      facts({ repoPath: "staging/gff/gff_amharic" }),
    );
    expect(f).toHaveLength(1);
    expect(f[0]!.code).toBe("KM_LINT_REPO_PLACEMENT_BAD");
  });

  it("1.2b accepts experimental/", () => {
    expect(
      checkRepoPlacementBad(
        facts({ repoPath: "experimental/gff/gff_amharic" }),
      ).findings,
    ).toEqual([]);
  });

  it("1.3b flags a folder without an organizing subfolder", () => {
    const { findings: f } = checkRepoNoOrganizingFolder(
      facts({ repoPath: "release/gff_amharic" }),
    );
    expect(f).toHaveLength(1);
    expect(f[0]!.code).toBe("KM_LINT_REPO_NO_ORGANIZING_FOLDER");
  });

  it("1.4b flags a source file at the repo root", () => {
    const { findings: f } = checkRepoRootSource(
      facts({ treePaths: ["stray.kmn", "release/gff/gff_amharic/HISTORY.md"] }),
    );
    expect(f).toHaveLength(1);
    expect(f[0]!.code).toBe("KM_LINT_REPO_ROOT_SOURCE");
    expect(f[0]!.location.file).toBe("stray.kmn");
  });

  it("1.4b ignores non-source root files", () => {
    expect(
      checkRepoRootSource(facts({ treePaths: ["README.md"] })).findings,
    ).toEqual([]);
  });

  it("Group C flags extraneous files outside the folder", () => {
    const { findings: f } = checkFilesOutsideFolder(
      facts({
        treePaths: [
          "release/gff/gff_amharic/HISTORY.md",
          "release/gff/gff_amharic-old.kmn",
        ],
      }),
    );
    expect(f).toHaveLength(1);
    expect(f[0]!.code).toBe("KM_LINT_FILES_OUTSIDE_FOLDER");
  });

  it("Group C ignores files that do not match the keyboard id", () => {
    expect(
      checkFilesOutsideFolder(
        facts({ treePaths: ["release/other/other.kmn"] }),
      ).findings,
      ).toEqual([]);
  });

  it("19.1b passes a complete attribution block", () => {
    const { findings: f } = checkPrAttributionBad(
      facts({
        isPr: true,
        prBody:
          "Adapted from release/sil/sil_x.\nCommit: 0123456789abcdef0123456789abcdef01234567.\nRound-trip: clean.",
      }),
    );
    expect(f).toEqual([]);
  });

  it("19.1b flags an incomplete attribution block", () => {
    const { findings: f } = checkPrAttributionBad(
      facts({ isPr: true, prBody: "Adapted from release/sil/sil_x." }),
    );
    expect(f).toHaveLength(1);
    expect(f[0]!.code).toBe("KM_LINT_PR_ATTRIBUTION_BAD");
    expect(f[0]!.message).toContain("commit SHA");
  });

  it("19.1b stays silent without an adaptation signal", () => {
    expect(
      checkPrAttributionBad(facts({ isPr: true, prBody: "Fix a typo." })).findings,
    ).toEqual([]);
  });

  it("19.2b flags a missing Adapted-from bullet", () => {
    const { findings: f } = checkHistoryAttributionBad(
      facts({ historyMd: "# History\n\n## 1.0\n\n- Initial release.\n" }),
    );
    // The check fires on the missing bullet; the resolver's isAdaptation
    // fact (applicability gate) decides whether the row applies at all.
    expect(f).toHaveLength(1);
    expect(f[0]!.code).toBe("KM_LINT_HISTORY_ATTRIBUTION_BAD");
    expect(f[0]!.message).toContain("no 'Adapted from");
  });

  it("19.2b flags a malformed Adapted-from bullet", () => {
    const { findings: f } = checkHistoryAttributionBad(
      facts({ historyMd: "Adapted from\n" }),
    );
    expect(f).toHaveLength(1);
    expect(f[0]!.code).toBe("KM_LINT_HISTORY_ATTRIBUTION_BAD");
  });

  it("19.2b passes a well-formed bullet", () => {
    expect(
      checkHistoryAttributionBad(
        facts({ historyMd: "- Adapted from release/sil/sil_x\n" }),
      ).findings,
      ).toEqual([]);
  });

  it("19.1b/19.2b name the moot reason when the precondition is absent", () => {
    expect(checkPrAttributionBad(facts({ isPr: false })).verified).toEqual([
      "No PR body to check.",
    ]);
    expect(
      checkPrAttributionBad(facts({ isPr: true, prBody: "Fix a typo." }))
        .verified,
    ).toEqual(["No adaptation signal in the PR body."]);
    expect(
      checkHistoryAttributionBad(facts({ historyMd: undefined })).verified,
    ).toEqual(["No HISTORY.md to check (absence is 3.1b's check)."]);
  });

  it("1.4b/Group C are moot with an empty tree, naming why", () => {
    const empty = facts({ treePaths: [] });
    expect(checkRepoRootSource(empty).verified).toEqual([
      "No files in the tree to check.",
    ]);
    expect(checkFilesOutsideFolder(empty).verified).toEqual([
      "No files in the tree to check.",
    ]);
  });

  it("reports repo codes through the aggregate", () => {
    const f = checkRepoContext(
      facts({
        repoPath: "staging/x",
        treePaths: ["stray.kmn", "staging/gff_amharic_backup.kmn"],
      }),
    )
      .findings.map((x) => x.code)
      .sort();
    expect(f).toEqual(
      [
        "KM_LINT_REPO_PLACEMENT_BAD",
        "KM_LINT_REPO_NO_ORGANIZING_FOLDER",
        "KM_LINT_REPO_ROOT_SOURCE",
        "KM_LINT_FILES_OUTSIDE_FOLDER",
      ].sort(),
    );
  });

  it("reports attribution codes through the aggregate", () => {
    const f = checkAttribution(
      facts({
        isPr: true,
        prBody: "Adapted from release/sil/sil_x.",
        historyMd: "Adapted from\n",
      }),
    )
      .findings.map((x) => x.code)
      .sort();
    expect(f).toEqual(
      ["KM_LINT_PR_ATTRIBUTION_BAD", "KM_LINT_HISTORY_ATTRIBUTION_BAD"].sort(),
    );
  });
});

describe("1.5 keyboard-ID conflict (KM_LINT_DUPLICATE_KEYBOARD_ID)", () => {
  const prFacts = (
    overrides: Partial<ReviewContext> = {},
  ): RepoContextFacts =>
    facts({
      isPr: true,
      repoPath: "experimental/gff/gff_amharic",
      treePaths: ["experimental/gff/gff_amharic/source/gff_amharic.kmn"],
      idConflictAtBase: { baseSha: "abc1234" + "0".repeat(33), existingTiers: [] },
      ...overrides,
    });

  it("non-PR target is met-moot", () => {
    const r = checkKeyboardIdConflict(facts());
    expect(r.findings).toEqual([]);
    expect(r.verified.join(" ")).toMatch(/uniqueness was established at submission/);
  });

  it("PR with no existing tiers passes with a not-found note", () => {
    const r = checkKeyboardIdConflict(prFacts());
    expect(r.code).toBe("KM_LINT_DUPLICATE_KEYBOARD_ID");
    expect(r.findings).toEqual([]);
    expect(r.verified.join(" ")).toMatch(/not found in experimental/);
  });

  it("PR modifying the existing folder is an upgrade, not a conflict", () => {
    const r = checkKeyboardIdConflict(
      prFacts({
        idConflictAtBase: {
          baseSha: "abc1234" + "0".repeat(33),
          existingTiers: ["experimental"],
        },
      }),
    );
    expect(r.findings).toEqual([]);
    expect(r.verified.join(" ")).toMatch(/Upgrade to existing experimental\/gff\/gff_amharic/);
  });

  it("PR adding a new folder while the ID exists elsewhere is a conflict", () => {
    const r = checkKeyboardIdConflict(
      prFacts({
        idConflictAtBase: {
          baseSha: "abc1234" + "0".repeat(33),
          existingTiers: ["release"],
        },
      }),
    );
    expect(r.findings).toHaveLength(1);
    expect(r.findings[0]!.code).toBe("KM_LINT_DUPLICATE_KEYBOARD_ID");
    expect(r.findings[0]!.message).toMatch(/already used by a different keyboard in release/);
  });

  it("cross-tier move with the old folder touched is a deprecation, not a conflict", () => {
    const r = checkKeyboardIdConflict(
      prFacts({
        repoPath: "legacy/gff/gff_amharic",
        treePaths: [
          "legacy/gff/gff_amharic/source/gff_amharic.kmn",
          "release/gff/gff_amharic/source/gff_amharic.kmn",
        ],
        idConflictAtBase: {
          baseSha: "abc1234" + "0".repeat(33),
          existingTiers: ["release"],
        },
      }),
    );
    expect(r.findings).toEqual([]);
    expect(r.verified.join(" ")).toMatch(
      /Deprecation: gff_amharic moving from release\/ to legacy\//,
    );
  });

  it("PR body mentioning deprecation marks a cross-tier presence as a move", () => {
    const r = checkKeyboardIdConflict(
      prFacts({
        prBody: "Deprecating the old release in favor of this rewrite.",
        idConflictAtBase: {
          baseSha: "abc1234" + "0".repeat(33),
          existingTiers: ["release"],
        },
      }),
    );
    expect(r.findings).toEqual([]);
    expect(r.verified.join(" ")).toMatch(/Deprecation/);
  });

  it("mixed: one tier conflicts while another is an upgrade", () => {
    const r = checkKeyboardIdConflict(
      prFacts({
        treePaths: [
          "experimental/gff/gff_amharic/source/gff_amharic.kmn",
          "release/gff/gff_amharic/source/gff_amharic.kmn",
        ],
        idConflictAtBase: {
          baseSha: "abc1234" + "0".repeat(33),
          existingTiers: ["experimental", "legacy"],
        },
      }),
    );
    // experimental is touched (upgrade); legacy is untouched (conflict).
    expect(r.findings).toHaveLength(1);
    expect(r.findings[0]!.message).toMatch(/in legacy/);
    expect(r.findings[0]!.message).toMatch(/Also an upgrade to experimental/);
  });

  it("missing base lookup never manufactures a verdict", () => {
    const r = checkKeyboardIdConflict(prFacts({ idConflictAtBase: undefined }));
    expect(r.findings).toEqual([]);
  });

  it("runs through the checkRepoContext aggregate", () => {
    const out = checkRepoContext(
      prFacts({
        idConflictAtBase: {
          baseSha: "abc1234" + "0".repeat(33),
          existingTiers: ["release"],
        },
      }),
    );
    expect(out.findings.map((x) => x.code)).toContain(
      "KM_LINT_DUPLICATE_KEYBOARD_ID",
    );
    expect(out.verifiedByCode.has("KM_LINT_DUPLICATE_KEYBOARD_ID")).toBe(false);
  });
});

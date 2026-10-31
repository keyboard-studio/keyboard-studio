// review.test — unit tests for the /review Health Check module.
// Covers the security-relevant pure parts: snapshot path validation and
// fetch caps (fetchSnapshot with a stub fetch), target label formatting,
// and deep-link param validation (targetFromParams).

import { describe, expect, it } from "vitest";
import {
  fetchSnapshot,
  SNAPSHOT_MAX_FILES,
} from "./useReviewSnapshot.ts";
import {
  reviewTargetLabel,
  type ReviewTarget,
} from "./reviewSources.ts";
import { targetFromParams } from "./ReviewScreen.tsx";
import { parseReviewPath } from "./reviewLinks.ts";
import type { ReviewIndex } from "./reviewSources.ts";
import { rehydrateResult, runJudgeJob } from "./judgeWorkerProtocol.ts";
import { ALL_CRITERIA } from "@keyboard-studio/contracts";

const TARGET: ReviewTarget = {
  source: "km-repo",
  owner: "keymanapp",
  repo: "keyboards",
  path: "release/gff/gff_amharic",
  keyboardId: "gff_amharic",
  displayName: "GFF Amharic",
  sha: "9f3ac21b4d5e6f7890abcdef1234567890abcdef",
};

function stubFetch(
  tree: Array<{ path: string; size?: number; type?: string }>,
  blobs: Record<string, string> = {},
  truncated = false,
): typeof fetch {
  return (async (url: string) => {
    const u = String(url);
    if (u.includes("/git/trees/")) {
      return {
        ok: true,
        status: 200,
        json: async () => ({ tree, truncated }),
      };
    }
    const m = /\/review-proxy\/[^/]+\/[^/]+\/[0-9a-f]{40}\/(.+)$/.exec(u);
    const repoPath = m?.[1] ?? "";
    const body = blobs[repoPath] ?? `content of ${repoPath}`;
    return {
      ok: true,
      status: 200,
      text: async () => body,
      arrayBuffer: async () => new TextEncoder().encode(body).buffer,
    };
  }) as unknown as typeof fetch;
}

describe("fetchSnapshot", () => {
  it("stores blobs at folder-relative VFS paths", async () => {
    const snap = await fetchSnapshot(
      TARGET,
      undefined,
      stubFetch(
        [
          { path: "release/gff/gff_amharic/source/gff_amharic.kmn", size: 100, type: "blob" },
          { path: "release/gff/gff_amharic/HISTORY.md", size: 50, type: "blob" },
        ],
        { "release/gff/gff_amharic/source/gff_amharic.kmn": "store(&NAME) 'X'" },
      ),
    );
    expect(snap.fileCount).toBe(2);
    expect(snap.vfs.get("source/gff_amharic.kmn")?.content).toBe("store(&NAME) 'X'");
    expect(snap.vfs.get("HISTORY.md")?.content).toBe(
      "content of release/gff/gff_amharic/HISTORY.md",
    );
    expect(snap.skipped).toEqual([]);
  });

  it("rejects entries outside the keyboard folder", async () => {
    const snap = await fetchSnapshot(
      TARGET,
      undefined,
      stubFetch([
        { path: "release/gff/gff_amharic/source/gff_amharic.kmn", size: 10, type: "blob" },
        // Prefix attack: folder name is a prefix but not a segment.
        { path: "release/gff/gff_amharic_evil/pwn.kmn", size: 10, type: "blob" },
        // Traversal attempt.
        { path: "release/gff/gff_amharic/../other/x.kmn", size: 10, type: "blob" },
        // Absolute path.
        { path: "/etc/passwd", size: 10, type: "blob" },
        // Non-blob entries are ignored.
        { path: "release/gff/gff_amharic/source", type: "tree" },
      ]),
    );
    expect(snap.fileCount).toBe(1);
    expect(snap.vfs.list()).toEqual(["source/gff_amharic.kmn"]);
  });

  it("enforces the file-count cap with named skips", async () => {
    const tree = Array.from({ length: SNAPSHOT_MAX_FILES + 5 }, (_, i) => ({
      path: `release/gff/gff_amharic/source/f${i}.txt`,
      size: 10,
      type: "blob" as const,
    }));
    const snap = await fetchSnapshot(TARGET, undefined, stubFetch(tree));
    expect(snap.fileCount).toBe(SNAPSHOT_MAX_FILES);
    expect(snap.skipped).toHaveLength(5);
    expect(snap.skipped[0]!.reason).toContain("file-count cap");
  });

  it("skips oversized files with a named reason", async () => {
    const snap = await fetchSnapshot(
      TARGET,
      undefined,
      stubFetch([
        { path: "release/gff/gff_amharic/source/gff_amharic.kmn", size: 10, type: "blob" },
        { path: "release/gff/gff_amharic/big.bin", size: 99_000_000, type: "blob" },
      ]),
    );
    expect(snap.fileCount).toBe(1);
    expect(snap.skipped).toHaveLength(1);
    expect(snap.skipped[0]!.path).toContain("big.bin");
  });

  it("refuses a truncated tree rather than judging a partial list", async () => {
    await expect(
      fetchSnapshot(
        TARGET,
        undefined,
        stubFetch(
          [{ path: "release/gff/gff_amharic/source/gff_amharic.kmn", size: 10, type: "blob" }],
          {},
          true,
        ),
      ),
    ).rejects.toThrow(/too large to enumerate/);
  });

  it("marks font binaries as binary VFS entries", async () => {
    const snap = await fetchSnapshot(
      TARGET,
      undefined,
      stubFetch(
        [{ path: "release/gff/gff_amharic/source/font.ttf", size: 100, type: "blob" }],
        { "release/gff/gff_amharic/source/font.ttf": "FAKEFONT" },
      ),
    );
    const entry = snap.vfs.get("source/font.ttf");
    expect(entry?.isBinary).toBe(true);
    expect(entry?.content).toBeInstanceOf(Uint8Array);
  });
});

describe("reviewTargetLabel", () => {
  it("formats repo targets", () => {
    expect(reviewTargetLabel(TARGET)).toBe(
      "keymanapp/keyboards · release/gff/gff_amharic @ 9f3ac21",
    );
  });

  it("formats PR targets", () => {
    expect(
      reviewTargetLabel({ ...TARGET, source: "km-prs", prNumber: 4200 }),
    ).toBe("keymanapp/keyboards PR #4200 · release/gff/gff_amharic @ 9f3ac21");
  });
});

const INDEX: ReviewIndex = {
  generatedAt: "2026-10-30T00:00:00Z",
  repos: {
    km: {
      owner: "keymanapp",
      repo: "keyboards",
      ref: "master",
      sha: "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa",
      keyboards: [
        { id: "gff_amharic", displayName: "GFF Amharic", path: "release/gff/gff_amharic", tier: "release" },
      ],
    },
    ks: {
      owner: "keyboard-studio",
      repo: "keyboards",
      ref: "master",
      sha: "bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb",
      keyboards: [],
    },
  },
  prs: { ks: [], km: [] },
};

function params(q: string): URLSearchParams {
  return new URLSearchParams(q);
}

describe("targetFromParams", () => {
  it("resolves a repo deep link from the index", () => {
    const t = targetFromParams(
      params("source=km-repo&path=release/gff/gff_amharic&sha=aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa"),
      INDEX,
    );
    expect(t?.keyboardId).toBe("gff_amharic");
    expect(t?.displayName).toBe("GFF Amharic");
    expect(t?.sha).toBe("aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa");
  });

  it("resolves a PR deep link without the index", () => {
    const t = targetFromParams(
      params("source=km-prs&path=release/gff/gff_amharic&sha=cccccccccccccccccccccccccccccccccccccccc&pr=4200"),
      INDEX,
    );
    expect(t?.prNumber).toBe(4200);
    expect(t?.displayName).toBe("gff_amharic");
  });

  it("rejects malformed shas", () => {
    expect(
      targetFromParams(params("source=km-repo&path=release/gff/gff_amharic&sha=zzz"), INDEX),
    ).toBeNull();
  });

  it("rejects path traversal", () => {
    expect(
      targetFromParams(
        params("source=km-repo&path=release/gff/../other&sha=aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa"),
        INDEX,
      ),
    ).toBeNull();
  });

  it("rejects unknown sources", () => {
    expect(
      targetFromParams(
        params("source=evil&path=release/gff/gff_amharic&sha=aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa"),
        INDEX,
      ),
    ).toBeNull();
  });

  it("returns null when params are missing", () => {
    expect(targetFromParams(params(""), INDEX)).toBeNull();
    expect(targetFromParams(params("source=km-repo"), INDEX)).toBeNull();
  });
});

const MIN_KMN = `store(&VERSION) "10.0"
store(&NAME) "T Test"
store(&TARGETS) "any"

begin Unicode > use(Main)

group(Main) using keys

+ [K_A] > 'a'

end group
`;

describe("runJudgeJob", () => {
  it("judges a minimal keyboard and returns serializable rows", async () => {
    const output = await runJudgeJob({
      files: [{ path: "source/t.kmn", content: MIN_KMN, isBinary: false }],
      keyboardId: "t",
      displayName: "T Test",
      options: { placement: "release" },
    });
    expect(output.ok).toBe(true);
    if (!output.ok) return;
    // Whole catalog judged, one row per criterion.
    expect(output.result.total).toBe(ALL_CRITERIA.length);
    expect(output.result.rows).toHaveLength(ALL_CRITERIA.length);
    // Evidence is materialized plain data: survives a structured-clone
    // round trip with no functions.
    const roundTripped = JSON.parse(JSON.stringify(output.result));
    expect(roundTripped.rows[0].evidence).toBeDefined();
    expect(typeof roundTripped.rows[0].evidence).toBe("object");
  }, 120_000);

  it("rehydrateResult restores the CriteriaResult shape", async () => {
    const output = await runJudgeJob({
      files: [{ path: "source/t.kmn", content: MIN_KMN, isBinary: false }],
      keyboardId: "t",
      displayName: "T Test",
      options: { placement: "release" },
    });
    expect(output.ok).toBe(true);
    if (!output.ok) return;
    const result = rehydrateResult(output.result);
    expect(result.total).toBe(ALL_CRITERIA.length);
    // Lazy evidence still works through the rehydrated closure.
    const evidence = result.rows[0]!.evidence();
    expect(typeof evidence.kind).toBe("string");
    expect(Array.isArray(evidence.lines)).toBe(true);
  }, 120_000);
});

describe("parseReviewPath", () => {
  it("parses a PR hard link", () => {
    expect(parseReviewPath("/review/keymanapp/keyboards/pull/4200")).toEqual({
      kind: "pr",
      owner: "keymanapp",
      prNumber: 4200,
    });
  });

  it("parses a published keyboard hard link", () => {
    expect(
      parseReviewPath("/review/keymanapp/keyboards/release/gff/gff_amharic"),
    ).toEqual({
      kind: "repo",
      owner: "keymanapp",
      keyboardPath: "release/gff/gff_amharic",
    });
  });

  it("returns null for the bare picker path", () => {
    expect(parseReviewPath("/review")).toBeNull();
    expect(parseReviewPath("/review/")).toBeNull();
  });

  it("rejects path traversal", () => {
    expect(parseReviewPath("/review/keymanapp/keyboards/../secret")).toBeNull();
  });
});

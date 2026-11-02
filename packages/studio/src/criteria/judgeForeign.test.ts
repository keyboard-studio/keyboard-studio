// /review foreign-mode judgment: the named predicates and lookups that
// replace the always-applicable / always-grey defaults (deprecation, partner,
// help .php, 3.4 base HISTORY, 11.7 display name, shared fonts).

import { describe, expect, it } from "vitest";

import { createVirtualFS } from "@keyboard-studio/contracts";
import type { ReviewContext, VirtualFSEntry } from "@keyboard-studio/contracts";

import {
  historyChangedInPr,
  isDeprecationInPlay,
  judgeForeignKeyboard,
  type JudgeForeignOptions,
} from "./judgeForeign.ts";

const ID = "ibibio_tonal";

const KMN = [
  "store(&VERSION) '10.0'",
  `store(&NAME) 'Ibibio Tonal'`,
  "store(&KEYBOARDVERSION) '1.0'",
  "store(&COPYRIGHT) 'Copyright (C) 2024 Fixture Holder'",
  "store(&TARGETS) 'windows'",
  "",
  "begin Unicode > use(main)",
  "",
  "group(main) using keys",
  "",
  "+ [K_A] > 'a'",
  "",
].join("\n");

function kps(opts: { name?: string; deprecates?: boolean; fontFile?: string } = {}): string {
  return [
    `<?xml version="1.0" encoding="utf-8"?>`,
    `<Package>`,
    `<Info>`,
    opts.name !== undefined ? `<Name URL="">${opts.name}</Name>` : "",
    `<Version URL="">1.0</Version>`,
    `</Info>`,
    opts.deprecates === true
      ? `<RelatedPackages><RelatedPackage ID="engram" Relationship="deprecates"/></RelatedPackages>`
      : "",
    `<Files>`,
    opts.fontFile !== undefined
      ? `<File><Name>${opts.fontFile}</Name><Description>Font</Description><CopyLocation>0</CopyLocation><FileType>.ttf</FileType></File>`
      : "",
    `</Files>`,
    `</Package>`,
  ].join("\n");
}

function entry(path: string, content: string): VirtualFSEntry {
  return { path, content, isBinary: false };
}

function vfsOf(extra: VirtualFSEntry[] = [], kpsText?: string) {
  return createVirtualFS([
    entry(`source/${ID}.kmn`, KMN),
    entry("HISTORY.md", "# History\n\n## 1.0 (2026-01-01)\n"),
    entry("README.md", "# Fixture\n"),
    ...(kpsText !== undefined ? [entry(`source/${ID}.kps`, kpsText)] : []),
    ...extra,
  ]);
}

async function judge(
  vfs: ReturnType<typeof vfsOf>,
  options: JudgeForeignOptions = {},
  displayName = ID,
) {
  const result = await judgeForeignKeyboard(vfs, ID, displayName, options);
  const row = (prefix: string) => {
    const r = result.rows.find((x) => x.criterion.id.startsWith(prefix));
    if (!r) throw new Error(`no row ${prefix}`);
    return r;
  };
  return { result, row };
}

const HELP_ROWS = ["11.2-", "11.3b-", "11.4b-", "11.6-", "11.7-", "11.8-"];

describe("foreign judge: help .php absent", () => {
  it("resolves the six help-content rows Not applicable, pointing at 11.1b", async () => {
    const { row } = await judge(vfsOf());
    for (const prefix of HELP_ROWS) {
      const r = row(prefix);
      expect(r.status, prefix).toBe("not-applicable");
      expect(r.evidence().lines).toEqual([
        "No help .php; its absence is reported by 11.1b.",
      ]);
    }
    expect(row("11.1b-").status).not.toBe("not-applicable");
  });

  it("judges them normally when a help .php exists", async () => {
    const php = "<?php\n$pagename = 'Ibibio Tonal Keyboard Help';\n";
    const { row } = await judge(
      vfsOf([entry(`source/help/${ID}.php`, php)]),
    );
    for (const prefix of HELP_ROWS) {
      expect(row(prefix).status, prefix).not.toBe("not-applicable");
    }
  });
});

describe("foreign judge: nested checks under a missing required file", () => {
  // 2026-11-02 ruling: a required file's absence is an error on its own
  // row, and the checks that read the file resolve Not applicable naming
  // that row (the 2026-10-31 help-.php precedent) — never a vacuous Met.
  const HISTORY_ROWS = ["3.3-", "3.4-", "3.5-", "3.6-", "3.7-", "7.1-"];

  function vfsWithout(...names: string[]) {
    const base = [
      entry(`source/${ID}.kmn`, KMN),
      entry("HISTORY.md", "# History\n\n## 1.0 (2026-01-01)\n"),
      entry("README.md", "# Fixture\n"),
    ];
    return createVirtualFS(base.filter((e) => !names.includes(e.path)));
  }

  it("the history cluster is Not applicable without HISTORY.md, naming 3.1b", async () => {
    const { row } = await judge(vfsWithout("HISTORY.md"));
    for (const prefix of HISTORY_ROWS) {
      const r = row(prefix);
      expect(r.status, prefix).toBe("not-applicable");
      expect(r.evidence().lines).toEqual([
        "No HISTORY.md; its absence is reported by 3.1b.",
      ]);
    }
    expect(row("3.1b-").status).toBe("not-met");
  });

  it("5.7 is Not applicable without README.md, naming 5.0", async () => {
    const { row } = await judge(vfsWithout("README.md"));
    expect(row("5.7-").status).toBe("not-applicable");
    expect(row("5.7-").evidence().lines).toEqual([
      "No README.md; its absence is reported by 5.0.",
    ]);
    expect(row("5.0-").status).toBe("not-met");
  });

  it("11.9/11.10 are Not applicable without the help .php, naming 11.1b", async () => {
    const { row } = await judge(vfsOf());
    for (const prefix of ["11.9-", "11.10-"]) {
      const r = row(prefix);
      expect(r.status, prefix).toBe("not-applicable");
      expect(r.evidence().lines).toEqual([
        "No help .php; its absence is reported by 11.1b.",
      ]);
    }
  });

  it("11.9/11.10 are Not applicable without welcome.htm, naming 6.3b", async () => {
    const php = "<?php\n$pagename = 'Ibibio Tonal Keyboard Help';\n";
    const { row } = await judge(vfsOf([entry(`source/help/${ID}.php`, php)]));
    for (const prefix of ["11.9-", "11.10-"]) {
      const r = row(prefix);
      expect(r.status, prefix).toBe("not-applicable");
      expect(r.evidence().lines).toEqual([
        "No welcome.htm; its absence is reported by 6.3b.",
      ]);
    }
  });

  it("11.5 is Not applicable only when both welcome.htm and the help .php are absent", async () => {
    const { row } = await judge(vfsOf());
    expect(row("11.5-").status).toBe("not-applicable");
    expect(row("11.5-").evidence().lines).toEqual([
      "No welcome.htm and no help .php; their absence is reported by 6.3b and 11.1b.",
    ]);
    // welcome.htm present, .php absent: 11.5 still scans welcome.htm.
    const { row: withWelcome } = await judge(
      vfsOf([entry("source/welcome.htm", "<html></html>")]),
    );
    expect(withWelcome("11.5-").status).not.toBe("not-applicable");
  });

  it("3.4 nests under the missing file on a PR that cannot compare", async () => {
    const { row } = await judge(vfsWithout("HISTORY.md"), {
      reviewContext: {
        repoPath: `experimental/i/${ID}`,
        isPr: true,
        treePaths: [`experimental/i/${ID}/source/${ID}.kmn`],
        idConflictAtBase: { baseSha: "abc", existingTiers: ["experimental"] },
      },
    });
    const r = row("3.4-");
    expect(r.status).toBe("not-applicable");
    expect(r.evidence().lines).toEqual([
      "No HISTORY.md; its absence is reported by 3.1b.",
    ]);
  });
});

describe("foreign judge: deprecation and partner predicates", () => {
  it("15.x is Not applicable (15.3 not falsely not-met) with no deprecation signal", async () => {
    const { row, result } = await judge(vfsOf([], kps()));
    for (const r of result.rows.filter((x) => x.criterion.section.startsWith("15."))) {
      expect(r.status, r.criterion.id).toBe("not-applicable");
    }
    expect(row("15.3").status).toBe("not-applicable");
  });

  it("legacy placement puts 15.x in play (15.3 not-met without linkage)", async () => {
    const { row } = await judge(vfsOf([], kps()), { placement: "legacy" });
    expect(row("15.3").status).toBe("not-met");
  });

  it("a DEPRECATED.md in the PR paths under the keyboard folder puts 15.x in play", async () => {
    const rc: ReviewContext = {
      repoPath: `experimental/i/${ID}`,
      isPr: true,
      treePaths: [`experimental/i/${ID}/DEPRECATED.md`],
    };
    expect(isDeprecationInPlay(vfsOf(), "experimental", rc)).toBe(true);
    // The same file under ANOTHER keyboard's folder does not count.
    expect(
      isDeprecationInPlay(vfsOf(), "experimental", {
        ...rc,
        treePaths: ["experimental/o/other/DEPRECATED.md"],
      }),
    ).toBe(false);
  });

  it("a DEPRECATED.md in the VFS puts 15.x in play", async () => {
    const { row } = await judge(vfsOf([entry("DEPRECATED.md", "old")], kps()));
    expect(row("15.3").status).not.toBe("not-applicable");
  });

  it("a .kps Relationship=deprecates puts 15.x in play and 15.3 stays Met", async () => {
    const { row } = await judge(vfsOf([], kps({ deprecates: true })));
    expect(row("15.3").status).toBe("met");
  });

  it("section 16 stays applicable: no partner signal is not a Not applicable verdict (D7)", async () => {
    const { result } = await judge(vfsOf([], kps()));
    const rows = result.rows.filter((x) => x.criterion.section.startsWith("16."));
    expect(rows.length).toBeGreaterThan(0);
    for (const r of rows) expect(r.status).not.toBe("not-applicable");
  });
});

describe("foreign judge: 3.4 history cumulative on a PR", () => {
  const repoPath = `experimental/i/${ID}`;
  const baseCtx = (over: Partial<ReviewContext>): ReviewContext => ({
    repoPath,
    isPr: true,
    treePaths: [`${repoPath}/HISTORY.md`],
    idConflictAtBase: { baseSha: "abc", existingTiers: ["experimental"] },
    ...over,
  });
  const history = (vfs = vfsOf()) => vfs;

  it("historyChangedInPr is case-insensitive and unknown without a path list", () => {
    expect(historyChangedInPr(repoPath, [`${repoPath}/history.md`])).toBe(true);
    expect(historyChangedInPr(repoPath, [`${repoPath}/README.md`])).toBe(false);
    expect(historyChangedInPr(repoPath, undefined)).toBeUndefined();
  });

  it("HISTORY.md not in the PR paths: Met, unchanged", async () => {
    const { row } = await judge(history(), {
      reviewContext: baseCtx({ treePaths: [`${repoPath}/README.md`] }),
    });
    const r = row("3.4");
    expect(r.status).toBe("met");
    expect(r.evidence().lines).toEqual(["HISTORY.md unchanged by this PR"]);
  });

  it("new keyboard (folder absent at base): Not applicable", async () => {
    const { row } = await judge(history(), {
      reviewContext: baseCtx({
        idConflictAtBase: { baseSha: "abc", existingTiers: [] },
      }),
    });
    expect(row("3.4").status).toBe("not-applicable");
  });

  it("changed on an upgrade with the base text: runs the real comparison (not-met when truncated)", async () => {
    const vfs = vfsOf([
      entry("HISTORY.md", "# History\n\n## 1.1 (2026-02-01)\n\n* new\n"),
    ]);
    const { row } = await judge(vfs, {
      reviewContext: baseCtx({}),
      baseHistory: {
        kind: "text",
        text: "# History\n\n## 1.0 (2026-01-01)\n\n* first\n",
      },
    });
    expect(row("3.4").status).toBe("not-met");
  });

  it("changed on an upgrade with the base entries preserved: Met", async () => {
    const vfs = vfsOf([
      entry(
        "HISTORY.md",
        "# History\n\n## 1.1 (2026-02-01)\n\n* new\n\n## 1.0 (2026-01-01)\n\n* first\n",
      ),
    ]);
    const { row } = await judge(vfs, {
      reviewContext: baseCtx({}),
      baseHistory: {
        kind: "text",
        text: "# History\n\n## 1.0 (2026-01-01)\n\n* first\n",
      },
    });
    const r = row("3.4");
    expect(r.status).toBe("met");
    expect(r.evidence().lines.join(" ")).toContain("preserved");
  });

  it("a failed base fetch is Not yet checkable, never Met", async () => {
    const { row } = await judge(history(), {
      reviewContext: baseCtx({}),
      baseHistory: { kind: "failed" },
    });
    expect(row("3.4").status).toBe("not-yet-checkable");
    const none = await judge(history(), { reviewContext: baseCtx({}) });
    expect(none.row("3.4").status).toBe("not-yet-checkable");
  });

  it("an unknown base-folder lookup is Not yet checkable", async () => {
    const { row } = await judge(history(), {
      reviewContext: baseCtx({ idConflictAtBase: undefined as never }),
    });
    expect(row("3.4").status).toBe("not-yet-checkable");
  });
});

describe("foreign judge: 11.7 display name from the package", () => {
  const php = "<?php\n$pagename = 'Ibibio Tonal Keyboard Help';\n";

  it("uses the .kps <Info><Name> when displayName is just the id", async () => {
    const vfs = vfsOf([entry(`source/help/${ID}.php`, php)], kps({ name: "Ibibio Tonal" }));
    const { row } = await judge(vfs);
    expect(row("11.7").status).toBe("met");
  });

  it("falls back to the .kmn &NAME with no .kps name", async () => {
    const vfs = vfsOf([entry(`source/help/${ID}.php`, php)]);
    const { row } = await judge(vfs);
    expect(row("11.7").status).toBe("met");
  });

  it("a real display name is used as given", async () => {
    const vfs = vfsOf([entry(`source/help/${ID}.php`, php)], kps({ name: "Other" }));
    const { row } = await judge(vfs, {}, "Ibibio Tonal");
    expect(row("11.7").status).toBe("met");
  });
});

describe("foreign judge: shared fonts outside the keyboard folder", () => {
  const shared = "..\\..\\..\\shared\\fonts\\charis\\CharisSIL-R.ttf";

  it("8.7 is Not yet checkable naming the shared path; 9.5 stays applicable", async () => {
    const { row } = await judge(vfsOf([], kps({ fontFile: shared })));
    const r = row("8.7");
    expect(r.status).toBe("not-yet-checkable");
    expect(r.evidence().lines.join(" ")).toContain(shared);
    expect(row("9.5").status).not.toBe("not-applicable");
  });

  it("without any font reference 9.5 is Not applicable and 8.7 is not context-missing", async () => {
    const { row } = await judge(vfsOf([], kps()));
    expect(row("9.5").status).toBe("not-applicable");
    expect(row("8.7").evidence().kind).not.toBe("context-missing");
  });
});

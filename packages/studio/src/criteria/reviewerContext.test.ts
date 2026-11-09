// /review batch 4: changed-vs-already-there stamps, named Not applicable
// predicates for author/human rows, copyright context, side-by-side source
// lines, and the upgrade-PR scope note.

import { describe, expect, it } from "vitest";

import { ALL_CRITERIA, createVirtualFS } from "@keyboard-studio/contracts";
import type {
  LintFinding,
  ReviewContext,
  VirtualFSEntry,
} from "@keyboard-studio/contracts";

import { EMPTY_CRITERIA_RECORD } from "./criteriaTypes.ts";
import type { CriteriaInput } from "./criteriaTypes.ts";
import { judgeForeignKeyboard, stampPrDelta } from "./judgeForeign.ts";
import { resolveCriteria } from "./resolveCriteria.ts";
import { splitCitation } from "./CriterionRow.tsx";
import {
  buildReviewerSource,
  copyrightContextLines,
  kpsInfoField,
  scopeNote,
  sourceContextLines,
  stripMarkup,
} from "./reviewerSource.ts";

const ID = "ibibio_tonal";
const entry = (path: string, content: string): VirtualFSEntry => ({
  path,
  content,
  isBinary: false,
});

const finding = (file: string | undefined): LintFinding => ({
  code: "KM_LINT_COPYRIGHT_SYNTAX",
  severity: "warning",
  layer: "C",
  message: "m",
  ...(file !== undefined ? { location: { file, line: 0 } } : {}),
});

function makeInput(over: Partial<CriteriaInput> = {}): CriteriaInput {
  return {
    criteria: ALL_CRITERIA,
    mode: "foreign",
    lintFindings: [],
    record: EMPTY_CRITERIA_RECORD,
    facts: { fontBundled: true, deprecated: true, partnerPackage: true },
    ...over,
  };
}
const rowOf = (id: string, input: CriteriaInput) =>
  resolveCriteria(input).rows.find((r) => r.criterion.id.startsWith(id))!;

describe("prDelta stamping", () => {
  const vfs = createVirtualFS([
    entry("LICENSE.md", "x"),
    entry("source/a.kmn", "x"),
  ]);
  const rc: ReviewContext = {
    repoPath: "release/i/x",
    isPr: true,
    treePaths: ["release/i/x/source/a.kmn"],
  };
  it("stamps changed, unchanged, and leaves synthetic/empty/missing files alone", () => {
    const out = stampPrDelta(
      [
        finding("source/a.kmn"),
        finding("LICENSE.md"),
        finding("package"),
        finding(""),
        finding(undefined),
        finding("README.md"),
      ],
      rc,
      vfs,
    );
    expect(out.map((f) => f.prDelta)).toEqual([
      "changed",
      "unchanged",
      undefined,
      undefined,
      undefined,
      undefined,
    ]);
  });
  it("stamps nothing for a non-PR target", () => {
    const out = stampPrDelta([finding("LICENSE.md")], { ...rc, isPr: false }, vfs);
    expect(out[0]?.prDelta).toBeUndefined();
  });
  it("renders the delta line under File: without changing status", () => {
    const code = "KM_LINT_COPYRIGHT_SYNTAX";
    const crit = ALL_CRITERIA.find(
      (c) => c.band === "layer-c-enforce" && c.lintRuleId === code,
    )!;
    const make = (prDelta?: "changed" | "unchanged") =>
      resolveCriteria(
        makeInput({
          lintFindings: [
            { ...finding("LICENSE.md"), ...(prDelta ? { prDelta } : {}) },
          ],
        }),
      ).rows.find((r) => r.criterion.id === crit.id)!;
    expect(make("unchanged").evidence().lines).toContain(
      "Already present before this PR (file unchanged by this PR)",
    );
    expect(make("changed").evidence().lines).toContain("Changed in this PR");
    expect(make().evidence().lines.join("\n")).not.toMatch(/this PR/);
    expect(make("changed").status).toBe(make().status);
  });
});

describe("named Not applicable predicates", () => {
  const noPua = new Map([
    ["KM_LINT_PUA_KEYBOARD_PLACEMENT", ["No PUA codepoints in the produced output."]],
  ]);
  const withPua = new Map([
    ["KM_LINT_PUA_KEYBOARD_PLACEMENT", ["In experimental/; PUA codepoints: U+E000."]],
  ]);
  it("7.13 and 13.2 are Not applicable only on a positive no-PUA line", () => {
    for (const id of ["7.13-", "13.2-"]) {
      const r = rowOf(id, makeInput({ verifiedByCode: noPua }));
      expect(r.status).toBe("not-applicable");
      expect(r.evidence().lines[0]).toMatch(/no Private Use Area/);
      expect(rowOf(id, makeInput({ verifiedByCode: withPua })).status).toBe(
        "needs-author",
      );
      // check did not run: no fact, no Not applicable
      expect(rowOf(id, makeInput()).status).not.toBe("not-applicable");
    }
  });
  it("13.5 is Not applicable when 13.4 found no math-Latin look-alikes", () => {
    const v = new Map([
      [
        "KM_LINT_MATH_LATIN_LOOKALIKE",
        ["No mathematical Latin look-alikes in the produced output."],
      ],
    ]);
    expect(rowOf("13.5-", makeInput({ verifiedByCode: v })).status).toBe(
      "not-applicable",
    );
    expect(rowOf("13.5-", makeInput()).status).not.toBe("not-applicable");
  });
  it("14.1 is Not applicable for a keyboard the PR adds", () => {
    const facts = {
      fontBundled: true,
      deprecated: true,
      partnerPackage: true,
      newKeyboardAtBase: true,
    };
    expect(rowOf("14.1-", makeInput({ facts })).status).toBe("not-applicable");
    expect(rowOf("14.1-", makeInput()).status).toBe("needs-human");
  });
  it("applies in authored mode too (same engine verified lines)", () => {
    expect(
      rowOf("13.2-", makeInput({ mode: "authored", verifiedByCode: noPua })).status,
    ).toBe("not-applicable");
  });
});

describe("copyright context", () => {
  const verified = new Map([
    [
      "KM_LINT_COPYRIGHT_ABSENT",
      ["File: LICENSE.md", 'Found: "Copyright (C) 2015-2020 Fixture Holder"'],
    ],
  ]);
  const src = {
    kps: {
      name: { text: "N", url: "" },
      description: { text: "", url: "" },
      author: { text: "Jo Author", url: "https://example.org" },
      website: { text: "", url: "" },
    },
    kmnCopyright: "(c) 2015 SIL",
    historyYears: { earliest: 2015, latest: 2026 },
  };
  const ctx = (id: string) =>
    rowOf(id, makeInput({ verifiedByCode: verified, reviewerSource: src }))
      .evidence()
      .lines.join("\n");
  it("4.3 shows LICENSE holder, .kps Author with URL, &COPYRIGHT; no store(&Author) line", () => {
    const t = ctx("4.3-");
    expect(t).toContain('LICENSE.md copyright: "Copyright (C) 2015-2020 Fixture Holder"');
    expect(t).toContain('.kps <Info><Author>: "Jo Author" (https://example.org)');
    expect(t).toContain('.kmn &COPYRIGHT: "(c) 2015 SIL"');
    expect(t).not.toMatch(/store\(&Author\)/i);
  });
  it("4.2 and 4.8 show LICENSE years beside HISTORY years", () => {
    for (const id of ["4.2-", "4.8-"]) {
      const t = ctx(id);
      expect(t).toContain("LICENSE year(s): 2015-2020");
      expect(t).toContain("HISTORY.md entry years: earliest 2015, latest 2026");
    }
  });
  it("names the absence when LICENSE has no copyright line", () => {
    expect(
      rowOf("4.4-", makeInput({ reviewerSource: src })).evidence().lines.join("\n"),
    ).toContain("no copyright line found");
  });
});

describe("source context lines", () => {
  it("kpsInfoField reads attributes and scopes to <Info>", () => {
    const kps =
      '<Package><Info><Name URL="">Ibibio Tonal</Name><Author URL="https://a.b">Jo</Author></Info><Files><File><Name>..\\x.kmx</Name></File></Files></Package>';
    expect(kpsInfoField(kps, "Name")).toEqual({ text: "Ibibio Tonal", url: "" });
    expect(kpsInfoField(kps, "Author")).toEqual({ text: "Jo", url: "https://a.b" });
    expect(kpsInfoField(kps, "WebSite")).toEqual({ text: "", url: "" });
  });
  it("stripMarkup drops style, script, and tags", () => {
    expect(stripMarkup("<style>p{}</style><p>Hi <b>you</b></p>")).toBe("Hi you");
  });
  const vfs = createVirtualFS([
    entry("README.md", "# Ibibio Tonal\n\nbody"),
    entry(
      "HISTORY.md",
      "Title\n=====\n\n1.1 (2026-01-02)\n----\n* x\n\n1.0 (2015)\n----\n* y\n",
    ),
    entry(
      "source/welcome.htm",
      "<html><style>x{}</style><p>Welcome. To install, download the package. Type letters.</p></html>",
    ),
    entry("source/readme.htm", "<p>one two three</p>"),
  ]);
  const kps =
    '<Package><Info><Name URL="">Ibibio Tonal</Name><Description URL="">Desc</Description></Info></Package>';
  const src = buildReviewerSource({
    vfs,
    kpsText: kps,
    kpsLanguages: ["ibb-Latn", "zzz"],
    keyboardIR: undefined,
    reviewContext: undefined,
    isUpgradePr: false,
    langtags: (s) =>
      s === "ibb" ? { name: "Ibibio", script: "Latn", region: "NG" } : null,
  });
  it("name rows show .kps Name, README title", () => {
    const t = sourceContextLines("7.7-display-name-no-underscores", src);
    expect(t).toEqual(['.kps <Info><Name>: "Ibibio Tonal"', 'README title: "Ibibio Tonal"']);
    const five = sourceContextLines("5.1-readme-good-header", src);
    expect(five).toContain('README title: "Ibibio Tonal"');
    expect(five.length).toBeLessThanOrEqual(6);
  });
  it("language rows show each tag with langtags name/script/region", () => {
    expect(sourceContextLines("10.4-kps-unusual-tag-flagged", src)).toEqual([
      ".kps language ibb-Latn: Ibibio; default Latn, NG",
      ".kps language zzz: not in langtags",
    ]);
  });
  it("6.2 has a word count; 6.5 lists install/download sentences", () => {
    expect(sourceContextLines("6.2-readme-htm-short", src)[0]).toBe(
      "readme.htm: 3 words",
    );
    const t = sourceContextLines("6.5-welcome-htm-no-install-instructions", src);
    expect(t[0]).toMatch(/To install, download the package/);
  });
  it("3.2 excerpt and history years", () => {
    expect(sourceContextLines("3.2-history-header-sensible", src)[0]).toMatch(
      /^HISTORY.md excerpt: "Title/,
    );
    expect(src.historyYears).toEqual({ earliest: 2015, latest: 2026 });
  });
  it("every cited context line has CriterionRow's code-block shape", () => {
    const cited = [
      ...sourceContextLines("5.1-readme-good-header", src),
      ...sourceContextLines("6.2-readme-htm-short", src),
      ...sourceContextLines("6.5-welcome-htm-no-install-instructions", src),
      ...sourceContextLines("3.2-history-header-sensible", src),
      ...copyrightContextLines("4.3-", "Copyright (C) 2015 Holder", src),
    ].filter((l) => l.includes(': "'));
    expect(cited.length).toBeGreaterThanOrEqual(6);
    for (const l of cited) expect(splitCitation(l), l).not.toBeNull();
    expect(
      splitCitation('.kps <Info><Author>: "Jo Author" (https://example.org)'),
    ).toEqual({ label: ".kps <Info><Author>", text: "Jo Author", suffix: "(https://example.org)" });
    expect(splitCitation(".kps <Info><WebSite>: (none)")).toBeNull();
  });
});

describe("scope note", () => {
  const rc: ReviewContext = {
    repoPath: "release/i/x",
    isPr: true,
    treePaths: ["release/i/x/README.md"],
  };
  const build = (isUpgradePr: boolean) =>
    buildReviewerSource({
      vfs: createVirtualFS([]),
      kpsText: undefined,
      kpsLanguages: [],
      keyboardIR: undefined,
      reviewContext: rc,
      isUpgradePr,
    });
  const src = build(true);
  it("maps sections to files and only notes unchanged ones", () => {
    expect(scopeNote("6.4", src)).toBe("Source file unchanged by this PR.");
    expect(scopeNote("10.3", src)).toBe("Source file unchanged by this PR.");
    expect(scopeNote("7.7", src)).toBe("Source file unchanged by this PR.");
    expect(scopeNote("5.1", src)).toBeNull();
    expect(scopeNote("12.1", src)).toBeNull();
  });
  it("is absent for a new keyboard", () => {
    expect(scopeNote("6.4", build(false))).toBeNull();
  });
  it("appears on the row evidence, status unchanged", () => {
    const r = rowOf("6.4-", makeInput({ reviewerSource: src }));
    expect(r.status).toBe("needs-author");
    expect(r.evidence().lines).toContain("Source file unchanged by this PR.");
  });
});

describe("judgeForeignKeyboard end to end", () => {
  it("stamps prDelta on real findings and builds side-by-side lines", async () => {
    const kmn = [
      "store(&VERSION) '10.0'",
      "store(&NAME) 'Ibibio Tonal'",
      "store(&KEYBOARDVERSION) '1.0'",
      "store(&COPYRIGHT) 'Copyright (C) 2024 Fixture Holder'",
      "store(&TARGETS) 'windows'",
      "begin Unicode > use(main)",
      "group(main) using keys",
      "+ [K_A] > 'a'",
      "",
    ].join("\n");
    const kps =
      '<Package><Info><Name URL="">Ibibio Tonal</Name><Author URL="">Jo</Author></Info><Keyboards><Keyboard><Languages><Language ID="ibb">Ibibio</Language></Languages></Keyboard></Keyboards></Package>';
    const vfs = createVirtualFS([
      entry(`source/${ID}.kmn`, kmn),
      entry(`source/${ID}.kps`, kps),
      entry("README.md", "# Ibibio Tonal\n"),
      entry("LICENSE.md", "Copyright 2024 someone\n"),
    ]);
    const rc: ReviewContext = {
      repoPath: `release/i/${ID}`,
      isPr: true,
      treePaths: [`release/i/${ID}/README.md`],
      idConflictAtBase: { baseSha: "abc", existingTiers: ["release"] },
    };
    const result = await judgeForeignKeyboard(vfs, ID, ID, { reviewContext: rc });
    const syntax = result.rows.find((r) => r.criterion.id.startsWith("4.5b"))!;
    expect(syntax.status).toBe("not-met");
    expect(syntax.evidence().lines).toContain(
      "Already present before this PR (file unchanged by this PR)",
    );
    const row = (prefix: string) =>
      result.rows.find((r) => r.criterion.id.startsWith(prefix))!;
    // ibb is a natural language langtags records, and already minimal.
    expect(row("10.3-").status).toBe("met");
    expect(row("10.3-").evidence().lines).toContain("ibb (ibb-Latn-NG)");
    expect(row("10.4-").status).toBe("not-applicable");
    expect(row("10.5-").status).toBe("not-applicable");
    // One produced character is too little to judge the script from.
    expect(row("12.1-").status).toBe("needs-author");
    expect(row("12.1-").evidence().lines.join("\n")).toMatch(/\.kps language ibb/);
    expect(row("12.5-").status).toBe("needs-author");
    expect(row("10.10-").evidence().lines).toContain(
      "Source file unchanged by this PR.",
    );
    // No comment counts were read: 17.1 stays with a human.
    expect(row("17.1-").status).toBe("needs-human");
  });

  it("17.1 follows the review context: off a PR, and a PR's comment counts", async () => {
    const vfs = createVirtualFS([
      entry(`source/${ID}.kmn`, "store(&NAME) 'X'\nbegin Unicode > use(main)\ngroup(main) using keys\n"),
    ]);
    const status171 = async (rc: ReviewContext) =>
      (await judgeForeignKeyboard(vfs, ID, ID, { reviewContext: rc })).rows.find(
        (r) => r.criterion.id === "17.1-build-trigger-pr-comments-resolved",
      )!.status;
    const pr = (diff: number, conversation: number, reviews: number): ReviewContext => ({
      repoPath: `release/i/${ID}`,
      isPr: true,
      prCommentCounts: { diff, conversation, reviews },
    });
    expect(await status171({ repoPath: `release/i/${ID}`, isPr: false })).toBe(
      "not-applicable",
    );
    expect(await status171(pr(0, 0, 0))).toBe("not-applicable");
    // A summary-only "Request changes" review leaves both comment counts at 0.
    expect(await status171(pr(0, 0, 1))).toBe("needs-human");
    expect(await status171(pr(2, 0, 1))).toBe("needs-human");
  });
});

describe("authored mode shows the same reviewer context (/review parity)", () => {
  // The authored assembly builds this from its own judged VFS — no PR,
  // so no scope note and no comment counts. The kps carries an Author
  // so the copyright rows have a second place to compare.
  const vfs = createVirtualFS([
    entry("README.md", "# Ibibio Tonal\n\nbody"),
    entry(
      "HISTORY.md",
      "Title\n=====\n\n1.1 (2026-01-02)\n----\n* x\n\n1.0 (2015)\n----\n* y\n",
    ),
    entry(
      "source/welcome.htm",
      "<html><style>x{}</style><p>Welcome. To install, download the package. Type letters.</p></html>",
    ),
    entry("source/readme.htm", "<p>one two three</p>"),
  ]);
  const kps =
    '<Package><Info><Name URL="">Ibibio Tonal</Name><Description URL="">Desc</Description><Author URL="https://example.org">Jo Author</Author></Info></Package>';
  const src = buildReviewerSource({
    vfs,
    kpsText: kps,
    kpsLanguages: ["ibb-Latn"],
    keyboardIR: undefined,
    reviewContext: undefined,
    isUpgradePr: false,
    langtags: (s) =>
      s === "ibb" ? { name: "Ibibio", script: "Latn", region: "NG" } : null,
  });
  const authored = (over: Partial<CriteriaInput> = {}) =>
    makeInput({ mode: "authored", reviewerSource: src, ...over });
  const lines = (id: string, input: CriteriaInput) =>
    rowOf(id, input).evidence().lines.join("\n");

  it("name, excerpt, and history rows show the same context, still Needs author", () => {
    const five = rowOf("5.1-", authored());
    expect(five.status).toBe("needs-author");
    expect(lines("5.1-", authored())).toContain('README title: "Ibibio Tonal"');
    expect(lines("5.1-", authored())).toContain('.kps <Info><Name>: "Ibibio Tonal"');
    expect(lines("6.2-", authored())).toContain("readme.htm: 3 words");
    expect(lines("6.5-", authored())).toMatch(/To install, download the package/);
    expect(lines("3.2-", authored())).toMatch(/HISTORY.md excerpt: "Title/);
    // No PR here: no scope note on any of them.
    for (const id of ["5.1-", "6.2-", "6.5-", "3.2-"]) {
      expect(lines(id, authored())).not.toContain("Source file unchanged by this PR.");
    }
  });

  it("copyright rows show the LICENSE line beside the .kps author", () => {
    const verified = new Map([
      [
        "KM_LINT_COPYRIGHT_ABSENT",
        ["File: LICENSE.md", 'Found: "Copyright (C) 2015-2020 Fixture Holder"'],
      ],
    ]);
    const t = lines("4.3-", authored({ verifiedByCode: verified }));
    expect(t).toContain('LICENSE.md copyright: "Copyright (C) 2015-2020 Fixture Holder"');
    expect(t).toContain('.kps <Info><Author>: "Jo Author" (https://example.org)');
  });

  it("4.2 is Not applicable in authored mode too when LICENSE and HISTORY share one year", () => {
    const singleYear = buildReviewerSource({
      vfs: createVirtualFS([
        entry("HISTORY.md", "Title\n=====\n\n1.0 (2026)\n----\n* y\n"),
      ]),
      kpsText: undefined,
      kpsLanguages: [],
      keyboardIR: undefined,
      reviewContext: undefined,
      isUpgradePr: false,
    });
    expect(singleYear.historyYears).toEqual({ earliest: 2026, latest: 2026 });
    const verified = new Map([
      ["KM_LINT_COPYRIGHT_ABSENT", ['Found: "Copyright © 2026 GemaGemia"']],
    ]);
    const input = makeInput({
      mode: "authored",
      verifiedByCode: verified,
      reviewerSource: singleYear,
    });
    expect(rowOf("4.2-", input).status).toBe("not-applicable");
    expect(lines("4.2-", input)).toContain(
      "The LICENSE.md year and every HISTORY.md entry fall in the same year",
    );
    // The multi-year history stays Needs author: the keyboard was
    // updated across years, so the range question still stands.
    expect(
      rowOf(
        "4.2-",
        makeInput({ mode: "authored", verifiedByCode: verified, reviewerSource: src }),
      ).status,
    ).toBe("needs-author");
  });

  it("language rows show the tag lines but stay with the author — no auto-verdict", () => {
    const row = rowOf("10.4-", authored());
    expect(row.status).toBe("needs-author");
    expect(lines("10.4-", authored())).toContain(
      ".kps language ibb-Latn: Ibibio; default Latn, NG",
    );
  });

  it("17.1 stays with a human: no PR counts exist in authored mode", () => {
    const row = rowOf("17.1-", authored());
    expect(row.status).toBe("needs-human");
    expect(lines("17.1-", authored())).not.toMatch(/comment\(s\) on the diff/);
  });
});

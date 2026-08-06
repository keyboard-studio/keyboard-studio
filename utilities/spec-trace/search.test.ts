import { describe, expect, it } from "vitest";
// search.js is CommonJS (plain-node tool, sibling of index.js); vitest resolves
// the interop the same way utilities/content-i18n-normalize does.
import {
  DEFAULT_BUDGET,
  buildCorpus,
  chunkFile,
  fold,
  renderJson,
  renderText,
  search,
  snippet,
  tokens,
} from "./search.js";

// ---------------------------------------------------------------------------
// Chunking
// ---------------------------------------------------------------------------

describe("chunkFile", () => {
  it("splits on ATX headings and records the 1-based line of each heading", () => {
    const md = ["# Title", "intro prose", "## Alpha", "alpha body", "## Beta", "beta body"].join("\n");
    const chunks = chunkFile("f.md", md);
    expect(chunks.map((c) => [c.crumb, c.line])).toEqual([
      ["Title", 1],
      ["Title > Alpha", 3],
      ["Title > Beta", 5],
    ]);
  });

  it("builds a breadcrumb from the heading stack and pops it on a shallower heading", () => {
    const md = ["# T", "## A", "### A1", "deep", "## B", "shallow again"].join("\n");
    const crumbs = chunkFile("f.md", md).map((c) => c.crumb);
    expect(crumbs).toContain("T > A > A1");
    // B is a sibling of A, so A1 must not survive in its breadcrumb.
    expect(crumbs).toContain("T > B");
    expect(crumbs.some((c) => c.includes("A1") && c.includes("B"))).toBe(false);
  });

  it("does not treat a '#' comment inside a fenced code block as a heading", () => {
    const md = ["## Real", "```bash", "# not a heading", "echo hi", "```", "tail prose"].join("\n");
    const chunks = chunkFile("f.md", md);
    expect(chunks).toHaveLength(1);
    expect(chunks[0].crumb).toBe("Real");
    expect(chunks[0].lines.join("\n")).toContain("# not a heading");
  });

  it("drops whitespace-only chunks so empty sections never occupy a hit slot", () => {
    const md = ["## Empty", "", "   ", "## Full", "content"].join("\n");
    expect(chunkFile("f.md", md).map((c) => c.crumb)).toEqual(["Full"]);
  });

  it("normalizes CRLF so line numbers match on Windows checkouts", () => {
    const chunks = chunkFile("f.md", "# T\r\nbody\r\n## Second\r\nmore");
    expect(chunks.map((c) => c.line)).toEqual([1, 3]);
    expect(chunks[0].lines[0]).toBe("# T");
  });
});

// ---------------------------------------------------------------------------
// Tokenizing
// ---------------------------------------------------------------------------

describe("fold", () => {
  it("unifies the verb forms a searcher expects to be interchangeable", () => {
    expect(fold("removing")).toBe(fold("remove"));
    expect(fold("removed")).toBe(fold("remove"));
    expect(fold("packages")).toBe(fold("package"));
  });

  it("folds regular and -ies plurals onto their singular", () => {
    expect(fold("dialogs")).toBe("dialog");
    expect(fold("policies")).toBe("policy");
    expect(fold("files")).toBe(fold("file"));
  });

  it("leaves a double-s word intact rather than stripping it to a non-word", () => {
    expect(fold("class")).toBe("class");
    expect(fold("classes")).toBe("class");
  });
});

describe("tokens", () => {
  it("drops stopwords and single characters", () => {
    expect(tokens("the a of validator")).toEqual(["validator"]);
  });

  it("keeps dotted and hyphenated identifiers whole and unstemmed", () => {
    // Not split into "spec" + "trace", and not folded to "spec-trac" by the
    // trailing-e rule -- an identifier is searched for verbatim.
    expect(tokens("spec-trace reads docs/spec-trace.json")).toContain("spec-trace");
    expect(tokens("see kmp.json now")).toContain("kmp.json");
    expect(fold("spec-trace")).toBe("spec-trace");
  });
});

// ---------------------------------------------------------------------------
// Ranking
// ---------------------------------------------------------------------------

const CORPUS = [
  { path: "a.md", content: "## Debounce cycle\nThe debounce cycle runs the TS check and the WASM oracle together." },
  { path: "b.md", content: "## Output paths\nSerialization mentions the debounce only in passing here." },
  { path: "c.md", content: "## Unrelated\nGlottolog relatedness and the language classification tree." },
];

describe("search ranking", () => {
  it("ranks a section whose heading carries the term above one that merely mentions it", () => {
    const result = search(buildCorpus(CORPUS), "debounce", { limit: 5 });
    expect(result.hits[0].path).toBe("a.md");
    expect(result.hits[1].path).toBe("b.md");
    expect(result.hits[0].score).toBeGreaterThan(result.hits[1].score);
  });

  it("excludes chunks with no query term rather than returning them at score 0", () => {
    const result = search(buildCorpus(CORPUS), "debounce", { limit: 5 });
    expect(result.hits.map((h) => h.path)).not.toContain("c.md");
    expect(result.matched).toBe(2);
  });

  it("honours --scope by restricting candidates to a path prefix", () => {
    const corpus = buildCorpus([
      { path: "specs/010-x/spec.md", content: "## S\ndebounce here" },
      { path: "specs/011-y/spec.md", content: "## S\ndebounce here too" },
    ]);
    const result = search(corpus, "debounce", { limit: 5, scope: "specs/011-y" });
    expect(result.hits.map((h) => h.path)).toEqual(["specs/011-y/spec.md"]);
  });

  it("matches a folded query term against the unfolded document form", () => {
    const corpus = buildCorpus([{ path: "a.md", content: "## Keys\nThe author is removing a key." }]);
    expect(search(corpus, "remove", { limit: 3 }).hits).toHaveLength(1);
  });

  it("orders deterministically when scores tie, so repeat runs are byte-identical", () => {
    const tied = [
      { path: "z.md", content: "## H\nalpha" },
      { path: "a.md", content: "## H\nalpha" },
    ];
    const first = search(buildCorpus(tied), "alpha", { limit: 5 });
    const second = search(buildCorpus(tied), "alpha", { limit: 5 });
    expect(first.hits.map((h) => h.path)).toEqual(["a.md", "z.md"]);
    expect(renderText(first).text).toBe(renderText(second).text);
  });
});

// ---------------------------------------------------------------------------
// Snippets
// ---------------------------------------------------------------------------

describe("snippet", () => {
  it("centres on the densest run of query terms instead of truncating from the top", () => {
    const filler = "padding words that carry no signal at all ".repeat(20);
    const chunk = buildCorpus([
      { path: "a.md", content: "## H\n" + filler + " the confirmation dialog is focus trapped " + filler },
    ]).chunks[0];
    const out = snippet(chunk, tokens("confirmation dialog"));
    expect(out).toContain("confirmation dialog");
    expect(out.startsWith("...")).toBe(true);
  });

  it("stays within the requested width plus the ellipsis markers", () => {
    const chunk = buildCorpus([{ path: "a.md", content: "## H\n" + "alpha beta gamma ".repeat(200) }]).chunks[0];
    const out = snippet(chunk, tokens("gamma"), 100);
    expect(out.replace(/^\.\.\.|\.\.\.$/g, "").length).toBeLessThanOrEqual(100);
  });
});

// ---------------------------------------------------------------------------
// Budget enforcement
//
// This is the regression guard for the failure mode that made context-mode's
// equivalent untrustworthy: a maxBytes parameter that is accepted and then
// ignored, so a hook advertising "<2KB" can emit ~196KB. The cap is the
// product here -- callers size their context around the number we print.
// ---------------------------------------------------------------------------

function hugeCorpus() {
  return buildCorpus(
    Array.from({ length: 12 }, (_, i) => ({
      path: `big-${i}.md`,
      content: `## Section ${i}\n` + "sandbox routing enforcement ".repeat(4000),
    })),
  );
}

describe("render budget", () => {
  it("never exceeds the byte cap even when every hit is enormous", () => {
    const result = search(hugeCorpus(), "sandbox routing", { limit: 12 });
    for (const budget of [256, 512, 2048, 8192]) {
      const out = renderText(result, { budget });
      expect(Buffer.byteLength(out.text, "utf8")).toBeLessThanOrEqual(budget);
    }
  });

  it("applies the same cap to --json output", () => {
    const result = search(hugeCorpus(), "sandbox routing", { limit: 12 });
    const out = renderJson(result, { budget: 1024 });
    expect(Buffer.byteLength(out.text, "utf8")).toBeLessThanOrEqual(1024);
    expect(() => JSON.parse(out.text)).not.toThrow();
  });

  it("drops trailing hits to fit and reports how many it dropped", () => {
    const result = search(hugeCorpus(), "sandbox routing", { limit: 12 });
    const out = renderText(result, { budget: 600 });
    expect(out.shown).toBeLessThan(result.hits.length);
    expect(out.dropped).toBe(result.hits.length - out.shown);
    expect(out.text).toContain("dropped for budget");
  });

  it("reports a byte count that matches the text it actually emitted", () => {
    const result = search(buildCorpus(CORPUS), "debounce", { limit: 5 });
    const out = renderText(result, { budget: DEFAULT_BUDGET });
    expect(out.bytes).toBe(Buffer.byteLength(out.text, "utf8"));
    expect(out.text).toContain(`${out.bytes} of ${DEFAULT_BUDGET} bytes`);
  });

  it("keeps every hit when the budget is ample", () => {
    const result = search(buildCorpus(CORPUS), "debounce", { limit: 5 });
    const out = renderText(result, { budget: DEFAULT_BUDGET });
    expect(out.shown).toBe(result.hits.length);
    expect(out.dropped).toBe(0);
  });
});

// ---------------------------------------------------------------------------
// Annotation passthrough
// ---------------------------------------------------------------------------

describe("annotate", () => {
  it("renders the drift status supplied by the caller beside the anchor", () => {
    const result = search(buildCorpus(CORPUS), "debounce", { limit: 1 });
    const out = renderText(result, { budget: DEFAULT_BUDGET, annotate: () => "partial, drifted" });
    expect(out.text).toContain("[partial, drifted]");
  });

  it("omits the status bracket on the anchor line when a hit maps to no tracked unit", () => {
    const result = search(buildCorpus(CORPUS), "debounce", { limit: 1 });
    const out = renderText(result, { budget: DEFAULT_BUDGET, annotate: () => null });
    const anchor = out.text.split("\n").find((l) => l.includes("a.md:1"))!;
    expect(anchor).toContain("score");
    expect(anchor).not.toContain("[");
  });
});

import { describe, it, expect } from "vitest";
import { tokenize } from "./tokenize.js";

const MINIMAL_KMN = `c File header comment
store(&NAME) 'Test'
store(&VERSION) '10.0'
begin Unicode > use(main)
group(main) using keys
+ [K_A] > U+0061
`;

describe("tokenize", () => {
  it("produces tokens in correct order for minimal kmn", () => {
    const tokens = tokenize(MINIMAL_KMN);
    const kinds = tokens.filter(t => t.kind !== "blank").map(t => t.kind);
    expect(kinds).toEqual([
      "comment",
      "store",
      "store",
      "begin",
      "group",
      "rule",
    ]);
  });

  it("captures comment text", () => {
    const tokens = tokenize("c this is a comment\n");
    const comment = tokens.find(t => t.kind === "comment");
    expect(comment?.text).toBe("this is a comment");
  });

  it("handles bare c comment (no text)", () => {
    const tokens = tokenize("c\n");
    const comment = tokens.find(t => t.kind === "comment");
    expect(comment?.kind).toBe("comment");
    expect(comment?.text).toBe("");
  });

  it("assigns correct line numbers", () => {
    const tokens = tokenize("c line1\nc line2\n");
    const comments = tokens.filter(t => t.kind === "comment");
    expect(comments[0]?.line).toBe(1);
    expect(comments[1]?.line).toBe(2);
  });

  it("joins continuation lines", () => {
    const tokens = tokenize("store(&VERSION) \\\n  '10.0'\n");
    const storeToken = tokens.find(t => t.kind === "store");
    expect(storeToken).toBeDefined();
    expect(storeToken?.text).toContain("10.0");
    // should be on line 1 (first physical line)
    expect(storeToken?.line).toBe(1);
  });

  it("joins a continuation line when the backslash carries trailing whitespace (#365)", () => {
    // A `\` followed by trailing spaces is a common editor artifact that real
    // sources ship — e.g. khmer_angkor line 116 ends `... K_QUOTE] \  `. The
    // continuation must still join; otherwise the orphaned next line tokenizes
    // as a standalone, malformed rule and parse() throws "Malformed rule".
    const tokens = tokenize("[K_A] \\  \n[K_B] > 'c'\n");
    const rules = tokens.filter(t => t.kind === "rule");
    expect(rules).toHaveLength(1);
    expect(rules[0]?.line).toBe(1);
    expect(rules[0]?.text).toBe("[K_A] [K_B] > 'c'");
  });

  it("joins a continuation across a tab-padded backslash (#365)", () => {
    // The same tolerance applies to a tab after the backslash.
    const tokens = tokenize("store(&VERSION) \\\t\n  '10.0'\n");
    const storeToken = tokens.find(t => t.kind === "store");
    expect(storeToken?.line).toBe(1);
    expect(storeToken?.text).toContain("10.0");
  });

  it("silent-corruption guard: continuation whose tail contains `>` must not produce a spurious rule (#412)", () => {
    // The silent-corruption risk: if `\` + trailing whitespace is NOT joined,
    // the orphaned second physical line `[K_B] > 'c'` tokenizes as a standalone
    // rule with NO context key — a bogus mapping that compiles silently under
    // some kmcmplib versions, corrupting the keyboard.  After the fix the two
    // physical lines join into ONE rule `[K_A] [K_B] > 'c'`.  This test
    // specifically uses a `>` on the continuation line to exercise that exact
    // corruption path (the basic #365 test does not).
    const src = "+ [K_A] \\   \n[K_B] > 'c'\n";
    const tokens = tokenize(src);
    const rules = tokens.filter(t => t.kind === "rule");
    // Exactly one rule token — if two are produced the fix has regressed.
    expect(rules).toHaveLength(1);
    // The joined text contains both sides of the split: the context vkey AND
    // the arrow with its output.  It must NOT start with `>` (which would mean
    // only the orphaned half was returned).
    const ruleText = rules[0]?.text ?? "";
    expect(ruleText).toContain("[K_A]");
    expect(ruleText).toContain("[K_B]");
    expect(ruleText).toContain(">");
    expect(ruleText).not.toMatch(/^\s*>/);
  });

  it("a comment ending in a backslash does NOT swallow the next line", () => {
    // kmcmplib ends a `c` comment at the newline regardless of a trailing `\`.
    // Before the fix the continuation join treated `c \` as a continuation and
    // merged the following `store(...)` into the comment, dropping the store
    // from the IR (real case: sil_euro_latin lines 120-121).
    const tokens = tokenize("c \\\nstore(specialO) 'abc'\n");
    const comment = tokens.find((t) => t.kind === "comment");
    const store = tokens.find((t) => t.kind === "store");
    // The comment stays on its own line and the store survives intact.
    expect(comment?.line).toBe(1);
    expect(store).toBeDefined();
    expect(store?.line).toBe(2);
    expect(store?.text).toContain("specialO");
  });

  it("target-selector $keymanweb: prefix is stripped and stored on the token (#412)", () => {
    // tokenize must parse the $keymanweb: prefix off the line, classify the
    // remainder correctly (here a rule), and record targetSelector='keymanweb'.
    const tokens = tokenize("$keymanweb: + [K_A] > U+0061\n");
    const rules = tokens.filter(t => t.kind === "rule");
    expect(rules).toHaveLength(1);
    expect(rules[0]?.targetSelector).toBe("keymanweb");
    // The text field must NOT contain the prefix — downstream parsers see clean text.
    expect(rules[0]?.text).not.toContain("$keymanweb:");
    expect(rules[0]?.text).toContain("[K_A]");
  });

  it("target-selector $keymanonly: prefix is stripped from a store line (#412)", () => {
    // Same as above for the desktop-only prefix applied to a store declaration.
    const tokens = tokenize("$keymanonly: store(euro) 'Cc'\n");
    const stores = tokens.filter(t => t.kind === "store");
    expect(stores).toHaveLength(1);
    expect(stores[0]?.targetSelector).toBe("keymanonly");
    expect(stores[0]?.text).not.toContain("$keymanonly:");
    expect(stores[0]?.text).toContain("store(euro)");
  });

  it("recognizes begin directive", () => {
    const tokens = tokenize("begin Unicode > use(main)\n");
    expect(tokens.find(t => t.kind === "begin")?.kind).toBe("begin");
  });

  it("recognizes group directive", () => {
    const tokens = tokenize("group(main) using keys\n");
    expect(tokens.find(t => t.kind === "group")?.kind).toBe("group");
  });

  it("recognizes match directive", () => {
    const tokens = tokenize("match > use(deadkeys)\n");
    expect(tokens.find(t => t.kind === "match")?.kind).toBe("match");
  });

  it("recognizes nomatch directive", () => {
    const tokens = tokenize("nomatch > use(fallback)\n");
    expect(tokens.find(t => t.kind === "nomatch")?.kind).toBe("nomatch");
  });

  it("strips BOM from input", () => {
    const withBom = "﻿store(&NAME) 'X'\n";
    const tokens = tokenize(withBom);
    expect(tokens.find(t => t.kind === "store")).toBeDefined();
    // No blank/garbage token at the front from the BOM
    expect(tokens[0]?.kind).toBe("store");
  });

  it("produces blank tokens for empty lines", () => {
    const tokens = tokenize("c comment\n\nc comment2\n");
    const blank = tokens.find(t => t.kind === "blank");
    expect(blank?.kind).toBe("blank");
  });

  it("tokenizes double-quote store value", () => {
    const tokens = tokenize('store(&Targets) "any"\n');
    const st = tokens.find(t => t.kind === "store");
    expect(st?.text).toContain('"any"');
  });

  it("a TRAILING comment ending in a backslash does NOT swallow the next line", () => {
    // A `c` comment runs to end-of-line, so a trailing `\` inside it is not a
    // continuation. COMMENT_LINE_RE only guards full-line comments; a trailing
    // comment (after a rule) previously joined the following line into the
    // comment and dropped it silently. Here the store on line 2 must survive.
    const tokens = tokenize("+ 'a' > 'b' c trailing note \\\nstore(kept) 'x'\n");
    const rules = tokens.filter((t) => t.kind === "rule");
    const store = tokens.find((t) => t.kind === "store");
    expect(rules).toHaveLength(1);
    expect(rules[0]?.line).toBe(1);
    expect(store).toBeDefined();
    expect(store?.line).toBe(2);
    expect(store?.text).toContain("kept");
  });

  it("a real continuation with NO comment still joins (comment-detector must not over-fire)", () => {
    // Guards against the trailing-comment fix wrongly classifying an ordinary
    // continued line as a comment. No standalone `c` token here → must join.
    const tokens = tokenize("store(&VERSION) \\\n  '10.0'\n");
    const stores = tokens.filter((t) => t.kind === "store");
    expect(stores).toHaveLength(1);
    expect(stores[0]?.text).toContain("10.0");
  });

  it("a backslash after a QUOTED 'c' still continues (quote-aware detection)", () => {
    // The `c` is inside a string literal, not a comment keyword, so the trailing
    // `\` is a genuine continuation and the two lines must join.
    const tokens = tokenize("+ 'x' > 'c' \\\n'y'\n");
    const rules = tokens.filter((t) => t.kind === "rule");
    expect(rules).toHaveLength(1);
    expect(rules[0]?.text).toContain("'c'");
    expect(rules[0]?.text).toContain("'y'");
  });

  it("a store line with a trailing comment ending in a backslash does NOT swallow the next line", () => {
    // Option A (restricting hasCommentToken to lines after `>`) would have
    // reintroduced #1146 for store/group/begin lines, which have no `>`. This
    // covers that exact case: a bare `c` comment trails a store() line.
    const tokens = tokenize("store(foo) 'bar' c note \\\nstore(kept) 'x'\n");
    const stores = tokens.filter((t) => t.kind === "store");
    expect(stores).toHaveLength(2);
    expect(stores[0]?.line).toBe(1);
    expect(stores[0]?.text).toContain("foo");
    expect(stores[1]?.line).toBe(2);
    expect(stores[1]?.text).toContain("kept");
  });

  it("a word merely starting with 'c' is not treated as a comment token", () => {
    // `context`-like tokens and store names beginning with c are not the bare
    // `c` comment keyword; the continuation must still join.
    const tokens = tokenize("store(cedilla) \\\n  'x'\n");
    const stores = tokens.filter((t) => t.kind === "store");
    expect(stores).toHaveLength(1);
    expect(stores[0]?.text).toContain("cedilla");
    expect(stores[0]?.text).toContain("'x'");
  });
});

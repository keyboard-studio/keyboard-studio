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
    expect(tokens.find(t => t.kind === "begin")).toBeDefined();
  });

  it("recognizes group directive", () => {
    const tokens = tokenize("group(main) using keys\n");
    expect(tokens.find(t => t.kind === "group")).toBeDefined();
  });

  it("recognizes match directive", () => {
    const tokens = tokenize("match > use(deadkeys)\n");
    expect(tokens.find(t => t.kind === "match")).toBeDefined();
  });

  it("recognizes nomatch directive", () => {
    const tokens = tokenize("nomatch > use(fallback)\n");
    expect(tokens.find(t => t.kind === "nomatch")).toBeDefined();
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
    expect(blank).toBeDefined();
  });

  it("tokenizes double-quote store value", () => {
    const tokens = tokenize('store(&Targets) "any"\n');
    const st = tokens.find(t => t.kind === "store");
    expect(st?.text).toContain('"any"');
  });
});

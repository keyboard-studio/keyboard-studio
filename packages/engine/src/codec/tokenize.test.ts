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

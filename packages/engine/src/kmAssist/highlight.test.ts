/**
 * kmAssist highlighter tests — spec 082 Track C read-only v1.
 */
import { describe, it, expect } from "vitest";
import { highlightRule, type TokenSpan } from "./highlight.js";

function kinds(spans: TokenSpan[]): string[] {
  return spans.filter((s) => s.kind !== "text").map((s) => s.kind);
}

describe("highlightRule", () => {
  it("spans tile the input exactly", () => {
    const inputs = [
      "+ [K_A] > U+0061",
      "any(diablock) + [RALT K_C] > context c do not type a mark here",
      "platform('touch') any(word) any(final) + [K_SPACE] > index(word,2) index(final,3) \" \" layer('shift')",
      "match > use(deadkeys)",
      "$keymanweb: + [K_A] > 'a'",
      "dk(003b) any(dkf003b) > index(dkt003b, 2)",
    ];
    for (const input of inputs) {
      const spans = highlightRule(input);
      expect(spans.map((s) => s.text).join("")).toBe(input);
      expect(spans[0]?.start).toBe(0);
      expect(spans[spans.length - 1]?.end).toBe(input.length);
      for (let i = 0; i < spans.length; i++) {
        const s = spans[i]!;
        expect(input.slice(s.start, s.end)).toBe(s.text);
        if (i > 0) expect(s.start).toBe(spans[i - 1]!.end);
      }
    }
  });

  it("classifies a plain rule: operator, key, operator, output", () => {
    const spans = highlightRule("+ [K_A] > U+0061");
    expect(kinds(spans)).toEqual(["operator", "key", "operator", "output"]);
  });

  it("classifies store refs, keys, and trailing comments", () => {
    const spans = highlightRule("any(diablock) + [RALT K_C] > context c guard comment");
    expect(kinds(spans)).toEqual([
      "store-ref",
      "operator",
      "key",
      "operator",
      "output",
      "comment",
    ]);
    const comment = spans.find((s) => s.kind === "comment");
    expect(comment?.text).toContain("guard comment");
  });

  it("does not treat a `c` inside quotes or key names as a comment", () => {
    const spans = highlightRule("+ [K_C] > 'a c b'");
    expect(spans.some((s) => s.kind === "comment")).toBe(false);
    expect(kinds(spans)).toEqual(["operator", "key", "operator", "output"]);
  });

  it("marks index()/outs() as store-refs on both sides", () => {
    const spans = highlightRule(
      "platform('touch') any(word) any(final) + [K_SPACE] > index(word,2) index(final,3) \" \" layer('shift')",
    );
    const nonText = spans.filter((s) => s.kind !== "text");
    expect(nonText.map((s) => s.kind)).toEqual([
      "store-ref", // any(word)
      "store-ref", // any(final)
      "operator", // +
      "key", // [K_SPACE]
      "operator", // >
      "store-ref", // index(word,2)
      "store-ref", // index(final,3)
      "output", // " "
      "output", // layer('shift')
    ]);
    const platform = spans.find((s) => s.text === "platform('touch')");
    expect(platform?.kind).toBe("text");
  });

  it("treats match/nomatch keywords as text and the arrow as operator", () => {
    const spans = highlightRule("match > use(deadkeys)");
    expect(kinds(spans)).toEqual(["operator", "output"]);
    const match = spans.find((s) => s.text === "match");
    expect(match?.kind).toBe("text");
  });

  it("handles a target-selector prefix as text", () => {
    const spans = highlightRule("$keymanweb: + [K_A] > 'a'");
    const prefix = spans.find((s) => s.text === "$keymanweb:");
    expect(prefix?.kind).toBe("text");
    expect(spans.map((s) => s.text).join("")).toBe("$keymanweb: + [K_A] > 'a'");
  });

  it("degrades gracefully on non-rule text", () => {
    const spans = highlightRule("store(word) 'abc'");
    expect(spans.map((s) => s.text).join("")).toBe("store(word) 'abc'");
    expect(spans.every((s) => s.kind === "text")).toBe(true);
  });
});

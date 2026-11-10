import { describe, it, expect } from "vitest";
import { lexWithComments } from "./comment-channel.js";

const at = (src: string, line: number) => lexWithComments(src).comments.get(line);

describe("comment channel", () => {
  it("records a comment-only line as kind line, body trimmed", () => {
    expect(at("c   hello world  \n", 1)).toEqual({ text: "hello world", line: 1, column: 1, kind: "line" });
  });

  it("gives a bare c an empty body", () => {
    expect(at("c\n", 1)).toMatchObject({ text: "", kind: "line" });
  });

  it("records a trailing comment after a rule", () => {
    expect(at("+ 'a' > 'b' c note\n", 1)).toEqual({ text: "note", line: 1, column: 13, kind: "trailing" });
  });

  it("does not take the key name [K_C] for a comment", () => {
    const { comments } = lexWithComments("+ [K_C] > 'x'\n+ [SHIFT K_C] > 'y' c real\n");
    expect(comments.get(1)).toBeUndefined();
    expect(comments.get(2)).toMatchObject({ text: "real", kind: "trailing" });
  });

  it("does not take a quoted \"c \" for a comment", () => {
    const { comments } = lexWithComments("+ 'a' > \"c \" 'c x'\n");
    expect(comments.size).toBe(0);
  });

  it("records a comment on the last physical line of a continued statement", () => {
    const { comments } = lexWithComments("+ 'a' > \\\n  'b' c tail\n");
    expect(comments.get(1)).toBeUndefined();
    expect(comments.get(2)).toMatchObject({ text: "tail", line: 2, kind: "trailing" });
  });

  it("keeps a backslash at the end of a comment inside the comment", () => {
    const { comments } = lexWithComments("c ends in \\\n+ 'a' > 'b'\n");
    expect(comments.get(1)).toMatchObject({ text: "ends in \\", kind: "line" });
    expect(comments.get(2)).toBeUndefined();
  });
});

import { describe, it, expect } from "vitest";
import { checkContextOrdering } from "./contextOrdering.js";

// lint.md check #11 — Compiler.cpp:1509-1520
// Context ordering rules:
//   1. nul must be first in context.
//   2. if()/platform()/baselayout() must come before other content tokens.
//   3. No virtual keys [K_X] in context.

describe("checkContextOrdering", () => {
  // Passing cases
  it("accepts a simple rule with no context ordering issues", () => {
    expect(checkContextOrdering('+ "a" > "b"')).toEqual([]);
  });

  it("accepts a rule where nul is the first (only) context token", () => {
    expect(checkContextOrdering('nul + "a" > "b"')).toEqual([]);
  });

  it("accepts a rule with an if() guard before content", () => {
    expect(checkContextOrdering('if(&platform = "hardware") + "a" > "b"')).toEqual([]);
  });

  it("accepts a rule where platform() guard precedes a content token", () => {
    expect(checkContextOrdering('if(&layer = "default") "x" + "a" > "b"')).toEqual([]);
  });

  it("accepts a rule starting with + (no LHS context)", () => {
    expect(checkContextOrdering('+ [K_A] > "a"')).toEqual([]);
  });

  it("accepts a line that is not a rule (no + separator)", () => {
    expect(checkContextOrdering('store(s) "hello"')).toEqual([]);
  });

  // Failing cases — Rule 3: virtual key in context
  it("rejects a virtual key [K_A] in the context", () => {
    const source = '[K_A] + "a" > "b"';
    const findings = checkContextOrdering(source);
    expect(findings.some((f) => f.code === "KM_ERROR_VIRTUAL_KEY_IN_CONTEXT")).toBe(true);
  });

  it("rejects [K_SHIFT K_A] in the context", () => {
    const source = '[K_SHIFT K_A] + "a" > "b"';
    const findings = checkContextOrdering(source);
    expect(findings.some((f) => f.code === "KM_ERROR_VIRTUAL_KEY_IN_CONTEXT")).toBe(true);
  });

  it("rejects a virtual key in the context when the + separator has no surrounding spaces", () => {
    // `[K_X]+[K_A]` — the spaceless `+` (after a `]` terminator) is still the
    // context/key separator, so the [K_X] in the context must be flagged.
    const source = "[K_X]+[K_A] > 'a'";
    const findings = checkContextOrdering(source);
    expect(findings.some((f) => f.code === "KM_ERROR_VIRTUAL_KEY_IN_CONTEXT")).toBe(true);
  });

  it("rejects a virtual key in the context when the + separator directly follows a ')' terminator", () => {
    // Context is `[K_A] dk(acute)` — the spaceless `+` after the `)` terminator
    // (closing dk()'s call) is still the context/key separator, so the [K_A]
    // vkey earlier in that same context must be flagged.
    const source = "[K_A] dk(acute)+[K_B] > 'a'";
    const findings = checkContextOrdering(source);
    expect(findings.some((f) => f.code === "KM_ERROR_VIRTUAL_KEY_IN_CONTEXT")).toBe(true);
  });

  it("rejects a virtual key in the context when the + separator directly follows a '\"' terminator", () => {
    // Context is `[K_A] "x"` — the spaceless `+` after the closing `"` is
    // still the context/key separator, so the [K_A] vkey earlier in that same
    // context must be flagged.
    const source = "[K_A] \"x\"+[K_B] > 'a'";
    const findings = checkContextOrdering(source);
    expect(findings.some((f) => f.code === "KM_ERROR_VIRTUAL_KEY_IN_CONTEXT")).toBe(true);
  });

  it("rejects a virtual key in the context when the + separator has a space only before it", () => {
    // `[K_A] +[K_B]` — space before `+`, none after, and the char before `+`
    // is a space (not a terminator). The separator must still be recognized so
    // the [K_A] vkey in the context is flagged.
    const source = "[K_A] +[K_B] > 'a'";
    const findings = checkContextOrdering(source);
    expect(findings.some((f) => f.code === "KM_ERROR_VIRTUAL_KEY_IN_CONTEXT")).toBe(true);
  });

  it("does not treat a U+hhhh literal's + as the context/key separator", () => {
    // Context is `U+0300 [K_A]` (a combining char followed by an illegal vkey);
    // the real separator is the spaced ` + ` before [K_B]. If the `+` inside
    // `U+0300` were mistaken for the separator, the context would collapse to a
    // bare `U` and the [K_A] vkey error would be missed. Asserting the error
    // still fires confirms the U+ literal's `+` was not split on.
    const source = "U+0300 [K_A] + [K_B] > 'a'";
    const findings = checkContextOrdering(source);
    expect(findings.some((f) => f.code === "KM_ERROR_VIRTUAL_KEY_IN_CONTEXT")).toBe(true);
  });

  it("checks a context whose spaceless + is preceded by a bareword (AC #1)", () => {
    // `[K_X]nul+[K_A]` — the separator `+` is spaceless AND immediately preceded
    // by a bareword (`l` of `nul`), not a terminator. Before the fix this fell
    // through to `return null`, silently skipping the context checks. The context
    // is `[K_X]nul`: the [K_X] vkey and the content-before-nul must both flag.
    // (`[K_A]` after `+` is the KEY, not context — the AC's literal `nul+[K_A]`
    // has a valid single-token `nul` context and would raise nothing; a vkey +
    // misordered nul in the context is needed to exercise both codes.)
    const source = "[K_X]nul+[K_A] > 'a'";
    const findings = checkContextOrdering(source);
    expect(findings.some((f) => f.code === "KM_ERROR_VIRTUAL_KEY_IN_CONTEXT")).toBe(true);
    expect(findings.some((f) => f.code === "KM_ERROR_NUL_NOT_FIRST")).toBe(true);
  });

  it("produces no findings for a non-rule line (no unquoted >) regardless of + spacing (AC #2)", () => {
    // `store(x) "a" +"b"` has a whitespace-preceded `+` but no `>` — it is not a
    // key rule, so contextOrdering must not scan it as one. Without the rule-line
    // (`>`) confirmation this was a latent false-positive class.
    const source = 'store(x) "a" +"b"';
    expect(checkContextOrdering(source)).toEqual([]);
  });

  // Failing cases — Rule 1: nul not first
  it("rejects nul when it is not the first context token", () => {
    const source = 'dk(acute) nul + "a" > "b"';
    const findings = checkContextOrdering(source);
    expect(findings.some((f) => f.code === "KM_ERROR_NUL_NOT_FIRST")).toBe(true);
  });

  // Failing cases — Rule 2: guard after content
  it("rejects an if() guard that appears after a dk() content token", () => {
    const source = 'dk(acute) if(&platform = "hardware") + "a" > "b"';
    const findings = checkContextOrdering(source);
    expect(findings.some((f) => f.code === "KM_ERROR_GUARD_AFTER_CONTENT")).toBe(true);
  });

  it("rejects a platform() guard after a quoted string content token", () => {
    const source = '"x" if(&layer = "default") + "a" > "b"';
    const findings = checkContextOrdering(source);
    expect(findings.some((f) => f.code === "KM_ERROR_GUARD_AFTER_CONTENT")).toBe(true);
  });

  // Regression — P0-1: quoted store value containing ')' must not produce false positive
  it("does not produce GUARD_AFTER_CONTENT when store value contains nested parens", () => {
    // if(s = "a(b)") — the ')' inside the quoted string is NOT the guard's closing paren.
    // A naive [^)]* regex would leave a stray ')' in ctxStripped and flag a false positive.
    const source = 'store(s) "a(b)"\nif(s = "a(b)") + "x" > "y"';
    const findings = checkContextOrdering(source);
    expect(findings.filter((f) => f.code === "KM_ERROR_GUARD_AFTER_CONTENT")).toHaveLength(0);
  });

  // Regression — P3-1: nul inside a guard argument must NOT produce NUL_NOT_FIRST
  it("does not produce NUL_NOT_FIRST when nul appears inside a guard argument", () => {
    // nul here is the string literal "nul" inside the if() argument, not a context token.
    const source = 'if(s = "nul") + "x" > "y"';
    const findings = checkContextOrdering(source);
    expect(findings.filter((f) => f.code === "KM_ERROR_NUL_NOT_FIRST")).toHaveLength(0);
  });

  // Location accuracy
  it("reports the correct line number for a virtual key error", () => {
    const source = '+ "a" > "b"\n[K_A] + "c" > "d"';
    const findings = checkContextOrdering(source);
    const vk = findings.find((f) => f.code === "KM_ERROR_VIRTUAL_KEY_IN_CONTEXT");
    expect(vk?.location?.line).toBe(2);
  });

  it("reports the exact column for a non-indented virtual key error (ctxStart=0 baseline)", () => {
    const source = '[K_A] + "a" > "b"';
    const findings = checkContextOrdering(source);
    // `[K_A]` begins at column 1; no leading whitespace, so ctxStart is 0.
    expect(findings[0]?.location?.column).toBe(1);
  });

  // #1223 — a context with leading whitespace must report the column of the
  // token in the ORIGINAL line, not in the trimmed context. extractContext
  // returns ctxStart = the trimmed leading-whitespace width, and every finding
  // adds it back into its column.
  it("re-offsets the column by the leading indent for a virtual key error", () => {
    const source = "    [K_A] + 'a' > 'b'"; // 4 leading spaces; `[` is at column 5
    const findings = checkContextOrdering(source);
    const vk = findings.find((f) => f.code === "KM_ERROR_VIRTUAL_KEY_IN_CONTEXT");
    expect(vk?.location?.column).toBe(5);
  });

  it("re-offsets the column by the leading indent for a nul-not-first error", () => {
    const source = '    dk(acute) nul + "a" > "b"'; // 4 leading spaces
    const findings = checkContextOrdering(source);
    const nul = findings.find((f) => f.code === "KM_ERROR_NUL_NOT_FIRST");
    // Non-indented equivalent reports column 11; +4 for the indent = 15.
    expect(nul?.location?.column).toBe(15);
  });

  it("re-offsets the column by the leading indent for a guard-after-content error", () => {
    const source = '    dk(acute) if(&platform = "hardware") + "a" > "b"'; // 4 leading spaces
    const findings = checkContextOrdering(source);
    const guard = findings.find((f) => f.code === "KM_ERROR_GUARD_AFTER_CONTENT");
    // Content token `dk(acute)` at column 1 non-indented; +4 for the indent = 5.
    expect(guard?.location?.column).toBe(5);
  });

  // Regression — a deadkey literally named "nul" used as a dk() argument is not
  // the standalone nul context token, so it must not trigger NUL_NOT_FIRST.
  it("does not produce NUL_NOT_FIRST for a deadkey named nul in dk(nul)", () => {
    const source = 'dk(nul) + "a" > "b"';
    const findings = checkContextOrdering(source);
    expect(findings.filter((f) => f.code === "KM_ERROR_NUL_NOT_FIRST")).toHaveLength(0);
  });

  // Regression — a guard clause is allowed before nul (nul is "first" among
  // non-guard tokens), so a guard immediately preceding nul must NOT trigger
  // NUL_NOT_FIRST. The nul-scan strips guards before blanking paren interiors.
  it("does not produce NUL_NOT_FIRST when a guard precedes nul", () => {
    const source = 'if(&platform = "hardware") nul + "a" > "b"';
    const findings = checkContextOrdering(source);
    expect(findings.filter((f) => f.code === "KM_ERROR_NUL_NOT_FIRST")).toHaveLength(0);
  });

  // AC#1 literal example: nul+[K_A] is a clean single-token `nul` context
  // (the [K_A] after `+` is the KEY, not context) — no findings.
  it("produces no findings for the AC#1 literal example nul+[K_A] > 'a'", () => {
    expect(checkContextOrdering("nul+[K_A] > 'a'")).toEqual([]);
  });

  // Comment-contamination regression: a trailing `c` comment containing a `>`
  // must not make a non-rule line look like a confirmed rule.
  it("does not treat a trailing comment's > as the rule separator", () => {
    const source = 'store(x) "a" +"b" c note > here';
    expect(checkContextOrdering(source)).toEqual([]);
  });

  // A trailing comment must not SUPPRESS a genuine finding either.
  it("still flags a virtual key in context when the rule has a trailing comment", () => {
    const source = '[K_A] + "a" > "b" c comment';
    const findings = checkContextOrdering(source);
    expect(findings.some((f) => f.code === "KM_ERROR_VIRTUAL_KEY_IN_CONTEXT")).toBe(true);
  });

  // Quote-preservation regression: contextOrdering strips only the trailing `c`
  // comment (stripComment), not quoted content, so a quoted content token after
  // a guard must still be visible to CONTENT_TOKEN_RE even with a trailing
  // comment on the same line.
  it("still flags guard-after-content when a quoted content token is followed by a trailing comment", () => {
    const source = '"x" if(&layer = "default") + "a" > "b" c trailing note';
    const findings = checkContextOrdering(source);
    expect(findings.some((f) => f.code === "KM_ERROR_GUARD_AFTER_CONTENT")).toBe(true);
  });

  // A standalone `c` word inside a quoted string is not a comment start — quote
  // state must still gate the comment-boundary test.
  it("does not treat a standalone c word inside a quoted string as a comment", () => {
    const source = '[K_A] + "a c b" > "z"';
    const findings = checkContextOrdering(source);
    expect(findings.some((f) => f.code === "KM_ERROR_VIRTUAL_KEY_IN_CONTEXT")).toBe(true);
  });
});

import { describe, it, expect } from "vitest";
import { runLexicalChecks, runReferenceChecks, runAllChecks } from "./index.js";

describe("runLexicalChecks", () => {
  it("returns an empty array for clean source", () => {
    const source = [
      'store(MyStore) "hello"',
      "group(main) using keys",
      '+ "a" > "b"',
    ].join("\n");
    expect(runLexicalChecks(source)).toEqual([]);
  });

  it("returns a flat array combining findings from all checks", () => {
    const source = [
      'store(MyStore) "hello"',
      'store(MyStore) "world"',     // KM_ERROR_DUPLICATE_STORE
      "group(main) using keys",
      "group(main)",                 // KM_ERROR_DUPLICATE_GROUP
      "store(&LANGUAGE) using keys", // KM_ERROR_DEPRECATED_STORE
      "group(bad name)",             // KM_ERROR_INVALID_IDENTIFIER
      "+ U+D800 > U+0020",           // KM_ERROR_INVALID_CODEPOINT (#7 is lexical)
    ].join("\n");

    const findings = runLexicalChecks(source);
    const codes = findings.map((f) => f.code);

    expect(codes).toContain("KM_ERROR_DUPLICATE_STORE");
    expect(codes).toContain("KM_ERROR_DUPLICATE_GROUP");
    expect(codes).toContain("KM_ERROR_DEPRECATED_STORE");
    expect(codes).toContain("KM_ERROR_INVALID_IDENTIFIER");
    expect(codes).toContain("KM_ERROR_INVALID_CODEPOINT");
  });

  it("returns a true flat array (no nested arrays)", () => {
    const source = 'store(MyStore) "a"\nstore(MyStore) "b"';
    const findings = runLexicalChecks(source);
    expect(Array.isArray(findings)).toBe(true);
    findings.forEach((f) => expect(Array.isArray(f)).toBe(false));
  });
});

describe("runReferenceChecks", () => {
  it("returns an empty array for clean source", () => {
    const source = [
      'store(MyStore) "hello"',
      "group(main) using keys",
      'if(MyStore = "hello") + "a" > "b"',
    ].join("\n");
    expect(runReferenceChecks(source)).toEqual([]);
  });

  it("returns findings from all 4 reference checks", () => {
    const source = [
      "group(main) using keys",
      "dk(bad name)",                          // KM_ERROR_INVALID_DEADKEY_NAME
      'if(undeclaredStore = "on") + "a" > "b"', // KM_ERROR_UNRESOLVED_IF_STORE
      '[K_A] + "a" > "b"',                    // KM_ERROR_VIRTUAL_KEY_IN_CONTEXT
      'index(ghostStore, 0)',                  // KM_WARN_INDEX_STORE_UNDECLARED + KM_WARN_INDEX_OFFSET_INVALID
    ].join("\n");

    const findings = runReferenceChecks(source);
    const codes = findings.map((f) => f.code);

    expect(codes).toContain("KM_ERROR_INVALID_DEADKEY_NAME");
    expect(codes).toContain("KM_ERROR_UNRESOLVED_IF_STORE");
    expect(codes).toContain("KM_ERROR_VIRTUAL_KEY_IN_CONTEXT");
    expect(codes).toContain("KM_WARN_INDEX_STORE_UNDECLARED");
  });

  it("returns a true flat array (no nested arrays)", () => {
    const source = "dk(bad name)";
    const findings = runReferenceChecks(source);
    expect(Array.isArray(findings)).toBe(true);
    findings.forEach((f) => expect(Array.isArray(f)).toBe(false));
  });
});

describe("runAllChecks", () => {
  it("returns an empty array for fully clean source", () => {
    const source = [
      'store(MyStore) "hello"',
      "group(main) using keys",
      '+ "a" > "b"',
    ].join("\n");
    expect(runAllChecks(source)).toEqual([]);
  });

  it("combines findings from both lexical and reference checks", () => {
    const source = [
      'store(MyStore) "a"',
      'store(MyStore) "b"',     // KM_ERROR_DUPLICATE_STORE (lexical)
      "dk(bad name)",            // KM_ERROR_INVALID_DEADKEY_NAME (reference)
    ].join("\n");

    const findings = runAllChecks(source);
    const codes = findings.map((f) => f.code);

    expect(codes).toContain("KM_ERROR_DUPLICATE_STORE");
    expect(codes).toContain("KM_ERROR_INVALID_DEADKEY_NAME");
  });

  it("returns a true flat array (no nested arrays)", () => {
    const source = 'store(MyStore) "a"\nstore(MyStore) "b"\ndk(bad name)';
    const findings = runAllChecks(source);
    expect(Array.isArray(findings)).toBe(true);
    findings.forEach((f) => expect(Array.isArray(f)).toBe(false));
  });

  it("result is the union of runLexicalChecks and runReferenceChecks", () => {
    const source = [
      'store(MyStore) "a"',
      'store(MyStore) "b"',
      "dk(bad name)",
    ].join("\n");

    const all = runAllChecks(source);
    const lexical = runLexicalChecks(source);
    const reference = runReferenceChecks(source);

    expect(all).toHaveLength(lexical.length + reference.length);
  });
});

// Issue #1221 — Layer A checks scan physical lines and never joined
// `\`-terminated continuation lines, so a rule split across a continuation
// was mis-analyzed (contextOrdering could skip it entirely). The entry
// points here now join once (../codec/continuation.ts) and remap findings
// back to physical positions; the checks themselves are unchanged.
describe("continuation joining (issue #1221)", () => {
  it("analyzes a context split across a continuation and reports the PHYSICAL line/column of the offending vkey", () => {
    // Physical line 1: "dk(acute) \" (no `+` yet — a naive per-line scan sees
    // no rule here at all). Physical line 2 continues the context with a
    // virtual key, which is illegal in a rule's context (LHS).
    const source = ['dk(acute) \\', '[K_X] + "a" > "b"'].join("\n");

    const findings = runReferenceChecks(source);
    const vk = findings.find((f) => f.code === "KM_ERROR_VIRTUAL_KEY_IN_CONTEXT");

    expect(vk).toBeDefined();
    // The [K_X] vkey physically lives on line 2, column 1 — not line 1
    // (where a naive unjoined scan would have missed the rule entirely, and
    // an unmapped joined scan would misreport it on line 1).
    expect(vk?.location?.line).toBe(2);
    expect(vk?.location?.column).toBe(1);
  });

  it("resolves an index() call whose closing paren is on a continuation line", () => {
    // Physical line 1 ends mid-call — `index(missing,` has no closing paren
    // or digit yet, so an unjoined scan's INDEX_RE cannot match this line at
    // all and the undeclared-store warning is silently lost.
    const source = ['any(s) + "x" > index(missing, \\', "1)"].join("\n");

    const findings = runReferenceChecks(source);
    const undeclared = findings.find(
      (f) => f.code === "KM_WARN_INDEX_STORE_UNDECLARED"
    );

    expect(undeclared).toBeDefined();
    expect(undeclared?.message).toContain("missing");
    // The index(...) call starts on physical line 1.
    expect(undeclared?.location?.line).toBe(1);
  });

  it("a trailing `c` comment ending in a backslash does NOT join the next rule (must not misattribute its finding)", () => {
    // Line 1 is a store declaration with a trailing comment whose last
    // character is a backslash — kmcmplib does NOT treat this as a
    // continuation (the comment already ended the line). Line 2 is an
    // unrelated rule with a vkey in its context.
    const source = [
      'store(s) "abc" c trailing note ends with backslash \\',
      '[K_X] + "a" > "b"',
    ].join("\n");

    const findings = runReferenceChecks(source);
    const vkFindings = findings.filter(
      (f) => f.code === "KM_ERROR_VIRTUAL_KEY_IN_CONTEXT"
    );

    // Exactly one finding, correctly attributed to physical line 2 — if the
    // comment guard were dropped, the two lines would wrongly join into one
    // logical line and this would misreport (or duplicate) on line 1.
    expect(vkFindings).toHaveLength(1);
    expect(vkFindings[0]?.location?.line).toBe(2);
    expect(vkFindings[0]?.location?.column).toBe(1);
  });

  it("remaps line AND column through a leadingTrim > 0 continuation segment", () => {
    // Physical line 1: "dk(acute) \" (continuation). Physical line 2 is
    // INDENTED by 3 spaces before the offending [K_X] vkey — the joined
    // text is identical to the unindented case (leading whitespace on a
    // continuation segment is trimmed before folding), so this only passes
    // if remapFindings adds `leadingTrim` back in, not just `logicalStart`.
    const source = ["dk(acute) \\", '   [K_X] + "a" > "b"'].join("\n");

    const findings = runReferenceChecks(source);
    const vk = findings.find((f) => f.code === "KM_ERROR_VIRTUAL_KEY_IN_CONTEXT");

    expect(vk).toBeDefined();
    expect(vk?.location?.line).toBe(2);
    // Column 4: the 3 leading spaces (trimmed out of the join) plus 1.
    expect(vk?.location?.column).toBe(4);
  });

  // km-qc P2 #4: remapFindings' no-column fallback (index.ts, the
  // `loc.column !== undefined ? loc.column - 1 : 0` branch) is not covered
  // by a dedicated test. Every current TS-portable check always sets
  // `location.column` (see the check files under ./checks/), so there is no
  // real finding that drives the column-less path, and remapFindings itself
  // is an internal (unexported) helper of this module — there is no public
  // seam to construct a minimal reproduction without adding test-only
  // surface area. Per the instructions accompanying this change, the branch
  // is documented in place instead (see the comment at the `offset =`
  // fallback in index.ts) and this test is intentionally skipped.
});

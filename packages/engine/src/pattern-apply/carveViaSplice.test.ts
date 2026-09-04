// Tests for carveViaSplice — the text-splice carve projection (refs #391).
//
// Built via real parse() calls on fixture .kmn strings (not hand-built IR):
// splice's whole premise depends on real sourceLine correspondence to the
// original text, which only parse() produces.

import { describe, it, expect } from "vitest";
import { parse } from "../codec/parse.js";
import { carveViaSplice } from "./carveViaSplice.js";

describe("carveViaSplice", () => {
  it("removes a single-line rule and preserves every surviving byte verbatim", () => {
    const kmn =
      `store(&VERSION) '10.0'\n` +
      `store(&NAME) 'Test'\n` +
      `\n` +
      `begin Unicode > use(main)\n` +
      `\n` +
      `group(main) using keys\n` +
      `\n` +
      `+ [K_A] > 'a'\n` +
      `+ [K_B] > 'b' c keep this comment\n` +
      `+ [K_C] > 'c'\n`;
    const { ir } = parse(kmn, "test");
    const ruleB = ir.groups[0]!.rules.find((r) => r.output.some((o) => o.kind === "char" && o.value === "b"))!;

    const result = carveViaSplice(kmn, ir, new Set([ruleB.nodeId]));
    expect(result.ok).toBe(true);
    if (!result.ok) return;

    expect(result.text).not.toContain("keep this comment");
    expect(result.text).not.toContain("[K_B]");
    // Every other original line survives byte-for-byte, in original order.
    expect(result.text).toContain("store(&VERSION) '10.0'");
    expect(result.text).toContain("+ [K_A] > 'a'");
    expect(result.text).toContain("+ [K_C] > 'c'");
    const lines = result.text.split("\n");
    expect(lines.indexOf("+ [K_A] > 'a'")).toBeLessThan(lines.indexOf("+ [K_C] > 'c'"));
  });

  it("removes ALL folded physical lines of a backslash-continuation rule, nothing more", () => {
    const kmn =
      `store(&VERSION) '10.0'\n` +
      `store(&NAME) 'Test'\n` +
      `\n` +
      `begin Unicode > use(main)\n` +
      `\n` +
      `group(main) using keys\n` +
      `\n` +
      `+ [K_A] > 'a'\n` +
      `+ [K_B] > \\\n` +
      `  'b'\n` +
      `+ [K_C] > 'c'\n`;
    const { ir } = parse(kmn, "test");
    const ruleB = ir.groups[0]!.rules.find((r) => r.output.some((o) => o.kind === "char" && o.value === "b"))!;

    const result = carveViaSplice(kmn, ir, new Set([ruleB.nodeId]));
    expect(result.ok).toBe(true);
    if (!result.ok) return;

    expect(result.text).not.toContain("[K_B]");
    expect(result.text).not.toContain("'b'");
    expect(result.text).toContain("+ [K_A] > 'a'");
    expect(result.text).toContain("+ [K_C] > 'c'");
  });

  it("hazard case: a store interleaved between a deleted group's rules survives untouched, in place", () => {
    const kmn =
      `store(&VERSION) '10.0'\n` +
      `store(&NAME) 'Test'\n` +
      `\n` +
      `begin Unicode > use(other)\n` +
      `\n` +
      `group(main) using keys\n` +
      `\n` +
      `+ [K_A] > 'a'\n` +
      `store(interloper) 'still here'\n` +
      `+ [K_B] > 'b'\n` +
      `\n` +
      `group(other) using keys\n` +
      `\n` +
      `+ [K_C] > 'c'\n`;
    const { ir } = parse(kmn, "test");
    const mainGroup = ir.groups.find((g) => g.name === "main")!;

    const result = carveViaSplice(kmn, ir, new Set([mainGroup.nodeId]));
    expect(result.ok).toBe(true);
    if (!result.ok) return;

    // The whole "main" group (header + both its rules) is gone...
    expect(result.text).not.toContain("group(main)");
    expect(result.text).not.toContain("[K_A]");
    expect(result.text).not.toContain("[K_B]");
    // ...but the interleaved store survives verbatim, since it was never part
    // of the deletion set — a blanket header-to-last-rule range would have
    // wrongly swallowed it.
    expect(result.text).toContain("store(interloper) 'still here'");
    // The other group (the entry group here) is untouched.
    expect(result.text).toContain("group(other)");
    expect(result.text).toContain("[K_C]");
  });

  it("a LEADING comment anchored to a deleted rule is deleted with it; a freestanding comment survives", () => {
    // `c leading note...` sits directly above the K_B rule, so the parser
    // anchors it to that rule (anchor: "leading"). Under the resolved comment
    // semantics it cascades out with its rule — leaving it standing would
    // misattribute the author's rationale to whatever line follows. The
    // comment before the group() header is genuinely freestanding (the parser
    // flushes pending comments at a group header) and must survive.
    const kmn =
      `store(&VERSION) '10.0'\n` +
      `store(&NAME) 'Test'\n` +
      `\n` +
      `begin Unicode > use(main)\n` +
      `\n` +
      `c freestanding note about the main group\n` +
      `group(main) using keys\n` +
      `\n` +
      `c leading note documenting K_B\n` +
      `+ [K_B] > 'b' c inline note\n` +
      `+ [K_A] > 'a'\n`;
    const { ir } = parse(kmn, "test");
    const ruleB = ir.groups[0]!.rules.find((r) => r.output.some((o) => o.kind === "char" && o.value === "b"))!;
    // Fixture sanity: the parser anchored the note to ruleB, as this test assumes.
    const leadingNote = ir.comments.find((c) => c.text.includes("leading note"));
    expect(leadingNote?.anchor).toBe("leading");
    expect(leadingNote?.anchorRef?.nodeId).toBe(ruleB.nodeId);

    const result = carveViaSplice(kmn, ir, new Set([ruleB.nodeId]));
    expect(result.ok).toBe(true);
    if (!result.ok) return;

    expect(result.text).not.toContain("leading note documenting K_B");
    expect(result.text).not.toContain("inline note");
    expect(result.text).not.toContain("[K_B]");
    expect(result.text).toContain("c freestanding note about the main group");
    expect(result.text).toContain("+ [K_A] > 'a'");
  });

  it("regression: deleting a group also splices out its group-owned RawKmnFragment, never stranding it under an earlier group", () => {
    // Without the group->fragments cascade the fragment's raw line survives
    // the deletion of its owning group's header, and kmcmplib would attribute
    // it to whichever group() header precedes it in the spliced file.
    const kmn =
      `store(&VERSION) '10.0'\n` +
      `store(&NAME) 'Test'\n` +
      `store(myFlag) 'x'\n` +
      `\n` +
      `begin Unicode > use(main)\n` +
      `\n` +
      `group(main) using keys\n` +
      `\n` +
      `+ [K_A] > 'a'\n` +
      `\n` +
      `group(extras) using keys\n` +
      `\n` +
      `+ [K_B] > save(myFlag, 1)\n` +
      `+ [K_C] > 'c'\n`;
    const { ir } = parse(kmn, "test");
    const extras = ir.groups.find((g) => g.name === "extras")!;
    const ownedFragment = ir.raw.find((f) => f.groupNodeId === extras.nodeId);
    // Fixture sanity: the opaque save() rule parsed as a fragment owned by "extras".
    expect(ownedFragment).toBeDefined();

    const result = carveViaSplice(kmn, ir, new Set([extras.nodeId]));
    expect(result.ok).toBe(true);
    if (!result.ok) return;

    // The whole extras group is gone — header, typed rule, AND the owned fragment.
    expect(result.text).not.toContain("group(extras)");
    expect(result.text).not.toContain("[K_C]");
    expect(result.text).not.toContain("save(myFlag");
    // The surviving group and the fragment-referenced store are untouched.
    expect(result.text).toContain("group(main)");
    expect(result.text).toContain("+ [K_A] > 'a'");
    expect(result.text).toContain("store(myFlag) 'x'");
  });

  it("resolves a multi-line RawKmnFragment's span correctly (sourceText has no embedded newlines)", () => {
    const kmn =
      `store(&VERSION) '10.0'\n` +
      `store(&NAME) 'Test'\n` +
      `store(myFlag) 'x'\n` +
      `\n` +
      `begin Unicode > use(main)\n` +
      `\n` +
      `group(main) using keys\n` +
      `\n` +
      `+ [K_A] > 'a'\n` +
      `+ [K_B] > save(myFlag, \\\n` +
      `  1)\n` +
      `+ [K_C] > 'c'\n`;
    const { ir } = parse(kmn, "test");
    expect(ir.raw.length).toBeGreaterThan(0);
    const fragment = ir.raw[0]!;

    const result = carveViaSplice(kmn, ir, new Set([fragment.nodeId]));
    expect(result.ok).toBe(true);
    if (!result.ok) return;

    expect(result.text).not.toContain("save(myFlag");
    expect(result.text).not.toContain("1)");
    expect(result.text).toContain("+ [K_A] > 'a'");
    expect(result.text).toContain("+ [K_C] > 'c'");
  });

  it("returns { ok: false } when a deleted node has no resolvable sourceLine (defensive)", () => {
    const kmn =
      `store(&VERSION) '10.0'\n` +
      `store(&NAME) 'Test'\n` +
      `\n` +
      `begin Unicode > use(main)\n` +
      `\n` +
      `group(main) using keys\n` +
      `\n` +
      `+ [K_A] > 'a'\n`;
    const { ir } = parse(kmn, "test");
    // A synthesized rule with no sourceLine, spliced into the parsed IR to
    // simulate a scaffolded/synthesized node reaching carve.
    const synthetic = {
      nodeId: "synthetic-rule",
      context: [{ kind: "vkey" as const, name: "K_Z", modifiers: [] }],
      output: [{ kind: "char" as const, value: "z" }],
    };
    const irWithSynthetic = {
      ...ir,
      groups: [{ ...ir.groups[0]!, rules: [...ir.groups[0]!.rules, synthetic] }],
    };

    const result = carveViaSplice(kmn, irWithSynthetic, new Set(["synthetic-rule"]));
    expect(result.ok).toBe(false);
  });

  it("deletes a header-only group (empty rules[]) by removing just its header line", () => {
    const kmn =
      `store(&VERSION) '10.0'
` +
      `store(&NAME) 'Test'
` +
      `
` +
      `begin Unicode > use(main)
` +
      `
` +
      `group(main) using keys
` +
      `
` +
      `+ [K_A] > 'a'
` +
      `
` +
      `group(placeholder) using keys
` +
      `
` +
      `group(other) using keys
` +
      `
` +
      `+ [K_C] > 'c'
`;
    const { ir } = parse(kmn, "test");
    const placeholder = ir.groups.find((g) => g.name === "placeholder")!;
    // Fixture sanity: the group really is header-only, so the cascade has no rules to add.
    expect(placeholder.rules).toHaveLength(0);

    const result = carveViaSplice(kmn, ir, new Set([placeholder.nodeId]));
    expect(result.ok).toBe(true);
    if (!result.ok) return;

    expect(result.text).not.toContain("group(placeholder)");
    // Exactly one physical line is gone; both neighbours survive verbatim, in order.
    expect(result.text.split("\n")).toHaveLength(kmn.split("\n").length - 1);
    const lines = result.text.split("\n");
    expect(lines.indexOf("+ [K_A] > 'a'")).toBeLessThan(lines.indexOf("group(other) using keys"));
    expect(result.text).toContain("+ [K_C] > 'c'");
  });

  it("a deletedNodeIds entry matching no IR node is a no-op: ok, text byte-identical", () => {
    const kmn =
      `store(&VERSION) '10.0'
` +
      `store(&NAME) 'Test'
` +
      `
` +
      `begin Unicode > use(main)
` +
      `
` +
      `group(main) using keys
` +
      `
` +
      `+ [K_A] > 'a'
`;
    const { ir } = parse(kmn, "test");

    // An id that exists nowhere in baseIr (stale overlay entry, or a node from
    // another keyboard) must not fail the splice — the cascade resolves it to
    // nothing, so there is no span to resolve and nothing to delete.
    const result = carveViaSplice(kmn, ir, new Set(["nonexistent-node"]));
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.text).toBe(kmn);
  });
});

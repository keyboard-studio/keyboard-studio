// Where the Code-tab entries of `kmn-edits` replay (spec 117 US8, research R15, owner ruling
// 2026-11-13): Layout-tab entries at step 2.2, BEFORE the generating steps (mark guards, context
// tolerance, caps handling), `code-apply` entries at step 2.9, AFTER them. So a generated rule is
// ordinary text by the time a code edit lands, and a code edit is applied after every Layout-tab
// edit whatever order they were recorded in.

import { describe, expect, it } from "vitest";
import { createVirtualFS } from "@keyboard-studio/contracts";
import type { KmnEdit, KmnEditsValue } from "@keyboard-studio/contracts";
import { diffIR, parseKmn } from "@keyboard-studio/engine";
import { projectWorkingCopyVfs, type KmnStage } from "./projectWorkingCopyVfs.ts";

const ID = "k";
const KMN =
  "store(&NAME) 'k'\nbegin Unicode > use(main)\n\ngroup(main) using keys\n" +
  "+ [NCAPS K_A] > 'a'\n+ [NCAPS SHIFT K_A] > 'A'\n+ [CAPS K_A] > 'A'\n+ [CAPS SHIFT K_A] > 'a'\n+ [K_B] > 'b'\n";

const layoutEntry = (seq: number, vkey: string, text: string, layer: Array<"SHIFT"> = []): KmnEdit => ({
  seq,
  at: 0,
  op: "set-key",
  vkey,
  layer,
  output: { kind: "text", text },
});

/** A code entry that turns the rule text `from` into `to` (built the way Apply builds it: a diff of two parses). */
function codeEntry(seq: number, from: string, to: string, source: string): KmnEdit {
  const changes = diffIR(parseKmn(source, ID).ir, parseKmn(source.replace(from, to), ID).ir);
  expect(changes.length).toBeGreaterThan(0);
  return { seq, at: 0, op: "code-apply", changes, overrides: [] };
}

function project(entries: KmnEdit[]) {
  const vfs = createVirtualFS();
  vfs.set(`source/${ID}.kmn`, KMN, false);
  const stages = new Map<KmnStage, string>();
  const seen: KmnStage[] = [];
  const result = projectWorkingCopyVfs({
    vfs,
    keyboardId: ID,
    startIr: parseKmn(KMN, ID).ir,
    deletedNodeIds: new Set(),
    assignments: [],
    getPattern: () => undefined,
    identity: null,
    capsHandling: { mode: "cased-keys" },
    kmnEdits: { entries } satisfies KmnEditsValue,
    kmnStageTap: (stage, text) => {
      seen.push(stage);
      stages.set(stage, text);
    },
  });
  return { text: vfs.get(`source/${ID}.kmn`)!.content as string, stages, seen, warnings: result.warnings };
}

// The caps step rewrites the four caps rules into `[K_A]` / `[SHIFT K_A]`, the shape a code edit sees.
const BUILT_A = "+ [K_A] > U+0061";

describe("projectWorkingCopyVfs: Layout-tab edits before the generating steps, Code-tab edits after", () => {
  it("generators see the layout edit; the code edit is applied after them", () => {
    const builtBefore = project([]).text;
    expect(builtBefore).toContain(BUILT_A);
    // Two layout entries make K_C a cased key (c / C); the caps step derives its set from the keyboard.
    const code = codeEntry(3, BUILT_A, "+ [K_A] > U+0078", builtBefore);
    const { stages, seen, text, warnings } = project([layoutEntry(1, "K_C", "c"), layoutEntry(2, "K_C", "C", ["SHIFT"]), code]);
    expect(warnings.filter((w) => /skipped/.test(w))).toEqual([]);

    // Step 2.2 holds the layout edit and not the code edit.
    expect(stages.get("kmn-edits")).toContain("K_C");
    expect(stages.get("kmn-edits")).not.toContain("U+0078");
    // The caps step (2.8) generated for the keyboard the layout edit made: the new key is cased.
    expect(stages.get("caps")).toMatch(/store\(&CasedKeys\)[^\n]*K_C/);
    // It still holds no code edit: that replays at 2.9.
    expect(stages.get("caps")).not.toContain("U+0078");
    expect(stages.get("code-edits")).toContain("U+0078");
    expect(text).toContain("U+0078");
    expect(text).toMatch(/store\(&CasedKeys\)[^\n]*K_C/);
    expect(seen.indexOf("caps")).toBeLessThan(seen.indexOf("code-edits"));
    expect(seen.indexOf("code-edits")).toBeLessThan(seen.indexOf("identity"));
  });

  it("with no entries neither replay point re-emits the .kmn: an unedited keyboard is byte-identical", () => {
    const { stages } = project([]);
    expect(stages.get("kmn-edits")).toBe(KMN);
    expect(stages.get("code-edits")).toBe(stages.get("caps"));
  });

  it("only a review-kept entry (no IR effect) re-emits at neither point", () => {
    const { stages } = project([{ seq: 1, at: 0, op: "review-kept", target: 9 }]);
    expect(stages.get("kmn-edits")).toBe(KMN);
    expect(stages.get("code-edits")).toBe(stages.get("caps"));
  });

  it("a layout edit and a code edit on different rules both land, in either recorded order", () => {
    const built = project([]).text;
    const code = codeEntry(1, BUILT_A, "+ [K_A] > U+0078", built);
    for (const entries of [
      [code, layoutEntry(2, "K_B", "ŋ")],
      [layoutEntry(1, "K_B", "ŋ"), { ...code, seq: 2 }],
    ] as KmnEdit[][]) {
      const { text, warnings } = project(entries);
      expect(warnings.filter((w) => /skipped/.test(w))).toEqual([]);
      expect(text).toContain("+ [K_A] > U+0078");
      expect(text).toContain("+ [K_B] > U+014B");
    }
  });

  it("a layout edit recorded AFTER a code edit to the same rule wins in the build, and the superseded code edit raises no flag", () => {
    const built = project([]).text;
    const code = codeEntry(1, "+ [K_B] > U+0062", "+ [K_B] > U+0079", built);
    const { text, warnings } = project([code, layoutEntry(2, "K_B", "ŋ")]);
    // The most recent edit on the key wins (ruling 10): the later layout edit supersedes the code
    // change, which is skipped, not reported as a miss.
    expect(text).toContain("+ [K_B] > U+014B");
    expect(text).not.toContain("U+0079");
    expect(warnings.filter((w) => /layout edit 1 skipped/.test(w))).toEqual([]);
  });

  it("a layout edit recorded BEFORE a code edit to the same rule: the code edit, made against the edited text, wins", () => {
    const layout = layoutEntry(1, "K_B", "ŋ");
    const shown = project([layout]).text;
    expect(shown).toContain("+ [K_B] > U+014B");
    const code = codeEntry(2, "+ [K_B] > U+014B", "+ [K_B] > U+0079", shown);
    const { text, warnings } = project([layout, code]);
    expect(warnings.filter((w) => /skipped/.test(w))).toEqual([]);
    expect(text).toContain("+ [K_B] > U+0079");
    expect(text).not.toContain("U+014B");
  });

  it("a code change whose generated rule is gone (generation changed under it) is reported, and the build is intact", () => {
    const built = project([]).text;
    const code = codeEntry(1, BUILT_A, "+ [K_A] > U+0078", built);
    // Dropping the caps decision means the caps step no longer rewrites K_A: the anchor is gone.
    const vfs = createVirtualFS();
    vfs.set(`source/${ID}.kmn`, KMN, false);
    const result = projectWorkingCopyVfs({
      vfs,
      keyboardId: ID,
      startIr: parseKmn(KMN, ID).ir,
      deletedNodeIds: new Set(),
      assignments: [],
      getPattern: () => undefined,
      identity: null,
      kmnEdits: { entries: [code] },
    });
    const text = vfs.get(`source/${ID}.kmn`)!.content as string;
    expect(result.warnings.filter((w) => /layout edit 1 skipped/.test(w))).toHaveLength(1);
    expect(text).toContain("[NCAPS K_A]");
    expect(text).toContain("+ [K_B] > U+0062");
  });
});

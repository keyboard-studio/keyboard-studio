// Spec 113 T097 (SC-010 engine half): on the code-edit set, diff -> apply reproduces the edited
// text, and the same changes replayed onto a re-parse of the starting text reproduce it too.
// A missing corpus is a failed precondition, never a skip (same rule as corpusSet.corpus.test.ts).
import { describe, expect, it } from "vitest";
import { KmnEditsValueSchema } from "@keyboard-studio/contracts";
import type { KmnEdit } from "@keyboard-studio/contracts";
import { emit } from "../codec/emit.js";
import { parse } from "../codec/parse.js";
import { RELEASE_ROOT, corpusAvailable, loadCorpusKmn } from "../layout-attribution/__fixtures__/corpusSet.js";
import { replayKmnEdits } from "../layout-ops/replayKmnEdits.js";
import { CODE_EDIT_SET } from "./__fixtures__/codeEditSet.js";
import { applyIRChanges } from "./applyIRChanges.js";
import { diffIR } from "./diffIR.js";

describe("kmn-diff corpus (spec 113 T097)", () => {
  it("the sibling ../keyboards corpus is present", () => {
    expect(corpusAvailable, `${RELEASE_ROOT} is missing: the code-edit corpus proves nothing without it`).toBe(true);
  });

  it("covers at least five keyboards and every edit kind", () => {
    expect(CODE_EDIT_SET.length).toBeGreaterThanOrEqual(5);
    const kinds = new Set(CODE_EDIT_SET.flatMap((e) => e.edits.map((c) => c.kind)));
    for (const k of ["change-rule", "add-rule", "delete-rule", "edit-store", "edit-header", "edit-opaque"]) {
      expect(kinds.has(k as never), k).toBe(true);
    }
  });

  for (const entry of CODE_EDIT_SET) {
    describe(entry.id, () => {
      const kmn = loadCorpusKmn(entry.id);
      for (const [i, edit] of entry.edits.entries()) {
        it(`${edit.kind} (#${i}): diff -> apply and replay reproduce the edited text`, () => {
          expect(kmn, `${entry.id} is not in the corpus checkout`).toBeDefined();
          const startText = emit(parse(kmn!, entry.id).ir);
          const editedText = edit.edit(startText);
          expect(editedText).not.toBe(startText);

          const a = parse(startText, entry.id).ir;
          const b = parse(editedText, entry.id).ir;
          const changes = diffIR(a, b);
          expect(changes.length).toBeGreaterThan(0);

          const applied = applyIRChanges(a, changes);
          expect(applied.misses).toEqual([]);
          expect(emit(applied.ir)).toBe(emit(b));

          const entryRecord: KmnEdit = { seq: 1, at: 0, op: "code-apply", changes, overrides: [] };
          // The entry survives the persistence boundary unchanged in effect.
          const persisted = KmnEditsValueSchema.parse(JSON.parse(JSON.stringify({ entries: [entryRecord] })));
          const reparsed = parse(startText, entry.id).ir;
          const replayed = replayKmnEdits(reparsed, persisted.entries);
          expect(replayed.misses).toEqual([]);
          expect(emit(replayed.ir)).toBe(emit(b));
        });
      }
    });
  }
});

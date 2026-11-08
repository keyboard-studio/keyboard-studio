// Three paths must agree (spec 113 T103, the R1 trap). For the SC-010 code-edit set, each edit is
// applied live (`commitKmnEdit` on the working IR); then `projectWorkingCopyVfs` replays the
// recorded entry at step 2.2 onto the IR it assembles from `startIr` plus overlays, which is a
// different IR from the live one. The projected .kmn must carry every edit with zero misses, and
// equal both the live result and the decision-rebuild result. A change that applies live but
// misses in the projection fails here.

import { beforeEach, describe, expect, it, vi } from "vitest";
import { createVirtualFS } from "@keyboard-studio/contracts";
import type { KmnEditsValue } from "@keyboard-studio/contracts";
import { diffIR, emitKmn, parseKmn } from "@keyboard-studio/engine";
import { RELEASE_ROOT, corpusAvailable, loadCorpusKmn } from "../../../engine/src/layout-attribution/__fixtures__/corpusSet.ts";
import { CODE_EDIT_SET } from "../../../engine/src/kmn-diff/__fixtures__/codeEditSet.ts";
import { rebuildWorkingCopyFromStores, resetRebuildTrail } from "../decisions/rebuildWorkingCopy.ts";
import { useDecisionStore } from "../stores/decisionStore.ts";
import { useWorkingCopyStore } from "../stores/workingCopyStore.ts";
import { projectWorkingCopyVfs } from "./projectWorkingCopyVfs.ts";

vi.mock("./serverDraftStore.ts", () => ({
  saveServerDraft: vi.fn(async () => true),
  saveServerDraftBeacon: vi.fn(),
  clearServerDraft: vi.fn(async () => true),
}));

beforeEach(() => {
  useDecisionStore.getState().reset();
  useWorkingCopyStore.setState({ ir: null, startIr: null, undoStack: [], desktopLocked: false });
  resetRebuildTrail();
});

describe("projectWorkingCopyVfs: Code-tab edits (spec 113 T103)", () => {
  it("the sibling ../keyboards corpus is present", () => {
    expect(corpusAvailable, `${RELEASE_ROOT} is missing: this test proves nothing without it`).toBe(true);
  });

  for (const entry of CODE_EDIT_SET) {
    describe(entry.id, () => {
      for (const [i, edit] of entry.edits.entries()) {
        it(`${edit.kind} (#${i}): live, projected, and rebuilt agree with zero misses`, () => {
          const kmn = loadCorpusKmn(entry.id);
          expect(kmn, `${entry.id} is not in the corpus checkout`).toBeDefined();
          const startText = emitKmn(parseKmn(kmn!, entry.id).ir);
          const startIr = parseKmn(startText, entry.id).ir;
          const editedIr = parseKmn(edit.edit(startText), entry.id).ir;
          const expected = emitKmn(editedIr);
          expect(expected).not.toBe(startText);

          // Live: the working IR changes only through commitKmnEdit.
          useWorkingCopyStore.setState({ ir: startIr, startIr, undoStack: [], desktopLocked: false });
          const committed = useWorkingCopyStore.getState().commitKmnEdit({
            op: "code-apply",
            changes: diffIR(startIr, editedIr),
            overrides: [],
          });
          expect(committed.ok).toBe(true);
          const live = emitKmn(useWorkingCopyStore.getState().ir!);
          expect(live).toBe(expected);

          // Projected: step 2.2 replays the recorded entries onto the projection's own IR.
          const kmnEdits = useDecisionStore.getState().decisions["kmn-edits"]?.value as KmnEditsValue;
          expect(kmnEdits.entries).toHaveLength(1);
          // Later projection steps normalise the keyboard (for instance &TARGETS is always 'any'),
          // so the reference is the projection of the already-edited text with no entries: the
          // replay must add exactly the edit and nothing else.
          const project = (text: string, edits?: KmnEditsValue) => {
            const vfs = createVirtualFS();
            vfs.set(`source/${entry.id}.kmn`, text, false);
            const result = projectWorkingCopyVfs({
              vfs,
              keyboardId: entry.id,
              startIr,
              deletedNodeIds: new Set(),
              assignments: [],
              getPattern: () => undefined,
              identity: null,
              ...(edits !== undefined ? { kmnEdits: edits } : {}),
            });
            const file = vfs.get(`source/${entry.id}.kmn`);
            const content = typeof file?.content === "string" ? file.content : "";
            return { kmn: emitKmn(parseKmn(content, entry.id).ir), warnings: result.warnings };
          };
          const projected = project(startText, kmnEdits);
          expect(projected.warnings.filter((w) => /layout edit \d+ skipped|projection skipped/.test(w))).toEqual([]);
          expect(projected.kmn).toBe(project(emitKmn(editedIr)).kmn);
          expect(projected.kmn).not.toBe(project(startText).kmn);

          // Rebuilt: the decision-rebuild path reaches the same keyboard.
          useWorkingCopyStore.setState({ ir: startIr });
          resetRebuildTrail();
          expect(rebuildWorkingCopyFromStores(["physical-layout"])).not.toBeNull();
          expect(emitKmn(useWorkingCopyStore.getState().ir!)).toBe(expected);
        });
      }
    });
  }
});

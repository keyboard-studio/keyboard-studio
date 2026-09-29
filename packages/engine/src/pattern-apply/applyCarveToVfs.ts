// Carve-layer projection: splice or filter+re-emit deleted IR nodes into VFS.
//
// This is the non-destructive carve projection for the live OSK pipeline.
// Given a base IR and a set of deleted node IDs, produces the carved `.kmn`
// text and writes it back into the VFS so the compile step sees it.
//
// Two projection paths (refs #391):
//   - TEXT-SPLICE (preferred): when `baseIr`'s node positions correspond
//     exactly to the VFS's current `.kmn` text (see eligibility gate below),
//     carveViaSplice deletes ONLY the exact source spans of the deleted nodes,
//     leaving every surviving byte of the original file untouched — comments,
//     store ordering, and other content emit()'s reconstruction is lossy on
//     (a supportability-scan audit found ~415 real corpus keyboards where the
//     filter+emit path below diverges from the original for surviving
//     content).
//   - FILTER + RE-EMIT (fallback): carveFilterIr produces a deletion-filtered
//     copy of the IR, and emit() regenerates `.kmn` text from it. This is a
//     reconstruction, not a byte-preserving edit — kept because splice's
//     precondition doesn't always hold: scaffolded/synthesized IR (and
//     IR already rewritten upstream — see the `irRewritten` gate below) has no
//     `sourceLine` correspondence to any real text to splice out of.
//
// Deletion semantics (spec §8/§12 "re-projected layers"; identical on both
// paths — resolved once by carveCascade.ts so they cannot drift apart):
//   - IRGroup nodes: the entire group (header + all rules) is dropped.
//   - IRRule nodes: the specific rule is dropped from its parent group.
//   - IRStore nodes: the store is dropped.
//   - RawKmnFragment nodes: the raw fragment is dropped.
//   - IRComment nodes: comments are not individually deleteable via carve.
//
// baseIr is never mutated.
//
// Safety gate: the set of deleted nodes must not remove the entry group — the
// first non-readonly group that emit() picks for `begin Unicode > use(...)`.
// Removing it would silently retarget the begin directive. When this condition
// fails, the carve step is skipped and a warning is returned; the VFS is left
// unchanged. This gate applies identically on both paths.
//
// Fragment-bearing keyboards (baseIr.raw.length > 0) are fully supported on
// the filter+re-emit path: emit() uses a position-faithful path that
// interleaves stores, rules, and fragments in their original source order and
// preserves ALL user stores (not just those referenced by typed rules).

import type { KeyboardIR, VirtualFS } from "@keyboard-studio/contracts";
import type { CarveDisposition } from "@keyboard-studio/contracts";
import { emit } from "../codec/emit.js";
import { reconcileSiblingAssetPaths } from "../compiler/reconcileSiblingAssetPaths.js";
import { carveFilterIr } from "./carveFilterIr.js";
import { carveViaSplice } from "./carveViaSplice.js";
import { deriveCarvedIr } from "./carvePipeline.js";

/**
 * The T015 carve pipeline inputs for {@link applyCarveToVfs}. When present,
 * the full composed pipeline (suppression → slot removals → whole-node
 * filter, see carvePipeline.ts) runs on the PRE-carve `baseIr` and the
 * result is serialized; text-splice is ineligible because the derived IR's
 * node positions no longer correspond to the VFS text.
 */
export interface CarvePipelineOpts {
  /** Glyph-level carve item ids (store-slot ids plus bare node ids). */
  deletedItemIds: ReadonlySet<string>;
  /** Per-combination dispositions for the suppression stage (FR-019). */
  dispositions: CarveDisposition[];
  /** A6 loud/soft for the suppression stage. Default false (soft). */
  loud?: boolean;
}

/**
 * Options bag for {@link applyCarveToVfs}.
 *
 * - `irRewritten` — set to `true` when `baseIr` has already been modified since
 *   it was parsed from the VFS's `.kmn` text: a preceding transform (e.g.
 *   `applyStoreSlotRemovals`) rewrote store contents, or the caller is the
 *   spec-014 mutate() seam handing in an already-filtered IR. One flag carries
 *   both consequences of that single fact, so they can never be set apart:
 *     1. the IR must be re-emitted even when `deletedNodeIds` is empty (there
 *        IS an edit to write into the VFS), and
 *     2. text-splice is never attempted (the IR's node positions no longer
 *        correspond to the VFS text, so splicing it would delete the wrong lines).
 *   The entry-group safety gate still applies.
 * - `carvePipeline` — T015: run the shared carve pipeline
 *   (suppression → slot removals → filter) on the PRE-carve `baseIr` instead
 *   of the plain deletion filter. The caller must pass the pre-removal IR
 *   and must NOT pre-apply slot removals (the T013 constraint: guard selector
 *   chars are read from the pre-removal stores). Implies `irRewritten`.
 */
export interface ApplyCarveToVfsOpts {
  irRewritten?: boolean;
  carvePipeline?: CarvePipelineOpts;
}

/**
 * Result of {@link applyCarveToVfs}.
 *
 * - `warnings` — non-fatal carve warnings (gates, emit failures, reconciliation).
 * - `derivedIr` — T015: the IR that was actually serialized to the VFS, when
 *   the call derived one (the `carvePipeline` path, or the whole-node filter
 *   fallback). Undefined for the text-splice path (no IR was derived) and for
 *   the no-op fast path.
 */
export interface ApplyCarveToVfsResult {
  warnings: string[];
  derivedIr?: KeyboardIR;
}

/**
 * Project carve deletions onto the VFS without mutating `baseIr`.
 *
 * Reads the .kmn path (`source/<keyboardId>.kmn`) from the VFS and replaces
 * it with the carved text, then returns any warnings produced. Prefers
 * text-splice (byte-preserving) over filter+emit (a reconstruction) whenever
 * splice's precondition holds — see the file header and the eligibility gate
 * below for exactly when each path is used.
 *
 * The projection is skipped (with a warning) only when the deletion set would
 * remove the entry group (the first non-readonly group), which would silently
 * retarget `begin Unicode > use(...)`. This gate applies before either path
 * runs.
 *
 * @param vfs            In-memory virtual filesystem. Written in-place.
 * @param keyboardId     Keyboard identifier (determines the .kmn VFS path).
 * @param baseIr         Source-of-truth IR (never mutated).
 * @param deletedNodeIds Set of nodeIds the author has marked for deletion.
 * @param opts           Optional settings; see {@link ApplyCarveToVfsOpts}.
 * @returns Warnings produced during projection (empty when all is well).
 */
export function applyCarveToVfs(
  vfs: VirtualFS,
  keyboardId: string,
  baseIr: KeyboardIR,
  deletedNodeIds: ReadonlySet<string>,
  opts?: ApplyCarveToVfsOpts,
): ApplyCarveToVfsResult {
  const warnings: string[] = [];
  const pipeline = opts?.carvePipeline;
  // The pipeline derives a rewritten IR (suppression always clones; slot
  // removals rewrite when slots are targeted), so it implies irRewritten:
  // the .kmn must be re-emitted when the pipeline has any edit, and
  // text-splice is ineligible.
  const pipelineEdit =
    pipeline !== undefined &&
    (pipeline.dispositions.length > 0 ||
      pipeline.deletedItemIds.size > 0 ||
      deletedNodeIds.size > 0);
  const irRewritten = opts?.irRewritten === true || pipelineEdit;

  if (deletedNodeIds.size === 0 && !irRewritten && !pipelineEdit) {
    // Nothing to filter — skip the re-emit. The VFS already holds the base .kmn
    // from the fetch step. This is the common path in the early-survey stages.
    return { warnings };
  }

  // Safety gate: entry-group deletion guard.
  // emit() picks the first non-readonly group as the `begin Unicode > use(...)`
  // target. Deleting it would silently retarget the begin directive.
  const entryGroup = baseIr.groups.find((g) => !g.readonly);
  if (entryGroup !== undefined && deletedNodeIds.has(entryGroup.nodeId)) {
    warnings.push(
      `[carve-project] carve re-emit skipped: deletion set includes the entry group ` +
        `"${entryGroup.name}" (nodeId: ${entryGroup.nodeId}); removing it would ` +
        "silently retarget begin Unicode > use(...). Remove the deletion or change " +
        "the entry group first.",
    );
    return { warnings };
  }

  const kmnPath = `source/${keyboardId}.kmn`;

  // Text-splice eligibility: baseIr's node positions correspond exactly to
  // the VFS's current .kmn text only when nothing has rewritten either since
  // the keyboard was parsed. `irRewritten` is the caller's declaration that
  // this precondition does NOT hold (see ApplyCarveToVfsOpts) — splicing the
  // ORIGINAL text against a rewritten IR's positions would delete the wrong
  // lines, so those calls take filter+re-emit.
  let emitted: string | undefined;
  let derivedIr: KeyboardIR | undefined;
  if (pipeline !== undefined && pipelineEdit) {
    // T015: the shared carve pipeline already derived the carved IR
    // (suppression → slot removals → whole-node filter) from the pre-carve
    // baseIr; serialize it directly. Text-splice is ineligible: the derived
    // IR's node positions do not correspond to the VFS text.
    const derived = deriveCarvedIr(baseIr, {
      deletedNodeIds,
      deletedItemIds: pipeline.deletedItemIds,
      dispositions: pipeline.dispositions,
      ...(pipeline.loud === true ? { loud: true as const } : {}),
    });
    warnings.push(...derived.warnings);
    derivedIr = derived.ir;
    try {
      emitted = emit(derived.ir);
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      warnings.push(`[carve-project] emit failed: ${msg}`);
      return { warnings };
    }
  } else if (!irRewritten && deletedNodeIds.size > 0) {
    const currentEntry = vfs.get(kmnPath);
    const currentText = typeof currentEntry?.content === "string" ? currentEntry.content : undefined;
    if (currentText !== undefined) {
      const spliced = carveViaSplice(currentText, baseIr, deletedNodeIds);
      if (spliced.ok) {
        emitted = spliced.text;
      } else {
        warnings.push(
          `[carve-project] splice unavailable (${spliced.reason}); falling back to filter+emit`,
        );
      }
    }
  }

  if (emitted === undefined) {
    // Fallback: build a new IR that excludes deleted nodes. Shallow copy at
    // each level so baseIr is never mutated (D3: immutable working-copy
    // layers). The deletion filter is the shared pure producer carveFilterIr,
    // so this VFS path and the spec-014 mutate() seam derive byte-identical
    // filtered IRs.
    const filteredIr: KeyboardIR = carveFilterIr(baseIr, deletedNodeIds);
    derivedIr = filteredIr;
    try {
      emitted = emit(filteredIr);
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      warnings.push(`[carve-project] emit failed: ${msg}`);
      return { warnings };
    }
  }

  // The re-emit serializes baseIr's header, whose sibling asset-path stores
  // may predate a scaffold()/id-rename of the VFS files (Track 1: baseIr is
  // captured at keyboard selection under the BASE id). Repoint any reference
  // whose file is missing to the keyboardId-named sibling that actually
  // exists — otherwise stripDanglingAssetStores removes the reference before
  // the preview compile and the OSK silently loses its visual keyboard.
  emitted = reconcileSiblingAssetPaths(emitted, vfs, keyboardId).kmn;

  vfs.set(kmnPath, emitted, false); // isBinary = false

  return { warnings, ...(derivedIr !== undefined ? { derivedIr } : {}) };
}

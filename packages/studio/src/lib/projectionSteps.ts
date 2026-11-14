// projectionSteps -- which projection steps run for which kind of Open run.
//
// On Open, `projectWorkingCopyVfs` runs for two reasons: to write ONE applied
// change into the files (an apply kind, `lib/openApply`), and to build the
// preview/download (`output`). They run different subsets of the same steps.
// That used to be a set of per-kind skip flags on the projection input
// (`applyOnly`, `skipMarkGuards`, `skipIntendedCheck`); it is this one table,
// so a retired overlay is one entry removed from one row, not a new flag.
//
// Copy never reads this table: with no `openMode` every step runs.
//
// The `deadkeys` step (the deadkey op log replayed onto the .kmn) is in NO Open
// row: the deadkey editor writes each edit into the files when it is made, so
// only Copy replays the log. `tolerance` is in no Open row either: the fix is
// written when applied (lib/contextToleranceCommit).
//
// A step listed for a kind may still have nothing to do (an empty overlay); a
// step left out never runs for that kind.

/** Projection steps, named for the numbered steps in `projectWorkingCopyVfs`. */
export type ProjectionStep =
  | "touchInject" // 0: the touch layout the author built
  | "css" // 0b, 4b: the OSK stylesheet
  | "authoredDocs" // 0b-ii: documentation overlays
  | "carve" // 1: carved nodes/items/chars out of the .kmn
  | "ruleAdditions" // 1.8: working-IR rule additions spliced into the .kmn
  | "carveKeycaps" // 1.5: carved characters blanked off the .kvks / touch keys
  | "touchDeletions" // 1.6: deleted touch methods
  | "keyEdits" // 1.7: key-edit overlay (touch layout and its rename rules)
  | "deadkeys" // 1.8: deadkey lifecycle overlay
  | "assignments" // 2: mechanism assignments
  | "layerPropagation" // 2.5: desktop layer combos onto the touch layout
  | "markGuards" // 2.6: the marks decision's guard rules
  | "tolerance" // 2.7: the accepted context-tolerance fix
  | "caps" // 2.8: the answered caps-handling decision
  | "identity" // 3: &NAME / version into the .kmn
  | "keycapLabels" // 3.5: keycap labels on the .kvks / touch layout
  | "descriptor" // 3.6: the package descriptor
  | "rename" // 4: keyboard id rename
  | "intendedCheck"; // apply runs only: the written text must match the IR the change meant

/** What a run is for: an apply kind (`OpenChange["kind"]`), the flush of held overlays, or the output. */
export type ProjectionKind =
  | "remove"
  | "reinsert"
  | "ir"
  | "assign"
  | "marks"
  | "model"
  | "files"
  | "flush"
  | "output";

const set = (...steps: ProjectionStep[]): ReadonlySet<ProjectionStep> => new Set(steps);

/** The carved items and the held rule additions: what a removal, an `ir` change or a flush projects. */
const CARRY = set("carve", "ruleAdditions", "carveKeycaps", "intendedCheck");

export const PROJECTION_STEPS: Readonly<Record<ProjectionKind, ReadonlySet<ProjectionStep>>> = {
  remove: CARRY,
  ir: CARRY,
  flush: CARRY,
  // The assignments' own rules and labels; the guards are a second run (`marks`),
  // and the caller checks the .kmn itself (assignments add lines the carve IR lacks).
  assign: set("carve", "ruleAdditions", "carveKeycaps", "assignments", "layerPropagation", "keycapLabels"),
  // The guard rules, which must see the rules an assignment just wrote.
  marks: set("carve", "ruleAdditions", "carveKeycaps", "markGuards", "intendedCheck"),
  // These kinds write precomputed text and do not project.
  reinsert: set(),
  model: set(),
  files: set(),
  // The preview and the download on Open. Decisions are a record only, so the
  // guards, the tolerance fix and the deadkey ops are never replayed here (they
  // are in the files; the deadkey op log stays only as the decision record). Still replayed until the phase that moves each one into
  // the files: rule additions, touch deletions and key edits (touch, phase 16),
  // carved items a non-live path still holds, assignments (empty on Open),
  // the stylesheet, documents and descriptor (phase 17).
  output: set(
    "touchInject",
    "css",
    "authoredDocs",
    "carve",
    "ruleAdditions",
    "carveKeycaps",
    "touchDeletions",
    "keyEdits",
    "assignments",
    "layerPropagation",
    "caps",
    "identity",
    "keycapLabels",
    "descriptor",
    "rename",
  ),
};

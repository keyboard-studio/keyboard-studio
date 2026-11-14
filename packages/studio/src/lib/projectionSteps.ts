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
// written when applied (lib/contextToleranceCommit). `codeEdits` (the Code-tab
// `code-apply` entries) is in NO Open row either: on Open the Code tab writes the
// file directly through the apply seam and records no `code-apply` entry.
// `layoutEdits` (the Layout-tab `kmn-edits` entries) is in NO Open row either: on
// Open a Layout-tab edit is written into the file through the apply seam when the
// author confirms it (lib/layoutOpenCommit), and its entry is only the record.
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
  | "layoutEdits" // 2.2: the Layout-tab entries of the `kmn-edits` log (spec 117)
  | "layerPropagation" // 2.5: desktop layer combos onto the touch layout
  | "markGuards" // 2.6: the marks decision's guard rules
  | "tolerance" // 2.7: the accepted context-tolerance fix
  | "caps" // 2.8: the answered caps-handling decision
  | "codeEdits" // 2.9: the Code-tab (`code-apply`) entries of the `kmn-edits` log (spec 117)
  | "identity" // 3: &NAME / version into the .kmn
  | "keycapLabels" // 3.5: keycap labels on the .kvks / touch layout
  | "descriptor" // 3.6: the package descriptor
  | "rename" // 4: keyboard id rename
  | "intendedCheck"; // apply runs only: the written text must match the IR the change meant

/** What a run is for: an apply kind (`OpenChange["kind"]`) or the output. */
export type ProjectionKind =
  | "remove"
  | "reinsert"
  | "ir"
  | "assign"
  | "marks"
  | "model"
  | "files"
  | "touch"
  | "output";

const set = (...steps: ProjectionStep[]): ReadonlySet<ProjectionStep> => new Set(steps);

/**
 * What an `ir` change projects: the carved items and the rules-step additions of the
 * change's own `nextIr` (the rules step writes them when applied). A removal and an
 * assignment run carry no held additions: nothing is held on Open.
 */
const IR_CARRY = set("carve", "ruleAdditions", "carveKeycaps", "intendedCheck");

export const PROJECTION_STEPS: Readonly<Record<ProjectionKind, ReadonlySet<ProjectionStep>>> = {
  remove: set("carve", "carveKeycaps", "intendedCheck"),
  ir: IR_CARRY,
  // The assignments' own rules and labels; the guards are a second run (`marks`),
  // and the caller checks the .kmn itself (assignments add lines the carve IR lacks).
  assign: set("carve", "carveKeycaps", "assignments", "layerPropagation", "keycapLabels"),
  // The guard rules, which must see the rules an assignment just wrote.
  marks: set("carve", "ruleAdditions", "carveKeycaps", "markGuards", "intendedCheck"),
  // These kinds write precomputed text and do not project.
  reinsert: set(),
  model: set(),
  files: set(),
  touch: set(),
  // The preview and the download on Open (with or without a touch file: a keyboard with none ships without one unless the author created it, an applied change). Decisions
  // are a record only, so the guards, the tolerance fix, the deadkey ops, and (phase 16)
  // every touch edit are never replayed here: they are in the files. Gone with phase 16:
  // touch injection, touch deletions, key edits, desktop-to-touch layer propagation and
  // the rule-additions splice (the assign seam and the touch commits write them).
  // What remains, and why:
  //   carve, carveKeycaps  carved items a non-live path still holds (empty on live Open); T096
  //   assignments          empty on Open (assignments are written when applied); T096
  //   caps                 an answered caps decision, the one decision-driven .kmn step; T096
  //   identity             version bump (FR-048)
  //   rename               keyboard id rename (inert on Open: the id is fixed)
  //   keycapLabels         labels for assignments (empty on Open); T091
  //   css, authoredDocs    documents and stylesheet overlays; T089, T089a
  //   descriptor           the language list into the package descriptor; T090
  output: set(
    "css",
    "authoredDocs",
    "carve",
    "carveKeycaps",
    "assignments",
    "caps",
    "identity",
    "keycapLabels",
    "descriptor",
    "rename",
  ),
};

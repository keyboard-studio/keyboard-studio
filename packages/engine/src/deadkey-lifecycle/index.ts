// deadkey-lifecycle barrel export — spec 083 (issue #1849), Phase 2.

export {
  defineDeadkey,
  renameDeadkey,
  deleteDeadkey,
  retargetDeadkey,
} from "./mutations.js";
export type {
  DeadkeyConflict,
  DeadkeyConflictKind,
  DeadkeyMutationResult,
  DefineDeadkeyOptions,
  DeleteDeadkeyOptions,
  RenameDeadkeyOptions,
  RetargetDeadkeyOptions,
} from "./types.js";

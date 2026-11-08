// The `kmn-edits` decision value (spec 113, contracts/layout-ops.md and
// contracts/code-edits.md).
//
// Every confirmed Layout-tab edit is one entry; entries replay in order and
// later entries win. A Code-tab Apply is one `CodeEdit` entry (a structural IR
// diff); `ReviewKept` records that the author kept an overridden change.
import type {
  IRComment,
  IRGroup,
  IRHeader,
  IRRule,
  IRStore,
  RawKmnFragment,
} from "./keyboard-ir";
import type { LayoutOperation } from "./layoutOps";

/** A node that lives inside a group or the global fragment list. */
export type IRNode = IRRule | IRComment | RawKmnFragment;

/** A store's content without its identity (node id) or source position. */
export type StoreValue = Omit<IRStore, "nodeId" | "sourceLine">;

/** The `begin` statement as the emitter writes it: encoding plus the entry group name. */
export interface IRBegin {
  encoding: "Unicode" | "ANSI";
  main: string;
}

/** The header fields a Code-tab edit can change (the rest are not part of the source text). */
export type IRHeaderPatch = Partial<
  Pick<IRHeader, "name" | "bcp47" | "copyright" | "version" | "targets" | "storeDirectives">
>;

/** Where a change lands, found by content, never by node id (FR-065). */
export interface ContentAnchor {
  /** The container whose emitted item sequence the anchor is searched in. */
  container: { kind: "group"; name: string; usingKeys: boolean } | { kind: "raw" };
  /** The item's canonical emitted text ("" for an insert at the start of the container). */
  text: string;
  /** The previous sibling's canonical text, when there is one. */
  prev?: string;
  /** The next sibling's canonical text, when there is one. */
  next?: string;
  /**
   * The key a single-key rule answers (ruling 10): set at Apply when an Assign-tab assignment
   * claims that key, so the change still finds its rule after the assignment rewrites the text.
   */
  keystroke?: { vkey: string; modifiers: string[] };
}

export type IRChange =
  /** Insert `node` after the item `at` ("" text = at the start). */
  | { change: "insert"; at: ContentAnchor; node: IRNode }
  /** Remove the item `at`; `old` makes the change invertible. */
  | { change: "remove"; at: ContentAnchor; old: IRNode }
  | { change: "replace"; at: ContentAnchor; old: IRNode; node: IRNode }
  /** Add or change a store by name; `previous` absent means it was added; `after` is the store it follows. */
  | { change: "set-store"; name: string; value: StoreValue; previous?: StoreValue; after?: string }
  | { change: "remove-store"; name: string; previous: StoreValue; after?: string }
  /** The group's items travel as separate insert / remove changes, so `group.rules` is empty here. */
  | { change: "add-group"; group: IRGroup; after?: string }
  | { change: "remove-group"; previous: IRGroup; after?: string }
  | { change: "set-begin"; begin: IRBegin; previous: IRBegin }
  | { change: "set-header"; header: IRHeaderPatch; previous: IRHeaderPatch };

/** FR-062: who produced a node the change overrides. */
export interface OwnerRef {
  /** Index into the entry's `changes`. */
  change: number;
  owner: "deadkeys" | "rules-step" | "layout-tab" | "code-tab" | "identity" | "assign-tab" | "another-step";
}

/** One Code-tab Apply. */
export interface CodeEdit {
  seq: number;
  at: number;
  op: "code-apply";
  changes: IRChange[];
  overrides: OwnerRef[];
}

/** The author kept the overridden change of entry `target` (a `CodeEdit` seq). */
export interface ReviewKept {
  seq: number;
  at: number;
  op: "review-kept";
  target: number;
}

export type KmnEdit = LayoutOperation | CodeEdit | ReviewKept;

export interface KmnEditsValue {
  entries: KmnEdit[];
}

/** The entries the Layout tab wrote (everything except Code-tab and review entries). */
export function isLayoutOperation(entry: KmnEdit): entry is LayoutOperation {
  return entry.op !== "code-apply" && entry.op !== "review-kept";
}

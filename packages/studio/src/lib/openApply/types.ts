// openApply types -- the change kinds, results and options shared by the apply
// modules (kept apart so the modules do not import each other in a cycle).

import type { IRPath, KeyboardIR, MechanismAssignment } from "@keyboard-studio/contracts";
import type { OpenRemovalEntry } from "../../stores/openRemovalStore.ts";

/** A change the author applies to the opened keyboard. */
export type OpenChange =
  | {
      kind: "remove";
      /** Rule node ids and store-slot ids (`<storeNodeId>#<index>`) to remove. */
      itemIds: string[];
      /** The characters being carved (the aggregated carve pass reads them). */
      chars: string[];
      /** Rules removed outright because their family is disabled. */
      disabledRuleIds?: string[];
      /** The disabled family, recorded on the removal so Enable can find it. */
      family?: { id: string; name: string; count: number };
    }
  | {
      /** Put removed applied removals back (newest first). */
      kind: "reinsert";
      entries: OpenRemovalEntry[];
    }
  | {
      /** A whole next IR; its rules-step additions are spliced in. */
      kind: "ir";
      nextIr: KeyboardIR;
    }
  | {
      /**
       * Mechanisms: assignments to add and the fingerprints of applied ones to
       * take back (`assignmentFingerprint`). The rules, stores, and keycap
       * labels (`.kvks`, touch layout) land in the same applied change.
       */
      kind: "assign";
      add: MechanismAssignment[];
      remove: string[];
    }
  | {
      /**
       * The recorded marks-treatment decision's guard rules, written into the
       * file (step 2.6). Reads the decision at apply time; idempotent, so
       * applying the same decision again changes nothing.
       */
      kind: "marks";
    }
  | {
      /**
       * A whole next IR written into the `.kmn` as a splice of every node that
       * differs from the file's own parse (stores, rules, groups, raw), not only
       * rules-step additions. The patch sinks use it for a step's `ir` write.
       * Needs consent when the splice cannot place the difference.
       */
      kind: "model";
      nextIr: KeyboardIR;
      /** The change's declared write paths: only these parts of `nextIr` are diffed against the file. */
      writes: readonly IRPath[];
      label: string;
    }
  | {
      /**
       * A precomputed multi-file write (`null` deletes a file). It skips the
       * projection; a `.kmn` among the files is re-parsed and must still be a
       * keyboard. Later phases' editors use it.
       */
      kind: "files";
      files: Record<string, string | null>;
      /** Plain label recorded on the undo step. */
      label: string;
    };

export type OpenApplyResult =
  | {
      status: "applied";
      changedPaths: string[];
      undoId?: string;
      /** A restore left these files as they are because they changed since the removal. */
      notRestored?: string[];
    }
  | { status: "needs-consent"; files: string[] }
  | { status: "unchanged" }
  /** The author was asked and said no; nothing was written. (Set by the host.) */
  | { status: "declined" }
  | {
      status: "failed";
      reason: string;
      /**
       * The change was refused for a reason the author can act on. `reason` is
       * English for logs only; the host shows the message for `code`, with `params`.
       */
      refused?: true;
      code?: RefusalCode;
      params?: Record<string, string>;
    };

/** Why an assignment change was refused; each has its own message id `open.apply.refused.<code>`. */
export type RefusalCode =
  | "labels-changed"
  | "rules-edited"
  | "claimed-restore"
  | "store-collision"
  | "own-rule"
  | "system-store";

export interface OpenApplyOptions {
  /** The author agreed to a full re-emit of a file that cannot be spliced. */
  consentedReemit?: boolean;
}


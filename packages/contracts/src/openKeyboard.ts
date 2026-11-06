// Open-an-existing-keyboard shared types (spec 111). Additive; no Pattern change.

/** Where an opened keyboard came from; pinned at open. */
export interface SourceRef {
  readonly owner: "keymanapp" | "keyboard-studio";
  readonly repo: "keyboards";
  /** Commit SHA pinned at open; printed in the PR body. */
  readonly commit: string;
  /** e.g. `release/sil/sil_cameroon_qwerty`. */
  readonly path: string;
  /** Set when the other repository's copy differed; drives the warning. */
  readonly alternative: {
    readonly owner: "keymanapp" | "keyboard-studio";
    readonly commit: string;
    readonly newer: boolean;
  } | null;
}

/** `"${lintRuleId}:${file}"`. */
export type FindingKey = `${string}:${string}`;

/** Author justification for a new failing finding; never a decision. */
export interface ReviewNote {
  readonly key: FindingKey;
  readonly criterionId: string;
  /** Non-empty after trim. */
  readonly text: string;
  /** ISO time. */
  readonly writtenAt: string;
}

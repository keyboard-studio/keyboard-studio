// Open-mode PR body blocks (spec 111, contracts/pr-body.md).
//
// Deliberately English and unlocalized: the audience is a reviewer reading
// github.com, the same precedent as the decision summary block. Pure text
// builders so the block wording is testable apart from the submit panel.

import type { ReviewNote } from "@keyboard-studio/contracts";

import type { CriteriaResult } from "./criteriaTypes.ts";
import { collectFailing, type OpenBaseline } from "./openRatchet.ts";

export interface SourceBlockInput {
  owner: string;
  repo: string;
  /** Short commit SHA; omitted from the line when unknown. */
  shortSha?: string;
  /** e.g. `release/sil/sil_cameroon_qwerty`. */
  path: string;
  fromVersion: string;
  toVersion: string;
  /** Short SHA of the curated copy replaced, when upstream was chosen over it. */
  replacesCuratedSha?: string | undefined;
  /** True when the curated copy is replaced but its SHA is unknown. */
  replacesCurated?: boolean;
}

export interface ReviewBlockEntry {
  criterionId: string;
  /** Short description from criteria.json. */
  description: string;
}

export interface ReviewBlockInput {
  /** New failures kept on a note: the criterion plus the author's note. */
  kept: ReadonlyArray<ReviewBlockEntry & { note: ReviewNote }>;
  /** Failing before the update and still failing. */
  inherited: readonly ReviewBlockEntry[];
}

/** Escape markdown so author text cannot break out of the quoted block. */
export function escapeMarkdown(text: string): string {
  return text
    .replace(/\r?\n+/g, " ")
    .replace(/([\\`*_{}[\]()#+!|<>~"-])/g, "\\$1")
    .trim();
}

export function buildSourceBlock(input: SourceBlockInput): string {
  const sha = input.shortSha !== undefined ? ` @ \`${input.shortSha}\`` : "";
  const lines = [
    "### Updated from",
    `- Repository: ${input.owner}/${input.repo}${sha}`,
    `- Path: \`${input.path}\``,
    `- Version: ${input.fromVersion} → ${input.toVersion}`,
  ];
  if (input.replacesCuratedSha !== undefined) {
    lines.push(
      `- Note: replaces the curated keyboard-studio/keyboards copy (\`${input.replacesCuratedSha}\`).`,
    );
  } else if (input.replacesCurated === true) {
    lines.push("- Note: replaces the curated keyboard-studio/keyboards copy.");
  }
  return lines.join("\n");
}

/** The review block, or null when there is nothing to say. */
export function buildReviewBlock(input: ReviewBlockInput): string | null {
  if (input.kept.length === 0 && input.inherited.length === 0) return null;
  const lines = ["### Criteria review"];
  if (input.kept.length > 0) {
    lines.push("**Kept despite a new failure** (author's reasons):");
    for (const k of input.kept) {
      lines.push(
        `- ${k.criterionId} ${k.description}: "${escapeMarkdown(k.note.text)}"`,
      );
    }
  }
  if (input.inherited.length > 0) {
    if (input.kept.length > 0) lines.push("");
    lines.push(
      "**Inherited** (failing before this update; not introduced here):",
    );
    for (const i of input.inherited) {
      lines.push(`- ${i.criterionId} ${i.description}`);
    }
  }
  return lines.join("\n");
}

/**
 * Split the current failures into the review block's two lists: new failures
 * the author kept on a note, and failures inherited from before the update.
 * A new failure with no note cannot appear (the submit gate blocks it).
 */
export function buildReviewInput(
  result: CriteriaResult,
  baseline: OpenBaseline,
  notes: readonly ReviewNote[],
): ReviewBlockInput {
  const rowById = new Map(result.rows.map((r) => [r.criterion.id, r.criterion]));
  const failing = collectFailing(result);
  const kept: ReviewBlockInput["kept"][number][] = [];
  const keptKeys = new Set<string>();
  for (const f of failing) {
    const note = notes.find((n) => n.key === f.key);
    const criterion = rowById.get(f.criterionId);
    if (note === undefined || criterion === undefined || keptKeys.has(f.key)) continue;
    keptKeys.add(f.key);
    kept.push({ criterionId: f.criterionId, description: criterion.description, note });
  }
  const inherited: ReviewBlockEntry[] = [];
  const seen = new Set<string>();
  for (const f of failing) {
    if (!baseline.failing.includes(f.key) || seen.has(f.criterionId)) continue;
    const criterion = rowById.get(f.criterionId);
    if (criterion === undefined) continue;
    seen.add(f.criterionId);
    inherited.push({ criterionId: f.criterionId, description: criterion.description });
  }
  return { kept, inherited };
}

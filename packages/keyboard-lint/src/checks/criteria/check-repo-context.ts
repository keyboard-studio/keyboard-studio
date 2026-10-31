// Checks 1.2b / 1.3b / 1.4b / 19.1b / 19.2b and KM_LINT_FILES_OUTSIDE_FOLDER
// (Group A2 Batch 5 + Group C).
//
// These are the /review-only checks: the Compare tab never sees the repo,
// only a folder, so only /review can run them. All are pure functions of
// the ReviewContext (repo path, tree/PR file list, PR body, HISTORY.md).
//
// Applicability: 19.1b/19.2b concern adapted keyboards; the resolver marks
// them Not applicable when the facts carry no adaptation signal (see
// applicability.ts). The other four always apply when reviewContext is
// present — its absence is the assembly's contextMissing, never a verdict.

import type { ReviewContext } from "@keyboard-studio/contracts";
import {
  checkFailed,
  checkPassed,
  criteriaFinding,
  mergeResults,
  type CheckResult,
} from "./_shared.js";

export interface RepoContextFacts {
  keyboardId: string;
  review: ReviewContext;
}

const SOURCE_EXTS = [
  ".kmn",
  ".kps",
  ".kpj",
  ".kvks",
  ".ico",
  ".keyman-touch-layout",
  ".php",
];

/** 1.2b — the keyboard folder is not under release/ or experimental/. */
export function checkRepoPlacementBad(
  facts: RepoContextFacts,
): CheckResult {
  const code = "KM_LINT_REPO_PLACEMENT_BAD";
  const p = facts.review.repoPath.toLowerCase();
  if (p.startsWith("release/") || p.startsWith("experimental/"))
    return checkPassed(code, [
      `Keyboard folder: ${facts.review.repoPath}`,
    ]);
  return checkFailed(code, [
    criteriaFinding({
      code: "KM_LINT_REPO_PLACEMENT_BAD",
      file: facts.review.repoPath,
      message: `The keyboard folder "${facts.review.repoPath}" is not under release/ or experimental/.`,
      hint: "Move the keyboard under release/<org>/<id> or experimental/<org>/<id>.",
    }),
  ]);
}

/**
 * 1.3b — the keyboard is not under an organizing subfolder
 * (release/<org>/<id> is three segments; fewer is not organized).
 */
export function checkRepoNoOrganizingFolder(
  facts: RepoContextFacts,
): CheckResult {
  const code = "KM_LINT_REPO_NO_ORGANIZING_FOLDER";
  const segments = facts.review.repoPath.split("/").filter((s) => s !== "");
  if (segments.length >= 3)
    return checkPassed(code, [
      `Organizing folder: ${segments.slice(0, -1).join("/")}`,
    ]);
  return checkFailed(code, [
    criteriaFinding({
      code: "KM_LINT_REPO_NO_ORGANIZING_FOLDER",
      file: facts.review.repoPath,
      message: `The keyboard folder "${facts.review.repoPath}" is not under an organizing subfolder.`,
      hint: "Place the keyboard under release/<org>/<id> (or experimental/<org>/<id>).",
    }),
  ]);
}

/**
 * 1.4b — source files are placed at the repository root. For published
 * keyboards the full tree is checked; for PRs the changed files are
 * checked (a PR that adds a root source is the violation).
 */
export function checkRepoRootSource(facts: RepoContextFacts): CheckResult {
  const code = "KM_LINT_REPO_ROOT_SOURCE";
  const tree = facts.review.treePaths ?? [];
  if (tree.length === 0)
    return checkPassed(code, ["No files in the tree to check."]);
  const hit = tree.find((p) => {
    const lower = p.toLowerCase();
    return (
      !lower.includes("/") && SOURCE_EXTS.some((e) => lower.endsWith(e))
    );
  });
  if (hit === undefined)
    return checkPassed(code, ["No source files at the repository root."]);
  return checkFailed(code, [
    criteriaFinding({
      code: "KM_LINT_REPO_ROOT_SOURCE",
      file: hit,
      message: `A source file is placed at the repository root (${hit}).`,
      hint: "Move the source file under the keyboard's folder — the repo root holds no sources.",
    }),
  ]);
}

/**
 * Group C (criterion 1.1) — files that belong to this keyboard but live
 * outside its folder. Detected by basename: a file elsewhere in the tree
 * whose name starts with the keyboard id is extraneous. A produced
 * keyboard is precertified clean by its generator manifest; a foreign
 * keyboard gets no such trust.
 */
export function checkFilesOutsideFolder(
  facts: RepoContextFacts,
): CheckResult {
  const code = "KM_LINT_FILES_OUTSIDE_FOLDER";
  const tree = facts.review.treePaths ?? [];
  if (tree.length === 0)
    return checkPassed(code, ["No files in the tree to check."]);
  const folder = facts.review.repoPath.toLowerCase();
  const id = facts.keyboardId.toLowerCase();
  const hits = tree.filter((p) => {
    const lower = p.toLowerCase();
    if (lower === folder || lower.startsWith(folder + "/")) return false;
    const base = lower.split("/").pop() ?? "";
    return base.startsWith(id);
  });
  if (hits.length === 0)
    return checkPassed(code, [
      `Checked ${tree.length} file(s): all under ${facts.review.repoPath}/.`,
    ]);
  return checkFailed(code, [
    criteriaFinding({
      code: "KM_LINT_FILES_OUTSIDE_FOLDER",
      file: hits[0]!,
      message: `Extraneous file(s) outside the keyboard folder: ${hits.slice(0, 3).join(", ")}${hits.length > 3 ? ` (+${hits.length - 3} more)` : ""}.`,
      hint: `Move these files under ${facts.review.repoPath}/ or remove them — a keyboard's files live in its folder.`,
    }),
  ]);
}

/**
 * 1.5 — the keyboard ID (folder name) is not already used in
 * experimental/, legacy/, or release/.
 *
 * Matthew's rule: check the commit BEFORE the PR (the base). The
 * review host records, per tier, whether the keyboard's folder
 * already exists at the base sha (ReviewContext.idConflictAtBase).
 * Three outcomes:
 *
 * - Upgrade: the folder exists at base in the PR's own tier and the
 *   PR modifies it — the normal "next version" case. Met.
 * - Deprecation/move: the folder exists at base in a DIFFERENT tier
 *   and the PR moves it (touches the old folder) or the PR body
 *   mentions deprecation — e.g. release/ → legacy/. Met, named.
 * - Conflict: the ID exists at base in a tier the PR does not touch
 *   and no deprecation is in play — a different keyboard with the
 *   same name. Finding.
 *
 * Non-PR targets are already published: ID uniqueness was established
 * at submission (met-moot). A failed base lookup is the assembly's
 * contextMissing, never a verdict here.
 */
export function checkKeyboardIdConflict(
  facts: RepoContextFacts,
): CheckResult {
  const code = "KM_LINT_DUPLICATE_KEYBOARD_ID";
  const { review, keyboardId } = facts;
  if (!review.isPr) {
    return checkPassed(code, [
      "Already published in the repo; ID uniqueness was established at submission.",
    ]);
  }
  const conflict = review.idConflictAtBase;
  if (conflict === undefined) {
    // Unreachable when the assembly is correct: a PR target without a
    // base lookup is named in contextMissing before checks run. Never
    // manufacture a verdict from a missing lookup.
    return checkPassed(code, []);
  }
  const sha7 = conflict.baseSha.slice(0, 7);
  const segments = review.repoPath.split("/").filter((s) => s !== "");
  const newTier = segments[0] ?? "";
  const org = segments[1] ?? "";
  const idLower = keyboardId.toLowerCase();
  const changed = (review.treePaths ?? []).map((p) => p.toLowerCase());
  const deprecatInBody =
    review.prBody !== undefined && /deprecat/i.test(review.prBody);
  const upgrades: string[] = [];
  const moves: string[] = [];
  const conflicts: string[] = [];
  for (const tier of conflict.existingTiers) {
    const folder = `${tier}/${org}/${idLower}/`.toLowerCase();
    const touched = changed.some((p) => p.startsWith(folder));
    if (tier.toLowerCase() === newTier.toLowerCase()) {
      // The reviewed folder itself exists at base: the PR modifies it.
      upgrades.push(`${tier}/${org}/${keyboardId}`);
    } else if (touched || deprecatInBody) {
      // Cross-tier move: the old folder is being retired (touched by
      // the PR) or the PR body declares a deprecation.
      const kind =
        newTier.toLowerCase() === "legacy" || deprecatInBody
          ? "Deprecation"
          : "Move";
      moves.push(
        `${kind}: ${keyboardId} moving from ${tier}/ to ${newTier}/ (base commit ${sha7}).`,
      );
    } else {
      conflicts.push(tier);
    }
  }
  if (conflicts.length > 0) {
    return checkFailed(code, [
      criteriaFinding({
        code: "KM_LINT_DUPLICATE_KEYBOARD_ID",
        file: review.repoPath,
        message:
          `The keyboard ID "${keyboardId}" is already used by a different keyboard ` +
          `in ${conflicts.join(", ")} (at the PR's base commit).` +
          (moves.length > 0 ? ` Also: ${moves.join(" ")}` : "") +
          (upgrades.length > 0
            ? ` Also an upgrade to ${upgrades.join(", ")}.`
            : ""),
        hint: "Choose a different keyboard ID, or update the existing keyboard instead of adding a new one with the same ID.",
      }),
    ]);
  }
  const verified: string[] = [];
  for (const u of upgrades) {
    verified.push(
      `Upgrade to existing ${u} (base commit ${sha7}).` +
        (deprecatInBody ? " PR body mentions deprecation." : ""),
    );
  }
  verified.push(...moves);
  if (verified.length === 0) {
    verified.push(
      `ID "${keyboardId}" not found in experimental/, legacy/, or release/ at base commit ${sha7}.`,
    );
  }
  return checkPassed(code, verified);
}

const ADAPTED_FROM = /adapted\s+from/i;
const SHA40 = /\b[0-9a-f]{40}\b/i;

/**
 * 19.1b — the PR's attribution block is incomplete. Only runs for PR
 * sources with an adaptation signal (applicability gates the rest):
 * the block must name the adapted-from path, the commit SHA, and the
 * round-trip status.
 */
export function checkPrAttributionBad(
  facts: RepoContextFacts,
): CheckResult {
  const code = "KM_LINT_PR_ATTRIBUTION_BAD";
  const body = facts.review.prBody;
  if (body === undefined)
    return checkPassed(code, ["No PR body to check."]);
  if (!ADAPTED_FROM.test(body))
    return checkPassed(code, ["No adaptation signal in the PR body."]);
  const missing: string[] = [];
  if (!/adapted\s+from\s+\S+/i.test(body)) missing.push("adapted-from path");
  if (!SHA40.test(body)) missing.push("commit SHA");
  if (!/round-trip/i.test(body)) missing.push("round-trip status");
  if (missing.length === 0) {
    const adaptedLine = body
      .split("\n")
      .find((l) => ADAPTED_FROM.test(l))
      ?.trim();
    return checkPassed(
      code,
      adaptedLine ? [`Attribution block present: "${adaptedLine}"`] : [],
    );
  }
  const adaptedLine = body
    .split("\n")
    .find((l) => ADAPTED_FROM.test(l))
    ?.trim();
  return checkFailed(code, [
    criteriaFinding({
      code: "KM_LINT_PR_ATTRIBUTION_BAD",
      file: "PR body",
      message:
        `The PR attribution block is incomplete — missing: ${missing.join(", ")}.` +
        (adaptedLine ? ` Found: "${adaptedLine}"` : ""),
      hint: "Complete the attribution block: adapted-from path, commit SHA, round-trip status, and the opaque feature inventory.",
    }),
  ]);
}

/**
 * 19.2b — HISTORY.md lacks a well-formed 'Adapted from <sourcePath>'
 * bullet. The resolver's applicability gate (isAdaptation) ensures this
 * only surfaces for adaptations; the check itself fires whenever the
 * bullet is absent or malformed. An absent HISTORY.md is the assembly's
 * contextMissing.
 */
export function checkHistoryAttributionBad(
  facts: RepoContextFacts,
): CheckResult {
  const code = "KM_LINT_HISTORY_ATTRIBUTION_BAD";
  const history = facts.review.historyMd;
  if (history === undefined)
    return checkPassed(code, [
      "No HISTORY.md to check (absence is 3.1b's check).",
    ]);
  const bullet = history
    .split("\n")
    .find((l) => /adapted\s+from\s+\S+/i.test(l))
    ?.trim();
  if (bullet !== undefined) return checkPassed(code, [`Found: "${bullet}"`]);
  return checkFailed(code, [
    criteriaFinding({
      code: "KM_LINT_HISTORY_ATTRIBUTION_BAD",
      file: "HISTORY.md",
      message: ADAPTED_FROM.test(history)
        ? "The HISTORY.md 'Adapted from' bullet names no source path."
        : "HISTORY.md has no 'Adapted from <sourcePath>' bullet.",
      hint: "Add an 'Adapted from <sourcePath>' bullet under the 1.0 HISTORY.md entry.",
    }),
  ]);
}

/** Run the repo-context checks (1.2b/1.3b/1.4b/1.5 + Group C). */
export function checkRepoContext(
  facts: RepoContextFacts,
): ReturnType<typeof mergeResults> {
  return mergeResults(
    checkRepoPlacementBad(facts),
    checkRepoNoOrganizingFolder(facts),
    checkRepoRootSource(facts),
    checkFilesOutsideFolder(facts),
    checkKeyboardIdConflict(facts),
  );
}

/** Run the PR/history attribution checks (19.1b/19.2b). */
export function checkAttribution(
  facts: RepoContextFacts,
): ReturnType<typeof mergeResults> {
  return mergeResults(
    checkPrAttributionBad(facts),
    checkHistoryAttributionBad(facts),
  );
}

/**
 * The Batch 5 + Group C codes, for the assembly's contextMissing when
 * no reviewContext is present. 19.1b/19.2b are NOT here — their
 * applicability is gated by the adaptation signal, not by input
 * presence. 1.5 (KM_LINT_DUPLICATE_KEYBOARD_ID) IS here: without a
 * reviewContext the base-commit lookup cannot run.
 */
export const REPO_CONTEXT_CODES = [
  "KM_LINT_REPO_PLACEMENT_BAD",
  "KM_LINT_REPO_NO_ORGANIZING_FOLDER",
  "KM_LINT_REPO_ROOT_SOURCE",
  "KM_LINT_FILES_OUTSIDE_FOLDER",
  "KM_LINT_DUPLICATE_KEYBOARD_ID",
] as const;

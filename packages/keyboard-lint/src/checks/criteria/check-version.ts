// Checks 2.3 / 2.4 / 2.5 — the shared &KEYBOARDVERSION validator
// (spec 084 Batch 1, triage: one validator, three criterion outcomes).
//
//   2.3 KM_LINT_VERSION_FORMAT       — dot-separated, entirely numeric
//   2.4 KM_LINT_VERSION_LEADING_ZERO — no component has a leading zero
//   2.5 KM_LINT_VERSION_V_PREFIX     — no `v` prefix, no non-numeric labels
//
// Source: IR header.version (the &KEYBOARDVERSION store as parsed from
// the judged .kmn). An absent/empty version yields no findings from any
// of the three: a missing version is judged by the version-match checks
// (3.6/7.1), and a format verdict on a value that is not there would be
// a guess. `v1.02` fails all three, each for its own stated reason.

import type { KeyboardIR, ReviewContext } from "@keyboard-studio/contracts";
import {
  checkFailed,
  checkPassed,
  type CheckResult,
  criteriaFinding,
  kmnPath,
} from "./_shared.js";

const NUMERIC = /^\d+$/;

function versionOf(ir: KeyboardIR): string {
  return ir.header.version.trim();
}

const NO_VERSION = "No version declared (judged by the version-match checks).";

/** 2.3 — the version is dot-separated and entirely numeric. */
export function checkVersionFormat(ir: KeyboardIR): CheckResult {
  const version = versionOf(ir);
  if (version === "") return checkPassed("KM_LINT_VERSION_FORMAT", [NO_VERSION]);
  const components = version.split(".");
  if (components.every((c) => NUMERIC.test(c)))
    return checkPassed("KM_LINT_VERSION_FORMAT", [
      `File: ${kmnPath(ir.header.keyboardId)}`,
      `Version "${version}": dot-separated and entirely numeric.`,
    ]);
  return checkFailed("KM_LINT_VERSION_FORMAT", [
    criteriaFinding({
      code: "KM_LINT_VERSION_FORMAT",
      file: kmnPath(ir.header.keyboardId),
      message: `Keyboard version "${version}" is not dot-separated and entirely numeric.`,
      hint: 'Use a version of dot-separated numbers only, e.g. "1.0" or "2.10.3".',
    }),
  ]);
}

/** 2.4 — no version component has a leading zero. */
export function checkVersionLeadingZero(ir: KeyboardIR): CheckResult {
  const version = versionOf(ir);
  if (version === "")
    return checkPassed("KM_LINT_VERSION_LEADING_ZERO", [NO_VERSION]);
  const offenders = version
    .split(".")
    .filter((c) => NUMERIC.test(c) && c.length > 1 && c.startsWith("0"));
  if (offenders.length === 0)
    return checkPassed("KM_LINT_VERSION_LEADING_ZERO", [
      `File: ${kmnPath(ir.header.keyboardId)}`,
      `Version "${version}": no leading zeros.`,
    ]);
  return checkFailed("KM_LINT_VERSION_LEADING_ZERO", [
    criteriaFinding({
      code: "KM_LINT_VERSION_LEADING_ZERO",
      file: kmnPath(ir.header.keyboardId),
      message: `Keyboard version "${version}" has component(s) with a leading zero: ${offenders.join(", ")}.`,
      hint: 'Remove the leading zero from each version component ("01" → "1").',
    }),
  ]);
}

/** 2.5 — the version has no `v` prefix and no non-numeric labels. */
export function checkVersionVPrefix(ir: KeyboardIR): CheckResult {
  const version = versionOf(ir);
  if (version === "") return checkPassed("KM_LINT_VERSION_V_PREFIX", [NO_VERSION]);
  const hasVPrefix = /^v/i.test(version);
  const labels = version.split(".").filter((c) => !NUMERIC.test(c));
  if (!hasVPrefix && labels.length === 0)
    return checkPassed("KM_LINT_VERSION_V_PREFIX", [
      `File: ${kmnPath(ir.header.keyboardId)}`,
      `Version "${version}": no v prefix, no non-numeric labels.`,
    ]);
  const reasons = [
    ...(hasVPrefix ? ['it starts with a "v" prefix'] : []),
    ...(labels.length > 0
      ? [`component(s) ${labels.join(", ")} are not numeric labels`]
      : []),
  ];
  return checkFailed("KM_LINT_VERSION_V_PREFIX", [
    criteriaFinding({
      code: "KM_LINT_VERSION_V_PREFIX",
      file: kmnPath(ir.header.keyboardId),
      message: `Keyboard version "${version}" is not a plain numeric version: ${reasons.join(" and ")}.`,
      hint: 'Drop any "v" prefix and any suffix labels ("-beta", "rc1") from the version.',
    }),
  ]);
}

/** Numeric dot-compare of two version strings (mirrors the assembly's). */
function compareDotVersions(a: string, b: string): number {
  const pa = a.split(".").map((p) => Number.parseInt(p, 10) || 0);
  const pb = b.split(".").map((p) => Number.parseInt(p, 10) || 0);
  const len = Math.max(pa.length, pb.length);
  for (let i = 0; i < len; i++) {
    const d = (pa[i] ?? 0) - (pb[i] ?? 0);
    if (d !== 0) return d;
  }
  return 0;
}

/**
 * 2.6 — the new version is strictly greater than the previously
 * deployed version. /review-only: the "previously deployed version"
 * is the judged .kmn's declared version at the PR's base commit
 * (ReviewContext.baseKmnVersion).
 *
 * - PR version > base → met.
 * - PR version == base on an upgrade (the PR modifies the existing
 *   keyboard) → finding: upgrades must bump the version.
 * - PR version == base on a new keyboard → met-moot: nothing to
 *   increment from.
 * - PR version < base → finding.
 * - Non-PR target → met-moot: already deployed; version history is
 *   the repo.
 * - No PR version declared → met-moot (judged by the version-match
 *   checks, like 2.3–2.5).
 * - Base lookup failed → the assembly names the missing input; the
 *   check never manufactures a verdict here.
 */
export function checkVersionNotIncremented(
  ir: KeyboardIR,
  review: ReviewContext | undefined,
): CheckResult {
  const code = "KM_LINT_VERSION_NOT_INCREMENTED";
  const prVersion = versionOf(ir);
  const file = kmnPath(ir.header.keyboardId);
  if (review === undefined || !review.isPr) {
    return checkPassed(code, [
      "Already deployed; version history is the repo.",
    ]);
  }
  if (prVersion === "") return checkPassed(code, [NO_VERSION]);
  const base = review.baseKmnVersion;
  if (base === undefined) {
    // Unreachable when the assembly is correct: a PR target without a
    // base version lookup is named in contextMissing before checks run.
    return checkPassed(code, []);
  }
  const sha7 = base.baseSha.slice(0, 7);
  const baseVersion = (base.version ?? "").trim();
  if (baseVersion === "") {
    return checkPassed(code, [
      `Base declares no version (base commit ${sha7}); nothing to increment from.`,
    ]);
  }
  const cmp = compareDotVersions(prVersion, baseVersion);
  if (cmp > 0) {
    return checkPassed(code, [
      `Version "${prVersion}" > "${baseVersion}" (base commit ${sha7}).`,
    ]);
  }
  if (cmp < 0) {
    return checkFailed(code, [
      criteriaFinding({
        code: "KM_LINT_VERSION_NOT_INCREMENTED",
        file,
        message: `Version "${prVersion}" is less than the base version "${baseVersion}".`,
        hint: `Use a version strictly greater than "${baseVersion}".`,
      }),
    ]);
  }
  // Equal versions: an upgrade must bump; a new keyboard has nothing
  // to increment from. Upgrade = the folder exists at base in the
  // PR's tier and the PR touches it (same determination as 1.5).
  const segments = review.repoPath.split("/").filter((s) => s !== "");
  const newTier = (segments[0] ?? "").toLowerCase();
  const org = segments[1] ?? "";
  const idLower = ir.header.keyboardId.toLowerCase();
  const changed = (review.treePaths ?? []).map((p) => p.toLowerCase());
  const folder = `${newTier}/${org}/${idLower}/`;
  const isUpgrade =
    (review.idConflictAtBase?.existingTiers ?? []).some(
      (t) => t.toLowerCase() === newTier,
    ) && changed.some((p) => p.startsWith(folder));
  if (isUpgrade) {
    const bumped = suggestBump(baseVersion);
    return checkFailed(code, [
      criteriaFinding({
        code: "KM_LINT_VERSION_NOT_INCREMENTED",
        file,
        message: `Version not incremented from "${baseVersion}": an upgrade must bump the version.`,
        hint:
          `Bump the version past "${baseVersion}"` +
          (bumped ? ` — e.g. "${bumped}".` : "."),
      }),
    ]);
  }
  return checkPassed(code, [
    `New keyboard; no previous version to increment from (base commit ${sha7}).`,
  ]);
}

/** Suggest the next patch version ("1.0" → "1.0.1", "2" → "2.0.1"). */
function suggestBump(version: string): string {
  const parts = version.split(".");
  while (parts.length < 3) parts.push("0");
  const patch = Number.parseInt(parts[parts.length - 1] ?? "0", 10) || 0;
  parts[parts.length - 1] = String(patch + 1);
  return parts.join(".");
}

// 2.1 KM_LINT_VERSION_NOT_BUMPED — if any file that ships in the package
// was modified, the version must be bumped. Compares against the PR's base
// commit. Non-package files (docs, history, license) don't require a bump.
//
// Package files: .kmn, .kvks, .kps, touch layouts, fonts, icons, compiled .js
// Non-package: .md, .htm/.html docs, .php, .txt, LICENSE

const PACKAGE_EXTENSIONS = new Set([
  ".kmn",
  ".kvks",
  ".kps",
  ".keyman-touch-layout",
  ".ttf",
  ".otf",
  ".woff",
  ".woff2",
  ".ico",
  ".js",
]);

const NON_PACKAGE_EXTENSIONS = new Set([
  ".md",
  ".htm",
  ".html",
  ".php",
  ".txt",
]);

function isPackageFile(path: string): boolean {
  const lower = path.toLowerCase();
  const dot = lower.lastIndexOf(".");
  if (dot === -1) return true; // No extension: treat as package file (conservative)
  const ext = lower.slice(dot);
  if (NON_PACKAGE_EXTENSIONS.has(ext)) return false;
  if (PACKAGE_EXTENSIONS.has(ext)) return true;
  // Unknown extension: conservative — treat as package file
  return true;
}

export function checkVersionBumpRequired(
  ir: KeyboardIR,
  review: ReviewContext | undefined,
): CheckResult {
  const code = "KM_LINT_VERSION_NOT_BUMPED";
  const file = kmnPath(ir.header.keyboardId);
  if (review === undefined || !review.isPr) {
    return checkPassed(code, [
      "Not a PR; version history is the repo.",
    ]);
  }
  const changedFiles = review.treePaths ?? [];
  if (changedFiles.length === 0) {
    return checkPassed(code, [
      "No changed files listed; nothing to judge.",
    ]);
  }
  // Filter to this keyboard's folder
  const segments = review.repoPath.split("/").filter((s) => s !== "");
  const idLower = ir.header.keyboardId.toLowerCase();
  const folder = `${segments.join("/")}/`.toLowerCase();
  const kbFiles = changedFiles.filter((p) =>
    p.toLowerCase().startsWith(folder),
  );
  const packageFiles = kbFiles.filter(isPackageFile);
  if (packageFiles.length === 0) {
    return checkPassed(code, [
      `Only non-package files modified (${kbFiles.length} file(s)); no version bump required.`,
    ]);
  }
  // Package files were modified — version must be bumped
  const prVersion = versionOf(ir);
  const base = review.baseKmnVersion;
  if (base === undefined || (base.version ?? "").trim() === "") {
    return checkPassed(code, [
      "Package files modified, but no base version to compare against.",
    ]);
  }
  const baseVersion = base.version!.trim();
  const cmp = compareDotVersions(prVersion, baseVersion);
  if (cmp > 0) {
    return checkPassed(code, [
      `Package files modified (${packageFiles.length} file(s)); version bumped ${baseVersion} → ${prVersion}.`,
    ]);
  }
  const bumped = suggestBump(baseVersion);
  return checkFailed(code, [
    criteriaFinding({
      code: "KM_LINT_VERSION_NOT_BUMPED",
      file,
      message:
        `Package files were modified (${packageFiles.map((p) => p.split("/").pop()).join(", ")}), ` +
        `but the version was not bumped from "${baseVersion}".`,
      hint: `Bump the version past "${baseVersion}" — e.g. "${bumped}".`,
    }),
  ]);
}

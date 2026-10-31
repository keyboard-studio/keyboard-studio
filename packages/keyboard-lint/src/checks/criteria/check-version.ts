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
 *   keyboard) → finding when a package file changed (2.1's
 *   classification); met-moot when only non-package files changed —
 *   nothing new is deployed.
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
  kpsFileNames: readonly string[],
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
  if (isUpgrade(ir, review)) {
    if (classifyChanges(ir, review, kpsFileNames).pkg.length === 0)
      return checkPassed(code, [
        `No package file changed; the deployed version "${baseVersion}" stands (base commit ${sha7}).`,
      ]);
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


/** The PR's changed files under the judged keyboard's folder (folder-relative). */
function changedInFolder(ir: KeyboardIR, review: ReviewContext): string[] {
  const segments = review.repoPath.split("/").filter((s) => s !== "");
  const folder =
    `${segments[0] ?? ""}/${segments[1] ?? ""}/${ir.header.keyboardId}/`.toLowerCase();
  return (review.treePaths ?? [])
    .filter((p) => p.toLowerCase().startsWith(folder))
    .map((p) => p.slice(folder.length));
}

/**
 * Upgrade = the folder exists at base in the PR's tier and the PR
 * touches it (same determination as 1.5). Otherwise the PR is a new
 * submission (or a tier move) with no previously deployed version.
 */
function isUpgrade(ir: KeyboardIR, review: ReviewContext): boolean {
  const newTier = (review.repoPath.split("/").find((s) => s !== "") ?? "").toLowerCase();
  return (
    (review.idConflictAtBase?.existingTiers ?? []).some(
      (t) => t.toLowerCase() === newTier,
    ) && changedInFolder(ir, review).length > 0
  );
}

// Sources compiled into a shipped file (.kmx/.kvk/.js) and the package
// definition itself; everything else ships only if the .kps lists it.
const COMPILED_SOURCES = /\.(kmn|kvks|keyman-touch-layout|kps)$/i;

const baseName = (p: string): string =>
  (p.split(/[\\/]/).pop() ?? "").toLowerCase();

/** Split the folder's changed files into shipped vs not, by the .kps <Files> list. */
function classifyChanges(
  ir: KeyboardIR,
  review: ReviewContext,
  kpsFileNames: readonly string[],
): { pkg: string[]; other: string[] } {
  const shipped = new Set(kpsFileNames.map(baseName));
  const pkg: string[] = [];
  const other: string[] = [];
  for (const p of changedInFolder(ir, review)) {
    (COMPILED_SOURCES.test(p) || shipped.has(baseName(p)) ? pkg : other).push(p);
  }
  return { pkg, other };
}

const listed = (files: readonly string[]): string =>
  files.length === 0 ? "none" : files.join(", ");

/**
 * The shared PR facts 2.1/2.2 judge from, or a met-moot reason line
 * when there is nothing to bump from (non-PR, new submission, or a
 * base with no version).
 */
function bumpFacts(
  ir: KeyboardIR,
  review: ReviewContext | undefined,
  kpsFileNames: readonly string[],
):
  | { moot: string[] }
  | { pkg: string[]; other: string[]; baseVersion: string; prVersion: string; sha7: string } {
  if (review === undefined || !review.isPr)
    return { moot: ["Already deployed; version history is the repo."] };
  const base = review.baseKmnVersion;
  // Unreachable when the assembly is correct: a PR without the base
  // lookups is named in contextMissing before checks run.
  if (base === undefined) return { moot: [] };
  if (versionOf(ir) === "") return { moot: [NO_VERSION] };
  const sha7 = base.baseSha.slice(0, 7);
  const { pkg, other } = classifyChanges(ir, review, kpsFileNames);
  const baseVersion = (base.version ?? "").trim();
  if (!isUpgrade(ir, review) || baseVersion === "")
    return {
      moot: [
        `New keyboard submission: ${review.repoPath} has no released version at base commit ${sha7}, so there is nothing to bump from.`,
        `Files added: ${listed([...pkg, ...other])}.`,
      ],
    };
  return { pkg, other, baseVersion, prVersion: versionOf(ir), sha7 };
}

/**
 * 2.1 — if any file that ships in the package changed, the version was
 * bumped past the base commit's. "Ships" = listed in the .kps <Files>,
 * or a source compiled into a listed file (.kmn/.kvks/touch layout),
 * or the .kps itself.
 */
export function checkVersionBumpRequired(
  ir: KeyboardIR,
  review: ReviewContext | undefined,
  kpsFileNames: readonly string[],
): CheckResult {
  const code = "KM_LINT_VERSION_NOT_BUMPED";
  const f = bumpFacts(ir, review, kpsFileNames);
  if ("moot" in f) return checkPassed(code, f.moot);
  const { pkg, other, baseVersion, prVersion, sha7 } = f;
  if (pkg.length === 0)
    return checkPassed(code, [
      `No package file changed (changed: ${listed(other)}); no version bump required.`,
    ]);
  if (compareDotVersions(prVersion, baseVersion) > 0)
    return checkPassed(code, [
      `Package files changed: ${listed(pkg)}.`,
      `Version bumped "${baseVersion}" → "${prVersion}" (base commit ${sha7}).`,
    ]);
  return checkFailed(code, [
    criteriaFinding({
      code: "KM_LINT_VERSION_NOT_BUMPED",
      file: kmnPath(ir.header.keyboardId),
      message: `Package files changed (${listed(pkg)}), but the version was not bumped from "${baseVersion}".`,
      hint: `Bump the version past "${baseVersion}" — e.g. "${suggestBump(baseVersion)}".`,
    }),
  ]);
}

/**
 * 2.2 — a bump is not required when only non-package files changed.
 * "Not required" is not "forbidden", so this never fails: the evidence
 * names the case so the reviewer can confirm the classification.
 */
export function checkSpuriousVersionBump(
  ir: KeyboardIR,
  review: ReviewContext | undefined,
  kpsFileNames: readonly string[],
): CheckResult {
  const code = "KM_LINT_SPURIOUS_VERSION_BUMP";
  const f = bumpFacts(ir, review, kpsFileNames);
  if ("moot" in f) return checkPassed(code, f.moot);
  const { pkg, other, baseVersion, prVersion } = f;
  if (pkg.length > 0)
    return checkPassed(code, [
      `Package files changed (${listed(pkg)}), so a bump is required — judged by 2.1.`,
    ]);
  const moved = compareDotVersions(prVersion, baseVersion) !== 0;
  return checkPassed(code, [
    `Only non-package files changed: ${listed(other)}.`,
    moved
      ? `Version moved "${baseVersion}" → "${prVersion}" anyway: allowed, but not required.`
      : `Version stays "${baseVersion}": no bump needed.`,
  ]);
}

// Assembly verdicts (spec 084 Batch 3) — criteria 1.5 and 2.1/2.2/2.6.
//
// These four rows are not lint checks and not compile mappings: their
// evidence is the studio's own instantiation state, which only the
// authored host holds —
//
//   1.5  KM_LINT_DUPLICATE_KEYBOARD_ID — the output keyboard's ID
//        against the start-keyboard catalog (all three repo tiers
//        since Batch 3). The base keyboard's own entry is excluded:
//        keeping the base ID on an adaptation is the normal case,
//        not a collision.
//   2.1  KM_LINT_VERSION_NOT_BUMPED — "version incremented if package
//        files changed" (adapt semantics, per triage).
//   2.2  KM_LINT_SPURIOUS_VERSION_BUMP — "version incremented only if
//        files changed": vacuously Met on an adaptation, whose bump
//        rides the regenerated package.
//   2.6  KM_LINT_VERSION_NOT_INCREMENTED — output version strictly
//        greater than the previously deployed version (numeric
//        dot-compare).
//
// Version semantics (triage-pinned): the previous version is the base
// keyboard's header version (startIr.header.version), and the output
// version is the version the generator will stamp — the same
// bumpKeyboardVersion derivation the documentation flow renders into
// HISTORY.md. On an adaptation the package is regenerated (its .kmn
// &KEYBOARDVERSION and .kps carry the new version, and the adaptation
// itself changes the shipped content), so 2.1 reduces to proving the
// bump, exactly as the triage framed it.
//
// New-from-base keyboards have no previously deployed version: the
// resolver's applicability gate resolves all three version rows Not
// applicable there (facts.instantiationMode), so this module simply
// issues no verdicts for that mode. Foreign keyboards get no verdicts
// either — 1.5 would self-match by construction, and no foreign
// instantiation context exists — so the resolver defers all four rows
// to keyboard-lint's PR base-commit checks (check-keyboard-id-conflict,
// check-version), and the assembly names any missing base lookup.

import type { Criterion } from "@keyboard-studio/contracts";
import { bumpKeyboardVersion } from "@keyboard-studio/engine";

import type { CriteriaAssemblyVerdict, ResolvedRow } from "./criteriaTypes.ts";

export const DUPLICATE_ID_CODE = "KM_LINT_DUPLICATE_KEYBOARD_ID";
export const VERSION_NOT_BUMPED_CODE = "KM_LINT_VERSION_NOT_BUMPED";
export const SPURIOUS_VERSION_BUMP_CODE = "KM_LINT_SPURIOUS_VERSION_BUMP";
export const VERSION_NOT_INCREMENTED_CODE =
  "KM_LINT_VERSION_NOT_INCREMENTED";

/** The codes this synthesis produces (named for the catalog drift guard). */
export const ASSEMBLY_VERDICT_CODES: ReadonlySet<string> = new Set([
  DUPLICATE_ID_CODE,
  VERSION_NOT_BUMPED_CODE,
  SPURIOUS_VERSION_BUMP_CODE,
  VERSION_NOT_INCREMENTED_CODE,
]);

/** The version-shaped rows (2.1/2.2/2.6) — Not applicable on new-from-base. */
export const VERSION_VERDICT_CODES: ReadonlySet<string> = new Set([
  VERSION_NOT_BUMPED_CODE,
  SPURIOUS_VERSION_BUMP_CODE,
  VERSION_NOT_INCREMENTED_CODE,
]);

/** Numeric dot-compare of two dotted versions: >0 when `a` is the greater. */
export function compareVersions(a: string, b: string): number {
  const pa = a.split(".").map((p) => Number.parseInt(p, 10) || 0);
  const pb = b.split(".").map((p) => Number.parseInt(p, 10) || 0);
  const len = Math.max(pa.length, pb.length);
  for (let i = 0; i < len; i++) {
    const d = (pa[i] ?? 0) - (pb[i] ?? 0);
    if (d !== 0) return d;
  }
  return 0;
}

export interface VerdictInputs {
  /**
   * Catalog entries (id + repo path) from the start browser, or null
   * when the catalog has not loaded (or failed): the 1.5 verdict is
   * then withheld entirely — an unloaded catalog must never read as
   * "no collision".
   */
  catalog: readonly { id: string; path: string }[] | null;
  /** The base keyboard the working copy started from. */
  baseKeyboardId: string;
  /** The ID the output keyboard will carry. */
  outputKeyboardId: string;
  /** How the working copy was instantiated. */
  instantiationMode: "adapt-existing" | "new-from-base";
  /** The base keyboard's header version (the previously deployed one). */
  startVersion: string;
}

/**
 * Compute the authored assembly's verdicts. The 1.5 verdict is always
 * issued (both modes judge the output ID against the catalog, with
 * the base's own entry excluded); the three version verdicts are
 * issued only for adapt-existing — on new-from-base there is no
 * previously deployed version, and the rows resolve Not applicable
 * through the resolver's applicability gate instead.
 */
export function computeAssemblyVerdicts(
  input: VerdictInputs,
): ReadonlyMap<string, CriteriaAssemblyVerdict> {
  const verdicts = new Map<string, CriteriaAssemblyVerdict>();

  // 1.5 — the base's own catalog entry never counts as a collision.
  if (input.catalog !== null) {
    const collision = input.catalog.find(
      (k) => k.id === input.outputKeyboardId && k.id !== input.baseKeyboardId,
    );
    if (collision !== undefined) {
      verdicts.set(DUPLICATE_ID_CODE, {
        status: "not-met",
        lines: [
          `The keyboard ID "${input.outputKeyboardId}" is already used by the catalogued keyboard at ${collision.path}.`,
        ],
      });
    } else {
      verdicts.set(DUPLICATE_ID_CODE, {
        status: "met",
        lines: [
          `No other catalogued keyboard uses the ID "${input.outputKeyboardId}" (the base keyboard's own entry is excluded).`,
        ],
      });
    }
  }

  if (input.instantiationMode !== "adapt-existing") return verdicts;

  const startVersion = input.startVersion.trim() || "1.0";
  const outputVersion = bumpKeyboardVersion(startVersion);
  const bumped = compareVersions(outputVersion, startVersion) > 0;

  verdicts.set(VERSION_NOT_INCREMENTED_CODE, {
    status: bumped ? "met" : "not-met",
    lines: bumped
      ? [
          `The output version ${outputVersion} is greater than the base keyboard's deployed version ${startVersion}.`,
        ]
      : [
          `The output version ${outputVersion} is not greater than the base keyboard's deployed version ${startVersion}.`,
        ],
  });
  verdicts.set(VERSION_NOT_BUMPED_CODE, {
    status: bumped ? "met" : "not-met",
    lines: bumped
      ? [
          `The adaptation regenerates the package, and its version moves ${startVersion} → ${outputVersion}, so the shipped files and the version change together.`,
        ]
      : [
          `The adaptation regenerates the package, but its version does not move from ${startVersion}.`,
        ],
  });
  verdicts.set(SPURIOUS_VERSION_BUMP_CODE, {
    status: "met",
    lines: [
      "On an adaptation the version bump rides the regenerated package, so it is never a bump without changes.",
    ],
  });
  return verdicts;
}

/** Why an authored verdict-code row has no verdict. */
function absentReason(lintRuleId: string): string {
  return lintRuleId === DUPLICATE_ID_CODE
    ? "Cannot be checked yet: no start-keyboard catalog verdict was assembled for this keyboard."
    : "Cannot be checked yet: no instantiation context (base keyboard and adaptation mode) was assembled for this keyboard.";
}

/**
 * Resolve an assembly-verdict row, or return null when `lintRuleId`
 * is not one of the four verdict codes. A verdict code with no
 * verdict resolves Not yet checkable with the reason — never Met.
 */
export function resolveAssemblyVerdictRow(
  criterion: Criterion,
  lintRuleId: string,
  verdicts: ReadonlyMap<string, CriteriaAssemblyVerdict> | undefined,
  mode: "authored" | "foreign",
): ResolvedRow | null {
  if (!ASSEMBLY_VERDICT_CODES.has(lintRuleId)) return null;
  // In foreign (/review, Compare) mode all four rows are judged by lint
  // checks against the PR's base commit, not by assembly verdicts — the
  // authored host alone holds instantiation state. Defer so the
  // findings path below resolves the rows.
  if (mode === "foreign") return null;
  const verdict = verdicts?.get(lintRuleId);
  if (verdict === undefined) {
    return {
      criterion,
      status: "not-yet-checkable",
      controls: null,
      evidence: () => ({
        kind: "context-missing",
        lines: [absentReason(lintRuleId)],
        lintRuleId,
      }),
    };
  }
  return {
    criterion,
    status: verdict.status,
    controls: null,
    evidence: () => ({ kind: "assembly", lines: verdict.lines, lintRuleId }),
  };
}

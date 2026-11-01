// The criteria resolver (spec 084, plan D2).
//
// One pure function judges the whole catalog for both surfaces: authored
// mode (the author's own studio-built keyboard) and foreign mode (an
// existing keyboard loaded for comparison). Mode is an input, not a forked
// implementation; the modes differ only in what can honestly be claimed —
// a foreign keyboard had no scaffolder run and has no author record, so
// its scaffolder-bake rows resolve Not applicable in favour of their lint
// twin (which gives the real verdict) and its yellow/red rows offer no
// controls.
//
// Resolution order per row is fixed: applicability first (both modes),
// then the band rule. A check that did not run — because it is not
// implemented yet, or because its required context is unavailable —
// resolves Not yet checkable, never Met. Findings whose code maps to no
// criterion are ignored; the resolver never invents rows for them.
//
// Counts are tallied from the emitted rows in the same pass, and evidence
// is a lazy closure per row (plan D9): resolving computes statuses and
// counts only.

import type { Criterion, LintFinding } from "@keyboard-studio/contracts";

import { applicabilityFor } from "./applicability.ts";
import type {
  CriteriaInput,
  CriteriaResult,
  CriterionStatus,
  EvidenceModel,
  ResolvedRow,
} from "./criteriaTypes.ts";
import { resolveAssemblyVerdictRow } from "./assemblyVerdicts.ts";
import { resolveCompileRow } from "./compileMapping.ts";
import { resolveFontLicenseRow } from "./fontLicense.ts";
import { IMPLEMENTED_LINT_CODES } from "./implementedChecks.ts";
import { PRECERTIFY_EVIDENCE } from "./precertify.ts";
import { languageTagContextLines } from "./languageTags.ts";
import {
  copyrightContextLines,
  copyrightSingleYear,
  licenseCopyrightLine,
  prCommentLines,
  scopeNote,
  sourceContextLines,
} from "./reviewerSource.ts";

/** 13.1's / 13.4's verified lines when they found nothing (lint wording). */
const NO_PUA_LINE = "No PUA codepoints in the produced output.";
const NO_MATH_LATIN_LINE =
  "No mathematical Latin look-alikes in the produced output.";

const ALL_STATUSES: readonly CriterionStatus[] = [
  "met",
  "not-met",
  "not-applicable",
  "needs-author",
  "needs-human",
  "not-yet-checkable",
];

const ALL_BANDS: readonly Criterion["band"][] = [
  "scaffolder-bake",
  "layer-c-enforce",
  "yellow-survey",
  "red-checklist",
];

function emptyStatusCounts(): Record<CriterionStatus, number> {
  const counts = {} as Record<CriterionStatus, number>;
  for (const status of ALL_STATUSES) counts[status] = 0;
  return counts;
}

function emptyBandCounts(): Record<
  Criterion["band"],
  Record<CriterionStatus, number>
> {
  const bandCounts = {} as Record<
    Criterion["band"],
    Record<CriterionStatus, number>
  >;
  for (const band of ALL_BANDS) bandCounts[band] = emptyStatusCounts();
  return bandCounts;
}

/**
 * Findings indexed by lint code. Identical findings (same code and same
 * message) are deduped: the doc band and the engine can both report the
 * same problem for one keyboard, and the evidence must name it once.
 */
function indexFindings(
  lintFindings: readonly LintFinding[],
): Map<string, readonly LintFinding[]> {
  const byCode = new Map<string, LintFinding[]>();
  const seen = new Set<string>();
  for (const finding of lintFindings) {
    const key = `${finding.code}\0${finding.message}`;
    if (seen.has(key)) continue;
    seen.add(key);
    const list = byCode.get(finding.code);
    if (list) list.push(finding);
    else byCode.set(finding.code, [finding]);
  }
  return byCode;
}

/**
 * Build reviewer context lines for yellow/red criteria in foreign mode.
 * These rows need human judgment, but we can surface relevant automated
 * context to decide from. Returns the context lines, or empty if none
 * available for this criterion.
 *
 * Data sources:
 * - input.verifiedByCode: verified lines from related implemented checks
 * - input.facts: keyboard facts (fonts, etc.)
 * - _findingsByCode: findings from related checks (currently unused)
 */
function reviewerContext(
  criterion: Criterion,
  input: CriteriaInput,
  _findingsByCode: Map<string, readonly LintFinding[]>,
): string[] {
  const criterionId = criterion.id;
  const lines = reviewerContextBody(criterionId, input);
  const side = input.reviewerSource;
  if (side === undefined) return lines;
  const note = scopeNote(criterion.section, side);
  return note === null ? lines : [...lines, note];
}

function reviewerContextBody(
  criterionId: string,
  input: CriteriaInput,
): string[] {
  const verified = input.verifiedByCode;
  const getVerified = (code: string): string[] =>
    verified?.get(code) ?? [];

  switch (criterionId) {
    // --- PUA-related ---
    case "7.13-pua-documentation":
    case "13.2-pua-notices-in-docs": {
      const pua = getVerified("KM_LINT_PUA_KEYBOARD_PLACEMENT");
      if (pua.length > 0) return ["PUA status:", ...pua];
      return ["No PUA codepoints found (check 13.1)."];
    }
    case "9.7-pua-font-submitted-to-skeyman": {
      const pua = getVerified("KM_LINT_PUA_KEYBOARD_PLACEMENT");
      const fonts = input.facts.bundledFonts ?? [];
      const lines = [...pua];
      if (fonts.length > 0) lines.push(`Bundled fonts: ${fonts.join(", ")}`);
      return lines.length > 0 ? lines : ["No PUA codepoints; no bundled fonts."];
    }

    // --- Copyright-related ---
    // The LICENSE line comes from 4.1b's verified line, which exists
    // whenever a copyright line does (4.5b's only when the syntax passes).
    case "4.2-copyright-year-range-if-multiyear":
    case "4.4-org-legal-name-current":
    case "4.8-year-range-starts-at-original":
    case "4.3-copyright-holder-is-authorized":
      return copyrightContextLines(
        criterionId,
        licenseCopyrightLine(getVerified("KM_LINT_COPYRIGHT_ABSENT")),
        input.reviewerSource,
      );

    // --- Description/readme-related ---
    // README.md / .kps description text not available in resolver input;
    // would need file content plumbing. Noted for future work.
    case "5.1-readme-good-header":
    case "5.4-readme-description-sensible":
    case "10.10-kps-description-meaningful":
    case "10.11-kps-no-spelling-errors":
      return sourceContextLines(criterionId, input.reviewerSource);

    // --- Tags/BCP47-related ---
    // Each tag's langtags name and defaults, then what the language-tag
    // analysis found for this row (languageTags.ts).
    case "10.3-kps-tags-minimal":
    case "10.4-kps-unusual-tag-flagged":
    case "12.1-bcp47-tag-correct":
    case "12.5-script-mismatch-flagged":
      return [
        ...sourceContextLines(criterionId, input.reviewerSource),
        ...languageTagContextLines(criterionId, input.reviewerSource?.languageTags),
      ];
    case "10.5-kps-conlang-flagged":
    case "12.6-script-mismatch-submitted-to-langtags":
      return languageTagContextLines(criterionId, input.reviewerSource?.languageTags);

    // --- Font-related ---
    case "9.3-font-license-genuinely-open": {
      const fonts = input.facts.bundledFonts ?? [];
      if (fonts.length > 0) return [`Bundled fonts: ${fonts.join(", ")}`];
      return ["No bundled fonts."];
    }
    case "9.5-shared-font-current-path": {
      // Shared font path not in verified; would need .kps parsing.
      // Noted for future work.
      return [];
    }

    // --- Display name / RTL ---
    // Display name value not in verified; RTL flag needs .kmn/.kps parsing.
    // Noted for future work.
    case "7.7-display-name-no-underscores":
      return sourceContextLines(criterionId, input.reviewerSource);
    case "7.8-rtl-flag-matches-script":
      return [];

    // --- Touch/OSK-related ---
    case "7.15-osk-reviewed":
    case "7.17-osk-font-selected":
    case "7.18-touch-layout-reviewed":
    case "18.8-character-set-is-minimal":
    case "18.9-rare-chars-discoverable":
    case "18.10-frequent-chars-reachable": {
      const rows = getVerified("KM_WARN_TOUCH_ROW_COUNT");
      const longpress = getVerified("KM_WARN_LONGPRESS_OVERSIZE");
      return [...rows, ...longpress];
    }

    // --- History ---
    case "3.2-history-header-sensible":
      return sourceContextLines(criterionId, input.reviewerSource);

    // --- Welcome/readme.htm ---
    case "6.2-readme-htm-short":
    case "6.4-welcome-htm-describes-usage":
    case "6.5-welcome-htm-no-install-instructions":
    case "6.7-welcome-htm-not-political":
      return sourceContextLines(criterionId, input.reviewerSource);

    // --- Red checklist ---
    case "17.1-build-trigger-pr-comments-resolved":
      return prCommentLines(input.reviewerSource);
    case "14.1-third-party-patch-author-consulted":
    case "15.1-relicense-permission-granted":
    case "16.1-partner-notes-followed":
    case "17.3-build-issues-fed-back":
    case "18.11-tested-with-real-users":
    case "18.12-meets-legal-accessibility-requirements": {
      // Truly manual; no automated context available
      return [];
    }
    case "13.3-no-unencoded-script-codepoint-reuse":
    case "13.5-math-latin-not-spoofing": {
      const pua = getVerified("KM_LINT_PUA_KEYBOARD_PLACEMENT");
      if (pua.length > 0) return ["PUA status:", ...pua];
      return [];
    }

    default:
      return [];
  }
}

/**
 * The lint twins of a scaffolder-bake criterion: the criteria whose id
 * starts `${num}b-` where `num` is the bake row's section number ("1.2"
 * -> "1.2b-...", "1.10" -> "1.10b-..."). Every bake row has exactly one
 * (pinned by a test); the foreign-mode resolver points at it.
 */
export function bakeTwinsOf(
  criterion: Criterion,
  criteria: readonly Criterion[],
): Criterion[] {
  const num = /^(\d+\.\d+)-/.exec(criterion.id)?.[1];
  if (num === undefined) return [];
  return criteria.filter(
    (c) => c.band === "layer-c-enforce" && c.id.startsWith(`${num}b-`),
  );
}

/** §18.6's code (a literal: the resolver stays free of engine imports). */
const INVENTORY_UNCOVERED = "KM_LINT_INVENTORY_UNCOVERED";

const FOREIGN_COMPILE_REASON =
  "/review does not compile keyboards; check the PR's CI build for errors (7.21) and warnings (7.6).";
const FOREIGN_INVENTORY_REASON =
  "Needs the studio's confirmed character inventory, which PR keyboards don't have; check by hand that every character the language needs can be typed.";

function resolveRow(
  criterion: Criterion,
  input: CriteriaInput,
  findingsByCode: Map<string, readonly LintFinding[]>,
): ResolvedRow {
  // a. Applicability, in both modes, before any band rule.
  const applicability = applicabilityFor(criterion, input.facts);
  if (applicability) {
    const reason = applicability.reason;
    return {
      criterion,
      status: "not-applicable",
      controls: null,
      evidence: () => ({ kind: "not-applicable", lines: [reason] }),
    };
  }

  switch (criterion.band) {
    case "scaffolder-bake": {
      // b. Guaranteed by construction for a studio-built keyboard; for a
      // foreign keyboard no scaffolder ran, so nothing is claimed.
      if (input.mode === "authored") {
        return {
          criterion,
          status: "met",
          controls: null,
          evidence: () => ({
            kind: "scaffolder",
            lines: ["Guaranteed by the scaffolder"],
          }),
        };
      }
      // Every bake row has a lint twin that judges the same thing on the
      // files. The row resolves Not applicable and names the twin; it
      // does not copy the twin's status (that would count a failure twice).
      const twins = bakeTwinsOf(criterion, input.criteria);
      if (twins.length === 1) {
        const twinId = twins[0]!.id;
        return {
          criterion,
          status: "not-applicable",
          controls: null,
          evidence: () => ({
            kind: "foreign-bake",
            lines: [
              `For keyboards not built by the studio this is checked by ${twinId}.`,
            ],
          }),
        };
      }
      return {
        criterion,
        status: "not-yet-checkable",
        controls: null,
        evidence: () => ({
          kind: "foreign-bake",
          lines: [
            "Guaranteed by the scaffolder for studio-created keyboards; not verified for this keyboard.",
          ],
        }),
      };
    }

    case "layer-c-enforce": {
      const lintRuleId = criterion.lintRuleId;
      // Precertification (Batch 1): decided at generation time from the
      // generator's closed manifest, prior to and independent of any
      // lint pass. Authored mode only — the mode check is here, in the
      // resolver, so a foreign judgment cannot claim it even if a host
      // passed the set by mistake.
      if (input.mode === "authored" && input.precertified?.has(lintRuleId)) {
        return {
          criterion,
          status: "met",
          controls: null,
          evidence: () => ({
            kind: "precertified",
            lines: [
              PRECERTIFY_EVIDENCE[lintRuleId] ??
                "Precertified by generation: settled by the generator's closed output manifest.",
            ],
            lintRuleId,
          }),
        };
      }
      // Compile-result mapping (Batch 1, §§7.6/7.21): a named synthesis
      // from the host's compile result, not a lint finding — see
      // compileMapping.ts. Runs before the implemented gate because its
      // codes are in the implemented set via that synthesis.
      if (
        input.mode === "foreign" &&
        (lintRuleId === "KM_LINT_COMPILE_ERRORS" ||
          lintRuleId === "KM_LINT_COMPILE_HAS_WARNINGS") &&
        (input.compileResult === undefined || input.compileResult === null)
      ) {
        return {
          criterion,
          status: "not-yet-checkable",
          controls: null,
          evidence: () => ({
            kind: "context-missing",
            lines: [FOREIGN_COMPILE_REASON],
            lintRuleId,
          }),
        };
      }
      const compileRow = resolveCompileRow(
        criterion,
        lintRuleId,
        input.compileResult,
      );
      if (compileRow) return compileRow;
      // Assembly verdicts (Batch 3: 1.5 + 2.1/2.2/2.6): synthesized by
      // the authored host from instantiation state — see
      // assemblyVerdicts.ts. Also before the implemented gate: their
      // codes are in the implemented set via this synthesis, and a
      // missing verdict must resolve Not yet checkable, never Met.
      const verdictRow = resolveAssemblyVerdictRow(
        criterion,
        lintRuleId,
        input.assemblyVerdicts,
        input.mode,
      );
      if (verdictRow) return verdictRow;
      // Font-license attestations (Batch 5: 9.1/9.2): resolved from
      // the criteria record, not from any check — see fontLicense.ts.
      // Before the implemented gate because their codes are
      // deliberately NOT in IMPLEMENTED_LINT_CODES.
      const fontRow = resolveFontLicenseRow(criterion, lintRuleId, input);
      if (fontRow) return fontRow;
      if (!IMPLEMENTED_LINT_CODES.has(lintRuleId)) {
        return {
          criterion,
          status: "not-yet-checkable",
          controls: null,
          evidence: () => ({
            kind: "not-implemented",
            lines: ["Specified but not yet enforced"],
            lintRuleId,
          }),
        };
      }
      const missing = input.contextMissing?.[lintRuleId];
      if (missing !== undefined) {
        return {
          criterion,
          status: "not-yet-checkable",
          controls: null,
          evidence: () => ({
            kind: "context-missing",
            lines: [
              input.mode === "foreign" && lintRuleId === INVENTORY_UNCOVERED
                ? FOREIGN_INVENTORY_REASON
                : `Cannot be checked yet: ${missing} is not available.`,
            ],
            lintRuleId,
          }),
        };
      }
      const findings = findingsByCode.get(lintRuleId) ?? [];
      // §12.3 (Batch 3): the one layer-c row with an author control —
      // the contrastive-region attestation. Offered in authored mode
      // on both outcomes (attest to resolve a finding; withdraw to
      // un-resolve a pass), never in foreign mode.
      const withContrastiveControl = (row: ResolvedRow): ResolvedRow =>
        lintRuleId === "KM_LINT_NUMERIC_REGION_NON_CONTRASTIVE" &&
        input.mode === "authored"
          ? {
              ...row,
              controls: "contrastive",
              contrastiveAttested: input.contrastiveRegionAttested ?? false,
            }
          : row;
      if (findings.length > 0) {
        return withContrastiveControl({
          criterion,
          status: "not-met",
          controls: null,
          evidence: (): EvidenceModel => ({
            kind: "lint-finding",
            lines: findings.flatMap((finding) => {
              const fileLine = finding.location
                ? finding.location.line >= 1
                  ? `File: ${finding.location.file}#L${finding.location.line}`
                  : `File: ${finding.location.file}`
                : null;
              const deltaLine =
                finding.prDelta === "changed"
                  ? "Changed in this PR"
                  : finding.prDelta === "unchanged"
                    ? "Already present before this PR (file unchanged by this PR)"
                    : null;
              // Split message on newlines so multi-line messages (e.g. with
              // a full source line) render as separate paragraphs.
              const msgLines = finding.message.split("\n");
              const parts = finding.hint
                ? [...msgLines, finding.hint]
                : msgLines;
              return fileLine
                ? [fileLine, ...(deltaLine ? [deltaLine] : []), ...parts]
                : parts;
            }),
            lintRuleId,
            findings,
          }),
        });
      }
      return withContrastiveControl({
        criterion,
        status: "met",
        controls: null,
        evidence: (): EvidenceModel => {
          const verified = input.verifiedByCode?.get(lintRuleId) ?? [];
          return {
            kind: "lint-pass",
            lines:
              verified.length > 0
                ? verified
                : ["This check ran and reported no problems."],
            lintRuleId,
          };
        },
      });
    }

    case "yellow-survey": {
      // Foreign mode: a verdict the source data settles (languageTags.ts).
      if (input.mode === "foreign") {
        const verdict = input.reviewerVerdicts?.get(criterion.id);
        if (verdict !== undefined) {
          return {
            criterion,
            status: verdict.status,
            controls: null,
            evidence: () => ({ kind: "reviewer-verdict", lines: verdict.lines }),
          };
        }
      }
      // d. Authored mode only: the author's recorded attestation resolves
      // the row. Foreign mode has no author to ask, so it otherwise stays
      // Needs author and offers no control.
      if (input.mode === "authored") {
        const attestation = input.record.attestations[criterion.id];
        if (attestation) {
          const status: CriterionStatus =
            attestation.answer === "yes"
              ? "met"
              : attestation.answer === "no"
                ? "not-met"
                : "not-applicable";
          return {
            criterion,
            status,
            controls: "attest",
            evidence: () => ({
              kind: "attested",
              lines: [
                `Recorded answer: ${attestation.answer} on ${attestation.at}.`,
              ],
            }),
          };
        }
      }
      return {
        criterion,
        status: "needs-author",
        controls: input.mode === "authored" ? "attest" : null,
        evidence: () => {
          const context = reviewerContext(criterion, input, findingsByCode);
          const lines = [
            input.mode === "foreign"
              ? "Reviewer judgment needed."
              : "No attestation has been recorded for this criterion yet.",
          ];
          if (context.length > 0) {
            lines.push("", "Reviewer context:", ...context);
          }
          return {
            kind: "needs-author",
            lines,
          };
        },
      };
    }

    case "red-checklist": {
      // e. Authored mode only: a recorded confirmation resolves the row.
      // Foreign mode always stays Needs human and offers no control.
      if (input.mode === "authored") {
        const confirmation = input.record.confirmations[criterion.id];
        if (confirmation) {
          return {
            criterion,
            status: "met",
            controls: "confirm",
            evidence: () => ({
              kind: "confirmed",
              lines: [`Confirmed on ${confirmation.at}.`],
            }),
          };
        }
      }
      const checklistText = criterion.preSubmitChecklistText;
      return {
        criterion,
        status: "needs-human",
        controls: input.mode === "authored" ? "confirm" : null,
        evidence: () => {
          const context = reviewerContext(criterion, input, findingsByCode);
          const lines = [checklistText];
          if (context.length > 0) {
            lines.push("", "Reviewer context:", ...context);
          }
          return {
            kind: "needs-human",
            lines,
          };
        },
      };
    }
  }
}

/** Judge every criterion in `input.criteria`, preserving catalog order. */
export function resolveCriteria(rawInput: CriteriaInput): CriteriaResult {
  // Positive lint facts for the named Not applicable predicates: only when
  // the check ran and its verified line says it found nothing. Both modes
  // run the same engine pass, so both get these facts.
  const verified = rawInput.verifiedByCode;
  const licenseYear = copyrightSingleYear(
    licenseCopyrightLine(verified?.get("KM_LINT_COPYRIGHT_ABSENT") ?? []),
  );
  const history = rawInput.reviewerSource?.historyYears;
  const input: CriteriaInput = {
    ...rawInput,
    facts: {
      ...rawInput.facts,
      copyrightSingleYear: licenseYear !== undefined,
      copyrightAndHistoryOneYear:
        licenseYear !== undefined &&
        history !== undefined &&
        history.earliest === licenseYear &&
        history.latest === licenseYear,
      noPuaInOutput:
        verified?.get("KM_LINT_PUA_KEYBOARD_PLACEMENT")?.includes(NO_PUA_LINE) ===
        true,
      noMathLatinLookalikes:
        verified
          ?.get("KM_LINT_MATH_LATIN_LOOKALIKE")
          ?.includes(NO_MATH_LATIN_LINE) === true,
    },
  };
  const findingsByCode = indexFindings(input.lintFindings);
  const counts = emptyStatusCounts();
  const bandCounts = emptyBandCounts();

  const rows: ResolvedRow[] = input.criteria.map((criterion) => {
    const row = resolveRow(criterion, input, findingsByCode);
    counts[row.status] += 1;
    bandCounts[criterion.band][row.status] += 1;
    return row;
  });

  return {
    rows,
    counts,
    bandCounts,
    total: rows.length,
    resolvedCount: counts.met + counts["not-met"] + counts["not-applicable"],
  };
}

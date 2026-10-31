// The criteria resolver (spec 084, plan D2).
//
// One pure function judges the whole catalog for both surfaces: authored
// mode (the author's own studio-built keyboard) and foreign mode (an
// existing keyboard loaded for comparison). Mode is an input, not a forked
// implementation; the modes differ only in what can honestly be claimed —
// a foreign keyboard had no scaffolder run and has no author record, so
// its scaffolder-bake rows are Not yet checkable and its yellow/red rows
// offer no controls.
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
              `Cannot be checked yet: ${missing} is not available for this keyboard.`,
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
              const loc =
                finding.location?.file != null
                  ? [`File: ${finding.location.file}`]
                  : [];
              return finding.hint
                ? [...loc, finding.message, finding.hint]
                : [...loc, finding.message];
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
        evidence: () => ({
          kind: "lint-pass",
          lines: ["This check ran and reported no problems."],
          lintRuleId,
        }),
      });
    }

    case "yellow-survey": {
      // d. Authored mode only: the author's recorded attestation resolves
      // the row. Foreign mode has no author to ask, so it always stays
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
        evidence: () => ({
          kind: "needs-author",
          lines: ["No attestation has been recorded for this criterion yet."],
        }),
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
        evidence: () => ({
          kind: "needs-human",
          lines: [checklistText],
        }),
      };
    }
  }
}

/** Judge every criterion in `input.criteria`, preserving catalog order. */
export function resolveCriteria(input: CriteriaInput): CriteriaResult {
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

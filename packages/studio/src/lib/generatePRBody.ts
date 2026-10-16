// generatePRBody — auto-generated PR-body checklist for GitHub submit (#506).
//
// Spec §12 (see spec.md, "GitHub OAuth fork+PR") prescribes the content of
// the auto-generated PR body: green checks listed as passing, yellow items
// listed by criteria.md section with the field values the studio emitted,
// red items listed as a manual checklist, and the copyright attestation.
// docs/github_flow.md Option A step 5 / Option B repeat the same contract.
//
// Green/yellow/red is a CRITERION classification (spec §11 bands + the
// spec-084 resolver's statuses), NOT a LintFinding severity mapping:
// LintFinding[] enumerates only failures/advisories — it carries no record
// of checks that ran and passed, and yellow-survey / red-checklist criteria
// emit no findings at all. The checklist is therefore driven by resolved
// criteria rows; raw findings that no criterion row covers are appended
// (deduplicated by lint code) so validator results are not lost.
//
// Honesty rules (spec 084 / Scenario E):
//   - A check that did not run is not a check that passed: rows resolved
//     "not-yet-checkable" render in Yellow, explicitly labelled, never in
//     Green.
//   - No red item is pre-checked by the studio: every Red line is `- [ ]`.
//   - Findings inherited from the starting keyboard (origin "upstream")
//     are segregated under their own heading, never counted as the
//     author's items (spec 079 FR-020 / #2145 placement model).
//
// The output is English and deliberately unlocalized, like the other
// PR-body blocks (buildDecisionSummaryBlock, buildImportAttributionBlock):
// the audience is a reviewer reading on github.com.
//
// Composition: this function produces ONLY the checklist + attestation
// block. The caller (ManagedPRSubmitPanel) owns the title / Keyboard ID
// header, and keeps appending the spec-053 decision-summary block after
// this block at submit time. Backend provenance and import attribution
// are added downstream and stay outside this function.

import type { Criterion, LintFinding } from "@keyboard-studio/contracts";
import type { CriterionStatus } from "../criteria/criteriaTypes.ts";

/** One criteria-catalog row after resolution (spec 084), in plain data. */
export interface PRBodyCriterionResult {
  criterion: Criterion;
  status: CriterionStatus;
  /**
   * The field value the studio emitted for this item (spec §12 yellow
   * items show "the relevant field values the studio emitted", e.g. the
   * BCP47 tag or display name). Rendered in the Yellow section when the
   * caller can supply it; omitted otherwise.
   */
  emittedValue?: string;
}

/** Everything {@link generatePRBody} judges from. */
export interface PRBodyLintResults {
  /**
   * Resolved criteria rows, or null when the criteria pipeline had not
   * settled when the body was generated. Null is NOT an empty pass list:
   * the body then carries an explicit "no lint results" note instead of
   * implying checks passed.
   */
  criteria?: readonly PRBodyCriterionResult[] | null;
  /** Raw lint findings; criterion-covered codes are deduplicated away. */
  findings?: readonly LintFinding[];
}

/** The copyright attestation state at generation time. */
export interface PRBodyAttestation {
  /** Mirrors the panel's copyright checkbox. */
  confirmed: boolean;
  /**
   * Copyright holder name, when known. Supplied → the spec §12 sentence
   * is rendered with the holder interpolated. Absent + confirmed → the
   * already-landed panel attestation line is rendered verbatim.
   */
  holder?: string;
}

/**
 * The attestation line the managed-PR panel already ships (landed before
 * #506; the issue's attestation acceptance criterion is satisfied by it).
 * Kept verbatim when the holder is not separately known.
 */
export const COPYRIGHT_ATTESTATION_LINE =
  "**Copyright attestation:** The submitter has confirmed they are the copyright holder or are authorized to submit this keyboard to the community repository.";

function spec12AttestationSentence(holder: string): string {
  return `I confirm I am the copyright holder or am authorized to submit on behalf of ${holder}.`;
}

function criterionLine(row: PRBodyCriterionResult): string {
  return `${row.criterion.id}: ${row.criterion.description}`;
}

function redChecklistText(row: PRBodyCriterionResult): string {
  return row.criterion.band === "red-checklist"
    ? row.criterion.preSubmitChecklistText
    : criterionLine(row);
}

/**
 * Build the lint-checklist + attestation block of a submission PR body
 * from resolved lint/criteria results. Pure and deterministic: the same
 * inputs always produce the same markdown (snapshot-tested).
 */
export function generatePRBody(
  lintResults: PRBodyLintResults,
  attestation: PRBodyAttestation,
): string {
  const criteria = lintResults.criteria ?? null;
  const findings = lintResults.findings ?? [];

  const green: string[] = [];
  const yellow: string[] = [];
  const red: string[] = [];

  if (criteria !== null) {
    for (const row of criteria) {
      switch (row.status) {
        case "met":
          green.push(`- [x] ${criterionLine(row)}`);
          break;
        case "needs-author": {
          const value =
            row.emittedValue !== undefined && row.emittedValue !== ""
              ? ` — studio emitted: \`${row.emittedValue}\``
              : "";
          yellow.push(`- [ ] ${criterionLine(row)}${value}`);
          break;
        }
        case "not-yet-checkable":
          yellow.push(`- [ ] ${criterionLine(row)} (not yet checkable)`);
          break;
        case "needs-human":
          red.push(`- [ ] ${redChecklistText(row)}`);
          break;
        case "not-met":
          red.push(`- [ ] ${criterionLine(row)} (not met)`);
          break;
        case "not-applicable":
          // Judged not to apply to this keyboard — omitted entirely.
          break;
      }
    }
  }

  // Findings no criterion row covers: a layer-c finding and its criterion
  // row are the same check, so codes claimed by a row are skipped here.
  const coveredCodes = new Set<string>();
  if (criteria !== null) {
    for (const row of criteria) {
      if (row.criterion.band === "layer-c-enforce") {
        coveredCodes.add(row.criterion.lintRuleId);
      }
    }
  }
  const inherited: string[] = [];
  for (const finding of findings) {
    if (coveredCodes.has(finding.code)) continue;
    const line = `${finding.code}: ${finding.message}`;
    if (finding.origin === "upstream") {
      inherited.push(`- ${line}`);
    } else if (finding.severity === "error" || finding.severity === "fatal") {
      red.push(`- [ ] ${line}`);
    } else {
      yellow.push(`- [ ] ${line}`);
    }
  }

  // Copyright attestation. Confirmed → a statement in the body. Not
  // confirmed → an unchecked red item (Scenario E: the studio never
  // pre-checks it); the panel's submit gate still requires the checkbox.
  let attestationLine: string | null = null;
  if (attestation.confirmed) {
    attestationLine =
      attestation.holder !== undefined && attestation.holder.trim() !== ""
        ? `**Copyright attestation:** ${spec12AttestationSentence(attestation.holder.trim())}`
        : COPYRIGHT_ATTESTATION_LINE;
  } else {
    red.push(
      `- [ ] Copyright attestation: ${spec12AttestationSentence(attestation.holder?.trim() ? attestation.holder.trim() : "the copyright holder")}`,
    );
  }

  const sections: string[] = [];
  if (green.length > 0) {
    sections.push(["### Green — checks passed", "", ...green].join("\n"));
  }
  if (yellow.length > 0) {
    sections.push(
      ["### Yellow — advisory, please review", "", ...yellow].join("\n"),
    );
  }
  if (red.length > 0) {
    sections.push(
      ["### Red — manual action required", "", ...red].join("\n"),
    );
  }
  if (inherited.length > 0) {
    sections.push(
      [
        "### Inherited from the starting keyboard",
        "",
        ...inherited,
      ].join("\n"),
    );
  }
  if (sections.length === 0) {
    sections.push(
      "_No lint results were available when this PR body was generated._",
    );
  }
  if (attestationLine !== null) {
    sections.push(attestationLine);
  }
  return sections.join("\n\n");
}

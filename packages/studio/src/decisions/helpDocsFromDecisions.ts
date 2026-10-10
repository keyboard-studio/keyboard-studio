// helpDocsFromDecisions — the Phase F help-docs composition over the
// decision set (spec 089 T014).
//
// Until this spec, `extractHelpDocs` (editors/adapters/flowStepOptions.tsx)
// composed `HelpDocsAnswers` from the Phase F phase result inside
// phaseFOptions.onCommit. The composition now reads the recorded `help-*`
// decisions — the same rules, field for field (that function is deleted in
// T015; this file is its successor):
//
//   - a blank `help-welcome-paragraph` composes to `undefined` — the
//     caller then returns no patch at all, leaving the working copy's
//     help-docs slice exactly as it was (spec 061 research D-01);
//   - usage tips read tips 1 and 2 only (3–5 are unreachable in the live
//     flow, research D-11), trimmed, blanks dropped;
//   - `help-project-url` splits on newlines into home/help URLs — the
//     question's documented "one or two lines" format (FR-004);
//   - the help-page languages compose into `docLanguageTags` (#2002,
//     integrated 2026-10-10): pf_doc_language + pf_doc_language_second and
//     their "another language" pickers resolve to BCP 47 tags, main first;
//   - the opt-in battery fields land only when non-blank.
//
// The HISTORY-entry half lives here too (not in the question module)
// because it needs lib/historyEntryState.ts, which question modules may
// not import (the depcruise question-modules rule); decisions/ may.

import type { HelpDocsAnswers, HistoryEntryState } from "@keyboard-studio/contracts";
import type { DecisionId, DecisionSet } from "./decisionTypes.ts";
import { deriveIdentityResult } from "./identitySelectors.ts";
import { applyHistoryEntryAction } from "../lib/historyEntryState.ts";
import { isHistoryEntryAction } from "../survey/questions/f/pf_history_entry.ts";

/** A decision's value as a string — recorded answers keep their raw shape. */
function decisionString(decisions: DecisionSet, id: DecisionId): string {
  const value = decisions[id]?.value;
  return typeof value === "string" ? value : "";
}

type OptInField =
  | "designRationale" | "fontGuidance" | "canonicalOrder" | "scriptGlossary"
  | "exampleWords" | "scopeVariety" | "provenanceBasis" | "troubleshooting"
  | "knownLimitations" | "relatedKeyboards" | "furtherReading";

/** The opt-in "additional detail" battery — HelpDocsAnswers field ↔ decision id. */
const OPT_IN_DECISION_IDS: ReadonlyArray<[OptInField, DecisionId]> = [
  ["designRationale", "help-design-rationale"],
  ["fontGuidance", "help-font-guidance"],
  ["canonicalOrder", "help-canonical-order"],
  ["scriptGlossary", "help-script-glossary"],
  ["exampleWords", "help-example-words"],
  ["scopeVariety", "help-scope-variety"],
  ["provenanceBasis", "help-provenance-basis"],
  ["troubleshooting", "help-troubleshooting"],
  ["knownLimitations", "help-known-limitations"],
  ["relatedKeyboards", "help-related-keyboards"],
  ["furtherReading", "help-further-reading"],
];

/**
 * The help prose's language tags, main language first
 * (`HelpDocsAnswers.docLanguageTags`, #2002). Each recorded choice
 * resolves to a tag: "english" → "en", "target" → the keyboard's own
 * tag (the identity derivation's composed `bcp47`), "other" → that
 * question's picker answer. A second choice that can't resolve (no
 * keyboard tag yet, blank picker) is dropped, and a second language
 * equal to the first is ignored. But an unresolved MAIN language
 * yields no tags at all: promoting the second language into `tags[0]`
 * would make it the page's `<html lang>` and mislabel prose written
 * in the main language, so the renderer instead falls back to the
 * keyboard's `primaryBcp47` (km-triage fix on #2002). The legacy
 * single-question "bilingual" answer reads as English + the
 * keyboard's language. The legacy `docLanguage` field is no longer
 * written — contracts marks it accepted-for-loading only.
 */
function resolveDocLanguageTags(
  decisions: DecisionSet,
  targetBcp47: string | undefined,
): string[] {
  const resolve = (choice: string, otherDecisionId: DecisionId): string | undefined => {
    if (choice === "english") return "en";
    if (choice === "target") return targetBcp47?.trim() || undefined;
    if (choice === "other") return decisionString(decisions, otherDecisionId).trim() || undefined;
    return undefined;
  };
  const main = decisionString(decisions, "help-doc-language");
  const candidates =
    main === "bilingual"
      ? [resolve("english", "help-doc-language-other"), resolve("target", "help-doc-language-other")]
      : [
          resolve(main, "help-doc-language-other"),
          resolve(
            decisionString(decisions, "help-doc-language-second"),
            "help-doc-language-second-other",
          ),
        ];
  if (candidates[0] === undefined) return [];
  const tags: string[] = [];
  for (const tag of candidates) {
    if (tag !== undefined && !tags.some((t) => t.toLowerCase() === tag.toLowerCase())) {
      tags.push(tag);
    }
  }
  return tags;
}

/**
 * Build `HelpDocsAnswers` from the recorded `help-*` decisions, or
 * `undefined` when the one required decision (`help-welcome-paragraph`)
 * is blank.
 */
export function helpDocsFromDecisions(decisions: DecisionSet): HelpDocsAnswers | undefined {
  const description = decisionString(decisions, "help-welcome-paragraph").trim();
  if (description === "") return undefined;

  const usageTips = [
    decisionString(decisions, "help-usage-tip-1"),
    decisionString(decisions, "help-usage-tip-2"),
  ]
    .map((t) => t.trim())
    .filter((t) => t !== "");

  const helpDocs: HelpDocsAnswers = { description, usageTips };

  const credits = decisionString(decisions, "help-credits").trim();
  if (credits !== "") helpDocs.credits = credits;

  const contactInfo = decisionString(decisions, "help-contact-info").trim();
  if (contactInfo !== "") helpDocs.contactInfo = contactInfo;

  const projectUrl = decisionString(decisions, "help-project-url");
  if (projectUrl !== "") {
    const lines = projectUrl.split("\n").map((l) => l.trim()).filter((l) => l !== "");
    if (lines[0] !== undefined) helpDocs.projectHomeUrl = lines[0];
    if (lines[1] !== undefined) helpDocs.projectHelpUrl = lines[1];
  }

  const docLanguageTags = resolveDocLanguageTags(
    decisions,
    deriveIdentityResult(decisions)?.bcp47 || undefined,
  );
  if (docLanguageTags.length > 0) helpDocs.docLanguageTags = docLanguageTags;

  for (const [field, decisionId] of OPT_IN_DECISION_IDS) {
    const value = decisionString(decisions, decisionId).trim();
    if (value !== "") {
      helpDocs[field] = value;
    }
  }

  return helpDocs;
}

/**
 * The HISTORY-entry channel value for the Phase F completion: the author's
 * recorded `help-history-entry` action applied onto the working copy's
 * current state. `undefined` (no channel) when no history decision exists,
 * when the recorded value is not a valid action (a blank/absent answer
 * means "not decided yet" — the state stays "proposed"), or when there is
 * no current state to apply onto. Mirrors phaseFOptions.onCommit's history
 * half exactly.
 */
export function historyEntryStateFromDecisions(
  decisions: DecisionSet,
  current: HistoryEntryState | null,
): HistoryEntryState | undefined {
  if (decisions["help-history-entry"] === undefined) return undefined;
  const action = decisionString(decisions, "help-history-entry");
  if (!isHistoryEntryAction(action) || current === null) return undefined;
  const bullets = decisions["help-history-bullets"]?.value;
  return applyHistoryEntryAction(
    action,
    typeof bullets === "string" ? bullets : undefined,
    current,
  );
}

// deriveDocMemberStates — the ONE source of truth for which tier supplied each
// of the six shipped documentation members and whether the member is still the
// fallback stub (spec 076 FR-022, research R5).
//
// Pure: a function of working-copy state the studio already holds (the Phase F
// answers, the HISTORY proposal state, the base's fetched documentation, the
// authoring track). The Output checklist (FR-017) and the upstream-finding rule
// (FR-020) both read this record; nothing re-derives tier logic locally, so the
// two surfaces cannot disagree about where a member's content came from.
//
// Tier priority is FR-005's order read from the top: `authored` when an author
// answer contributed the member's prose, else `inherited` when the working copy
// is a Track 2 adaptation and the base shipped that member, else `derived`. A
// Track 1 copy inherits images and skeleton only (FR-007), so it never reports
// `inherited` for a prose member — the `instantiationMode` guard below is what
// enforces that, independent of what the store happens to hold.
//
// `placeholder` is true exactly when the projection would ship the fallback
// stub for that member — the same predicates `helpDocsRender.ts` and
// `renderHistoryMd.ts` branch on. Keep them aligned when either renderer's
// fallback rule changes.

import {
  DOC_MEMBER_IDS,
  docMemberPath,
  type DocMemberState,
  type DocSourceTier,
  type HelpDocsAnswers,
  type HistoryEntryState,
} from "@keyboard-studio/contracts";

export interface DeriveDocMemberStatesInput {
  instantiationMode: "new-from-base" | "adapt-existing" | null;
  helpDocs: HelpDocsAnswers | null;
  historyEntryState: HistoryEntryState | null;
  base: {
    welcomeHtmText: string | null;
    helpPhpText: string | null;
    readmeMdText: string | null;
    historyMdText: string | null;
    hasWelcomeImages: boolean;
  };
  keyboardId: string;
  /** Base-page image references no carried file satisfies (projection warning). */
  missingInheritedImages: string[];
}

/** The Phase F step that supplies every prose member's content. */
export const DOC_FILL_STEP_HELP = "help";
/** The step that captures the author / copyright holder LICENSE.md is derived from. */
export const DOC_FILL_STEP_LICENSE = "identity";

// The member -> path rule lives in contracts (shared with keyboard-lint, which
// may not import the engine); re-exported so existing engine importers keep working.
export { docMemberPath };

function nonBlank(s: string | null | undefined): boolean {
  return s !== null && s !== undefined && s.trim() !== "";
}

/** The HISTORY entry the author confirmed or edited ships; anything else leaves the stub (FR-011). */
export function historyEntryShips(state: HistoryEntryState | null): boolean {
  return state !== null && (state.status === "confirmed" || state.status === "edited");
}

export function deriveDocMemberStates(input: DeriveDocMemberStatesInput): DocMemberState[] {
  const { instantiationMode, helpDocs, historyEntryState, base, keyboardId, missingInheritedImages } = input;
  const isAdaptation = instantiationMode === "adapt-existing";
  const hasDescription = nonBlank(helpDocs?.description);

  // `inherited` is reachable ONLY on Track 2 (FR-007): a copy's base prose
  // slices are null by construction, but the track guard makes the rule hold
  // even if a stale slice slipped through.
  const inheritedIf = (baseText: string | null): boolean => isAdaptation && nonBlank(baseText);

  const prose = (baseText: string | null): { tier: DocSourceTier; placeholder: boolean } => {
    if (hasDescription) return { tier: "authored", placeholder: false };
    if (inheritedIf(baseText)) return { tier: "inherited", placeholder: false };
    return { tier: "derived", placeholder: true };
  };

  return DOC_MEMBER_IDS.map((member): DocMemberState => {
    const path = docMemberPath(member, keyboardId);
    switch (member) {
      case "readme-md":
        return { member, path, ...prose(base.readmeMdText), fillStepId: DOC_FILL_STEP_HELP, warnings: [] };
      case "history-md": {
        // FR-011: the stub ships unless the author confirmed or edited the
        // proposal — on an adaptation the base's own entries still ride below
        // the tool's entry, which is inheritance, not a placeholder.
        const ships = historyEntryShips(historyEntryState);
        const tier: DocSourceTier = ships ? "authored" : inheritedIf(base.historyMdText) ? "inherited" : "derived";
        return { member, path, tier, placeholder: !ships, fillStepId: DOC_FILL_STEP_HELP, warnings: [] };
      }
      case "license-md":
        // Always a real MIT body with the retained holders: derived, never a
        // stub, and never authored prose.
        return { member, path, tier: "derived", placeholder: false, fillStepId: DOC_FILL_STEP_LICENSE, warnings: [] };
      case "readme-htm": {
        // The package-details popup is never fetched from a base; authored or stub.
        const state = hasDescription
          ? { tier: "authored" as const, placeholder: false }
          : { tier: "derived" as const, placeholder: true };
        return { member, path, ...state, fillStepId: DOC_FILL_STEP_HELP, warnings: [] };
      }
      case "welcome-htm": {
        const state = prose(base.welcomeHtmText);
        const warnings = missingInheritedImages.map((name) => `missing inherited image: ${name}`);
        return { member, path, ...state, fillStepId: DOC_FILL_STEP_HELP, warnings };
      }
      case "help-php":
        return { member, path, ...prose(base.helpPhpText), fillStepId: DOC_FILL_STEP_HELP, warnings: [] };
    }
  });
}

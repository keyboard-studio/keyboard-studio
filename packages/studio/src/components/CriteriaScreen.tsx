// CriteriaScreen — the authored criteria route's host (spec 084, T4.2).
//
// Owns exactly one artifact pipeline instance while this route is
// mounted (the OutputScreen precedent in usePreviewArtifact's header:
// each screen runs its own pipeline, deliberately), and assembles
// everything the pure criteria page needs: the shared authored result
// (useAuthoredCriteria over this screen's own stage) and the criteria
// record store's actions, passed down as plain props and callbacks —
// CriteriaPage itself reads no store (plan D8).
//
// While the artifact or the findings are not ready there is no honest
// result to show: a partially judged page would state verdicts the lint
// run has not produced. The screen renders a stated not-ready notice
// instead — absence as a statement, never false verdicts.

import { Trans, useLingui } from "@lingui/react/macro";

import { CriteriaPage } from "../criteria/CriteriaPage.tsx";
import { useAuthoredCriteria } from "../hooks/useAuthoredCriteria.ts";
import { usePreviewArtifact } from "../hooks/usePreviewArtifact.ts";
import { useOpenRatchet } from "../hooks/useOpenRatchet.ts";
import { navigateTo } from "../lib/navigate.ts";
import { jumpToLocation } from "../lib/jumpToLocation.ts";
import { ALL_CRITERIA } from "@keyboard-studio/contracts";
import { MISSING_LETTERS_RULE } from "../criteria/openIssues.ts";
import { upgradePairFor } from "../criteria/upgradePairs.ts";
import { useRouteSuggestedFix } from "../hooks/useRouteSuggestedFix.ts";
import { missingCharacterFixes } from "../criteria/missingCharacterFixes.ts";
import { useDocRegenerationFixes } from "../hooks/useDocRegenerationFixes.ts";
import { applyDocRegeneration } from "../lib/docRegenerationFix.ts";
import { SuggestedFixesPanel } from "./SuggestedFixes.tsx";
import { useCriteriaRecordStore } from "../stores/criteriaRecordStore.ts";
import { useWorkingCopyStore } from "../stores/workingCopyStore.ts";
import { isOpenMode } from "../lib/openMode.ts";
import { Button } from "../ui/Button.tsx";
import { ACCENT, BORDER, FONT, TEXT_DIM } from "../ui/theme.ts";

const containerStyle: React.CSSProperties = {
  padding: 24,
  fontFamily: FONT,
  color: "var(--app-text)",
  height: "100%",
  overflowY: "auto",
  boxSizing: "border-box",
};

const noticeStyle: React.CSSProperties = {
  margin: "0 0 12px",
  padding: "8px 12px",
  border: `1px solid ${BORDER}`,
  borderRadius: 4,
  fontSize: 13,
  color: TEXT_DIM,
};

/**
 * Where a finding's "open editor" goes on Open: missing letters (18.6) to the Letters
 * step, a criterion with a registered upgrade to the Upgrades step, anything else to the
 * walk where it stands.
 */
function openEditorFor(criterionId: string): void {
  const criterion = ALL_CRITERIA.find((c) => c.id === criterionId);
  const rule = criterion !== undefined && "lintRuleId" in criterion ? criterion.lintRuleId : undefined;
  const step =
    rule === MISSING_LETTERS_RULE ? "open_missing_letters" : rule !== undefined && upgradePairFor(rule) !== undefined ? "open_upgrades" : null;
  if (step !== null && jumpToLocation({ route: "survey", step }).kind !== "refused") return;
  navigateTo("survey");
}

export function CriteriaScreen() {
  const { t } = useLingui();
  const artifact = usePreviewArtifact();
  const result = useAuthoredCriteria(artifact.stage);

  const ratchet = useOpenRatchet(result, artifact.stage.kind === "error");
  const routeFix = useRouteSuggestedFix();
  const docFixes = useDocRegenerationFixes();
  // Review is the Open walk's last step: Continue hands over to Output (spec 111 FR-031).
  const isOpen = isOpenMode(useWorkingCopyStore((s) => s.instantiationMode));
  const setReviewNote = useCriteriaRecordStore((s) => s.setReviewNote);
  const removeReviewNote = useCriteriaRecordStore((s) => s.removeReviewNote);

  const attest = useCriteriaRecordStore((s) => s.attest);
  const clearAttestation = useCriteriaRecordStore((s) => s.clearAttestation);
  const confirm = useCriteriaRecordStore((s) => s.confirm);
  const unconfirm = useCriteriaRecordStore((s) => s.unconfirm);
  const attestContrastiveRegion = useCriteriaRecordStore(
    (s) => s.attestContrastiveRegion,
  );
  const clearContrastiveRegion = useCriteriaRecordStore(
    (s) => s.clearContrastiveRegion,
  );
  const attestFontLicense = useCriteriaRecordStore((s) => s.attestFontLicense);
  const clearFontLicense = useCriteriaRecordStore((s) => s.clearFontLicense);

  if (result === null) {
    return (
      <div style={containerStyle} data-testid="criteria-screen-not-ready">
        <h2 style={{ margin: "0 0 12px", fontSize: "1.1rem", color: ACCENT }}>
          <Trans id="criteria.title">Criteria</Trans>
        </h2>
        <p style={noticeStyle} data-testid="criteria-not-ready">
          {artifact.stage.kind === "error" ? (
            <Trans id="criteria.notReady.compileError">
              The keyboard could not be compiled, so its criteria cannot be judged yet.
              Fix the compile problem and the verdicts will appear here.
            </Trans>
          ) : (
            <Trans id="criteria.notReady">
              The keyboard is still being prepared, so its criteria cannot be judged
              yet. The verdicts will appear here once the compiled keyboard is ready.
            </Trans>
          )}
        </p>
      </div>
    );
  }

  const keyboardLabel =
    artifact.stage.kind === "ready" ? artifact.stage.keyboardId : undefined;

  // "Add character" fixes for expected characters the keyboard cannot type
  // (criterion 18.6 on Open, FR-018a): one per finding, routed to the
  // mechanisms gallery. Offers only; nothing is applied here.
  const missingFixes = ratchet !== null
    ? missingCharacterFixes(
        result.rows.flatMap((r) => (r.status === "not-met" ? (r.evidence().findings ?? []) : [])),
      )
    : [];

  return (
    <div style={{ display: "flex", flexDirection: "column", height: "100%" }}>
    <div style={{ flex: "none", padding: "12px 24px 0", maxHeight: "40%", overflowY: "auto" }}>
      <SuggestedFixesPanel
        extra={[...missingFixes, ...docFixes]}
        onAccept={(fix) => (fix.kind === "docs" ? void applyDocRegeneration(fix) : routeFix(fix))} testId="criteria-suggested-fixes" />
    </div>
    <div style={{ flex: 1, minHeight: 0 }}>
    <CriteriaPage
      result={result}
      mode="authored"
      {...(keyboardLabel !== undefined ? { keyboardLabel } : {})}
      judgedNote={t({
        id: "criteria.judgedNote.authored",
        message: "Judging the keyboard as it would be downloaded from Output.",
      })}
      onAttest={attest}
      onClearAttestation={clearAttestation}
      onConfirm={confirm}
      onUnconfirm={unconfirm}
      onAttestContrastive={attestContrastiveRegion}
      onClearContrastive={clearContrastiveRegion}
      onAttestFontLicense={attestFontLicense}
      onClearFontLicense={clearFontLicense}
      {...(ratchet !== null
        ? {
            openRatchet: {
              baseline: ratchet.baseline,
              notes: ratchet.notes,
              onSaveNote: (key, criterionId, text) =>
                setReviewNote({ key, criterionId, text }),
              onRemoveNote: removeReviewNote,
              // The walk is where a failing item is edited; per-fix links
              // arrive with the suggested-fix work.
              onOpenEditor: (criterionId) => openEditorFor(criterionId),
            },
          }
        : {})}
    />
    </div>
    {isOpen && (
      <div style={{ flex: "none", display: "flex", justifyContent: "flex-end", padding: "8px 24px", borderTop: `1px solid ${BORDER}` }}>
        <Button variant="primary" onClick={() => navigateTo("output")} data-testid="criteria-continue">
          <Trans id="criteria.continueToOutput">Continue to Output</Trans>
        </Button>
      </div>
    )}
    </div>
  );
}

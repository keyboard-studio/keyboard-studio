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
import { useCriteriaRecordStore } from "../stores/criteriaRecordStore.ts";
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

export function CriteriaScreen() {
  const { t } = useLingui();
  const artifact = usePreviewArtifact();
  const result = useAuthoredCriteria(artifact.stage);

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

  return (
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
    />
  );
}

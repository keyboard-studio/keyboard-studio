// StartScreen — the New-or-Open choice (spec 111 FR-001).
//
// Reached after the welcome screen (sign-in or "Continue as guest"), from the nav
// wordmark at any time, and as the landing route for a returning author with no
// draft. "Create a new keyboard" starts the Copy walk; "Open an existing keyboard"
// (OpenKeyboardEntry) starts an update. Each records the authoring track up front,
// so the walk's own track step never asks (registry.ts gates it).

import { useEffect, useMemo, useState } from "react";
import { Trans, useLingui } from "@lingui/react/macro";
import { OpenKeyboardEntry } from "./OpenKeyboardEntry.tsx";
import { navigateTo } from "../lib/navigate.ts";
import { markVisited } from "../lib/firstVisit.ts";
import {
  loadDraftMeta,
  PENDING_PROJECT_KEY,
  resolveActiveProjectKey,
} from "../lib/draftPersistence.ts";
import { loadServerDraftMeta } from "../lib/serverDraftStore.ts";
import { useGitHubAuth } from "../hooks/useGitHubAuth.ts";
import { startFreshSession } from "../lib/freshSession.ts";
import { recordAuthoringTrack } from "../lib/recordAuthoringTrack.ts";
import { BG_PAGE, BG_CARD, ACCENT, TEXT_DIM, TEXT_MAIN, FONT } from "../ui/theme.ts";
import { Button } from "../ui/Button.tsx";
import { phaseHeading, surveyPageColumn } from "../survey/surveyStyles.ts";
import {
  StepNavContext,
  usePublishStepNav,
} from "../hooks/usePublishStepNav.ts";
import { START_ROUTE_NAV_STEP_ID } from "../stores/stepNavStore.ts";

/** Start a new keyboard: a clean session whose walk is the Copy track. */
export function createNewKeyboard(): void {
  startFreshSession();
  recordAuthoringTrack("copy", "start");
  markVisited();
  navigateTo("survey");
}

// New is the main path, so it leads: first, accent-bordered, with the larger button.
// Open follows as the secondary choice.
const newCardStyle = {
  margin: "24px 0 8px",
  padding: 28,
  background: BG_CARD,
  border: `2px solid ${ACCENT}`,
  borderRadius: 10,
} as const;

const newButtonStyle = {
  padding: "12px 28px",
  fontSize: 16,
} as const;

function StartScreenBody(): React.JSX.Element {
  const { t } = useLingui();
  const localDraft = loadDraftMeta();
  const hasLocalDraft = localDraft !== null;
  // A signed-in author on a new device has no local draft, only one saved to their
  // account. Offer to continue it too: the survey's resume banner (StudioShell)
  // runs the same check and does the actual restore.
  const { token } = useGitHubAuth();
  const accessToken = token?.accessToken ?? null;
  const [cloudLabel, setCloudLabel] = useState<string | null | undefined>(
    undefined,
  );
  useEffect(() => {
    if (hasLocalDraft || accessToken === null) return;
    let cancelled = false;
    void loadServerDraftMeta(
      accessToken,
      resolveActiveProjectKey() ?? PENDING_PROJECT_KEY,
    )
      .then((meta) => {
        if (!cancelled && meta !== null) setCloudLabel(meta.label ?? null);
      })
      .catch(() => {
        // No cloud offer when the account cannot be reached; New and Open still work.
      });
    return () => {
      cancelled = true;
    };
  }, [accessToken, hasLocalDraft]);
  const resumable = hasLocalDraft || cloudLabel !== undefined;
  const label = localDraft !== null ? localDraft.label : (cloudLabel ?? null);
  const [confirmingNew, setConfirmingNew] = useState(false);

  const navSpec = useMemo(() => {
    if (!resumable) return {};
    return {
      forward: {
        label:
          label !== null
            ? t({
                id: "start.continue.named",
                message: `Continue ${{ label: label }}`,
              })
            : t({ id: "start.continue", message: "Continue your current keyboard" }),
        onClick: () => navigateTo("survey"),
        testId: "start-continue-draft",
      },
    };
  }, [resumable, label, t]);

  usePublishStepNav(navSpec);

  // Same composition as the survey steps (#2567): left-aligned survey
  // column with the display title above the cards — not the old centred
  // column with a plain 24px title this hub used to render. The New card
  // keeps its accent-bordered lead treatment; only its buttons move to the
  // shared ui/Button.
  return (
    <div
      style={{
        background: BG_PAGE,
        height: "100%",
        boxSizing: "border-box",
        fontFamily: FONT,
        color: TEXT_MAIN,
        overflowY: "auto",
      }}
    >
      <div style={surveyPageColumn}>
        <h1 style={phaseHeading}>
          <Trans id="start.title">What would you like to do?</Trans>
        </h1>
        {resumable && (
          <p style={{ margin: "0 0 8px", fontSize: 14, color: TEXT_DIM }}>
            <Trans id="start.continue.hint">
              Use Continue in the footer to resume your draft.
            </Trans>
          </p>
        )}
        <section aria-labelledby="start-new-heading" style={newCardStyle}>
          <h2
            id="start-new-heading"
            style={{ margin: "0 0 8px", fontSize: 22 }}
          >
            <Trans id="start.new.title">Create a new keyboard</Trans>
          </h2>
          <p
            style={{
              margin: "0 0 16px",
              fontSize: 14,
              lineHeight: 1.6,
              color: TEXT_DIM,
            }}
          >
            <Trans id="start.new.intro">
              Start from your language. Studio proposes an existing keyboard to
              copy, and you shape it into a new one.
            </Trans>
          </p>
          {confirmingNew ? (
            <div role="group" aria-labelledby="start-new-confirm">
              <p
                id="start-new-confirm"
                style={{ margin: "0 0 8px", fontSize: 13 }}
              >
                <Trans id="start.new.confirm">
                  This closes your current keyboard and discards its draft.
                </Trans>
              </p>
              <Button
                variant="primary"
                style={newButtonStyle}
                onClick={createNewKeyboard}
              >
                <Trans id="start.new.confirm.yes">Start a new keyboard</Trans>
              </Button>{" "}
              <Button onClick={() => setConfirmingNew(false)}>
                <Trans id="start.new.confirm.cancel">Cancel</Trans>
              </Button>
            </div>
          ) : (
            <Button
              variant="primary"
              data-testid="start-new"
              style={newButtonStyle}
              onClick={() =>
                resumable ? setConfirmingNew(true) : createNewKeyboard()
              }
            >
              <Trans id="start.new.button">Create a new keyboard</Trans>
            </Button>
          )}
        </section>
        <OpenKeyboardEntry />
      </div>
    </div>
  );
}

/** New/Open hub (spec 111). Provider wraps the body so `usePublishStepNav` sees the route step id. */
export function StartScreen(): React.JSX.Element {
  return (
    <StepNavContext.Provider value={START_ROUTE_NAV_STEP_ID}>
      <StartScreenBody />
    </StepNavContext.Provider>
  );
}

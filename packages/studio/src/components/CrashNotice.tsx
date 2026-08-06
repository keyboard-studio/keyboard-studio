// CrashNotice — the lighter surface for a crash the page survived
// (spec 060, FR-071, FR-073, FR-074 – FR-077, FR-121, FR-053).
//
// FIRES ON `onerror` / `unhandledrejection`, where the tree is still mounted
// and the author is still mid-task. That is why it uses aria-live="polite" and
// NEVER moves focus: the page has not changed out from under anyone, so
// grabbing focus would yank a keyboard user out of what they were doing to tell
// them about something they did not ask about. CrashRecoveryScreen, which
// replaces the whole page, does the opposite for the opposite reason
// (docs/accessibility.md rule 4, contracts/client-surface.md).
//
// NO CONFIRMATION DIALOG GATES THE SEND (FR-070). The report has already gone
// by the time this renders. Undo is a retraction, not a pre-flight prompt —
// asking permission mid-crash is a question the author cannot usefully answer.
//
// State comes from send.ts's module-scope subscribable via
// `useSyncExternalStore`, not from a zustand store: `src/stores/` is where the
// engine-importing modules live, and the crash path must keep working when the
// engine chunk is the thing that failed (research D6).

import { useEffect, useState, useSyncExternalStore } from "react";
import { Trans, useLingui } from "@lingui/react/macro";
import {
  getCrashSendSnapshot,
  resetCrashSendState,
  subscribeCrashSend,
} from "../crash/send.ts";

/**
 * How long "Undo" stays available after the notice appears (FR-074).
 *
 * Exported so tests assert against the constant rather than restating 30000
 * (contracts/client-surface.md).
 */
export const CRASH_REPORT_UNDO_WINDOW_MS = 30_000;

export interface CrashNoticeProps {
  /**
   * Retract the report. Injected rather than imported so the notice has no
   * opinion about how retraction reaches the server, and tests need no network.
   *
   * TAKES NO ARGUMENTS, and used to take the issue number. The retract route now
   * reads its target out of the signed `retractionToken` rather than off the
   * request body (FR-074a), so the number this component can see is no longer
   * what identifies the report — passing it would imply this surface has a say
   * in which issue is retracted, and it does not.
   */
  onRetract?: () => void | Promise<void>;
}

export function CrashNotice({ onRetract }: CrashNoticeProps) {
  const { t } = useLingui();
  const state = useSyncExternalStore(subscribeCrashSend, getCrashSendSnapshot);
  const [undoExpired, setUndoExpired] = useState(false);
  const [retracted, setRetracted] = useState(false);

  const sent = state.status === "sent";

  useEffect(() => {
    if (!sent) return undefined;
    setUndoExpired(false);
    const timer = setTimeout(() => {
      setUndoExpired(true);
    }, CRASH_REPORT_UNDO_WINDOW_MS);
    return () => {
      clearTimeout(timer);
    };
  }, [sent, state.retractionToken]);

  // The stale-chunk carve-out already reloaded once and the failure recurred
  // inside the window, so the chunk is genuinely unreachable rather than stale
  // (FR-053). This is the only case that says "reloading didn't help".
  if (state.retryExhausted === true) {
    return (
      <div aria-live="polite" className="crash-notice">
        <p>
          <Trans id="crash.report.retry.notice">
            That part of the studio still can’t be reached. Reloading didn’t
            help, so this has been reported.
          </Trans>
        </p>
      </div>
    );
  }

  // A failed send is deliberately invisible (FR-078): the author already has a
  // real problem, and a second message about the telemetry helps nobody.
  if (!sent) return null;

  // Gated on the TOKEN, not on the issue number (FR-074a). Without a token there
  // is no request the client can make, so an Undo button would be one that
  // silently does nothing — the same failure the window's expiry exists to
  // avoid. A server that returned no token (an older build) therefore offers no
  // Undo rather than a broken one.
  const canUndo =
    !undoExpired &&
    !retracted &&
    state.retractionToken !== undefined &&
    onRetract !== undefined;

  const retract = (): void => {
    setRetracted(true);
    void Promise.resolve(onRetract?.()).catch(() => {
      // Retraction is best-effort, like the send itself. The confirmation
      // stands either way — telling the author their un-send failed would be
      // the third unactionable message in a row.
    });
  };

  return (
    <div aria-live="polite" className="crash-notice">
      {retracted ? (
        <p>
          <Trans id="crash.report.undo.confirmed">
            The report has been retracted.
          </Trans>
        </p>
      ) : (
        <>
          <p>
            <Trans id="crash.report.sent.notice">
              Something went wrong. A report has been sent so this can be fixed.
            </Trans>
          </p>

          {state.issueUrl !== undefined && (
            <p>
              <a href={state.issueUrl} target="_blank" rel="noreferrer noopener">
                <Trans id="crash.report.issue.link">View the report</Trans>
              </a>
            </p>
          )}

          {canUndo && (
            // "Undo — don't send this report", never "delete": an installation
            // token cannot delete an issue, and copy implying otherwise would
            // promise something the retraction path cannot deliver (FR-077).
            <button
              type="button"
              onClick={retract}
              aria-label={t({
                id: "crash.report.undo.button",
                message: "Undo — don’t send this report",
              })}
            >
              <Trans id="crash.report.undo.button">
                Undo — don’t send this report
              </Trans>
            </button>
          )}
        </>
      )}
    </div>
  );
}

/** Dismiss the notice. Exported so a host surface can clear it on navigation. */
export function dismissCrashNotice(): void {
  resetCrashSendState();
}

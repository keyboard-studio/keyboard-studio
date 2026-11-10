// ManagedPRSubmitPanel — Option B (org-mediated PR) submit UI.
//
// This is the PRIMARY submit action for the Output screen per
// docs/github-integration.md §1a. The user provides attribution (display name
// + email), confirms copyright, and clicks Submit. The studio POSTs the
// keyboard to the backend proxy which opens the PR via the org account and
// returns a PR URL. The user sees "your test submission was received" + the
// PR link — never a branch, fork, or PR thread.
//
// Identity prefill:
//   - GitHub session (provider:"github"): login name from useGitHubAuth.login;
//     email field starts empty for GitHub users to fill in (the SPA never holds
//     a GitHub user's email — only the identity sign-up scope was requested,
//     which does not guarantee email access).
//   - Google session (provider:"google"): name + email from the Google identity
//     claims stored in sessionStorage.
//   - No session: both fields start empty.
//
// The Submit button is disabled until:
//   1. displayName is non-empty.
//   2. email matches a basic RFC 5322 pattern.
//   3. The copyright attestation checkbox is checked.
//   4. A keyboard working copy is instantiated and the compile is ready.
//   5. Submission is not already in flight.
//   6. The output-time staleness gate (outputBlocked) is not tripped — e.g. a
//      stale touch-layout side-car after a post-Touch-step mechanics edit.
//
// VFS acquisition: at submit time the panel calls projectWorkingCopyForOutput()
// (the same helper handleDownload uses via serializeWorkingCopy) so the
// submitted tree is identical to what the download would contain. No VFS is
// held in component state between renders — it is projected on demand.

import { useCallback, useEffect, useId, useMemo, useState } from "react";
import { Trans, useLingui } from "@lingui/react/macro";
import type { PublishManagedPRError } from "@keyboard-studio/contracts";
import { emitOutputTree } from "../lib/emitAdapter.ts";
import { useGitHubAuth } from "../hooks/useGitHubAuth.ts";
import { useGoogleAuth } from "../hooks/useGoogleAuth.ts";
import {
  getGitHubOutputService,
  getManagedPROutputService,
  getManagedPRProxyEndpoint,
} from "../lib/services.ts";
import { isPublishPRError, publishPRErrorMessage } from "../lib/publishPRErrorMessage.ts";
import {
  publishManagedPRErrorMessage,
  isPublishManagedPRError,
} from "../lib/publishManagedPRErrorMessage.ts";
import { recordProjectSubmission } from "../lib/draftPersistence.ts";
import {
  generatePRBody,
  type PRBodyLintResults,
} from "../lib/generatePRBody.ts";
import { useTestingStore } from "../stores/testingStore.ts";
import { buildDecisionSummaryBlock } from "@keyboard-studio/engine";
import { snapshotDecisionRecord } from "../decisions/decisionLogStore.ts";
import type { RatchetGate } from "../criteria/openRatchet.ts";
import {
  buildReviewBlock,
  buildSourceBlock,
  type ReviewBlockInput,
} from "../criteria/openPrBlocks.ts";
import { readVfsText } from "../lib/vfsText.ts";
import { useWorkingCopyStore } from "../stores/workingCopyStore.ts";
import { replacesCuratedCopy } from "../lib/openSourceChoice.ts";
import { useReformatConsent } from "../hooks/useReformatConsent.ts";
import { ReformatConsentRequiredError } from "../lib/reformatConsentError.ts";
import { ReformatConsentDialog } from "./ReformatConsentDialog.tsx";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Basic email pattern — matches the common RFC 5322 shape. */
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

function isValidEmail(value: string): boolean {
  return EMAIL_RE.test(value.trim());
}

function isValidDisplayName(value: string): boolean {
  return value.trim().length > 0;
}

// ---------------------------------------------------------------------------
// Styles (inline, matching the Output screen's dark-theme conventions)
// ---------------------------------------------------------------------------

const FONT = "system-ui, -apple-system, 'Segoe UI', Roboto, sans-serif";

const sectionStyle: React.CSSProperties = {
  marginTop: 20,
  paddingTop: 16,
  borderTop: "1px solid var(--app-border)",
  display: "flex",
  flexDirection: "column",
  gap: 10,
};

const labelStyle: React.CSSProperties = {
  fontSize: 11,
  textTransform: "uppercase",
  letterSpacing: "0.08em",
  color: "var(--app-accent-text)",
  fontWeight: 700,
};

const fieldLabelStyle: React.CSSProperties = {
  fontSize: 12,
  color: "var(--app-text-subtle)",
  marginBottom: 3,
  display: "block",
};

const inputStyle: React.CSSProperties = {
  width: "100%",
  boxSizing: "border-box",
  padding: "6px 8px",
  background: "var(--app-bg)",
  color: "var(--app-text)",
  border: "1px solid var(--app-border)",
  borderRadius: 6,
  fontSize: 13,
  fontFamily: FONT,
  outline: "none",
};

const inputInvalidStyle: React.CSSProperties = {
  ...inputStyle,
  borderColor: "var(--app-danger)",
};

function submitButtonStyle(enabled: boolean): React.CSSProperties {
  return {
    alignSelf: "flex-start",
    marginTop: 4,
    padding: "8px 20px",
    background: enabled ? "var(--app-accent)" : "var(--app-surface)",
    color: enabled ? "var(--app-text-on-accent)" : "var(--app-text-disabled)",
    border: "1px solid var(--app-border)",
    borderRadius: 6,
    fontSize: 13,
    fontWeight: 600,
    cursor: enabled ? "pointer" : "not-allowed",
    fontFamily: FONT,
    transition: "background 0.15s",
  };
}

const successPanelStyle: React.CSSProperties = {
  padding: "12px 16px",
  background: "var(--app-success-bg)",
  border: "1px solid var(--app-success-border)",
  borderRadius: 6,
  fontSize: 13,
  color: "var(--app-success-text)",
  lineHeight: 1.6,
};

const HINT_STYLE: React.CSSProperties = { margin: 0, fontSize: 12, color: "var(--app-text-subtle)", lineHeight: 1.5 };

const errorStyle: React.CSSProperties = {
  fontSize: 12,
  color: "var(--app-danger-text)",
  marginTop: 4,
};

// ---------------------------------------------------------------------------
// Props
// ---------------------------------------------------------------------------

export interface ManagedPRSubmitPanelProps {
  /**
   * Whether the compile is ready and the working copy is instantiated, so a
   * submission can be triggered. The Submit button is also gated on form
   * validity, but this gate must additionally be true.
   */
  canSubmit: boolean;
  /**
   * Output-time staleness gate (e.g. a stale touch-layout side-car — a
   * mechanics edit after the Touch step was completed re-opens touch
   * staleness, and the emitted side-car would ship stale). When true the
   * Submit button is force-disabled regardless of form validity or
   * `canSubmit`. PublishStep renders the explanatory banner above this
   * panel; this panel only needs to explain itself via aria-label.
   */
  outputBlocked?: boolean;
  /**
   * Human-readable reason shown in the Submit button's aria-label when
   * `outputBlocked` is true. Required in practice whenever `outputBlocked`
   * is true, but kept optional so callers that never block don't need to
   * pass it.
   */
  outputBlockedReason?: string;
  /**
   * Prefill values from the established identity session.
   * Passed in from PublishStep which reads the auth hooks; the panel reacts
   * to changes via useEffect so signing in after the panel mounts prefills
   * the still-empty fields.
   */
  prefill?: {
    displayName?: string;
    email?: string;
  };
  /**
   * Lint/criteria results for the auto-generated PR body (#506, spec §12).
   * Passed in from PublishStep, which owns the artifact pipeline that
   * resolves them. The panel feeds them to generatePRBody and shows the
   * result as the editable default in the PR-description field. Optional:
   * a caller without results gets the "no lint results" body.
   */
  lintResults?: PRBodyLintResults;
  /**
   * Open mode (spec 111, US2): the ratchet gate and the review block's
   * content. Absent on Copy, which then submits exactly as before. The gate
   * blocks on a compile error, an unconfirmed red item or an unjustified new
   * failure, and never on a failure the keyboard already had.
   */
  openRatchet?: { gate: RatchetGate; review: ReviewBlockInput } | null;
}

/** The version a projected keyboard ships, read from its `.kmn`. */
function shippedVersionOf(
  vfs: Parameters<typeof readVfsText>[0],
  keyboardId: string,
): string | undefined {
  const kmn = readVfsText(vfs, `source/${keyboardId}.kmn`);
  const match =
    kmn !== undefined && kmn !== null
      ? /store\s*\(\s*&KEYBOARDVERSION\s*\)\s*['"]([^'"]*)['"]/i.exec(kmn)
      : null;
  return match?.[1];
}

// ---------------------------------------------------------------------------
// Submission state discriminated union
// ---------------------------------------------------------------------------

type SubmitRoute = "managed" | "own";

type SubmitState =
  | { kind: "idle" }
  | { kind: "submitting" }
  | { kind: "success"; prUrl: string }
  | { kind: "error"; message: string };

// ---------------------------------------------------------------------------
// Testing-phase notice
// ---------------------------------------------------------------------------

/**
 * Every submission path currently targets the studio's own testing copy of
 * the keyboards repository (`keyboard-studio/keyboards`), not
 * keymanapp/keyboards. Say so before the author submits. Exported so the
 * own-GitHub-account path shows the same words.
 */
export function TestingPhaseNotice() {
  return (
    <div
      role="note"
      data-testid="submit-testing-phase-notice"
      style={{
        padding: "8px 12px",
        background: "var(--app-warning-bg)",
        border: "1px solid var(--app-warning-border)",
        borderRadius: 6,
        fontSize: 12,
        lineHeight: 1.5,
        color: "var(--app-warning-text)",
      }}
    >
      <div style={{ fontWeight: 600 }}>
        {"[WARN] "}
        <Trans id="output.submit.testing.heading">Testing phase</Trans>
      </div>
      <Trans id="output.submit.testing.body">
        Submissions currently go to our testing copy of the keyboards repository
        (keyboard-studio/keyboards), not to the official Keyman repository. We use
        them to test the submission process; they are not published in Keyman.
      </Trans>{" "}
      <Trans id="output.submit.testing.comingSoon">
        Submitting to the official Keyman keyboards repository is coming soon.
      </Trans>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export function ManagedPRSubmitPanel({
  canSubmit,
  outputBlocked = false,
  outputBlockedReason,
  prefill,
  lintResults,
  openRatchet = null,
}: ManagedPRSubmitPanelProps) {
  const { t, i18n } = useLingui();
  const nameId = useId();
  const emailId = useId();
  const copyrightId = useId();
  const prBodyId = useId();
  const routeManagedId = useId();
  const routeOwnId = useId();

  // Self-contained useGitHubAuth() call (same idiom as MyKeyboardsList) so
  // this panel can transition the active "My keyboards" project to
  // status:"submitted" on a successful publish without threading the token
  // down as a prop. `accessToken` (the primitive, not the whole `token`
  // object) is what recordProjectSubmission below actually needs, and is
  // what the handleSubmit dependency array tracks.
  const { token, login: ghLogin, canSubmit: ghCanSelfSubmit, connect: connectGitHub } = useGitHubAuth();
  const accessToken = token?.accessToken ?? null;
  // Submitting requires a sign-in the server can check (spec 113 revision):
  // the Keyboard Studio session token from Google sign-in, else the GitHub
  // user token. A Google sign-in with no session token (backend without
  // SESSION_SIGNING_KEY) cannot submit; GitHub still can.
  const { identity: googleIdentity, sessionToken: googleSessionToken } = useGoogleAuth();
  const authToken = googleSessionToken ?? accessToken;
  const signedIn = authToken !== null;
  // Who opens the pull request: the studio's bot on the author's behalf
  // ("managed"), or the author's own GitHub account ("own", fork + PR).
  const [route, setRoute] = useState<SubmitRoute>("managed");
  const ownRoute = route === "own" && ghLogin !== null;

  const [authorName, setAuthorName] = useState<string>(
    prefill?.displayName ?? "",
  );
  const [email, setEmail] = useState<string>(prefill?.email ?? "");
  const [copyrightChecked, setCopyrightChecked] = useState(false);
  // #506: the author's edit of the PR-description field. Null means "not
  // edited yet" — the field then follows the generated default as lint
  // results and the copyright checkbox change. Once the author types, the
  // edit wins and regeneration never clobbers it (same dirty-field idiom
  // as the prefill effects below).
  const [prBodyEdited, setPrBodyEdited] = useState<string | null>(null);
  const [nameBlurred, setNameBlurred] = useState(false);
  const [emailBlurred, setEmailBlurred] = useState(false);
  const [submitState, setSubmitState] = useState<SubmitState>({ kind: "idle" });

  // When the prefill values change (e.g. user signs in after the panel mounts),
  // update the inputs — but only if the user has not manually edited them yet
  // (i.e. the field is still at its initial empty value).
  useEffect(() => {
    if (prefill?.displayName !== undefined && authorName === "") {
      setAuthorName(prefill.displayName);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [prefill?.displayName]);

  useEffect(() => {
    if (prefill?.email !== undefined && email === "") {
      setEmail(prefill.email);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [prefill?.email]);

  // #2050: the in-flight flag is transient — if this panel unmounts
  // (navigation away) mid-submit, clear it so a later mount never inherits a
  // stale flag and skips its confirm step.
  useEffect(
    () => () => {
      useTestingStore.getState().setSubmitInFlight(false);
    },
    [],
  );

  const nameValid = isValidDisplayName(authorName);
  const emailValid = isValidEmail(email);
  const formReady = nameValid && emailValid && copyrightChecked;
  const ratchetBlocked = openRatchet?.gate.blocked === true;
  const routeReady = ownRoute ? ghCanSelfSubmit && accessToken !== null : signedIn;
  const submitEnabled =
    formReady &&
    routeReady &&
    canSubmit &&
    !outputBlocked &&
    !ratchetBlocked &&
    submitState.kind !== "submitting";

  // Fallback text for outputBlockedReason — normally the caller (PublishStep)
  // always passes a localized reason when outputBlocked is true, but the prop
  // is optional so a caller that never blocks doesn't need to pass one.
  const blockedFallbackReason = t({
    id: "output.submit.button.ariaBlockedFallback",
    message: "output is currently blocked",
  });
  const effectiveBlockedReason = outputBlockedReason ?? blockedFallbackReason;

  // #506 (spec §12): the auto-generated PR body — green/yellow/red lint
  // checklist + copyright attestation — shown as the editable default in
  // the PR-description field below. Regenerated from the current lint
  // results and attestation state until the author edits the field.
  const generatedBody = useMemo(
    () =>
      generatePRBody(lintResults ?? { criteria: null, findings: [] }, {
        confirmed: copyrightChecked,
      }),
    [lintResults, copyrightChecked],
  );
  const prBodyDraft = prBodyEdited ?? generatedBody;

  const reformatConsent = useReformatConsent();

  const handleSubmit = useCallback(async () => {
    if (!submitEnabled) return;
    setSubmitState({ kind: "submitting" });
    // #2050: PublishHandover keeps this panel mounted while the flag is set,
    // so a new test build cannot unmount it (and drop this submission) mid-flight.
    useTestingStore.getState().setSubmitInFlight(true);

    try {
      // Project the working copy at submit time — identical to the download path.
      // Open (spec 111 FR-009): a file that cannot be updated in place waits
      // for the author's agreement; declining cancels the submission.
      const projected = await reformatConsent.guard(async (consented) => {
        const out = consented
          ? await emitOutputTree({ consentedReemit: true })
          : await emitOutputTree();
        if (out?.reformatRequired !== undefined && !consented) {
          throw new ReformatConsentRequiredError(out.reformatRequired);
        }
        return out;
      });
      if (projected === undefined) {
        setSubmitState({ kind: "idle" });
        return;
      }
      if (projected === null) {
        setSubmitState({
          kind: "error",
          message: t({
            id: "output.submit.error.nothingToSubmit",
            message: "Nothing to submit — select a keyboard first.",
          }),
        });
        return;
      }

      const { vfs, keyboardId, displayName } = projected;

      // Build the PR body — the backend prepends provenance and wraps
      // the title. The SPA provides the human description, the
      // auto-generated lint checklist + copyright attestation (#506,
      // generatePRBody; the author's edited draft when they changed it),
      // so the org bot's PR body is meaningful.
      //
      // The decision block (specs/053-decision-audit FR-018) is generated from
      // the record AS IT STANDS at this moment, not maintained incrementally as
      // the author works: a body assembled from a running buffer could describe
      // a state the submitted keyboard was never in. It is deliberately English
      // and unlocalized — the audience is a reviewer reading github.com, and
      // that is the established precedent for engine-built PR blocks. Omitted
      // entirely for a session that recorded nothing, rather than shipping an
      // empty heading.
      const decisionRecord = snapshotDecisionRecord();
      const decisionBlock =
        decisionRecord.entries.length === 0
          ? []
          : ["", "---", "", buildDecisionSummaryBlock(decisionRecord)];

      // Open (spec 111): say where the update came from, and what was kept or
      // inherited. English and unlocalized, like the decision block above.
      const openBlocks: string[] = [];
      const wc = useWorkingCopyStore.getState();
      if (wc.instantiationMode === "adapt-existing" && wc.startKeyboard !== null) {
        const fromVersion = wc.startIr?.header.version?.trim() || "1.0";
        const toVersion = shippedVersionOf(vfs, keyboardId) ?? fromVersion;
        // The pinned source (repository, commit, path) comes from the choice made
        // at Open; a draft that predates it falls back to upstream, no commit.
        const source = wc.startSource;
        openBlocks.push(
          "",
          buildSourceBlock({
            owner: source?.owner ?? "keymanapp",
            repo: source?.repo ?? "keyboards",
            ...(source !== null ? { shortSha: source.commit.slice(0, 7) } : {}),
            path: source?.path ?? wc.startKeyboard.path,
            fromVersion,
            toVersion,
            replacesCuratedSha:
              source !== null && replacesCuratedCopy(source)
                ? source.alternative?.commit.slice(0, 7)
                : undefined,
          }),
        );
        const reviewBlock =
          openRatchet !== null ? buildReviewBlock(openRatchet.review) : null;
        if (reviewBlock !== null) openBlocks.push("", reviewBlock);
      }

      const prBody = [
        `## ${displayName}`,
        "",
        // eslint-disable-next-line lingui/no-unlocalized-strings -- PR body is deliberately English: the audience is a reviewer reading github.com (see comment above).
        `Keyboard ID: \`${keyboardId}\``,
        "",
        "---",
        "",
        prBodyDraft,
        ...decisionBlock,
        ...openBlocks,
      ].join("\n");

      const prTitle =
        displayName.trim() !== "" ? displayName.trim() : keyboardId;

      let result: { prUrl: string };
      if (ownRoute && accessToken !== null && ghLogin !== null) {
        // Own account (Option A): fork keyboard-studio/keyboards to the
        // author's account, push a branch, open a draft PR in their name.
        // English and unlocalized, like the rest of the PR body.
        const fullTitle = prTitle.startsWith(`[${keyboardId}]`) ? prTitle : `[${keyboardId}] ${prTitle}`;
        const svc = await getGitHubOutputService();
        result = await svc.publishPR(vfs, {
          token: accessToken,
          forkOwner: ghLogin,
          branchName: `add/${keyboardId}-${Date.now().toString(36)}`,
          commitMessage: fullTitle,
          prTitle: fullTitle,
          prBody: [
            // eslint-disable-next-line lingui/no-unlocalized-strings -- PR body is deliberately English (see above).
            `> Submitted through **Keyboard Studio** by **${authorName.trim()}** (${email.trim()}) from their own GitHub account.`,
            "",
            prBody,
          ].join("\n"),
        });
      } else {
        const svc = await getManagedPROutputService();
        result = await svc.publishManagedPR(vfs, {
          attribution: {
            displayName: authorName.trim(),
            email: email.trim(),
          },
          keyboardId,
          prTitle,
          prBody,
          proxyEndpoint: getManagedPRProxyEndpoint(),
          ...(authToken !== null ? { authToken } : {}),
        });
      }
      setSubmitState({ kind: "success", prUrl: result.prUrl });

      // Transition the active "My keyboards" project to status:"submitted"
      // (per specs/072-my-keyboards) rather than leaving it as an
      // in-progress draft — see draftPersistence.ts's recordProjectSubmission
      // docstring. Fire-and-forget: this is bookkeeping for the "My
      // keyboards" list, not load-bearing for the success state already
      // rendered above.
      void recordProjectSubmission(result.prUrl, accessToken);
    } catch (err: unknown) {
      let message: string;
      if (ownRoute && isPublishPRError(err)) {
        message = publishPRErrorMessage(err, i18n);
      } else if (isPublishManagedPRError(err)) {
        message = publishManagedPRErrorMessage(err as PublishManagedPRError, i18n);
      } else {
        message =
          err instanceof Error
            ? err.message
            : t({
                id: "output.submit.error.unknown",
                message: "Submission failed. Please try again.",
              });
      }
      setSubmitState({ kind: "error", message });
    } finally {
      useTestingStore.getState().setSubmitInFlight(false);
    }
  }, [submitEnabled, authorName, email, t, i18n, accessToken, authToken, ownRoute, ghLogin, prBodyDraft, openRatchet, reformatConsent.guard]);

  // ---------------------------------------------------------------------------
  // Success state — show PR link, no git jargon.
  // ---------------------------------------------------------------------------

  if (submitState.kind === "success") {
    return (
      <section
        aria-label={t({ id: "output.submit.status.ariaLabel", message: "Submission status" })}
        style={sectionStyle}
      >
        <div style={labelStyle}>
          <Trans id="output.submit.sectionLabel">Submit to community repository</Trans>
        </div>
        <div style={successPanelStyle} role="status" aria-live="polite">
          <div style={{ fontWeight: 600, marginBottom: 6 }}>
            <Trans id="output.submit.success.heading.testing">Your test submission was received.</Trans>
          </div>
          <div style={{ fontSize: 12, color: "var(--app-text-subtle)" }}>
            <Trans id="output.submit.success.body.testing">
              It opened a pull request on our testing copy of the keyboards
              repository. It will not be published in Keyman yet.{" "}
              <a
                href={submitState.prUrl}
                target="_blank"
                rel="noopener noreferrer"
                style={{ color: "var(--app-accent-text)" }}
                aria-label={t({
                  id: "output.submit.success.linkAriaLabel",
                  message: "View your keyboard submission",
                })}
              >
                View submission
              </a>
            </Trans>
          </div>
        </div>
      </section>
    );
  }

  // ---------------------------------------------------------------------------
  // Form state — attribution form + submit button.
  // ---------------------------------------------------------------------------

  const isSubmitting = submitState.kind === "submitting";

  return (
    <section
      aria-label={t({ id: "output.submit.sectionAriaLabel", message: "Submit to community repository" })}
      style={sectionStyle}
    >
      <ReformatConsentDialog {...reformatConsent.dialog} />
      <div style={labelStyle}>
        <Trans id="output.submit.sectionLabel">Submit to community repository</Trans>
      </div>
      <p style={{ margin: 0, fontSize: 12, color: "var(--app-text-subtle)", lineHeight: 1.5 }}>
        <Trans id="output.submit.intro">
          Provide your name and email for attribution, confirm the copyright
          statement, and submit. We handle the technical side.
        </Trans>
      </p>
      <TestingPhaseNotice />

      {/* A server-checkable sign-in is required to submit. */}
      {!signedIn && (
        <p role="status" data-testid="submit-sign-in-required" style={{ margin: 0, fontSize: 12, color: "var(--app-warning-text)", lineHeight: 1.5 }}>
          {"[WARN] "}
          {googleIdentity !== null ? (
            <Trans id="output.submit.signIn.googleUnavailable">
              Submitting with a Google sign-in is not available on this server yet.
              Sign in with GitHub to submit.
            </Trans>
          ) : (
            <Trans id="output.submit.signIn.required">
              Sign in with GitHub or Google to submit, so reviewers know who sent
              the keyboard.
            </Trans>
          )}
        </p>
      )}

      {/* With a GitHub sign-in, the author may open the PR themselves. */}
      {ghLogin !== null && (
        <fieldset
          data-testid="submit-route"
          disabled={isSubmitting}
          style={{ margin: 0, padding: "8px 12px", border: "1px solid var(--app-border)", borderRadius: 6, display: "flex", flexDirection: "column", gap: 6 }}
        >
          <legend style={fieldLabelStyle}>
            <Trans id="output.submit.route.legend">Who opens the pull request</Trans>
          </legend>
          <div style={{ display: "flex", gap: 8, alignItems: "flex-start", fontSize: 13 }}>
            <input
              id={routeManagedId}
              type="radio"
              name="submit-route"
              value="managed"
              checked={route === "managed"}
              onChange={() => { setRoute("managed"); }}
              style={{ marginTop: 3 }}
            />
            <label htmlFor={routeManagedId}>
              <Trans id="output.submit.route.managed">Keyboard Studio, on my behalf</Trans>
              <br />
              <span style={{ fontSize: 12, color: "var(--app-text-muted)" }}>
                <Trans id="output.submit.route.managed.help">
                  Easiest. Our account opens the pull request and names you as the author.
                </Trans>
              </span>
            </label>
          </div>
          <div style={{ display: "flex", gap: 8, alignItems: "flex-start", fontSize: 13 }}>
            <input
              id={routeOwnId}
              type="radio"
              name="submit-route"
              value="own"
              checked={route === "own"}
              onChange={() => { setRoute("own"); }}
              style={{ marginTop: 3 }}
            />
            <label htmlFor={routeOwnId}>
              <Trans id="output.submit.route.own">My own GitHub account (@{ghLogin})</Trans>
              <br />
              <span style={{ fontSize: 12, color: "var(--app-text-muted)" }}>
                <Trans id="output.submit.route.own.help">
                  The pull request is yours: it is opened from a fork in your account,
                  and you answer reviewers on GitHub.
                </Trans>
              </span>
            </label>
          </div>
          {route === "own" && !ghCanSelfSubmit && (
            <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
              <p style={HINT_STYLE}>
                <Trans id="output.submit.route.own.permission">
                  To open a pull request from your account, Keyboard Studio needs your
                  permission to fork the keyboards repository and push a branch.
                </Trans>
              </p>
              <button
                type="button"
                data-testid="submit-own-grant"
                onClick={() => { void connectGitHub("submit"); }}
                style={{ ...submitButtonStyle(true), marginTop: 0 }}
              >
                <Trans id="output.submit.route.own.grant">Give permission on GitHub</Trans>
              </button>
            </div>
          )}
        </fieldset>
      )}

      {/* Author display name */}
      <div>
        <label htmlFor={nameId} style={fieldLabelStyle}>
          <Trans id="output.submit.name.label">Your name (for attribution)</Trans>
        </label>
        <input
          id={nameId}
          type="text"
          value={authorName}
          autoComplete="name"
          aria-required="true"
          aria-invalid={nameBlurred && !nameValid ? true : undefined}
          aria-describedby={
            nameBlurred && !nameValid ? `${nameId}-err` : undefined
          }
          onChange={(e) => {
            setAuthorName(e.target.value);
          }}
          onBlur={() => {
            setNameBlurred(true);
          }}
          style={nameBlurred && !nameValid ? inputInvalidStyle : inputStyle}
          disabled={isSubmitting}
          placeholder={t({ id: "output.submit.name.placeholder", message: "Your name" })}
        />
        {nameBlurred && !nameValid && (
          <div id={`${nameId}-err`} role="alert" style={errorStyle}>
            <Trans id="output.submit.name.error">Name is required.</Trans>
          </div>
        )}
      </div>

      {/* Email */}
      <div>
        <label htmlFor={emailId} style={fieldLabelStyle}>
          <Trans id="output.submit.email.label">Email address (for attribution)</Trans>
        </label>
        <input
          id={emailId}
          type="email"
          value={email}
          autoComplete="email"
          aria-required="true"
          aria-invalid={emailBlurred && !emailValid ? true : undefined}
          aria-describedby={
            emailBlurred && !emailValid ? `${emailId}-err` : undefined
          }
          onChange={(e) => {
            setEmail(e.target.value);
          }}
          onBlur={() => {
            setEmailBlurred(true);
          }}
          style={emailBlurred && !emailValid ? inputInvalidStyle : inputStyle}
          disabled={isSubmitting}
          placeholder="you@example.com"
        />
        {emailBlurred && !emailValid && (
          <div id={`${emailId}-err`} role="alert" style={errorStyle}>
            <Trans id="output.submit.email.error">A valid email address is required.</Trans>
          </div>
        )}
      </div>

      {/* Copyright attestation */}
      <div style={{ display: "flex", alignItems: "flex-start", gap: 8 }}>
        <input
          id={copyrightId}
          type="checkbox"
          checked={copyrightChecked}
          onChange={(e) => {
            setCopyrightChecked(e.target.checked);
          }}
          aria-required="true"
          disabled={isSubmitting}
          style={{
            marginTop: 2,
            flexShrink: 0,
            cursor: isSubmitting ? "not-allowed" : "pointer",
          }}
        />
        <label
          htmlFor={copyrightId}
          style={{
            fontSize: 12,
            color: "var(--app-text-subtle)",
            lineHeight: 1.5,
            cursor: isSubmitting ? "not-allowed" : "pointer",
          }}
        >
          <Trans id="output.submit.copyright.label">
            I confirm I am the copyright holder or am authorized to submit this
            keyboard to the community repository.
          </Trans>
        </label>
      </div>

      {/* #506: auto-generated PR body (spec §12) as an editable default.
          Regenerates from the lint results until the author edits it. */}
      <div>
        <label htmlFor={prBodyId} style={fieldLabelStyle}>
          <Trans id="output.submit.prBody.label">
            Pull request description (generated from your checks — you can edit it)
          </Trans>
        </label>
        <textarea
          id={prBodyId}
          value={prBodyDraft}
          onChange={(e) => {
            setPrBodyEdited(e.target.value);
          }}
          rows={10}
          disabled={isSubmitting}
          style={{
            ...inputStyle,
            fontFamily: "ui-monospace, SFMono-Regular, Menlo, monospace",
            fontSize: 12,
            lineHeight: 1.5,
            resize: "vertical",
          }}
        />
      </div>

      {/* Spec 095 FR-004: the permanence disclosure sits at the confirm
          step itself, not behind a link — submitting publishes the
          author's name and email into public git history, and that fact
          must be in the same view as the button that does it. */}
      <p
        style={{
          margin: 0,
          fontSize: 12,
          lineHeight: 1.5,
          color: "var(--app-text-subtle)",
          border: "1px solid var(--app-border)",
          borderRadius: 6,
          padding: "8px 10px",
        }}
      >
        <Trans id="output.submit.permanence">
          Submitting publishes your keyboard as a public pull request. Your name and
          email address become part of that submission, and once it is merged they
          are part of the repository&rsquo;s permanent public history — they cannot
          be removed from it later.
        </Trans>
      </p>

      {/* Open ratchet (spec 111): say what blocks, in plain words. */}
      {openRatchet !== null && openRatchet.gate.blocked && (
        <ul
          data-testid="open-ratchet-blockers"
          style={{ margin: 0, paddingLeft: 18, fontSize: 12, color: "var(--app-danger-text)" }}
        >
          {openRatchet.gate.reasons.includes("compile-error") && (
            <li>
              <Trans id="output.submit.ratchet.compileError">
                The keyboard does not compile. Fix the error first.
              </Trans>
            </li>
          )}
          {openRatchet.gate.reasons.includes("unconfirmed-red") && (
            <li>
              <Trans id="output.submit.ratchet.unconfirmedRed">
                A criterion still needs your confirmation on the criteria page.
              </Trans>
            </li>
          )}
          {openRatchet.gate.reasons.includes("unjustified-new-failure") && (
            <li>
              <Trans id="output.submit.ratchet.newFailure">
                This update introduced a criteria failure with no reason noted. Fix it
                or write why it stays, on the criteria page.
              </Trans>
            </li>
          )}
        </ul>
      )}

      {/* Submit button */}
      <button
        type="button"
        disabled={!submitEnabled}
        onClick={() => {
          void handleSubmit();
        }}
        aria-label={
          ratchetBlocked
            ? t({
                id: "output.submit.button.ariaRatchetBlocked",
                message: "Submit unavailable until the criteria review items below are resolved",
              })
            : outputBlocked
            ? t({
                id: "output.submit.button.ariaBlocked",
                message: `Submit unavailable — ${effectiveBlockedReason}`,
              })
            : !canSubmit
              ? t({
                  id: "output.submit.button.ariaNotReady",
                  message: "Submit unavailable until the keyboard compile is complete",
                })
              : !routeReady
                ? ownRoute
                  ? t({
                      id: "output.submit.button.ariaOwnNeedsPermission",
                      message: "Submit unavailable until you give permission on GitHub",
                    })
                  : t({
                      id: "output.submit.button.ariaSignInRequired",
                      message: "Submit unavailable until you sign in with GitHub or Google",
                    })
              : !formReady
                ? t({
                    id: "output.submit.button.ariaFormIncomplete",
                    message: "Fill in your name, email, and copyright confirmation to submit",
                  })
                : ownRoute
                  ? t({
                      id: "output.submit.button.ariaReadyOwn",
                      message: "Submit keyboard from my GitHub account",
                    })
                  : t({
                      id: "output.submit.button.ariaReady",
                      message: "Submit keyboard to community repository",
                    })
        }
        style={submitButtonStyle(submitEnabled)}
      >
        {isSubmitting ? (
          <Trans id="output.submit.button.submitting">Submitting...</Trans>
        ) : ownRoute ? (
          <Trans id="output.submit.button.submitOwn">Submit from my GitHub account</Trans>
        ) : (
          <Trans id="output.submit.button.submit">Submit to community repository</Trans>
        )}
      </button>

      {/* Error state */}
      {submitState.kind === "error" && (
        <div role="alert" aria-live="polite" style={errorStyle}>
          {submitState.message}{" "}
          <button
            type="button"
            onClick={() => {
              setSubmitState({ kind: "idle" });
            }}
            style={{
              background: "none",
              border: "none",
              padding: 0,
              color: "var(--app-danger-text)",
              textDecoration: "underline",
              cursor: "pointer",
              font: "inherit",
              fontSize: 12,
            }}
          >
            <Trans id="output.submit.error.dismiss">Dismiss</Trans>
          </button>
        </div>
      )}
    </section>
  );
}

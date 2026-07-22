// ManagedPRSubmitPanel — Option B (org-mediated PR) submit UI.
//
// This is the PRIMARY submit action for the Output screen per
// docs/github-integration.md §1a. The user provides attribution (display name
// + email), confirms copyright, and clicks Submit. The studio POSTs the
// keyboard to the backend proxy which opens the PR via the org account and
// returns a PR URL. The user sees "your submission is being reviewed" + the
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

import { useCallback, useEffect, useId, useState } from "react";
import { Trans, useLingui } from "@lingui/react/macro";
import type { PublishManagedPRError } from "@keyboard-studio/contracts";
import { projectWorkingCopyForOutput } from "../lib/serializeWorkingCopy.ts";
import { getManagedPROutputService, getManagedPRProxyEndpoint } from "../lib/services.ts";
import {
  publishManagedPRErrorMessage,
  isPublishManagedPRError,
} from "../lib/publishManagedPRErrorMessage.ts";

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
  borderTop: "1px solid #283040",
  display: "flex",
  flexDirection: "column",
  gap: 10,
};

const labelStyle: React.CSSProperties = {
  fontSize: 11,
  textTransform: "uppercase",
  letterSpacing: "0.08em",
  color: "#6ea8fe",
  fontWeight: 700,
};

const fieldLabelStyle: React.CSSProperties = {
  fontSize: 12,
  color: "#9aa7b8",
  marginBottom: 3,
  display: "block",
};

const inputStyle: React.CSSProperties = {
  width: "100%",
  boxSizing: "border-box",
  padding: "6px 8px",
  background: "#0d1117",
  color: "#e6edf3",
  border: "1px solid #30363d",
  borderRadius: 6,
  fontSize: 13,
  fontFamily: FONT,
  outline: "none",
};

const inputInvalidStyle: React.CSSProperties = {
  ...inputStyle,
  borderColor: "#f0a0a0",
};

function submitButtonStyle(enabled: boolean): React.CSSProperties {
  return {
    alignSelf: "flex-start",
    marginTop: 4,
    padding: "8px 20px",
    background: enabled ? "#1f6feb" : "#161b22",
    color: enabled ? "#e6edf3" : "#484f58",
    border: "1px solid #283040",
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
  background: "#0f2a1a",
  border: "1px solid #2ea043",
  borderRadius: 6,
  fontSize: 13,
  color: "#7ee787",
  lineHeight: 1.6,
};

const errorStyle: React.CSSProperties = {
  fontSize: 12,
  color: "#f0a0a0",
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
   * `canSubmit`. OutputScreen renders the explanatory banner above this
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
   * Passed in from OutputScreen which reads the auth hooks; the panel reacts
   * to changes via useEffect so signing in after the panel mounts prefills
   * the still-empty fields.
   */
  prefill?: {
    displayName?: string;
    email?: string;
  };
}

// ---------------------------------------------------------------------------
// Submission state discriminated union
// ---------------------------------------------------------------------------

type SubmitState =
  | { kind: "idle" }
  | { kind: "submitting" }
  | { kind: "success"; prUrl: string }
  | { kind: "error"; message: string };

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export function ManagedPRSubmitPanel({
  canSubmit,
  outputBlocked = false,
  outputBlockedReason,
  prefill,
}: ManagedPRSubmitPanelProps) {
  const { t } = useLingui();
  const nameId = useId();
  const emailId = useId();
  const copyrightId = useId();

  const [authorName, setAuthorName] = useState<string>(
    prefill?.displayName ?? "",
  );
  const [email, setEmail] = useState<string>(prefill?.email ?? "");
  const [copyrightChecked, setCopyrightChecked] = useState(false);
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

  const nameValid = isValidDisplayName(authorName);
  const emailValid = isValidEmail(email);
  const formReady = nameValid && emailValid && copyrightChecked;
  const submitEnabled =
    formReady && canSubmit && !outputBlocked && submitState.kind !== "submitting";

  // Fallback text for outputBlockedReason — normally the caller (OutputScreen)
  // always passes a localized reason when outputBlocked is true, but the prop
  // is optional so a caller that never blocks doesn't need to pass one.
  const blockedFallbackReason = t({
    id: "output.submit.button.ariaBlockedFallback",
    message: "output is currently blocked",
  });
  const effectiveBlockedReason = outputBlockedReason ?? blockedFallbackReason;

  const handleSubmit = useCallback(async () => {
    if (!submitEnabled) return;
    setSubmitState({ kind: "submitting" });

    try {
      // Project the working copy at submit time — identical to the download path.
      const projected = await projectWorkingCopyForOutput();
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

      // Build a minimal PR body — the backend prepends provenance and wraps
      // the title. The SPA provides the human description and copyright
      // attestation so the org bot's PR body is meaningful.
      const prBody = [
        `## ${displayName}`,
        "",
        `Keyboard ID: \`${keyboardId}\``,
        "",
        "---",
        "",
        "**Copyright attestation:** The submitter has confirmed they are the copyright holder or are authorized to submit this keyboard to the community repository.",
      ].join("\n");

      const prTitle =
        displayName.trim() !== "" ? displayName.trim() : keyboardId;

      const svc = await getManagedPROutputService();
      const result = await svc.publishManagedPR(vfs, {
        attribution: {
          displayName: authorName.trim(),
          email: email.trim(),
        },
        keyboardId,
        prTitle,
        prBody,
        proxyEndpoint: getManagedPRProxyEndpoint(),
      });
      setSubmitState({ kind: "success", prUrl: result.prUrl });
    } catch (err: unknown) {
      let message: string;
      if (isPublishManagedPRError(err)) {
        message = publishManagedPRErrorMessage(err as PublishManagedPRError);
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
    }
  }, [submitEnabled, authorName, email, t]);

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
            <Trans id="output.submit.success.heading">Your submission is being reviewed.</Trans>
          </div>
          <div style={{ fontSize: 12, color: "#9aa7b8" }}>
            <Trans id="output.submit.success.body">
              The keyboard studio team will review your keyboard and may reach out
              via the email you provided.{" "}
              <a
                href={submitState.prUrl}
                target="_blank"
                rel="noopener noreferrer"
                style={{ color: "#6ea8fe" }}
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
      <div style={labelStyle}>
        <Trans id="output.submit.sectionLabel">Submit to community repository</Trans>
      </div>
      <p style={{ margin: 0, fontSize: 12, color: "#9aa7b8", lineHeight: 1.5 }}>
        <Trans id="output.submit.intro">
          Provide your name and email for attribution, confirm the copyright
          statement, and submit. We handle the technical side.
        </Trans>
      </p>

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
            color: "#9aa7b8",
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

      {/* Submit button */}
      <button
        type="button"
        disabled={!submitEnabled}
        onClick={() => {
          void handleSubmit();
        }}
        aria-label={
          outputBlocked
            ? t({
                id: "output.submit.button.ariaBlocked",
                message: `Submit unavailable — ${effectiveBlockedReason}`,
              })
            : !canSubmit
              ? t({
                  id: "output.submit.button.ariaNotReady",
                  message: "Submit unavailable until the keyboard compile is complete",
                })
              : !formReady
                ? t({
                    id: "output.submit.button.ariaFormIncomplete",
                    message: "Fill in your name, email, and copyright confirmation to submit",
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
              color: "#f0a0a0",
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

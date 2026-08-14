// AccountControl — right-aligned identity control rendered in the NavBar on
// every route except "welcome" (which has its own sign-in buttons).
//
// Three render states:
//   isVerifying → neutral dim placeholder (prevents flicker on mount)
//   isSignedIn  → circular avatar button showing the user's initial; click
//                 opens a dropdown with display name + "Sign out"
//   guest       → "Sign in" button; click opens a popover with two provider
//                 buttons (GitHub / Google) that call the same connect() flow
//                 used on the Welcome screen and in SignUpPanel
//
// Outside-click and Escape dismissal, plus the open/close focus handoff, are
// shared with SurveyResetButton via useDismissablePopover (issue #1513).

import { useRef, useState } from "react";
import { Trans, useLingui } from "@lingui/react/macro";
import { useIdentitySession } from "../hooks/useIdentitySession.ts";
import { navigateTo } from "../lib/navigate.ts";
import { GitHubMark, GoogleMark } from "./ProviderMarks.tsx";
import {
  BORDER,
  ACCENT,
  TEXT_DIM,
  TEXT_MAIN,
  FONT,
} from "../lib/galleryTheme.ts";
import { ERROR_TEXT } from "../ui/theme.ts";
import {
  useDismissablePopover,
  POPOVER_PANEL_STYLE,
} from "../ui/useDismissablePopover.ts";

// ---------------------------------------------------------------------------
// Shared style helpers
// ---------------------------------------------------------------------------

const AVATAR_SIZE = 32;

const avatarButtonStyle: React.CSSProperties = {
  width: AVATAR_SIZE,
  height: AVATAR_SIZE,
  borderRadius: "50%",
  background: ACCENT,
  color: "var(--app-text-on-accent)",
  border: "none",
  cursor: "pointer",
  fontFamily: FONT,
  fontSize: 14,
  fontWeight: 700,
  display: "flex",
  alignItems: "center",
  justifyContent: "center",
  flexShrink: 0,
  lineHeight: 1,
};

const signInButtonStyle: React.CSSProperties = {
  padding: "5px 12px",
  background: "transparent",
  color: TEXT_MAIN,
  border: `1px solid ${BORDER}`,
  borderRadius: 6,
  fontSize: 13,
  fontWeight: 500,
  cursor: "pointer",
  fontFamily: FONT,
  whiteSpace: "nowrap",
};

/** Dropdown / popover panel anchored below-right of the trigger. */
const panelStyle: React.CSSProperties = {
  ...POPOVER_PANEL_STYLE,
  minWidth: 200,
  padding: "8px 0",
};

const menuItemStyle: React.CSSProperties = {
  display: "block",
  width: "100%",
  padding: "8px 16px",
  background: "transparent",
  border: "none",
  textAlign: "left",
  cursor: "pointer",
  fontFamily: FONT,
  fontSize: 13,
  color: TEXT_MAIN,
};

const dimTextStyle: React.CSSProperties = {
  padding: "8px 16px 4px",
  fontSize: 12,
  color: TEXT_DIM,
  fontFamily: FONT,
  whiteSpace: "nowrap",
  overflow: "hidden",
  textOverflow: "ellipsis",
  maxWidth: 240,
};

const dividerStyle: React.CSSProperties = {
  height: 1,
  background: BORDER,
  margin: "4px 0",
};

const githubProviderButtonStyle: React.CSSProperties = {
  display: "inline-flex",
  alignItems: "center",
  gap: 8,
  width: "calc(100% - 32px)",
  margin: "4px 16px",
  padding: "8px 12px",
  background: "#238636", // GitHub brand green
  color: "var(--app-text-on-accent)",
  border: "1px solid #2ea043", // GitHub brand green (border)
  borderRadius: 6,
  fontSize: 13,
  fontWeight: 600,
  cursor: "pointer",
  fontFamily: FONT,
};

const googleProviderButtonStyle: React.CSSProperties = {
  display: "inline-flex",
  alignItems: "center",
  gap: 8,
  width: "calc(100% - 32px)",
  margin: "4px 16px",
  padding: "8px 12px",
  background: "#1a73e8", // Google brand blue
  color: "var(--app-text-on-accent)",
  border: "1px solid #1a73e8", // Google brand blue (border)
  borderRadius: 6,
  fontSize: 13,
  fontWeight: 600,
  cursor: "pointer",
  fontFamily: FONT,
};

const errorStyle: React.CSSProperties = {
  padding: "4px 16px",
  fontSize: 12,
  color: ERROR_TEXT,
  fontFamily: FONT,
};

/**
 * Fixed transparent backdrop — sits below the panel, swallows outside
 * clicks so they don't also activate whatever is rendered behind it.
 * useDismissablePopover's document-pointerdown listener closes the panel on
 * an outside click, but has no DOM presence of its own to intercept that
 * click before it reaches the element underneath — this restores the
 * click-catcher both AccountControl popovers had before that hook existed.
 */
const modalBackdropStyle: React.CSSProperties = {
  position: "fixed",
  inset: 0,
  zIndex: 199,
};

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export function AccountControl() {
  const { t } = useLingui();
  const {
    isSignedIn,
    isVerifying,
    displayName,
    initial,
    github,
    google,
    signOut,
  } = useIdentitySession();

  const [open, setOpen] = useState(false);

  // Ref wrapping trigger + panel — a pointerdown outside it closes.
  const containerRef = useRef<HTMLDivElement>(null);
  // Ref to the trigger button — used to return focus on panel close.
  const triggerRef = useRef<HTMLButtonElement>(null);
  // Ref to the open panel — used to move focus into it on open.
  const panelRef = useRef<HTMLDivElement>(null);

  const close = () => setOpen(false);
  const toggle = () => setOpen((v) => !v);

  useDismissablePopover(open, {
    containerRef,
    onClose: close,
    panelRef,
    triggerRef,
  });

  // During the initial token-verify pass, render a neutral dim placeholder so
  // the control does not flicker between the guest and signed-in states.
  if (isVerifying) {
    return (
      <div
        style={{
          width: AVATAR_SIZE,
          height: AVATAR_SIZE,
          borderRadius: "50%",
          background: "var(--app-surface-2)",
          flexShrink: 0,
        }}
        aria-hidden="true"
      />
    );
  }

  if (isSignedIn) {
    const label =
      displayName !== null
        ? t({
            id: "account.avatar.ariaLabel.named",
            message: `Account: ${displayName}`,
          })
        : t({
            id: "account.avatar.ariaLabel.generic",
            message: "Account menu",
          });
    return (
      <div ref={containerRef} style={{ position: "relative", flexShrink: 0 }}>
        <button
          ref={triggerRef}
          type="button"
          onClick={toggle}
          style={avatarButtonStyle}
          aria-label={label}
          aria-expanded={open}
          aria-haspopup="menu"
        >
          {initial ?? "?"}
        </button>

        {open && (
          <>
            {/* Transparent backdrop — click outside to close, and to swallow the click */}
            <div style={modalBackdropStyle} onClick={close} aria-hidden="true" />

            <div ref={panelRef} role="menu" style={panelStyle}>
              {displayName !== null && (
                <div style={dimTextStyle} role="none">
                  {displayName}
                </div>
              )}
              <div style={dividerStyle} role="none" />
              <button
                type="button"
                role="menuitem"
                style={menuItemStyle}
                onClick={() => {
                  navigateTo("profile");
                  close();
                }}
              >
                <Trans id="account.menu.profile">Profile</Trans>
              </button>
              <button
                type="button"
                role="menuitem"
                style={menuItemStyle}
                onClick={() => {
                  signOut();
                  close();
                }}
              >
                <Trans id="account.menu.signOut">Sign out</Trans>
              </button>
            </div>
          </>
        )}
      </div>
    );
  }

  // Guest state — "Sign in" button + provider popover
  return (
    <div ref={containerRef} style={{ position: "relative", flexShrink: 0 }}>
      <button
        ref={triggerRef}
        type="button"
        onClick={toggle}
        style={signInButtonStyle}
        aria-expanded={open}
        aria-haspopup="dialog"
      >
        <Trans id="account.signIn.trigger">Sign in</Trans>
      </button>

      {open && (
        <>
          {/* Transparent backdrop — click outside to close, and to swallow the click */}
          <div style={modalBackdropStyle} onClick={close} aria-hidden="true" />

          <div
            ref={panelRef}
            role="dialog"
            aria-label={t({
              id: "account.signIn.dialogAriaLabel",
              message: "Sign in options",
            })}
            aria-modal="true"
            style={panelStyle}
          >
            <button
              type="button"
              style={githubProviderButtonStyle}
              onClick={() => {
                void github.connect("identity");
                // connect() redirects; no need to close
              }}
            >
              <GitHubMark />
              <Trans id="account.signIn.github">Sign in with GitHub</Trans>
            </button>

            <button
              type="button"
              style={googleProviderButtonStyle}
              onClick={() => {
                void google.connect();
                // connect() redirects; no need to close
              }}
            >
              <GoogleMark />
              <Trans id="account.signIn.google">Sign in with Google</Trans>
            </button>

            {github.error !== null && (
              <div role="alert" style={errorStyle}>
                {github.error}
              </div>
            )}
            {google.error !== null && (
              <div role="alert" style={errorStyle}>
                {google.error}
              </div>
            )}
          </div>
        </>
      )}
    </div>
  );
}

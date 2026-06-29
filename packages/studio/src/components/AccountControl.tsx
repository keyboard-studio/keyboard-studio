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
// Outside-click handling uses a fixed transparent backdrop <div> behind the
// open panel — a CSP-safe, zero-dependency pattern consistent with how other
// overlay controls work in the codebase.

import { useEffect, useRef, useState } from "react";
import { useIdentitySession } from "../hooks/useIdentitySession.ts";
import { navigateTo } from "../lib/navigate.ts";
import { GitHubMark, GoogleMark } from "./ProviderMarks.tsx";
import {
  BG_CARD,
  BORDER,
  ACCENT,
  TEXT_DIM,
  TEXT_MAIN,
  FONT,
} from "../lib/galleryTheme.ts";
import { ERROR_TEXT } from "../ui/theme.ts";

// ---------------------------------------------------------------------------
// Shared style helpers
// ---------------------------------------------------------------------------

const AVATAR_SIZE = 32;

const avatarButtonStyle: React.CSSProperties = {
  width: AVATAR_SIZE,
  height: AVATAR_SIZE,
  borderRadius: "50%",
  background: ACCENT,
  color: "#0d1117",
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
  position: "absolute",
  top: "calc(100% + 6px)",
  right: 0,
  minWidth: 200,
  background: BG_CARD,
  border: `1px solid ${BORDER}`,
  borderRadius: 8,
  padding: "8px 0",
  boxShadow: "0 8px 24px rgba(0,0,0,0.5)",
  zIndex: 200,
};

/** Fixed transparent backdrop — sits below the panel, swallows outside clicks. */
const backdropStyle: React.CSSProperties = {
  position: "fixed",
  inset: 0,
  zIndex: 199,
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
  background: "#238636",
  color: "#e6edf3",
  border: "1px solid #2ea043",
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
  background: "#1a73e8",
  color: "#ffffff",
  border: "1px solid #1a73e8",
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

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export function AccountControl() {
  const { isSignedIn, isVerifying, displayName, initial, github, google, signOut } =
    useIdentitySession();

  const [open, setOpen] = useState(false);

  // Ref to the trigger button — used to return focus on panel close.
  const triggerRef = useRef<HTMLButtonElement>(null);
  // Ref to the open panel — used to move focus into it on open.
  const panelRef = useRef<HTMLDivElement>(null);

  const close = () => setOpen(false);
  const toggle = () => setOpen((v) => !v);

  // Move focus into the panel when it opens; return focus to trigger on close.
  useEffect(() => {
    if (open) {
      // Focus the first focusable element in the panel (first button).
      const firstFocusable = panelRef.current?.querySelector<HTMLElement>(
        "button, [href], input, select, textarea, [tabindex]:not([tabindex='-1'])",
      );
      firstFocusable?.focus();
    } else {
      // Return focus to the trigger when the panel closes.
      triggerRef.current?.focus();
    }
  }, [open]);

  // Escape key closes the open panel from anywhere on the document.
  useEffect(() => {
    if (!open) return;
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        close();
      }
    };
    document.addEventListener("keydown", handleKeyDown);
    return () => {
      document.removeEventListener("keydown", handleKeyDown);
    };
  }, [open]);

  // During the initial token-verify pass, render a neutral dim placeholder so
  // the control does not flicker between the guest and signed-in states.
  if (isVerifying) {
    return (
      <div
        style={{
          width: AVATAR_SIZE,
          height: AVATAR_SIZE,
          borderRadius: "50%",
          background: "#283040",
          flexShrink: 0,
        }}
        aria-hidden="true"
      />
    );
  }

  if (isSignedIn) {
    const label =
      displayName !== null ? `Account: ${displayName}` : "Account menu";
    return (
      <div style={{ position: "relative", flexShrink: 0 }}>
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
            {/* Transparent backdrop — click outside to close */}
            <div style={backdropStyle} onClick={close} aria-hidden="true" />

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
                Profile
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
                Sign out
              </button>
            </div>
          </>
        )}
      </div>
    );
  }

  // Guest state — "Sign in" button + provider popover
  return (
    <div style={{ position: "relative", flexShrink: 0 }}>
      <button
        ref={triggerRef}
        type="button"
        onClick={toggle}
        style={signInButtonStyle}
        aria-expanded={open}
        aria-haspopup="dialog"
      >
        Sign in
      </button>

      {open && (
        <>
          {/* Transparent backdrop — click outside to close */}
          <div style={backdropStyle} onClick={close} aria-hidden="true" />

          <div
            ref={panelRef}
            role="dialog"
            aria-label="Sign in options"
            aria-modal="true"
            style={panelStyle}
          >
            <button
              type="button"
              style={githubProviderButtonStyle}
              onClick={() => {
                void github.connect();
                // connect() redirects; no need to close
              }}
            >
              <GitHubMark />
              Sign in with GitHub
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
              Sign in with Google
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

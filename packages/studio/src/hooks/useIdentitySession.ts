// useIdentitySession — lightweight composition of useGitHubAuth + useGoogleAuth.
//
// Derives a unified identity view from the two provider hooks without storing
// any new state. §A.2 "stores nothing new" — all data originates in the
// underlying hooks; this hook is a pure selector layer.
//
// A GitHub identity is established when status is "connected" OR "needs-scope"
// (the missing-scope distinction matters only for the fork+PR submit step).
// A Google identity is established when status is "connected".

import { useCallback } from "react";
import { useGitHubAuth } from "./useGitHubAuth.ts";
import { useGoogleAuth } from "./useGoogleAuth.ts";
import type { AuthFlow } from "../lib/githubOAuth.ts";

export interface IdentitySession {
  /** True when at least one provider has an established identity. */
  isSignedIn: boolean;
  /**
   * True while the GitHub token is being verified on mount. Used to render a
   * neutral placeholder so the control does not flicker between states.
   */
  isVerifying: boolean;
  /**
   * Human-readable display name. Priority: GitHub login → Google name →
   * Google email (when name is empty) → null.
   */
  displayName: string | null;
  /**
   * First character of displayName uppercased, or null when displayName is
   * null. Used as the avatar initial.
   */
  initial: string | null;
  /** GitHub provider surface — connect flow, link state, and any in-flight error. */
  github: {
    /** True when GitHub status is "connected" or "needs-scope". */
    linked: boolean;
    /** GitHub login name from the verified token, or null. */
    login: string | null;
    connect: (flow?: AuthFlow) => Promise<void>;
    disconnect: () => void;
    error: string | null;
  };
  /** Google provider surface — connect flow, link state, and any in-flight error. */
  google: {
    /** True when Google status is "connected". */
    linked: boolean;
    /** Display name from the Google identity, or null. */
    name: string | null;
    /** Email address from the Google identity, or null. */
    email: string | null;
    connect: () => Promise<void>;
    disconnect: () => void;
    error: string | null;
  };
  /** Sign out of both providers simultaneously. */
  signOut: () => void;
}

export function useIdentitySession(): IdentitySession {
  const {
    status: ghStatus,
    login,
    error: ghError,
    connect: ghConnect,
    disconnect: ghDisconnect,
  } = useGitHubAuth();

  const {
    status: googleStatus,
    identity: googleIdentity,
    error: googleError,
    connect: googleConnect,
    disconnect: googleDisconnect,
  } = useGoogleAuth();

  const ghSignedIn = ghStatus === "connected" || ghStatus === "needs-scope";
  const googleSignedIn = googleStatus === "connected";
  const isSignedIn = ghSignedIn || googleSignedIn;
  const isVerifying = ghStatus === "verifying";

  // Priority: GitHub login → Google name → Google email → null.
  // Both name and email are non-optional strings on GoogleIdentitySession, but
  // name may be an empty string when Google returns no display name for the
  // account, so fall back to email in that case for a robust display value.
  const displayName: string | null =
    login !== null
      ? login
      : googleIdentity !== null
        ? (googleIdentity.name.length > 0 ? googleIdentity.name : googleIdentity.email)
        : null;

  const initial: string | null =
    displayName !== null ? displayName.charAt(0).toUpperCase() : null;

  const signOut = useCallback(() => {
    ghDisconnect();
    googleDisconnect();
  }, [ghDisconnect, googleDisconnect]);

  return {
    isSignedIn,
    isVerifying,
    displayName,
    initial,
    github: {
      linked: ghSignedIn,
      login,
      connect: ghConnect,
      disconnect: ghDisconnect,
      error: ghError,
    },
    google: {
      linked: googleSignedIn,
      name: googleIdentity?.name ?? null,
      email: googleIdentity?.email ?? null,
      connect: googleConnect,
      disconnect: googleDisconnect,
      error: googleError,
    },
    signOut,
  };
}

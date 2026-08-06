// CrashErrorBoundary — the one React error boundary in the studio
// (spec 060, FR-001).
//
// ONE BOUNDARY, NOT THREE. It is mounted inside AppRoot's <I18nProvider>, which
// wraps all three trees main.tsx can render (StudioShell, LintDemo,
// OAuthCallbackScreen). Putting it there rather than around each of those
// gives one place to reason about, and — the reason it must be INSIDE the
// provider rather than around it — lets the fallback use the catalog. A
// fallback rendered above <I18nProvider> would call `useLingui` with no
// provider above it and throw while handling a throw, which is precisely the
// failure AppRoot's own header comment describes.
//
// A boundary catches render, lifecycle, and constructor errors only. Event
// handlers, async callbacks, and anything outside the commit phase never reach
// it — those are the `window.onerror` and `unhandledrejection` surfaces
// installed in main.tsx (FR-002, FR-003). The pre-mount case is a third,
// separate surface (FR-060), because a boundary that has not mounted cannot
// catch anything.

import { Component, type ErrorInfo, type ReactNode } from "react";
import { useSyncExternalStore } from "react";
import { CrashRecoveryScreen } from "./CrashRecoveryScreen.tsx";
import { reportCrash } from "../crash/send.ts";
import { getCrashSendSnapshot, subscribeCrashSend } from "../crash/send.ts";
import { safeCollectCrashContext } from "../lib/crashCallerContext.ts";

/**
 * Renders the recovery screen with whatever issue URL the send has produced.
 *
 * Split out as a function component because the boundary itself is a class —
 * it has to be, `componentDidCatch` has no hook equivalent — and hooks cannot
 * be used there.
 */
function RecoveryWithIssueLink() {
  const state = useSyncExternalStore(subscribeCrashSend, getCrashSendSnapshot);
  return (
    <CrashRecoveryScreen
      {...(state.issueUrl !== undefined ? { issueUrl: state.issueUrl } : {})}
    />
  );
}

// ---------------------------------------------------------------------------
// E2E trigger — flag-gated, never wired in production
// ---------------------------------------------------------------------------

/**
 * Subscribers that force the boundary into its crashed state.
 *
 * The accessibility scan (e2e/crash-recovery-a11y.spec.ts) has to audit the
 * REAL rendered fallback — real page CSS, real focus behaviour, real contrast —
 * and there is no other way to reach it from a browser without an actual crash.
 * Rendering a copy of the component on a scratch page would scan something the
 * author never sees.
 *
 * Reachable only through `window.__ksE2E__`, which `installE2eHook()` attaches
 * solely under `VITE_E2E=1` or `?e2e=1`. Nothing in production code calls this.
 */
const forceCrashListeners = new Set<() => void>();

/** @internal — E2E and tests only. */
export function _forceCrashForE2E(): void {
  for (const listener of forceCrashListeners) listener();
}

interface CrashErrorBoundaryProps {
  children: ReactNode;
}

interface CrashErrorBoundaryState {
  crashed: boolean;
}

export class CrashErrorBoundary extends Component<
  CrashErrorBoundaryProps,
  CrashErrorBoundaryState
> {
  override state: CrashErrorBoundaryState = { crashed: false };

  private readonly forceCrash = (): void => {
    this.setState({ crashed: true });
  };

  static getDerivedStateFromError(): CrashErrorBoundaryState {
    return { crashed: true };
  }

  override componentDidMount(): void {
    forceCrashListeners.add(this.forceCrash);
  }

  override componentWillUnmount(): void {
    forceCrashListeners.delete(this.forceCrash);
  }

  override componentDidCatch(error: Error, _info: ErrorInfo): void {
    // Structural context is read HERE, in the caller, and handed to the crash
    // module as plain data — the crash module never imports the stores
    // (FR-012, FR-042). If that read fails because the engine chunk is what
    // broke, it degrades to no context and the report still files.
    reportCrash({
      kind: "render",
      error,
      ...(() => {
        const context = safeCollectCrashContext();
        return context !== undefined ? { context } : {};
      })(),
    });
  }

  override render(): ReactNode {
    if (this.state.crashed) return <RecoveryWithIssueLink />;
    return this.props.children;
  }
}

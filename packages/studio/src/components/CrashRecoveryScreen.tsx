// CrashRecoveryScreen — the fallback rendered when the React tree is gone
// (spec 060, FR-072, FR-120, FR-125).
//
// WHY role="alert" AND A FOCUS MOVE HERE, BUT NOT ON CrashNotice.
//
// This screen replaces the whole page: whatever the author was doing is no
// longer on screen, and their keyboard focus is sitting on a node that has been
// unmounted. Per docs/accessibility.md rule 4, a whole-page state change is
// exactly the case where moving focus is correct — without it a screen-reader
// user is left on a detached element with no way to discover that the app has
// been replaced by an error screen.
//
// CrashNotice is the opposite case: the page is still usable, the author is
// mid-task, and stealing focus would be disruptive rather than helpful. It uses
// aria-live="polite" and never moves focus. The two surfaces differ on purpose;
// see contracts/client-surface.md.

import { useEffect, useRef } from "react";
import { Trans } from "@lingui/react/macro";

export interface CrashRecoveryScreenProps {
  /** URL of the filed issue, once the report has landed. */
  issueUrl?: string;
}

export function CrashRecoveryScreen({ issueUrl }: CrashRecoveryScreenProps) {
  const headingRef = useRef<HTMLHeadingElement>(null);

  useEffect(() => {
    // `tabIndex={-1}` on the heading makes it programmatically focusable
    // without adding it to the tab order — the standard way to move focus to a
    // non-interactive landmark.
    headingRef.current?.focus();
  }, []);

  return (
    <div role="alert" className="crash-recovery">
      <h1 ref={headingRef} tabIndex={-1}>
        <Trans id="crash.report.title">Something went wrong</Trans>
      </h1>

      <p>
        <Trans id="crash.report.sent.notice">
          Something went wrong. A report has been sent so this can be fixed.
        </Trans>
      </p>

      {issueUrl !== undefined && (
        <p>
          {/* A real anchor, not a click-handling div (FR-125). */}
          <a href={issueUrl} target="_blank" rel="noreferrer noopener">
            <Trans id="crash.report.issue.link">View the report</Trans>
          </a>
        </p>
      )}
    </div>
  );
}

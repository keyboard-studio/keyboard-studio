// OpenApplyHost -- mounted once in StudioShell. It is how an editor applies a
// change to an opened keyboard's files (spec 111 "live files", FR-009).
//
// `applyOnOpen(change)` calls `applyOpenChange`. When the change cannot be
// placed precisely, nothing has been written yet; the host asks with the
// shared reformat dialog (`useReformatConsent` + `ReformatConsentDialog`,
// unchanged) and, on agreement, applies again with consent. On decline the file
// is unchanged and the author is told the change was not applied. No timers.
//
// Accessibility (docs/accessibility.md): the outcome notice lives in an
// always-mounted polite `role="status"` region so a screen reader announces
// it when it appears, and it stays until the author dismisses it or the next
// change replaces it (nothing times out). The dismiss control is a native
// button.

import { createContext, useCallback, useContext, useMemo, useRef, useState, type ReactNode } from "react";
import { useLingui } from "@lingui/react/macro";
import { ReformatConsentDialog } from "./ReformatConsentDialog.tsx";
import { useReformatConsent } from "../hooks/useReformatConsent.ts";
import { ReformatConsentRequiredError } from "../lib/reformatConsentError.ts";
import { applyOpenChange, type OpenApplyResult, type OpenChange } from "../lib/openApply.ts";

export type ApplyOnOpen = (change: OpenChange) => Promise<OpenApplyResult>;

/**
 * Without a host (a component rendered on its own) a change that needs
 * consent is not applied: nothing is written without the author's agreement.
 */
const withoutHost: ApplyOnOpen = (change) => Promise.resolve(applyOpenChange(change));

const OpenApplyContext = createContext<ApplyOnOpen>(withoutHost);

/** The function an editor calls to apply a change to the opened keyboard's files. */
export function useApplyOnOpen(): ApplyOnOpen {
  return useContext(OpenApplyContext);
}

type Notice = "declined" | "failed" | "partial" | "busy" | null;

export function OpenApplyHost({ children }: { children: ReactNode }) {
  const { t } = useLingui();
  const consent = useReformatConsent();
  const [notice, setNotice] = useState<Notice>(null);
  const { guard } = consent;

  // One apply at a time. `guard` keeps a single pending answer, so a second
  // apply while the consent dialog is open would orphan the first (its promise
  // would never settle). The second is refused instead of queued: its change
  // was built from the screen as it was, and a queued one could run against
  // files the first has since rewritten.
  const busyRef = useRef(false);

  const applyOnOpen = useCallback<ApplyOnOpen>(
    async (change) => {
      if (busyRef.current) {
        setNotice("busy");
        return { status: "failed", reason: "Another change is waiting for an answer." };
      }
      busyRef.current = true;
      setNotice(null);
      try {
        const result = await guard(async (consentedReemit) => {
          const r = applyOpenChange(change, { consentedReemit });
          if (r.status === "needs-consent") throw new ReformatConsentRequiredError(r.files);
          return r;
        });
        if (result === undefined) {
          setNotice("declined");
          return { status: "declined" };
        }
        // `unchanged` is deliberately silent: nothing was asked and nothing changed.
        if (result.status === "failed") setNotice("failed");
        else if (result.status === "applied" && (result.notRestored?.length ?? 0) > 0) {
          setNotice("partial");
        }
        return result;
      } catch (err) {
        // Never an unhandled rejection: the files were not written.
        setNotice("failed");
        return { status: "failed", reason: err instanceof Error ? err.message : String(err) };
      } finally {
        busyRef.current = false;
      }
    },
    [guard],
  );

  const message =
    notice === "declined"
      ? t({
          id: "open.apply.declined",
          message: "That change was not applied. Your files are unchanged.",
        })
      : notice === "busy"
        ? t({
            id: "open.apply.busy",
            message: "Answer the question on screen first, then try that change again.",
          })
      : notice === "partial"
        ? t({
            id: "open.apply.partial",
            message: "Restored, but some files had changed since and were left as they are.",
          })
      : notice === "failed"
        ? t({
            id: "open.apply.failed",
            message: "That change could not be applied. Your files are unchanged.",
          })
        : null;

  const value = useMemo(() => applyOnOpen, [applyOnOpen]);
  return (
    <OpenApplyContext.Provider value={value}>
      {children}
      <ReformatConsentDialog {...consent.dialog} />
      <div
        role="status"
        aria-live="polite"
        style={{ position: "fixed", left: 16, bottom: 16, zIndex: 60, maxWidth: "min(480px, 92vw)" }}
      >
        {message !== null && (
          <div
            data-testid="open-apply-notice"
            style={{
              display: "flex",
              alignItems: "center",
              gap: 12,
              padding: "10px 14px",
              borderRadius: 8,
              border: "1px solid var(--app-border-strong)",
              background: "var(--app-surface)",
              color: "var(--app-text)",
              fontSize: 14,
            }}
          >
            <span>{message}</span>
            <button
              type="button"
              className="ks-focus-ring"
              data-testid="open-apply-notice-dismiss"
              onClick={() => setNotice(null)}
              style={{
                padding: "4px 10px",
                borderRadius: 6,
                border: "1px solid var(--app-border-strong)",
                background: "var(--app-surface-2)",
                color: "var(--app-text)",
                cursor: "pointer",
              }}
            >
              {t({ id: "open.apply.dismiss", message: "Dismiss" })}
            </button>
          </div>
        )}
      </div>
    </OpenApplyContext.Provider>
  );
}

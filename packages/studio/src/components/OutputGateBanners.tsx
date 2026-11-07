// OutputGateBanners — the gate-explaining banners shared by the Trial and
// Publish steps (spec 113, #2540).
//
// Extracted verbatim from the retired OutputScreen: the touch-stale,
// coverage-blocked, licence-unreadable and attribution-required banners,
// plus the one polite status line for refused jumps. The banners explain
// WHY a download / test build / submit is unavailable, rather than leaving
// a silently-disabled button — the same explanatory pattern PhaseFGate
// uses, off the identical shared gate (`lib/unimplementedInventory.ts`).
//
// Two deliberate changes from the OutputScreen copy:
// - The "Open" controls and the coverage "Go finish them now" button jump
//   with `jumpToLocation` and a `returnTo` naming the CALLER's step
//   (Trial or Publish), so StepHost's revise-and-return banner brings the
//   author straight back. OutputScreen used `backToUnfinishedGallery` —
//   the right BACK action from the `#output` route, where the walk stood
//   on `done` — but from inside the walk the sanctioned jump preserves the
//   Back stack (a jump rebuilds it from `visited`; the P0 regression was
//   about a forward-push `advance()`, which this is not).
// - The coverage gate's "Go finish them now" target is unchanged
//   (corrupted touch layout → touch, else desktop-first).

import { useState } from "react";
import { Trans, useLingui } from "@lingui/react/macro";
import { plural } from "@lingui/core/macro";
import { formatCoverageBannerParts, type InventoryCoverageGate } from "../lib/unimplementedInventory.ts";
import { jumpToLocation } from "../lib/jumpToLocation.ts";
import { unreachableReasonLabel } from "../decisions/progressDots.ts";
import type { ActiveStepId } from "../stores/surveySessionStore.ts";

/** An inline link-styled button inside a status banner (spec 094 "Open" controls). */
const BANNER_LINK_STYLE: React.CSSProperties = {
  background: "none",
  border: "none",
  padding: 0,
  color: "inherit",
  textDecoration: "underline",
  cursor: "pointer",
  font: "inherit",
};

const warningBannerStyle: React.CSSProperties = {
  marginTop: 4,
  padding: "8px 12px",
  background: "var(--app-warning-bg)",
  border: "1px solid var(--app-warning-border)",
  borderRadius: 6,
  fontSize: 12,
  fontFamily: "system-ui, -apple-system, 'Segoe UI', Roboto, sans-serif",
};

export interface OutputGateBannersProps {
  /** The step the "Open" / "Go finish them now" controls return to. */
  returnToStep: "trial" | "publish";
  /** A mechanics change after the Touch step left the touch layout stale. */
  touchStale: boolean;
  /** The step that fixes touch-staleness, from `outputBlockers()`. */
  touchBlockerStep?: string;
  coverageGate: InventoryCoverageGate;
  /** The base's own copyright notice could not be read (spec 064 D5). */
  licenseUnparseable: { reason: string; line: string } | null;
  /** No attribution captured at all (spec 064 D6). */
  attributionMissing: boolean;
  /** The step that fixes missing attribution, from `outputBlockers()`. */
  attributionBlockerStep?: string;
  /** Confirm the base's copyright holder (clears the licence banner). */
  resolveStartHolder: (holder: string) => void;
}

export function OutputGateBanners({
  returnToStep,
  touchStale,
  touchBlockerStep,
  coverageGate,
  licenseUnparseable,
  attributionMissing,
  attributionBlockerStep,
  resolveStartHolder,
}: OutputGateBannersProps) {
  const { t, i18n } = useLingui();

  const {
    unimplementedDesktop,
    unimplementedTouch,
    blockedOnDesktop,
    blockedOnTouch,
    blocked: coverageBlocked,
    touchLayoutCorrupted,
  } = coverageGate;
  const coverageTotalCount =
    unimplementedDesktop.length + (blockedOnTouch ? unimplementedTouch.length : 0);
  const coverageCountLabel = t({
    id: "output.coverageBlocked.count",
    message: plural(coverageTotalCount, { one: "# character", other: "# characters" }),
  });
  const mechanismGalleryLabel = t({
    id: "editor.assignLoop.mechanismGalleryHeading",
    message: "Mechanism Gallery",
  });
  const touchGalleryLabel = t({ id: "editor.assignLoop.touchGalleryHeading", message: "Touch Gallery" });
  const { uncoveredCharsList: coverageUncoveredCharsList, targetGalleryLabel: coverageTargetGalleryLabel } =
    formatCoverageBannerParts(coverageGate, {
      desktopLabel: mechanismGalleryLabel,
      touchLabel: touchGalleryLabel,
    });

  // A refused jump says why in the one polite status line beside the banners.
  const [jumpStatus, setJumpStatus] = useState<string | null>(null);
  const openBlockerStep = (stepId: string) => {
    const outcome = jumpToLocation(
      { route: "survey", step: stepId as ActiveStepId },
      { returnTo: { route: "survey", step: returnToStep } },
    );
    setJumpStatus(outcome.kind === "refused" ? unreachableReasonLabel(outcome.reason, i18n) : null);
  };
  const handleGoToGallery = () => {
    // Route back into the survey wizard at whichever gallery still has
    // work — desktop first (it gates touch's own completion too, so fixing
    // it first is always correct — same ordering as PhaseFGate) — EXCEPT a
    // corrupted touch layout, which can only be fixed by re-deriving it in
    // the touch gallery and so takes priority.
    const outcome = jumpToLocation(
      {
        route: "survey",
        step: (touchLayoutCorrupted ? "touch" : blockedOnDesktop ? "mechanisms" : "touch") as ActiveStepId,
      },
      { returnTo: { route: "survey", step: returnToStep } },
    );
    setJumpStatus(outcome.kind === "refused" ? unreachableReasonLabel(outcome.reason, i18n) : null);
  };

  return (
    <>
      {touchStale && (
        <div
          role="alert"
          style={{ ...warningBannerStyle, color: "var(--app-warning-text)", lineHeight: 1.5 }}
        >
          {"[WARN] "}
          <Trans id="output.status.touchStale">
            A mechanics change after the Touch step means the on-screen
            (touch) keyboard layout is now out of date. Return to the
            Touch step and re-complete it before downloading or
            submitting — otherwise the shipped keyboard would include a
            stale touch layout.
          </Trans>
          {touchBlockerStep !== undefined && (
            <>
              {" "}
              <button
                type="button"
                data-testid="output-open-touch"
                onClick={() => openBlockerStep(touchBlockerStep)}
                style={BANNER_LINK_STYLE}
              >
                <Trans id="output.blocker.openTouch">Open Touch layout</Trans>
              </button>
            </>
          )}
        </div>
      )}
      {/* Coverage-blocked explanation (P0 fix) — WHY download/submit is
          unavailable, not just a disabled button. Reuses the same
          shared gate (lib/unimplementedInventory.ts) and explanatory
          pattern as PhaseFGate: count + which characters + which
          modality + a control back to the relevant gallery. */}
      {coverageBlocked && (
        <div
          role="alert"
          style={{ ...warningBannerStyle, color: "var(--app-danger-text)", borderColor: "var(--app-danger)", lineHeight: 1.5 }}
        >
          {"[ERROR] "}
          {touchLayoutCorrupted ? (
            <Trans id="output.status.coverageBlocked.touchCorrupted">
              Your touch layout couldn&apos;t be read and may be corrupted. Re-derive it
              from the {coverageTargetGalleryLabel} to continue.
            </Trans>
          ) : (
            <Trans id="output.status.coverageBlocked">
              {coverageCountLabel} still need an implementation before you can
              download or submit: {coverageUncoveredCharsList}. Go back to the{" "}
              {coverageTargetGalleryLabel} to finish them.
            </Trans>
          )}{" "}
          <button
            type="button"
            data-testid="output-coverage-goto-gallery"
            onClick={handleGoToGallery}
            style={{
              background: "none",
              border: "none",
              padding: 0,
              color: "var(--app-danger-text)",
              textDecoration: "underline",
              cursor: "pointer",
              font: "inherit",
            }}
          >
            <Trans id="output.status.coverageBlocked.goto">Go finish them now</Trans>
          </button>
        </div>
      )}
      {/* spec 064 D5 — the base's own copyright notice could not be read.
          This is an [ERROR] rather than a warning: emitting anyway would
          publish a LICENSE.md naming only this author, silently dropping
          the notice MIT requires a derivative to retain. Carries the one
          control that clears it. */}
      {licenseUnparseable !== null && (
        <div
          role="alert"
          data-testid="license-unreadable"
          style={{
            ...warningBannerStyle,
            color: "var(--app-danger-text)",
            borderColor: "var(--app-danger)",
            lineHeight: 1.5,
            maxWidth: 560,
          }}
        >
          <div style={{ fontWeight: 600, marginBottom: 4 }}>
            {"[ERROR] "}
            <Trans id="output.status.startingLicenseUnreadable.title">
              The starting keyboard&apos;s copyright notice could not be read
            </Trans>
          </div>
          <div style={{ marginBottom: 6 }}>
            <Trans id="output.status.licenseUnreadable.line">Its licence file says:</Trans>{" "}
            <code style={{ fontFamily: "ui-monospace, monospace" }}>
              {licenseUnparseable.line}
            </code>
          </div>
          <div style={{ marginBottom: 8 }}>
            <Trans id="output.status.licenseUnreadable.why">
              This keyboard must keep the original author&apos;s copyright, so who held
              it needs confirming before it can be downloaded.
            </Trans>
          </div>
          <form
            onSubmit={(e) => {
              e.preventDefault();
              const input = e.currentTarget.elements.namedItem(
                "startHolder",
              ) as HTMLInputElement | null;
              if (input !== null) resolveStartHolder(input.value);
            }}
            style={{ display: "flex", gap: 6, alignItems: "center" }}
          >
            <input
              name="startHolder"
              type="text"
              aria-label={t({
                id: "output.status.licenseUnreadable.holderLabel",
                message: "Original copyright holder",
              })}
              placeholder={t({
                id: "output.status.licenseUnreadable.holderPlaceholder",
                message: "Original copyright holder",
              })}
              style={{
                flex: 1,
                padding: "5px 8px",
                background: "var(--app-bg)",
                color: "var(--app-text)",
                border: "1px solid var(--app-border)",
                borderRadius: 4,
                fontSize: 12,
              }}
            />
            <button
              type="submit"
              data-testid="resolve-base-holder"
              style={{
                padding: "5px 12px",
                background: "var(--app-accent)",
                color: "var(--app-text-on-accent)",
                border: "1px solid var(--app-border)",
                borderRadius: 4,
                fontSize: 12,
                cursor: "pointer",
              }}
            >
              <Trans id="output.status.licenseUnreadable.confirm">Confirm</Trans>
            </button>
          </form>
        </div>
      )}
      {/* spec 064 D6 — no attribution captured at all. Not an error the
          author caused, so [WARN] styling and a pointer back to where it
          is answered. */}
      {attributionMissing && (
        <div
          role="status"
          aria-live="polite"
          data-testid="attribution-required"
          style={{ ...warningBannerStyle, color: "var(--app-warning-text)", lineHeight: 1.5 }}
        >
          {"[WARN] "}
          <Trans id="output.status.attributionRequired">
            This keyboard needs an author and a copyright holder before it can be
            downloaded. Go back to the language step to add them.
          </Trans>
          {attributionBlockerStep !== undefined && (
            <>
              {" "}
              <button
                type="button"
                data-testid="output-open-identity"
                onClick={() => openBlockerStep(attributionBlockerStep)}
                style={BANNER_LINK_STYLE}
              >
                <Trans id="output.blocker.openIdentity">Open language step</Trans>
              </button>
            </>
          )}
        </div>
      )}
      <span
        role="status"
        aria-live="polite"
        data-testid="output-jump-status"
        style={{ display: "block", fontSize: 11, marginTop: 4 }}
      >
        {jumpStatus}
      </span>
    </>
  );
}

// UnfinishedGalleryIndicator — persistent, self-serve "return to unfinished
// work" control for the studio NavBar.
//
// Why this exists: the gallery "come back later" escape (MechanismGallery.tsx
// / TouchGallery.tsx's secondary button on the exit soft gate) already lets an
// author defer some characters and move on — that escape is untouched by this
// component. What was missing is a way to get BACK to that deferred work
// without waiting for the Phase F hard gate (PhaseFGate.tsx) to force it. This
// is a discoverability affordance only: it does not change what is blocking,
// only how early and how easily an author can go fix it.
//
// Coverage counts are DERIVED, never stored, by design (see
// lib/unimplementedInventory.ts). This component takes plain number props —
// the caller (StudioShell) computes them from the single shared
// `useInventoryCoverageGate()` hook (the same one StepHost / PhaseFGate /
// OutputScreen / StudioShell's own output-nav-blocked signal already use) so
// this indicator can never disagree with those about what counts as
// unreviewed. No new store slice, no new debounce timer (D3) — the counts
// only change when the working copy itself changes, which already re-renders
// every other consumer of that hook.
//
// Copy framing is load-bearing (defaults-first, spec v1.3.1 §3c "Defaults are
// the product"): every character already has a proposed default, so this is a
// count of UNREVIEWED/UNCONFIRMED defaults, never "missing" letters. Do not
// reintroduce "missing" wording here.

import { Trans, useLingui } from "@lingui/react/macro";
import { plural } from "@lingui/core/macro";

export interface UnfinishedGalleryIndicatorProps {
  /**
   * Characters on the desktop/physical layer still using an unreviewed
   * default (`InventoryCoverageGate.blockedOnDesktop ? unimplementedDesktop.length : 0`).
   * 0 (or negative, defensively) hides the desktop control entirely.
   */
  readonly desktopCount: number;
  /**
   * Characters on the touch layer still using an unreviewed default
   * (`InventoryCoverageGate.blockedOnTouch ? unimplementedTouch.length : 0`).
   * 0 hides the touch control — including the case where touch has not been
   * authored this session at all (`blockedOnTouch` is false then too).
   */
  readonly touchCount: number;
  /**
   * Routes back to the named gallery. The caller wires this to
   * `surveySessionStore.backToUnfinishedGallery(target)` (a BACK primitive —
   * see that action's docstring for why it must not be the forward-push
   * `advance`) followed by `navigateTo("survey")`, mirroring
   * OutputScreen.tsx's `handleGoToGallery` / PhaseFGate.tsx's `handleGoBack`.
   */
  readonly onNavigate: (target: "mechanisms" | "touch") => void;
}

const indicatorButtonStyle = {
  display: "inline-flex",
  alignItems: "center",
  padding: "4px 10px",
  fontSize: 12.5,
  fontFamily: "system-ui, -apple-system, 'Segoe UI', Roboto, sans-serif",
  color: "#e3b341",
  background: "rgba(227,179,65,0.12)",
  border: "1px solid #9e6a03",
  borderRadius: 6,
  cursor: "pointer",
  whiteSpace: "nowrap" as const,
};

/**
 * Persistent nav indicator: up to two small buttons (desktop / touch),
 * rendered only while there is unreviewed work in that modality. Real
 * `<button>` elements — keyboard-operable and focusable by default, with the
 * rendered text itself serving as the programmatic accessible name (no
 * separate `aria-label` needed since the visible text already is the full
 * sentence).
 */
export function UnfinishedGalleryIndicator({
  desktopCount,
  touchCount,
  onNavigate,
}: UnfinishedGalleryIndicatorProps) {
  const { t } = useLingui();

  if (desktopCount <= 0 && touchCount <= 0) return null;

  const desktopGalleryLabel = t({
    id: "editor.assignLoop.mechanismGalleryHeading",
    message: "Mechanism Gallery",
  });
  const touchGalleryLabel = t({
    id: "editor.assignLoop.touchGalleryHeading",
    message: "Touch Gallery",
  });
  const desktopCountLabel = t({
    id: "nav.unfinishedGallery.desktop.count",
    message: plural(desktopCount, { one: "# character", other: "# characters" }),
  });
  const touchCountLabel = t({
    id: "nav.unfinishedGallery.touch.count",
    message: plural(touchCount, { one: "# character", other: "# characters" }),
  });

  return (
    // aria-live: the counts can change while this indicator stays mounted
    // (e.g. an author reviews a character elsewhere, returns to Output, and
    // the count drops) — announce the update on the same re-render that
    // already recomputes it, riding the existing state change rather than a
    // new timer (D3's scope note: this is not a validation cycle, so no
    // debounce is involved either way).
    <div
      aria-live="polite"
      aria-atomic="false"
      style={{ display: "inline-flex", alignItems: "center", gap: 6 }}
    >
      {desktopCount > 0 && (
        <button
          type="button"
          data-testid="nav-unfinished-gallery-desktop"
          onClick={() => onNavigate("mechanisms")}
          style={indicatorButtonStyle}
        >
          <Trans id="nav.unfinishedGallery.desktop.button">
            {desktopCountLabel} still need review &ndash; resume in the {desktopGalleryLabel}
          </Trans>
        </button>
      )}
      {touchCount > 0 && (
        <button
          type="button"
          data-testid="nav-unfinished-gallery-touch"
          onClick={() => onNavigate("touch")}
          style={indicatorButtonStyle}
        >
          <Trans id="nav.unfinishedGallery.touch.button">
            {touchCountLabel} still need review &ndash; resume in the {touchGalleryLabel}
          </Trans>
        </button>
      )}
    </div>
  );
}

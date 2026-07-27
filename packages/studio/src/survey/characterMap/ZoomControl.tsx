// Zoom control — a fixed toolbar in the header area (stays put while the
// grid below scrolls). Scales the chip glyphs/cells via the `scale` param on
// charChip/chipGlyph/chipGlyphMissingBox/chipCodepoint (surveyStyles.ts)
// rather than a CSS transform on the scroll container, so the flex-wrap grid
// keeps reflowing correctly. `marginLeft: "auto"` pushes it to the right
// corner whether or not the "blocks my keyboard uses" checkbox is rendered
// alongside it — do not rely on the row's `justify-content` for this, it
// would mis-center when the checkbox is absent.

import { Trans, useLingui } from "@lingui/react/macro";
import { TEXT_DIM, secondaryButton } from "../surveyStyles.ts";
import { ZOOM_MAX, ZOOM_MIN, zoomPercent } from "./zoomControl.ts";

export interface ZoomControlProps {
  zoom: number;
  zoomOutButtonRef: React.RefObject<HTMLButtonElement>;
  zoomInButtonRef: React.RefObject<HTMLButtonElement>;
  onZoom: (direction: 1 | -1) => void;
}

export function ZoomControl({ zoom, zoomOutButtonRef, zoomInButtonRef, onZoom }: ZoomControlProps) {
  const { t } = useLingui();
  return (
    <div
      role="group"
      aria-label={t({ id: "survey.characterMapPane.zoom.groupAriaLabel", message: "Zoom the character map" })}
      style={{ display: "flex", alignItems: "center", gap: 8, marginLeft: "auto" }}
    >
      <button
        ref={zoomOutButtonRef}
        type="button"
        onClick={() => onZoom(-1)}
        disabled={zoom <= ZOOM_MIN}
        aria-label={t({ id: "survey.characterMapPane.zoom.zoomOut", message: "Zoom out" })}
        style={{
          ...secondaryButton,
          padding: "2px 10px",
          fontSize: 13,
          ...(zoom <= ZOOM_MIN ? { opacity: 0.4, cursor: "not-allowed" } : {}),
        }}
      >
        −
      </button>
      <span
        data-testid="char-map-zoom-level"
        style={{ fontSize: 12, color: TEXT_DIM, minWidth: 40, textAlign: "center" }}
      >
        <Trans id="survey.characterMapPane.zoom.level">{zoomPercent(zoom)}%</Trans>
      </span>
      <button
        ref={zoomInButtonRef}
        type="button"
        onClick={() => onZoom(1)}
        disabled={zoom >= ZOOM_MAX}
        aria-label={t({ id: "survey.characterMapPane.zoom.zoomIn", message: "Zoom in" })}
        style={{
          ...secondaryButton,
          padding: "2px 10px",
          fontSize: 13,
          ...(zoom >= ZOOM_MAX ? { opacity: 0.4, cursor: "not-allowed" } : {}),
        }}
      >
        +
      </button>
    </div>
  );
}

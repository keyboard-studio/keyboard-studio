// TouchKeepInertControl — T020 (spec 076 FR-023, amendment A3).
//
// Touch-layout consequence control for carved combinations. Mount-ready for
// the Behaviours step touch surface (076 phase-5 location — that surface
// does not exist in the codebase yet, so this component is self-contained
// and NOT mounted anywhere; it is a UI STUB, clearly marked as such).
//
// WHAT IT DOES
// ------------
// - For each carved character, two options: "removed from the touch layout"
//   (the default) and "kept, does nothing" (the keep-inert override).
// - Calls onChange with the new keep-inert character set (NFC, wholesale).
// - The store action `setCarveTouchKeepInert` feeds it; the hook
//   `useWorkingCopyTransform` threads it to projectWorkingCopyVfs as
//   keepInertTouchChars. The ENGINE behavior (removal default + inert
//   override) is fully implemented and tested in
//   applyCarveKeycapRemovalsToVfs; only this UI's MOUNT POINT is stubbed.
//
// COPY
// ----
// Factual and symmetric (A2): "removed from the touch layout" /
// "kept, does nothing". The retired slogan ("Allow means unpredictable;
// Block means predictable") must appear nowhere.

import { Trans } from "@lingui/react/macro";

/** A carved character's touch-layout disposition (T020). */
export interface TouchKeepInertRow {
  /** The carved character (NFC). */
  char: string;
  /** True when the author overrode the removal default to keep it inert. */
  keepInert: boolean;
}

export interface TouchKeepInertControlProps {
  /** One row per carved character affected by the touch-layout consequence. */
  rows: TouchKeepInertRow[];
  /** Called with the new keep-inert character set whenever an option flips. */
  onChange: (keepInertChars: string[]) => void;
}

/**
 * Touch-layout consequence control (STUB — not mounted yet).
 *
 * The Behaviours phase-5 touch surface does not exist in the codebase, so
 * this component renders standalone and waits for that surface to mount it.
 * The engine + store + transform path it drives is real and tested.
 */
export function TouchKeepInertControl({ rows, onChange }: TouchKeepInertControlProps) {
  if (rows.length === 0) return null;

  const flip = (char: string, keepInert: boolean) => {
    const next = new Set(
      rows.filter((r) => r.keepInert).map((r) => r.char.normalize("NFC")),
    );
    if (keepInert) {
      next.add(char.normalize("NFC"));
    } else {
      next.delete(char.normalize("NFC"));
    }
    onChange([...next]);
  };

  return (
    <section aria-label="Touch layout">
      <h3>
        <Trans>Touch layout</Trans>
      </h3>
      <p>
        <Trans>
          On phones and tablets, carved keys are removed from the touch layout
          by default. You can keep any key instead — it stays visible but does
          nothing.
        </Trans>
      </p>
      <ul>
        {rows.map((row) => (
          <li key={row.char}>
            <span aria-hidden="true">{row.char}</span>{" "}
            <button
              type="button"
              aria-pressed={!row.keepInert}
              onClick={() => flip(row.char, false)}
            >
              <Trans>Removed from the touch layout</Trans>
            </button>{" "}
            <button
              type="button"
              aria-pressed={row.keepInert}
              onClick={() => flip(row.char, true)}
            >
              <Trans>Kept, does nothing</Trans>
            </button>
          </li>
        ))}
      </ul>
    </section>
  );
}

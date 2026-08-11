// Shared layout constants for the CompareScreen and OutputScreen two-pane
// layouts. Both use identical proportions — keep the numbers here so a single
// edit propagates to both.

import type { CSSProperties } from "react";
import { BG_CARD, CARD_BORDER } from "../ui/theme.ts";

export const DIVIDER_WIDTH = 6;
export const LEFT_MIN_PCT = 20;
export const LEFT_MAX_PCT = 70;
export const LEFT_INIT_PCT = 40;

/**
 * The left pane's small secondary-button treatment, shared by PickerPane's own
 * mode toggle and by whatever a caller renders into its `changeBaseSlot` (today
 * OutputScreen's "Change base keyboard"). Spread it and override only what
 * differs; three hand-copied style objects that had to stay in visual agreement
 * was the alternative.
 *
 * It lives HERE, beside the layout constants, rather than in PickerPane.tsx
 * where its main consumer is, for the same reason lib/outputKeyboardId.ts sits
 * apart from serializeWorkingCopy.ts: test files `vi.mock` PickerPane wholesale
 * (OutputScreen.coverageBanner.test.tsx does), so a value exported from there
 * and read by OutputScreen at render time is `undefined` in those tests. A
 * constants module that nothing mocks needs no mock.
 */
export const PANE_SECONDARY_BUTTON: CSSProperties = {
  padding: "6px 12px",
  fontSize: 12,
  fontFamily: "inherit",
  cursor: "pointer",
  borderRadius: 6,
  border: `1px solid ${CARD_BORDER}`,
  background: BG_CARD,
  color: "var(--app-text-subtle)",
};

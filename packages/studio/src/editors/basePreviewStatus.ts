// BasePreviewStatusContext — carries the live compile-pipeline stage for the
// currently-previewed base keyboard down to the "Choose a starting keyboard"
// step (BaseResolution, via BaseResolutionAdapter), without either side
// importing the other directly.
//
// Why a context and not a store slice: the underlying value is a pure
// projection of useKeyboardArtifact's `Stage` (StudioShell/SurveyView owns
// that hook call — Article IV, one debounce/compile cycle, no second call
// site). A context keeps that projection a render-time concern local to the
// SurveyView subtree rather than promoting pipeline stage into a persisted
// store slot it has no business being in.
//
// Module lives under editors/ (not steps/ or stores/) so BOTH StudioShell.tsx
// (the provider, at src/ root) and editors/adapters/panelAdapters.tsx (the
// consumer) can import it without crossing a forbidden boundary or creating a
// steps/ -> stores/ / steps/ -> lib/ edge (see .dependency-cruiser.cjs).

import { createContext } from "react";

/**
 * Coarse status the "Choose this keyboard" commit button and any other
 * preview-aware UI needs — a simplified projection of useKeyboardArtifact's
 * `Stage` discriminated union (hooks/useKeyboardArtifact.ts):
 *   idle    -> Stage "idle" (no base previewed yet)
 *   loading -> Stage "fetching" | "vfs-loading" | "compiling"
 *   ready   -> Stage "ready"
 *   error   -> Stage "error"
 */
export type BasePreviewStatus = "idle" | "loading" | "ready" | "error";

/**
 * `undefined` is the no-Provider default — consumers must treat it as "no
 * information available" (BaseResolutionAdapter falls back to deriving a
 * status from `localBase` alone in that case) rather than a fifth status
 * value, so the type stays the clean four-member union above.
 */
export const BasePreviewStatusContext = createContext<BasePreviewStatus | undefined>(
  undefined,
);

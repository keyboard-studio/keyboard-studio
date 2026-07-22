// useFontSupportChecker — React hook wrapping fontSupport.ts's
// isGlyphSupported()/onFontsReady() for CharacterMapPane.
//
// Returns a stable-per-fontStack `(displayChar: string) => boolean` checker.
// isGlyphSupported() does no real Canvas 2D measurement (and caches nothing)
// until document.fonts.ready resolves — it just returns `true` uncached in
// the meantime. That means no char gets re-evaluated once fonts are ready
// unless something forces a re-render: onFontsReady() supplies that trigger,
// subscribing once so the component re-renders exactly when measurement
// becomes possible, and every displayed char gets its real (and now
// cacheable) supported/unsupported answer instead of staying on the
// pre-fonts-ready default forever.

import { useCallback, useEffect, useReducer } from "react";
import { isGlyphSupported, onFontsReady } from "./fontSupport.ts";

/** `(displayChar) => true` if `fontStack` can render it with its own glyph. */
export function useFontSupportChecker(fontStack: string): (displayChar: string) => boolean {
  const [, forceRerender] = useReducer((c: number) => c + 1, 0);

  useEffect(() => onFontsReady(forceRerender), []);

  return useCallback((displayChar: string) => isGlyphSupported(displayChar, fontStack), [fontStack]);
}

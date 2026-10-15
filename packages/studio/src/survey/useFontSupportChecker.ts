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
// pre-fonts-ready default forever. The same applies per script face:
// characters in a vendored script family's range are deferred while that
// face loads (scriptFonts.ts), so the hook also subscribes to face-settle
// events and re-renders then.

import { useCallback, useEffect, useReducer } from "react";
import { isGlyphSupported, onFontsReady } from "./fontSupport.ts";
import { onScriptFontsChanged } from "./scriptFonts.ts";

/** `(displayChar) => true` if `fontStack` can render it with its own glyph. */
export function useFontSupportChecker(fontStack: string): (displayChar: string) => boolean {
  const [, forceRerender] = useReducer((c: number) => c + 1, 0);

  useEffect(() => onFontsReady(forceRerender), []);

  // A vendored script face settling (scriptFonts.ts) is the second moment
  // measurement becomes real for its characters: isGlyphSupported deferred
  // them (uncached) while the face loaded, so without this re-render they
  // would stay on the deferred "supported" answer forever.
  useEffect(() => onScriptFontsChanged(() => forceRerender()), []);

  return useCallback((displayChar: string) => isGlyphSupported(displayChar, fontStack), [fontStack]);
}

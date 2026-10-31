// oe2SoleSourceFindings — build the Layer C LintFindings for the sole-source
// oe2 warning from the engine detector's glyph list.
//
// The detector (findSessionOe2SoleSourceGlyphs, @keyboard-studio/engine) is
// pure IR analysis; turning its glyphs into author-facing findings — code,
// severity, plain-language copy — is a studio concern, so it lives here,
// beside the other synthetic-finding builders (validationErrorFindings.ts).
// Copy is catalog copy (spec 046): message and hint are Lingui descriptors
// resolved through resolveMessage, so unit tests can call this bare and
// assert on the English source text while the app renders the active locale.
//
// One finding per glyph, so the mechanisms step badge counts exactly the
// characters at risk and each chip names its own character.

import type { I18n } from "@lingui/core";
import { msg } from "@lingui/core/macro";
import type { LintCode, LintFinding } from "@keyboard-studio/contracts";
import { resolveMessage } from "../lib/i18nResolve.ts";

/** Layer C code for a glyph whose only typing route is the oe2 key. */
export const OE2_SOLE_SOURCE_LINT_CODE: LintCode = "KM_LINT_OE2_SOLE_SOURCE_GLYPH";

export function buildOe2SoleSourceFindings(
  glyphs: readonly string[],
  i18n?: I18n,
): LintFinding[] {
  return glyphs.map((glyph) => {
    const codePoint =
      glyph.codePointAt(0)?.toString(16).toUpperCase().padStart(4, "0") ?? "?";
    return {
      code: OE2_SOLE_SOURCE_LINT_CODE,
      severity: "warning",
      layer: "C",
      message: resolveMessage(
        i18n,
        msg({
          id: "lint.oe2SoleSource.message",
          message: `The character "${{ glyph }}" (U+${{ codePoint }}) is only on the key next to the left Shift key`,
        }),
      ),
      hint: resolveMessage(
        i18n,
        msg({
          id: "lint.oe2SoleSource.hint",
          message:
            "Keyboards made for the US do not have this key, so people using one cannot type this character. Also give it another way to be typed, such as a different key or a deadkey sequence.",
        }),
      ),
    };
  });
}

// Template-token interpolation for flow-question prose (spec 050 US1 fix).
//
// A leaf module deliberately: SurveyRunner.tsx already imports QuestionField.tsx,
// so QuestionField cannot import from SurveyRunner without creating a cycle.
// Both modules import this file instead.
//
// Interpolation must run AFTER Tier-B content-i18n catalog resolution
// (resolveContentString in ../lib/contentI18n.ts), for every locale including
// English — a translated catalog string carries its own `{{token}}`
// placeholders (e.g. fr's `track_choice.prompt`), and only the resolved
// string (not the English value that fed resolveContentString) is what
// actually renders.
import type { SurveyContext } from "./types.ts";

/**
 * Replace `{{token}}` placeholders with the matching value from `ctx`.
 * A token with no matching context key is left as-is (unresolved tokens are
 * rare in practice — only surfaced during authoring/testing gaps).
 */
export function interpolate(text: string, ctx: SurveyContext): string {
  return text.replace(/\{\{(\w+)\}\}/g, (_, key: string) => ctx[key] ?? `{{${key}}}`);
}

// adaptiveDescription — the FR-009 proposal rule for the Phase F description
// question (spec 080 US4): on an adaptation whose base has a usable
// description, propose it and waive `required`; otherwise the question is
// exactly as before (required, unfilled).
//
// Lives in lib/, NOT in the question module: question modules are pure
// descriptors that the standalone content-i18n extractor loads outside the
// pnpm workspace, so they may import contracts and types only — never engine
// runtime code. flowStepOptions.tsx's phaseFOptions reads these with live
// working-copy context.

import type { BaseDocumentationProfile } from "@keyboard-studio/contracts";
import { extractUsableBaseDescription } from "@keyboard-studio/engine";

export interface AdaptiveDescriptionContext {
  instantiationMode: "new-from-base" | "adapt-existing" | null;
  baseDocProfile: BaseDocumentationProfile | null;
  baseWelcomeHtmText: string | null;
  baseHelpPhpText: string | null;
}

/**
 * The base's usable description text ONLY on an adaptation
 * (`instantiationMode === "adapt-existing"`) whose profile reports
 * `hasUsableDescription`; `undefined` otherwise (net-new, a Track 1 copy, or a
 * base classified none/minimal), so the question then behaves exactly as
 * before: required, unfilled.
 */
export function prefill(ctx: AdaptiveDescriptionContext): string | undefined {
  if (ctx.instantiationMode !== "adapt-existing") return undefined;
  if (ctx.baseDocProfile === null || !ctx.baseDocProfile.hasUsableDescription) return undefined;
  return extractUsableBaseDescription(ctx.baseWelcomeHtmText, ctx.baseHelpPhpText) ?? undefined;
}

/**
 * `false` in exactly the case `prefill` proposes a value (accept / edit /
 * replace is one action, never blocked by a "required" gate on a field that
 * already has something in it), `true` otherwise. Re-derives from `prefill`
 * rather than caching so the two can never disagree.
 */
export function requiredWhen(ctx: AdaptiveDescriptionContext): boolean {
  return prefill(ctx) === undefined;
}

/**
 * backspaceContext — the ONE shared place that decides whether a rule's
 * input context directly matches the backspace virtual key (`K_BKSP`).
 *
 * Two consumers key off this exact predicate and must never diverge:
 *   - `buildProducedSet` ({@link "./producedSet.js"}), opt-in via
 *     `excludeBackspaceCorrections` — a diacritic-removal / correction rule
 *     ("type é then backspace -> e") is not a PRODUCING rule for the studio's
 *     "backspace-aware" produced set.
 *   - `collectCharContributors` (@keyboard-studio/engine) — the same rules
 *     must never surface as a cascade-delete contributor, or as an "existing
 *     method" for a character.
 *
 * Only the DIRECT-context check lives here. `collectCharContributors` also
 * has a STORE-RESOLVED variant (an `any()`-consumed store's item aligned with
 * the matched output slot resolves to `{kind:"vkey", name:"K_BKSP"}`) that
 * depends on per-slot alignment it alone resolves — that half stays local to
 * the engine, layered on top of this shared direct check via its own
 * `contributorInputHasBackspace`.
 */

import type { ContextElement } from "../keyboard-ir.js";

/** True when a `{kind:"vkey"}` name is the backspace key (`K_BKSP`), case-insensitively. */
export function isBackspaceVkeyName(name: string): boolean {
  return name.toUpperCase() === "K_BKSP";
}

/**
 * True when `context` DIRECTLY contains a `{kind:"vkey", name:"K_BKSP"}`
 * element — the diacritic-removal / correction shape. Keys off the CONTEXT
 * (input), never the output: a rule whose output happens to include a
 * deadkey/backspace-adjacent construct but whose INPUT is a normal keystroke
 * is a legitimate producer and must not be caught by this check.
 */
export function contextHasDirectBackspace(context: readonly ContextElement[]): boolean {
  return context.some((el) => el.kind === "vkey" && isBackspaceVkeyName(el.name));
}

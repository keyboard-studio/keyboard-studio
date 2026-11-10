/**
 * `platform()` guards for the #2633 target-selector rewrite.
 *
 * Keyman 19 deprecated the `$keymanonly:` / `$keymanweb:` line prefixes and
 * Keyman 20 removes them (the line is always ignored). There is no single
 * platform token for "the .js build" — `platform('web')` matches only Keyman
 * Engine for Web, not Keyman for iOS/Android, which also run `.js` — so the
 * web side needs the three-copy union below, and the desktop side is
 * `platform('desktop native')` (see
 * ~/workspace/keyboard-studio-notes/2633-ruling.md §1).
 *
 * Tokens are ANDed and an unknown token fails the test, so multi-OS tokens
 * such as `platform('windows macos')` must never be emitted.
 */

/** Guard for a `$keymanonly:` (desktop .kmx) line. */
export const DESKTOP_PLATFORM_GUARD = "platform('desktop native')";

/**
 * Guards for a `$keymanweb:` (.js) line, one rule copy each: KeymanWeb,
 * Keyman for iPhone/iPad, Keyman for Android. Together they are the runtime
 * union of the old compile target.
 */
export const WEB_PLATFORM_GUARDS: readonly string[] = [
  "platform('web')",
  "platform('phone native')",
  "platform('tablet native')",
];

/**
 * True when `text` is one of the #2633 rewrite guards — as opposed to a
 * sourced guard such as `platform('touch')`, which the rewrite never
 * produces and which keeps its existing treatment elsewhere.
 */
export function isRewritePlatformGuard(text: string): boolean {
  const t = text.trim();
  return t === DESKTOP_PLATFORM_GUARD || WEB_PLATFORM_GUARDS.includes(t);
}

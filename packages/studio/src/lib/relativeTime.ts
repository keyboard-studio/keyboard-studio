// relativeTime — coarse "time ago" bucketing ("just now", N minutes/hours/days
// ago) for anything displaying a `savedAt` epoch-ms timestamp.
//
// i18n note (P1-4): this module deliberately does NOT render a string. It is
// a plain (non-component) lib with no React context, so it can't call the
// useLingui() hook — but a `plural()`-ICU translated string ALSO can't be
// safely resolved without a live `I18n` instance: unlike the simple
// `{name}`-interpolation lib/i18nResolve.ts's `resolveMessage()` fallback
// handles for lib/publishManagedPRErrorMessage.ts's non-plural cases, its
// no-i18n fallback path does NOT evaluate CLDR plural-category selection, so
// it would leak the raw unresolved ICU pattern. Keeping this module a PURE,
// non-i18n unit computation and doing the `plural()` macro rendering in the
// component layer (MyKeyboardsList.tsx, which always has a live `i18n` from
// useLingui()) sidesteps that gap entirely — this is option (a) from the
// review. `relativeTime()` itself stays trivially unit-testable with no
// catalog/provider setup.
export type RelativeTimeUnit = "now" | "minute" | "hour" | "day";

export interface RelativeTimeValue {
  unit: RelativeTimeUnit;
  /** Count for pluralization; 0 (unused by callers) when unit is "now". */
  count: number;
}

export function relativeTime(savedAt: number): RelativeTimeValue {
  const secs = Math.max(0, Math.round((Date.now() - savedAt) / 1000));
  if (secs < 60) return { unit: "now", count: 0 };
  const mins = Math.round(secs / 60);
  if (mins < 60) return { unit: "minute", count: mins };
  const hours = Math.round(mins / 60);
  if (hours < 24) return { unit: "hour", count: hours };
  const days = Math.round(hours / 24);
  return { unit: "day", count: days };
}

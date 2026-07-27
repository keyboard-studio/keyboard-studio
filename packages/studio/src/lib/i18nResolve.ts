import type { I18n, MessageDescriptor } from '@lingui/core';

/**
 * Resolve a Lingui MessageDescriptor (built via the `msg` macro) to a display
 * string, with a working fallback when no `I18n` instance is available.
 *
 * Several plain (non-component) helpers across the studio are called BOTH
 * from real components (which have an `i18n` instance, from `useLingui()`,
 * bound to the active locale) AND directly from unit tests (which call them
 * with no `i18n` argument at all, asserting on the English source text).
 * `msg()` only DEFINES a descriptor — resolving it still needs either a real
 * `i18n.t()` call (component path) or, for the argument-less test-call path,
 * this same-shape interpolation performed locally against the English
 * `message` text baked into the descriptor by the macro (so behavior matches
 * what the plain string literal did before i18n was introduced).
 */
export function resolveMessage(i18n: I18n | undefined, descriptor: MessageDescriptor): string {
  if (i18n !== undefined) return i18n.t(descriptor);
  let out = descriptor.message ?? '';
  const values = descriptor.values as Record<string, unknown> | undefined;
  if (values !== undefined) {
    for (const [k, v] of Object.entries(values)) {
      out = out.replaceAll(`{${k}}`, String(v));
    }
  }
  return out;
}

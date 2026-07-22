// publishManagedPRErrorMessage — map a PublishManagedPRError (discriminated
// union, docs/github_flow.md "Option B") to a single user-facing string.
//
// publishManagedPR THROWS a PublishManagedPRError-shaped plain object on
// failure; the UI switches on `err.kind` to pick recovery copy. Called BOTH
// from a real component (ManagedPRSubmitPanel, which has an `i18n` instance
// from `useLingui()`, bound to the active locale) AND directly from unit
// tests (which call it with no `i18n` argument at all, asserting on the
// English source text) — the same shape `keyHint`/`capabilityHint`/`infoFor`
// use in editors/assignLoop/parts/InfoView.tsx. `msg()` only DEFINES a
// descriptor; resolving it against whichever `i18n` (if any) is available is
// `resolveMessage`'s job (see its doc comment in lib/i18nResolve.ts) — kept
// pure otherwise (no dependency on global mutable i18n state) so this stays
// testable in isolation and reusable from any surface.

import type { I18n } from "@lingui/core";
import { msg } from "@lingui/core/macro";
import { resolveMessage } from "./i18nResolve.ts";
import type { PublishManagedPRError } from "@keyboard-studio/contracts";

/**
 * Single source of truth for the {@link PublishManagedPRError} discriminant values.
 *
 * `satisfies readonly PublishManagedPRError["kind"][]` makes this list track the
 * contract union: add a new kind and this array must grow to match, or the build
 * fails. Both {@link isPublishManagedPRError} (the runtime guard) and the
 * {@link publishManagedPRErrorMessage} exhaustiveness `never` guard derive from
 * this, so a new kind can never be silently misclassified or unhandled.
 */
const PUBLISH_MANAGED_PR_ERROR_KINDS = [
  "proxy-rejected",
  "proxy-unavailable",
  "upstream-failure",
  "rate-limit",
  "branch-exists",
  "network",
  "unknown",
] as const satisfies readonly PublishManagedPRError["kind"][];

/**
 * Render a {@link PublishManagedPRError} as a user-facing message.
 *
 * The mapping is exhaustive over the union's `kind`; adding a new kind to the
 * contract surfaces here as a TypeScript error (the `never` default).
 */
export function publishManagedPRErrorMessage(err: PublishManagedPRError, i18n?: I18n): string {
  switch (err.kind) {
    case "proxy-unavailable":
      return resolveMessage(i18n, msg({
        id: "output.submit.error.proxyUnavailable",
        message: "The submission service is temporarily unavailable. Please try again later.",
      }));
    case "rate-limit":
      return resolveMessage(i18n, msg({
        id: "output.submit.error.rateLimit",
        message: `Too many submissions — please retry in ${{ retryAfterSeconds: err.retryAfterSeconds }} seconds.`,
      }));
    case "branch-exists":
      return resolveMessage(i18n, msg({
        id: "output.submit.error.branchExists",
        message: "It looks like you already submitted this keyboard. Please try again with a new name.",
      }));
    case "upstream-failure":
      return resolveMessage(i18n, msg({
        id: "output.submit.error.upstreamFailure",
        message: "Submission failed due to an upstream error. Please try again.",
      }));
    case "proxy-rejected":
      return resolveMessage(i18n, msg({
        id: "output.submit.error.proxyRejected",
        message: `Submission was rejected (${{ httpStatus: err.httpStatus }}). Please check your details and try again.`,
      }));
    case "network":
      return resolveMessage(i18n, msg({
        id: "output.submit.error.network",
        message: "Could not reach the submission service. Please check your connection and try again.",
      }));
    case "unknown":
      return resolveMessage(i18n, msg({
        id: "output.submit.error.unknownKind",
        message: `Submission failed: ${{ detail: err.message }}`,
      }));
    default: {
      // Exhaustiveness guard: a new error kind must be handled above.
      const _exhaustive: never = err;
      return resolveMessage(i18n, msg({
        id: "output.submit.error.unexpectedKind",
        message: `Unexpected submission error.${{ detail: String(_exhaustive) }}`,
      }));
    }
  }
}

/**
 * Narrow an unknown thrown value to a {@link PublishManagedPRError}.
 *
 * publishManagedPR rejects with a plain object carrying a string `kind`, so we
 * structurally test for it rather than `instanceof Error`.
 */
export function isPublishManagedPRError(
  value: unknown,
): value is PublishManagedPRError {
  if (typeof value !== "object" || value === null) return false;
  const kind = (value as { kind?: unknown }).kind;
  return (PUBLISH_MANAGED_PR_ERROR_KINDS as readonly string[]).includes(
    kind as string,
  );
}

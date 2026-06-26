// publishManagedPRErrorMessage — map a PublishManagedPRError (discriminated
// union, docs/github_flow.md "Option B") to a single user-facing string.
//
// publishManagedPR THROWS a PublishManagedPRError-shaped plain object on
// failure; the UI switches on `err.kind` to pick recovery copy. Kept pure +
// dependency-free so it is testable in isolation and reusable from any surface.

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
export function publishManagedPRErrorMessage(err: PublishManagedPRError): string {
  switch (err.kind) {
    case "proxy-unavailable":
      return "The submission service is temporarily unavailable. Please try again later.";
    case "rate-limit":
      return `Too many submissions — please retry in ${err.retryAfterSeconds} seconds.`;
    case "branch-exists":
      return "It looks like you already submitted this keyboard. Please try again with a new name.";
    case "upstream-failure":
      return "Submission failed due to an upstream error. Please try again.";
    case "proxy-rejected":
      return `Submission was rejected (${err.httpStatus}). Please check your details and try again.`;
    case "network":
      return "Could not reach the submission service. Please check your connection and try again.";
    case "unknown":
      return `Submission failed: ${err.message}`;
    default: {
      // Exhaustiveness guard: a new error kind must be handled above.
      const _exhaustive: never = err;
      return `Unexpected submission error.${String(_exhaustive)}`;
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

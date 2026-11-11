// publishPRErrorMessage — map a PublishPRError (the own-GitHub-account
// fork+PR path, engine output/github.ts) to one user-facing string. Same
// shape as publishManagedPRErrorMessage: pure, `i18n` optional for tests.

import type { I18n } from "@lingui/core";
import { msg } from "@lingui/core/macro";
import { resolveMessage } from "./i18nResolve.ts";
import type { PublishPRError } from "@keyboard-studio/contracts";

const PUBLISH_PR_ERROR_KINDS = [
  "auth",
  "scope",
  "rate-limit",
  "branch-exists",
  "network",
  "unknown",
] as const satisfies readonly PublishPRError["kind"][];

export function isPublishPRError(err: unknown): err is PublishPRError {
  return (
    typeof err === "object" &&
    err !== null &&
    typeof (err as { kind?: unknown }).kind === "string" &&
    (PUBLISH_PR_ERROR_KINDS as readonly string[]).includes((err as { kind: string }).kind)
  );
}

export function publishPRErrorMessage(err: PublishPRError, i18n?: I18n): string {
  switch (err.kind) {
    case "auth":
      return resolveMessage(i18n, msg({
        id: "output.submit.own.error.auth",
        message: "Your GitHub sign-in has expired. Sign in with GitHub again and retry.",
      }));
    case "scope":
      return resolveMessage(i18n, msg({
        id: "output.submit.own.error.scope",
        message: "Keyboard Studio does not have permission to open a pull request from your GitHub account. Give permission and retry.",
      }));
    case "rate-limit":
      return resolveMessage(i18n, msg({
        id: "output.submit.own.error.rateLimit",
        message: `GitHub is limiting requests. Try again in ${{ seconds: err.retryAfterSeconds }} seconds.`,
      }));
    case "branch-exists":
      return resolveMessage(i18n, msg({
        id: "output.submit.own.error.branchExists",
        message: "A submission branch with this name already exists on your fork. Please try again.",
      }));
    case "network":
      return resolveMessage(i18n, msg({
        id: "output.submit.own.error.network",
        message: "Could not reach GitHub. Please check your connection and try again.",
      }));
    case "unknown":
      return resolveMessage(i18n, msg({
        id: "output.submit.own.error.unknown",
        message: "GitHub could not open the pull request. Please try again.",
      }));
    default: {
      const exhaustive: never = err;
      return String(exhaustive);
    }
  }
}

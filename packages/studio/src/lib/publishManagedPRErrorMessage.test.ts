// Tests for publishManagedPRErrorMessage — exhaustive over the
// PublishManagedPRError union.
//
// The module under test resolves its msg() descriptors via resolveMessage
// (lib/i18nResolve.ts): called with no `i18n` argument, it falls back to the
// English text baked into the descriptor by the macro — no bootstrapped
// singleton or React tree required for that path, which is what most of the
// tests below exercise. The "resolves through a real I18n instance" test
// below constructs its own `I18n` (the same object a component would get
// from `useLingui()`) to prove the non-fallback path too.

import { describe, it, expect } from "vitest";
import { I18n } from "@lingui/core";
import { messages as enMessages } from "../locales/en/messages.json?lingui";
import { messages as frMessages } from "../locales/fr/messages.json?lingui";
import type { PublishManagedPRError } from "@keyboard-studio/contracts";
import {
  publishManagedPRErrorMessage,
  isPublishManagedPRError,
} from "./publishManagedPRErrorMessage.ts";

describe("publishManagedPRErrorMessage", () => {
  it("proxy-unavailable -> temporarily unavailable message", () => {
    const err: PublishManagedPRError = {
      kind: "proxy-unavailable",
      message: "cannot reach proxy",
    };
    expect(publishManagedPRErrorMessage(err)).toMatch(/temporarily unavailable/i);
  });

  it("rate-limit -> interpolates retryAfterSeconds", () => {
    const err: PublishManagedPRError = {
      kind: "rate-limit",
      message: "slow down",
      retryAfterSeconds: 42,
    };
    expect(publishManagedPRErrorMessage(err)).toMatch(/retry in 42 seconds/i);
  });

  it("branch-exists -> already submitted message", () => {
    const err: PublishManagedPRError = {
      kind: "branch-exists",
      message: "exists",
      branchName: "add/foo",
    };
    expect(publishManagedPRErrorMessage(err)).toMatch(/already submitted/i);
  });

  it("upstream-failure -> upstream error message", () => {
    const err: PublishManagedPRError = {
      kind: "upstream-failure",
      message: "github is down",
    };
    expect(publishManagedPRErrorMessage(err)).toMatch(/upstream error/i);
  });

  it("proxy-rejected -> includes httpStatus in message", () => {
    const err: PublishManagedPRError = {
      kind: "proxy-rejected",
      message: "bad request",
      httpStatus: 400,
    };
    const msg = publishManagedPRErrorMessage(err);
    expect(msg).toMatch(/rejected/i);
    expect(msg).toContain("400");
  });

  it("network -> check connection message", () => {
    const err: PublishManagedPRError = {
      kind: "network",
      message: "offline",
    };
    expect(publishManagedPRErrorMessage(err)).toMatch(/check your connection/i);
  });

  it("unknown -> includes the underlying message", () => {
    const err: PublishManagedPRError = {
      kind: "unknown",
      message: "something weird happened",
    };
    expect(publishManagedPRErrorMessage(err)).toContain(
      "something weird happened",
    );
  });

  it("resolves through a real I18n instance — fr active translates, interpolation still works", () => {
    const testI18n = new I18n({ locale: "fr", messages: { fr: frMessages } });
    const err: PublishManagedPRError = {
      kind: "rate-limit",
      message: "slow down",
      retryAfterSeconds: 42,
    };
    expect(publishManagedPRErrorMessage(err, testI18n)).toBe(
      "Trop de soumissions — veuillez réessayer dans 42 secondes.",
    );
  });
});

describe("isPublishManagedPRError", () => {
  it("true for each valid kind", () => {
    const kinds: PublishManagedPRError["kind"][] = [
      "proxy-rejected",
      "proxy-unavailable",
      "upstream-failure",
      "rate-limit",
      "branch-exists",
      "network",
      "unknown",
    ];
    for (const kind of kinds) {
      expect(isPublishManagedPRError({ kind, message: "x" })).toBe(true);
    }
  });

  it("false for non-PublishManagedPRError values", () => {
    expect(isPublishManagedPRError(null)).toBe(false);
    expect(isPublishManagedPRError(new Error("nope"))).toBe(false);
    expect(isPublishManagedPRError({ kind: "auth" })).toBe(false);
    expect(isPublishManagedPRError("string")).toBe(false);
    expect(isPublishManagedPRError({ kind: "other" })).toBe(false);
  });
});

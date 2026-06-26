// Tests for publishManagedPRErrorMessage — exhaustive over the
// PublishManagedPRError union.

import { describe, it, expect } from "vitest";
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

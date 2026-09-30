// Unit tests for oskMessages — OskEvent type guard and union completeness.
// Coverage:
//   1. isOskEvent returns true for every valid OskEvent type.
//   2. isOskEvent returns false for non-objects, nulls, and unknown type strings.
//   3. The retired KEY_TAPPED event (OSK tap-to-pick, removed) is rejected.

import { describe, it, expect } from "vitest";
import { isOskEvent } from "./oskMessages";

describe("isOskEvent — valid OskEvent shapes", () => {
  it("accepts ENGINE_READY", () => {
    expect(isOskEvent({ type: "ENGINE_READY" })).toBe(true);
  });

  it("accepts ENGINE_ERROR", () => {
    expect(isOskEvent({ type: "ENGINE_ERROR", message: "something went wrong" })).toBe(true);
  });

  it("accepts TEXT_UPDATED", () => {
    expect(isOskEvent({ type: "TEXT_UPDATED", value: "hello" })).toBe(true);
  });

  it("accepts KEYBOARD_ACTIVE", () => {
    expect(isOskEvent({ type: "KEYBOARD_ACTIVE" })).toBe(true);
  });
});

describe("isOskEvent — rejects non-event payloads", () => {
  it("rejects null", () => {
    expect(isOskEvent(null)).toBe(false);
  });

  it("rejects undefined", () => {
    expect(isOskEvent(undefined)).toBe(false);
  });

  it("rejects a plain number", () => {
    expect(isOskEvent(42)).toBe(false);
  });

  it("rejects a string", () => {
    expect(isOskEvent("TEXT_UPDATED")).toBe(false);
  });

  it("rejects the retired KEY_TAPPED event", () => {
    expect(isOskEvent({ type: "KEY_TAPPED", keyId: "K_A" })).toBe(false);
  });

  it("rejects an object with an unknown type", () => {
    expect(isOskEvent({ type: "SOME_UNKNOWN_TYPE", payload: 1 })).toBe(false);
  });

  it("rejects an object with no type field", () => {
    expect(isOskEvent({ keyId: "K_A" })).toBe(false);
  });

  it("rejects an empty object", () => {
    expect(isOskEvent({})).toBe(false);
  });
});

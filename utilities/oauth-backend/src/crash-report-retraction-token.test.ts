// Retraction capability tokens (spec 060, FR-074a, P0-6).
//
// WHAT THESE ARE FOR. The token is the only thing standing between a public,
// unauthenticated endpoint and the ability to close an arbitrary issue in
// keyboard-studio/crash-reports, whose issue numbers are sequential and
// guessable. So the interesting assertions are all NEGATIVE: not "a good token
// verifies" (one test) but "nothing else does" (the rest).
//
// The pipeline-level halves — that the report route hands one out and the retract
// route reads its target from it rather than the body — are asserted in
// crash-report-dedupe.test.ts.

import { describe, it, expect } from "vitest";
import { createHash, createHmac } from "node:crypto";
import {
  mintRetractionToken,
  verifyRetractionToken,
  CRASH_RETRACTION_TOKEN_TTL_MS,
} from "./crash-report-retraction-token.js";

const NOW = Date.parse("2026-08-05T12:00:00.000Z");
const SECRET = "test-only-secret";

// ---------------------------------------------------------------------------
// Round trip
// ---------------------------------------------------------------------------

describe("mint → verify round trip", () => {
  it("returns the grant it was minted with", () => {
    const grant = { issueNumber: 42, action: "commented" as const, commentId: 7 };
    const verified = verifyRetractionToken(
      mintRetractionToken(grant, SECRET, NOW),
      SECRET,
      NOW,
    );
    expect(verified).toEqual(grant);
  });

  it("omits commentId rather than returning undefined for it", () => {
    // `exactOptionalPropertyTypes` is on: a present-but-undefined property is
    // not the same value as an absent one, and the pipeline branches on absence.
    const verified = verifyRetractionToken(
      mintRetractionToken({ issueNumber: 42, action: "created" }, SECRET, NOW),
      SECRET,
      NOW,
    );
    expect(verified).toEqual({ issueNumber: 42, action: "created" });
    expect(Object.hasOwn(verified ?? {}, "commentId")).toBe(false);
  });

  it("round-trips all three actions", () => {
    for (const action of ["created", "commented", "reopened"] as const) {
      const verified = verifyRetractionToken(
        mintRetractionToken({ issueNumber: 1, action }, SECRET, NOW),
        SECRET,
        NOW,
      );
      expect(verified?.action).toBe(action);
    }
  });

  it("does not carry the secret anywhere in the token", () => {
    // HMAC reveals nothing about its key, but the payload is only base64 — a
    // token that embedded the key would still verify and still be a leak.
    const token = mintRetractionToken({ issueNumber: 42, action: "created" }, SECRET, NOW);
    expect(token).not.toContain(SECRET);
    const [, payload] = token.split(".");
    expect(Buffer.from(payload as string, "base64url").toString("utf8")).not.toContain(
      SECRET,
    );
  });
});

// ---------------------------------------------------------------------------
// Rejection — the reason this module exists
// ---------------------------------------------------------------------------

describe("rejection", () => {
  const good = (): string =>
    mintRetractionToken({ issueNumber: 42, action: "created", commentId: 7 }, SECRET, NOW);

  it("rejects a token signed with a different secret", () => {
    const foreign = mintRetractionToken(
      { issueNumber: 42, action: "created" },
      "some-other-secret",
      NOW,
    );
    expect(verifyRetractionToken(foreign, SECRET, NOW)).toBeNull();
  });

  it("rejects a tampered issue number", () => {
    // The whole attack: hold a token for your own report, retarget it at
    // someone else's. Re-encoding the payload breaks the MAC over it.
    const [version, payload, mac] = good().split(".");
    const decoded = JSON.parse(
      Buffer.from(payload as string, "base64url").toString("utf8"),
    ) as { i: number };
    decoded.i = 1;
    const tampered = [
      version,
      Buffer.from(JSON.stringify(decoded), "utf8").toString("base64url"),
      mac,
    ].join(".");

    expect(verifyRetractionToken(tampered, SECRET, NOW)).toBeNull();
  });

  it("rejects a tampered expiry", () => {
    // Extending the TTL is as much a bypass as retargeting the issue.
    const [version, payload, mac] = good().split(".");
    const decoded = JSON.parse(
      Buffer.from(payload as string, "base64url").toString("utf8"),
    ) as { x: number };
    decoded.x = NOW + 86_400_000;
    const tampered = [
      version,
      Buffer.from(JSON.stringify(decoded), "utf8").toString("base64url"),
      mac,
    ].join(".");

    expect(verifyRetractionToken(tampered, SECRET, NOW)).toBeNull();
  });

  it("rejects a flipped signature byte", () => {
    const [version, payload, mac] = good().split(".");
    const flipped = (mac as string).startsWith("A")
      ? `B${(mac as string).slice(1)}`
      : `A${(mac as string).slice(1)}`;
    expect(verifyRetractionToken([version, payload, flipped].join("."), SECRET, NOW)).toBeNull();
  });

  it("rejects a truncated signature without throwing", () => {
    // `timingSafeEqual` throws on a length mismatch rather than returning false,
    // so an unguarded comparison turns a malformed token into a 500.
    const [version, payload, mac] = good().split(".");
    const short = (mac as string).slice(0, 10);
    expect(() =>
      verifyRetractionToken([version, payload, short].join("."), SECRET, NOW),
    ).not.toThrow();
    expect(verifyRetractionToken([version, payload, short].join("."), SECRET, NOW)).toBeNull();
  });

  it("rejects the empty string and other shapeless input", () => {
    for (const bad of ["", "x", "a.b", "a.b.c.d", "....", "v1..", "v1.x.y"]) {
      expect(verifyRetractionToken(bad, SECRET, NOW)).toBeNull();
    }
  });

  it("rejects an unknown version prefix", () => {
    const [, payload, mac] = good().split(".");
    expect(verifyRetractionToken(["v2", payload, mac].join("."), SECRET, NOW)).toBeNull();
  });

  it("rejects a signature-valid payload with an out-of-range issue number", () => {
    // Signature-verified content still gets shape-checked: a token minted by a
    // buggier build carries a valid MAC over a payload this build must not
    // coerce into an issue-number path.
    for (const i of [0, -1, 1.5]) {
      const token = signPayloadDirectly({ i, a: "created", x: NOW + 60_000 });
      expect(verifyRetractionToken(token, SECRET, NOW)).toBeNull();
    }
  });

  it("rejects a signature-valid payload with an unknown action", () => {
    const token = signPayloadDirectly({ i: 42, a: "deleted", x: NOW + 60_000 });
    expect(verifyRetractionToken(token, SECRET, NOW)).toBeNull();
  });

  it("rejects a signature-valid payload with a non-numeric expiry", () => {
    const token = signPayloadDirectly({ i: 42, a: "created", x: "soon" });
    expect(verifyRetractionToken(token, SECRET, NOW)).toBeNull();
  });

  it("rejects non-JSON under a valid signature", () => {
    const token = signRawBody(Buffer.from("not json at all", "utf8").toString("base64url"));
    expect(verifyRetractionToken(token, SECRET, NOW)).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// Expiry — the first server-side time bound this route has (FR-074a)
// ---------------------------------------------------------------------------

describe("expiry", () => {
  const token = (): string =>
    mintRetractionToken({ issueNumber: 42, action: "created" }, SECRET, NOW);

  it("is valid at the moment it is minted", () => {
    expect(verifyRetractionToken(token(), SECRET, NOW)).not.toBeNull();
  });

  it("is still valid one millisecond before the TTL elapses", () => {
    expect(
      verifyRetractionToken(token(), SECRET, NOW + CRASH_RETRACTION_TOKEN_TTL_MS - 1),
    ).not.toBeNull();
  });

  it("is rejected exactly at the TTL", () => {
    expect(
      verifyRetractionToken(token(), SECRET, NOW + CRASH_RETRACTION_TOKEN_TTL_MS),
    ).toBeNull();
  });

  it("outlives the client's 30 s Undo window", () => {
    // The bound has to absorb the report round trip, a cold retract function,
    // and clock skew between two serverless invocations — otherwise the server
    // becomes the reason an Undo inside the visible window fails.
    expect(CRASH_RETRACTION_TOKEN_TTL_MS).toBeGreaterThan(30_000);
  });

  it("is not indefinite", () => {
    // The property that matters: a captured request is replayable for a bounded
    // time, not forever, which is what the pre-token body shape allowed.
    expect(CRASH_RETRACTION_TOKEN_TTL_MS).toBeLessThanOrEqual(600_000);
  });
});

// ---------------------------------------------------------------------------
// Helpers that sign arbitrary payloads
// ---------------------------------------------------------------------------
//
// These reproduce the module's own signing so a test can put a payload the
// public `mintRetractionToken` cannot express behind a VALID signature. That is
// the only way to reach the post-signature shape checks — a tampered payload
// stops at the MAC and never gets there, so without these the shape guards would
// be untestable and, worse, would look covered.

function signRawBody(body: string): string {
  const key = createHash("sha256")
    .update(`keyboard-studio/crash-report/retraction-token/v1\n${SECRET}`, "utf8")
    .digest();
  const mac = createHmac("sha256", key).update(body, "utf8").digest().toString("base64url");
  return `v1.${body}.${mac}`;
}

function signPayloadDirectly(payload: Record<string, unknown>): string {
  return signRawBody(Buffer.from(JSON.stringify(payload), "utf8").toString("base64url"));
}

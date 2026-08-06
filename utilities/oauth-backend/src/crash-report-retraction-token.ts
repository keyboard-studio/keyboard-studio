/**
 * Retraction capability tokens (spec 060, FR-074a).
 *
 * ---------------------------------------------------------------------------
 * WHY THIS EXISTS
 * ---------------------------------------------------------------------------
 *
 * `POST /report/crash/retract` is an unauthenticated, public endpoint that
 * closes an issue or deletes a comment in keyboard-studio/crash-reports. Issue
 * numbers there are sequential and public. Reading the target from the REQUEST
 * BODY therefore hands any anonymous caller the ability to close or mutate an
 * arbitrary crash report that is not theirs — the 30 s Undo window in
 * CrashNotice.tsx is UI state, not a server-side control, and a caller who
 * never loads the SPA is not bound by it at all.
 *
 * This module is the fix, and it is the SAME MOVE the wire schema already makes
 * for the fingerprint (P0-1): remove the forgeable field. The retract body no
 * longer names an issue. It carries one opaque token that the server minted when
 * it filed the report, and every parameter the retraction acts on is read back
 * OUT of that token. A caller cannot retract a report it was not handed a token
 * for, and cannot edit the token to point at a different issue, because the
 * signature is over the parameters.
 *
 * ---------------------------------------------------------------------------
 * STATELESS BY CONSTRUCTION (FR-105)
 * ---------------------------------------------------------------------------
 *
 * No KV, no Redis, no Postgres, and no issued-token table — the same constraint
 * the flood-control layers work under. The token IS the record: it carries its
 * own parameters and its own expiry, and the signature is what makes it
 * unforgeable. Any serverless instance can verify a token any other instance
 * minted, with nothing to keep in sync.
 *
 * The cost of statelessness is that a token cannot be REVOKED, so it stays valid
 * for its full TTL even after one use. That is acceptable here and only here:
 * replaying a retraction is idempotent in effect — closing a closed issue is a
 * no-op, and deleting a deleted comment returns 404, which the pipeline maps to
 * a non-fatal upstream error. A replay cannot reach any issue other than the one
 * the token names.
 *
 * ---------------------------------------------------------------------------
 * KEY MATERIAL
 * ---------------------------------------------------------------------------
 *
 * The signing key is DERIVED from `CRASH_REPORT_APP_PRIVATE_KEY` rather than
 * read from a sixth environment variable. Two reasons:
 *
 *  1. The runbook's manual prerequisites are the part of this feature most
 *     likely to be done wrong, and a secret whose absence silently disables an
 *     authorization check is the worst possible thing to add to that list. The
 *     crash App's private key is already mandatory — `isCrashReportAppConfigured()`
 *     returns false without it and the route 503s — so a configured route always
 *     has key material, and there is no "configured but unsigned" state to reach.
 *  2. Rotating the App key rotates these tokens too, which is the correct
 *     coupling: both authorize writes to the same repository.
 *
 * The derivation is domain-separated (`DERIVATION_LABEL`) so the HMAC key is not
 * the App key itself and cannot be substituted into any other context. HMAC
 * reveals nothing about its key, so signing with derived material does not
 * expose the credential it came from.
 *
 * BUNDLE SAFETY: value-imports nothing but `node:crypto`. Traced into both
 * api/report/crash.ts and api/report/crash-retract.ts function bundles — see
 * api/bundle-safety.test.ts for why a workspace value-import there is an
 * outage-class defect.
 */

import { createHash, createHmac, timingSafeEqual } from "node:crypto";

import type { CrashReportAction } from "./crash-report-pipeline.js";

/**
 * How long a minted token stays valid.
 *
 * The client's Undo window is `CRASH_REPORT_UNDO_WINDOW_MS` = 30 s (FR-074),
 * measured from the moment the notice appears — which is AFTER the report
 * response lands. This bound is deliberately looser than 30 s so the server-side
 * check never becomes the reason a legitimate Undo inside the visible window
 * fails: it has to absorb the report round-trip, a cold retract function, and
 * whatever clock skew exists between two serverless invocations. It is still a
 * hard bound, and it is the FIRST server-side time bound this route has had —
 * before it, a captured request body was replayable forever.
 */
export const CRASH_RETRACTION_TOKEN_TTL_MS = 120_000;

/** Format tag, so a future signing change is distinguishable rather than ambiguous. */
const TOKEN_VERSION = "v1";

/** Domain separation for the derived HMAC key. Never change without bumping TOKEN_VERSION. */
const DERIVATION_LABEL = "keyboard-studio/crash-report/retraction-token/v1";

/** What a valid token asserts: exactly the parameters a retraction may act on. */
export interface RetractionGrant {
  issueNumber: number;
  action: CrashReportAction;
  commentId?: number | undefined;
}

/**
 * The signed payload, with SHORT KEYS on purpose.
 *
 * The token rides in a JSON body on the crash path, where the whole point is to
 * stay small and cheap; `{"i":42,"a":"created","x":1234}` is a third the size of
 * the spelled-out form for no loss of clarity at the one place it is read.
 */
interface TokenPayload {
  /** issueNumber */
  i: number;
  /** action */
  a: CrashReportAction;
  /** commentId, omitted when absent */
  c?: number;
  /** expiry, epoch ms */
  x: number;
}

function base64url(input: Buffer): string {
  return input.toString("base64url");
}

/** Derive the HMAC key from the App private key. See the KEY MATERIAL note above. */
function deriveKey(secret: string): Buffer {
  return createHash("sha256").update(`${DERIVATION_LABEL}\n${secret}`, "utf8").digest();
}

function sign(secret: string, body: string): string {
  return base64url(createHmac("sha256", deriveKey(secret)).update(body, "utf8").digest());
}

/**
 * Mint a token authorizing retraction of exactly this report.
 *
 * Called on every successful report, including the flood-controlled ones: a
 * report whose comment was skipped by the cap is still a report the author was
 * told about and may still want to withdraw, and withholding the token there
 * would make Undo mysteriously unavailable in precisely the case where the
 * author sees the ordinary "a report has been sent" notice.
 */
export function mintRetractionToken(
  grant: RetractionGrant,
  secret: string,
  now: number = Date.now(),
): string {
  const payload: TokenPayload = {
    i: grant.issueNumber,
    a: grant.action,
    ...(grant.commentId !== undefined ? { c: grant.commentId } : {}),
    x: now + CRASH_RETRACTION_TOKEN_TTL_MS,
  };
  const body = base64url(Buffer.from(JSON.stringify(payload), "utf8"));
  return `${TOKEN_VERSION}.${body}.${sign(secret, body)}`;
}

/**
 * Verify a token and return the grant it carries, or `null` if it is not valid.
 *
 * ONE UNDIFFERENTIATED FAILURE for every rejection reason — wrong version, bad
 * shape, bad signature, expired, malformed payload. A caller that could tell
 * "signature failed" from "expired" learns whether it guessed the key, and a
 * caller that could tell "unknown version" from "bad signature" learns the
 * format. The route maps `null` to one status with one message (FR-074a).
 *
 * The comparison is `timingSafeEqual`, guarded by an explicit length check
 * because it throws rather than returning false on a length mismatch.
 */
export function verifyRetractionToken(
  token: string,
  secret: string,
  now: number = Date.now(),
): RetractionGrant | null {
  const parts = token.split(".");
  if (parts.length !== 3) return null;
  const [version, body, mac] = parts;
  if (version !== TOKEN_VERSION || body === undefined || mac === undefined) return null;

  const expected = sign(secret, body);
  const macBuf = Buffer.from(mac, "utf8");
  const expectedBuf = Buffer.from(expected, "utf8");
  if (macBuf.length !== expectedBuf.length) return null;
  if (!timingSafeEqual(macBuf, expectedBuf)) return null;

  let payload: TokenPayload;
  try {
    payload = JSON.parse(Buffer.from(body, "base64url").toString("utf8")) as TokenPayload;
  } catch {
    return null;
  }

  // Signature-verified content still gets shape-checked. A token minted by an
  // older or buggier build carries a valid MAC over a payload this build may not
  // be able to read, and coercing that into a grant would put `NaN` or
  // `undefined` into an issue-number path.
  if (typeof payload.x !== "number" || !Number.isFinite(payload.x)) return null;
  if (payload.x <= now) return null;
  if (!Number.isInteger(payload.i) || payload.i <= 0) return null;
  if (payload.a !== "created" && payload.a !== "commented" && payload.a !== "reopened") {
    return null;
  }
  if (payload.c !== undefined && (!Number.isInteger(payload.c) || payload.c <= 0)) {
    return null;
  }

  return {
    issueNumber: payload.i,
    action: payload.a,
    ...(payload.c !== undefined ? { commentId: payload.c } : {}),
  };
}

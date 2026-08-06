// The reporter survives what it reports (spec 060 US4 — FR-014, FR-021,
// FR-078, FR-101, SC-004), plus the crash-in-the-crash-reporter guard.
//
// THE SCENARIO. `loadEngine()` has already failed for this session and the
// stale-chunk carve-out has already used its one reload, so the failure is
// genuine and must be filed. Everything the reporter needs to do that —
// fingerprint, redact, build, POST — has to work with the engine chunk absent.
//
// The static half of this guarantee is engine-reachability.test.ts, which walks
// the import graph. This is the behavioural half: the static gate proves the
// edge does not exist, and these tests prove the code actually runs without it.
// Neither is sufficient alone — a module can be import-clean and still call
// something that was only ever populated by the engine's side effects.

import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import {
  reportCrash,
  getCrashSendSnapshot,
  resetCrashSendState,
  subscribeCrashSend,
  CRASH_REPORT_ENDPOINT,
  DEDUPE_KEY_PREFIX,
} from "./send.ts";
import { computeClientFingerprint } from "./fingerprint.ts";
import { _resetBreadcrumbs } from "./breadcrumbs.ts";

const ISSUE = {
  issueUrl: "https://github.com/keyboard-studio/crash-reports/issues/42",
  issueNumber: 42,
  action: "created" as const,
};

/** The failure a lazy engine chunk produces once its reload has been spent. */
function engineLoadFailure(): Error {
  const original = new Error(
    "Failed to fetch dynamically imported module: https://studio.example/assets/engine-DLGH1X0S.js",
  );
  const wrapped = new Error(
    "Engine failed to load — check browser console for WASM errors.",
    { cause: original },
  );
  wrapped.stack = [
    "Error: Engine failed to load — check browser console for WASM errors.",
    "    at loadEngine (assets/main-DLGH1X0S.js:58:11)",
    "    at run (assets/main-DLGH1X0S.js:535:9)",
  ].join("\n");
  return wrapped;
}

interface CapturedRequest {
  url: string;
  body: unknown;
}

function stubFetch(
  response: { ok: boolean; status: number; json?: unknown } = {
    ok: true,
    status: 200,
    json: ISSUE,
  },
): { requests: CapturedRequest[] } {
  const requests: CapturedRequest[] = [];
  vi.stubGlobal(
    "fetch",
    vi.fn((url: string, init: { body?: string }) => {
      requests.push({
        url,
        body: init.body === undefined ? undefined : JSON.parse(init.body),
      });
      return Promise.resolve({
        ok: response.ok,
        status: response.status,
        json: () => Promise.resolve(response.json ?? {}),
      });
    }),
  );
  return { requests };
}

/** Wait for the fire-and-forget send to settle. */
async function settle(): Promise<void> {
  for (let i = 0; i < 20; i += 1) {
    await Promise.resolve();
    await new Promise((r) => {
      setTimeout(r, 0);
    });
    if (getCrashSendSnapshot().status !== "sending") break;
  }
}

beforeEach(() => {
  resetCrashSendState();
  _resetBreadcrumbs();
  sessionStorage.clear();
});

afterEach(() => {
  vi.unstubAllGlobals();
  resetCrashSendState();
  sessionStorage.clear();
});

// ---------------------------------------------------------------------------
// SC-004 — the reporter works with the engine chunk gone
// ---------------------------------------------------------------------------

describe("reporting an engine-surface load failure (FR-014, SC-004)", () => {
  it("fingerprints, builds, and POSTs without touching the failed chunk", async () => {
    const { requests } = stubFetch();

    reportCrash({ kind: "rejection", error: engineLoadFailure() });
    await settle();

    expect(requests).toHaveLength(1);
    expect(requests[0]?.url).toBe(CRASH_REPORT_ENDPOINT);
    expect(getCrashSendSnapshot().status).toBe("sent");
    expect(getCrashSendSnapshot().issueUrl).toBe(ISSUE.issueUrl);
  });

  it("computes a fingerprint via crypto.subtle directly", async () => {
    // The value the session cache is keyed by, computed with no engine helper.
    const fingerprint = await computeClientFingerprint({
      kind: "rejection",
      message: "Error: boom",
      frames: [{ function: "f", modulePath: "assets/main-DLGH1X0S.js" }],
    });
    expect(fingerprint).toMatch(/^[0-9a-f]{12}$/);
  });

  it("sends the raw inputs and NO fingerprint (FR-021)", async () => {
    const { requests } = stubFetch();
    reportCrash({ kind: "rejection", error: engineLoadFailure() });
    await settle();

    const body = requests[0]?.body as Record<string, unknown>;
    expect(body["kind"]).toBe("rejection");
    expect(body["message"]).toBeTruthy();
    expect(body["stackFrames"]).toBeInstanceOf(Array);
    expect(body["appVersion"]).toBeTruthy();
    expect("fingerprint" in body).toBe(false);
  });

  it("still builds a payload when structural context is unavailable", async () => {
    // The stores are exactly what may be unreachable when the engine failed.
    const { requests } = stubFetch();
    reportCrash({ kind: "rejection", error: engineLoadFailure() });
    await settle();
    expect((requests[0]?.body as { message: string }).message).toContain(
      "Engine failed to load",
    );
  });
});

// ---------------------------------------------------------------------------
// FR-101 — per-session dedupe cache
// ---------------------------------------------------------------------------

describe("session dedupe cache (FR-101)", () => {
  it("POSTs once for two occurrences of the same crash", async () => {
    const { requests } = stubFetch();

    reportCrash({ kind: "rejection", error: engineLoadFailure() });
    await settle();
    resetCrashSendState();
    reportCrash({ kind: "rejection", error: engineLoadFailure() });
    await settle();

    expect(requests).toHaveLength(1);
  });

  it("keys the cache by fingerprint under the documented prefix", async () => {
    stubFetch();
    reportCrash({ kind: "rejection", error: engineLoadFailure() });
    await settle();

    const keys = Object.keys(sessionStorage).filter((k) =>
      k.startsWith(DEDUPE_KEY_PREFIX),
    );
    expect(keys).toHaveLength(1);
    expect(keys[0]).toMatch(new RegExp(`^${DEDUPE_KEY_PREFIX}[0-9a-f]{12}$`));
  });

  it("does not cache a send that failed, so a later attempt can succeed", async () => {
    stubFetch({ ok: false, status: 502 });
    reportCrash({ kind: "rejection", error: engineLoadFailure() });
    await settle();

    expect(
      Object.keys(sessionStorage).filter((k) => k.startsWith(DEDUPE_KEY_PREFIX)),
    ).toHaveLength(0);
  });
});

// ---------------------------------------------------------------------------
// FR-078 — fire and forget
// ---------------------------------------------------------------------------

describe("fire-and-forget (FR-078)", () => {
  it("swallows a network throw without rejecting", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(() => Promise.reject(new Error("offline"))),
    );

    expect(() => {
      reportCrash({ kind: "onerror", error: new Error("boom") });
    }).not.toThrow();
    await settle();

    expect(getCrashSendSnapshot().status).toBe("failed");
  });

  it("swallows a 503 and never retries", async () => {
    const { requests } = stubFetch({ ok: false, status: 503 });
    reportCrash({ kind: "onerror", error: new Error("boom") });
    await settle();

    // A retry loop is itself the flood the flood-control layers exist to stop.
    expect(requests).toHaveLength(1);
    expect(getCrashSendSnapshot().status).toBe("failed");
  });
});

// ---------------------------------------------------------------------------
// The crash-in-the-crash-reporter guard
// ---------------------------------------------------------------------------

describe("crash-in-the-crash-reporter", () => {
  it("does not escape as a second rejection when a subscriber throws", async () => {
    stubFetch();
    const unsubscribe = subscribeCrashSend(() => {
      throw new Error("subscriber exploded");
    });

    expect(() => {
      reportCrash({ kind: "rejection", error: new Error("boom") });
    }).not.toThrow();
    await settle();

    expect(getCrashSendSnapshot().status).toBe("sent");
    unsubscribe();
  });

  it("survives an unserializable payload rather than throwing", async () => {
    stubFetch();
    const circular: Record<string, unknown> = {};
    circular["self"] = circular;

    expect(() => {
      reportCrash({ kind: "onerror", error: circular });
    }).not.toThrow();
    await settle();
  });
});

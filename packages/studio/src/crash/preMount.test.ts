// Pre-mount crash path (spec 060 — FR-036, FR-060 – FR-064, SC-007, SC-011).
//
// The crash class an ErrorBoundary structurally cannot reach, so nothing else
// in the suite covers it. The two assertions that matter most are negative
// ones: the path must not READ identity storage (FR-036, FR-063), and it must
// not throw a second time no matter how its POST fails (FR-060) — at that point
// there is no handler left to catch anything.

import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import {
  handlePreMountCrash,
  revealPreMountFallback,
  sendPreMountReport,
  PRE_MOUNT_FALLBACK_ID,
} from "./preMount.ts";

interface Captured {
  url: string;
  body: Record<string, unknown>;
}

function stubFetch(behaviour: "ok" | "reject" | "throw" = "ok"): Captured[] {
  const captured: Captured[] = [];
  vi.stubGlobal(
    "fetch",
    vi.fn((url: string, init: { body?: string }) => {
      captured.push({
        url,
        body: init.body === undefined ? {} : JSON.parse(init.body),
      });
      if (behaviour === "throw") throw new Error("fetch exploded synchronously");
      if (behaviour === "reject") return Promise.reject(new Error("offline"));
      return Promise.resolve({ ok: true, status: 200, json: () => Promise.resolve({}) });
    }),
  );
  return captured;
}

function installFallbackElement(): HTMLElement {
  const el = document.createElement("div");
  el.id = PRE_MOUNT_FALLBACK_ID;
  el.setAttribute("hidden", "");
  document.body.appendChild(el);
  return el;
}

beforeEach(() => {
  document.body.innerHTML = "";
  localStorage.clear();
  sessionStorage.clear();
});

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
  document.body.innerHTML = "";
});

// ---------------------------------------------------------------------------
// SC-007 — the fallback renders and a report is attempted
// ---------------------------------------------------------------------------

describe("pre-mount crash (SC-007)", () => {
  it("reveals the static fallback element", () => {
    const el = installFallbackElement();
    stubFetch();

    handlePreMountCrash(new Error("Studio bootstrap: #root element missing"));

    expect(el.hasAttribute("hidden")).toBe(false);
  });

  it("attempts a POST to the same endpoint as the ordinary path (FR-064)", () => {
    installFallbackElement();
    const captured = stubFetch();

    handlePreMountCrash(new Error("Studio bootstrap: #root element missing"));

    expect(captured).toHaveLength(1);
    expect(captured[0]?.url).toBe("/report/crash");
  });

  it("sends exactly the FR-062 shape: message, stack, appVersion", () => {
    installFallbackElement();
    const captured = stubFetch();
    const error = new Error("boom");
    error.stack = "requireRoot@assets/main-DLGH1X0S.js:3:11";

    sendPreMountReport(error);

    expect(Object.keys(captured[0]?.body ?? {}).sort()).toEqual([
      "appVersion",
      "message",
      "stack",
    ]);
  });

  it("carries a non-empty build identifier (SC-011)", () => {
    installFallbackElement();
    const captured = stubFetch();

    sendPreMountReport(new Error("boom"));

    const appVersion = captured[0]?.body["appVersion"];
    expect(typeof appVersion).toBe("string");
    expect(appVersion).toMatch(/^\d+\.\d+\.\d+\+.+$/);
  });

  it("omits kind, stackFrames, and occurredAt (FR-062)", () => {
    installFallbackElement();
    const captured = stubFetch();

    sendPreMountReport(new Error("boom"));

    const body = captured[0]?.body ?? {};
    expect("kind" in body).toBe(false);
    expect("stackFrames" in body).toBe(false);
    expect("occurredAt" in body).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// FR-060 — no second uncaught exception, whatever happens
// ---------------------------------------------------------------------------

describe("pre-mount crash — nothing may throw twice", () => {
  it("does not throw when the POST rejects", () => {
    installFallbackElement();
    stubFetch("reject");
    expect(() => {
      handlePreMountCrash(new Error("boom"));
    }).not.toThrow();
  });

  it("does not throw when fetch itself throws synchronously", () => {
    installFallbackElement();
    stubFetch("throw");
    expect(() => {
      handlePreMountCrash(new Error("boom"));
    }).not.toThrow();
  });

  it("does not throw when the fallback element is missing", () => {
    // An index.html edit removed it. The report still matters more than the
    // consolation message, so nothing about the message can block the report.
    const captured = stubFetch();
    expect(() => {
      handlePreMountCrash(new Error("boom"));
    }).not.toThrow();
    expect(captured).toHaveLength(1);
  });

  it("does not throw for a non-Error thrown value", () => {
    installFallbackElement();
    const captured = stubFetch();
    expect(() => {
      handlePreMountCrash("a bare string");
    }).not.toThrow();
    expect(captured[0]?.body["message"]).toBe("a bare string");
  });

  it("reveals the fallback even with no element and no fetch at all", () => {
    vi.stubGlobal("fetch", undefined);
    expect(() => {
      revealPreMountFallback();
    }).not.toThrow();
  });
});

// ---------------------------------------------------------------------------
// FR-036 / FR-063 — must not READ identity or working-copy storage
// ---------------------------------------------------------------------------

describe("pre-mount crash — storage is not read", () => {
  it("reads neither localStorage nor sessionStorage", () => {
    installFallbackElement();
    stubFetch();

    const localGet = vi.spyOn(Storage.prototype, "getItem");

    handlePreMountCrash(new Error("boom"));

    // Not "does not leak them" — does not READ them. Nothing has validated that
    // state at this point, and reaching into storage while the app is failing
    // to boot is one malformed entry away from throwing a second time.
    expect(localGet).not.toHaveBeenCalled();
  });

  it("sends no credentials with the report", () => {
    installFallbackElement();
    const fetchSpy = vi.fn(() =>
      Promise.resolve({ ok: true, status: 200, json: () => Promise.resolve({}) }),
    );
    vi.stubGlobal("fetch", fetchSpy);

    sendPreMountReport(new Error("boom"));

    const init = fetchSpy.mock.calls[0]?.[1] as { credentials?: string } | undefined;
    expect(init?.credentials).toBe("omit");
  });
});

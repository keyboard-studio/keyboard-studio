// Static regression guard for the OSK preview frame's security posture.
//
// packages/studio/public/osk-frame.{html,js} run inside an iframe, loaded
// by the browser directly from /public — they are not a build artifact and
// the IIFE in osk-frame.js is not an importable module, so vitest cannot
// exercise its postMessage listener directly. Instead this test reads both
// files as plain text and asserts the security-relevant guards are present
// verbatim. Crude, but it turns an accidental revert of the origin check,
// the jsUrl allowlist, or the CSP meta tag into a failing test rather than
// a silent regression.
//
// See useOskChannel.test.ts for the parent-side (host) targetOrigin check.

import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import path from "node:path";

const currentDir = path.dirname(fileURLToPath(import.meta.url));
const publicDir = path.join(currentDir, "..", "..", "public");
const frameJs = readFileSync(path.join(publicDir, "osk-frame.js"), "utf-8");
const frameHtml = readFileSync(path.join(publicDir, "osk-frame.html"), "utf-8");

describe("osk-frame.js — message listener origin/source guard", () => {
  it("rejects messages whose origin does not match window.location.origin", () => {
    expect(frameJs).toContain("event.origin !== window.location.origin");
  });

  it("rejects messages whose source is not window.parent", () => {
    expect(frameJs).toContain("event.source !== window.parent");
  });
});

describe("osk-frame.js — jsUrl blob: allowlist", () => {
  it("refuses to load a keyboard whose jsUrl is not a blob: URL", () => {
    expect(frameJs).toContain('jsUrl.startsWith("blob:")');
  });
});

describe("osk-frame.js — no wildcard postMessage targets", () => {
  it('never posts a message with "*" as the targetOrigin', () => {
    expect(frameJs).not.toMatch(/postMessage\([^)]*,\s*"\*"\s*\)/);
  });
});

describe("osk-frame.html — Content-Security-Policy meta tag", () => {
  it("declares a restrictive script-src", () => {
    expect(frameHtml).toContain("script-src 'self' blob:");
  });

  it("does not weaken script-src with unsafe-eval or unsafe-inline", () => {
    const cspMatch = /http-equiv="Content-Security-Policy"\s+content="([^"]+)"/.exec(frameHtml);
    expect(cspMatch).not.toBeNull();
    const scriptSrcMatch = /script-src ([^;]+);/.exec(cspMatch![1]);
    expect(scriptSrcMatch).not.toBeNull();
    const scriptSrcValue = scriptSrcMatch![1];
    expect(scriptSrcValue).not.toContain("unsafe-eval");
    expect(scriptSrcValue).not.toContain("unsafe-inline");
  });
});

describe("osk-frame.html — longpress popup overflow (Matthew 2026-11-11)", () => {
  // KMW positions the longpress popup (#kmw-popup-keys) and the keytip ABOVE
  // the OSK box's top edge — the Preview configures no predictive-text model,
  // so there is no autosuggest banner holding that space open. #osk-host-frame
  // used to clip it with overflow:hidden (a leftover from the Keyman Developer
  // debug-host scaffold), hiding every top-row longpress entirely. The e2e in
  // e2e/preview-longpress-popup.spec.ts proves the popup paints; this static
  // guard keeps the one-line fix from being reverted silently in the unit lane.
  it("#osk-host-frame lets the popup paint above the box", () => {
    const ruleMatch = /#osk-host-frame\s*\{([^}]*)\}/.exec(frameHtml);
    expect(ruleMatch, "#osk-host-frame rule must exist").not.toBeNull();
    expect(ruleMatch![1]).toContain("overflow: visible");
    expect(ruleMatch![1]).not.toContain("overflow: hidden");
  });
});

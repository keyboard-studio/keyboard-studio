// Behavioural guard for the OSK preview frame's keyboard-load serialization.
//
// osk-frame.js is a plain IIFE served from /public, not an importable module,
// so this test evaluates it in the jsdom window against a fake `window.keyman`
// and drives it with SET_KEYBOARD messages.
//
// The bug it pins: every recompile posts a new blob URL under the SAME keyboard
// id. KMW tracks an in-flight fetch by keyboard id, so two overlapping
// addKeyboards() calls share one record. When the older load failed or was
// removed, KMW dropped the record while the newer script was still loading, and
// it then rejected that valid script with "Error registering the <id> keyboard
// ... may contain an error". The frame must therefore never have two loads in
// flight.

import { describe, it, expect, beforeEach, vi } from "vitest";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import path from "node:path";

const currentDir = path.dirname(fileURLToPath(import.meta.url));
const frameJs = readFileSync(path.join(currentDir, "..", "..", "public", "osk-frame.js"), "utf-8");

interface Deferred {
  resolve: () => void;
  reject: (e: Error) => void;
}

const flush = () => new Promise<void>((r) => setTimeout(r, 0));

describe("osk-frame.js — keyboard loads never overlap", () => {
  let adds: { filename: string; settle: Deferred }[];
  let activated: string[];
  let errors: string[];

  beforeEach(async () => {
    document.head.innerHTML = "";
    document.body.innerHTML =
      '<div id="status"></div><textarea id="osk-target"></textarea><div id="osk-host"></div><div id="osk-host-frame"></div>';
    adds = [];
    activated = [];
    errors = [];
    (window as unknown as { keyman: unknown }).keyman = {
      init: () => Promise.resolve(),
      attachToControl: () => {},
      removeKeyboards: () => {},
      addKeyboards: (stub: { filename: string }) =>
        new Promise<void>((resolve, reject) => {
          adds.push({ filename: stub.filename, settle: { resolve, reject } });
        }),
      setActiveKeyboard: (id: string) => {
        activated.push(id);
        return Promise.resolve(true);
      },
    };
    vi.spyOn(window, "postMessage").mockImplementation(((msg: { type?: string; message?: string }) => {
      if (msg?.type === "ENGINE_ERROR") errors.push(String(msg.message));
    }) as typeof window.postMessage);

    // Run the IIFE, then fire the onload of the KMW <script> it appended.
    new Function(frameJs)();
    const kmw = document.head.querySelector('script[src="/kmw/18.0/keymanweb.js"]') as HTMLScriptElement;
    kmw.onload?.(new Event("load"));
    await flush();
  });

  const setKeyboard = (jsUrl: string) =>
    window.dispatchEvent(
      new MessageEvent("message", {
        data: { type: "SET_KEYBOARD", jsUrl, keyboardId: "kb", bcp47: "ewo" },
        origin: window.location.origin,
        source: window,
      }),
    );

  it("parks a newer load until the running one settles, then runs only the newest", async () => {
    setKeyboard("blob:one");
    setKeyboard("blob:two");
    setKeyboard("blob:three");
    await flush();
    expect(adds.map((a) => a.filename)).toEqual(["blob:one"]);

    // The superseded load fails (its blob was revoked): no error, no activation.
    adds[0]!.settle.reject(new Error("Cannot find the kb keyboard"));
    await flush();
    expect(adds.map((a) => a.filename)).toEqual(["blob:one", "blob:three"]);
    expect(activated).toEqual([]);

    adds[1]!.settle.resolve();
    await flush();
    expect(activated).toEqual(["Keyboard_kb"]);
    expect(errors).toEqual([]);
  });

  it("reports a failure of the newest load", async () => {
    setKeyboard("blob:one");
    await flush();
    adds[0]!.settle.reject(new Error("boom"));
    await flush();
    expect(errors).toEqual(["keyboard load failed for 'Keyboard_kb': boom"]);
  });
});

// Vitest global setup (wired via vitest.config.ts `setupFiles`).
//
// Polyfill the Web Crypto API for older local runtimes. `globalThis.crypto`
// (and its `.subtle` SubtleCrypto) is a default global only on Node >= 20 —
// NOT something jsdom provides. On Node 18 it is undefined, which breaks the
// PKCE tests in githubOAuth.test.ts (S256 challenge via crypto.subtle.digest).
// CI runs Node 22 and is unaffected; this keeps the suite robust below the repo
// minimum so a stale local runtime doesn't surface a false test failure (#510).
import { webcrypto } from "node:crypto";

if (!globalThis.crypto) {
  globalThis.crypto = webcrypto as unknown as Crypto;
}

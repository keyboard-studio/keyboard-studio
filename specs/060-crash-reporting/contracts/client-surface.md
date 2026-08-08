# Contract: client surface

What the studio's crash path exposes — the identifiers tests and callers code against. Every message
id and constant name below is pinned by the spec; copy them exactly.

---

## Message ids (FR-122)

Six new ids, all following the `area ( "." segment )+` grammar, added to
`packages/studio/src/locales/en/messages.json` (and the `fr` catalog):

| Id | Used by |
|---|---|
| `crash.report.title` | recovery-screen heading |
| `crash.report.sent.notice` | notice body |
| `crash.report.issue.link` | link to the filed issue |
| `crash.report.undo.button` | Undo control |
| `crash.report.undo.confirmed` | post-retraction confirmation |
| `crash.report.retry.notice` | stale-chunk unreachable case |

**Every one is new** — no existing id is repurposed (FR-126, spec 046: an id is a permanent handle).
The `i18n-catalog-lint` and `content-i18n-lint` gates MUST pass with them present, and no target-locale
catalog may claim a translation for an id this feature does not introduce (FR-127).

**The one exception (FR-123):** the pre-mount fallback text in `index.html` is plain, hard-coded
English and MUST NOT go through the catalog — no locale has necessarily loaded at that point.

---

## Client constants (FR-055, FR-103)

Exported — not module-private — so tests assert against the constant rather than restating its literal.

| Constant | Default | Owner |
|---|---|---|
| `CRASH_REPORT_UNDO_WINDOW_MS` | `30_000` | the notice module |
| `STALE_CHUNK_RELOAD_WINDOW_MS` | `60_000` | `src/crash/staleChunk.ts` |

`sessionStorage` keys: `ks.staleChunkReloadedAt` (FR-052) and the per-fingerprint dedupe cache
(FR-101).

**One key, one cooldown, one owner.** `src/crash/staleChunk.ts` is the only module allowed to hold
the reload gate. A second module tracking the same failure class with its own key gives the same
deploy two reloads and lets the two pattern lists drift apart — so the import-site helpers below live
here rather than beside their callers.

## Carve-out entry points (FR-050 – FR-053)

Two, because the window only ever sees what nobody caught. Both funnel through the same one-shot gate,
so a failure observed by both costs exactly one reload.

| Export | Caller | Takes |
|---|---|---|
| `handleStaleChunkFailure(message, opts?)` | `globalHandlers.ts`'s `onerror` / `unhandledrejection` / `vite:preloadError` | the flattened message |
| `recoverFromStaleChunk(err, opts?)` | an import site's own `catch` — `useKeyboardArtifact`'s engine-ready promise | the thrown value, `cause` chain intact |
| `importOrReload(load)` | a lazy load whose site swallows or rewrites the rejection — `services.ts`'s `importEngine()` seam | the loader thunk; always rethrows |
| `setStaleChunkReload(reload)` | `main.tsx`, once at boot | what a recovery reload does (flush the active draft, then reload) |

`setStaleChunkReload` is registration rather than an import because `draftPersistence.ts` is reachable
from `services.ts`, which reaches this module — a direct import would close a dependency cycle, and
the FR-013 self-containment gate keeps this module's graph small regardless.

---

## Capture surfaces

| Surface | Installed where | Behaviour |
|---|---|---|
| `ErrorBoundary` | **one only**, inside `AppRoot`'s `<I18nProvider>` | Covers `StudioShell`, `LintDemo`, and `OAuthCallbackScreen` with one boundary, not three (FR-001). |
| `window.onerror` | bootstrap | Synchronous errors outside the React tree (FR-002). |
| `unhandledrejection` | bootstrap | Un-awaited rejections (FR-003). |
| `vite:preloadError` | bootstrap | Calls `event.preventDefault()`, routes to the stale-chunk carve-out — never ordinary filing (FR-004). |
| `main.tsx` try/catch | around `mountApp()` / `mountCallbackScreen()`, active before `createRoot(...).render(...)` | Pre-mount path (FR-060). |

**Not a capture surface.** `useKeyboardArtifact`'s `Stage: "error"` MUST NOT auto-file on every
occurrence — fetch and compile errors there are frequently transient and already have a modelled Retry
UX (FR-005). `warmExemplarSource().catch(() => {})` and other deliberate self-swallowers MUST continue
never reaching the rejection handler (FR-008).

---

## `loadEngine()` rejection forwarding (FR-005a, P0-3)

`packages/studio/src/hooks/useKeyboardArtifact.ts` today swallows the real `import()` rejection into
`null` (its `catch` at ~line 58) and the caller throws a synthetic fixed string
(`"Engine failed to load — check browser console for WASM errors."`, ~line 535). Because the FR-051
classifier can only see the text that reaches it, that synthetic string means a genuine stale-chunk
engine failure can never match the pattern — it always falls through to ordinary filing, which is
exactly what User Story 3 exists to prevent.

**Contract:** the original rejection's `message` (and its `cause`, where the rejection wraps another
error) MUST be preserved and forwarded to the classifier **before** any pattern match runs. The caller
MAY still show the friendly synthetic string to the author in the `Stage: "error"` UI — but the
classifier MUST see the original text.

**Stale-chunk pattern (FR-051):**

```
/failed to fetch dynamically imported module|error loading dynamically imported module|importing a module script failed|failed to load module script|unable to preload css/i
```

The last two alternatives were added after a production report of this exact failure. `failed to load
module script` is what Chrome says when the SPA catch-all rewrite answers a missing chunk with
`index.html` — the browser complains about the MIME type instead of the 404, so the original three
alternatives matched nothing and the carve-out never fired. (`vercel.json` no longer rewrites
`/assets/*`, but a tab open across that deploy still reports it this way.) `unable to preload css` is
Vite's own preload helper wording for the same class.

---

## Recovery screen vs. notice

| | Recovery screen (FR-072) | Notice (FR-073) |
|---|---|---|
| Fires on | render throw — the tree is gone | `onerror` / `unhandledrejection` — page still usable |
| ARIA | `role="alert"` | `aria-live="polite"` |
| Focus | **moves to its heading on mount** | **never moves focus** |
| Rationale | whole-page state change, [docs/accessibility.md](../../../docs/accessibility.md) rule 4 | stealing focus would be disruptive, not helpful |

Both: no confirmation dialog gates the send (FR-070); the notice names that a report was sent and links
the filed issue (FR-071); every interactive element is a real keyboard-operable control, no click-only
`div` (FR-125).

**Send is fire-and-forget (FR-078).** A network failure, 5xx, or 503 MUST NOT surface to the author as
an actionable error and MUST NOT be retried in a loop — a retry loop is itself the flood the
flood-control layers exist to prevent.

---

## Undo (FR-074 – FR-077)

Available for exactly `CRASH_REPORT_UNDO_WINDOW_MS` after the notice appears; asserted absent in a
fake-timer test immediately after (SC-013).

| This session's action | Undo does |
|---|---|
| `"created"` | close the issue + add a "retracted by reporter" comment |
| `"commented"` | remove **only** this session's comment; the issue is untouched |

**Gated on holding the server's capability token, not on knowing an issue number** (FR-074a). The
affordance renders only when the report response carried a `retractionToken`, and the retract request
consists of that token and nothing else — the server derives the issue, action, and comment id from its
signature. A response without a token therefore offers **no** Undo rather than a button that silently
does nothing, which is the same failure the window's expiry exists to prevent. The retract callback
correspondingly takes **no arguments**: this surface has no say in which report is retracted.

The UI copy MUST NOT imply deletion — true deletion is not available to an installation token. Once
the window elapses or the notice is dismissed, the affordance disappears and the report stands.

---

## Self-containment gate (FR-010 – FR-014)

The contract the FR-013 test enforces against `packages/studio/src/crash/`:

- No dynamic `import()` anywhere in the module.
- No import edge — **direct or transitive** — reaching `@keyboard-studio/engine`.
- Specifically no import of `decisionLogStore.ts` (which value-imports the engine at line 37),
  `workingCopyStore.ts`, or any other module whose own graph reaches the engine. Structural context
  is read by the **caller** and passed in as plain data (FR-012, FR-042).
- `crypto.subtle.digest("SHA-256", ...)` is called **directly**; `computeSha256Hex` from
  `packages/engine/src/codec/hash.ts` is never imported, despite being functionally identical
  (FR-011).
- The module stays functional when `loadEngine()` has already failed for the session (FR-014).

**The gate must be demonstrated failing** against a deliberately violating version before it is
trusted as green (FR-013). An assertion that has never been seen red is not evidence.

---

## Build identity (FR-110 – FR-114)

| Identifier | Where |
|---|---|
| `__KS_COMMIT_SHA__` | Vite `define` in `packages/studio/vite.config.ts`, from `VERCEL_GIT_COMMIT_SHA`, fallback `"dev"` |
| ambient declaration | `packages/studio/src/vite-env.d.ts` |
| `appVersion` | `<pkg.version>+<sha7>`, composed in `src/crash/buildVersion.ts` |

A compile-time constant, not an `import.meta.env` read through a helper module — it must be present in
a pre-mount crash, before any env-reading module has necessarily executed. No report ships without it
(SC-011).

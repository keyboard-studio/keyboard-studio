# Contract: walk integration (spine reachability + publish paths)

The integration contract for US1/US2. 034 does not re-specify the touch stage (035) or the PR path (024); it guarantees they are **reachable** and **wired** into the one spine and output screen.

## Spine reachability (FR-001, FR-007)

Authoritative source: [steps/manifest.ts](../../packages/studio/src/steps/manifest.ts) + [steps/advance.ts](../../packages/studio/src/steps/advance.ts), guarded by `validateManifestShape()`.

| Guarantee | Assertion |
|---|---|
| SR-1 | `advance()` produces the ordered spine `identity -> choose_base -> track -> [project_name if copy] -> characters -> carve -> mechanisms -> touch -> help -> done -> output`. |
| SR-2 | Track 1 (copy) inserts `project_name`; Track 2 (adapt) skips it. |
| SR-3 | `mechanisms` completion fires the desktop lock (`lockDesktop()`), then advances to `touch` (NOT past it). The touch stage is never skipped. |
| SR-4 | A gated script (Ethi/Hani/Hang) routes `identity -> unsupported` and renders the "not supported" stub — never an empty gallery (FR-012). |
| SR-5 | No reorder of the locked physical -> touch -> docs tail (Constitution / spec Decision 6). |

## Publish paths (FR-008)

Authoritative source: [components/OutputScreen.tsx](../../packages/studio/src/components/OutputScreen.tsx) + engine [output/](../../packages/engine/src/output/).

| Guarantee | Assertion |
|---|---|
| PP-1 | The output screen exposes a **ZIP download** that produces a valid, compilable keyboard (real `toZip`). Always available; no external dependency. |
| PP-2 | The output screen exposes a **submit as PR** affordance (per [024](../024-option-a-github-app/spec.md)). |
| PP-3 | When the OAuth backend (`VITE_OAUTH_BACKEND_URL` / managed-PR serverless proxy) is unavailable, the PR affordance shows an honest "unavailable" state and does NOT appear to succeed. ZIP remains fully functional. |
| PP-4 | The PR submission serializes the same working copy the ZIP path serializes (one working copy — Article III). |

## Track integrity (FR-004)

| Guarantee | Assertion |
|---|---|
| TI-1 | Track 1 `instantiateFromBase` and Track 2 `instantiateFromExisting` both produce a live working copy against the **real engine**. |
| TI-2 | Track 2 MUST NOT silently no-op. The mock-engine skip path in [steps/reducer.ts](../../packages/studio/src/steps/reducer.ts) (`console.warn "Track 2 skipped: no parsed IR"`) is a mock-only artifact; real-engine verification must exercise a genuine adapt. |

## Verification ownership

- SR-1..SR-5, TI-1..TI-2: manifest/advance unit tests + the extended Playwright walk.
- PP-1, PP-4: engine output tests + `copy-edit.spec.ts`.
- PP-2, PP-3: owned by [024](../024-option-a-github-app/spec.md); 034 asserts only reachability and honest degradation.

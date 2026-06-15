# Contract: kbgen CLI (external interface)

kbgen's only external interface is its CLI. The port **must preserve this contract
exactly** — same subcommands, flags, inputs, and output artifacts (FR-005 / SC-003).
This document captures the contract as the behaviour-preservation baseline; it is
not a redesign.

## Invocation

- Pre-port: `node cli.js <args>` (CommonJS).
- Post-port: `kbgen <args>` via the built `dist/cli.js` bin, or `tsx cli.ts <args>` in dev.
- **Contract**: identical argument surface and exit codes before and after the port.

## Commands / flags (preserved as-is)

The port preserves whatever `cli.js` exposes today (analyze / place / emit / corpus-diff
paths and their flags). No flags are added, removed, or renamed by this issue.

- `--emit-source` MUST continue to emit Keyman **source** only (`.kmn` /
  `.keyman-touch-layout` / `.kvks`). It MUST NOT gain any compile step — compilation
  stays with the WASM `kmcmplib` service (§13 / FR-006 / SC-005).

## Output contract (the oracle)

- For the Milestone-1 Latin-extended / QWERTY fixture, `placement-map.json` MUST be
  **byte-equivalent** before and after the port (SC-003).
- Emitted Keyman source files MUST be equivalent for the same fixture.

## Console-output convention (Article VIII)

- No emoji in CLI output. Status markers use `[OK]` / `[WARN]` / `[ERROR]`.
  (If the legacy tool already violates this, the port may correct it — that is a
  conventions fix, not a contract change, and does not affect the JSON oracle.)

## Verification

`quickstart.md` documents the runnable check: build, run the fixture, diff the
`placement-map.json` against the pre-port baseline.

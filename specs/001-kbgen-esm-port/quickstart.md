# Quickstart / Validation: kbgen ESM TypeScript port

Runnable checks that prove the port works end-to-end. Run from repo root.

## Prerequisites

- pnpm 9, Node ≥ 20
- Clean checkout of branch `km/kbgen-esm-port`

## 1. Capture the pre-port baseline (oracle)

Before converting, run the legacy tool on the Milestone-1 fixture and save its output.

**Fixture args used (Hausa-style explicit inventory, all letters occupied — no CLDR data required):**

```bash
# Temporarily restore CJS package.json, then:
node utilities/kbgen/cli.js --id demo --chars "ɓƁɗƊƙƘ" --used "abcdefghijklmnopqrstuvwxyz" --out /tmp/kbgen-baseline
cp /tmp/kbgen-baseline/source/demo.placement-map.json /tmp/placement-map.baseline.json
```

Rationale: the `data/cldr/` directory is not vendored in the repo (only `data/unicode/` is).
The explicit `--chars`/`--used` path exercises the full analysis cascade (NAME signals)
without requiring a network fetch, and matches the Milestone-1 Latin-extended / QWERTY
coverage described in [README.md](../../utilities/kbgen/README.md).

## 2. Build & typecheck the ported tool

```bash
pnpm --dir utilities/kbgen build       # tsc -b → dist/, no errors
pnpm --dir utilities/kbgen typecheck   # tsc --noEmit, passes under tsconfig.base
```

**Expected**: both succeed; no remaining `require()`/`module.exports` (FR-001).

## 3. Run tests under vitest

```bash
pnpm --dir utilities/kbgen test        # vitest run
```

**Expected**: all migrated anchor-cascade assertions pass; legacy `node test/anchors.test.js`
is gone (FR-004 / SC-002).

## 4. Behaviour-preservation check (the key gate)

```bash
node --import tsx utilities/kbgen/cli.ts <same fixture args> > /tmp/placement-map.ported.json
diff /tmp/placement-map.baseline.json /tmp/placement-map.ported.json && echo "[OK] byte-equivalent"
```

**Expected**: empty diff → `placement-map.json` byte-equivalent (SC-003).

## 5. No-compile boundary check

```bash
grep -rniE "kmcmplib|\.kmp|compile" utilities/kbgen/*.ts utilities/kbgen/sources/*.ts
```

**Expected**: no compilation step introduced; kbgen emits source only (FR-006 / SC-005).

## 6. Workspace stays green

```bash
pnpm -r build && pnpm -r typecheck && pnpm -r test
```

**Expected**: green — confirming kbgen's `utilities/` home keeps it out of the
recursive glob (FR-008).

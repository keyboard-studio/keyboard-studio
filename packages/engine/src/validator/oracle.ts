// kmcmplib WASM oracle wrapper.
//
// validateWithOracle(source, options?) is the public entry point for
// Issue #16. It runs the TS-portable checks (currently the `lexical`
// group: checks #1-#4) and, when the WASM oracle is available, runs the
// WASM-side checks (the WASM-half of `reference` + `behavior` +
// `passthrough` groups) concurrently per spec.md §14 D3.
//
// On WASM load failure: catches OracleLoadError exactly once at lazy
// init, sets `_wasmDown`, and from then on returns only TS-portable
// findings plus one supplementary KM_WARN_ORACLE_UNAVAILABLE finding per
// call. OracleLoadError is never re-thrown from validateWithOracle.
//
// No 300 ms debounce here — debounce lives in the consumer (validator
// package / SPA), per spec §14 D3.

import type { LintFinding } from "@keyboard-studio/contracts";
import {
  ALL_GROUPS,
  TS_GROUPS,
  WASM_GROUPS,
  type GroupName,
  type LintOptions,
} from "./types.js";
import { translateWasmFinding } from "./codeMap.js";
import {
  loadWasmOracle as defaultLoadWasmOracle,
  type WasmOracleHandle,
} from "./wasmLoader.js";
import { OracleLoadError } from "./OracleLoadError.js";
import { runLexicalChecks } from "./index.js";

function severityRank(s: LintFinding["severity"]): number {
  switch (s) {
    case "fatal":   return 0;
    case "error":   return 1;
    case "warning": return 2;
    case "hint":    return 3;
    case "info":    return 4;
    default: {
      const _exhaustive: never = s;
      throw new Error(`Unexpected severity: ${String(_exhaustive)}`);
    }
  }
}

/** Sort findings: severity descending, then by code for stability. */
function sortFindings(findings: LintFinding[]): LintFinding[] {
  return findings
    .slice()
    .sort((a, b) => {
      const rankDiff = severityRank(a.severity) - severityRank(b.severity);
      if (rankDiff !== 0) return rankDiff;
      return a.code.localeCompare(b.code);
    });
}

function resolveGroups(opts: LintOptions | undefined): readonly GroupName[] {
  if (opts?.groups === undefined) return ALL_GROUPS;
  const requested = opts.groups;
  for (const g of requested) {
    if (!ALL_GROUPS.includes(g)) {
      throw new TypeError(
        `Unknown group "${g}"; valid groups: ${ALL_GROUPS.join(", ")}.`
      );
    }
  }
  // Deduplicate while preserving the canonical ALL_GROUPS order.
  const set = new Set(requested);
  return ALL_GROUPS.filter((g) => set.has(g));
}

function anyRequestedIsTs(requested: readonly GroupName[]): boolean {
  return requested.some((g) => TS_GROUPS.has(g));
}

function anyRequestedIsWasm(requested: readonly GroupName[]): boolean {
  return requested.some((g) => WASM_GROUPS.has(g));
}

const ORACLE_UNAVAILABLE_FINDING: LintFinding = {
  code: "KM_WARN_ORACLE_UNAVAILABLE",
  severity: "warning",
  layer: "A",
  message:
    "WASM oracle unavailable — only TS-portable checks (#1–#9) ran. " +
    "Findings for the 5 WASM-only checks may be missing.",
  hint: "Reload the studio to retry; if the failure persists, file a bug.",
};

// ---------------------------------------------------------------------------
// Oracle instance — wraps a WasmOracleHandle (or `null` when WASM is down).
// `_createOracle(handle)` is the test seam: unit tests pass a mock handle
// directly, bypassing the lazy loader. The default exported `oracle`
// instance is wired to the production `defaultLoadWasmOracle`.
// ---------------------------------------------------------------------------

type LoadHandle = () => Promise<WasmOracleHandle>;

interface OracleInstance {
  lint(source: string, options?: LintOptions): Promise<LintFinding[]>;
}

function makeOracle(load: LoadHandle): OracleInstance {
  let initPromise: Promise<WasmOracleHandle | null> | null = null;
  let wasmDown = false;
  let handle: WasmOracleHandle | null = null;

  async function ensureHandle(): Promise<WasmOracleHandle | null> {
    if (wasmDown) return null;
    if (handle !== null) return handle;
    if (initPromise === null) {
      initPromise = load()
        .then((h) => {
          handle = h;
          return h;
        })
        .catch((err: unknown) => {
          // OracleLoadError (the typed case) or any other thrown value:
          // mark WASM as down and let the caller see TS-only findings
          // plus the supplementary KM_WARN_ORACLE_UNAVAILABLE. We
          // deliberately do not log here — consumers can observe the
          // KM_WARN_ORACLE_UNAVAILABLE finding for diagnostics, and the
          // engine package has no logger of its own.
          void err;
          wasmDown = true;
          return null;
        });
    }
    return initPromise;
  }

  async function lint(
    source: string,
    options?: LintOptions
  ): Promise<LintFinding[]> {
    const requested = resolveGroups(options);
    const tsRequested = anyRequestedIsTs(requested);
    const wasmRequested = anyRequestedIsWasm(requested);

    const tsTask: Promise<LintFinding[]> = (async () => {
      if (!tsRequested) return [];
      const out: LintFinding[] = [];
      if (requested.includes("lexical")) {
        out.push(...runLexicalChecks(source));
      }
      // The TS half of `reference` (checks #5/#6/#8/#9) will plug in
      // here as those issues land.
      return out;
    })();

    const wasmTask: Promise<LintFinding[]> = (async () => {
      if (!wasmRequested) return [];
      const h = await ensureHandle();
      if (h === null) return [];

      const wasmGroups = requested.filter((g) => WASM_GROUPS.has(g));
      try {
        const raws = await h.lintWasmGroups(source, wasmGroups);
        const requestedSet = new Set(requested);
        const out: LintFinding[] = [];
        for (const raw of raws) {
          const { finding, group } = translateWasmFinding(raw, "");
          if (requestedSet.has(group)) {
            out.push(finding);
          }
        }
        return out;
      } catch (err: unknown) {
        // Post-load WASM fault — treat identically to a load failure:
        // mark WASM down and let the TS-portable findings survive.
        // No logging: the engine package has no logger (see ensureHandle).
        void err;
        wasmDown = true;
        return [];
      }
    })();

    const [tsFindings, wasmFindings] = await Promise.all([tsTask, wasmTask]);

    const merged: LintFinding[] = [...tsFindings, ...wasmFindings];

    if (wasmRequested && wasmDown) {
      merged.push(ORACLE_UNAVAILABLE_FINDING);
    }

    return sortFindings(merged);
  }

  return { lint };
}

// ---------------------------------------------------------------------------
// Public surface
// ---------------------------------------------------------------------------

/**
 * Default oracle instance, wired to the production WASM loader. Lazily
 * initializes on first call. Subsequent calls reuse the cached handle.
 */
export const oracle: OracleInstance = makeOracle(() => defaultLoadWasmOracle());

/**
 * Issue #16 deliverable. Runs the requested groups against `source` and
 * returns sorted LintFindings. Defaults to all groups when `options.groups`
 * is omitted.
 *
 * @throws TypeError if `options.groups` contains an unknown group name.
 *   Never throws OracleLoadError — degraded mode handles WASM failure.
 */
export function validateWithOracle(
  source: string,
  options?: LintOptions
): Promise<LintFinding[]> {
  return oracle.lint(source, options);
}

/**
 * Test seam — construct an oracle backed by a caller-supplied handle.
 * Bypasses the lazy WASM loader entirely. Use this in unit tests with a
 * mock WasmOracleHandle.
 *
 * Also the Option B vendor escape hatch: a consumer can call this with
 * their own kmcmplib loader instead of the bundled npm artifact.
 *
 * Pass `null` to simulate the WASM-down condition without going through
 * the loader (degraded mode is set immediately).
 */
export function _createOracle(
  handle: WasmOracleHandle | null
): OracleInstance {
  if (handle === null) {
    return makeOracle(() =>
      Promise.reject(
        new OracleLoadError("test seam: WASM disabled", "wasm-load-failed")
      )
    );
  }
  return makeOracle(() => Promise.resolve(handle));
}

/**
 * Test seam — construct an oracle backed by a caller-supplied LoadHandle.
 * Bypasses the default `loadWasmOracle()` while still exercising the lazy
 * init + catch-then-degrade path inside `makeOracle()`. Use this to test
 * loader failure modes (e.g. a loader that rejects with a typed
 * OracleLoadError vs. a generic Error).
 */
export function _createOracleWithLoader(load: LoadHandle): OracleInstance {
  return makeOracle(load);
}

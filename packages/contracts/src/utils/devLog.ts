// devLog — console output that runs only outside a production build.
//
// The studio ships to users as a Vite production bundle, where stray
// `console.*` output is unwanted noise (and the repo's `no-console` lint
// flags loose calls). Intentional diagnostics route through this single
// dev gate instead: they print during local development, tests, and Node
// CLIs, and go inert in a production bundle — so a console call is a
// dev-only affordance, not something shipped to end users.
//
// Environment detection (browser + Node, no bundler assumptions):
//   - Vite statically replaces `import.meta.env.PROD` at build time, so a
//     production studio bundle inlines `true` and these helpers no-op.
//   - Outside Vite (Node CLIs, vitest) `import.meta.env` is undefined and
//     the read throws; we treat "can't tell" as dev so tooling keeps its
//     logs. A Node process with `NODE_ENV === "production"` still suppresses.
//
// This lives in contracts (the dependency root) so engine, studio, and any
// other package share one implementation rather than re-deriving the gate.
// contracts is compiled without the DOM/node type libs, so `console` and
// `process` are reached through `globalThis` with a narrow local cast.

type ConsoleMethod = "log" | "info" | "warn" | "error" | "debug";

const globalEnv = globalThis as unknown as {
  console: Record<ConsoleMethod, (...args: unknown[]) => void>;
  process?: { env?: Record<string, string | undefined> };
};

/**
 * The gate's decision, split out from the environment reads so it can be
 * unit-tested. Vite replaces `import.meta.env.PROD` with a literal at build
 * time, so the read itself is a compile-time constant that no test can vary —
 * only the decision it feeds is testable. Exported for that purpose; callers
 * should use `devLog` rather than reimplementing the gate.
 *
 * @param viteProd `import.meta.env.PROD`, or `undefined` outside Vite.
 * @param nodeEnv `process.env.NODE_ENV`, or `undefined` when unset.
 */
export function isProductionEnv(
  viteProd: boolean | undefined,
  nodeEnv: string | undefined,
): boolean {
  if (viteProd === true) return true;
  // "Can't tell" (no Vite flag, no NODE_ENV) falls through to dev, so Node
  // CLIs and tests keep their logs.
  return nodeEnv === "production";
}

function isProduction(): boolean {
  let viteProd: boolean | undefined;
  try {
    // Vite replaces this member expression with a literal at build time;
    // the cast keeps tsc happy without pulling in Vite's ambient env types.
    viteProd = (import.meta as unknown as { env: { PROD?: boolean } }).env.PROD;
  } catch {
    // Not a Vite context (Node CLI / vitest): `import.meta.env` is undefined
    // and the property read throws — leave viteProd undefined and let
    // NODE_ENV decide.
  }

  return isProductionEnv(viteProd, globalEnv.process?.env?.NODE_ENV);
}

function gated(method: ConsoleMethod) {
  return (...args: unknown[]): void => {
    if (isProduction()) return;
    globalEnv.console[method](...args);
  };
}

/**
 * Console output that runs in dev / test / CLI and is inert in a production
 * build. Mirrors the `console` surface the codebase actually uses.
 */
export const devLog = {
  log: gated("log"),
  info: gated("info"),
  warn: gated("warn"),
  error: gated("error"),
  debug: gated("debug"),
};

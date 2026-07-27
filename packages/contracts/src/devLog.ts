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

function isProduction(): boolean {
  try {
    // Vite replaces this member expression with a literal at build time;
    // the cast keeps tsc happy without pulling in Vite's ambient env types.
    if (
      (import.meta as unknown as { env: { PROD?: boolean } }).env.PROD === true
    ) {
      return true;
    }
  } catch {
    // Not a Vite context (Node CLI / vitest): `import.meta.env` is undefined
    // and the property read throws — fall through to the Node check below.
  }

  return globalEnv.process?.env?.NODE_ENV === "production";
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

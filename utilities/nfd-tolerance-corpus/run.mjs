// Entry point for the NFC/NFD context-tolerance corpus harness.
//
// WHY THIS FILE EXISTS. The other utilities/* tools run straight under `tsx`.
// This one cannot: it reaches the engine's simulator, whose vendored
// KeymanWeb sources are addressed by the bare specifiers `keyman/engine/*`
// and re-export types without `export type`. esbuild (what tsx uses)
// transpiles file by file and cannot tell a type re-export from a value one,
// so Node throws `does not provide an export named 'BeepHandler'` before the
// first line of the harness runs. Vite's SSR module runner both resolves the
// aliases and tolerates those re-exports, and `vite` is already a root
// devDependency - so the tool boots through it rather than adding a
// dependency (vite-node) just to get a loader.
//
// vite.config.ts holds the aliases; vitest.config.ts extends the same file,
// so the CLI and the test suite resolve identically.

import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { createServer } from "vite";

const HERE = dirname(fileURLToPath(import.meta.url));

const server = await createServer({
  configFile: resolve(HERE, "vite.config.ts"),
  server: { middlewareMode: true },
  appType: "custom",
  logLevel: "warn",
});

try {
  const { main } = await server.ssrLoadModule(resolve(HERE, "cli.ts"));
  process.exitCode = await main(process.argv.slice(2));
} finally {
  await server.close();
}

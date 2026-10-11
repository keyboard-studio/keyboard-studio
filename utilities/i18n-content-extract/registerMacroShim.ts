// Preload for the i18n-content-extract CLI (see the content-i18n-freshness
// and extract scripts): registers macroShimHooks.ts so the Lingui macro
// specifiers resolve to this tool's shim before cli.ts — and with it the
// studio question registry — is loaded. Must run before any graph module
// resolves, hence a --import preload rather than an import inside cli.ts.
import { register } from "node:module";

register("./macroShimHooks.ts", import.meta.url);

// Upstream kmc-kmn message tables, loaded lazily.
//
// kmc-kmn reports every compiler message as a `CompilerEvent` whose numeric
// `code` packs severity | namespace | base (developer-utils'
// `CompilerErrorMask`), e.g. ERROR_StoreDoesNotExist = 0x50201D =
// Error(0x500000) | KmnCompiler(0x2000) | 0x01D. There is no `severity` field
// and no symbolic name on the wire. Both are decoded here from upstream's own
// tables — `CompilerError` / `CompilerErrorSeverity` from
// @keymanapp/developer-utils and the `KmnCompilerMessages` /
// `KmwCompilerMessages` constant tables exported by @keymanapp/kmc-kmn — never
// from a local copy of the values.
//
// Both packages are imported DYNAMICALLY, like kmc-kmn in ./index.ts: a static
// import of developer-utils pulls ~340 KB (raw) of its XML/project readers
// into the studio's entry chunk. Everything that needs these tables runs after
// the compiler has loaded anyway (compile() / the validator oracle), so they
// ride the same lazy chunk.

import type { LintSeverity } from "@keyboard-studio/contracts";

export interface KmcMessageTables {
  /** Studio severity for a numeric kmc-kmn code. Debug/Verbose/Info → "info". */
  severity(code: number): LintSeverity;
  /**
   * Upstream symbolic name for a numeric kmc-kmn code (e.g.
   * `0x502049` → `"ERROR_InvalidIf"`), or undefined for a code neither
   * message table defines.
   */
  name(code: number): string | undefined;
}

const MESSAGE_NAME = /^(FATAL|ERROR|WARN|HINT|INFO|VERBOSE|DEBUG)_/;

let _tablesPromise: Promise<KmcMessageTables> | null = null;

async function buildTables(): Promise<KmcMessageTables> {
  const [devUtils, kmn] = await Promise.all([
    import("@keymanapp/developer-utils"),
    import("@keymanapp/kmc-kmn"),
  ]);
  const { CompilerError, CompilerErrorSeverity } = devUtils;

  const names = new Map<number, string>();
  // KmwCompilerMessages extends KmnCompilerMessages; getOwnPropertyNames on
  // each class yields only that class's own constants, so walk both.
  for (const table of [kmn.KmnCompilerMessages, kmn.KmwCompilerMessages] as const) {
    for (const key of Object.getOwnPropertyNames(table)) {
      const value = (table as unknown as Record<string, unknown>)[key];
      if (typeof value === "number" && MESSAGE_NAME.test(key) && !names.has(value)) {
        names.set(value, key);
      }
    }
  }

  return {
    severity(code: number): LintSeverity {
      const severity = CompilerError.severity(code);
      if (severity >= CompilerErrorSeverity.Fatal) return "fatal";
      if (severity >= CompilerErrorSeverity.Error) return "error";
      if (severity >= CompilerErrorSeverity.Warn) return "warning";
      if (severity >= CompilerErrorSeverity.Hint) return "hint";
      return "info";
    },
    name(code: number): string | undefined {
      return names.get(code);
    },
  };
}

/** Load (once) and return the upstream message tables. */
export function loadKmcMessageTables(): Promise<KmcMessageTables> {
  if (_tablesPromise === null) {
    _tablesPromise = buildTables().catch((err: unknown) => {
      _tablesPromise = null; // allow a later retry
      throw err;
    });
  }
  return _tablesPromise;
}

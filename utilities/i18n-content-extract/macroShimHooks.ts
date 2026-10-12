// Node module customization hooks for the i18n-content-extract CLI:
// redirect the two Lingui macro specifiers to this tool's runtime shim
// (linguiMacroShim.ts) so the studio question registry can be loaded under
// plain tsx/Node. Registered by registerMacroShim.ts (a --import preload);
// see linguiMacroShim.ts for why the shim exists and what it preserves.
// Every other specifier falls through to the next resolver untouched
// (tsx's own hooks included).

const shimUrl = new URL("./linguiMacroShim.ts", import.meta.url).href;

const MACRO_SPECIFIERS = new Set(["@lingui/core/macro", "@lingui/react/macro"]);

export async function resolve(
  specifier: string,
  context: unknown,
  nextResolve: (specifier: string, context: unknown) => Promise<unknown>,
): Promise<unknown> {
  if (MACRO_SPECIFIERS.has(specifier)) {
    return { url: shimUrl, shortCircuit: true };
  }
  return nextResolve(specifier, context);
}

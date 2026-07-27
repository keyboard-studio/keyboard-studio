// Type declarations for facet-script-lookup.mjs (plain-node module shared by
// the localKeyboards Vite plugin and build-keyboards-index.mjs).

export function loadFacetScripts(facetIndexPath: string): Map<string, string>;
export function scriptFromDeclaredTags(
  languages: readonly string[],
): string | null;
export function resolveKeyboardScript(
  id: string,
  languages: readonly string[],
  facetScripts: Map<string, string>,
): string;

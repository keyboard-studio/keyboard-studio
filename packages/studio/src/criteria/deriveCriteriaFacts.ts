// deriveCriteriaFacts — the package facts the criteria resolver's
// applicability predicates read (spec 084, plan D7), derived from the
// artifact VFS under judgment.
//
// Pure: it reads only the VFS it is handed. Shared by the authored host
// (CriteriaScreen, via useAuthoredCriteria) and the Output summary card,
// so both surfaces judge with the same facts.
//
// `deprecated` and `partnerPackage` are false for an authored project in
// v1, deliberately: deprecation and partner-organization status are facts
// about a PUBLISHED keyboard in the community repository, and a keyboard
// being authored in the studio is neither — it has not been published at
// all, let alone deprecated or adopted by a partner. Stating false here
// is a fact about the surface, not a guess from missing data; the D7
// predicates then resolve those sections Not applicable with that reason
// shown, rather than leaving them silently unjudged.

import type { VirtualFS } from "@keyboard-studio/contracts";

import type { CriteriaFacts } from "./criteriaTypes.ts";

const FONT_EXTENSIONS: readonly string[] = [".ttf", ".otf", ".woff", ".woff2"];

export function deriveCriteriaFacts(vfs: VirtualFS): CriteriaFacts {
  const fontBundled = vfs
    .list()
    .some((path) =>
      FONT_EXTENSIONS.some((ext) => path.toLowerCase().endsWith(ext)),
    );
  return { fontBundled, deprecated: false, partnerPackage: false };
}

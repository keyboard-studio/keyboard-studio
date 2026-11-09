// openBaselineInventory: the expected-characters inventory the Open baseline
// is judged with (spec 111 FR-032, FR-018a). The same build the live criteria
// run uses on Open (hooks/useCriteriaFindings.ts): the exemplar union of the
// keyboard's listed languages, so a letter the keyboard cannot type is a
// failing 18.6 finding at the baseline, which is what the Missing letters page
// is gated on.

import { buildOpenCriteriaInventory } from "./buildOpenInventory.ts";
import type { InventoryOutcome } from "./assembleLintContext.ts";
import { sourcedExemplars, type SourcedInventory } from "../lib/services.ts";

export async function openBaselineInventory(
  languageTags: readonly string[],
  script: string,
): Promise<InventoryOutcome> {
  const sourcedByTag = new Map<string, SourcedInventory | null>();
  await Promise.all(
    languageTags.map(async (tag) => {
      try {
        sourcedByTag.set(tag, await sourcedExemplars(tag));
      } catch {
        // A failed load degrades to "no entry" for that tag, as the live run does.
        sourcedByTag.set(tag, null);
      }
    }),
  );
  const { build } = buildOpenCriteriaInventory({ languageTags, script, sourcedByTag });
  return build.kind === "built"
    ? { kind: "built", inventory: build.inventory }
    : { kind: "skipped", missingTag: build.missingTag };
}

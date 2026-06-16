// see spec.md section 8 step 1 — BaseBrowserService mock

import type { BaseBrowserService } from "../baseBrowser";
import type { BaseKeyboard, KeymanPlatformTarget } from "../baseKeyboard";
import {
  sampleBaseKeyboards,
} from "../fixtures/index";

/**
 * In-memory index keyed by BaseKeyboard.id for O(1) getById lookups.
 * Built once at module load from the fixture list.
 */
const byId = new Map<string, BaseKeyboard>(
  sampleBaseKeyboards.map((kb) => [kb.id, kb])
);

/**
 * In-memory mock of {@link BaseBrowserService}.
 * Returns fixture data without invoking the real implementation.
 * @see spec.md §8 step 1
 */
export const mockBaseBrowser: BaseBrowserService = {
  listAll(): Promise<BaseKeyboard[]> {
    // Return a stable copy sorted by id, with basic_kbdus guaranteed present.
    const all = [...sampleBaseKeyboards].sort((a, b) =>
      a.id.localeCompare(b.id)
    );
    return Promise.resolve(all);
  },

  search(
    query: string,
    opts?: { script?: string; target?: KeymanPlatformTarget }
  ): Promise<BaseKeyboard[]> {
    const q = query.toLowerCase();
    let results = sampleBaseKeyboards.filter((kb) => {
      const matchesQuery =
        q === "" ||
        kb.id.toLowerCase().includes(q) ||
        kb.displayName.toLowerCase().includes(q);
      const matchesScript =
        opts?.script === undefined || kb.script === opts.script;
      const matchesTarget =
        opts?.target === undefined || kb.targets.includes(opts.target);
      return matchesQuery && matchesScript && matchesTarget;
    });
    results = results.sort((a, b) => a.id.localeCompare(b.id));
    return Promise.resolve(results);
  },

  getById(id: string): Promise<BaseKeyboard | undefined> {
    return Promise.resolve(byId.get(id));
  },
};


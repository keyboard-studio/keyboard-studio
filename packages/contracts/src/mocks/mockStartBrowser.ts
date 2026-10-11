// see spec.md section 8 step 1 — StartBrowserService mock

import type { StartBrowserService } from "../startBrowser";
import type { StartKeyboard, KeymanPlatformTarget } from "../startKeyboard";
import {
  sampleStartKeyboards,
} from "../fixtures/index";

/**
 * In-memory index keyed by StartKeyboard.id for O(1) getById lookups.
 * Built once at module load from the fixture list.
 */
const byId = new Map<string, StartKeyboard>(
  sampleStartKeyboards.map((kb) => [kb.id, kb])
);

/**
 * In-memory mock of {@link StartBrowserService}.
 * Returns fixture data without invoking the real implementation.
 * @see spec.md §8 step 1
 */
export const mockStartBrowser: StartBrowserService = {
  listAll(): Promise<StartKeyboard[]> {
    // Return a stable copy sorted by id, with basic_kbdus guaranteed present.
    const all = [...sampleStartKeyboards].sort((a, b) =>
      a.id.localeCompare(b.id)
    );
    return Promise.resolve(all);
  },

  search(
    query: string,
    opts?: { script?: string; target?: KeymanPlatformTarget }
  ): Promise<StartKeyboard[]> {
    const q = query.toLowerCase();
    let results = sampleStartKeyboards.filter((kb) => {
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

  getById(id: string): Promise<StartKeyboard | undefined> {
    return Promise.resolve(byId.get(id));
  },
};


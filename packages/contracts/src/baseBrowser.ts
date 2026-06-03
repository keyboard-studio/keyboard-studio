// see spec.md section 8 step 1 — base-keyboard browser (GitHub API client)

import type { BaseKeyboard, KeymanPlatformTarget } from "./baseKeyboard";

/**
 * Service contract for the base-keyboard browser.
 *
 * Reads the keymanapp/keyboards `release/` tree via the GitHub API and
 * surfaces candidate base keyboards to the survey at step 1 of the §8
 * pipeline. Falls back to an offline US-English bundle when the API is
 * unavailable (spec §4: "offline fallback US-English bundle").
 *
 * Implementations MUST NOT use Node `fs` or DOM APIs; all I/O is
 * abstracted behind the Promise return type so that test doubles can
 * supply static fixture lists.
 *
 * @see spec.md §8 step 1
 * @see spec.md §4 (base-keyboard browser entry)
 */
export interface BaseBrowserService {
  /**
   * Return all keyboards in the `release/` tree, including the offline
   * US-English fallback.
   *
   * Results are ordered by `id` ascending. The US-English fallback entry
   * (`id: "basic_kbdus"`) is always present even when the API is offline.
   *
   * @returns Full list of available base keyboards.
   * @see spec.md §8 step 1
   */
  listAll(): Promise<BaseKeyboard[]>;

  /**
   * Search keyboards by display name, id, or script.
   *
   * `query` is matched case-insensitively against `id` and `displayName`.
   * Optional `opts.script` filters to a specific BCP47 script subtag;
   * optional `opts.target` filters to keyboards that include the given
   * platform string in their `targets` array.
   *
   * @param query - Free-text search string; empty string returns all
   *   keyboards matching the opts filters.
   * @param opts.script - BCP47 script subtag filter (e.g. "Latn").
   * @param opts.target - Platform target filter (e.g. "web").
   * @returns Matching keyboards, ordered by relevance then `id`.
   * @see spec.md §8 step 1
   */
  search(
    query: string,
    opts?: { script?: string; target?: KeymanPlatformTarget }
  ): Promise<BaseKeyboard[]>;

  /**
   * Fetch a single keyboard by its snake_case `id`.
   *
   * Returns `undefined` when no keyboard with that id exists in the
   * release tree or the offline bundle.
   *
   * @param id - snake_case keyboard identifier (e.g. "basic_kbdus").
   * @returns The matching BaseKeyboard, or undefined.
   * @see spec.md §8 step 1
   */
  getById(id: string): Promise<BaseKeyboard | undefined>;
}

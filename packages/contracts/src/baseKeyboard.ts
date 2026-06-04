// see spec.md section 8 step 1 / section 11 — BaseKeyboard data type

/**
 * Keyman platform-target identifiers used in the `.kps` package
 * Files-block targets list and on {@link BaseKeyboard.targets}.
 *
 * The union is closed: the studio supports exactly these platforms.
 * The previous bare `string[]` typing on `targets` allowed typos
 * like `"windoze"` to compile (#99); narrowing here catches them at
 * the construction site.
 *
 * @see spec.md §12 (.kps Files block)
 */
export type KeymanPlatformTarget =
  | "windows"
  | "macosx"
  | "linux"
  | "web"
  | "mobile"
  | "tablet";

/**
 * A keyboard entry from the keymanapp/keyboards release tree.
 * Populated by BaseBrowserService (step 1 of the §8 pipeline) and carried
 * into the scaffolder (§11) as the immutable source of truth for identity
 * propagation (name, BCP47 tag, copyright, version reset).
 *
 * @see spec.md §8 step 1
 * @see spec.md §11
 */
export interface BaseKeyboard {
  /**
   * Stable, snake_case, globally unique keyboard identifier.
   * Matches the folder name under release/ (e.g. "basic_kbdus").
   * @example "basic_kbdus"
   */
  id: string;

  /**
   * POSIX path relative to the root of keymanapp/keyboards.
   * Always under release/ and uses lowercase.
   * @example "release/b/basic_kbdus"
   * @see spec.md §8 step 1
   */
  path: string;

  /**
   * BCP47 script subtag for the primary script this keyboard targets.
   * Used by PatternLibraryService.filterFor() and Three-group routing (§9).
   * @example "Latn"
   * @example "Deva"
   */
  script: string;

  /**
   * Keyman platform targets the keyboard ships for.
   * Subset of: "windows" | "macosx" | "linux" | "web" | "mobile" | "tablet".
   * @see spec.md §12 (.kps Files block maps to these)
   */
  targets: KeymanPlatformTarget[];

  /** Human-readable name shown in the base-browser picker. */
  displayName: string;

  /**
   * Semantic version string (e.g. "1.0" or "10.0.3").
   * Identity propagation resets this to "1.0" in the new keyboard (§11).
   */
  version: string;

  /**
   * GitHub URL to the keyboard source folder in keymanapp/keyboards.
   * Absent for offline-fallback entries (US-English bundle).
   * @example "https://github.com/keymanapp/keyboards/tree/master/release/b/basic_kbdus"
   */
  sourceUrl?: string;

  /**
   * Keyman package ID when it differs from `id`.
   * Most keyboards set this equal to `id`; omit when identical.
   */
  packageId?: string;
}

/**
 * Input shape for {@link makeBaseKeyboard}.
 * Mirrors BaseKeyboard with optional fields genuinely omittable.
 */
export type BaseKeyboardInit = {
  id: string;
  path: string;
  script: string;
  targets: KeymanPlatformTarget[];
  displayName: string;
  version: string;
  sourceUrl?: string;
  packageId?: string;
};

/**
 * Construct a {@link BaseKeyboard} from a {@link BaseKeyboardInit},
 * stripping undefined-valued optional keys so the result satisfies
 * `exactOptionalPropertyTypes`.
 *
 * Mirrors the `makePattern` factory pattern in pattern.ts.
 *
 * @see spec.md §8 step 1
 * @see spec.md §11
 */
export function makeBaseKeyboard(init: BaseKeyboardInit): BaseKeyboard {
  return {
    id: init.id,
    path: init.path,
    script: init.script,
    targets: init.targets,
    displayName: init.displayName,
    version: init.version,
    ...(init.sourceUrl !== undefined ? { sourceUrl: init.sourceUrl } : {}),
    ...(init.packageId !== undefined ? { packageId: init.packageId } : {}),
  };
}

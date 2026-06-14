/**
 * Describes a single font file fetched from the keyboards tree and written
 * into the VFS.  Consumed by the studio/frame side to inject @font-face rules
 * for the OSK preview.  Lives in contracts because both the engine loader
 * (producer) and the studio hook (consumer) reference this type; shared types
 * belong here per the monorepo architecture.
 */
export interface KpsFontEntry {
  /** VFS path, keyboard-root-relative: "shared/fonts/sil/andika_subsets/AndikaAfr-R.ttf" */
  vfsPath: string;
  /** Repo-relative path: "release/shared/fonts/sil/andika_subsets/AndikaAfr-R.ttf" */
  ttfRelPath: string;
  /** True if referenced by <OSKFont>/<DisplayFont> (vs <File>-only). */
  isOskFont: boolean;
  /** CSS family from .kvks fontname attribute; set on OSK-font entries only. */
  family?: string;
}

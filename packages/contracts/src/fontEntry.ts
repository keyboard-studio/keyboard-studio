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

/**
 * Describes a per-keyboard CSS stylesheet referenced from the .kps and fetched
 * into the VFS. The studio injects the CSS text into the OSK iframe so the
 * keyboard's own `.kmw-keyboard-<id>` rules paint the preview the same way they
 * paint a real Keyman install. Carried alongside KpsFontEntry through the same
 * fetch → hook → OSKFrame → osk-frame.html pipeline.
 */
export interface KpsStylesheetEntry {
  /** VFS path, keyboard-root-relative: "release/sil/sil_cameroon_qwerty/source/sil_cameroon_qwerty.css" */
  vfsPath: string;
  /** Repo-relative path: "release/sil/sil_cameroon_qwerty/source/sil_cameroon_qwerty.css" */
  cssRelPath: string;
  /** Raw CSS text. Injected verbatim into a sandboxed <style> inside the OSK iframe. */
  cssText: string;
}

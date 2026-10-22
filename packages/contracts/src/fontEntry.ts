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
 * The fonts the starting keyboard's `.kps` packages, as the produced package
 * must re-declare them (criteria 8 "all required fonts", 9 font licensing,
 * 10 "font is selected"). The loader never copies the base `.kps` itself, so
 * this is the only route by which its font declarations reach the generated
 * descriptor.
 *
 * Every path is a VFS key in the loader's release-relative form
 * (`shared/fonts/sil/andika_subsets/AndikaAfr-R.ttf`); the descriptor writes
 * each as `..\..\..\<path>`, the keymanapp/keyboards reference from
 * `release/<group>/<id>/source/`.
 */
export interface PackageFontSet {
  /**
   * Every file to list in `<Files>`, in the base `.kps` order: the font files
   * plus their companions (licence, FONTLOG, README) from the same folder.
   */
  files: string[];
  /** The `<OSKFont>` selection, when the base made one (one of `files`). */
  oskFont?: string;
  /** The `<DisplayFont>` selection, when the base made one (one of `files`). */
  displayFont?: string;
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

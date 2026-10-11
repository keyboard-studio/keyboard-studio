// Leaf module: no imports, so type-only importers (survey/types.ts,
// lib/identityLanguagePatch.ts) can name IdentityPatch without joining the
// workingCopyStore import graph and closing a runtime cycle through it.

// ---------------------------------------------------------------------------
// Identity patch — lightweight overlay for the "identity" phase result.
// Typed as a partial record so Phase 2 can add fields without a schema bump.
// ---------------------------------------------------------------------------

export type IdentityPatch = Partial<{
  /** BCP47 tag for the new keyboard (e.g. "ha-Latn"). */
  bcp47: string;
  /** Human-readable display name for the new keyboard. */
  displayName: string;
  /**
   * The language's name in English, as the author confirmed it (spec 059 FR-002).
   *
   * Display text for the package descriptor's `<Language>` element and nothing
   * else — the codec does not serialize a language name, so this never reaches
   * the `.kmn`. Blank or absent lets the BCP47 tag stand in as its own display
   * text, which is what the descriptor writer did for every tag before 057.
   */
  languageName: string;
  /**
   * New keyboard identifier chosen by the author (Track 1 only).
   *
   * Must satisfy validateKeyboardId (§10 Layer A check #1: 1-255 chars,
   * no spaces / parens / brackets / commas). When set, the projection's id
   * rename pass (projectWorkingCopyVfs step 4) renames every
   * source/<baseId>.{kmn,kps,kvks,keyman-touch-layout,ico,css,htm,js} sibling
   * to source/<keyboardId>.*, rewrites the .kmn's path-bearing stores
   * (&KMW_EMBEDCSS, &KMW_HELPFILE, &VISUALKEYBOARD, &LAYOUTFILE, &BITMAP),
   * and rewrites `.kmw-keyboard-<baseId>` selectors in *.css and the
   * <ID> / <kbdname> references in *.kps and *.kvks. The downloaded zip
   * filename uses this id.
   */
  keyboardId: string;
}>;

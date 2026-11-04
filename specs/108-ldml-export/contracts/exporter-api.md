# Contract: LDML exporter engine API

**Spec**: [../spec.md](../spec.md) · **Data model**: [../data-model.md](../data-model.md) ·
**Research**: R19, R25, R26, R28

The module is `packages/engine/src/ldml-export/`, re-exported from the engine root barrel. The
studio reaches it only through `lib/services.ts` (`getBuildLdmlExport`, `getClassifyForLdml`),
which keeps it in the lazily imported engine chunk. Nothing here imports `@keymanapp/kmc-ldml` or any Node
built-in. It may import `@keymanapp/common-types` (browser-safe, an engine dependency since T089). `browser-bundle-safety.test.ts` covers the
module's static graph.

## Entry points

```ts
/** Every available profile, newest first; the default is flagged. */
export function listLdmlProfiles(): readonly LdmlProfileSummary[];

/** Profile 46 rows with the requested profile's deltas applied; frozen. Throws on an unknown id. */
export function resolveLdmlProfile(id: LdmlProfileId): TargetProfile;

/** Pure and synchronous. The one classifier (FR-008, FR-012). */
export function classifyForLdml(
  input: LdmlClassifyInput,
  profile: TargetProfile,
): LdmlClassification;

/** Pure and asynchronous (only zipping is async). Classifies, lowers, serialises and packages. */
export function buildLdmlExport(input: LdmlExportInput): Promise<LdmlExportResult>;
```

## Inputs

```ts
interface LdmlClassifyInput {
  ir: KeyboardIR;                  // parsed from the PROJECTED source/<id>.kmn
  touchLayout: TouchLayoutIR | null;
  visualKeyboard: KvksIR | null;
  baseLayout: LdmlBaseLayout;      // the export's one base keyboard (FR-027; research R26),
                                   // chosen in the studio; never resolved inside the engine
}

interface LdmlExportInput extends LdmlClassifyInput {
  profileId: LdmlProfileId;
  keyboardId: string;              // the OUTPUT id (resolveOutputKeyboardId)
  metadata: LdmlExportMetadata;    // data model; from the same identity the .kps writer uses
  packageFiles: LdmlPackageFiles;  // readme/welcome/LICENSE/README/HISTORY text, icon, fonts
  studioVersion: string;
}
```

**Preconditions**:

- `ir.header.encoding` / entry points: an ANSI-only keyboard is not an error. The result is
  `{ ok: false, reason: "ansi-only" }` and the classification holds row 1.2.
- `ir` comes from `parse()` with no try/catch around it. A projection that does not parse fails
  before the call, with the codec's error (Art II).

## Outputs

```ts
type LdmlExportResult =
  | { ok: true; zip: Uint8Array; filename: string; files: ReadonlyMap<string, string | Uint8Array>;
      classification: LdmlClassification }
  | { ok: false; reason: "ansi-only"; classification: LdmlClassification };
```

- `filename` = `${keyboardId}_ldml-${version}.zip`, where `version` is the normalised semver. Every
  project file uses the id `${keyboardId}_ldml` (FR-040).
- `files` lists the package entries exactly as zipped; see [export-package.md](export-package.md).
- `classification` is the object the report was rendered from. Tests compare it with the
  authoring-time classification by site key (SC-005).

## Invariants

1. **Determinism.** `buildLdmlExport(x)` returns byte-identical `zip` for deep-equal `x`, in any
   timezone and locale (FR-030, SC-009). No `Date.now()`, `Math.random()`, locale-sensitive
   collation (`localeCompare` without a fixed locale), or `Map` iteration that depends on
   insertion order from traversal.
2. **Profiles are data.** No code path switches on `profileId`. Behaviour comes from the
   resolved rows (status, form, code) only (FR-061, SC-011).
3. **Exhaustive classification.**
   - Every rule, store, group, fragment, `raw` element and touch key yields at least one item.
   - Every `RawKmnFragment` yields exactly one item (FR-013).
   - A construct with no row yields an N item with `KM_LINT_LDML_OPAQUE` (FR-008).
4. **N is never exported. A and M are always exported** (FR-009), with the exception that M
   items under a lowering cap become N with `KM_LINT_LDML_EXPANSION_LIMIT` (row 3.9).
5. **No exporter marker survives** (FR-024). Every trigger marker has a catch-all transform as
   the last transform of its group.
6. **No dependency on the interface language.** Messages in the classification are English
   constants. The studio translates by code and parameters, never by parsing the message.

## Studio adapter (contracted for tasks)

- `lib/buildOutputBundle.ts` adds `buildLdmlExportForDownload(profileId)`. It:
  1. calls `projectWorkingCopyForOutput()` (no options, same as the `.zip` path);
  2. parses `source/<id>.kmn`, the `.keyman-touch-layout` and the `.kvks` from the projected VFS;
  3. resolves the base layout (`lib/ldmlBaseLayout.ts`);
  4. builds the metadata from the identity, attribution and help docs the `.kps` writer reads;
  5. calls `buildLdmlExport` and returns a `DownloadResult`.

  It writes nothing to the projected VFS.
- `hooks/useLdmlFindings.ts` builds the `LdmlClassifyInput` from `previewProjection`, the
  EPHEMERAL snapshot the live preview publishes when it reaches `ready` (data model). The
  snapshot holds:
  - the IR parsed from the projected `.kmn`;
  - the projected `.keyman-touch-layout` text;
  - the projected `.kvks` text.

  The touch layout and `.kvks` are parsed inside the memo (`parseTouchLayoutOrNull`,
  `parseKvks`), so all three come from one projection, just as on the download path. The base
  layout comes from the same `lib/ldmlBaseLayout.ts`. The profile comes from the store's
  `ldmlProfile`, the same value the Output picker writes and the download reads, so the warnings
  always match the selected version (SC-012). The hook calls `classifyForLdml` inside `useMemo`
  and returns `LintFinding[]` through `lint/ldmlFindings.ts`.

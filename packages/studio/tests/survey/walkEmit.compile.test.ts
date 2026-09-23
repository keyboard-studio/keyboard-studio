// MVP-walk compile oracle — the REAL projected working copy compiles.
//
// Spec 034 US1 AS-6 requires that a locked desktop downloads as "a ZIP of a
// valid, compilable keyboard". Before this file, no CI-run test compiled a
// keyboard the studio had actually emitted: the engine compile tests use a
// hand-written minimal.kmn, the scaffolder test compiles scaffolder output
// only, wireGalleries.emitByteOracle runs the real projection but only compares
// flag-on/flag-off bytes, and the golden-walk tests mock every gallery.
//
// This oracle drives one working copy the way the studio does, end to end, for
// one Latin base (basic_kbdus) and one non-Latin base (basic_kbdru):
//
//   1. Instantiate — fetchKeyboardSourceToVfs (the open-base loader, fed from
//      committed fixtures instead of the dev proxy), then the same
//      dropUnbackedBitmapStore -> stripDanglingAssetStores -> parseKmn ->
//      recognizePatterns -> parseTouchLayout -> classifyRemovalCapabilities
//      chain useKeyboardArtifact runs before it fires onInstantiate, then
//      workingCopyStore.instantiateFromBase.
//   2. Carve one character — irToCharacterView resolves its contributors and
//      workingCopyStore.cascadeDelete records them, as CarveGalleryV2's
//      toggleCell does.
//   3. One desktop assignment — an S-02 deadkey (Latin) / S-08 RAlt placement
//      (Cyrillic) in the exact MechanismAssignment shape MechanismGallery
//      records, via workingCopyStore.recordAssignments; then the mechanisms
//      step completes through the real reducer (lockDesktop).
//   4. One touch assignment — a longpress in TouchGallery's
//      buildTouchMechanismRef shape, completed through the real reducer's touch
//      step with the same deps StudioShell injects (R11 emission matrix +
//      buildTouchLayoutJson + setTouchLayoutJson) and the mods
//      AddTouchAdapter derives.
//   5. Output — buildSourceZipForDownload (the real download path:
//      projectWorkingCopyForOutput -> projectWorkingCopyVfs -> compile ->
//      toZip), then unzip and compile the ARCHIVED .kmn with the engine's
//      kmcmplib compile() and run the Layer A/B validator (runAllChecks).
//
// Assertions: the compile succeeds with no error/fatal diagnostics, the
// validator reports no error findings, AND the edits are really in the
// shipped source (the carved character is no longer produced, the new one is,
// and the touch layout carries the longpress). That last group is the
// non-vacuity guard: a projection that silently dropped every edit would
// otherwise compile clean and pass.
//
// Runs under both VITE_KM_MUTATE_SEAM states — the seam routes carve and the
// add gallery through mutate() inside projectWorkingCopyVfs, so each state is
// a distinct emit path that must produce a compilable keyboard.
//
// Fixtures: tests/fixtures/walkBases/ is a minimal copy of the two bases from
// the keyboard-studio/keyboards corpus (MIT, SIL International; LICENSE.md
// kept alongside each), so this runs in the default CI lane without
// ../keyboards.

import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { readFileSync, existsSync, statSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { unzipSync } from "fflate";
import {
  buildProducedSet,
  createVirtualFS,
  type BaseKeyboard,
  type KeyboardIR,
  type MechanismAssignment,
  type TouchAssignment,
  type VirtualFS,
} from "@keyboard-studio/contracts";
import {
  classifyRemovalCapabilities,
  compile,
  dropUnbackedBitmapStore,
  fetchKeyboardSourceToVfs,
  parseKmn,
  parseTouchLayout,
  recognizePatterns,
  runAllChecks,
  stripDanglingAssetStores,
  type FetchFn,
} from "@keyboard-studio/engine";
import { useWorkingCopyStore, bindManifest } from "../../src/stores/workingCopyStore.ts";
import { manifest } from "../../src/steps/manifest.ts";
import { useSurveySessionStore } from "../../src/stores/surveySessionStore.ts";
import { irToCharacterView } from "../../src/lib/irToCharacterView.ts";
import { deriveDesktopModifications } from "../../src/lib/deriveDesktopModifications.ts";
import { buildTouchLayoutJson } from "../../src/lib/buildTouchLayoutJson.ts";
import { resolveBaseTouchJson } from "../../src/lib/resolveBaseTouchJson.ts";
import { findTouchLayoutPath } from "../../src/lib/findTouchLayoutPath.ts";
import { resolveTouchSeedSource, shouldEmitTouchLayout } from "../../src/lib/touchEmission.ts";
import { buildSourceZipForDownload } from "../../src/lib/buildOutputBundle.ts";
import {
  applyStepCompletion,
  MECHANISMS_STEP_ID,
  TOUCH_STEP_ID,
  type ReducerDeps,
} from "../../src/steps/reducer.ts";
import { PATTERN_DEADKEY, PATTERN_RALT } from "../../src/editors/assignLoop/patternIds.ts";

// ---------------------------------------------------------------------------
// Fixture-backed loader: the open-base fetch, served from committed files.
// ---------------------------------------------------------------------------

const FIXTURE_ROOT = join(dirname(fileURLToPath(import.meta.url)), "..", "fixtures", "walkBases");
const PROXY = "/walk-fixture";

/** A FetchFn that serves `<PROXY>/<repo path>` from FIXTURE_ROOT, else 404. */
const fixtureFetch: FetchFn = async (url) => {
  const rel = url.startsWith(`${PROXY}/`) ? url.slice(PROXY.length + 1) : null;
  const abs = rel === null ? null : join(FIXTURE_ROOT, rel);
  if (abs === null || !existsSync(abs) || !statSync(abs).isFile()) {
    return {
      ok: false,
      status: 404,
      text: async () => "",
      arrayBuffer: async () => new ArrayBuffer(0),
    };
  }
  const bytes = readFileSync(abs);
  return {
    ok: true,
    status: 200,
    text: async () => bytes.toString("utf8"),
    arrayBuffer: async () =>
      bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength) as ArrayBuffer,
  };
};

function readText(vfs: VirtualFS, path: string): string | undefined {
  const entry = vfs.get(path);
  if (entry === undefined) return undefined;
  return typeof entry.content === "string"
    ? entry.content
    : new TextDecoder().decode(entry.content);
}

/**
 * Instantiate the working copy exactly as the studio's open-base run does
 * (useKeyboardArtifact's fetch branch, then its parse branch, then
 * onInstantiate -> instantiateFromBase).
 */
async function instantiateLikeStudio(base: BaseKeyboard): Promise<void> {
  const vfs = createVirtualFS();
  await fetchKeyboardSourceToVfs(base, vfs, { proxyBase: PROXY, fetchImpl: fixtureFetch });

  const kmnPath = `source/${base.id}.kmn`;
  const fetched = readText(vfs, kmnPath);
  if (fetched === undefined) throw new Error(`fixture ${kmnPath} did not load`);
  const { kmn: afterBitmap, dropped } = dropUnbackedBitmapStore(fetched, vfs);
  if (dropped !== null) vfs.set(kmnPath, afterBitmap, false);
  const { kmn: kmnText, stripped } = stripDanglingAssetStores(afterBitmap, vfs);
  if (stripped.length > 0) vfs.set(kmnPath, kmnText);

  const parsed = parseKmn(kmnText, base.id);
  let ir: KeyboardIR = recognizePatterns(parsed.ir).ir;
  if (ir.touchLayout === undefined) {
    const touchPath = findTouchLayoutPath(vfs);
    const touchText = touchPath ? readText(vfs, touchPath) : undefined;
    if (touchText !== undefined) ir = { ...ir, touchLayout: parseTouchLayout(touchText) };
  }
  const removalCapabilities = classifyRemovalCapabilities(ir);

  useWorkingCopyStore.getState().instantiateFromBase(base, { vfs, ir, removalCapabilities });
}

/** CarveGalleryV2.toggleCell for one character. Returns the ids it cascaded. */
function carveCharacter(ch: string): string[] {
  const s = useWorkingCopyStore.getState();
  if (s.ir === null) throw new Error("carve: working copy has no IR");
  const cells = irToCharacterView(s.ir, s.removalCapabilities, new Set(), new Set());
  const cell = cells.find((c) => c.ch === ch.normalize("NFC"));
  if (cell === undefined) throw new Error(`carve: "${ch}" is not in the character view`);
  const { ruleNodeIds, storeSlotIds } = cell.contributors;
  s.cascadeDelete(ruleNodeIds, storeSlotIds);
  return [...ruleNodeIds, ...storeSlotIds];
}

/** The reducer deps StudioShell injects, limited to what these steps touch. */
function studioReducerDeps(): ReducerDeps {
  const wc = () => useWorkingCopyStore.getState();
  return {
    lockDesktop: () => wc().lockDesktop(),
    clearStale: (id) => wc().clearStale(id),
    setTouchLayoutJson: (json) => wc().setTouchLayoutJson(json),
    instantiateFromBase: (b, o) => wc().instantiateFromBase(b, o),
    instantiateFromExisting: (b, o) => wc().instantiateFromExisting(b, o),
    // Mirrors StudioShell's wrapper: resolve the seed source, apply the R11
    // emission matrix, then call the real buildTouchLayoutJson.
    buildTouchLayoutJson: (baseIrArg, assignments, opts) => {
      const seedSource = resolveTouchSeedSource(opts.seedSource, opts.baseTouchJson !== undefined);
      if (!shouldEmitTouchLayout(seedSource, opts.mods, assignments.length > 0)) {
        return { json: null, warnings: [] };
      }
      return buildTouchLayoutJson(baseIrArg, assignments, {
        ...(seedSource !== "reseed-from-desktop" && opts.baseTouchJson !== undefined
          ? { baseTouchJson: opts.baseTouchJson }
          : {}),
        mods: opts.mods,
        seedSource,
      });
    },
    resolveBaseTouchJson: (v) => resolveBaseTouchJson(v),
    instantiateFromBaseIfConfirmed: () => {
      throw new Error("not used by this oracle");
    },
    getWorkingIR: () => wc().ir,
    setWorkingIR: (next) => wc().setWorkingIR(next),
    getStaleSteps: () => wc().staleSteps,
  };
}

/** AddTouchAdapter.handleComplete -> the reducer's touch step. */
function completeTouchStep(assignments: TouchAssignment[]): void {
  const s = useWorkingCopyStore.getState();
  const mods =
    s.baseIr === null
      ? { removals: [], placements: [] }
      : deriveDesktopModifications(s.baseIr, s.deletedNodeIds, s.deletedItemIds, s.phaseResults);
  applyStepCompletion(
    TOUCH_STEP_ID,
    {
      assignments,
      baseIr: s.baseIr,
      baseVfs: s.baseVfs,
      mods,
      seedSource: useSurveySessionStore.getState().touchSeedSource,
    },
    studioReducerDeps(),
  );
}

// ---------------------------------------------------------------------------
// The two walks.
// ---------------------------------------------------------------------------

interface WalkCase {
  label: string;
  base: BaseKeyboard;
  /** Author-chosen identity (the walk always names the keyboard). */
  identity: { keyboardId: string; displayName: string; bcp47: string };
  /** A character the base produces that the author discards. */
  carve: string;
  /** A character the base does NOT produce, placed on the desktop. */
  newChar: string;
  desktopAssignment: MechanismAssignment;
  touchHostKey: string;
}

function baseKeyboard(id: string, script: string, displayName: string): BaseKeyboard {
  return {
    id,
    path: `release/basic/${id}`,
    script,
    targets: ["windows", "macosx", "linux", "web", "mobile", "tablet"],
    displayName,
    version: "1.0",
  } as BaseKeyboard;
}

const CASES: WalkCase[] = [
  {
    label: "Latin — basic_kbdus",
    base: baseKeyboard("basic_kbdus", "Latn", "US Basic"),
    identity: { keyboardId: "oracle_walk_latn", displayName: "Oracle Walk Latin", bcp47: "en" },
    carve: "~",
    newChar: "é",
    // MechanismGallery's buildDeadkeyAssignment shape, with the gallery's
    // default trigger (K_COLON -> deadkey name "003b", accent ";").
    desktopAssignment: {
      scope: "individual",
      target: "é",
      modality: "physical",
      mechanisms: [
        {
          patternId: PATTERN_DEADKEY,
          strategyId: "S-02",
          slotValues: {
            triggerKey: "K_COLON",
            deadkeyName: "003b",
            baseLetters: "e",
            accentedForms: "é",
            accentChar: ";",
          },
        },
      ],
      source: "user",
    },
    touchHostKey: "K_E",
  },
  {
    label: "Cyrillic — basic_kbdru",
    base: baseKeyboard("basic_kbdru", "Cyrl", "Russian Basic"),
    identity: { keyboardId: "oracle_walk_cyrl", displayName: "Oracle Walk Cyrillic", bcp47: "kk-Cyrl" },
    carve: "ё",
    newChar: "ә",
    // MechanismGallery's S-08 accept shape (comboToKeySpec(["RALT"], "K_A")).
    desktopAssignment: {
      scope: "individual",
      target: "ә",
      modality: "physical",
      mechanisms: [
        {
          patternId: PATTERN_RALT,
          strategyId: "S-08",
          slotValues: { altgrKeyList: "[RALT K_A]", altgrOutputList: "ә" },
        },
      ],
      source: "user",
    },
    touchHostKey: "K_F",
  },
];

// StudioShell binds the production manifest at module load; the reducer's
// touch step (clearStale) needs it bound.
bindManifest(manifest);

function resetStores(): void {
  useWorkingCopyStore.getState().reset();
  useSurveySessionStore.getState().reset();
}

beforeEach(resetStores);
afterEach(() => {
  vi.unstubAllEnvs();
  resetStores();
});

// kmcmplib encodes a message's severity in its numeric code (developer-utils
// CompilerErrorMask.Severity = 0xF00000; Error = 0x500000, Fatal = 0x600000)
// and sends no `severity` field. The engine's compile() reads only that absent
// field, so it labels EVERY kmcmplib message "warning" (code
// KM_WARNING_KMCMP_<decimal code>) — a plain severity filter over its
// diagnostics can never see a compile error. Decode the code instead.
const KMC_SEVERITY_MASK = 0xf00000;
const KMC_SEVERITY_ERROR = 0x500000;

function isBlocking(d: { severity: string; code: string }): boolean {
  if (d.severity === "error" || d.severity === "fatal") return true;
  const m = /_KMCMP_(\d+)$/.exec(d.code);
  return m !== null && (Number(m[1]) & KMC_SEVERITY_MASK) >= KMC_SEVERITY_ERROR;
}

const blocking = <T extends { severity: string; code: string }>(ds: readonly T[]): T[] =>
  ds.filter(isBlocking);

describe("MVP walk compile oracle — the blocking-diagnostic filter is not vacuous", () => {
  it("flags a real kmcmplib error that the engine labels as a warning", async () => {
    const broken = [
      "store(&VERSION) '10.0'",
      "store(&NAME) 'Broken'",
      "begin Unicode > use(main)",
      "group(main) using keys",
      "+ [K_A] > index(nosuch, 1)",
      "",
    ].join("\n");
    const result = await compile(
      createVirtualFS([{ path: "source/broken.kmn", content: broken, isBinary: false }]),
      "broken",
    );
    expect(result.success).toBe(false);
    expect(blocking(result.diagnostics).length).toBeGreaterThan(0);
  });
});

for (const seamOn of [false, true]) {
  describe(`MVP walk compile oracle — mutate seam ${seamOn ? "ON" : "OFF"}`, () => {
    for (const c of CASES) {
      it(`${c.label}: carve + desktop + touch edits emit a keyboard that compiles and carries the edits`, async () => {
        vi.stubEnv("VITE_KM_MUTATE_SEAM", seamOn ? "1" : "");

        // --- 1. instantiate -------------------------------------------------
        await instantiateLikeStudio(c.base);
        const baseIr = useWorkingCopyStore.getState().baseIr!;
        const baseProduced = buildProducedSet(baseIr);
        // Preconditions that keep the edits meaningful.
        expect(baseProduced.has(c.carve), `base must produce the carved "${c.carve}"`).toBe(true);
        expect(baseProduced.has(c.newChar), `base must NOT already produce "${c.newChar}"`).toBe(false);
        useWorkingCopyStore.getState().setIdentity(c.identity);

        // --- 2. carve -------------------------------------------------------
        const carvedIds = carveCharacter(c.carve);
        expect(carvedIds.length).toBeGreaterThan(0);

        // --- 3. desktop assignment + mechanisms completion ------------------
        useWorkingCopyStore.getState().recordAssignments([c.desktopAssignment]);
        applyStepCompletion(MECHANISMS_STEP_ID, undefined, studioReducerDeps());
        expect(useWorkingCopyStore.getState().desktopLocked).toBe(true);

        // --- 4. touch assignment + touch completion -------------------------
        const touch: TouchAssignment = {
          scope: "individual",
          target: c.newChar,
          modality: "touch",
          mechanisms: [
            {
              patternId: "longpress_alternates",
              slotValues: { hostKey: c.touchHostKey, char: c.newChar, layer: "default" },
            },
          ],
          source: "user",
        };
        completeTouchStep([touch]);
        const touchJson = useWorkingCopyStore.getState().touchLayoutJson;
        expect(touchJson, "the touch step must store a layout").not.toBeNull();

        // --- 5. the real download path, then unzip --------------------------
        const download = await buildSourceZipForDownload();
        expect(download).not.toBeNull();
        const files = unzipSync(download!.bytes);
        const id = c.identity.keyboardId;
        const kmnBytes = files[`source/${id}.kmn`];
        expect(kmnBytes, `archive must contain source/${id}.kmn`).toBeDefined();
        const kmn = new TextDecoder().decode(kmnBytes!);
        const archived = createVirtualFS(
          Object.entries(files).map(([path, data]) => ({ path, content: data, isBinary: true })),
        );

        // --- compile the ARCHIVED source ------------------------------------
        const result = await compile(archived, id);
        expect(blocking(result.diagnostics), "compile diagnostics").toEqual([]);
        expect(result.success).toBe(true);
        expect(result.artifacts.find((a) => a.filename.endsWith(".kmx"))).toBeDefined();
        expect(result.artifacts.find((a) => a.filename.endsWith(".js"))).toBeDefined();

        // --- Layer A/B validator --------------------------------------------
        expect(blocking(runAllChecks(kmn)), "validator findings").toEqual([]);

        // --- non-vacuity: the edits are in what shipped ---------------------
        const shippedProduced = buildProducedSet(parseKmn(kmn, id).ir);
        expect(shippedProduced.has(c.carve), `carved "${c.carve}" must be gone`).toBe(false);
        expect(shippedProduced.has(c.newChar), `placed "${c.newChar}" must be produced`).toBe(true);
        const shippedTouch = files[`source/${id}.keyman-touch-layout`];
        expect(shippedTouch, "archive must carry the touch layout").toBeDefined();
        expect(new TextDecoder().decode(shippedTouch!)).toContain(c.newChar);
      });
    }
  });
}

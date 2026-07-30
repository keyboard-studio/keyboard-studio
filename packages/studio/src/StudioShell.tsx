// Studio root — hash-based router + nav bar.
//
// Routes:
//   #survey  (default)  — full authoring wizard: identity → base → track →
//                         [project_name (copy)] → characters (prefill/B) →
//                         carve → mechanisms → sequences →
//                         touch → help → done
//   #preview            — PreviewScreen: "try it" — OSK preview + diagnostics
//                         (no Download button, no SignUpPanel)
//   #output             — OutputScreen: "ship it" — Download .zip +
//                         SignUpPanel (no interactive OSK)

import { devLog } from "@keyboard-studio/contracts/dev-log";
import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode, type CSSProperties } from "react";
import { useResizablePanes } from "./hooks/useResizablePanes.ts";
import { ResizeHandle } from "./components/ResizeHandle.tsx";
import type { BaseKeyboard, Pattern, VirtualFS, KeyboardIR, RemovalCapability } from "@keyboard-studio/contracts";
import { buildTouchLayoutJson } from "./lib/buildTouchLayoutJson.ts";
import { shouldEmitTouchLayout, resolveTouchSeedSource } from "./lib/touchEmission.ts";
import { useWorkingCopyStore, bindManifest } from "./stores/workingCopyStore.ts";
import { useSurveySessionStore } from "./stores/surveySessionStore.ts";
import { instantiateFromBaseIfConfirmed } from "./lib/confirmRebase.ts";
import {
  deriveProjectKeyFromWorkingCopy,
  discardActiveDraft,
  installDraftAutosave,
  // Aliased: dev's draftAutosave engine (below) also exports a startCloudSync;
  // both engines coexist post-merge, so both syncs run under distinct names.
  startCloudSync as startPersistenceCloudSync,
  wasDraftRestoredThisBoot,
} from "./lib/draftPersistence.ts";
import { useGitHubAuth } from "./hooks/useGitHubAuth.ts";
import { type RouteId } from "./lib/navigate.ts";
import { useKeyboardArtifact, type OnInstantiateCallback } from "./hooks/useKeyboardArtifact.ts";
import { useWorkingCopyTransform } from "./hooks/useWorkingCopyTransform.ts";
import { OSKFrame } from "./components/OSKFrame.tsx";
import { OskModeToggle, type OskMode } from "./components/OskModeToggle.tsx";
import { useValidator } from "./hooks/useValidator.ts";
import { findKmnPath } from "./lib/findKmnPath.ts";
import { resolveBaseTouchJson } from "./lib/resolveBaseTouchJson.ts";
import { selectUnmappedFindings } from "./lint/lintToQuestion.ts";
import { LintSummary } from "./lint/index.ts";
import { getPatternLibraryService } from "./lib/services.ts";
import { physicalAssignmentsOf } from "./lib/physicalAssignments.ts";
import { FlowMapView } from "./dashboard/DashboardView.tsx";
import { runCompleteness } from "./dashboard/completeness.ts";
import { PreviewScreen } from "./components/PreviewScreen.tsx";
import { OutputScreen } from "./components/OutputScreen.tsx";
import type { MessageDescriptor } from "@lingui/core";
import { msg } from "@lingui/core/macro";
import { Trans, useLingui } from "@lingui/react/macro";
import { resolveMessage } from "./lib/i18nResolve.ts";
import "./lib/i18n.ts"; // side-effect: load + activate the default (en) catalog
import { WelcomeScreen } from "./components/WelcomeScreen.tsx";
import { LocaleSwitcher } from "./components/LocaleSwitcher.tsx";
import { ProfileScreen } from "./components/ProfileScreen.tsx";
import { AccountControl } from "./components/AccountControl.tsx";
import { hasVisited } from "./lib/firstVisit.ts";
import { manifest, validateManifestShape } from "./steps/manifest.ts";
import { applyStepCompletion, type ReducerDeps } from "./steps/reducer.ts";
import { StepHost } from "./components/StepHost.tsx";
import { ResumeDraftBanner } from "./components/ResumeDraftBanner.tsx";
import { SurveyResetButton } from "./components/SurveyResetButton.tsx";
import {
  loadDraftMeta,
  applyDraft,
  applyStudioDraft,
  buildStudioDraft,
  clearDraft,
  startDraftAutosave,
  startCloudSync,
  migrateLegacyDraft,
  getActiveProjectKey,
  setActiveProject,
  pinActiveProject,
  PENDING_PROJECT_KEY,
  type DraftMeta,
  type StudioDraft,
} from "./lib/draftAutosave.ts";
import {
  loadServerDraftMeta,
  loadServerDraftContent,
  clearServerDraft,
  serverMetaToDraftMeta,
} from "./lib/serverDraftStore.ts";
import { TEXT_MAIN, TEXT_DIM, FONT } from "./survey/surveyStyles.ts";
import { CharacterMapPane } from "./survey/CharacterMapPane.tsx";
import { useBasePreviewStatusStore, type BasePreviewStatus } from "./stores/basePreviewStatusStore.ts";
import { useInventoryCoverageGate } from "./hooks/useInventoryCoverageGate.ts";
import { useSurveyBrowserHistorySync } from "./hooks/useSurveyBrowserHistorySync.ts";

// Offer the resume banner only once per page load — on the first SurveyView
// mount in this JS context, not on same-session route remounts (navigating away
// and back is a fresh wizard, not a resume). A page reload resets this flag by
// starting a new JS context.
let resumeOfferConsumed = false;

// Bind the manifest into the store's staleness actions.
// Called once at module load; avoids a circular static import in the store
// (stores/ → steps/manifest.ts → steps/registerEditorSteps.ts → editors/ → stores/).
bindManifest(manifest);

// One-shot, idempotent adoption of the legacy single-slot `ks.studio.draft`
// into the per-project "My keyboards" scheme (specs/037-my-keyboards/spec.md
// "Migration"). Called at module load (this file's existing idiom for
// one-time setup, alongside bindManifest/validateManifestShape above/below) —
// module evaluation runs strictly before any component mounts, so this always
// completes before SurveyView's useEffect starts autosave/cloud-sync, exactly
// as the spec requires ("Run once ... before autosave/cloud-sync start").
// migrateLegacyDraft() self-guards on ks.studio.projects.index already
// existing, so re-importing this module (e.g. tests using vi.resetModules())
// re-runs it safely against whatever localStorage state is present then.
migrateLegacyDraft();

// The Flow Map is a developer aid. It shows automatically in `vite dev`; in
// hosted builds (Vercel previews, future production) it is gated by
// VITE_SHOW_FLOWMAP=1 so the kill switch lives in env config, not code.
const SHOW_FLOWMAP =
  import.meta.env.DEV || import.meta.env.VITE_SHOW_FLOWMAP === "1";

const VALID_ROUTES = new Set<RouteId>(
  (["welcome", "survey", "preview", "output", "flowmap", "profile"] as const).filter(
    (r) => r !== "flowmap" || SHOW_FLOWMAP,
  ),
);

function isRouteId(v: string): v is RouteId {
  return VALID_ROUTES.has(v as RouteId);
}

// ---------------------------------------------------------------------------
// useRoute — reads window.location.hash and reacts to hashchange events
// ---------------------------------------------------------------------------

// First-visit landing gate (proposal §9). Decides where an empty or unknown
// hash lands. A genuine first-time visitor sees the welcome screen; a returning
// visitor — or one with a resumable draft (the survey route surfaces the resume
// banner) — goes straight into the survey. A newcomer landing also overrides
// an explicit deep-link hash (a shared #survey/#preview link, a stale
// bookmark) — see hashToRoute below; internal navigation always sets a valid
// hash, so beyond that this only governs the initial landing and stale-hash
// cases.
function defaultLandingRoute(): RouteId {
  if (hasVisited()) return "survey";
  if (loadDraftMeta() !== null) return "survey";
  return "welcome";
}

function useRoute(): RouteId {
  const hashToRoute = (): RouteId => {
    const raw = window.location.hash.slice(1);
    const landing = defaultLandingRoute();
    // A genuine newcomer (never visited, no resumable draft) always lands on
    // welcome first — even on a deep-linked hash (a shared #survey/#preview
    // link, a stale bookmark). The gate lifts the moment they leave welcome
    // (markVisited) or once a resumable draft exists, after which the incoming
    // hash is honored normally.
    if (landing === "welcome") {
      // Keep window.location.hash in sync with the forced route. Without this,
      // a deep-linked hash (e.g. "#survey") is left in place while the route
      // renders "welcome"; WelcomeScreen's "I'm new" button then calls
      // navigateTo("survey"), a same-value hash assignment that fires zero
      // hashchange events per spec, soft-locking the user on WelcomeScreen.
      if (raw !== "welcome") {
        window.history.replaceState(window.history.state, "", "#welcome");
      }
      return "welcome";
    }
    return isRouteId(raw) ? raw : landing;
  };

  const [route, setRoute] = useState<RouteId>(hashToRoute);

  useEffect(() => {
    const handler = () => setRoute(hashToRoute());
    window.addEventListener("hashchange", handler);
    return () => window.removeEventListener("hashchange", handler);
  }, []);  // empty deps: register once on mount; handler captures hashToRoute by closure

  return route;
}

// ---------------------------------------------------------------------------
// NavBar
// ---------------------------------------------------------------------------

interface NavItem {
  id: RouteId;
  /**
   * Lazy `msg` descriptor — NAV_ITEMS is built at module scope where no
   * useLingui() binding exists, so labels are resolved per-render via
   * resolveMessage(i18n, ...) inside NavBar (the same pattern MechanismGallery
   * uses for its module-scope option tables).
   */
  label: MessageDescriptor;
}

const NAV_ITEMS: NavItem[] = [
  { id: "survey", label: msg({ id: "nav.studio", message: "Studio" }) },
  { id: "preview", label: msg({ id: "nav.preview", message: "Preview" }) },
  { id: "output", label: msg({ id: "nav.output", message: "Output" }) },
  ...(SHOW_FLOWMAP
    ? [{ id: "flowmap" as const, label: msg({ id: "nav.flowMap", message: "Flow Map" }) }]
    : []),
];

interface NavBarProps {
  active: RouteId;
  /**
   * P0 fix UX signal (not the authoritative enforcement — that lives in
   * OutputScreen/usePreviewArtifact's canDownload gate, which is reachable
   * regardless of how #output was navigated to). Dims the Output tab and
   * marks it aria-disabled with an explanatory title so the block is obvious
   * BEFORE the click, not just after landing on a disabled download button.
   */
  outputBlocked?: boolean;
  /** Tooltip / aria explanation shown while outputBlocked is true. */
  outputBlockedTitle?: string;
}

function NavBar({ active, outputBlocked = false, outputBlockedTitle }: NavBarProps) {
  const { i18n: activeI18n } = useLingui();
  return (
    <nav
      aria-label={resolveMessage(
        activeI18n,
        msg({ id: "nav.ariaLabel", message: "Studio navigation" }),
      )}
      style={{
        height: 48,
        flexShrink: 0,
        display: "flex",
        alignItems: "center",
        gap: 4,
        padding: "0 16px",
        background: "var(--bg)",
        borderBottom: "1px solid #283040",
        boxSizing: "border-box",
      }}
    >
      {/* Left group — tab links */}
      <div style={{ display: "flex", alignItems: "center", gap: 4, flex: 1 }}>
        {NAV_ITEMS.map(({ id, label }) => {
          const isActive = id === active;
          const isBlocked = id === "output" && outputBlocked;
          return (
            <a
              key={id}
              href={`#${id}`}
              aria-current={isActive ? "page" : undefined}
              aria-disabled={isBlocked ? "true" : undefined}
              title={isBlocked ? outputBlockedTitle : undefined}
              style={{
                padding: "4px 12px",
                fontSize: 14,
                fontFamily: "system-ui, -apple-system, 'Segoe UI', Roboto, sans-serif",
                textDecoration: "none",
                color: isBlocked ? "#6e7681" : isActive ? "#6ea8fe" : "#e6edf3",
                opacity: isBlocked ? 0.6 : 1,
                borderBottom: isActive ? "2px solid #6ea8fe" : "2px solid transparent",
                lineHeight: "40px",
                whiteSpace: "nowrap",
                transition: "color 120ms ease, border-bottom-color 120ms ease",
              }}
            >
              {resolveMessage(activeI18n, label)}
            </a>
          );
        })}
      </div>

      {/* Right group — locale switcher (all routes) + account control
          (hidden on the welcome route) */}
      <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
        <LocaleSwitcher />
        {active !== "welcome" && <AccountControl />}
      </div>
    </nav>
  );
}

// ---------------------------------------------------------------------------
// SurveyView — manifest-driven survey runtime (T028, FR-009, M1)
//
// Step order, spine membership, lock placement, and branching all derive from
// steps/manifest.ts. No SurveyStage union remains — the active step is tracked
// as a manifest step id (ActiveStepId) with one sub-stage for the "characters"
// step (which contains an internal prefill→B flow — intra-phase routing handled
// by the SurveyRunner, legitimately not promoted to manifest steps).
//
// Manifest spine order (FR-012, M2):
//   identity → choose_base → track → characters → marks → carve →
//   mechanisms[lock:physical] → sequences →
//   touch[lock:touch] → help → package[reserved]
//
// Off-spine (spine:false) steps in array order:
//   project_name  — copy-track CYOA fork; joinTarget:"characters"
//   touch_seed_source — touch-seed fork; joinTarget:"touch"
//
// Track/project_name routing:
//   copy-track:  choose_base → track → project_name → characters
//   adapt-track: choose_base → track → (skip project_name) → characters
//
// Characters internal flow (intra-phase — not manifest steps):
//   prefill → B-questions
//
// Side effects on step completion are all dispatched through applyStepCompletion()
// (steps/reducer.ts) — editors are pure (FR-011, R4).
//
// Double-instantiation guard (P1 fix) / re-instantiation on genuine base
// switch (F1 fix):
//   setScaffoldSpec() causes a second compile run whose onInstantiate callback
//   re-captures the artifact into pendingArtifactRef; the commit effect's
//   doCommit (below) would then run the choose_base side effect
//   (applyStepCompletion("choose_base", ...)) a second time for the SAME base.
//   An `instantiatedForBaseIdRef` (id-aware, not a plain boolean) prevents
//   that repeat from running more than once per base id, while still allowing
//   a confirm for a genuinely DIFFERENT base id later in the same session to
//   re-run the side effect — see docs/design-notes/switch-base-popup-behavior-log.md
//   (F1). Resets to null on start-over; set to the restored base's id on
//   résumé (handleResumeDraft).
// ---------------------------------------------------------------------------

const SURVEY_DIVIDER_WIDTH = 6;
const SURVEY_LEFT_MIN_PCT = 25;
const SURVEY_LEFT_MAX_PCT = 65;
const SURVEY_LEFT_INIT_PCT = 45;

// ---------------------------------------------------------------------------
// ActiveStepId — imported from surveySessionStore (the traversal vocabulary
// owner). See stores/surveySessionStore.ts (research D-R1).
// ---------------------------------------------------------------------------

// validateManifestShape (M2/M3/M4/M4b/M5 structural guard) now lives in
// steps/manifest.ts (exported, unit-tested by spec 034 T003). Still invoked
// once here at module load so a misshapen manifest is a hard error before any
// render — fail fast so CI catches it.
validateManifestShape();

// manifestIndexOf and nextSpineStepAfter have moved to steps/advance.ts
// (spec 028 Stage 5, T006). They are no longer needed in SurveyView.

interface SurveyViewProps {
  /**
   * The instantiated base keyboard from the working-copy store.
   * Null before the first base selection completes its compile cycle.
   * Passed to the OSK preview in the right pane.
   */
  baseKeyboard: BaseKeyboard | null;
}

export function SurveyView({ baseKeyboard }: SurveyViewProps) {
  // ---------------------------------------------------------------------------
  // Traversal state — sourced from surveySessionStore (spec 026 Stage 3).
  // StepHost reads activeStepId directly; SurveyView only needs scaffoldSpec
  // (for the compile pipeline) and localBase (for the OSK right pane).
  // ---------------------------------------------------------------------------
  const activeStepId = useSurveySessionStore((s) => s.activeStepId);
  const scaffoldSpec = useSurveySessionStore((s) => s.scaffoldSpec);
  const localBase = useSurveySessionStore((s) => s.localBase);
  const surveyContext = useSurveySessionStore((s) => s.surveyContext);

  // Self-contained useGitHubAuth() call (same idiom as MyKeyboardsList /
  // ManagedPRSubmitPanel) so SurveyView can start/stop the signed-in cloud
  // draft backup (startCloudSync, below) without threading auth state down
  // through props. Only the access-token PRIMITIVE is read — see the
  // cloud-sync effect's dependency array.
  const { token: githubToken } = useGitHubAuth();
  const cloudSyncAccessToken = githubToken?.accessToken ?? null;

  // Store actions needed by SurveyView (not delegated to StepHost).
  const sessionReset = useSurveySessionStore((s) => s.reset);
  const setLocalBase = useSurveySessionStore((s) => s.setLocalBase);
  // Injected into reducerDeps (spec 035 R12) so reducer.ts can clear the
  // touch_seed_source fork choice on a genuine base re-instantiation without
  // steps/ importing stores/ directly.
  const setTouchSeedSource = useSurveySessionStore((s) => s.setTouchSeedSource);

  // githubTokenRef lets dev's draftAutosave cloud-sync loop read the current
  // token lazily (from the single useGitHubAuth() call above), so signing in
  // mid-session starts syncing without restarting the subscription.
  const githubTokenRef = useRef(githubToken);
  useEffect(() => {
    githubTokenRef.current = githubToken;
  }, [githubToken]);
  const currentAccessToken = (): string | null => githubTokenRef.current?.accessToken ?? null;

  // Derive whether the active step declares layout:"full" (load-bearing per Stage 5,
  // FR-002, R4). SurveyView uses this to skip the two-pane shell for full-screen steps.
  const activeStepIsFullScreen = useMemo(() => {
    const step = manifest.find((s) => s.id === activeStepId);
    return step?.layout === "full";
  }, [activeStepId]);

  // Derived the same way as activeStepIsFullScreen: which right-pane content
  // the active step declares (default "preview" — the live OSK). Used below
  // to swap in CharacterMapPane for the Phase B build-list screen only, gated
  // further on discoveryMethod === "build-list" (the IntroChooser and the
  // manual step-by-step path keep the OSK preview — see steps/types.ts's
  // rightPane field and steps/manifest.ts's "characters" step).
  const activeRightPane = useMemo(() => {
    const step = manifest.find((s) => s.id === activeStepId);
    return step?.rightPane ?? "preview";
  }, [activeStepId]);
  const discoveryMethod = useSurveySessionStore((s) => s.discoveryMethod);
  const showCharacterMap = activeRightPane === "character-map" && discoveryMethod === "build-list";

  // Reset the session store on mount — the store is a module-level singleton that
  // persists across React tree unmounts/remounts (e.g. navigating away from the
  // survey route and back creates a new SurveyView mount = a new wizard session).
  // Without this reset the singleton would resume from stale prior state rather
  // than starting at "identity". Component-local useState used to give this
  // mount-fresh reset for free; this call restores that invariant for the store.
  //
  // DEVIATION 2 (spec 034 US3, research D4): a durable draft may have just been
  // restored in main.tsx (BEFORE this component — or any component — mounted),
  // patching both the working-copy AND survey-session stores so the author
  // resumes at their last `activeStepId`. An unconditional reset() here would
  // immediately clobber that restore. `wasDraftRestoredThisBoot()` reads the
  // module-level flag draftPersistence.loadDraft() sets on success; it is
  // stable across StrictMode's double-invoked mount effects because
  // loadDraft() itself only ever runs once, pre-mount, in main.tsx.
  //
  // The localStorage draft (lib/draftAutosave.ts) is unaffected either way: it
  // lives in localStorage, not the store — the resume banner below reads it and
  // only applyDraft() (on Resume) hydrates the store.
  // Flipped to true at the end of the reset/restore effect below — passed to
  // useSurveyBrowserHistorySync as a live ordering guard (DEV-only): if a
  // future edit reorders the two calls (or hoists the sync hook above this
  // effect), that hook's own mount effect finds this still `false` and fails
  // loud instead of silently tagging the browser entry with a stale
  // activeStepId. See useSurveyBrowserHistorySync.ts's doc comment on the
  // param.
  const resetOrRestoreSettledRef = useRef(false);
  useEffect(() => {
    if (!wasDraftRestoredThisBoot()) {
      useSurveySessionStore.getState().reset();
    }
    resetOrRestoreSettledRef.current = true;
    // Intentionally empty deps: runs exactly once on mount.
  }, []);

  // F7 fix — browser Back/Forward integration for the survey wizard (see
  // hooks/useSurveyBrowserHistorySync.ts for the full design + sync
  // invariant). MUST be called after the reset/restore effect immediately
  // above: its own mount effect reads the store's activeStepId to tag the
  // current browser entry, and needs that effect's decision (reset vs.
  // restored) already settled. resetOrRestoreSettledRef makes that ordering
  // requirement a live DEV-mode check rather than declaration-order-only.
  useSurveyBrowserHistorySync(resetOrRestoreSettledRef);

  // ---------------------------------------------------------------------------
  // Resume-draft banner + autosave (localStorage draft; lib/draftAutosave.ts).
  //
  // On the first SurveyView mount of a page load, peek at any saved draft and
  // offer to resume it. Autosave does not start until the author decides, so a
  // pending decision can't overwrite the very draft being offered. When there is
  // no draft, autosave starts immediately.
  // ---------------------------------------------------------------------------
  // The initializer must be PURE: <StrictMode> (main.tsx) double-invokes lazy
  // useState initializers in dev, and only the *second* return value is kept.
  // A flag flipped inside the initializer would make invocation 1 consume the
  // offer and invocation 2 (the kept value) see it already consumed → the banner
  // would silently never appear in `pnpm dev` / e2e. So read the flag here and
  // mark it consumed in the mount effect below instead.
  const [resumeMeta, setResumeMeta] = useState<DraftMeta | null>(() =>
    resumeOfferConsumed ? null : loadDraftMeta(),
  );

  // Cloud-restore offer (signed-in only): a server-backed draft found on load —
  // e.g. a new tab or a different device. Kept separate from the local
  // resumeMeta so the local draft always wins when both exist; the cloud offer
  // is only surfaced when there is no local draft to resume. Set at most once
  // per mount (cloudRestoreCheckedRef).
  const [cloudResume, setCloudResume] = useState<DraftMeta | null>(null);
  const cloudRestoreCheckedRef = useRef(false);

  // Mark the one-per-page-load resume offer as consumed after commit (idempotent
  // under StrictMode's mount/cleanup/mount). Subsequent same-session SurveyView
  // remounts (route away + back = a fresh wizard) then read the flag and skip the
  // banner; a real page reload resets the module flag by starting a new JS context.
  useEffect(() => {
    // Runs once on mount; touches only the module-level flag, so no deps.
    resumeOfferConsumed = true;
  }, []);

  useEffect(() => {
    // Wait for the author's Resume/Discard choice on either banner before
    // autosaving, so a pending decision can't overwrite the draft being offered.
    if (resumeMeta !== null || cloudResume !== null) return;
    const stopLocal = startDraftAutosave();
    // Cloud sync runs alongside localStorage autosave; it self-gates on the
    // token (guests never push) and on meaningful progress, so starting it here
    // for everyone is safe — a guest or pristine session pushes nothing.
    const stopCloud = startCloudSync(currentAccessToken);
    return () => {
      stopLocal();
      stopCloud();
    };
  }, [resumeMeta, cloudResume]);

  // Cloud-restore check (signed-in only). On the first render where a GitHub
  // token is present, look for a server-backed draft. Offer it only when there
  // is no local draft already being offered (local wins) and the author hasn't
  // started meaningful work — otherwise a fresh session's cloud backup would
  // pop an unexpected restore. Runs at most once per mount.
  useEffect(() => {
    if (cloudRestoreCheckedRef.current) return;
    const accessToken = githubToken?.accessToken ?? null;
    if (accessToken === null) return; // guest, or token not yet verified — wait
    cloudRestoreCheckedRef.current = true;
    if (resumeMeta !== null) return; // a local draft is offered — prefer it
    let cancelled = false;
    // Multi-project note: this one-shot check only looks at the caller's
    // currently-pinned active project (or the pending pre-instantiation slot
    // on a genuinely fresh browser) — discovering OTHER cloud-backed projects
    // from a browser with no local trace of them is the "My keyboards" list
    // screen's job (next cycle, specs/037-my-keyboards), not this banner's.
    const draftId = getActiveProjectKey() ?? PENDING_PROJECT_KEY;
    void loadServerDraftMeta(accessToken, draftId).then((serverMeta) => {
      if (cancelled || serverMeta === null) return;
      // Don't surprise an author who began working while the fetch was in flight.
      if (buildStudioDraft() !== null) return;
      setCloudResume(serverMetaToDraftMeta(serverMeta));
    });
    return () => {
      cancelled = true;
    };
  }, [githubToken, resumeMeta]);

  const [oskMode, setOskMode] = useState<OskMode>("desktop");
  const { containerRef, leftPct, onPointerDown } =
    useResizablePanes({ minPct: SURVEY_LEFT_MIN_PCT, maxPct: SURVEY_LEFT_MAX_PCT, initPct: SURVEY_LEFT_INIT_PCT });

  // Sync localBase when the prop changes (e.g. after a start-over that sets a new base).
  // localBase lives in the session store; we update it when the working-copy's baseKeyboard
  // prop changes so the wizard stays in sync with the pipeline-settled base.
  useEffect(() => {
    setLocalBase(baseKeyboard);
  }, [baseKeyboard, setLocalBase]);

  // Working-copy store actions needed by SurveyView (not delegated to StepHost).
  const resetSurvey = useWorkingCopyStore((s) => s.reset);
  const lockDesktop = useWorkingCopyStore((s) => s.lockDesktop);
  const clearStale = useWorkingCopyStore((s) => s.clearStale);
  const setTouchLayoutJson = useWorkingCopyStore((s) => s.setTouchLayoutJson);
  const instantiateFromBase = useWorkingCopyStore((s) => s.instantiateFromBase);
  const instantiateFromExisting = useWorkingCopyStore((s) => s.instantiateFromExisting);
  const baseVfs = useWorkingCopyStore((s) => s.baseVfs);
  const setValidatorFindings = useWorkingCopyStore((s) => s.setValidatorFindings);

  // ---------------------------------------------------------------------------
  // P1 fix (double-instantiation guard) + F1 fix (id-aware re-instantiation).
  //
  // For Track 1 (copy), setScaffoldSpec() causes a second compile run whose
  // onInstantiate re-fires for the SAME base already committed. Originally
  // gated by a plain boolean ("fire the R3 side effect at most once per
  // session"), which also — as an unwanted side effect — made it impossible to
  // ever re-instantiate for a genuinely DIFFERENT base chosen later in the same
  // session (F1: docs/design-notes/switch-base-popup-behavior-log.md). The gate
  // is now id-aware: it records WHICH base id doCommit has already committed,
  // so a second settle for that SAME id (P1) is still a no-op, but a confirm
  // for a DIFFERENT id (F1, after the synchronous rebase-confirm gate in
  // BaseResolutionAdapter.onConfirm has already run) proceeds and re-runs
  // doCommit's body. Null before any commit; reset to null on start-over; set
  // to the restored base's id on résumé (see handleResumeDraft) so a résumé
  // over an already-instantiated copy does not re-trigger doCommit either.
  // ---------------------------------------------------------------------------
  const instantiatedForBaseIdRef = useRef<string | null>(null);

  // ---------------------------------------------------------------------------
  // Preview-before-commit (choose_base step): the compile pipeline may settle
  // BEFORE the author clicks "Choose this keyboard" (they might preview
  // several bases first). `onInstantiate` below only CAPTURES the settled
  // artifact here; the actual instantiation (`doCommit`) is deferred until
  // `baseConfirmed` flips true, via the effect that follows `onInstantiate`.
  // Cleared alongside `instantiatedForBaseIdRef` on start-over.
  // ---------------------------------------------------------------------------
  const pendingArtifactRef = useRef<{
    base: BaseKeyboard;
    vfs: VirtualFS;
    ir: KeyboardIR | null;
    removalCapabilities: Map<string, RemovalCapability>;
  } | null>(null);

  // ---------------------------------------------------------------------------
  // T023 (spec 034 US3): teardown fn for the durable-draft autosave, installed
  // once the working copy is instantiated (see onInstantiate below) and torn
  // down on unmount / start-over / a fresh re-instantiation for a new project.
  // ---------------------------------------------------------------------------
  const autosaveTeardownRef = useRef<(() => void) | null>(null);

  useEffect(() => {
    return () => {
      autosaveTeardownRef.current?.();
      autosaveTeardownRef.current = null;
    };
    // Teardown-on-unmount only; the ref itself is stable.
  }, []);

  // ---------------------------------------------------------------------------
  // US3a: signed-in cloud-draft backup. Runs ALONGSIDE (never instead of) the
  // local autosave above — see draftPersistence.ts's startCloudSync docstring
  // for what it pushes and why this is not a second D3-scoped debounce cycle.
  // Starts as soon as an access token is present (sign-in can happen before
  // OR after a working copy is instantiated — startCloudSync's own flush
  // no-ops while there is no active project yet) and tears down on sign-out
  // or unmount. `cloudSyncAccessToken` is the effect's ONLY dependency, so
  // this does not restart the subscription on every render; React calls the
  // returned cleanup (tearing down the old subscription) before re-running
  // the effect on a token change, so there is exactly one live subscription
  // at a time. A project switch (e.g. start-over) does NOT need its own
  // teardown/restart here — startCloudSync re-resolves the active project on
  // every flush, so it simply follows whichever project is active next.
  // ---------------------------------------------------------------------------
  useEffect(() => {
    if (cloudSyncAccessToken === null) {
      return undefined;
    }
    const teardown = startPersistenceCloudSync(() => cloudSyncAccessToken);
    return teardown;
  }, [cloudSyncAccessToken]);

  // ---------------------------------------------------------------------------
  // ReducerDeps — injected into applyStepCompletion (steps/reducer.ts).
  // All store actions and lib helpers are injected here; the reducer itself has
  // no static imports from stores/ or lib/ (boundary compliance).
  //
  // The wrapper lambdas delegate to stable module-level imports (buildTouchLayoutJson,
  // resolveBaseTouchJson, instantiateFromBaseIfConfirmed) that are not React state,
  // so they are intentionally omitted from the dependency array.
  // ---------------------------------------------------------------------------
  const reducerDeps: ReducerDeps = useMemo(
    () => ({
      lockDesktop,
      clearStale,
      setTouchLayoutJson,
      instantiateFromBase,
      instantiateFromExisting,
      setTouchSeedSource,
      // Spec 035 R11: this wrapper is the ONE call site (of the two — the
      // other is TouchGallery's preview/lint memos) that applies the
      // emission matrix for the output path. It resolves the Entity-5
      // default seed source, decides whether to emit at all, and only then
      // calls the real buildTouchLayoutJson — so reducer.ts (steps/, which
      // may not import lib/) stays a thin pass-through.
      buildTouchLayoutJson: (baseIrArg, assignments, opts) => {
        const seedSource = resolveTouchSeedSource(opts.seedSource, opts.baseTouchJson !== undefined);
        const hasRealEdits = assignments.length > 0;
        if (!shouldEmitTouchLayout(seedSource, opts.mods, hasRealEdits)) {
          return { json: null, warnings: [] };
        }
        return buildTouchLayoutJson(baseIrArg, assignments, {
          // Reseed discards the shipped layout (R10) — never pass baseTouchJson
          // through on that path, even though buildTouchLayoutJson's own Case A
          // branch condition would ignore it anyway.
          ...(seedSource !== "reseed-from-desktop" && opts.baseTouchJson !== undefined
            ? { baseTouchJson: opts.baseTouchJson }
            : {}),
          mods: opts.mods,
          seedSource,
        });
      },
      resolveBaseTouchJson: (vfs) => resolveBaseTouchJson(vfs),
      instantiateFromBaseIfConfirmed: (base, opts, options) =>
        instantiateFromBaseIfConfirmed(base, opts, options),
      // spec-014 mutate seam (T014): read/write the working-copy carve IR for
      // the reducer's path-scoped mutate() apply. Read via getState() (stable,
      // no re-render churn); write via the OVERLAY-PRESERVING setWorkingIR action.
      // These are INCREMENTAL patches to the working IR (mutate-apply US1 +
      // touch re-propagation US2), not base replacements, so they must NOT clear
      // the carve-deletion overlay (setIR would). See workingCopyStore.setWorkingIR.
      getWorkingIR: () => useWorkingCopyStore.getState().ir,
      setWorkingIR: (next) => useWorkingCopyStore.getState().setWorkingIR(next),
      // spec-014 US2 (T024): the staleness closure drives touch re-propagation
      // on physical-step completion. Read via getState() (no re-render churn).
      getStaleSteps: () => useWorkingCopyStore.getState().staleSteps,
      // Spec 046 R10: record (never act on) the base-content migration need
      // when base-plus-mark output is chosen over a ready-made-form base.
      setMarksMigrationNeeded: (needed) =>
        useSurveySessionStore.getState().setMarksMigrationNeeded(needed),
    }),
    // Wrapper lambdas delegate to stable module imports — excluded from deps intentionally.
    [lockDesktop, clearStale, setTouchLayoutJson, instantiateFromBase, instantiateFromExisting, setTouchSeedSource],
  );

  // Keep reducerDepsRef current so the async onInstantiate callback always
  // sees the latest deps without being re-created on every render.
  const reducerDepsRef = useRef<ReducerDeps>(reducerDeps);
  useEffect(() => {
    reducerDepsRef.current = reducerDeps;
  }, [reducerDeps]);

  // ---------------------------------------------------------------------------
  // doCommit — the actual choose_base instantiation side effect (R3).
  //
  // Extracted verbatim from the pre-preview-before-commit `onInstantiate` body
  // so its internals are unchanged; it is now invoked from the single-
  // instantiation effect below (gated on `baseConfirmed`) rather than directly
  // from the compile-pipeline callback. Dispatches
  // applyStepCompletion("choose_base", ...), which routes Track 2 →
  // instantiateFromExisting, Track 1/default → instantiateFromBaseIfConfirmed.
  //
  // instantiatedForBaseIdRef gates this to fire at most once PER BASE ID: a
  // second compile settle for the SAME base (setScaffoldSpec's re-compile, or
  // a second confirm click on an unchanged base) is a no-op (P1 fix); a
  // confirm for a DIFFERENT base id proceeds and re-runs the body below (F1
  // fix). The rebase-confirm question itself is NOT asked here — by the time
  // this runs, BaseResolutionAdapter.onConfirm has already resolved it
  // synchronously (confirmRebaseTo); the `skipRebaseConfirm: true` passed to
  // applyStepCompletion below tells the reducer not to ask a second time.
  // ---------------------------------------------------------------------------
  const doCommit = useCallback(
    (
      base: BaseKeyboard,
      { vfs, ir, removalCapabilities }: { vfs: VirtualFS; ir: KeyboardIR | null; removalCapabilities: Map<string, RemovalCapability> },
    ) => {
      if (instantiatedForBaseIdRef.current === base.id) return;
      instantiatedForBaseIdRef.current = base.id;

      // Spec 034's VR-5 used to call `replaceActiveDraftIfDifferentProject`
      // here: picking a new base DELETED the previously active project's
      // draft, because the studio could hold only one draft at a time and a
      // project switch was therefore indistinguishable from abandonment.
      //
      // "My keyboards" (spec 047 US3a) is precisely the feature that makes
      // several drafts co-exist, so that implicit delete is now the direct
      // negation of SC-001 — it would let an author start keyboard B and find
      // keyboard A silently gone from their list. The clear-on-switch is
      // removed, not merely relaxed: there is no longer any sense in which a
      // project switch implies discarding the project being switched away
      // from. Abandonment stays explicit, via `discardActiveDraft` on the
      // start-over paths (WelcomeScreen's "start over" and this shell's own
      // reset below) — the author's own instruction, not an inference from
      // navigation. See specs/047-my-keyboards/spec.md ("Superseded: spec
      // 034 VR-5").

      // Pin the active-project pointer to this base's id the moment a working
      // copy is instantiated (specs/047-my-keyboards spec — projectKey =
      // identity.keyboardId ?? baseKeyboard.id; the identity keyboardId, when
      // Track 1 later sets one, isn't chosen yet at this point, so base.id is
      // the correct starting key for both tracks). This ONLY repoints THIS
      // session's active-project pointer — it does not touch any other
      // project's stored record or index row, so starting a new keyboard
      // never overwrites/wipes an already-in-flight project.
      pinActiveProject(base.id);


      // Reads via getState() escape hatch (not a selector) to avoid a stale closure — the callback is memoised with empty deps.
      const track = useSurveySessionStore.getState().selectedTrack;
      applyStepCompletion(
        "choose_base",
        { base, vfs, ir, removalCapabilities, track: track ?? null, skipRebaseConfirm: true },
        reducerDepsRef.current,
      );

      // T023: install the durable-draft autosave now that the working copy is
      // instantiated. `deriveProjectKeyFromWorkingCopy` reads the JUST-WRITTEN
      // store state via getState() (identity.keyboardId falls back to
      // baseKeyboard.id — see draftPersistence.ts) so this resolves immediately
      // for both tracks, even before Track 1's Phase A sets a custom keyboardId.
      // F1 fix: `instantiatedForBaseIdRef` above only guards against a REPEAT
      // commit for the SAME base id — a genuine base switch (a different id)
      // reaches this point with a real prior autosave subscription still
      // live, so `autosaveTeardownRef.current` is NO LONGER always null here;
      // the `?.()` teardown-then-reinstall below is load-bearing (not
      // defensive) for that case — it tears down the OLD project's autosave
      // subscription before installing the NEW project's, so edits after a
      // switch autosave under the new project key, not the abandoned one.
      const projectKey = deriveProjectKeyFromWorkingCopy(useWorkingCopyStore.getState());
      if (projectKey !== null) {
        autosaveTeardownRef.current?.();
        autosaveTeardownRef.current = installDraftAutosave(projectKey);
      }
    },
    // Same escape hatch as the pre-preview-before-commit onInstantiate: all
    // reads are via getState()/reducerDepsRef.current (stable refs), not
    // React state, so an empty dep array is intentional here too.
    [],
  );

  // ---------------------------------------------------------------------------
  // onInstantiate — compile-pipeline callback (R3: choose_base side effect).
  //
  // Preview-before-commit: fires whenever the compile pipeline produces an
  // IR + VFS for the CURRENTLY PREVIEWED base (every preview click restarts
  // the pipeline for its base). This callback ONLY captures the settled
  // artifact — it does NOT instantiate the working copy or advance the
  // wizard. `doCommit` (above) does that, invoked by the effect below once
  // the author clicks "Choose this keyboard" (`baseConfirmed` flips true).
  // This is what makes previewing several bases side-effect-free.
  // ---------------------------------------------------------------------------
  const onInstantiate = useCallback<OnInstantiateCallback>((base, { vfs, ir, removalCapabilities }) => {
    pendingArtifactRef.current = { base, vfs, ir, removalCapabilities };
  }, []);

  // Subscribed so the effect below re-checks whenever the author confirms.
  const baseConfirmed = useSurveySessionStore((s) => s.baseConfirmed);

  // Pattern map for the working-copy transform — needed from Phase F onwards so
  // mechanism assignments are projected into the OSK preview.
  const phaseResults = useWorkingCopyStore((s) => s.phaseResults);
  const sessionAssignments = useMemo(() => physicalAssignmentsOf(phaseResults), [phaseResults]);
  const [surveyPatternMap, setSurveyPatternMap] = useState<Map<string, Pattern>>(new Map());
  useEffect(() => {
    const ids = new Set(sessionAssignments.flatMap((a) => a.mechanisms.map((m) => m.patternId)));
    if (ids.size === 0) return;
    const svc = getPatternLibraryService();
    Promise.all([...ids].map((id) => svc.getById(id)))
      .then((patterns) => {
        const map = new Map<string, Pattern>();
        for (const p of patterns) {
          if (p !== undefined) map.set(p.id, p);
        }
        setSurveyPatternMap(map);
      })
      .catch((err: unknown) => {
        devLog.error("[SurveyView] pattern load for preview failed:", err);
      });
  }, [sessionAssignments]);

  // Working-copy transform — projects carve + assignments + identity into the OSK.
  // surveyPatternMap is empty until Phase C completes; null patternMap → skip assignments.
  //
  // previewedBaseId: localBase.id — bug F4. `localBase` drives the compile
  // pipeline below (preview-before-commit) and can differ from the store's
  // already-instantiated `baseKeyboard` when the author previews a candidate
  // replacement base without having confirmed the switch yet. Passing it lets
  // useWorkingCopyTransform suppress the carve/identity overlay for a
  // candidate base it doesn't belong to, instead of projecting the committed
  // base's carve deletions onto the candidate's freshly-fetched VFS.
  const workingCopyTransform = useWorkingCopyTransform({
    patternMap: surveyPatternMap.size > 0 ? surveyPatternMap : null,
    previewedBaseId: localBase?.id ?? null,
  });

  // Use localBase (immediately updated on selection) to drive the pipeline.
  // Pass scaffoldSpec so Track 1 routes through scaffold() instead of fetchKeyboardSourceToVfs.
  const { stage: artifactStage, retry } = useKeyboardArtifact(localBase, scaffoldSpec, workingCopyTransform, onInstantiate);

  // ---------------------------------------------------------------------------
  // Single-instantiation effect (preview-before-commit).
  //
  // Runs `doCommit` once BOTH are true:
  //   - the author has confirmed (`baseConfirmed`, set by
  //     BaseResolutionAdapter's onConfirm — see editors/adapters/panelAdapters.tsx,
  //     which has already synchronously resolved any rebase-confirm question
  //     via confirmRebaseTo BEFORE flipping baseConfirmed — F1 fix)
  //   - the compile pipeline has actually settled for THAT SAME base
  //     (`pendingArtifactRef`, filled by `onInstantiate` above).
  //
  // "At most once" is now per-base-id, not per-mount: `doCommit` itself
  // early-returns via `instantiatedForBaseIdRef` when the settled artifact's
  // base id has already been committed (P1's repeat-settle case), but
  // proceeds — and re-instantiates — for a genuinely different confirmed base
  // id (F1). This effect's own job is unchanged: hand `doCommit` whatever
  // settled artifact matches the currently confirmed base, whenever that
  // becomes true, in either order.
  //
  // Confirm is gated on `previewStatus === "ready"` in BaseResolution's commit
  // button, so in practice `baseConfirmed` only flips true once the pipeline
  // has already settled — the ref is already populated by the time this
  // effect sees `baseConfirmed`. The `artifactStage`-triggered re-run (waiting
  // for the ref to be filled after confirm) is retained purely as a defensive
  // fallback, not a load-bearing path. The `art.base.id === lb.id` check
  // guards against a stale ref from a PREVIOUS preview surviving a fast
  // re-preview.
  // ---------------------------------------------------------------------------
  useEffect(() => {
    if (!baseConfirmed) return;
    const art = pendingArtifactRef.current;
    const lb = useSurveySessionStore.getState().localBase;
    if (art && lb && art.base.id === lb.id) {
      doCommit(art.base, { vfs: art.vfs, ir: art.ir, removalCapabilities: art.removalCapabilities });
    }
    // else: compile still in flight for this base — onInstantiate will fill
    // pendingArtifactRef and the "ready" artifactStage transition below will
    // re-run this effect.
    // doCommit is stable (empty-deps useCallback, see its own definition
    // above) — omitted from deps to mirror the existing escape-hatch
    // convention in this file (e.g. the reducerDeps memo above).
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [baseConfirmed, artifactStage]);

  // Derive KMN source from the working copy's base VFS for the validator.
  const kmnSource = useMemo(() => {
    if (!baseVfs) return null;
    const path = findKmnPath(baseVfs);
    if (!path) return null;
    const raw = baseVfs.get(path)?.content ?? null;
    return typeof raw === "string" ? raw : null;
  }, [baseVfs]);
  const { findings } = useValidator(kmnSource);
  // spec-014 US5/T034 — publish the SINGLE debounced `useValidator` findings to
  // the store so the sibling `StudioShell` can feed C4 spine-prefix shippability
  // the REAL Layer-A findings WITHOUT a second `useValidator`/debounce (V3 /
  // Article IV). This is a store-bridge publish, not a new validation source.
  useEffect(() => {
    setValidatorFindings(findings);
  }, [findings, setValidatorFindings]);
  const globalFindings = useMemo(() => selectUnmappedFindings(findings), [findings]);
  // Warning-severity global findings render as a bare advisory line above the step content
  // — no card background/border/code-badge/hint-button/location chrome; see
  // the survey-pane render below. Non-warning severities keep the existing
  // boxed LintSummary treatment untouched.
  const globalWarnings = useMemo(
    () => globalFindings.filter((f) => f.severity === "warning"),
    [globalFindings],
  );
  const globalNonWarnings = useMemo(
    () => globalFindings.filter((f) => f.severity !== "warning"),
    [globalFindings],
  );

  // ---------------------------------------------------------------------------
  // Start over — reset session store first (clears all traversal slots + history),
  // then reset the working-copy store and local component state.
  // Ordering: session.reset() before instantiatedForBaseIdRef.current = null so
  // the guard is clear before any re-instantiation can fire (research D-R5).
  // ---------------------------------------------------------------------------
  function handleStartOver() {
    // T024 (spec 034 US3, research D5, G-3): clear the durable draft (and the
    // active-project pointer) BEFORE resetting the in-memory stores, so the
    // NEXT boot does not immediately re-rehydrate the just-abandoned session.
    discardActiveDraft();
    autosaveTeardownRef.current?.();
    autosaveTeardownRef.current = null;

    sessionReset();
    resetSurvey();
    instantiatedForBaseIdRef.current = null;
    pendingArtifactRef.current = null;
    // sessionReset() calls reset() which already clears charactersSubStage to
    // "prefill" (spec 027 Stage 4 — the store slot is the authoritative owner).
    // sessionReset() also clears baseConfirmed back to false via INITIAL_STATE.
    // Discard any saved draft — start-over is an explicit "throw it away".
    // Read the project key BEFORE clearDraft() (which clears the active
    // pointer as part of removing the project) so the server call still knows
    // which project to delete. clearDraft() only removes THIS ONE project's
    // record + index row — every other in-flight "My keyboards" project is
    // untouched (spec: start-over must not wipe the whole project index).
    const projectKey = getActiveProjectKey();
    clearDraft();
    if (projectKey !== null) {
      const accessToken = currentAccessToken();
      if (accessToken !== null) void clearServerDraft(accessToken, projectKey);
    }
    setResumeMeta(null);
    setCloudResume(null);
  }

  // ---------------------------------------------------------------------------
  // Resume banner handlers.
  //
  // Resume: restore both stores from the saved draft, then mark the working copy
  // as already instantiated FOR THE RESTORED BASE so the compile pipeline's
  // onInstantiate does not re-run instantiateFromBase over the restored copy
  // (which would pop the rebase-confirm dialog / risk discarding restored
  // survey answers — F1/F2). Reads the restored base id back from the
  // just-patched workingCopyStore rather than hardcoding `true`, so a LATER
  // genuine switch to a DIFFERENT base (in the same session, after resume)
  // still re-instantiates normally (F1 fix — see instantiatedForBaseIdRef).
  // Discard: drop the draft and continue fresh.
  // Either way, clearing resumeMeta hides the banner and starts autosave.
  // ---------------------------------------------------------------------------
  function handleResumeDraft() {
    const active = resumeMeta ?? cloudResume;
    if (active?.source === "cloud") {
      // Fetch the full payload from the server, then apply it. applyStudioDraft
      // validates the record shape/version before hydrating the stores.
      const accessToken = currentAccessToken();
      if (accessToken !== null) {
        // Same draftId resolution as the cloud-restore check above — the
        // window between that check and this click doesn't run autosave
        // (gated on resumeMeta/cloudResume being null), so the active-project
        // pointer can't have moved in between.
        const draftId = getActiveProjectKey() ?? PENDING_PROJECT_KEY;
        // Dev's engine stores StudioDraft envelopes; pick that envelope off
        // the shared transport (see serverDraftStore.ts's ServerDraftPayload).
        void loadServerDraftContent<StudioDraft>(accessToken, draftId).then((draft) => {
          if (applyStudioDraft(draft)) {
            instantiatedForBaseIdRef.current = useWorkingCopyStore.getState().baseKeyboard?.id ?? null;
            setActiveProject(draftId);
          }
          setResumeMeta(null);
          setCloudResume(null);
        });
        return;
      }
    }
    if (applyDraft()) {
      instantiatedForBaseIdRef.current = useWorkingCopyStore.getState().baseKeyboard?.id ?? null;
    }
    setResumeMeta(null);
    setCloudResume(null);
  }

  function handleDiscardDraft() {
    const projectKey = getActiveProjectKey();
    clearDraft();
    if (projectKey !== null) {
      const accessToken = currentAccessToken();
      if (accessToken !== null) void clearServerDraft(accessToken, projectKey);
    }
    setResumeMeta(null);
    setCloudResume(null);
  }

  // ---------------------------------------------------------------------------
  // Style constants (shared by full-screen and two-pane layouts)
  // ---------------------------------------------------------------------------

  const questionsPaneStyle: CSSProperties = {
    flexBasis: `calc(${leftPct}% - ${SURVEY_DIVIDER_WIDTH / 2}px)`,
    flexShrink: 0,
    flexGrow: 0,
    display: "flex",
    flexDirection: "column",
    minHeight: 0,
    overflowY: "auto",
    padding: 24,
    boxSizing: "border-box",
    color: TEXT_MAIN,
    fontFamily: FONT,
  };

  // ---------------------------------------------------------------------------
  // basePreviewStatusStore value — a coarse projection of `artifactStage` (see
  // stores/basePreviewStatusStore.ts for the BasePreviewStatus union).
  // Published to the store below so BaseResolutionAdapter (reached through
  // StepHost while activeStepId === "choose_base") can read the live preview
  // status without importing useKeyboardArtifact directly, and without a
  // prop-drilling chain through StepHost's generic EditorStepProps.
  // ---------------------------------------------------------------------------
  const previewStatus: BasePreviewStatus = useMemo(() => {
    if (localBase === null) return "idle";
    switch (artifactStage.kind) {
      case "fetching":
      case "vfs-loading":
      case "compiling":
        return "loading";
      case "ready":
        return "ready";
      case "error":
        return "error";
      default:
        return "idle";
    }
  }, [localBase, artifactStage.kind]);

  const setBasePreviewStatus = useBasePreviewStatusStore((s) => s.setStatus);
  useEffect(() => {
    setBasePreviewStatus(previewStatus);
  }, [previewStatus, setBasePreviewStatus]);

  // ---------------------------------------------------------------------------
  // Render: StepHost drives all survey step rendering (spec 028 Stage 5, T012).
  //
  // StepHost reads activeStepId from surveySessionStore, resolves the manifest
  // step, and selects chrome by step.layout (FR-002, R4):
  //   layout:"full" → full-screen container (returned directly, wrapping the panes)
  //   otherwise    → left pane content (returned inside the two-pane shell below)
  //
  // The host handles done/unsupported terminals and the unknown-id error panel.
  // SurveyView retains: resizable panes, OSK right pane, validator, oskMode,
  // pattern-map effect, instantiatedForBaseIdRef, onInstantiate (FR-009).
  // ---------------------------------------------------------------------------

  const stepHost = (
    <StepHost
      reducerDeps={reducerDeps}
      onStartOver={handleStartOver}
      ctx={surveyContext}
    />
  );

  const rightPct = 100 - leftPct;

  // Corner reset — visible on every survey step (both layouts). Wired to the
  // same handleStartOver as the terminal panels' "Start over", so it clears
  // stores + draft directly and never trips the rebase-confirm dialog.
  const resetButton = <SurveyResetButton onReset={handleStartOver} />;

  // Full-screen steps (carve/mechanisms/sequences/touch) bypass the two-pane layout.
  // StepHost returns the full-screen container; SurveyView renders it directly.
  // This reproduces the pre-Stage-5 early-return pattern without per-step branches
  // in SurveyView — the decision is data-driven via step.layout (R4, FR-002).
  if (activeStepIsFullScreen) {
    return (
      <>
        {stepHost}
        {resetButton}
      </>
    );
  }

  return (
    <div
      ref={containerRef}
      style={{
        display: "flex",
        flexDirection: "row",
        height: "100%",
        width: "100%",
        background: "var(--bg)",
        overflow: "hidden",
      }}
    >
      {/* Left pane: survey questions (StepHost renders pane content) */}
      <section aria-label="Survey questions" style={questionsPaneStyle}>
        {(resumeMeta ?? cloudResume) !== null && (
          <ResumeDraftBanner
            meta={(resumeMeta ?? cloudResume)!}
            onResume={handleResumeDraft}
            onDiscard={handleDiscardDraft}
          />
        )}
        {globalWarnings.length > 0 && (
          // Rendered flush on "var(--bg)" — the same token the container above
          // paints and the one CharacterMapPane's own root implicitly sits on
          // (it sets no background of its own, so it shows through to the
          // container's var(--bg) too). Pinned explicitly here rather than left
          // to accidental non-override, so a future change to questionsPaneStyle's
          // background doesn't silently drag this along. No border/card fill/
          // padding-as-box — this is text on the character-map surface, not a
          // card.
          <div
            role="status"
            aria-live="polite"
            style={{ display: "flex", flexDirection: "column", gap: 8, marginBottom: 12, background: "var(--bg)" }}
          >
            {globalWarnings.map((f, i) => (
              <div key={`${f.code}-${i}`} style={{ display: "flex", flexDirection: "column", gap: 2 }}>
                <p style={{ margin: 0, fontSize: 13, lineHeight: 1.5, color: TEXT_MAIN }}>
                  <span aria-hidden="true">⚠</span>{" "}
                  <Trans id="common.warningLabel">Warning:</Trans> {f.message}
                </p>
                {f.hint !== undefined && (
                  <p style={{ margin: 0, fontSize: 12, lineHeight: 1.5, color: TEXT_DIM }}>
                    {f.hint}
                  </p>
                )}
              </div>
            ))}
          </div>
        )}
        {globalNonWarnings.length > 0 && (
          <LintSummary findings={globalNonWarnings} />
        )}
        {stepHost}
      </section>

      {/* Drag handle */}
      <ResizeHandle onPointerDown={onPointerDown} />

      {/* Right pane: live OSK preview, OR (Phase B build-list only) the
          interactive character map — see activeRightPane/showCharacterMap
          above. The mechanism gallery and every other full-screen step render
          their own preview and are unaffected (they never reach this branch:
          activeStepIsFullScreen returns early above). */}
      <section
        aria-label={showCharacterMap ? "Character map" : "Keyboard preview"}
        style={{
          flexBasis: `calc(${rightPct}% - ${SURVEY_DIVIDER_WIDTH / 2}px)`,
          flexGrow: 1,
          flexShrink: 0,
          display: "flex",
          flexDirection: "column",
          gap: 12,
          minHeight: 0,
          overflow: "auto",
          padding: 24,
          boxSizing: "border-box",
          color: TEXT_MAIN,
          fontFamily: FONT,
        }}
      >
        {showCharacterMap ? (
          <CharacterMapPane />
        ) : localBase === null ? (
          <div
            style={{
              flex: 1,
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              flexDirection: "column",
              gap: 12,
              color: "#9aa7b8",
              fontSize: 14,
              textAlign: "center",
            }}
          >
            <span style={{ fontSize: 32, opacity: 0.4, fontFamily: "monospace" }}>[kb]</span>
            <span>
              <Trans id="preview.empty.hint">
                Choose a base keyboard in the wizard to see a live preview here.
              </Trans>
            </span>
          </div>
        ) : (
          <>
            <div
              style={{
                display: "flex",
                justifyContent: "space-between",
                alignItems: "center",
                gap: 12,
                flexWrap: "wrap",
              }}
            >
              <h2 style={{ margin: 0, fontSize: "1.1rem", color: "#6ea8fe" }}>
                {localBase.displayName}
              </h2>
              <OskModeToggle value={oskMode} onChange={setOskMode} />
            </div>
            <OSKFrame
              baseKeyboard={localBase}
              oskMode={oskMode}
              stage={artifactStage}
              retry={retry}
            />
          </>
        )}
      </section>

      {resetButton}
    </div>
  );
}


// ---------------------------------------------------------------------------
// StudioShell — top-level layout: nav bar + route content
// ---------------------------------------------------------------------------

export function StudioShell() {
  const route = useRoute();
  const { t } = useLingui();

  const selectedBaseKeyboard = useWorkingCopyStore((s) => s.baseKeyboard);

  // ---------------------------------------------------------------------------
  // Completeness report — T042/US3.
  // Computed here (where the store is reachable) and passed down to DashboardView
  // as a prop. DashboardView has NO stores/ import (dashboard-layer boundary).
  // ---------------------------------------------------------------------------
  const desktopLocked = useWorkingCopyStore((s) => s.desktopLocked);
  const touchLayoutJson = useWorkingCopyStore((s) => s.touchLayoutJson);
  const staleSteps = useWorkingCopyStore((s) => s.staleSteps);
  // spec-014 US5/T034: C4 spine-prefix shippability has GRADUATED at the
  // function level — runCompleteness/checkSpinePrefixShippability now accept the
  // REAL Layer-A validator findings and strand lock-reaching prefixes on a
  // blocking finding (see dashboard/completeness.ts; V1/V2 proved in
  // completeness.test.ts, V3 in tests/dashboard/articleIVProbe.test.ts).
  //
  // LIVE WIRING (T034): those findings now flow through. The single debounced
  // `useValidator` cycle lives in the sibling `SurveyView` component (line ~545),
  // which publishes its output into `useWorkingCopyStore.validatorFindings` via
  // an effect. `StudioShell` reads that slice here and passes it into the single
  // `runCompleteness` call, so a blocking Layer-A finding live-strands the
  // lock-reaching spine prefixes. This honors V3 (Article IV — no SECOND
  // debounce / parallel validation path): there is exactly ONE `useValidator`
  // call site (in SurveyView) and exactly ONE `runCompleteness` call site (here),
  // and the latter consumes the former's output via the store bridge — no second
  // 300 ms timer. With the seam off (or before any validation cycle resolves),
  // `validatorFindings` defaults to `[]` ⇒ the pure structural proxy, byte-
  // identical to P4b / flag-off.
  const validatorFindings = useWorkingCopyStore((s) => s.validatorFindings);
  // #890 — default-fill provenance, published by MechanismGallery's
  // pattern-loading effect. Passed down to FlowMapView -> StrategyTreeView as
  // a prop for the same dashboard-layer boundary reason as completenessReport
  // below (DashboardView/StrategyTreeView have NO stores/ import).
  const axisFills = useWorkingCopyStore((s) => s.axisFills);
  const completenessReport = useMemo(
    () =>
      runCompleteness(
        manifest,
        { desktopLocked, touchLayoutJson },
        staleSteps,
        validatorFindings,
      ),
    [desktopLocked, touchLayoutJson, staleSteps, validatorFindings],
  );

  // ---------------------------------------------------------------------------
  // Output nav-link UX signal (P0 fix) — NOT the authoritative enforcement
  // (that is OutputScreen's canDownload gate via usePreviewArtifact, which
  // still applies regardless of how #output was reached). This is purely so
  // the block is visible on the tab itself before the click. Same shared hook
  // (hooks/useInventoryCoverageGate.ts) as StepHost/PhaseFGate/OutputScreen —
  // do not re-derive the desktop-always/touch-only-if-authored booleans here.
  // ---------------------------------------------------------------------------
  const outputNavBlocked = useInventoryCoverageGate().blocked;

  let content: ReactNode;
  switch (route) {
    case "welcome":
      content = <WelcomeScreen />;
      break;
    case "survey":
      content = <SurveyView baseKeyboard={selectedBaseKeyboard} />;
      break;
    case "preview":
      content = <PreviewScreen />;
      break;
    case "output":
      content = <OutputScreen />;
      break;
    case "flowmap":
      content = <FlowMapView completeness={completenessReport} axisFills={axisFills} />;
      break;
    case "profile":
      content = <ProfileScreen />;
      break;
  }

  // NOTE: the <I18nProvider> lives in AppRoot, ABOVE this component — never
  // here. StudioShell calls useLingui() itself (below, for the nav tooltip),
  // and a component cannot consume a context it renders: that combination
  // returned a null context and blanked the app in production builds, where
  // Lingui's dev-only invariant is stripped. See AppRoot.tsx.
  return (
    <div
      style={{
        display: "flex",
        flexDirection: "column",
        height: "100vh",
        width: "100vw",
        overflow: "hidden",
        background: "var(--bg)",
      }}
    >
      <NavBar
        active={route}
        outputBlocked={outputNavBlocked}
        outputBlockedTitle={t({
          id: "studio.nav.outputBlocked.title",
          message: "Finish every inventory character before you can access Output",
        })}
      />
      <div style={{ flex: 1, minHeight: 0, overflow: "hidden" }}>{content}</div>
    </div>
  );
}

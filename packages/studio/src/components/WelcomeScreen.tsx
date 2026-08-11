// WelcomeScreen — brief first-visit landing (proposal §A.6).
//
// Two paths:
//   • Sign in (returning user) — GitHub or Google. In OAuth, "sign in" and
//     "sign up" are the same connect() call; the provider decides whether the
//     user is new or returning. So these reuse the existing useGitHubAuth /
//     useGoogleAuth connect() — no new auth plumbing (see SignUpPanel.tsx).
//   • "Continue as guest" → navigateTo('survey') (fresh start).
//
// Deliberately plain: two columns — what Studio is on the left, the sign-in
// decision in a card on the right — stacking to one column when they no longer
// fit side by side. No gradients or marketing chrome. Provider buttons mirror
// SignUpPanel's brand styling.
//
// Why the copy says what it says. The card has to answer "what is this?" and
// "why sign in?" before an author will spend a session on it, and both answers
// are load-bearing claims about behaviour that must stay true:
//   • "saved in this browser only" (guest) — a guest's work IS durably
//     autosaved to localStorage (draftPersistence's installDraftAutosave), so
//     the honest warning is about scope, not loss: clearing browsing data or
//     switching machines loses it. Do not weaken this to "your work will be
//     lost" — an author who reloads and finds their draft intact stops
//     believing the rest of the card.
//   • "sign in any time and your work comes with you" — verified, not
//     aspirational: StudioShell's cloud-sync effect keys on the access token,
//     and startCloudSync does an immediate flush at install time, so signing in
//     mid-session pushes the already-existing local draft rather than waiting a
//     full CLOUD_SYNC_DEBOUNCE_MS window. Known narrow gap: progress made
//     BEFORE a keyboard is instantiated lives under PENDING_PROJECT_KEY, which
//     startCloudSync deliberately never pushes; it becomes cloud-eligible on
//     promotion. The copy claims nothing about that window.
// If either behaviour changes, this text is part of the change.

import { Trans } from "@lingui/react/macro";
import { useGitHubAuth } from "../hooks/useGitHubAuth.ts";
import { useGoogleAuth } from "../hooks/useGoogleAuth.ts";
import { navigateTo } from "../lib/navigate.ts";
import { markVisited } from "../lib/firstVisit.ts";
import { consumePendingWelcomeLocation, jumpToLocation } from "../lib/jumpToLocation.ts";
import { useViewStateStore } from "../stores/viewStateStore.ts";
import { useStepWalkStore } from "../stores/stepWalkStore.ts";
import { discardActiveDraft } from "../lib/draftPersistence.ts";
import { useSurveySessionStore } from "../stores/surveySessionStore.ts";
import { useWorkingCopyStore } from "../stores/workingCopyStore.ts";
import {
  BG_PAGE,
  BG_CARD,
  BORDER,
  ACCENT,
  TEXT_DIM,
  TEXT_MAIN,
  FONT,
} from "../lib/galleryTheme.ts";
import { GitHubMark, GoogleMark } from "./ProviderMarks.tsx";

const providerButtonBase: React.CSSProperties = {
  display: "inline-flex",
  alignItems: "center",
  justifyContent: "center",
  gap: 8,
  padding: "12px 24px",
  borderRadius: 6,
  fontSize: 14,
  fontWeight: 600,
  cursor: "pointer",
  fontFamily: FONT,
};

// Shared body-copy style for both columns' prose (intro, the three points, the
// sign-in rationale, the guest hint). Left-aligned throughout: these are
// sentences, not labels, and centered multi-line prose is harder to read.
const bodyTextStyle: React.CSSProperties = {
  margin: 0,
  fontSize: 13,
  lineHeight: 1.6,
  color: TEXT_DIM,
  fontFamily: FONT,
  textAlign: "left",
};

// Two-column layout: the explanation on the left, the sign-in decision in a
// card on the right. Everything used to live in one 480px centered card, which
// overflowed the viewport vertically once the copy explained anything — the
// heading scrolled out of view while the page had empty space on both sides.
//
// `flexWrap: "wrap"` is the whole responsive story, deliberately: inline styles
// cannot express a media query, and the wrap threshold falls out of the two
// flex-bases below (the columns stack as soon as ~820px + gap no longer fits).
// So a narrow viewport gets the original single-column reading order — prose,
// then card — with no breakpoint to keep in sync.
const layoutStyle: React.CSSProperties = {
  width: "100%",
  maxWidth: 1040,
  display: "flex",
  flexWrap: "wrap",
  gap: 40,
  alignItems: "center",
  justifyContent: "center",
  // Safe vertical centering, paired with the parent's `alignItems: flex-start`
  // (see there for why centering the parent directly is unsafe): auto margins
  // absorb free space when the content fits, and resolve to 0 when it does not,
  // so a tall page top-aligns and scrolls instead of hiding its heading.
  marginTop: "auto",
  marginBottom: "auto",
};

const proseColumnStyle: React.CSSProperties = {
  flex: "1 1 420px",
  minWidth: 280,
  maxWidth: 560,
  display: "flex",
  flexDirection: "column",
  gap: 16,
  textAlign: "left",
};

const actionCardStyle: React.CSSProperties = {
  flex: "0 1 400px",
  minWidth: 280,
  background: BG_CARD,
  border: `1px solid ${BORDER}`,
  borderRadius: 12,
  padding: "28px 32px",
  display: "flex",
  flexDirection: "column",
  gap: 18,
};

const githubButtonStyle: React.CSSProperties = {
  ...providerButtonBase,
  background: "#238636", // GitHub brand green
  color: "var(--app-text-on-accent)",
  border: "1px solid #2ea043", // GitHub brand green (border)
};

const googleButtonStyle: React.CSSProperties = {
  ...providerButtonBase,
  background: "#1a73e8", // Google brand blue
  color: "var(--app-text-on-accent)",
  border: "1px solid #1a73e8", // Google brand blue (border)
};

export function WelcomeScreen() {
  const { connect: ghConnect, error: ghError } = useGitHubAuth();
  const { connect: googleConnect, error: googleError } = useGoogleAuth();

  // Any of the three actions below leaves the welcome screen: sign in (which
  // redirects out to a provider and back to the app root) or "Continue as
  // guest". Mark the browser as visited synchronously first, so the first-visit
  // gate does not bounce the author back here on the OAuth return or a later
  // reload.
  //
  // Spec 057 FR-015 (D-9): a first-time visitor who followed a shared deep
  // link had their requested location rewritten away by the gate. The gate now
  // holds it (setPendingWelcomeLocation, StudioShell's hashToRoute); here it is
  // consumed through `jumpToLocation`, so the SAME reachability rules apply as
  // to any other jump — a link naming a step of a project this visitor does not
  // have degrades to the tab rather than landing them somewhere impossible.
  // With no held location, `go()` runs and the default landing is unchanged.
  const leaveWelcome = (go: () => void) => {
    markVisited();
    const requested = consumePendingWelcomeLocation();
    if (requested !== null) {
      jumpToLocation(requested);
      return;
    }
    go();
  };

  return (
    <div
      style={{
        background: BG_PAGE,
        height: "100%",
        boxSizing: "border-box",
        fontFamily: FONT,
        color: TEXT_MAIN,
        padding: "32px",
        overflowY: "auto",
        display: "flex",
        // `flex-start` rather than `center`: when the content IS taller than the
        // viewport (a long translation, a small window), centering pushes the
        // top of the first column above the scroll origin, so the heading
        // becomes unreachable — scrolling up cannot reveal overflow that a
        // centered flex item put outside the container's start edge. This is the
        // same overflow that motivated the two columns; the alignment is the
        // half of the fix that survives content growth.
        alignItems: "flex-start",
        justifyContent: "center",
      }}
    >
      <div style={layoutStyle}>
        {/* Left column: what Studio is. Prose only — no card chrome, so the
            explanation reads as page content and the card on the right stays
            the one thing asking for a decision. */}
        <div style={proseColumnStyle}>
          <h1
            style={{
              margin: 0,
              fontSize: "1.5rem",
              fontWeight: 600,
              color: ACCENT,
              fontFamily: FONT,
            }}
          >
            <Trans id="welcome.title">Welcome to Keyboard Studio</Trans>
          </h1>

          <p
            style={{
              margin: 0,
              fontSize: 15,
              lineHeight: 1.6,
              color: TEXT_DIM,
              fontFamily: FONT,
            }}
          >
            <Trans id="welcome.tagline">
              Build a working Keyman keyboard for your language, in your browser. No .kmn code, no
              toolchain to install.
            </Trans>
          </p>

          <p style={bodyTextStyle}>
            <Trans id="welcome.intro">
              Every language deserves a keyboard its speakers can actually type on. You know your
              language&rsquo;s sounds, spelling, and characters &mdash; Studio handles the rest.
              Answer questions in plain language, confirm the layouts we propose, and leave with a
              finished, validated keyboard package.
            </Trans>
          </p>

          <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
            <p style={bodyTextStyle}>
              <Trans id="welcome.point.describe">
                <strong style={{ color: TEXT_MAIN }}>Describe your writing system.</strong> Which
                characters you need, and how they behave &mdash; tone marks, diacritics, clusters,
                alternate forms.
              </Trans>
            </p>

            <p style={bodyTextStyle}>
              <Trans id="welcome.point.confirm">
                <strong style={{ color: TEXT_MAIN }}>Confirm what we propose.</strong> Studio picks
                a proven approach and a close-matching existing keyboard as a starting point, then
                shows you real keys to try. Change anything you don&rsquo;t like.
              </Trans>
            </p>

            <p style={bodyTextStyle}>
              <Trans id="welcome.point.ship">
                <strong style={{ color: TEXT_MAIN }}>Ship it.</strong> Every edit is compiled and
                checked as you go. Download a package, or submit it to the Keyman keyboards
                repository as a pull request.
              </Trans>
            </p>
          </div>
        </div>

        {/* Right column: the decision. Everything that asks something of the
            author — why sign in, the three buttons, what guest mode costs. */}
        <div style={actionCardStyle}>
          <p style={bodyTextStyle}>
            <Trans id="welcome.whySignIn">
              <strong style={{ color: TEXT_MAIN }}>Sign in to keep your work.</strong> A keyboard
              takes more than one sitting. Signing in saves yours to your account, so you can close
              the tab, switch computers, and pick up where you left off &mdash; and it&rsquo;s how
              you submit a finished keyboard to the Keyman repository.
            </Trans>
          </p>

          <div
            style={{
              display: "flex",
              flexDirection: "column",
              gap: 12,
            }}
          >
            <button
              type="button"
              onClick={() => {
                leaveWelcome(() => void ghConnect());
              }}
              style={githubButtonStyle}
            >
              <GitHubMark />
              <Trans id="welcome.signIn.github">Sign in with GitHub</Trans>
            </button>

            <button
              type="button"
              onClick={() => {
                leaveWelcome(() => void googleConnect());
              }}
              style={googleButtonStyle}
            >
              <GoogleMark />
              <Trans id="welcome.signIn.google">Sign in with Google</Trans>
            </button>

            <button
              type="button"
              onClick={() => {
                // T024 (spec 034 US3, research D5, G-3): "Continue as guest" is
                // the WelcomeScreen's fresh-start entry point (it was labelled
                // "I'm new", which read as a question about the AUTHOR rather than
                // about signing in — a first-time visitor who wanted an account
                // still picked it, precisely because they were new).
                //
                // A durable draft may already have been restored at boot
                // (main.tsx's pre-mount loadDraft) before the author ever saw this
                // screen — honoring a fresh start means clearing that draft (and
                // the active-project pointer) and resetting both stores, not
                // silently keeping the restored state around for a later boot to
                // re-surface.
                discardActiveDraft();
                useSurveySessionStore.getState().reset();
                useWorkingCopyStore.getState().reset();
                // Spec 057 FR-052: view state clears with the session. This and
                // StudioShell's handleStartOver are the only two places a reset
                // belongs — the same two the survey-session reset above lives in.
                useViewStateStore.getState().reset();
                // Within-step positions belong to the abandoned walk — see the
                // same call in StudioShell's handleStartOver.
                useStepWalkStore.getState().reset();
                leaveWelcome(() => navigateTo("survey"));
              }}
              style={{
                ...providerButtonBase,
                background: "transparent",
                border: `1px solid ${BORDER}`,
                color: TEXT_MAIN,
              }}
            >
              <Trans id="welcome.guest">Continue as guest</Trans>
            </button>

            <p style={{ ...bodyTextStyle, fontSize: 12 }}>
              <Trans id="welcome.guest.hint">
                Your work is saved in this browser only. Clearing your browsing data, or moving to
                another computer, loses it. You can sign in at any time and we&rsquo;ll bring your
                work with you.
              </Trans>
            </p>
          </div>

          {(ghError !== null || googleError !== null) && (
            <p
              role="alert"
              style={{
                margin: 0,
                fontSize: 13,
                lineHeight: 1.5,
                color: "var(--app-danger-text)",
                fontFamily: FONT,
              }}
            >
              {ghError ?? googleError}
            </p>
          )}
        </div>
      </div>
    </div>
  );
}

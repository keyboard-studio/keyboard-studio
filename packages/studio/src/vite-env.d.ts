/// <reference types="vite/client" />

declare module "*.yaml?raw" {
  const src: string;
  export default src;
}

/**
 * Build identity injected by the Vite `define` in vite.config.ts (spec 060,
 * FR-110/FR-111). The deployed value is `VERCEL_GIT_COMMIT_SHA`; a local build
 * gets the literal `"dev"`. Substituted at compile time, so it is readable from
 * a pre-mount crash path before any module has run (FR-114).
 */
declare const __KS_COMMIT_SHA__: string;

// Studio build-time environment (Vite `import.meta.env`). Declaring this
// interface augments Vite's ImportMetaEnv so reads are typed.
interface ImportMetaEnv {
  /**
   * GitHub App client id (public; ships in the browser bundle).
   * Used for the default identity / sign-in flow (no scope).
   */
  readonly VITE_GITHUB_CLIENT_ID: string;
  /**
   * OAuth App client id (public; ships in the browser bundle).
   * Used ONLY for the Option A "fork & submit yourself" opt-in (`public_repo`).
   */
  readonly VITE_GITHUB_OAUTH_CLIENT_ID: string;
  /**
   * Base URL of the OAuth backend (issue #63) that holds the client secret and
   * performs the code→token exchange. Default "" = same-origin, so requests
   * hit `/oauth/exchange` on the page's own host.
   */
  readonly VITE_OAUTH_BACKEND_URL: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}

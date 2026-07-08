// POST /api/oauth/google/exchange — exchange a Google authorization code for
// identity claims (sub, email, email_verified, name, picture). Reachable at
// /oauth/google/exchange via the vercel.json rewrite (same origin as the SPA,
// so VITE_OAUTH_BACKEND_URL stays empty).
//
// Google is identity-only: no Google token is ever returned to the SPA. The
// exchange + id_token decode + cheap claim validation live in the shared core
// (utilities/oauth-backend/src/google-handlers.ts); only the HTTP glue is here.
//
// Opt-in: a GitHub-only deployment leaves GOOGLE_CLIENT_ID/GOOGLE_CLIENT_SECRET
// unset, and this endpoint returns 503 google_oauth_not_configured rather than
// 500 — see runGoogleHandler / googleEnvConfig in _shared.ts.
import { runGoogleHandler } from "../_shared.js";

// Web-standard `{ fetch }` default export — see the note in health.ts for why a
// bare `export default function (req, res)` would hang on Vercel's Node runtime.
export default {
  fetch(req: Request): Promise<Response> {
    return runGoogleHandler(req);
  },
};

// POST /api/oauth/refresh — refresh an expiring token (GitHub Apps with token
// expiration enabled). Reachable at /oauth/refresh via the vercel.json rewrite.
import { runTokenHandler, refreshCore, RefreshBodySchema } from "./_shared.js";

// Web-standard `{ fetch }` default export — see the note in health.ts for why a
// bare `export default function (req, res)` would hang on Vercel's Node runtime.
export default {
  fetch(req: Request): Promise<Response> {
    return runTokenHandler(req, RefreshBodySchema, refreshCore);
  },
};

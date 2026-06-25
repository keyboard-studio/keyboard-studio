// POST /api/oauth/refresh — refresh an expiring token (GitHub Apps with token
// expiration enabled). Reachable at /oauth/refresh via the vercel.json rewrite.
import { runTokenHandler, refreshCore, RefreshBodySchema } from "./_shared.js";

export default function handler(req: Request): Promise<Response> {
  return runTokenHandler(req, RefreshBodySchema, refreshCore);
}

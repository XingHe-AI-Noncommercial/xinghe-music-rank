import { json, rateLimitFailed, enforceRateLimit } from '../../_lib.js';

export async function onRequestPost(context) {
  const rl = await enforceRateLimit(context.env, context.request);
  if (!rl.ok) return rateLimitFailed(rl, rl.limit);
  return json({ ok: true }, 200, { 'set-cookie': 'xh_admin=; Path=/; HttpOnly; Secure; SameSite=Strict; Max-Age=0' });
}

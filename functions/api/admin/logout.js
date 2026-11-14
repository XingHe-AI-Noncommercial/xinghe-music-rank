import { json, rateLimitFailed, enforceRateLimit } from '../../_lib.js';

export async function onRequestPost(context) {
  const rl = await enforceRateLimit(context.env, context.request);
  if (!rl.ok) return rateLimitFailed(rl, rl.limit);
  const secure = new URL(context.request.url).protocol === 'https:';
  const clear = `xh_admin=; Path=/; HttpOnly; SameSite=Lax; Max-Age=0${secure ? '; Secure' : ''}`;
  return json({ ok: true }, 200, { 'set-cookie': clear });
}

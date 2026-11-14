import { enforceRateLimit, fail, json, makeAdminCookie, rateLimitFailed, readBody } from '../../_lib.js';

export async function onRequestPost(context) {
  const { ADMIN_PASSWORD, ADMIN_SESSION_SECRET } = context.env;
  if (!ADMIN_PASSWORD || !ADMIN_SESSION_SECRET) {
    return fail('后台密钥尚未配置。请在 Cloudflare Pages 项目的设置中添加 ADMIN_PASSWORD 和 ADMIN_SESSION_SECRET 两个 Secret。', 503);
  }

  const rl = await enforceRateLimit(context.env, context.request);
  if (!rl.ok) return rateLimitFailed(rl, rl.limit);

  const body = await readBody(context.request);
  const supplied = String(body?.password || '');
  const expected = String(ADMIN_PASSWORD);
  let diff = supplied.length ^ expected.length;
  const length = Math.max(supplied.length, expected.length);
  for (let i = 0; i < length; i++) diff |= (supplied.charCodeAt(i) || 0) ^ (expected.charCodeAt(i) || 0);
  if (diff !== 0) return fail('后台密码不正确。', 401);

  try {
    const secure = new URL(context.request.url).protocol === 'https:';
    const { value, cookie } = await makeAdminCookie(context.env, { secure });
    return json({ ok: true, adminName: '开发者', token: value }, 200, { 'set-cookie': cookie });
  } catch (error) {
    return fail(error.message || '无法建立后台会话。', 500);
  }
}

// ============================================================================
// DELETE /api/admin/bans/:ip
// 解除某个 IP 的封禁。
// ============================================================================
import { enforceRateLimit, fail, isAdmin, json, rateLimitFailed, removeBan } from '../../../_lib.js';

export async function onRequestDelete(context) {
  if (!(await isAdmin(context.request, context.env))) return fail('请先登录后台。', 401);
  const rl = await enforceRateLimit(context.env, context.request);
  if (!rl.ok) return rateLimitFailed(rl, rl.limit);
  const DB = context.env.DB;
  if (!DB) return fail('数据库尚未连接。', 503);
  try {
    const ip = decodeURIComponent(context.params.ip || '');
    const removed = await removeBan(DB, ip);
    if (!removed) return fail('该 IP 未被封禁，或已解除。', 404);
    return json({ ok: true, message: `已解除 ${ip} 的封禁。` });
  } catch (error) {
    return fail(error?.message || '解封失败。', 500);
  }
}

// ============================================================================
// DELETE /api/admin/announcements/:id
// 管理员删除一条公告。
// ============================================================================
import { enforceRateLimit, fail, isAdmin, json, rateLimitFailed, removeAnnouncement } from '../../../_lib.js';

export async function onRequestDelete(context) {
  if (!(await isAdmin(context.request, context.env))) return fail('请先登录后台。', 401);

  const rl = await enforceRateLimit(context.env, context.request);
  if (!rl.ok) return rateLimitFailed(rl, rl.limit);

  const DB = context.env.DB;
  if (!DB) return fail('数据库尚未连接。', 503);

  try {
    const removed = await removeAnnouncement(DB, context.params.id);
    if (!removed) return fail('该公告不存在，或已被删除。', 404);
    return json({ ok: true, message: '公告已删除。' });
  } catch (error) {
    return fail(error?.message || '删除公告失败。', 500);
  }
}

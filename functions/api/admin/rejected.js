// ============================================================================
// DELETE /api/admin/rejected
// 开发者一键清除全部“已拒绝”投稿（已拒绝不显示、不复制、不占额度）。
// 需开发者登录，同样限流。
// ============================================================================
import { enforceRateLimit, fail, isAdmin, json, rateLimitFailed } from '../../_lib.js';

export async function onRequestDelete(context) {
  if (!(await isAdmin(context.request, context.env))) return fail('请先登录后台。', 401);

  const rl = await enforceRateLimit(context.env, context.request);
  if (!rl.ok) return rateLimitFailed(rl, rl.limit);

  const DB = context.env.DB;
  if (!DB) return fail('数据库尚未连接。', 503);

  try {
    const res = await DB.prepare("DELETE FROM songs WHERE status = 'rejected'").run();
    return json({ ok: true, cleared: res?.meta?.changes || 0, message: '已清除全部已拒绝投稿。' });
  } catch (error) {
    return fail(error?.message || '清除失败。', 500);
  }
}

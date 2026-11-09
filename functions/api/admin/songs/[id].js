// ============================================================================
// DELETE /api/admin/songs/:id
// 删除一首收藏歌曲。需管理员登录，同样限流。
// ============================================================================
import { enforceRateLimit, fail, isAdmin, json, rateLimitFailed } from '../../../_lib.js';

export async function onRequestDelete(context) {
  if (!(await isAdmin(context.request, context.env))) return fail('请先登录后台。', 401);

  const rl = await enforceRateLimit(context.env, context.request);
  if (!rl.ok) return rateLimitFailed(rl, rl.limit);

  const DB = context.env.DB;
  if (!DB) return fail('数据库尚未连接。', 503);

  const id = context.params.id;
  try {
    const result = await DB.prepare('DELETE FROM songs WHERE id = ?').bind(id).run();
    if (!result.meta?.changes) return fail('歌曲不存在。', 404);
    return json({ ok: true, message: '已删除该歌曲。' });
  } catch (error) {
    return fail(error?.message || '删除失败。', 500);
  }
}

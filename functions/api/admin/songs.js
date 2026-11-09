// ============================================================================
// POST /api/admin/songs
// 后台单条添加歌曲（免审核，直接入库）。需管理员登录，同样限流。
// ============================================================================
import { enforceRateLimit, fail, insertSong, isAdmin, json, rateLimitFailed, readBody } from '../../_lib.js';

export async function onRequestPost(context) {
  if (!(await isAdmin(context.request, context.env))) return fail('请先登录后台。', 401);

  const rl = await enforceRateLimit(context.env, context.request);
  if (!rl.ok) return rateLimitFailed(rl, rl.limit);

  const DB = context.env.DB;
  if (!DB) return fail('数据库尚未连接。', 503);

  const body = await readBody(context.request);
  if (!body) return fail('请求内容不能为空。', 400);

  try {
    const result = await insertSong(DB, body, 'approved');
    if (!result.ok) return fail(result.error, 400);
    return json({ ok: true, message: '已直接通过并加入收藏列表。', id: result.id });
  } catch (error) {
    return fail(error?.message || '添加失败。', 500);
  }
}

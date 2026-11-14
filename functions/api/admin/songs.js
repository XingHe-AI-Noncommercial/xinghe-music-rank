// ============================================================================
// POST /api/admin/songs
// 开发者快速上架（不限次数，直接 approved，即开发者已同意审核）。
// 需开发者登录，同样限流。
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
    return json({ ok: true, message: '已由开发者上架（不限次数），本周榜单已更新并计入一键复制。', id: result.id });
  } catch (error) {
    return fail(error?.message || '添加失败。', 500);
  }
}

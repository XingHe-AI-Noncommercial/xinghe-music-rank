// ============================================================================
// POST /api/admin/maintenance  { on: boolean }
// 开发者一键切换“网站维护中”。维护开启后公众看到维护页、停止投稿；
// 开发者仍可进入后台关闭。需开发者登录，同样限流。
// ============================================================================
import { enforceRateLimit, fail, isAdmin, json, rateLimitFailed, readBody, setSetting } from '../../_lib.js';

export async function onRequestPost(context) {
  if (!(await isAdmin(context.request, context.env))) return fail('请先登录后台。', 401);

  const rl = await enforceRateLimit(context.env, context.request);
  if (!rl.ok) return rateLimitFailed(rl, rl.limit);

  const DB = context.env.DB;
  if (!DB) return fail('数据库尚未连接。', 503);

  const body = await readBody(context.request);
  const on = Boolean(body?.on);
  try {
    await setSetting(DB, 'maintenance', on ? '1' : '0');
    return json({ ok: true, maintenance: on, message: on ? '网站维护已开启。' : '网站维护已关闭，站点恢复访问。' });
  } catch (error) {
    return fail(error?.message || '切换维护状态失败。', 500);
  }
}

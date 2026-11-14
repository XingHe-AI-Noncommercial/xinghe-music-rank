// ============================================================================
// POST /api/admin/announcements   { text }
// 管理员发布公告（存 settings 表 JSON，新公告排最前）。
// ============================================================================
import { addAnnouncement, enforceRateLimit, fail, isAdmin, json, rateLimitFailed, readBody } from '../../_lib.js';

export async function onRequestPost(context) {
  if (!(await isAdmin(context.request, context.env))) return fail('请先登录后台。', 401);

  const rl = await enforceRateLimit(context.env, context.request);
  if (!rl.ok) return rateLimitFailed(rl, rl.limit);

  const DB = context.env.DB;
  if (!DB) return fail('数据库尚未连接。', 503);

  const body = await readBody(context.request);
  const text = String(body?.text || '').trim();
  if (!text) return fail('公告内容不能为空。', 400);
  if (text.length > 500) return fail('公告内容太长（最多 500 字）。', 400);

  try {
    const item = await addAnnouncement(DB, text);
    return json({ ok: true, message: '公告已发布。', announcement: item });
  } catch (error) {
    return fail(error?.message || '发布公告失败。', 500);
  }
}

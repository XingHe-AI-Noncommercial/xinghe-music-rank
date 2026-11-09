// ============================================================================
// POST /api/admin/submissions/:id   { action: 'approve' | 'reject' }
// 审核一首待审核歌曲。需管理员登录，同样限流。
// ============================================================================
import { enforceRateLimit, fail, isAdmin, isoNow, json, rateLimitFailed, readBody } from '../../../_lib.js';

export async function onRequestPost(context) {
  if (!(await isAdmin(context.request, context.env))) return fail('请先登录后台。', 401);

  const rl = await enforceRateLimit(context.env, context.request);
  if (!rl.ok) return rateLimitFailed(rl, rl.limit);

  const DB = context.env.DB;
  if (!DB) return fail('数据库尚未连接。', 503);

  const id = context.params.id;
  const body = await readBody(context.request);
  const action = String(body?.action || '');
  if (!['approve', 'reject'].includes(action)) return fail('操作类型不正确。', 400);

  try {
    const song = await DB.prepare("SELECT id, title FROM songs WHERE id = ? AND status = 'pending'").bind(id).first();
    if (!song) return fail('该投稿不存在，或已被处理。', 404);

    const now = isoNow();
    if (action === 'reject') {
      await DB.prepare("UPDATE songs SET status = 'rejected', reviewed_at = ?, reviewed_by = '星河' WHERE id = ? AND status = 'pending'").bind(now, id).run();
      return json({ ok: true, message: `已拒绝「${song.title}」。` });
    }

    await DB.prepare("UPDATE songs SET status = 'approved', reviewed_at = ?, reviewed_by = '星河' WHERE id = ? AND status = 'pending'").bind(now, id).run();
    return json({ ok: true, message: `已通过「${song.title}」，现在可以投票了。` });
  } catch (error) {
    return fail(error?.message || '审核失败。', 500);
  }
}

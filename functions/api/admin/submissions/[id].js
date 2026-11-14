// ============================================================================
// POST /api/admin/submissions/:id   { action: 'approve' | 'reject', reason? }
// 开发者审核一首待审核投稿：通过后上架（计入一键复制），拒绝可填写理由，
// 理由会发送到投稿人（该投稿 IP）的收件箱。需开发者登录，同样限流。
// ============================================================================
import { addInboxMessage, enforceRateLimit, fail, getClientIp, isAdmin, isoNow, json, rateLimitFailed, readBody } from '../../../_lib.js';

export async function onRequestPost(context) {
  if (!(await isAdmin(context.request, context.env))) return fail('请先登录后台。', 401);

  const rl = await enforceRateLimit(context.env, context.request);
  if (!rl.ok) return rateLimitFailed(rl, rl.limit);

  const DB = context.env.DB;
  if (!DB) return fail('数据库尚未连接。', 503);

  const id = context.params.id;
  const body = await readBody(context.request);
  const action = String(body?.action || '');
  const reason = String(body?.reason || '').trim();
  if (!['approve', 'reject'].includes(action)) return fail('操作类型不正确。', 400);

  try {
    const song = await DB.prepare("SELECT id, title, submitter_ip FROM songs WHERE id = ? AND status = 'pending'").bind(id).first();
    if (!song) return fail('该投稿不存在，或已被处理。', 404);

    const now = isoNow();
    if (action === 'reject') {
      await DB.prepare("UPDATE songs SET status = 'rejected', reviewed_at = ?, reviewed_by = '开发者' WHERE id = ? AND status = 'pending'").bind(now, id).run();
      // 发送拒绝理由到投稿人收件箱（用投稿时的 IP；没有则用当前请求 IP）
      await addInboxMessage(DB, song.submitter_ip || getClientIp(context.request), '投稿被拒绝',
        `你的投稿《${song.title}》未通过审核。${reason ? '理由：' + reason : '（管理员未填写具体理由，如有疑问请联系管理员）'}`);
      return json({ ok: true, message: `已拒绝「${song.title}」${reason ? '，拒绝理由已发到投稿人收件箱。' : '，未填写理由。'}` });
    }

    await DB.prepare("UPDATE songs SET status = 'approved', reviewed_at = ?, reviewed_by = '开发者' WHERE id = ? AND status = 'pending'").bind(now, id).run();
    return json({ ok: true, message: `已通过「${song.title}」，已上架本周榜单并计入一键复制。` });
  } catch (error) {
    return fail(error?.message || '审核失败。', 500);
  }
}

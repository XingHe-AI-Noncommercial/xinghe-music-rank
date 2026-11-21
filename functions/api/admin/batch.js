// ============================================================================
// POST /api/admin/batch   { action: 'approve' | 'reject', ids: [..], reason? }
// 开发者批量审核：一次通过 / 拒绝多条待审核投稿。拒绝理由会发到投稿人收件箱。
// ============================================================================
import { addInboxMessage, enforceRateLimit, fail, getClientIp, isAdmin, isoNow, json, rateLimitFailed, readBody } from '../../_lib.js';

export async function onRequestPost(context) {
  if (!(await isAdmin(context.request, context.env))) return fail('请先登录开发者模式。', 401);

  const rl = await enforceRateLimit(context.env, context.request);
  if (!rl.ok) return rateLimitFailed(rl, rl.limit);

  const DB = context.env.DB;
  if (!DB) return fail('数据库尚未连接。', 503);

  const body = await readBody(context.request);
  const action = String(body?.action || '');
  const ids = Array.isArray(body?.ids) ? body.ids.map(String).filter(Boolean) : [];
  const reason = String(body?.reason || '').trim();
  if (!['approve', 'reject'].includes(action)) return fail('操作类型不正确。', 400);
  if (!ids.length) return fail('请至少选择一条投稿。', 400);

  try {
    const now = isoNow();
    const placeholders = ids.map(() => '?').join(',');
    const rows = await DB.prepare(`SELECT id, title, submitter_ip FROM songs WHERE id IN (${placeholders}) AND status = 'pending'`).bind(...ids).all();
    const items = rows.results || [];
    let done = 0;
    for (const song of items) {
      if (action === 'approve') {
        await DB.prepare("UPDATE songs SET status = 'approved', reviewed_at = ?, reviewed_by = '开发者' WHERE id = ? AND status = 'pending'").bind(now, song.id).run();
      } else {
        await DB.prepare("UPDATE songs SET status = 'rejected', reviewed_at = ?, reviewed_by = '开发者' WHERE id = ? AND status = 'pending'").bind(now, song.id).run();
        await addInboxMessage(DB, song.submitter_ip || getClientIp(context.request), '投稿被拒绝',
          `你的投稿《${song.title}》未通过审核。${reason ? '理由：' + reason : '（管理员未填写具体理由，如有疑问请联系管理员）'}`);
      }
      done += 1;
    }
    const label = action === 'approve' ? '通过' : '拒绝';
    return json({ ok: true, message: `已批量${label} ${done} 条投稿。`, done });
  } catch (error) {
    return fail(error?.message || '批量审核失败。', 500);
  }
}

// ============================================================================
// DELETE /api/admin/songs/:id
// 删除一首歌曲，并发送通知到投稿人收件箱。需管理员登录，同样限流。
// ============================================================================
import { addInboxMessage, enforceRateLimit, fail, isAdmin, json, rateLimitFailed } from '../../../_lib.js';

export async function onRequestDelete(context) {
  if (!(await isAdmin(context.request, context.env))) return fail('请先登录后台。', 401);

  const rl = await enforceRateLimit(context.env, context.request);
  if (!rl.ok) return rateLimitFailed(rl, rl.limit);

  const DB = context.env.DB;
  if (!DB) return fail('数据库尚未连接。', 503);

  const id = context.params.id;
  try {
    const song = await DB.prepare('SELECT id, title, submitter_ip FROM songs WHERE id = ?').bind(id).first();
    if (!song) return fail('歌曲不存在。', 404);
    await DB.prepare('DELETE FROM songs WHERE id = ?').bind(id).run();
    // 通知投稿人（按投稿时记录的 IP）
    await addInboxMessage(DB, song.submitter_ip, '投稿已删除',
      `你的投稿《${song.title}》已被管理员删除，不再显示在本周榜单。`);
    return json({ ok: true, message: '已删除该歌曲，并已通知投稿人。' });
  } catch (error) {
    return fail(error?.message || '删除失败。', 500);
  }
}

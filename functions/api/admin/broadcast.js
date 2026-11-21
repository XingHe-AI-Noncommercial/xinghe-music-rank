// ============================================================================
// POST /api/admin/broadcast   { text }
// 开发者站内广播：把一条消息发送到所有曾投稿 IP 的收件箱。
// ============================================================================
import { addInboxMessage, enforceRateLimit, fail, getClientIp, isAdmin, json, rateLimitFailed, readBody } from '../../_lib.js';

export async function onRequestPost(context) {
  if (!(await isAdmin(context.request, context.env))) return fail('请先登录开发者模式。', 401);

  const rl = await enforceRateLimit(context.env, context.request);
  if (!rl.ok) return rateLimitFailed(rl, rl.limit);

  const DB = context.env.DB;
  if (!DB) return fail('数据库尚未连接。', 503);

  const body = await readBody(context.request);
  const text = String(body?.text || '').trim();
  if (!text) return fail('广播内容不能为空。', 400);
  if (text.length > 500) return fail('广播内容太长（最多 500 字）。', 400);

  try {
    const rows = await DB.prepare("SELECT DISTINCT submitter_ip FROM songs WHERE submitter_ip IS NOT NULL AND submitter_ip != ''").all();
    const ips = (rows.results || []).map(r => r.submitter_ip).filter(Boolean);
    let sent = 0;
    for (const ip of ips) {
      await addInboxMessage(DB, ip, '📢 站内广播', text);
      sent += 1;
    }
    return json({ ok: true, message: `已广播给 ${sent} 位投稿人。`, sent });
  } catch (error) {
    return fail(error?.message || '广播失败。', 500);
  }
}

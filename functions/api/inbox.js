// ============================================================================
// GET /api/inbox
// 当前访客（按公网 IP）的收件箱消息：投稿审核结果等。同样限流。
// ============================================================================
import { enforceRateLimit, fail, getClientIp, getInbox, json, rateLimitFailed } from '../_lib.js';

export async function onRequestGet(context) {
  const DB = context.env.DB;
  if (!DB) return fail('数据库尚未连接。', 503);
  const rl = await enforceRateLimit(context.env, context.request);
  if (!rl.ok) return rateLimitFailed(rl, rl.limit);
  try {
    const ip = getClientIp(context.request);
    const msgs = await getInbox(DB, ip);
    return json({
      ok: true,
      messages: msgs.map(m => ({ id: m.id, title: m.title, body: m.body, createdAt: m.createdAt, read: Boolean(m.read) })),
    });
  } catch (error) {
    return fail(error?.message || '读取收件箱失败。', 500);
  }
}

// ============================================================================
// POST /api/inbox/read   { id: '<消息id>' | '*' }
// 标记单条或全部收件箱消息为已读。
// ============================================================================
import { enforceRateLimit, fail, getClientIp, getInbox, json, markInboxRead, rateLimitFailed, readBody, setInbox } from '../../_lib.js';

export async function onRequestPost(context) {
  const DB = context.env.DB;
  if (!DB) return fail('数据库尚未连接。', 503);
  const rl = await enforceRateLimit(context.env, context.request);
  if (!rl.ok) return rateLimitFailed(rl, rl.limit);
  try {
    const ip = getClientIp(context.request);
    const body = await readBody(context.request);
    const id = String(body?.id || '');
    if (id === '*') {
      const list = await getInbox(DB, ip);
      list.forEach(m => { m.read = true; });
      await setInbox(DB, ip, list);
      return json({ ok: true, message: '已全部标记为已读。' });
    }
    if (!id) return fail('缺少消息 id。', 400);
    const done = await markInboxRead(DB, ip, id);
    if (!done) return fail('该消息不存在。', 404);
    return json({ ok: true, message: '已标记为已读。' });
  } catch (error) {
    return fail(error?.message || '操作失败。', 500);
  }
}

// ============================================================================
// POST /api/visit
// 公开：统计一次访问（前端每会话一次，限流）。返回 { ok, total, today }。
// ============================================================================
import { enforceRateLimit, fail, incrementVisit, json, rateLimitFailed } from '../_lib.js';

export async function onRequestPost(context) {
  const rl = await enforceRateLimit(context.env, context.request);
  if (!rl.ok) return rateLimitFailed(rl, rl.limit);

  const DB = context.env.DB;
  if (!DB) return fail('数据库尚未连接。', 503);

  try {
    const stats = await incrementVisit(DB);
    return json({ ok: true, total: stats.total, today: stats.today });
  } catch (error) {
    return fail(error?.message || '访问统计失败。', 500);
  }
}

// ============================================================================
// POST /api/submit
// 提交歌曲【待审核】。BV 号 / 链接 / 封面均来自 VocaDB 自动提取，无需手动填写。
// 强制 10 秒 / 10 次 IP 限流。
// ============================================================================
import { enforceRateLimit, fail, insertSong, json, rateLimitFailed, readBody } from '../_lib.js';

export async function onRequestPost(context) {
  const { DB } = context.env;
  if (!DB) return fail('数据库尚未连接：请配置 D1 绑定 DB。', 503);

  const rl = await enforceRateLimit(context.env, context.request);
  if (!rl.ok) return rateLimitFailed(rl, rl.limit);

  const body = await readBody(context.request);
  if (!body) return fail('请求内容不能为空。', 400);

  try {
    const result = await insertSong(DB, body, 'pending');
    if (!result.ok) return fail(result.error, 400);
    return json({ ok: true, message: '已提交，等待管理员审核；通过后才会进入收藏列表。', id: result.id });
  } catch (error) {
    return fail(error?.message || '提交失败，请稍后重试。', 500);
  }
}

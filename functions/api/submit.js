// ============================================================================
// POST /api/submit   { bvid, artist, title }
// 精简版：普通访客每天每 IP 最多投稿 1 个 → 进入待审核（pending）。
// 被拒绝（rejected）不占用当日额度，可重新提交；BV 号 / 链接 / 视频名手动填写。
// 强制 10 秒 / 10 次 IP 限流。
// ============================================================================
import { beijingDay, enforceRateLimit, ensureWeek, fail, getClientIp, insertSong, json, rateLimitFailed, readBody } from '../_lib.js';

export async function onRequestPost(context) {
  const { DB } = context.env;
  if (!DB) return fail('数据库尚未连接：请配置 D1 绑定 DB。', 503);

  const rl = await enforceRateLimit(context.env, context.request);
  if (!rl.ok) return rateLimitFailed(rl, rl.limit);

  const body = await readBody(context.request);
  const { bvid, artist, title } = body || {};

  try {
    await ensureWeek(DB); // 周一清空（幂等）

    const ip = getClientIp(context.request);
    const day = beijingDay();

    // 每天每 IP 最多 1 个（pending / approved 占用额度）
    const existing = await DB.prepare(
      "SELECT id, status FROM songs WHERE submitter_ip = ? AND day = ? AND status IN ('pending','approved') LIMIT 1"
    ).bind(ip, day).first();
    if (existing) {
      return fail('今天已经投稿过 1 个作品了（同一 IP 每天限 1 个）。被拒绝后可重新提交，或明天（北京时间 0 点）再来。', 409);
    }

    const result = await insertSong(DB, { bvid, artist, title }, 'pending', { submitterIp: ip, day });
    if (!result.ok) return fail(result.error, 400);

    return json({ ok: true, message: '已提交，等待开发者审核；审核通过后才会显示在本周榜单并计入一键复制。' });
  } catch (error) {
    return fail(error?.message || '提交失败，请稍后重试。', 500);
  }
}

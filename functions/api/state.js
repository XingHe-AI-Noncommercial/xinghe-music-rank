// ============================================================================
// GET /api/state
// 精简版：返回本周【已审核通过】的上架作品 + 统计 + 今日投稿额度。
// 每次请求先做“每周一清空”，再读取数据。同样 10 秒 / 10 次 IP 限流。
// ============================================================================
import { beijingDay, enforceRateLimit, ensureWeek, fail, getClientIp, json, mondayOfBeijing, rateLimitFailed } from '../_lib.js';

export async function onRequestGet(context) {
  const { DB } = context.env;
  if (!DB) return fail('数据库尚未连接：请配置 D1 绑定 DB。', 503);

  const rl = await enforceRateLimit(context.env, context.request);
  if (!rl.ok) return rateLimitFailed(rl, rl.limit);

  try {
    await ensureWeek(DB); // 周一清空（幂等）

    const approved = await DB.prepare(
      "SELECT id, bvid, artist, title, created_at FROM songs WHERE status = 'approved' ORDER BY created_at ASC"
    ).all();

    const counts = await DB.prepare(
      `SELECT
         (SELECT COUNT(*) FROM songs WHERE status = 'approved') AS approved,
         (SELECT COUNT(*) FROM songs WHERE status = 'pending') AS pending,
         (SELECT COUNT(*) FROM songs WHERE status = 'rejected') AS rejected`
    ).first();

    // 今日该 IP 投稿情况（pending / approved 占用当日 1 次额度；rejected 不占用，可重投）
    const ip = getClientIp(context.request);
    const day = beijingDay();
    const todayRow = await DB.prepare(
      "SELECT status FROM songs WHERE submitter_ip = ? AND day = ? AND status IN ('pending','approved') LIMIT 1"
    ).bind(ip, day).first();

    return json({
      ok: true,
      week: mondayOfBeijing(),
      songs: (approved.results || []).map(s => ({
        id: s.id,
        bvid: s.bvid,
        artist: s.artist,
        title: s.title,
        createdAt: s.created_at,
        biliUrl: `https://www.bilibili.com/video/${s.bvid}`,
      })),
      summary: {
        approved: Number(counts?.approved || 0),
        pending: Number(counts?.pending || 0),
        rejected: Number(counts?.rejected || 0),
      },
      submit: {
        dailyLimit: 1,
        submittedToday: Boolean(todayRow),
        todayStatus: todayRow?.status || null,
        remainingToday: todayRow ? 0 : 1,
      },
    });
  } catch (error) {
    return fail(error?.message || '读取数据失败，请检查 D1 数据库与迁移。', 500);
  }
}

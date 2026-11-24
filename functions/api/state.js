// ============================================================================
// GET /api/state
// 精简版：返回本周【已审核通过】的上架作品 + 统计 + 今日投稿额度。
// 每次请求先做“每周一清空”，再读取数据。同样 10 秒 / 10 次 IP 限流。
// ============================================================================
import { beijingDay, biweeklyStartOfBeijing, bumpRequestCounter, enforceRateLimit, ensureWeek, fail, getAnnouncements, getBan, getClientIp, getSetting, isMaintenanceOn, json, maskBvid, rateLimitFailed, VOTE_LIMITS, VOTE_POINTS } from '../_lib.js';

export async function onRequestGet(context) {
  const { DB } = context.env;
  if (!DB) return fail('数据库尚未连接：请配置 D1 绑定 DB。', 503);

  const rl = await enforceRateLimit(context.env, context.request);
  if (!rl.ok) return rateLimitFailed(rl, rl.limit);

  try {
    await ensureWeek(DB); // 周一清空（幂等）

    // IP 封禁：命中则返回封禁状态（含剩余时效），前端显示封禁页
    const ip = getClientIp(context.request);
    const ban = await getBan(DB, ip);
    if (ban) {
      return json({ ok: true, banned: true, ban: { until: ban.until, reason: ban.reason || '' } });
    }

    // 全局 60 秒请求计数：超过 60 次自动开启维护
    await bumpRequestCounter(DB);

    const period = biweeklyStartOfBeijing();
    const approved = await DB.prepare(
      "SELECT id, bvid, artist, title, created_at FROM songs WHERE status = 'approved'"
    ).all();

    // 当前周期各歌曲积分
    const votes = await DB.prepare(
      'SELECT song_id, SUM(points) AS points, COUNT(*) AS votes FROM votes WHERE period = ? GROUP BY song_id'
    ).bind(period).all();
    const voteMap = new Map((votes.results || []).map(v => [v.song_id, { points: Number(v.points || 0), votes: Number(v.votes || 0) }]));

    const day = beijingDay();
    const todayUsage = await DB.prepare('SELECT normal_used, advanced_used FROM vote_usage WHERE ip = ? AND day = ?')
      .bind(ip, day).first();

    const counts = await DB.prepare(
      `SELECT
         (SELECT COUNT(*) FROM songs WHERE status = 'approved') AS approved,
         (SELECT COUNT(*) FROM songs WHERE status = 'pending') AS pending,
         (SELECT COUNT(*) FROM songs WHERE status = 'rejected') AS rejected`
    ).first();

    // 今日该 IP 投稿情况（pending / approved 占用当日 1 次额度；rejected 不占用，可重投）
    const todayRow = await DB.prepare(
      "SELECT status FROM songs WHERE submitter_ip = ? AND day = ? AND status IN ('pending','approved') LIMIT 1"
    ).bind(ip, day).first();

    return json({
      ok: true,
      week: mondayOfBeijing(),
      maintenance: await isMaintenanceOn(DB),
      announcements: (await getAnnouncements(DB)).map(a => ({ id: a.id, text: a.text, createdAt: a.createdAt })),
      songs: (approved.results || []).map(s => {
        const v = voteMap.get(s.id) || { points: 0, votes: 0 };
        return {
          id: s.id,
          bvid: maskBvid(s.bvid),
          artist: s.artist,
          title: s.title,
          createdAt: s.created_at,
          points: v.points,
          votes: v.votes,
        };
      }).sort((a, b) => (b.points - a.points) || (a.createdAt < b.createdAt ? -1 : 1)),
      voting: {
        open: (await getSetting(DB, 'voting_open', '1')) === '1',
        period,
        limits: VOTE_LIMITS,
        points: VOTE_POINTS,
        remaining: {
          normal: Math.max(0, VOTE_LIMITS.normal - Number(todayUsage?.normal_used || 0)),
          advanced: Math.max(0, VOTE_LIMITS.advanced - Number(todayUsage?.advanced_used || 0)),
        },
      },
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

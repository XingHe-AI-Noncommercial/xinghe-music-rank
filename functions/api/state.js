// ============================================================================
// GET /api/state
// 返回【已审核通过】的收藏歌曲（按票数排序）+ 今日投票额度 + 统计。
// 同样加入 10 秒 / 10 次 IP 限流。
// ============================================================================
import { DAILY_VOTES, SONG_VOTE_CAP, beijingDay, enforceRateLimit, fail, getViewer, json, rateLimitFailed } from '../_lib.js';

export async function onRequestGet(context) {
  const { DB } = context.env;
  if (!DB) return fail('数据库尚未连接：请配置 D1 绑定 DB。', 503);

  const rl = await enforceRateLimit(context.env, context.request);
  if (!rl.ok) return rateLimitFailed(rl, rl.limit);

  let viewer;
  try {
    viewer = await getViewer(context);
  } catch (error) {
    return fail(error?.message || '无法建立访客身份。', 500);
  }

  try {
    const songs = await DB.prepare(
      `SELECT id, title, artist, cover_url, bvid, bili_url, votes, created_at
       FROM songs WHERE status = 'approved' ORDER BY votes DESC, created_at DESC`
    ).all();

    const counts = await DB.prepare(
      `SELECT
         (SELECT COUNT(*) FROM songs WHERE status = 'approved') AS songCount,
         (SELECT COUNT(*) FROM songs WHERE status = 'pending') AS pendingCount,
         (SELECT COALESCE(SUM(votes), 0) FROM songs WHERE status = 'approved') AS totalVotes,
         (SELECT COUNT(*) FROM vocadb_cache) AS cacheCount`
    ).first();

    // 今日投票额度
    const day = beijingDay();
    const todayRows = await DB.prepare(
      'SELECT song_id, SUM(amount) AS used FROM votes WHERE visitor_id = ? AND day = ? GROUP BY song_id'
    ).bind(viewer.id, day).all();
    const songVotes = {};
    let totalUsed = 0;
    for (const row of todayRows?.results || []) {
      const used = Number(row.used || 0);
      songVotes[row.song_id] = used;
      totalUsed += used;
    }

    return json({
      ok: true,
      songs: (songs.results || []).map(s => ({
        id: s.id,
        title: s.title,
        artist: s.artist,
        coverUrl: s.cover_url,
        bvid: s.bvid,
        biliUrl: s.bili_url,
        votes: Number(s.votes || 0),
        createdAt: s.created_at,
      })),
      summary: {
        songCount: Number(counts?.songCount || 0),
        pendingCount: Number(counts?.pendingCount || 0),
        totalVotes: Number(counts?.totalVotes || 0),
        cacheCount: Number(counts?.cacheCount || 0),
      },
      voting: {
        dailyVotes: DAILY_VOTES,
        songCap: SONG_VOTE_CAP,
        totalUsed,
        totalRemaining: Math.max(0, DAILY_VOTES - totalUsed),
        songVotes,
      },
    }, 200, viewer.cookie);
  } catch (error) {
    return fail(error?.message || '读取数据失败，请检查 D1 数据库与迁移。', 500, viewer.cookie);
  }
}

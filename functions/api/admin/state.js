// ============================================================================
// GET /api/admin/state
// 后台数据：全部歌曲（含状态）+ 待审核列表 + 统计。需管理员登录，同样限流。
// ============================================================================
import { enforceRateLimit, fail, isAdmin, json, rateLimitFailed } from '../../_lib.js';

export async function onRequestGet(context) {
  if (!(await isAdmin(context.request, context.env))) return fail('请先登录后台。', 401);

  const rl = await enforceRateLimit(context.env, context.request);
  if (!rl.ok) return rateLimitFailed(rl, rl.limit);

  const DB = context.env.DB;
  if (!DB) return fail('数据库尚未连接。', 503);

  try {
    const songs = await DB.prepare(
      'SELECT id, title, artist, cover_url, bvid, bili_url, status, votes, created_at, reviewed_at FROM songs ORDER BY created_at DESC'
    ).all();
    const pending = await DB.prepare(
      "SELECT id, title, artist, cover_url, bvid, bili_url, created_at FROM songs WHERE status = 'pending' ORDER BY created_at ASC LIMIT 200"
    ).all();
    const counts = await DB.prepare(
      `SELECT
         (SELECT COUNT(*) FROM songs WHERE status = 'approved') AS approved,
         (SELECT COUNT(*) FROM songs WHERE status = 'pending') AS pending,
         (SELECT COUNT(*) FROM songs WHERE status = 'rejected') AS rejected,
         (SELECT COALESCE(SUM(votes), 0) FROM songs WHERE status = 'approved') AS totalVotes,
         (SELECT COUNT(*) FROM vocadb_cache) AS cacheCount`
    ).first();

    return json({
      ok: true,
      songs: (songs.results || []).map(s => ({
        id: s.id,
        title: s.title,
        artist: s.artist,
        coverUrl: s.cover_url,
        bvid: s.bvid,
        biliUrl: s.bili_url,
        status: s.status,
        votes: Number(s.votes || 0),
        createdAt: s.created_at,
        reviewedAt: s.reviewed_at,
      })),
      pending: (pending.results || []).map(s => ({
        id: s.id,
        title: s.title,
        artist: s.artist,
        coverUrl: s.cover_url,
        bvid: s.bvid,
        biliUrl: s.bili_url,
        createdAt: s.created_at,
      })),
      summary: {
        approved: Number(counts?.approved || 0),
        pending: Number(counts?.pending || 0),
        rejected: Number(counts?.rejected || 0),
        totalVotes: Number(counts?.totalVotes || 0),
        cacheCount: Number(counts?.cacheCount || 0),
      },
    });
  } catch (error) {
    return fail(error?.message || '后台数据读取失败。', 500);
  }
}

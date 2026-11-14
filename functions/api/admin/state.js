// ============================================================================
// GET /api/admin/state
// 精简版后台数据：全部作品（含状态）+ 待审核列表 + 统计 + 本周周期。
// 需开发者登录，同样限流。
// ============================================================================
import { enforceRateLimit, ensureWeek, fail, isAdmin, isMaintenanceOn, json, mondayOfBeijing, rateLimitFailed } from '../../_lib.js';

export async function onRequestGet(context) {
  if (!(await isAdmin(context.request, context.env))) return fail('请先登录开发者模式。', 401);

  const rl = await enforceRateLimit(context.env, context.request);
  if (!rl.ok) return rateLimitFailed(rl, rl.limit);

  const DB = context.env.DB;
  if (!DB) return fail('数据库尚未连接。', 503);

  try {
    await ensureWeek(DB); // 周一清空（幂等）

    const songs = await DB.prepare(
      'SELECT id, bvid, artist, title, status, submitter_ip, day, created_at, reviewed_at FROM songs ORDER BY created_at DESC'
    ).all();
    const pending = await DB.prepare(
      "SELECT id, bvid, artist, title, created_at FROM songs WHERE status = 'pending' ORDER BY created_at ASC LIMIT 200"
    ).all();
    const counts = await DB.prepare(
      `SELECT
         (SELECT COUNT(*) FROM songs WHERE status = 'approved') AS approved,
         (SELECT COUNT(*) FROM songs WHERE status = 'pending') AS pending,
         (SELECT COUNT(*) FROM songs WHERE status = 'rejected') AS rejected`
    ).first();

    // 一键复制：只含已审核通过（approved）的【真实】BV 号（开发者可信，不掩码）
    const approvedBvids = (songs.results || []).filter(s => s.status === 'approved').map(s => s.bvid).filter(Boolean);

    return json({
      ok: true,
      week: mondayOfBeijing(),
      maintenance: await isMaintenanceOn(DB),
      songs: (songs.results || []).map(s => ({
        id: s.id,
        bvid: s.bvid,
        artist: s.artist,
        title: s.title,
        status: s.status,
        submitterIp: s.submitter_ip,
        day: s.day,
        createdAt: s.created_at,
        reviewedAt: s.reviewed_at,
      })),
      pending: (pending.results || []).map(s => ({
        id: s.id,
        bvid: s.bvid,
        artist: s.artist,
        title: s.title,
        createdAt: s.created_at,
      })),
      summary: {
        approved: Number(counts?.approved || 0),
        pending: Number(counts?.pending || 0),
        rejected: Number(counts?.rejected || 0),
      },
      bvList: approvedBvids.join(','),
    });
  } catch (error) {
    return fail(error?.message || '后台数据读取失败。', 500);
  }
}

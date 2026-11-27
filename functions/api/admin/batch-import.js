// ============================================================================
// POST /api/admin/batch-import  { songs: [{bvid, artist, title}], status?: 'pending'|'approved' }
// 开发者批量导入歌曲。逐条校验（复用 insertSong：BV 格式/去重/标题必填）。
// status 默认 'pending'（待审核）；传 'approved' 直接上架。最多 200 条/次。
// 需开发者登录，同样限流。
// ============================================================================
import { beijingDay, enforceRateLimit, fail, getClientIp, insertSong, isAdmin, json, rateLimitFailed, readBody, ensureWeek } from '../../_lib.js';

export async function onRequestPost(context) {
  if (!(await isAdmin(context.request, context.env))) return fail('请先登录后台。', 401);
  const rl = await enforceRateLimit(context.env, context.request);
  if (!rl.ok) return rateLimitFailed(rl, rl.limit);
  const DB = context.env.DB;
  if (!DB) return fail('数据库尚未连接。', 503);
  try {
    await ensureWeek(DB);
    const body = await readBody(context.request);
    const raw = Array.isArray(body?.songs) ? body.songs : [];
    const songs = raw.slice(0, 200);
    if (!songs.length) return fail('没有要导入的歌曲。', 400);
    const status = body?.status === 'approved' ? 'approved' : 'pending';
    const ip = getClientIp(context.request);
    const day = beijingDay();

    const results = [];
    let okCount = 0;
    for (const s of songs) {
      const bvid = String(s?.bvid || '').trim();
      const artist = String(s?.artist || '').trim();
      const title = String(s?.title || '').trim();
      if (!bvid) { results.push({ bvid: '', ok: false, error: '缺少 BV 号' }); continue; }
      const r = await insertSong(DB, { bvid, artist, title }, status, { submitterIp: ip, day });
      if (r.ok) { okCount++; results.push({ bvid, ok: true, id: r.id }); }
      else { results.push({ bvid, ok: false, error: r.error }); }
    }
    const failCount = results.length - okCount;
    return json({
      ok: true, okCount, failCount, status,
      message: `已导入 ${okCount} 首（${status === 'approved' ? '直接上架' : '待审核'}），失败/跳过 ${failCount} 首。`,
      results,
    });
  } catch (error) {
    return fail(error?.message || '批量导入失败，请稍后重试。', 500);
  }
}

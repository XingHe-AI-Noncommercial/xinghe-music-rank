// ============================================================================
// GET /api/admin/export
// 开发者导出完整数据备份（JSON）：全部歌曲 + 设置 + 公告 + 封禁 + 生日 + 访问统计。
// 需开发者登录，同样限流。
// ============================================================================
import { enforceRateLimit, ensureWeek, fail, getAnnouncements, getBans, getBirthdays, getSetting, getVisitStats, isAdmin, json, rateLimitFailed } from '../../_lib.js';

export async function onRequestGet(context) {
  if (!(await isAdmin(context.request, context.env))) return fail('请先登录开发者模式。', 401);

  const rl = await enforceRateLimit(context.env, context.request);
  if (!rl.ok) return rateLimitFailed(rl, rl.limit);

  const DB = context.env.DB;
  if (!DB) return fail('数据库尚未连接。', 503);

  try {
    await ensureWeek(DB);
    const songs = await DB.prepare(
      'SELECT id, bvid, artist, title, status, submitter_ip, day, created_at, reviewed_at, reviewed_by FROM songs ORDER BY created_at DESC'
    ).all();
    const settingsRows = await DB.prepare("SELECT key, value FROM settings WHERE key NOT LIKE 'inbox:%'").all();

    const settings = {};
    for (const row of settingsRows.results || []) settings[row.key] = row.value;

    const data = {
      exportedAt: new Date().toISOString(),
      week: await getSetting(DB, 'week_key', ''),
      songs: songs.results || [],
      settings,
      announcements: await getAnnouncements(DB),
      bans: await getBans(DB),
      birthdays: await getBirthdays(DB),
      visits: await getVisitStats(DB),
    };

    const response = json(data, 200, { 'Content-Disposition': 'attachment; filename="xinghe-backup.json"', 'Content-Type': 'application/json; charset=utf-8' });
    return response;
  } catch (error) {
    return fail(error?.message || '导出失败。', 500);
  }
}

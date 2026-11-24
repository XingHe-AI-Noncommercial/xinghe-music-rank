// ============================================================================
// POST /api/vote   { songId, type: 'normal' | 'advanced' }
// 投票规则（两周一个周期）：
//   普通票：每天 10 张，每张 +1 分；
//   高级票：每天 5 张，每张 +3 分；
//   可投不同歌曲；同一首歌曲连续投票不能超过 5 张（先投别的歌才可继续）；
//   每两周重置一次（积分与榜单）。
// 强制 10 秒 / 10 次 IP 限流。
// ============================================================================
import {
  beijingDay, biweeklyStartOfBeijing, enforceRateLimit, ensureWeek, fail,
  getClientIp, getSetting, isMaintenanceOn, isoNow, json, makeId,
  rateLimitFailed, readBody, VOTE_LIMITS, VOTE_MAX_CONSECUTIVE, VOTE_POINTS,
} from '../_lib.js';

export async function onRequestPost(context) {
  const { DB } = context.env;
  if (!DB) return fail('数据库尚未连接：请配置 D1 绑定 DB。', 503);

  const rl = await enforceRateLimit(context.env, context.request);
  if (!rl.ok) return rateLimitFailed(rl, rl.limit);

  const body = await readBody(context.request);
  const songId = String(body?.songId || '').trim();
  const type = String(body?.type || '').trim();

  if (!songId) return fail('请选择要投票的歌曲。', 400);
  if (!Object.hasOwn(VOTE_LIMITS, type)) return fail('票种不正确（普通票 / 高级票）。', 400);

  try {
    await ensureWeek(DB); // 双周清空（幂等）

    const ip = getClientIp(context.request);
    if (await isMaintenanceOn(DB)) return fail('网站维护中，暂时无法投票，请稍后再来。', 503);

    if ((await getSetting(DB, 'voting_open', '1')) !== '1') {
      return fail('当前未开放投票，请留意开发者公告。', 403);
    }

    const song = await DB.prepare("SELECT id FROM songs WHERE id = ? AND status = 'approved'").bind(songId).first();
    if (!song) return fail('这首作品当前不在榜单上，无法投票。', 404);

    const day = beijingDay();
    const period = biweeklyStartOfBeijing();
    const limit = VOTE_LIMITS[type];
    const points = VOTE_POINTS[type];

    // 每日额度检查
    const usage = await DB.prepare('SELECT normal_used, advanced_used FROM vote_usage WHERE ip = ? AND day = ?')
      .bind(ip, day).first();
    const used = type === 'normal' ? (usage?.normal_used || 0) : (usage?.advanced_used || 0);
    if (used >= limit) {
      return fail(`今日${type === 'normal' ? '普通票' : '高级票'}已用完（每天 ${limit} 张），明天（北京时间 0 点）刷新。`, 409);
    }

    // 同一首歌曲连续投票上限：最近 5 张全为该歌曲则拒绝
    const recent = await DB.prepare(
      'SELECT song_id FROM votes WHERE voter_ip = ? AND period = ? ORDER BY created_at DESC, rowid DESC LIMIT ?'
    ).bind(ip, period, VOTE_MAX_CONSECUTIVE).all();
    const r = (recent.results || []).map(v => v.song_id);
    if (r.length >= VOTE_MAX_CONSECUTIVE && r.every(s => s === songId)) {
      return fail(`同一首歌曲连续投票不能超过 ${VOTE_MAX_CONSECUTIVE} 张，请先给其他歌曲投一票。`, 409);
    }

    const now = isoNow();
    await DB.batch([
      DB.prepare('INSERT OR IGNORE INTO vote_usage(ip, day) VALUES(?, ?)').bind(ip, day),
      DB.prepare(`UPDATE vote_usage SET ${type}_used = ${type}_used + 1 WHERE ip = ? AND day = ?`).bind(ip, day),
      DB.prepare('INSERT INTO votes(id, song_id, voter_ip, type, points, day, period, created_at) VALUES(?, ?, ?, ?, ?, ?, ?, ?)')
        .bind(makeId(), songId, ip, type, points, day, period, now),
    ]);

    const remaining = Math.max(0, limit - (used + 1));
    const label = type === 'normal' ? '普通票' : '高级票';
    return json({ ok: true, message: `已投 1 张${label}（${songId} +${points} 分）。`, points, remaining, remainingTotal: {
      normal: Math.max(0, VOTE_LIMITS.normal - ((await DB.prepare('SELECT normal_used FROM vote_usage WHERE ip = ? AND day = ?').bind(ip, day).first())?.normal_used || 0)),
      advanced: Math.max(0, VOTE_LIMITS.advanced - ((await DB.prepare('SELECT advanced_used FROM vote_usage WHERE ip = ? AND day = ?').bind(ip, day).first())?.advanced_used || 0)),
    } });
  } catch (error) {
    return fail(error?.message || '投票失败，请稍后重试。', 500);
  }
}

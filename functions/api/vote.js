// ============================================================================
// POST /api/vote   { songId, amount }
// 纯票数投票：每人每天 30 票（原子扣减），对同一作品每天最多 15 票。
// 只有审核通过（approved）的歌曲可以投票。强制 10 秒 / 10 次 IP 限流。
// ============================================================================
import {
  DAILY_VOTES, SONG_VOTE_CAP, beijingDay, enforceRateLimit, fail, getViewer,
  isoNow, json, makeId, rateLimitFailed, readBody,
} from '../_lib.js';

export async function onRequestPost(context) {
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

  const body = await readBody(context.request);
  const songId = String(body?.songId || '');
  const amount = Number(body?.amount);

  if (!songId) return fail('缺少歌曲 ID。', 400, viewer.cookie ? { 'set-cookie': viewer.cookie } : undefined);
  if (!Number.isInteger(amount) || amount < 1 || amount > SONG_VOTE_CAP) {
    return fail(`单次投票须为 1 至 ${SONG_VOTE_CAP} 的整数。`, 400, viewer.cookie ? { 'set-cookie': viewer.cookie } : undefined);
  }

  try {
    const song = await DB.prepare("SELECT id, votes FROM songs WHERE id = ? AND status = 'approved'").bind(songId).first();
    if (!song) return fail('这首作品暂不可投票（不存在或未审核通过）。', 404, viewer.cookie ? { 'set-cookie': viewer.cookie } : undefined);

    const day = beijingDay();
    const now = isoNow();

    // 1) 单曲每日上限（15 票）：先检查，避免误扣每日总额
    const songRow = await DB.prepare(
      'SELECT COALESCE(SUM(amount), 0) AS used FROM votes WHERE visitor_id = ? AND song_id = ? AND day = ?'
    ).bind(viewer.id, songId, day).first();
    const songUsed = Number(songRow?.used || 0);
    if (songUsed + amount > SONG_VOTE_CAP) {
      return fail(`你今天就给这首歌投过 ${songUsed} 票了，单曲每日最多 ${SONG_VOTE_CAP} 票。`, 409, viewer.cookie ? { 'set-cookie': viewer.cookie } : undefined);
    }

    // 2) 每人每日总额（30 票）：原子扣减，防止并发超限
    await DB.prepare('INSERT OR IGNORE INTO vote_usage(visitor_id, day, total_used, updated_at) VALUES(?, ?, 0, ?)')
      .bind(viewer.id, day, now).run();
    const debit = await DB.prepare(
      'UPDATE vote_usage SET total_used = total_used + ?, updated_at = ? WHERE visitor_id = ? AND day = ? AND total_used + ? <= ?'
    ).bind(amount, now, viewer.id, day, amount, DAILY_VOTES).run();

    if (!debit.meta?.changes) {
      const usage = await DB.prepare('SELECT total_used FROM vote_usage WHERE visitor_id = ? AND day = ?').bind(viewer.id, day).first();
      const remaining = Math.max(0, DAILY_VOTES - Number(usage?.total_used || 0));
      return fail(`你今天的票用完了（剩余 ${remaining} 票）。`, 409, viewer.cookie ? { 'set-cookie': viewer.cookie } : undefined);
    }

    // 3) 记录投票明细并累加歌曲票数
    await DB.batch([
      DB.prepare('INSERT INTO votes(id, visitor_id, song_id, day, amount, created_at) VALUES(?, ?, ?, ?, ?, ?)')
        .bind(makeId(), viewer.id, songId, day, amount, now),
      DB.prepare('UPDATE songs SET votes = votes + ? WHERE id = ?').bind(amount, songId),
    ]);

    const newSongUsed = songUsed + amount;
    const totalUsed = Number((await DB.prepare('SELECT total_used FROM vote_usage WHERE visitor_id = ? AND day = ?').bind(viewer.id, day).first())?.total_used || 0);
    return json({
      ok: true,
      message: `已为「${song.title}」投出 ${amount} 票。`,
      songVotes: Number(song.votes || 0) + amount,
      songUsedToday: newSongUsed,
      songRemaining: Math.max(0, SONG_VOTE_CAP - newSongUsed),
      totalUsed,
      totalRemaining: Math.max(0, DAILY_VOTES - totalUsed),
    }, 200, viewer.cookie ? { 'set-cookie': viewer.cookie } : undefined);
  } catch (error) {
    return fail(error?.message || '投票失败，请稍后重试。', 500, viewer.cookie ? { 'set-cookie': viewer.cookie } : undefined);
  }
}

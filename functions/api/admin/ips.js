// ============================================================================
// GET /api/admin/ips
// 访客公网 IP 列表：每个进入/投稿过的 IP + 其请求活动 + 投稿记录。
// 数据来源：rate_limits（每次 /api/state、/api/submit 都会记录 IP）与 songs.submitter_ip。
// ============================================================================
import { enforceRateLimit, fail, isAdmin, json, maskBvid, rateLimitFailed } from '../../_lib.js';

export async function onRequestGet(context) {
  if (!(await isAdmin(context.request, context.env))) return fail('请先登录后台。', 401);
  const rl = await enforceRateLimit(context.env, context.request);
  if (!rl.ok) return rateLimitFailed(rl, rl.limit);
  const DB = context.env.DB;
  if (!DB) return fail('数据库尚未连接。', 503);
  try {
    const [rows, songs] = await Promise.all([
      DB.prepare("SELECT ip, request_count, last_request_at FROM rate_limits ORDER BY last_request_at DESC LIMIT 300").all(),
      DB.prepare("SELECT submitter_ip, bvid, artist, title, status, day, created_at FROM songs ORDER BY created_at DESC").all(),
    ]);
    const byIp = {};
    (songs.results || []).forEach(s => {
      if (!s.submitter_ip) return;
      (byIp[s.submitter_ip] ||= []).push({
        bvid: maskBvid(s.bvid), artist: s.artist, title: s.title, status: s.status, day: s.day, createdAt: s.created_at,
      });
    });
    const now = Date.now();
    const seen = new Set();
    const ips = (rows.results || []).map(r => {
      const lastAt = Number(r.last_request_at || 0);
      seen.add(r.ip);
      return { ip: r.ip, requests: Number(r.request_count || 0), lastAt, active: now - lastAt < 10 * 60000, songs: byIp[r.ip] || [] };
    });
    // 只有投稿、但没有近期 rate 记录的 IP（如更早的访客）也补上
    Object.keys(byIp).forEach(ip => {
      if (!seen.has(ip)) ips.push({ ip, requests: 0, lastAt: 0, active: false, songs: byIp[ip] });
    });
    return json({ ok: true, ips });
  } catch (error) {
    return fail(error?.message || '读取访客 IP 失败。', 500);
  }
}

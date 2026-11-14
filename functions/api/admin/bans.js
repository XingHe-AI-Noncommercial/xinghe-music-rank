// ============================================================================
// /api/admin/bans
//   GET  → { bans: [{ip, until, reason, createdAt}] }   当前有效封禁
//   POST → { ip, hours?, permanent?, reason? }          新增封禁（时效可选）
// ============================================================================
import { addBan, enforceRateLimit, fail, getBans, isAdmin, json, rateLimitFailed, readBody } from '../../_lib.js';

export async function onRequestGet(context) {
  if (!(await isAdmin(context.request, context.env))) return fail('请先登录后台。', 401);
  const rl = await enforceRateLimit(context.env, context.request);
  if (!rl.ok) return rateLimitFailed(rl, rl.limit);
  const DB = context.env.DB;
  if (!DB) return fail('数据库尚未连接。', 503);
  try {
    const now = Date.now();
    const bans = (await getBans(DB)).filter(b => b.until === 0 || b.until > now);
    return json({ ok: true, bans: bans.map(b => ({ ip: b.ip, until: b.until, reason: b.reason || '', createdAt: b.createdAt })) });
  } catch (error) {
    return fail(error?.message || '读取封禁列表失败。', 500);
  }
}

export async function onRequestPost(context) {
  if (!(await isAdmin(context.request, context.env))) return fail('请先登录后台。', 401);
  const rl = await enforceRateLimit(context.env, context.request);
  if (!rl.ok) return rateLimitFailed(rl, rl.limit);
  const DB = context.env.DB;
  if (!DB) return fail('数据库尚未连接。', 503);

  const body = await readBody(context.request);
  const ip = String(body?.ip || '').trim();
  if (!ip) return fail('请输入要封禁的 IP。', 400);
  let until = 0;
  if (body?.permanent === true) until = 0;
  else {
    const seconds = Number(body?.seconds || 0);
    if (!(seconds > 0)) return fail('请选择封禁时效（秒）。', 400);
    until = Date.now() + Math.min(seconds, 365 * 24 * 3600) * 1000;
  }
  try {
    const item = await addBan(DB, ip, until, body?.reason);
    if (!item) return fail('IP 无效。', 400);
    return json({ ok: true, message: `已封禁 ${ip}${until ? '，到时自动解封' : '（永久）'}。`, ban: item });
  } catch (error) {
    return fail(error?.message || '封禁失败。', 500);
  }
}

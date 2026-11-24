// ============================================================================
// POST /api/admin/maintenance  { on: boolean, ip?: string }
// 开发者一键切换“网站维护”。
// 开启：开发者必须填写自己的公网IP，与服务器检测到的来源IP（CF-Connecting-IP）
//       完全一致即一次开启（不做 3 次确认；仍校验IP防锁死）。
//       开启时记录该公网IP（maintenance_admin_ip），维护期间仅该IP可访问全站。
// 关闭：开发者本人已被放行，直接关闭，无需IP验证。
// 需开发者登录，同样限流。
// ============================================================================
import { enforceRateLimit, fail, getClientIp, getSetting, ipFamily, isAdmin, json, rateLimitFailed, readBody, setSetting } from '../../_lib.js';

export async function onRequestPost(context) {
  if (!(await isAdmin(context.request, context.env))) return fail('请先登录后台。', 401);

  const rl = await enforceRateLimit(context.env, context.request);
  if (!rl.ok) return rateLimitFailed(rl, rl.limit);

  const DB = context.env.DB;
  if (!DB) return fail('数据库尚未连接。', 503);

  const body = await readBody(context.request);
  const on = Boolean(body?.on);

  if (on) {
    // —— 开启：填对公网IP 即一次生效（去掉 3 次确认；仍校验IP防锁死） ——
    const clientIP = getClientIp(context.request);
    const enteredIP = String(body?.ip || '').trim();
    const clientFamily = ipFamily(clientIP);
    const enteredFamily = ipFamily(enteredIP);
    if (enteredFamily !== clientFamily) {
      const label = clientFamily === 'v6' ? 'IPv6' : 'IPv4';
      return fail(`检测到你的连接走${label}（${clientIP}），请切换${label}模式并填写${label}地址。`, 400);
    }
    if (!clientIP || !enteredIP || enteredIP !== clientIP) {
      return fail('公网IP不匹配，请填写与检测一致的IP。', 400);
    }
    await setSetting(DB, 'maintenance', '1');
    await setSetting(DB, 'maintenance_admin_ip', clientIP);
    await setSetting(DB, 'maintenance_confirm', '0');
    return json({ ok: true, maintenance: true, message: '网站维护已开启，维护期间仅你的公网IP可访问。' });
  }

  // —— 关闭：直接关闭 ——
  await setSetting(DB, 'maintenance', '0');
  await setSetting(DB, 'maintenance_confirm', '0');
  return json({ ok: true, maintenance: false, message: '网站维护已关闭，站点恢复访问。' });
}

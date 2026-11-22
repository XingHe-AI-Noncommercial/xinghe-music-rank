// ============================================================================
// POST /api/admin/maintenance  { on: boolean, ip?: string }
// 开发者一键切换“网站维护（全体403）”。
// 开启：开发者必须填写自己的公网IP，与服务器检测到的来源IP（CF-Connecting-IP）
//       完全一致才计一次确认；需连续 3 次确认通过才真正开启。不匹配则重置重新开始。
//       开启时记录该公网IP（maintenance_admin_ip），维护期间仅该IP可访问全站。
// 关闭：开发者本人已被放行，直接关闭，无需IP验证。
// 需开发者登录，同样限流。
// ============================================================================
import { enforceRateLimit, fail, getSetting, isAdmin, json, rateLimitFailed, readBody, setSetting } from '../../_lib.js';

export async function onRequestPost(context) {
  if (!(await isAdmin(context.request, context.env))) return fail('请先登录后台。', 401);

  const rl = await enforceRateLimit(context.env, context.request);
  if (!rl.ok) return rateLimitFailed(rl, rl.limit);

  const DB = context.env.DB;
  if (!DB) return fail('数据库尚未连接。', 503);

  const body = await readBody(context.request);
  const on = Boolean(body?.on);

  if (on) {
    // —— 开启：公网IP 3 次确认 ——
    const clientIP = (context.request.headers.get('CF-Connecting-IP') || '').trim();
    const enteredIP = String(body?.ip || '').trim();
    let confirm = Number(await getSetting(DB, 'maintenance_confirm', '0')) || 0;
    if (!clientIP || !enteredIP || enteredIP !== clientIP) {
      await setSetting(DB, 'maintenance_confirm', '0'); // 不匹配 → 重置
      return json({ ok: false, ipMismatch: true, confirm: 0, total: 3, message: '公网IP不匹配，已重新开始确认。' });
    }
    confirm += 1;
    await setSetting(DB, 'maintenance_confirm', String(confirm));
    if (confirm >= 3) {
      await setSetting(DB, 'maintenance', '1');
      await setSetting(DB, 'maintenance_admin_ip', clientIP);
      await setSetting(DB, 'maintenance_confirm', '0');
      return json({ ok: true, maintenance: true, confirm: 3, total: 3, message: '全体403已开启（3次确认通过）。维护期间仅你的公网IP可访问。' });
    }
    return json({ ok: true, maintenance: false, confirm, total: 3, message: `确认 ${confirm}/3 通过，请再次确认。` });
  }

  // —— 关闭：直接关闭 ——
  await setSetting(DB, 'maintenance', '0');
  await setSetting(DB, 'maintenance_confirm', '0');
  return json({ ok: true, maintenance: false, message: '网站维护已关闭，站点恢复访问。' });
}

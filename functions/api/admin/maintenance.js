// ============================================================================
// POST /api/admin/maintenance  { on: boolean }
// 开发者一键切换“网站维护”。
// 开启：直接开启，不校验 IP（维护对所有人含开发者生效，开发者凭密码会话进后台）。
// 关闭：直接关闭，无需 IP 验证。
// 需开发者登录，同样限流。
// ============================================================================
import { enforceRateLimit, fail, isAdmin, json, rateLimitFailed, readBody, setSetting } from '../../_lib.js';

export async function onRequestPost(context) {
  if (!(await isAdmin(context.request, context.env))) return fail('请先登录后台。', 401);

  const rl = await enforceRateLimit(context.env, context.request);
  if (!rl.ok) return rateLimitFailed(rl, rl.limit);

  const DB = context.env.DB;
  if (!DB) return fail('数据库尚未连接。', 503);

  const body = await readBody(context.request);
  const on = Boolean(body?.on);

  if (on) {
    await setSetting(DB, 'maintenance', '1');
    await setSetting(DB, 'maintenance_confirm', '0');
    return json({ ok: true, maintenance: true, message: '网站维护已开启（含开发者）。维护期间仅开发者密码会话可进后台。' });
  }

  // —— 关闭：直接关闭 ——
  await setSetting(DB, 'maintenance', '0');
  await setSetting(DB, 'maintenance_confirm', '0');
  return json({ ok: true, maintenance: false, message: '网站维护已关闭，站点恢复访问。' });
}

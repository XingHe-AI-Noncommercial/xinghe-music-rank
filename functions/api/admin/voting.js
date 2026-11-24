// ============================================================================
// POST /api/admin/voting   { open: boolean }
// 开发者开关投票：暂停后普通用户无法投普通票/高级票（后台与榜单仍可看）。
// ============================================================================
import { enforceRateLimit, fail, getSetting, isAdmin, json, rateLimitFailed, readBody, setSetting } from '../../_lib.js';

export async function onRequestPost(context) {
  if (!(await isAdmin(context.request, context.env))) return fail('请先登录开发者模式。', 401);

  const rl = await enforceRateLimit(context.env, context.request);
  if (!rl.ok) return rateLimitFailed(rl, rl.limit);

  const DB = context.env.DB;
  if (!DB) return fail('数据库尚未连接。', 503);

  const body = await readBody(context.request);
  const open = body?.open === true ? '1' : '0';
  await setSetting(DB, 'voting_open', open);
  return json({ ok: true, message: open === '1' ? '已开放投票。' : '已暂停投票，普通用户暂时无法投票。', votingOpen: open === '1' });
}

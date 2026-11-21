// ============================================================================
// /api/admin/birthdays
// 开发者模式：创建 / 列出 / 删除 生日祝福链接。POST 生成 16 位随机 token。
// ============================================================================
import { addBirthday, adminOnly, fail, getBirthdays, json, readBody, setBirthdayDisabled, setBirthdays } from '../../_lib.js';

export async function onRequestPost(context) {
  const { DB } = context.env;
  if (!DB) return fail('数据库尚未连接：请配置 D1 绑定 DB。', 503);
  const auth = await adminOnly(context);
  if (auth) return auth;
  const body = await readBody(context.request);
  const item = await addBirthday(DB, { name: body?.name, message: body?.message, style: body?.style, theme: body?.theme, birthday: body?.birthday });
  return json({ ok: true, token: item.token, name: item.name, style: item.style, birthday: item.birthday });
}

export async function onRequestGet(context) {
  const { DB } = context.env;
  if (!DB) return fail('数据库尚未连接：请配置 D1 绑定 DB。', 503);
  const auth = await adminOnly(context);
  if (auth) return auth;
  const list = await getBirthdays(DB);
  return json({ ok: true, list });
}

export async function onRequestPatch(context) {
  const { DB } = context.env;
  if (!DB) return fail('数据库尚未连接：请配置 D1 绑定 DB。', 503);
  const auth = await adminOnly(context);
  if (auth) return auth;
  const body = await readBody(context.request);
  const id = String(body?.id || '');
  if (!id) return fail('缺少 id。', 400);
  const item = await setBirthdayDisabled(DB, id, body?.disabled);
  if (!item) return fail('未找到该生日祝福。', 404);
  return json({ ok: true, id: item.id, disabled: item.disabled });
}

export async function onRequestDelete(context) {
  const { DB } = context.env;
  if (!DB) return fail('数据库尚未连接：请配置 D1 绑定 DB。', 503);
  const auth = await adminOnly(context);
  if (auth) return auth;
  const url = new URL(context.request.url);
  const all = url.searchParams.get('all') === 'true';
  if (all) { await setBirthdays(DB, []); return json({ ok: true, cleared: true }); }
  const id = url.searchParams.get('id');
  const list = await getBirthdays(DB);
  const next = list.filter(b => b.id !== id);
  await setBirthdays(DB, next);
  return json({ ok: true });
}

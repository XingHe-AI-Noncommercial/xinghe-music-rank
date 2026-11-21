// ============================================================================
// /api/admin/birthdays
// 开发者模式：创建 / 列出 / 删除 生日祝福链接。POST 生成 16 位随机 token。
// ============================================================================
import { addBirthday, adminOnly, fail, getBirthdays, json, readBody, setBirthdays } from '../../_lib.js';

export async function onRequestPost(context) {
  const { DB } = context.env;
  if (!DB) return fail('数据库尚未连接：请配置 D1 绑定 DB。', 503);
  const auth = await adminOnly(context);
  if (auth) return auth;
  const body = await readBody(context.request);
  const item = await addBirthday(DB, { name: body?.name, message: body?.message });
  return json({ ok: true, token: item.token, name: item.name });
}

export async function onRequestGet(context) {
  const { DB } = context.env;
  if (!DB) return fail('数据库尚未连接：请配置 D1 绑定 DB。', 503);
  const auth = await adminOnly(context);
  if (auth) return auth;
  const list = await getBirthdays(DB);
  return json({ ok: true, list });
}

export async function onRequestDelete(context) {
  const { DB } = context.env;
  if (!DB) return fail('数据库尚未连接：请配置 D1 绑定 DB。', 503);
  const auth = await adminOnly(context);
  if (auth) return auth;
  const id = new URL(context.request.url).searchParams.get('id');
  const list = await getBirthdays(DB);
  const next = list.filter(b => b.id !== id);
  await setBirthdays(DB, next);
  return json({ ok: true });
}

// 【临时诊断接口】用于排查「开发者模式登录后立即弹回」。排查完请删除本文件。
// 用法：浏览器/curl 访问本接口两次（保持同一会话）。
//   第一次：下发一个 xh_admin Cookie，返回 step:1。
//   第二次：浏览器带回 Cookie，服务端校验，返回 step:2 与 isAdmin 结果。
import { isAdmin, makeAdminCookie, json } from '../../_lib.js';

export async function onRequestGet(context) {
  const env = context.env;
  const secure = new URL(context.request.url).protocol === 'https:';
  const rawCookie = context.request.headers.get('cookie') || '';
  const hasCookie = /xh_admin=/.test(rawCookie);
  const admin = await isAdmin(context.request, env).catch(() => false);

  const base = {
    step: admin ? 2 : 1,
    hasCookie,
    isAdmin: admin,
    secretConfigured: !!(env.ADMIN_SESSION_SECRET),
    secretLength: String(env.ADMIN_SESSION_SECRET || '').length,
    cookieHint: hasCookie ? rawCookie.split('xh_admin=')[1].split(';')[0].slice(0, 24) : null,
  };

  // 第一次访问（无有效会话）：下发一个测试 Cookie，供第二次回传验证
  if (!admin) {
    try {
      const { cookie } = await makeAdminCookie(env, { secure });
      return json({ ...base, message: '已下发测试 Cookie，请再次访问本接口（同一会话）' }, 200, { 'set-cookie': cookie });
    } catch (e) {
      return json({ ...base, error: String(e.message || e) }, 200);
    }
  }
  return json({ ...base, message: '会话有效（Cookie 往返校验通过）' }, 200);
}

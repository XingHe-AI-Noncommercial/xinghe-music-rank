// ============================================================================
// 根中间件：网站维护（全体403）时，除开发者本人外所有浏览器请求一律 403。
// 开发者身份判定：请求来源公网IP === 开启维护时记录的公网IP（maintenance_admin_ip）。
// 开启维护需开发者填写自己的公网IP并通过 3 次确认（见 /api/admin/maintenance）。
// Cloudflare 取消方式：在 Pages 控制台回滚到本中间件之前的部署即可解除全体403。
// ============================================================================
import { getSetting } from './_lib.js';

export async function onRequest({ request, next, env }) {
  const DB = env.DB;
  let maintenance = '0';
  if (DB) {
    try { maintenance = (await getSetting(DB, 'maintenance', '0')) === '1' ? '1' : '0'; } catch {}
  }
  if (maintenance !== '1') return next();

  const clientIP = (request.headers.get('CF-Connecting-IP') || '').trim();
  let adminIP = '';
  if (DB) {
    try { adminIP = (await getSetting(DB, 'maintenance_admin_ip', '')) || ''; } catch {}
  }
  if (adminIP && clientIP === adminIP) return next(); // 开发者本人放行（含后台与静态资源）

  // 其余所有人：一律 403（含静态界面，防止查看源码/漏洞）
  const path = new URL(request.url).pathname;
  const isApi = path.startsWith('/api/') || path.startsWith('/birthday/');
  if (isApi) {
    return new Response(JSON.stringify({ ok: false, error: '网站维护中，仅开发者可访问。' }), {
      status: 403,
      headers: { 'Content-Type': 'application/json; charset=utf-8' }
    });
  }
  return new Response(
    '<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>403</title></head><body style="font-family:system-ui,-apple-system,sans-serif;display:flex;min-height:100vh;align-items:center;justify-content:center;background:#12101a;color:#eee;text-align:center"><div><h1 style="font-size:64px;margin:0">403</h1><p>网站维护中，仅开发者可访问。</p></div></body></html>',
    { status: 403, headers: { 'Content-Type': 'text/html; charset=utf-8' } }
  );
}

// ============================================================================
// 根中间件：网站维护时，不再返回 403。
// 维护期间页面与静态资源照常加载，由前端全屏渲染“网站维护中”界面，
// 只显示该界面与开发者界面（开发者模式按钮 → 后台，z-index 高于遮罩）。
// 公开 API（除 /api/state 与 /api/admin/*）维护期间拒绝，返回 JSON 而非 403。
// 开发者本人（公网IP 匹配 maintenance_admin_ip）与开发者接口直接放行。
// ============================================================================
import { getClientIp, getSetting } from './_lib.js';

const NO_STORE = 'no-store, max-age=0';

export async function onRequest({ request, next, env }) {
  const DB = env.DB;
  let maintenance = '0';
  if (DB) {
    try { maintenance = (await getSetting(DB, 'maintenance', '0')) === '1' ? '1' : '0'; } catch {}
  }
  if (maintenance !== '1') return next();

  const path = new URL(request.url).pathname;

  // 开发者本人（维护开启时记录的公网IP）放行全部，自动支持 IPv4 / IPv6
  const clientIP = getClientIp(request);
  let adminIP = '';
  if (DB) {
    try { adminIP = (await getSetting(DB, 'maintenance_admin_ip', '')) || ''; } catch {}
  }
  if (adminIP && clientIP === adminIP) return next();

  // 开发者接口：放行（各接口自行鉴权）
  if (path.startsWith('/api/admin/')) return next();
  // 客户端需要读取维护状态来渲染“网站维护中”界面
  if (path === '/api/state') return next();

  // 其余公开 API：维护期间拒绝（返回 JSON，不再 403 页面）
  if (path.startsWith('/api/')) {
    return new Response(JSON.stringify({ ok: false, error: '网站维护中，暂时无法访问。' }), {
      status: 503,
      headers: { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': NO_STORE }
    });
  }

  // 页面与静态资源：放行，由前端全屏接管
  return next();
}

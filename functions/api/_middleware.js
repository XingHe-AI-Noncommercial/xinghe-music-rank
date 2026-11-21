// ============================================================================
// 中间件：地区限制 —— 检测到外国 IP（非中国大陆）时对 API 返回 403。
// Cloudflare 在请求头 CF-IPCountry 提供 ISO 国家码（CN=中国，XX=未知）。
// 未知地区（XX）放行，避免误伤代理/未知来源；其余非 CN 一律 403。
// 说明：仅作用于 /api/*（Functions 路由范围由 public/_routes.json 决定），
// 静态资源不受影响，外国用户可加载页面但所有数据/交互请求返回 403，站点不可用。
// ============================================================================
export async function onRequest({ request, next }) {
  const country = (request.headers.get('CF-IPCountry') || '').toUpperCase();
  if (country && country !== 'CN' && country !== 'XX') {
    return new Response(JSON.stringify({ ok: false, error: '当前地区暂不支持访问。' }), {
      status: 403,
      headers: {
        'Content-Type': 'application/json; charset=utf-8',
        'Access-Control-Allow-Origin': '*'
      }
    });
  }
  return next();
}

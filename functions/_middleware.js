// ============================================================================
// 根中间件：仅中国大陆地区可访问（Cloudflare 提供 CF-IPCountry 头）。
// 已知且非 CN 的非中国大陆地区直接返回 403；无法判定（空/XX）时放行，
// 避免误伤。若该头在环境中不可用，本功能自然失效（见部署说明）。
// ============================================================================
export async function onRequest({ request, next }) {
  const country = String(request.headers.get('CF-IPCountry') || '').toUpperCase();
  if (country && country !== 'CN' && country !== 'XX') {
    return new Response('仅限中国大陆地区访问。', {
      status: 403,
      headers: { 'content-type': 'text/plain; charset=utf-8', 'cache-control': 'no-store' },
    });
  }
  return next();
}

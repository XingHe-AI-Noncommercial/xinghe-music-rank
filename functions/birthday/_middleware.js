// ============================================================================
// 中间件：地区限制 —— 生日祝福分享页同样仅限中国大陆访问（外国 IP 返回 403）。
// CF-IPCountry：CN=中国，XX=未知（放行），其余非 CN 一律 403。
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

// ===== TEMP A/B TEST: 强制所有请求 403，验证根中间件拦截静态资源 =====
export async function onRequest({ request, next }) {
  const path = new URL(request.url).pathname;
  const isApi = path.startsWith('/api/') || path.startsWith('/birthday/');
  const body = isApi
    ? JSON.stringify({ ok: false, error: 'TEST-BLOCK-ALL' })
    : '<!doctype html><html><body style="font-family:system-ui;display:flex;min-height:100vh;align-items:center;justify-content:center;background:#12101a;color:#eee"><h1>TEST-BLOCK-ALL</h1></body></html>';
  return new Response(body, {
    status: 403,
    headers: {
      'Content-Type': isApi ? 'application/json; charset=utf-8' : 'text/html; charset=utf-8',
      'Cache-Control': 'no-store, max-age=0',
      'X-Test-Block': '1'
    }
  });
}

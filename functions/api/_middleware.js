export async function onRequest({ request, next }) {
  return new Response(JSON.stringify({ ok: false, error: 'TEST-BLOCK-ALL' }), {
    status: 403, headers: { 'Content-Type': 'application/json; charset=utf-8' }
  });
}

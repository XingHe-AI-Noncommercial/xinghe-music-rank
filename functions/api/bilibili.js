// ============================================================================
// GET /api/bilibili?bvid=BVxxxx
// 服务端代取 B 站视频信息（浏览器直连被 CORS 拦，需服务端；用 Cloudflare 出口 IP）。
// 返回 title（视频名）+ author（作者名）。可能触发 B 站风控/限流，前端已提前提示。
// 限流：10 秒 10 次 / IP（防止打爆 B 站）。
// ============================================================================
import { enforceRateLimit, fail, json, rateLimitFailed } from '../_lib.js';

const API = 'https://api.bilibili.com/x/web-interface/view?bvid=';
const UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36';

export async function onRequestGet(context) {
  const { DB } = context.env;
  if (!DB) return fail('数据库尚未连接。', 503);

  const rl = await enforceRateLimit(context.env, context.request, { limit: 10 });
  if (!rl.ok) return rateLimitFailed(rl, rl.limit);

  const url = new URL(context.request.url);
  const bvid = String(url.searchParams.get('bvid') || '').trim();
  if (!/^BV[0-9A-Za-z]{8,12}$/.test(bvid)) return fail('BV 号格式不正确，请输入形如 BV1GJ411x7h7。', 400);

  try {
    const res = await fetch(API + encodeURIComponent(bvid), {
      headers: { 'User-Agent': UA, 'Referer': 'https://www.bilibili.com/', 'Accept': 'application/json' },
    });
    const data = await res.json().catch(() => null);
    if (!res.ok || !data || data.code !== 0 || !data.data) {
      const msg = data?.message || 'B站返回异常（可能触发风控），请稍后再试或手动填写。';
      return fail(String(msg).slice(0, 200), 502);
    }
    const d = data.data;
    return json({
      ok: true,
      title: String(d.title || '').slice(0, 200),
      author: String(d.owner?.name || '').slice(0, 100),
      bvid: String(d.bvid || bvid),
      pic: String(d.pic || ''),
      mid: String(d.owner?.mid || ''),
    });
  } catch {
    return fail('读取 B 站数据失败，请稍后再试或手动填写。', 502);
  }
}

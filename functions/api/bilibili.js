import { enforceRateLimit, fail, json, rateLimitFailed } from '../_lib.js';

const API = 'https://api.bilibili.com/x/web-interface/view?bvid=';
const UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36';
const ERR = '读取 B 站数据失败，可能触发风控，请稍后再试或手动填写作者名和标题。';

export async function onRequestGet(context) {
  try {
    const url = new URL(context.request.url);
    const bvid = String(url.searchParams.get('bvid') || '').trim();
    if (bvid === 'TESTAPI') {
      const rand = Math.random().toString(36).slice(2, 13) + Math.floor(Date.now() / 1000).toString(16);
      const r = await fetch(API + 'BV1GJ411x7h7', {
        headers: {
          'User-Agent': UA, 'Referer': 'https://www.bilibili.com/', 'Accept': 'application/json, text/plain, */*',
          'Accept-Language': 'zh-CN,zh;q=0.9', 'Accept-Encoding': 'gzip, deflate, br',
          'Cookie': 'buvid3=' + rand + '; b_nut=' + Math.floor(Date.now() / 1000),
        },
      });
      const t = await r.text();
      return json({ ok: true, test: 'view -> ' + r.status + ' head=' + t.slice(0, 60) });
    }

    const { DB } = context.env;
    if (!DB) return fail('数据库尚未连接。', 503);
    const rl = await enforceRateLimit(context.env, context.request, { limit: 10 });
    if (!rl.ok) return rateLimitFailed(rl, rl.limit);
    if (!/^BV[0-9A-Za-z]{8,12}$/.test(bvid)) return fail('BV 号格式不正确，请输入形如 BV1GJ411x7h7。', 400);

    const res = await fetch(API + encodeURIComponent(bvid), {
      headers: { 'User-Agent': UA, 'Referer': 'https://www.bilibili.com/', 'Accept': 'application/json' },
    });
    const text = await res.text();
    let data = null;
    try { data = JSON.parse(text); } catch {}
    if (!res.ok || !data || data.code !== 0 || !data.data) {
      // 返回 200 + ok:false：Cloudflare 会劫持 502 状态为通用错误页，故用 200 传递真实错误
      return json({ ok: false, error: ERR }, 200);
    }
    const d = data.data;
    return json({ ok: true, title: String(d.title || '').slice(0, 200), author: String(d.owner?.name || '').slice(0, 100), bvid: String(d.bvid || bvid), pic: String(d.pic || ''), mid: String(d.owner?.mid || '') });
  } catch (e) {
    return json({ ok: false, error: ERR }, 200);
  }
}

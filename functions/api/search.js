// ============================================================================
// GET /api/search?q=关键词
// 流程：1) 先查 D1 vocadb_cache 缓存；2) 未命中则请求 VocaDB 公开 API（带
//       User-Agent，fields=PVs,MainPicture 以便自动提取 B 站 BV/链接）；
//       3) 写入缓存后返回。全程强制 10 秒 / 10 次 IP 限流。
// 注意：VocaDB 可能被其托管方 Cloudflare 验证页拦截（返回 HTML），此时返回
//       友好错误；请稍后重试或改用缓存。
// ============================================================================
import { enforceRateLimit, fail, isoNow, json, normalizeBvid, rateLimitFailed } from '../_lib.js';

const VOCADB_API = 'https://vocadb.net/api/songs';
// VocaDB 要求调用方提供 User-Agent，请按需改成你的站点名 / 联系地址
const USER_AGENT = 'XingHeMusicRank/1.0 (Cloudflare Pages Function; +https://pages.cloudflare.com/)';

// 从 VocaDB PV 列表中提取 B 站 BV / 链接（自动填充播放源）
function extractBilibili(pvs) {
  if (!Array.isArray(pvs)) return { bvid: '', biliUrl: '' };
  for (const pv of pvs) {
    const url = String(pv?.url || '');
    if (url.includes('bilibili.com')) {
      const bvid = normalizeBvid(url);
      if (bvid) return { bvid, biliUrl: url };
    }
  }
  return { bvid: '', biliUrl: '' };
}

function pickCover(raw) {
  return String(
    raw?.defaultThumbUrl
    || raw?.thumbUrl
    || raw?.mainPicture?.url
    || raw?.mainPicture?.urlThumb
    || raw?.mainPicture?.urlSmall
    || ''
  ).trim();
}

export async function onRequestGet(context) {
  const { DB } = context.env;
  if (!DB) return fail('数据库尚未连接：请配置 D1 绑定 DB。', 503);

  const rl = await enforceRateLimit(context.env, context.request);
  if (!rl.ok) return rateLimitFailed(rl, rl.limit);

  const url = new URL(context.request.url);
  const q = (url.searchParams.get('q') || '').trim();
  if (!q) return json({ ok: true, query: '', cached: false, source: 'cache', items: [] });
  if (q.length > 100) return fail('搜索关键词过长。', 400);

  try {
    // 1) 先查 D1 缓存
    const cached = await DB.prepare(
      'SELECT id, title, artist, cover_url, bvid, bili_url FROM vocadb_cache WHERE title LIKE ? ORDER BY updated_at DESC LIMIT 20'
    ).bind(`%${q}%`).all();

    if (cached.results && cached.results.length > 0) {
      return json({
        ok: true,
        query: q,
        cached: true,
        source: 'cache',
        items: cached.results.map(it => ({
          id: it.id,
          title: it.title,
          artist: it.artist || '未知创作者',
          coverUrl: it.cover_url || '',
          bvid: it.bvid || '',
          biliUrl: it.bili_url || '',
        })),
      });
    }

    // 2) 请求 VocaDB 公开 API（带 PVs/MainPicture 以自动提取封面与 B 站源）
    const params = new URLSearchParams({ query: q, start: '0', maxResults: '12', lang: 'zh-CN', fields: 'PVs,MainPicture,ArtistString' });
    const res = await fetch(`${VOCADB_API}?${params.toString()}`, {
      headers: { 'user-agent': USER_AGENT, accept: 'application/json' },
    });

    const contentType = res.headers.get('content-type') || '';
    if (!contentType.includes('application/json')) {
      // VocaDB 被其托管方 Cloudflare 验证页拦截（返回 HTML）
      return fail('VocaDB 暂被要求浏览器验证，请稍后重试（搜索会尽量使用本地缓存）。', 502);
    }
    if (!res.ok) return fail(`VocaDB 服务暂时不可用（HTTP ${res.status}），请稍后再试。`, 502);

    const data = await res.json();
    const items = (data?.items || [])
      .map(raw => {
        const { bvid, biliUrl } = extractBilibili(raw?.pvs);
        return {
          id: String(raw?.id ?? ''),
          title: String(raw?.name ?? '').trim(),
          artist: String(raw?.artistString ?? raw?.artist ?? '').trim() || '未知创作者',
          coverUrl: pickCover(raw),
          bvid,
          biliUrl,
        };
      })
      .filter(it => it.id && it.title)
      .slice(0, 12);

    // 3) 写入缓存
    if (items.length > 0) {
      const now = isoNow();
      const stmts = items.map(it => DB.prepare(
        `INSERT INTO vocadb_cache(id, title, artist, cover_url, bvid, bili_url, updated_at) VALUES(?, ?, ?, ?, ?, ?, ?)
         ON CONFLICT(id) DO UPDATE SET title=excluded.title, artist=excluded.artist,
           cover_url=excluded.cover_url, bvid=excluded.bvid, bili_url=excluded.bili_url, updated_at=excluded.updated_at`
      ).bind(it.id, it.title, it.artist, it.coverUrl, it.bvid, it.biliUrl, now));
      await DB.batch(stmts);
    }

    return json({ ok: true, query: q, cached: false, source: 'vocadb', items });
  } catch (error) {
    return fail(error?.message || '搜索失败，请稍后重试。', 500);
  }
}

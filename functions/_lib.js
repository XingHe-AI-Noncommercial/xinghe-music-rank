// ============================================================================
// 星河音浪榜 · 共享工具库
// 规则：每人每天 30 票；对同一作品每天最多 15 票；提交需审核。
// 包含：JSON 响应、访客 Cookie、IP 限流、BV 规范化、曲目插入、管理员会话
// ============================================================================

export const DAILY_VOTES = 30;     // 每人每天总票数上限
export const SONG_VOTE_CAP = 15;   // 对同一作品每天最多票数

export const isoNow = () => new Date().toISOString();
export const makeId = () => crypto.randomUUID();

// 北京时间日期（用于每日票数重置）
export function beijingDay(date = new Date()) {
  const d = new Date(date.getTime() + 8 * 60 * 60 * 1000);
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, '0')}-${String(d.getUTCDate()).padStart(2, '0')}`;
}

// 统一 JSON 响应
export function json(data, status = 200, extraHeaders = {}) {
  const headers = new Headers({
    'content-type': 'application/json; charset=utf-8',
    'cache-control': 'no-store',
    'x-content-type-options': 'nosniff',
    ...extraHeaders,
  });
  return new Response(JSON.stringify(data), { status, headers });
}

export function fail(message, status = 400, extraHeaders = {}) {
  return json({ ok: false, error: message }, status, extraHeaders);
}

export async function readBody(request) {
  try { return await request.json(); } catch { return null; }
}

// ----------------------------------------------------------------------------
// 匿名访客身份：基于 HttpOnly Cookie，无需注册 / 登录
// ----------------------------------------------------------------------------
export async function getViewer(context) {
  let id = cookieValue(context.request, 'xh_vid');
  let fresh = false;
  if (!id || !/^[a-f0-9-]{32,36}$/i.test(id)) {
    id = makeId();
    fresh = true;
  }
  const cookie = fresh ? `xh_vid=${encodeURIComponent(id)}; Path=/; HttpOnly; Secure; SameSite=Lax; Max-Age=31536000` : null;
  return { id, cookie };
}

// ----------------------------------------------------------------------------
// 客户端 IP 识别（优先使用 Cloudflare 提供的真实 IP）
// ----------------------------------------------------------------------------
export function getClientIp(request) {
  const cf = request.headers.get('CF-Connecting-IP');
  if (cf) return cf.trim();
  const forwarded = request.headers.get('X-Forwarded-For');
  if (forwarded) return forwarded.split(',')[0].trim();
  const realIp = request.headers.get('X-Real-IP');
  if (realIp) return realIp.trim();
  return 'unknown';
}

// ----------------------------------------------------------------------------
// API 频率限制：每个 IP 每 10 秒最多 10 次（可通过参数覆盖）
// 返回：{ ok, ip, remaining, limit, retryAfter }
// ----------------------------------------------------------------------------
export async function enforceRateLimit(env, request, options = {}) {
  const limit = Number(options.limit) || 10;
  const windowSeconds = Number(options.windowSeconds) || 10;
  const db = env?.DB;
  const ip = getClientIp(request);
  if (!db) return { ok: true, ip, remaining: limit, limit };

  const nowMs = Date.now();
  const windowMs = windowSeconds * 1000;
  const now = isoNow();

  const row = await db.prepare('SELECT request_count, last_request_at FROM rate_limits WHERE ip = ?').bind(ip).first();
  if (!row) {
    await db.prepare('INSERT INTO rate_limits(ip, request_count, last_request_at) VALUES(?, 1, ?)').bind(ip, now).run();
    return { ok: true, ip, remaining: limit - 1, limit };
  }

  const lastMs = new Date(String(row.last_request_at)).getTime() || 0;
  const used = Number(row.request_count || 0);

  if (nowMs - lastMs < windowMs) {
    if (used >= limit) {
      return { ok: false, ip, remaining: 0, limit, retryAfter: Math.max(1, Math.ceil((windowMs - (nowMs - lastMs)) / 1000)) };
    }
    await db.prepare('UPDATE rate_limits SET request_count = request_count + 1, last_request_at = ? WHERE ip = ?').bind(now, ip).run();
    return { ok: true, ip, remaining: limit - used - 1, limit };
  }

  await db.prepare('UPDATE rate_limits SET request_count = 1, last_request_at = ? WHERE ip = ?').bind(now, ip).run();
  return { ok: true, ip, remaining: limit - 1, limit };
}

export function rateLimitFailed(result, limit = 10) {
  const retryAfter = Number(result?.retryAfter) || 10;
  const message = `请求过于频繁：每个 IP 每 10 秒最多 ${limit} 次，请 ${retryAfter} 秒后再试。`;
  return json({ ok: false, error: message, retryAfter }, 429, { 'retry-after': String(retryAfter) });
}

// ----------------------------------------------------------------------------
// B 站 BV 号 / 链接规范化
// ----------------------------------------------------------------------------
export function normalizeBvid(value) {
  const raw = String(value || '').trim();
  const match = raw.match(/BV[0-9A-Za-z]+/);
  if (match) return match[0];
  return /^BV[0-9A-Za-z]{6,}$/.test(raw) ? raw : '';
}

export function normalizeBiliUrl(value, bvid = '') {
  let raw = String(value || '').trim();
  if (!raw && bvid) return `https://www.bilibili.com/video/${bvid}`;
  const bv = normalizeBvid(raw);
  if (bv && raw.startsWith('BV')) return `https://www.bilibili.com/video/${bv}`;
  return raw;
}

// ----------------------------------------------------------------------------
// 曲目插入（submit.js 与 admin 共用）
// status：'pending' | 'approved' | 'rejected'
// 返回 { ok, id, ... } 或 { ok:false, error }
// ----------------------------------------------------------------------------
export async function insertSong(db, data = {}, status = 'pending') {
  const title = String(data.title || '').trim();
  const artist = String(data.artist || '').trim() || '未知创作者';
  const coverUrl = String(data.coverUrl || data.cover_url || '').trim();
  const bvid = normalizeBvid(data.bvid || '');
  const biliUrl = normalizeBiliUrl(data.biliUrl || data.bili_url || '', bvid);

  if (!title) return { ok: false, error: '歌名不能为空。' };
  if (title.length > 100) return { ok: false, error: '歌名最多 100 个字。' };
  if (artist.length > 100) return { ok: false, error: '歌手 / 创作者最多 100 个字。' };
  if (!bvid) return { ok: false, error: '该曲目没有可用的 B 站视频源（未自动匹配到 BV 号），无法收录。' };
  if (!biliUrl || !/^https?:\/\//i.test(biliUrl)) return { ok: false, error: 'B 站链接无效。' };
  if (!biliUrl.includes('bilibili.com')) return { ok: false, error: 'B 站链接必须指向 bilibili.com。' };

  // 同一 BV 号在 pending/approved 中只允许一条
  const dup = await db.prepare("SELECT id FROM songs WHERE bvid = ? AND status != 'rejected'").bind(bvid).first();
  if (dup) return { ok: false, error: '这个 B 站视频已经存在（待审核或已收录）。' };

  const id = makeId();
  const now = isoNow();
  const approved = status === 'approved';
  await db.prepare(
    `INSERT INTO songs(id, title, artist, cover_url, bvid, bili_url, status, votes, created_at, reviewed_at, reviewed_by)
     VALUES(?, ?, ?, ?, ?, ?, ?, 0, ?, ?, ?)`
  ).bind(id, title, artist, coverUrl, bvid, biliUrl, approved ? 'approved' : status, now, approved ? now : null, approved ? '星河' : null).run();

  return { ok: true, id, title, artist, coverUrl, bvid, biliUrl, status: approved ? 'approved' : status };
}

// ----------------------------------------------------------------------------
// 管理员会话（登录后使用 HttpOnly Cookie）
// ----------------------------------------------------------------------------
function base64Url(bytes) {
  let binary = '';
  for (const b of new Uint8Array(bytes)) binary += String.fromCharCode(b);
  return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/g, '');
}

async function hmac(value, secret) {
  const key = await crypto.subtle.importKey('raw', new TextEncoder().encode(secret), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
  return base64Url(await crypto.subtle.sign('HMAC', key, new TextEncoder().encode(value)));
}

export function cookieValue(request, name) {
  const raw = request.headers.get('cookie') || '';
  for (const part of raw.split(';')) {
    const index = part.indexOf('=');
    if (index < 0) continue;
    if (part.slice(0, index).trim() === name) return decodeURIComponent(part.slice(index + 1).trim());
  }
  return null;
}

export async function makeAdminCookie(env) {
  if (!env.ADMIN_SESSION_SECRET) throw new Error('后台会话密钥未配置');
  const expiry = String(Math.floor(Date.now() / 1000) + 12 * 60 * 60);
  const token = `${expiry}.${await hmac(expiry, env.ADMIN_SESSION_SECRET)}`;
  return `xh_admin=${encodeURIComponent(token)}; Path=/; HttpOnly; Secure; SameSite=Strict; Max-Age=43200`;
}

export async function isAdmin(request, env) {
  if (!env.ADMIN_SESSION_SECRET) return false;
  const token = cookieValue(request, 'xh_admin');
  if (!token) return false;
  const dot = token.indexOf('.');
  if (dot < 1) return false;
  const expiry = token.slice(0, dot);
  if (!/^\d+$/.test(expiry) || Number(expiry) < Math.floor(Date.now() / 1000)) return false;
  const expected = await hmac(expiry, env.ADMIN_SESSION_SECRET);
  const actual = token.slice(dot + 1);
  if (actual.length !== expected.length) return false;
  let diff = 0;
  for (let i = 0; i < actual.length; i++) diff |= actual.charCodeAt(i) ^ expected.charCodeAt(i);
  return diff === 0;
}

export async function adminOnly(context) {
  return isAdmin(context.request, context.env);
}

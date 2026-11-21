// ============================================================================
// 星河音浪榜 · 精简版 v4 公共库
//   规则：每周一清空；普通访客每天每 IP 最多投稿 1 个；
//         开发者审核通过才上架；开发者上架不限次数；API 限流 10 秒 / 10 次。
// ============================================================================

export const RATE_LIMIT_WINDOW = 10;  // 秒
export const RATE_LIMIT_MAX = 10;     // 请求数
export const MAX_TITLE = 100;
export const MAX_ARTIST = 100;

// ---------- 时间 ----------
export function isoNow() {
  return new Date().toISOString();
}

export function makeId() {
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, c => {
    const r = (Math.random() * 16) | 0;
    return (c === 'x' ? r : (r & 0x3) | 0x8).toString(16);
  });
}

// 北京时间当天日期 YYYY-MM-DD
export function beijingDay(now = new Date()) {
  return new Date(now.getTime() + 8 * 3600e3).toISOString().slice(0, 10);
}

// 北京时间“本周一”日期 YYYY-MM-DD（周一为每周第一天）
export function mondayOfBeijing(now = new Date()) {
  const utc = new Date(now.getTime() + 8 * 3600e3);
  const weekday = utc.getUTCDay();               // 0=周日 … 6=周六
  const offset = (weekday + 6) % 7;              // 距本周一的天数
  const monday = new Date(Date.UTC(utc.getUTCFullYear(), utc.getUTCMonth(), utc.getUTCDate() - offset));
  return monday.toISOString().slice(0, 10);
}

// 每周一清空：若 settings.week_key 不是本周一，则清空全部歌曲并记录。
// 返回 true 表示本次发生了清空。每个 API 入口调用一次，幂等。
export async function ensureWeek(DB) {
  const week = mondayOfBeijing();
  const row = await DB.prepare("SELECT value FROM settings WHERE key = 'week_key'").first();
  if (row?.value === week) return false;
  await DB.batch([
    DB.prepare("DELETE FROM songs").run(),
    DB.prepare("INSERT INTO settings(key, value) VALUES('week_key', ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value").bind(week).run(),
  ]);
  return true;
}

// ---------- settings 工具（维护开关等，复用已有 settings 表，不改表结构） ----------
export async function getSetting(DB, key, def = '') {
  try {
    const row = await DB.prepare('SELECT value FROM settings WHERE key = ?').bind(key).first();
    return row?.value ?? def;
  } catch { return def; }
}

export async function setSetting(DB, key, value) {
  await DB.prepare("INSERT INTO settings(key, value) VALUES(?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value")
    .bind(key, String(value)).run();
}

export async function isMaintenanceOn(DB) {
  return (await getSetting(DB, 'maintenance', '0')) === '1';
}

// ---------- 公告栏（复用 settings 表存 JSON，无需改 SQL） ----------
const MAX_ANNOUNCEMENTS = 30;

export async function getAnnouncements(DB) {
  const raw = await getSetting(DB, 'announcements', '[]');
  try {
    const arr = JSON.parse(raw);
    return Array.isArray(arr) ? arr : [];
  } catch { return []; }
}

export async function setAnnouncements(DB, list) {
  await setSetting(DB, 'announcements', JSON.stringify(list.slice(0, MAX_ANNOUNCEMENTS)));
}

export async function addAnnouncement(DB, text, author = '管理员') {
  const list = await getAnnouncements(DB);
  const item = { id: makeId(), text: String(text).slice(0, 500), createdAt: isoNow(), author: String(author || '管理员') };
  list.unshift(item);
  await setAnnouncements(DB, list);
  return item;
}

export async function removeAnnouncement(DB, id) {
  const list = await getAnnouncements(DB);
  const next = list.filter(a => a.id !== id);
  if (next.length === list.length) return false;
  await setAnnouncements(DB, next);
  return true;
}

// ---------- IP 封禁（复用 settings 表存 JSON；until=0 表示永久，到点自动失效） ----------
export async function getBans(DB) {
  const raw = await getSetting(DB, 'bans', '[]');
  try { const arr = JSON.parse(raw); return Array.isArray(arr) ? arr : []; } catch { return []; }
}

export async function setBans(DB, list) {
  await setSetting(DB, 'bans', JSON.stringify(list.slice(0, 500)));
}

export async function addBan(DB, ip, until, reason = '') {
  const now = Date.now();
  const list = (await getBans(DB)).filter(b => b.ip !== ip && (b.until === 0 || b.until > now));
  const item = { ip: String(ip || '').trim(), until: Number(until) || 0, reason: String(reason || '').slice(0, 200), createdAt: isoNow() };
  if (!item.ip) return null;
  list.unshift(item);
  await setBans(DB, list);
  return item;
}

export async function removeBan(DB, ip) {
  const list = await getBans(DB);
  const next = list.filter(b => b.ip !== ip);
  if (next.length === list.length) return false;
  await setBans(DB, next);
  return true;
}

export async function getBan(DB, ip) {
  const now = Date.now();
  return (await getBans(DB)).find(b => b.ip === ip && (b.until === 0 || b.until > now)) || null;
}

// ---------- 全局 60 秒请求计数：超过 60 次自动开启维护 ----------
export async function bumpRequestCounter(DB) {
  try {
    const raw = await getSetting(DB, 'req_counter', '{"count":0,"start":0}');
    let o = { count: 0, start: Date.now() };
    try { const p = JSON.parse(raw); if (p && typeof p.count === 'number') o = p; } catch {}
    const now = Date.now();
    if (now - o.start > 60000) { o.count = 0; o.start = now; }
    o.count += 1;
    await setSetting(DB, 'req_counter', JSON.stringify({ count: o.count, start: o.start }));
    if (o.count > 60) { await setSetting(DB, 'maintenance', '1'); return true; }
    return false;
  } catch { return false; }
}

// ---------- 访客收件箱（复用 settings 表，按 IP 存 JSON 消息；无 SQL 改动） ----------
export async function getInbox(DB, ip) {
  const raw = await getSetting(DB, 'inbox:' + ip, '[]');
  try { const arr = JSON.parse(raw); return Array.isArray(arr) ? arr : []; } catch { return []; }
}

export async function setInbox(DB, ip, list) {
  await setSetting(DB, 'inbox:' + ip, JSON.stringify(list.slice(0, 100)));
}

export async function addInboxMessage(DB, ip, title, body) {
  if (!ip) return;
  const list = await getInbox(DB, ip);
  list.unshift({ id: makeId(), title: String(title || '').slice(0, 80), body: String(body || '').slice(0, 1000), createdAt: isoNow(), read: false });
  await setInbox(DB, ip, list);
}

export async function markInboxRead(DB, ip, id) {
  const list = await getInbox(DB, ip);
  const item = list.find(m => m.id === id);
  if (item) { item.read = true; await setInbox(DB, ip, list); }
  return Boolean(item);
}

// ---------- 生日祝福（settings.birthdays，JSON 数组；无需建表） ----------
const BDAY_CHARS = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
export function makeBirthdayToken() {
  let t = '';
  const arr = new Uint32Array(16);
  crypto.getRandomValues(arr);
  for (let i = 0; i < 16; i++) t += BDAY_CHARS[arr[i] % BDAY_CHARS.length];
  return t;
}
export async function getBirthdays(DB) {
  const raw = await getSetting(DB, 'birthdays', '[]');
  let arr; try { arr = JSON.parse(raw); } catch { arr = []; }
  if (!Array.isArray(arr)) arr = [];
  // 生日链接保留到用户手动删除（倒计时需要跨天存活）；每日不再自动清理
  return arr;
}
export async function setBirthdays(DB, list) {
  await setSetting(DB, 'birthdays', JSON.stringify(list.slice(0, 200)));
}
export async function addBirthday(DB, { name, message, style, theme, birthday }) {
  const list = await getBirthdays(DB);
  let token; do { token = makeBirthdayToken(); } while (list.some(b => b.token === token));
  const item = {
    id: makeId(), token,
    name: String(name || '').slice(0, 20),
    message: String(message || '').slice(0, 80),
    birthday: /^\d{2}-\d{2}$/.test(String(birthday || '')) ? String(birthday) : '',
    style: ['classic', 'starry', 'pastel', 'forest', 'ocean', 'neon'].includes(style) ? style : 'classic',
    theme: theme && typeof theme === 'object' ? JSON.stringify(theme).slice(0, 500000) : '',
    createdAt: isoNow(), visits: 0, disabled: false,
  };
  list.unshift(item);
  await setBirthdays(DB, list);
  return item;
}
export async function getBirthdayByToken(DB, token) {
  const list = await getBirthdays(DB);
  const item = list.find(b => b.token === token) || null;
  // 已关停的链接视为失效
  return item && item.disabled ? null : item;
}
export async function setBirthdayDisabled(DB, id, disabled) {
  const list = await getBirthdays(DB);
  const item = list.find(b => b.id === id);
  if (!item) return null;
  item.disabled = disabled === true || disabled === 'true';
  await setBirthdays(DB, list);
  return item;
}
export async function bumpBirthdayVisit(DB, token) {
  const list = await getBirthdays(DB);
  const item = list.find(b => b.token === token);
  if (!item) return null;
  item.visits = (item.visits || 0) + 1;
  await setBirthdays(DB, list);
  return item;
}

// ---------- 访客国家码（Cloudflare CF-IPCountry 头） ----------
export function countryCode(request) {
  return String(request.headers.get('CF-IPCountry') || '').toUpperCase();
}

// ---------- 响应工具 ----------
// 注意：set-cookie 必须直接放在 Response 构造函数的 headers 对象里（Cloudflare
// 官方可靠写法）；不要用 new Headers() 再 append('set-cookie')，部分运行时会把
// set-cookie 当作禁用响应头静默丢弃，导致登录后 Cookie 未写入、随即被弹回。
export function json(data, status = 200, extraHeaders = undefined) {
  const headers = {
    'content-type': 'application/json; charset=utf-8',
    'cache-control': 'no-store',
    'x-content-type-options': 'nosniff',
  };
  if (extraHeaders && typeof extraHeaders === 'object') {
    for (const [key, value] of Object.entries(extraHeaders)) {
      if (value !== undefined && value !== null) headers[key] = value;
    }
  }
  return new Response(JSON.stringify(data), { status, headers });
}

export function fail(message, status = 400, extraHeaders = undefined) {
  return json({ ok: false, error: message }, status, extraHeaders);
}

export async function readBody(request) {
  const text = await request.text();
  if (!text) return {};
  try { return JSON.parse(text); } catch { return {}; }
}

// ---------- 客户端 IP ----------
export function getClientIp(request) {
  const header = request.headers.get('CF-Connecting-IP')
    || (request.headers.get('X-Forwarded-For') || '').split(',')[0].trim()
    || request.headers.get('X-Real-IP')
    || 'unknown';
  return String(header).slice(0, 64);
}

// ---------- API 频率限制：每个 IP 每 10 秒最多 10 次 ----------
export async function enforceRateLimit(env, request, options = {}) {
  const limit = Number(options.limit) || RATE_LIMIT_MAX;
  const windowSeconds = Number(options.windowSeconds) || RATE_LIMIT_WINDOW;
  const ip = getClientIp(request);
  const now = Date.now();
  const windowMs = windowSeconds * 1000;
  const DB = env.DB;
  if (!DB) return { ok: true, ip, remaining: limit, limit }; // 无库则放行（由各接口自行处理）

  const row = await DB.prepare("SELECT request_count, last_request_at FROM rate_limits WHERE ip = ?").bind(ip).first();
  const lastAt = row?.last_request_at ? Number(row.last_request_at) : 0;
  const count = Number(row?.request_count || 0);

  if (now - lastAt > windowMs) {
    await DB.prepare(
      "INSERT INTO rate_limits(ip, request_count, last_request_at) VALUES(?, 1, ?) ON CONFLICT(ip) DO UPDATE SET request_count = 1, last_request_at = excluded.last_request_at"
    ).bind(ip, String(now)).run();
    return { ok: true, ip, remaining: limit - 1, limit };
  }

  if (count >= limit) {
    const retryAfter = Math.max(1, Math.ceil((lastAt + windowMs - now) / 1000));
    return { ok: false, ip, limit, retryAfter };
  }

  await DB.prepare(
    "UPDATE rate_limits SET request_count = request_count + 1, last_request_at = ? WHERE ip = ?"
  ).bind(String(now), ip).run();
  return { ok: true, ip, remaining: limit - count - 1, limit };
}

export function rateLimitFailed(result, limit = RATE_LIMIT_MAX) {
  const retryAfter = Number(result?.retryAfter) || RATE_LIMIT_WINDOW;
  const message = `请求过于频繁：每个 IP 每 ${RATE_LIMIT_WINDOW} 秒最多 ${limit} 次，请 ${retryAfter} 秒后再试。`;
  return json({ ok: false, error: message, retryAfter }, 429, { 'retry-after': String(retryAfter) });
}

// ---------- BV 号工具 ----------
// 从任意输入中提取 BV 号（兼容直接 BV 号或含 BV 的 B 站链接）
export function normalizeBvid(input) {
  const s = String(input || '').trim();
  const m = s.match(/bv[0-9a-z]+/i); // 前缀 bv/BV 均可，大小写不敏感
  if (!m) return '';
  return 'BV' + m[0].slice(2); // 前缀规范为 BV，其余字符（含小写）保留
}

export function normalizeBiliUrl(bvid) {
  const b = normalizeBvid(bvid);
  return b ? `https://www.bilibili.com/video/${b}` : '';
}

// 掩码 BV 号：BV 后面的随机字符全部替换成 X（对外一律不给真实编号）
// 例：输入真实 BV → 掩码 BVXXXXXXXXXX
export function maskBvid(bvid) {
  const b = normalizeBvid(bvid);
  if (!b) return '';
  return 'BV' + 'X'.repeat(Math.max(0, b.length - 2));
}

// ---------- 投稿校验 ----------
// { bvid, artist, title } → { ok, bvid, title, artist } | { ok:false, error }
// 注意：bvid 为数据库存储用的真实编号（供去重）；对外返回时统一用 maskBvid 掩码。
export function validateSubmission(data = {}) {
  const raw = String(data?.bvid || '').trim();
  // 禁止粘贴链接：只接受裸 BV 号
  if (/https?:\/\/|bilibili\.com|哔哩/i.test(raw)) {
    return { ok: false, error: '请只输入 BV 号（如 BVXXXXXXXXXX），不要粘贴 B 站链接。' };
  }
  const bvid = normalizeBvid(raw);
  if (!bvid) return { ok: false, error: 'BV 号格式不对，应形如 BVXXXXXXXXXX（无需粘贴链接）。' };

  const title = String(data?.title || '').trim();
  if (!title) return { ok: false, error: '请填写视频名。' };
  if (title.length > MAX_TITLE) return { ok: false, error: `视频名过长（最多 ${MAX_TITLE} 字）。` };

  const artist = String(data?.artist || '').trim() || '未知创作者';
  if (artist.length > MAX_ARTIST) return { ok: false, error: `作者名过长（最多 ${MAX_ARTIST} 字）。` };

  return { ok: true, bvid, title, artist };
}

// ---------- 插入歌曲（带审核状态） ----------
// status: 'pending'（用户投稿，待审核）/ 'approved'（开发者上架，直接通过）
export async function insertSong(DB, data, status = 'pending', meta = {}) {
  const v = validateSubmission(data);
  if (!v.ok) return { ok: false, error: v.error };

  // 同一 BV 号只允许一条（含待审核与已上架；被拒的可重新提交）
  const existing = await DB.prepare("SELECT id FROM songs WHERE bvid = ? AND status != 'rejected'").bind(v.bvid).first();
  if (existing) return { ok: false, error: '这个 BV 号已经在队列 / 上架列表里了（含待审核）。' };

  const id = makeId();
  const now = isoNow();
  await DB.prepare(
    `INSERT INTO songs(id, bvid, artist, title, status, submitter_ip, day, created_at, reviewed_at, reviewed_by)
     VALUES(?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
  ).bind(
    id, v.bvid, v.artist, v.title, status,
    meta?.submitterIp || null, meta?.day || null, now,
    status === 'approved' ? now : null,
    status === 'approved' ? '开发者' : null
  ).run();
  return { ok: true, id, bvid: v.bvid };
}

// ---------- 管理员会话（密码存 Cloudflare Secret，前端不可见） ----------
export function cookieValue(name, value, options = {}) {
  const parts = [`${name}=${encodeURIComponent(value)}`, 'Path=/', 'HttpOnly', 'SameSite=Lax'];
  // 只有明确 secure===true 才加 Secure，避免 http 环境下 Secure Cookie 不被存储
  if (options.secure === true) parts.push('Secure');
  if (options.maxAge) parts.push(`Max-Age=${options.maxAge}`);
  return parts.join('; ');
}

async function hmac(secret, message) {
  const enc = new TextEncoder();
  const key = await crypto.subtle.importKey('raw', enc.encode(secret), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
  const sig = await crypto.subtle.sign('HMAC', key, enc.encode(message));
  return Array.from(new Uint8Array(sig)).map(b => b.toString(16).padStart(2, '0')).join('');
}

// 读取密钥配置：优先 SYSTEM_*，兜底 ADMIN_*（兼容两种命名）
export function resolveSecret(env, primary, fallback) {
  return String(env[primary] || env[fallback] || '');
}

export async function makeAdminCookie(env, options = {}) {
  const secret = resolveSecret(env, 'SYSTEM_SESSION_SECRET', 'ADMIN_SESSION_SECRET');
  if (!secret) throw new Error('未配置会话密钥（SYSTEM_SESSION_SECRET / ADMIN_SESSION_SECRET，请在 Cloudflare Secret 中设置）。');
  const ttlSeconds = options.ttlSeconds || 6 * 3600;
  const secure = options.secure === true;
  const payload = `${Date.now()}|${Math.random().toString(36).slice(2)}`;
  const sig = await hmac(secret, payload);
  return { value: `${payload}.${sig}`, cookie: cookieValue('xh_admin', `${payload}.${sig}`, { secure, maxAge: ttlSeconds }) };
}

export async function isAdmin(request, env) {
  const secret = resolveSecret(env, 'SYSTEM_SESSION_SECRET', 'ADMIN_SESSION_SECRET');
  if (!secret) return false;
  // 1) 首选：xh_admin Cookie
  const cookie = request.headers.get('cookie') || '';
  let token = (cookie.match(/(?:^|;\s*)xh_admin=([^;]+)/) || [])[1] || '';
  // 2) 兜底：Authorization: Bearer <token>（无痕/浏览器拦截 Cookie 时仍可登录）
  if (!token) {
    const am = (request.headers.get('authorization') || '').match(/^Bearer\s+(.+)$/i);
    if (am) token = am[1];
  }
  if (!token) return false;
  let decoded;
  try { decoded = decodeURIComponent(token); } catch { return false; }
  const parts = decoded.split('.');
  if (parts.length !== 2) return false;
  const [payload, sig] = parts;
  const expect = await hmac(secret, payload);
  if (sig !== expect) return false;
  const ts = Number(payload.split('|')[0]);
  if (!ts || Date.now() - ts > 6 * 3600 * 1000) return false;
  return true;
}

export async function adminOnly(context) {
  if (!(await isAdmin(context.request, context.env))) {
    return fail('请先登录开发者模式。', 401);
  }
  return null;
}

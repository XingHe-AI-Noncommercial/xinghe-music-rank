// ============================================================================
// POST /api/admin/import
// 批量导入歌曲。支持两种格式：
//   JSON：数组 [{ title, artist, coverUrl, bvid, biliUrl }] 或 { songs: [...] }
//   TXT ：每行 歌名,歌手,封面URL,BV号,B站链接 （歌名可含逗号，自动识别）
// 需管理员登录，同样限流。最多一次 200 条。
// ============================================================================
import { enforceRateLimit, fail, insertSong, isAdmin, json, rateLimitFailed, readBody } from '../../_lib.js';

function parseTxt(text) {
  const lines = String(text || '').split(/\r?\n/).map(l => l.trim()).filter(Boolean);
  const rows = [];
  for (const line of lines) {
    if (line.startsWith('#')) continue; // 支持 # 注释
    const parts = line.split(/[，,]/).map(p => p.trim());
    if (parts.length < 5) continue;
    // 跳过表头行（歌名/标题 开头）
    if (/^(歌名|标题|title|name)$/i.test(parts[0])) continue;
    let title, artist, cover, bvid, bili;
    if (parts.length === 5) {
      [title, artist, cover, bvid, bili] = parts;
    } else {
      // 歌名可能含逗号：把前 n-4 段拼回歌名
      title = parts.slice(0, parts.length - 4).join(',');
      artist = parts[parts.length - 4];
      cover = parts[parts.length - 3];
      bvid = parts[parts.length - 2];
      bili = parts[parts.length - 1];
    }
    rows.push({ title, artist, coverUrl: cover, bvid, biliUrl: bili });
  }
  return rows;
}

function parseJson(text) {
  const data = JSON.parse(text);
  const arr = Array.isArray(data) ? data : (data?.songs || data?.items || []);
  if (!Array.isArray(arr)) throw new Error('JSON 应为数组或含 songs/items 字段的对象。');
  return arr.map(it => ({
    title: String(it?.title || it?.name || ''),
    artist: String(it?.artist || it?.artistString || ''),
    coverUrl: String(it?.coverUrl || it?.cover_url || it?.cover || ''),
    bvid: String(it?.bvid || ''),
    biliUrl: String(it?.biliUrl || it?.bili_url || ''),
  }));
}

export async function onRequestPost(context) {
  if (!(await isAdmin(context.request, context.env))) return fail('请先登录后台。', 401);

  const rl = await enforceRateLimit(context.env, context.request);
  if (!rl.ok) return rateLimitFailed(rl, rl.limit);

  const DB = context.env.DB;
  if (!DB) return fail('数据库尚未连接。', 503);

  const body = await readBody(context.request);
  const format = String(body?.format || '').toLowerCase();
  const content = String(body?.content || '');

  let rows = [];
  try {
    if (format === 'json') rows = parseJson(content);
    else if (format === 'txt') rows = parseTxt(content);
    else return fail('请选择 JSON 或 TXT 格式。', 400);
  } catch (e) {
    return fail('文件解析失败：' + (e?.message || '格式错误。'), 400);
  }

  rows = rows.slice(0, 200);
  if (!rows.length) return fail('没有可导入的数据。', 400);

  let imported = 0, skipped = 0;
  const errors = [];
  for (const row of rows) {
    // 管理员导入 = 已审核通过，直接进入收藏列表
    const result = await insertSong(DB, row, 'approved');
    if (result.ok) imported += 1;
    else {
      skipped += 1;
      if (errors.length < 20) errors.push({ title: row.title || '(空)', error: result.error });
    }
  }

  return json({
    ok: true,
    message: `导入完成：成功 ${imported} 条，跳过 ${skipped} 条。`,
    imported,
    skipped,
    errors,
  });
}

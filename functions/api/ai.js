// ============================================================================
// POST /api/ai
// 每用户私有 AI 中转：浏览器把 { base, key, model, ... } 发来，本站临时转发到
// 用户自己的 OpenAI 兼容接口。key 只在本次请求里使用，绝不落库、不记录、不共享。
// 支持文本主题（/chat/completions）与原创插画（/images/generations）。
// ============================================================================
import { enforceRateLimit, fail, json, rateLimitFailed, readBody } from '../_lib.js';

function validHost(host) {
  if (!host) return false;
  if (/^(localhost|127\.|0\.0\.0\.0|192\.168\.|10\.|172\.(1[6-9]|2\d|3[01])\.|\[::1\])$/.test(host)) return false;
  return true;
}

export async function onRequestPost(context) {
  const rl = await enforceRateLimit(context.env, context.request);
  if (!rl.ok) return rateLimitFailed(rl, rl.limit);

  let body;
  try { body = await readBody(context.request); } catch { return fail('请求体无效。', 400); }
  const base = String(body?.base || '').trim().replace(/\/+$/, '');
  const key = String(body?.key || '').trim();
  const model = String(body?.model || '').trim();
  if (!base || !/^https:\/\//.test(base)) return fail('接口地址无效：需以 https:// 开头（如 https://api.deepseek.com/v1）。', 400);
  if (!key) return fail('缺少 API Key。', 400);

  let upstream, payload;
  if (body?.image) {
    if (!model) return fail('图片模型名不能为空。', 400);
    const prompt = String(body?.prompt || '').slice(0, 1200);
    if (!prompt) return fail('缺少图片提示词。', 400);
    upstream = base + '/images/generations';
    payload = { model, prompt, n: 1, size: String(body?.size || '1024x1024') };
  } else {
    if (!model) return fail('缺少模型名。', 400);
    const messages = body?.messages;
    if (!Array.isArray(messages) || !messages.length) return fail('缺少对话内容。', 400);
    upstream = base + '/chat/completions';
    payload = { model, messages, temperature: typeof body?.temperature === 'number' ? body.temperature : 0.9 };
    if (body?.response_format) payload.response_format = body.response_format;
  }

  let host;
  try { host = new URL(upstream).hostname; } catch { return fail('接口地址无效。', 400); }
  if (!validHost(host)) return fail('接口地址不被允许。', 400);

  try {
    const up = await fetch(upstream, {
      method: 'POST',
      headers: { 'content-type': 'application/json', 'authorization': 'Bearer ' + key },
      body: JSON.stringify(payload),
    });
    const text = await up.text();
    const ct = up.headers.get('content-type') || 'application/json';
    return new Response(text, { status: up.status, headers: { 'content-type': ct, 'cache-control': 'no-store' } });
  } catch (e) {
    return json({ ok: false, error: 'AI 连接失败：接口不可达或网络受限，请检查地址。', network: true }, 502);
  }
}

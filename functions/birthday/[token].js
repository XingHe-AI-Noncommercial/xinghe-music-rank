// ============================================================================
// GET /birthday/[token]
// 公开分享的「生日快乐」祝福页：每个访客看到不同的祝福语（JS 随机抽取）。
// 支持 6 种风格 + AI 生成的原创主题（配色/emoji/纹样/祝福），不复制任何版权形象。
// 16 位随机 token 不可猜测；每日自动清理保留当天创建的链接。
// ============================================================================
import { bumpBirthdayVisit, getBirthdayByToken } from '../_lib.js';

const WISHES = [
  '生日快乐！愿你新的一岁平安喜乐，万事顺遂。',
  '祝你生日快乐，愿你所有美好都如期而至。',
  '愿你被这个世界温柔以待，生日快乐！',
  '岁岁常欢愉，年年皆胜意。生日快乐！',
  '愿你健康快乐，眼里有光，心中有爱。',
  '祝你新的一岁，有趣有盼，不负心中热爱。',
  '愿你所求皆如愿，所行化坦途。生日快乐！',
  '祝你生日快乐，愿好运常伴，幸福常在。',
  '愿你每天都能开心地笑，生日快乐！',
  '祝你生日快乐，愿你永远做自己的太阳。',
  '愿你三冬暖，愿你春不寒，生日快乐。',
  '祝你生日快乐，愿你往后余生，皆得所愿。',
  '愿你笑靥如花，一生顺遂。生日快乐！',
  '祝你生日快乐，愿你的每一天都值得纪念。',
  '愿你眼里有星辰，心中有山海。生日快乐！',
  '祝你生日快乐，愿你被爱包围，被好运眷顾。',
];

// 六种风格（浅/深通用）：生成时站长选择；AI 主题可在其上覆盖配色
const STYLES = {
  classic: { bg: '#f2eee2', paper: '#fffdf7', ink: '#1f2430', accent: '#e23b2e', secondary: '#ffb800', glow: '#716eff', motif: '✦', dark: false },
  starry:  { bg: '#0d1124', paper: '#1a2140', ink: '#eef0ff', accent: '#ffcf4d', secondary: '#7aa2ff', glow: '#b388ff', motif: '⭐', dark: true },
  pastel:  { bg: '#fdeef3', paper: '#fff8fa', ink: '#5a3a4a', accent: '#ff7ba9', secondary: '#ffd166', glow: '#a78bfa', motif: '🌸', dark: false },
  forest:  { bg: '#10251a', paper: '#16301f', ink: '#e8f2e6', accent: '#ffd166', secondary: '#7ec8a3', glow: '#4a9d6a', motif: '🍃', dark: true },
  ocean:   { bg: '#0e2a38', paper: '#12384a', ink: '#eaf7ff', accent: '#ffd166', secondary: '#4fc3f7', glow: '#2aa7c9', motif: '🌊', dark: true },
  neon:    { bg: '#120a20', paper: '#1c1030', ink: '#f3e9ff', accent: '#ff4ea0', secondary: '#4df3ff', glow: '#a6ff4d', motif: '💜', dark: true },
};

function esc(s) {
  return String(s || '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}
function safeColor(v, fallback) {
  return /^#[0-9a-fA-F]{3,8}$/.test(String(v || '')) ? v : fallback;
}

function renderPage(wish, found) {
  const name = wish ? wish.name : '';
  const custom = wish ? wish.message : '';
  const styleKey = STYLES[wish && wish.style] ? wish.style : 'classic';
  const st = STYLES[styleKey];
  let theme = {};
  if (wish && wish.theme) { try { theme = JSON.parse(wish.theme); } catch { theme = {}; } }
  const p = theme.palette || {};
  const c = {
    bg: safeColor(p.bg, st.bg), paper: safeColor(p.paper, st.paper), ink: safeColor(p.ink, st.ink),
    accent: safeColor(p.accent, st.accent), secondary: safeColor(p.secondary, st.secondary), glow: safeColor(p.glow, st.glow),
    motif: String(theme.motif || st.motif).slice(0, 4), dark: st.dark,
  };
  const aiMessage = String(theme.message || '').slice(0, 120);
  const aiImage = found && theme.image && String(theme.image).length < 500000 ? String(theme.image) : '';
  const safeName = esc(name);
  const safeCustom = esc(custom);
  const safeAi = esc(aiMessage);
  const gridLine = c.dark ? 'rgba(255,255,255,.06)' : 'rgba(31,36,48,.05)';
  const dotLine = c.dark ? 'rgba(255,255,255,.09)' : 'rgba(31,36,48,.08)';
  const title = found ? `生日快乐，${name}！` : '生日快乐';
  const balloons = '🎈🎈🎈🎈🎈🎈';
  return `<!DOCTYPE html>
<html lang="zh-CN">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${esc(title)} · 星河音浪榜</title>
<style>
  * { box-sizing: border-box; }
  html,body { margin:0; padding:0; }
  body {
    min-height:100vh; display:flex; align-items:center; justify-content:center; padding:20px;
    background:
      radial-gradient(circle at 12% 8%, ${c.glow}22, transparent 34%),
      radial-gradient(circle at 88% 92%, ${c.secondary}1e, transparent 36%),
      linear-gradient(${gridLine} 1px, transparent 1px),
      linear-gradient(90deg, ${gridLine} 1px, transparent 1px),
      radial-gradient(${dotLine} 1.1px, transparent 1.4px),
      ${c.bg};
    background-size:auto,auto,36px 36px,36px 36px,24px 24px,auto;
    color:${c.ink}; overflow-x:hidden; position:relative;
    font-family:"Instrument Sans","Microsoft YaHei","PingFang SC",system-ui,sans-serif;
  }
  .motif-water { position:fixed; inset:0; display:flex; align-items:center; justify-content:center; font-size:min(46vw,320px); opacity:.05; pointer-events:none; z-index:0; transform:rotate(-8deg); }
  .card {
    position:relative; z-index:2; width:min(460px,94vw); background:${c.paper};
    border:2px solid ${c.ink}; border-radius:0; padding:30px 26px 26px; text-align:center;
    box-shadow:6px -6px 0 ${c.ink},12px -12px 0 ${c.ink}22;
  }
  .card:before { content:""; position:absolute; inset:7px; border:1px solid ${c.ink}33; pointer-events:none; }
  .corner { position:absolute; width:22px; height:22px; border:2px solid ${c.accent}; }
  .corner.tl { top:-8px; left:-8px; border-right:none; border-bottom:none; }
  .corner.tr { top:-8px; right:-8px; border-left:none; border-bottom:none; }
  .corner.bl { bottom:-8px; left:-8px; border-right:none; border-top:none; }
  .corner.br { bottom:-8px; right:-8px; border-left:none; border-top:none; }
  .balloons { position:relative; height:64px; margin-bottom:2px; font-size:30px; letter-spacing:6px; }
  .balloons span { display:inline-block; animation:sway 3.4s ease-in-out infinite; }
  .balloons span:nth-child(2n){ animation-delay:.5s; } .balloons span:nth-child(3n){ animation-delay:1s; }
  .balloons span:nth-child(4n){ animation-delay:1.5s; }
  @keyframes sway { 0%,100%{transform:translateY(0) rotate(-3deg)} 50%{transform:translateY(-9px) rotate(3deg)} }
  .cake { font-size:52px; line-height:1; display:inline-block; animation:bounce 2.4s ease-in-out infinite; filter:drop-shadow(0 8px 12px ${c.ink}33); }
  @keyframes bounce { 0%,100%{transform:translateY(0)} 50%{transform:translateY(-10px)} }
  .eyebrow { font-family:"Courier New",monospace; letter-spacing:.22em; font-size:11px; color:${c.ink}99; margin-top:10px; font-weight:700; }
  h1 { font-family:Impact,"Microsoft YaHei",sans-serif; font-weight:800; font-size:33px; margin:6px 0 2px; letter-spacing:.02em; }
  .name { color:${c.accent}; }
  .to-line { font-family:"Courier New",monospace; font-size:12px; color:${c.ink}88; letter-spacing:.12em; }
  .wish { font-size:16px; line-height:1.8; margin:16px auto 6px; min-height:3.2em; transition:opacity .4s; }
  .wish.fade { opacity:0; }
  .custom { margin-top:10px; padding:10px 12px; border:2px solid ${c.secondary}; background:${c.secondary}18; font-size:14px; line-height:1.7; }
  .bday-img { margin:4px 0 14px; }
  .bday-img img { width:100%; max-height:250px; object-fit:cover; border:2px solid ${c.ink}; display:block; background:${c.paper}; }
  .btn { margin-top:14px; border:2px solid ${c.ink}; background:${c.paper}; color:${c.ink}; font-weight:900; font-size:13px; padding:9px 16px; cursor:pointer; box-shadow:3px -3px 0 ${c.ink},6px -6px 0 ${c.ink}22; font-family:inherit; }
  .btn:hover { transform:translate(-1px,1px); }
  .btn.primary { background:${c.accent}; color:${c.dark ? '#1a1020' : '#fff'}; border-color:${c.accent}; box-shadow:3px -3px 0 ${c.accent}cc,6px -6px 0 ${c.ink}22; }
  .foot { margin-top:16px; font-family:"Courier New",monospace; font-size:10px; letter-spacing:.14em; color:${c.ink}88; }
  .confetti { position:fixed; top:-12px; width:9px; height:15px; opacity:.9; animation:fall linear infinite; z-index:1; }
  @keyframes fall { to { transform:translateY(110vh) rotate(720deg); } }
  .notfound { color:${c.ink}88; }
</style>
</head>
<body>
  <div class="motif-water" aria-hidden="true">${c.motif}</div>
  <div id="confetti" aria-hidden="true"></div>
  <div class="card">
    <span class="corner tl"></span><span class="corner tr"></span><span class="corner bl"></span><span class="corner br"></span>
    <div class="balloons" aria-hidden="true">${found ? balloons : ''}</div>
    <span class="cake">🎂</span>
    <div class="eyebrow">HAPPY BIRTHDAY</div>
    <h1>${found ? '生日快乐，<span class="name">' + safeName + '</span>！' : '生日快乐！'}</h1>
    ${found ? '<div class="to-line">TO · ' + safeName + '</div>' : ''}
    ${aiImage ? '<div class="bday-img"><img src="' + esc(aiImage) + '" alt="生日贺图" loading="lazy" onerror="this.parentNode.remove()"></div>' : ''}
    <p id="wish" class="wish">${found ? (aiMessage ? safeAi : '祝你生日快乐，愿你所有美好都如期而至。') : '这条祝福不存在或已失效。'}</p>
    ${found && safeCustom ? '<div class="custom">✦ ' + safeCustom + '</div>' : ''}
    ${found ? '<button id="again" class="btn primary">再换一句祝福 ✦</button>' : ''}
    <div class="foot">${found ? 'FROM · XINGHE MUSIC CHART' : 'XINGHE MUSIC CHART'}</div>
  </div>
  <script>
    const WISHES = ${JSON.stringify(WISHES)};
    const wish = document.getElementById('wish');
    const again = document.getElementById('again');
    const fixed = ${found && aiMessage ? 'true' : 'false'};
    const hasPool = ${found ? 'true' : 'false'};
    function pick() { return WISHES[Math.floor(Math.random() * WISHES.length)]; }
    function setWish() {
      if (!wish || fixed) return;
      wish.classList.add('fade');
      setTimeout(() => { wish.textContent = pick(); wish.classList.remove('fade'); }, 380);
    }
    if (wish && hasPool) setWish();
    if (again) again.addEventListener('click', setWish);
    const colors = ['${c.accent}','${c.secondary}','${c.glow}','${c.accent}'];
    const box = document.getElementById('confetti');
    for (let i = 0; i < 46; i++) {
      const el = document.createElement('i');
      el.className = 'confetti';
      el.style.left = Math.random() * 100 + 'vw';
      el.style.background = colors[i % colors.length];
      el.style.animationDuration = (3.2 + Math.random() * 4) + 's';
      el.style.animationDelay = (Math.random() * 4) + 's';
      el.style.transform = 'rotate(' + Math.random() * 360 + 'deg)';
      box.appendChild(el);
    }
  </script>
</body>
</html>`;
}

export async function onRequestGet(context) {
  const { DB } = context.env;
  if (!DB) return new Response('数据库未连接', { status: 503, headers: { 'content-type': 'text/plain; charset=utf-8' } });
  const token = String(context.params.token || '');
  const wish = await getBirthdayByToken(DB, token);
  if (wish) await bumpBirthdayVisit(DB, token);
  const html = renderPage(wish, Boolean(wish));
  return new Response(html, { headers: { 'content-type': 'text/html; charset=utf-8', 'cache-control': 'no-store' } });
}

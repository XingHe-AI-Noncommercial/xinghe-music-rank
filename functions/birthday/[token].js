// ============================================================================
// GET /birthday/[token]
// 公开分享的「生日快乐」祝福页：每个访客看到不同的祝福语（JS 随机抽取）。
// 支持 6 种风格 + AI 深度定制的原创主题（配色/版式/纹样/祝福/贺图/底图）。
// 真版式渲染：装饰构图 + 图文框 + 引言块，绝非"一个词放中间"。
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
  const aiOrnament = String(theme.ornament || c.motif).slice(0, 4);
  const birthday = wish && /^\d{2}-\d{2}$/.test(String(wish.birthday || '')) ? String(wish.birthday) : '';
  const hasBday = Boolean(birthday);
  const bName = (name || 'TA').slice(0, 20);
  const bm = hasBday ? Number(birthday.slice(0, 2)) : 0;
  const bd = hasBday ? Number(birthday.slice(3)) : 0;
  // 初始显示（北京时间粗略判断；设备时钟会立刻校准）
  const nowBJ = new Date(Date.now() + 8 * 3600 * 1000);
  const isTodayBJ = hasBday && (nowBJ.getUTCMonth() + 1 === bm && nowBJ.getUTCDate() === bd);
  const showGreet = !hasBday || isTodayBJ;
  const safeName = esc(name);
  const safeCustom = esc(custom);
  const safeAi = esc(aiMessage);
  const gridLine = c.dark ? 'rgba(255,255,255,.06)' : 'rgba(31,36,48,.05)';
  const dotLine = c.dark ? 'rgba(255,255,255,.09)' : 'rgba(31,36,48,.08)';
  const title = found ? (hasBday ? `距离${bName}的生日` : `生日快乐，${name}！`) : '生日快乐';
  const balloons = '🎈🎈🎈🎈🎈🎈';
  const heroGreet = '生日快乐，' + (name || '你') + '！';
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
    border:2px solid ${c.ink}; border-radius:18px; padding:30px 26px 24px; text-align:center;
    box-shadow:0 24px 64px ${c.ink}38, 7px -7px 0 ${c.ink}, 14px -14px 0 ${c.ink}1f;
  }
  .card:before { content:""; position:absolute; inset:8px; border:1px solid ${c.ink}2b; border-radius:12px; pointer-events:none; }
  .corner { position:absolute; width:22px; height:22px; border:2px solid ${c.accent}; }
  .corner.tl { top:6px; left:6px; border-right:none; border-bottom:none; }
  .corner.tr { top:6px; right:6px; border-left:none; border-bottom:none; }
  .corner.bl { bottom:6px; left:6px; border-right:none; border-top:none; }
  .corner.br { bottom:6px; right:6px; border-left:none; border-top:none; }
  .hidden { display:none !important; }
  .balloons { position:relative; height:56px; margin-bottom:0; font-size:28px; letter-spacing:6px; }
  .balloons span { display:inline-block; animation:sway 3.4s ease-in-out infinite; }
  .balloons span:nth-child(2n){ animation-delay:.5s; } .balloons span:nth-child(3n){ animation-delay:1s; }
  .balloons span:nth-child(4n){ animation-delay:1.5s; }
  @keyframes sway { 0%,100%{transform:translateY(0) rotate(-3deg)} 50%{transform:translateY(-9px) rotate(3deg)} }
  .cake { font-size:46px; line-height:1; display:inline-block; animation:bounce 2.4s ease-in-out infinite; filter:drop-shadow(0 8px 12px ${c.ink}33); }
  @keyframes bounce { 0%,100%{transform:translateY(0)} 50%{transform:translateY(-10px)} }
  .eyebrow { font-family:"Courier New",monospace; letter-spacing:.22em; font-size:11px; color:${c.ink}99; margin-top:8px; font-weight:700; }
  .bday-hero { font-family:Impact,"Microsoft YaHei",sans-serif; font-weight:800; font-size:30px; margin:6px 0 2px; letter-spacing:.02em; line-height:1.25; }
  .bday-hero .orn { color:${c.accent}; font-size:.8em; vertical-align:middle; }
  .bday-hero .name { color:${c.accent}; }
  .bday-sub { font-family:"Courier New",monospace; font-size:12px; color:${c.ink}88; letter-spacing:.12em; margin-top:2px; }
  .bday-divider { display:flex; align-items:center; gap:10px; margin:12px auto; max-width:220px; }
  .bday-divider:before, .bday-divider:after { content:""; flex:1; height:2px; background:${c.ink}33; }
  .bday-divider span { color:${c.accent}; font-size:14px; }
  .bday-message { margin:12px auto 6px; padding:13px 15px; border-left:4px solid ${c.accent}; border-radius:12px; background:${c.accent}12; text-align:left; }
  .bday-message .q { font-family:Georgia,serif; font-size:30px; color:${c.accent}; line-height:.4; display:block; }
  .bday-message p { font-size:15px; line-height:1.8; margin:4px 0 0; min-height:2.5em; transition:opacity .4s; }
  .bday-message p.fade { opacity:0; }
  .custom { margin-top:10px; padding:11px 13px; border:2px solid ${c.secondary}; border-radius:12px; background:${c.secondary}12; font-size:14px; line-height:1.7; }
  .count-panel { margin:14px auto 8px; padding:22px 18px 18px; border:2px solid ${c.ink}; border-radius:14px; background:${c.paper}59; position:relative; overflow:hidden; }
  .count-panel:after { content:"${c.motif}"; position:absolute; font-size:88px; right:-10px; bottom:-28px; opacity:.10; transform:rotate(-14deg); }
  .count-label { font-family:"Courier New",monospace; font-size:11px; letter-spacing:.24em; color:${c.ink}88; }
  .count-days { margin-top:6px; font-family:Impact,"Microsoft YaHei",sans-serif; font-size:58px; line-height:1; color:${c.accent}; }
  .count-days i { font-style:normal; font-size:20px; color:${c.ink}88; margin-left:6px; font-weight:400; }
  .count-time { margin-top:12px; font-family:"Courier New",monospace; font-size:24px; letter-spacing:.14em; color:${c.ink}; font-weight:700; }
  .count-time span { display:inline-block; min-width:1.1em; }
  .count-sep { color:${c.accent}; }
  .count-note { margin-top:10px; font-size:10px; letter-spacing:.1em; color:${c.ink}66; }
  .btn { margin-top:14px; border:2px solid ${c.ink}; background:${c.paper}; color:${c.ink}; font-weight:900; font-size:13px; padding:9px 16px; border-radius:10px; cursor:pointer; box-shadow:3px -3px 0 ${c.ink},6px -6px 0 ${c.ink}22; font-family:inherit; }
  .btn:hover { transform:translate(-1px,1px); }
  .btn.primary { background:${c.accent}; color:${c.dark ? '#1a1020' : '#fff'}; border-color:${c.accent}; box-shadow:3px -3px 0 ${c.accent}cc,6px -6px 0 ${c.ink}22; }
  .foot { margin-top:16px; font-family:"Courier New",monospace; font-size:10px; letter-spacing:.14em; color:${c.ink}88; }
  .confetti { position:fixed; top:-12px; width:9px; height:15px; opacity:.9; animation:fall linear infinite; z-index:1; }
  @keyframes fall { to { transform:translateY(110vh) rotate(720deg); } }
</style>
</head>
<body>
  <div class="motif-water" aria-hidden="true">${c.motif}</div>
  <div id="confetti" aria-hidden="true"></div>
  <div class="card">
    <span class="corner tl"></span><span class="corner tr"></span><span class="corner bl"></span><span class="corner br"></span>

    <div id="bday-greet" class="${showGreet ? '' : 'hidden'}">
      <div class="balloons" aria-hidden="true">${found ? balloons : ''}</div>
      <span class="cake">🎂</span>
      <div class="eyebrow">HAPPY BIRTHDAY</div>
      <h1 class="bday-hero">${found ? '<span class="orn">' + aiOrnament + '</span> ' + esc(heroGreet).replace(safeName, '<span class="name">' + safeName + '</span>') + ' <span class="orn">' + aiOrnament + '</span>' : '生日快乐！'}</h1>
      <div class="bday-sub">${found && name ? 'TO · ' + safeName : ''}</div>
      <div class="bday-divider"><span>${aiOrnament}</span></div>
      <div class="bday-message"><span class="q">“</span><p id="wish">${found ? (aiMessage ? safeAi : '祝你生日快乐，愿你所有美好都如期而至。') : '这条祝福不存在或已失效。'}</p></div>
      ${found && safeCustom ? '<div class="custom">✦ ' + safeCustom + '</div>' : ''}
      ${found ? '<button id="again" class="btn primary">再换一句祝福 ✦</button>' : ''}
    </div>

    <div id="bday-count" class="${showGreet ? 'hidden' : ''}">
      <span class="cake">🎂</span>
      <div class="eyebrow">COUNTDOWN TO BIRTHDAY</div>
      <h1 class="bday-hero">距离 <span class="name">${esc(bName)}</span> 的生日</h1>
      <div class="bday-sub">${hasBday ? '🎂 ' + birthday.slice(0, 2) + ' 月 ' + birthday.slice(3) + ' 日' : ''}</div>
      <div class="bday-divider"><span>${aiOrnament}</span></div>
      <div class="count-panel">
        <div class="count-label">还有</div>
        <div class="count-days"><span id="count-days">—</span><i>天</i></div>
        <div class="count-time"><span id="count-h">--</span><span class="count-sep">:</span><span id="count-m">--</span><span class="count-sep">:</span><span id="count-s">--</span></div>
        <div class="count-note">按生日当天 0 点整计算 · 精准到秒</div>
      </div>
      ${found && safeCustom ? '<div class="custom">✦ ' + safeCustom + '</div>' : ''}
    </div>

    <div class="foot">${found ? 'FROM · XINGHE MUSIC CHART' : 'XINGHE MUSIC CHART'}</div>
  </div>
  <script>
    const WISHES = ${JSON.stringify(WISHES)};
    const bday = ${JSON.stringify(birthday)};
    const hasBday = ${hasBday ? 'true' : 'false'};
    const bm = hasBday ? Number(bday.slice(0, 2)) : 0;
    const bd = hasBday ? Number(bday.slice(3)) : 0;
    function pad(n) { return String(n).padStart(2, '0'); }
    function isToday(now) { return hasBday && (now.getMonth() + 1 === bm && now.getDate() === bd); }
    const g = document.getElementById('bday-greet');
    const cn = document.getElementById('bday-count');
    function renderTime() {
      const now = new Date();
      if (isToday(now)) {
        if (cn && !cn.classList.contains('hidden')) cn.classList.add('hidden');
        if (g && g.classList.contains('hidden')) g.classList.remove('hidden');
      } else {
        if (g && !g.classList.contains('hidden')) g.classList.add('hidden');
        if (cn && cn.classList.contains('hidden')) cn.classList.remove('hidden');
        if (hasBday) {
          let t = new Date(now.getFullYear(), bm - 1, bd, 0, 0, 0);
          if (now >= t) t = new Date(now.getFullYear() + 1, bm - 1, bd, 0, 0, 0);
          const diff = Math.max(0, t - now);
          const d = document.getElementById('count-days');
          const h = document.getElementById('count-h');
          const m = document.getElementById('count-m');
          const s = document.getElementById('count-s');
          if (d) d.textContent = Math.floor(diff / 86400000);
          if (h) h.textContent = pad(Math.floor(diff % 86400000 / 3600000));
          if (m) m.textContent = pad(Math.floor(diff % 3600000 / 60000));
          if (s) s.textContent = pad(Math.floor(diff % 60000 / 1000));
        }
      }
    }
    renderTime();
    setInterval(renderTime, 1000);
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

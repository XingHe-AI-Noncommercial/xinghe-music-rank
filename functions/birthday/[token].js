// ============================================================================
// GET /birthday/[token]
// 公开分享的「生日快乐」祝福页：每个访客看到不同的祝福语（JS 随机抽取）。
// 16 位随机 token 不可猜测；无管理员鉴权（分享链接本身即入口）。
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

function esc(s) {
  return String(s || '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}

function renderPage(name, custom, found) {
  const safeName = esc(name);
  const safeCustom = esc(custom);
  const title = found ? `生日快乐，${safeName}！` : '生日快乐';
  return `<!DOCTYPE html>
<html lang="zh-CN">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${esc(title)} · 星河音浪榜</title>
<style>
  * { box-sizing: border-box; }
  :root { color-scheme: light; --paper:#fffdf7; --ink:#1f2430; --red:#e23b2e; --gold:#ffb800; --line:#e4ddcc; }
  html,body { margin:0; padding:0; }
  body {
    min-height:100vh; display:flex; align-items:center; justify-content:center; padding:20px;
    background:
      linear-gradient(rgba(31,36,48,.05) 1px, transparent 1px),
      linear-gradient(90deg, rgba(31,36,48,.05) 1px, transparent 1px),
      radial-gradient(rgba(31,36,48,.08) 1.1px, transparent 1.4px),
      #f2eee2;
    background-size:36px 36px,36px 36px,24px 24px,auto;
    font-family:"Instrument Sans","Microsoft YaHei","PingFang SC",system-ui,sans-serif; color:var(--ink);
    overflow-x:hidden; position:relative;
  }
  .card {
    position:relative; width:min(460px,94vw); background:var(--paper);
    border:2px solid var(--ink); border-radius:0; padding:30px 26px 26px; text-align:center;
    box-shadow:6px -6px 0 var(--ink),12px -12px 0 rgba(31,36,48,.14);
  }
  .cake { font-size:54px; line-height:1; display:inline-block; animation:bounce 2.4s ease-in-out infinite; }
  @keyframes bounce { 0%,100%{transform:translateY(0)} 50%{transform:translateY(-10px)} }
  .eyebrow { font-family:"Courier New",monospace; letter-spacing:.22em; font-size:11px; color:#6d7180; margin-top:10px; }
  h1 { font-family:Impact,"Microsoft YaHei",sans-serif; font-weight:800; font-size:34px; margin:6px 0 2px; letter-spacing:.02em; }
  .name { color:var(--red); }
  .wish { font-size:16px; line-height:1.8; margin:16px auto 6px; min-height:3.2em; transition:opacity .4s; }
  .wish.fade { opacity:0; }
  .custom { margin-top:10px; padding:10px 12px; border:2px solid var(--gold); background:#fff8e6; font-size:14px; line-height:1.7; }
  .btn { margin-top:14px; border:2px solid var(--ink); background:#fff; color:var(--ink); font-weight:900; font-size:13px; padding:9px 16px; cursor:pointer; box-shadow:3px -3px 0 var(--ink),6px -6px 0 rgba(31,36,48,.16); font-family:inherit; }
  .btn:hover { transform:translate(-1px,1px); }
  .btn.primary { background:var(--red); color:#fff; border-color:#a81f16; box-shadow:3px -3px 0 #a81f16,6px -6px 0 rgba(31,36,48,.18); }
  .foot { margin-top:16px; font-family:"Courier New",monospace; font-size:10px; letter-spacing:.14em; color:#8a8574; }
  .confetti { position:fixed; top:-12px; width:9px; height:15px; opacity:.9; animation:fall linear infinite; z-index:0; }
  @keyframes fall { to { transform:translateY(110vh) rotate(720deg); } }
  .notfound { color:#6d7180; }
</style>
</head>
<body>
  <div id="confetti" aria-hidden="true"></div>
  <div class="card">
    <span class="cake">🎂</span>
    <div class="eyebrow">HAPPY BIRTHDAY</div>
    <h1>${found ? '生日快乐，<span class="name">' + safeName + '</span>！' : '生日快乐！'}</h1>
    ${found ? '<p class="notfound" style="font-size:12px;color:#8a8574;font-family:Courier New,monospace;letter-spacing:.1em">TO · ' + safeName + '</p>' : ''}
    <p id="wish" class="wish">${found ? '祝你生日快乐，愿你所有美好都如期而至。' : '这条祝福不存在或已失效。'}</p>
    ${found && safeCustom ? '<div class="custom">✦ ' + safeCustom + '</div>' : ''}
    ${found ? '<button id="again" class="btn primary">再换一句祝福 ✦</button>' : ''}
    <div class="foot">${found ? 'FROM · XINGHE MUSIC CHART' : 'XINGHE MUSIC CHART'}</div>
  </div>
  <script>
    const WISHES = ${JSON.stringify(WISHES)};
    const wish = document.getElementById('wish');
    const again = document.getElementById('again');
    function pick() {
      const idx = Math.floor(Math.random() * WISHES.length);
      return WISHES[idx];
    }
    function setWish() {
      if (!wish || wish.dataset.fixed === '1') return;
      wish.classList.add('fade');
      setTimeout(() => { wish.textContent = pick(); wish.classList.remove('fade'); }, 380);
    }
    if (wish && ${found ? 'true' : 'false'}) setWish();
    if (again) again.addEventListener('click', setWish);
    // 彩带
    const colors = ['#e23b2e','#ffb800','#716eff','#3f6d52','#ff8a5c'];
    const box = document.getElementById('confetti');
    for (let i = 0; i < 42; i++) {
      const c = document.createElement('i');
      c.className = 'confetti';
      c.style.left = Math.random() * 100 + 'vw';
      c.style.background = colors[i % colors.length];
      c.style.animationDuration = (3.2 + Math.random() * 4) + 's';
      c.style.animationDelay = (Math.random() * 4) + 's';
      c.style.transform = 'rotate(' + Math.random() * 360 + 'deg)';
      box.appendChild(c);
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
  const html = renderPage(wish ? wish.name : '', wish ? wish.message : '', Boolean(wish));
  return new Response(html, { headers: { 'content-type': 'text/html; charset=utf-8', 'cache-control': 'no-store' } });
}

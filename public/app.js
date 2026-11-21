(() => {
  'use strict';

  const $ = (selector, root = document) => root.querySelector(selector);
  const $$ = (selector, root = document) => Array.from(root.querySelectorAll(selector));

  const state = {
    data: null,
    realMode: false,
    loading: false,
    adminData: null,
    adminLoggedIn: false,
    adminTab: 'overview',
    adminSidebarOpen: false,
    realBan: null,
    simUntil: 0,
    banDevSession: false,
    rejectId: null,
  };
  // 开发者会话令牌：登录后存于 sessionStorage，后台请求带 Authorization 头（Cookie 之外的兜底）
  let adminToken = '';
  try { adminToken = sessionStorage.getItem('xh_admin_token') || ''; } catch { /* 某些环境禁用 storage */ }

  // ---------- 本地预览数据（后端未连接时展示） ----------
  const demoTracks = [
    { id: 'd1', bvid: 'BVXXXXXXXXXX', artist: 'Luna / 虚构企划', title: '玻璃海的来信', createdAt: new Date(Date.now() - 3600e3).toISOString() },
    { id: 'd2', bvid: 'BVXXXXXXXXXX', artist: '青空研究所', title: '凌晨四点的星尘', createdAt: new Date(Date.now() - 7200e3).toISOString() },
  ];
  function seedPreview(reason) {
    return {
      ok: true, preview: true, reason: reason || '',
      week: new Date().toISOString().slice(0, 10),
      songs: demoTracks,
      summary: { approved: demoTracks.length, pending: 1, rejected: 0 },
      submit: { dailyLimit: 1, submittedToday: false, todayStatus: null, remainingToday: 1 },
    };
  }

  // ---------- 基础工具 ----------
  function escapeHtml(value) {
    return String(value ?? '').replace(/[&<>"']/g, ch => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[ch]));
  }
  function number(value) { return Number(value || 0).toLocaleString('zh-CN'); }
  function fmtDate(value) {
    if (!value) return '—';
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) return String(value).slice(0, 10);
    return new Intl.DateTimeFormat('zh-CN', { timeZone: 'Asia/Shanghai', month: '2-digit', day: '2-digit' }).format(date);
  }
  function showToast(message, type = 'normal') {
    const region = $('#toast-region');
    if (!region) return;
    const node = document.createElement('div');
    node.className = `toast ${type}`;
    node.textContent = String(message || '操作完成');
    region.appendChild(node);
    setTimeout(() => { node.style.opacity = '0'; node.style.transform = 'translateY(5px)'; setTimeout(() => node.remove(), 220); }, 3200);
  }
  async function api(url, options = {}) {
    const init = { credentials: 'same-origin', ...options };
    init.headers = { ...(options.body ? { 'content-type': 'application/json' } : {}), ...(options.headers || {}) };
    // 后台接口额外带会话令牌（Cookie 之外的双保险）
    if (adminToken && url.startsWith('/api/admin')) init.headers['authorization'] = 'Bearer ' + adminToken;
    const response = await fetch(url, init);
    let payload;
    try { payload = await response.json(); } catch { payload = { error: `服务器返回了无法识别的响应（${response.status}）。` }; }
    if (!response.ok || payload?.ok === false) {
      const error = new Error(payload?.error || `请求失败（${response.status}）。`);
      error.status = response.status;
      throw error;
    }
    return payload;
  }
  async function copyText(text) {
    if (navigator.clipboard && window.isSecureContext) { await navigator.clipboard.writeText(text); return; }
    const ta = document.createElement('textarea');
    ta.value = text; ta.style.position = 'fixed'; ta.style.opacity = '0';
    document.body.appendChild(ta); ta.select();
    try { document.execCommand('copy'); } finally { ta.remove(); }
  }

  // ---------- 数据加载 ----------
  async function refreshState(showError = false) {
    if (state.loading) return;
    state.loading = true;
    try {
      const data = await api('/api/state', { method: 'GET' });
      state.data = data;
      state.realMode = true;
      applyMaintenance(Boolean(data.maintenance));
      applyBan(data);
      renderPage();
      setConnection(true);
    } catch (error) {
      const isConnectionFail = !error?.status || error.status >= 500;
      if (!isConnectionFail && state.data) {
        if (showError) showToast(error.message, 'error');
        return;
      }
      state.realMode = false;
      state.data = seedPreview(error.message);
      applyMaintenance(false); // 连不上后台则无法确认维护状态，按正常显示
      renderPage();
      setConnection(false);
      if (showError) showToast(`当前显示本地预览：${error.message}`, 'error');
    } finally {
      state.loading = false;
    }
  }
  // 网站维护遮罩：开启时覆盖全站，右上角仅开发者可进入后台
  function applyMaintenance(on) {
    const el = $('#maintenance-screen');
    if (el) el.classList.toggle('hidden', !on);
  }

  // ---------- IP 封禁页 ----------
  let banTimer = null;
  function fmtBanLeft(until) {
    const left = until - Date.now();
    if (left <= 0) return '封禁已到期，即将解除…';
    const h = Math.floor(left / 3600000), m = Math.floor(left % 3600000 / 60000), s = Math.floor(left % 60000 / 1000);
    return (h ? `${h} 小时 ` : '') + (m ? `${m} 分 ` : '') + `${s} 秒`;
  }
  function showBanScreen(ban, simulated) {
    const el = $('#ban-screen'); if (!el) return;
    el.classList.remove('hidden');
    el.dataset.simulated = simulated ? '1' : '';
    $('#ban-reason').textContent = ban?.reason || '由于异常行为，您的 IP 已被暂时封禁。';
    const dev = $('#ban-dev'), exit = $('#ban-exit-preview');
    if (dev) dev.classList.toggle('hidden', simulated);       // 真实封禁：可进开发者模式自我解封
    if (exit) exit.classList.toggle('hidden', !simulated);    // 模拟预览：只给结束按钮
    clearInterval(banTimer);
    const until = Number(ban?.until || 0);
    const tick = () => {
      const node = $('#ban-until'); if (!node) return;
      if (!until) { node.textContent = '永久封禁'; return; }
      node.textContent = '剩余 ' + fmtBanLeft(until);
      if (Date.now() >= until) clearInterval(banTimer);
    };
    tick(); banTimer = setInterval(tick, 1000);
  }
  function hideBanScreen() {
    $('#ban-screen')?.classList.add('hidden');
    clearInterval(banTimer);
  }
  function applyBan(data) {
    if (data && data.banned) {
      if (state.banDevSession) return; // 开发者已通过封禁页进入开发者模式，暂不弹回（自我解封流程）
      state.realBan = data.ban || {}; showBanScreen(state.realBan, false);
    } else if (state.realBan) {
      state.realBan = null; state.banDevSession = false;
      if (!state.simUntil) hideBanScreen();
    }
  }
  function setConnection(connected) {
    const tag = $('#header-live');
    tag.classList.toggle('disconnected', !connected);
    tag.innerHTML = `<i></i>${connected ? '实时数据已连接' : '预览模式'}`;
    tag.title = connected ? '已连接数据库' : '后端暂未连通：以下为本地示例数据，不是真实榜单';
  }

  // ---------- 页面渲染 ----------
  function renderPage() {
    const data = state.data || seedPreview();
    const summary = data.summary || {};
    const submit = data.submit || { dailyLimit: 1, remainingToday: 1, submittedToday: false };
    $('#week-label').textContent = state.realMode ? '本周' : '本地预览';
    $('#current-year').textContent = String(new Date().getFullYear());
    $('#metric-approved').textContent = number(summary.approved ?? data.songs?.length ?? 0);
    $('#metric-pending').textContent = number(summary.pending || 0);
    $('#metric-submit').textContent = submit.submittedToday ? '0' : '1';
    $('#metric-submit-sub').textContent = submit.submittedToday
      ? '今天已投过（每天每 IP 1 个）'
      : '今天还可投 1 个';
    $('#week-chip').textContent = `本周周期：${data.week || '—'} 起`;
    $('#list-total').textContent = `${number(data.songs?.length || 0)} 个`;
    renderList();
    renderSubmitStatus(submit);
    renderAnnouncements(data.announcements || []);
  }

  // 公众页公告栏
  function renderAnnouncements(list) {
    const board = $('#announcement-board');
    if (!board) return;
    const arr = Array.isArray(list) ? list : [];
    board.classList.toggle('hidden', arr.length === 0);
    $('#announcement-count').textContent = `${arr.length} 条`;
    $('#announcement-list').innerHTML = arr.map(a => `<article class="announcement-item">
      <span class="announcement-icon">✦</span>
      <div class="announcement-copy"><p>${escapeHtml(a.text)}</p><small>${fmtDate(a.createdAt)}</small></div>
    </article>`).join('');
  }

  function renderSubmitStatus(submit) {
    const node = $('#submit-status');
    const form = $('#submit-form');
    if (state.realMode && submit?.submittedToday) {
      node.textContent = `今天已经投过 1 个了（${submit.todayStatus === 'pending' ? '等待开发者审核' : '已上架'}）。被拒绝后可重新提交，或明天（北京时间 0 点）再来。`;
      node.className = 'submit-status warn';
      $$('#submit-form button[type="submit"]').forEach(b => b.disabled = true);
      form?.classList.add('is-locked');
    } else {
      node.textContent = '还未投稿，今天可以投 1 个。';
      node.className = 'submit-status';
      $$('#submit-form button[type="submit"]').forEach(b => b.disabled = false);
      form?.classList.remove('is-locked');
    }
  }

  function renderList() {
    const data = state.data || seedPreview();
    const songs = data.songs || [];
    $('#list-count').textContent = `共 ${number(songs.length)} 个`;
    $('#empty-list').classList.toggle('hidden', songs.length !== 0);
    const grid = $('#list-grid');
    if (!songs.length) { grid.innerHTML = ''; return; }
    grid.innerHTML = songs.map((song, index) => {
      // 对外只显示掩码 BV 号，不提供 B 站跳转（不暴露真实编号）
      return `<article class="track-card lite-card">
        <span class="lite-rank">${String(index + 1).padStart(2, '0')}</span>
        <div class="track-info">
          <span class="track-title">${escapeHtml(song.title)}</span>
          <span class="track-artist">${escapeHtml(song.artist || '未知创作者')}</span>
          <span class="track-bv">${escapeHtml(song.bvid || '')}</span>
        </div>
        <span class="track-open" title="不提供跳转（BV 号已掩码）">♪</span>
      </article>`;
    }).join('');
  }

  // ---------- 投稿 ----------
  $('#submit-form').addEventListener('submit', async event => {
    event.preventDefault();
    if (!state.realMode) { showToast('当前是本地预览模式，请先完成 Cloudflare D1 配置。', 'error'); return; }
    const form = event.currentTarget;
    const button = form.querySelector('button[type="submit"]');
    const data = Object.fromEntries(new FormData(form).entries());
    button.disabled = true; button.textContent = '正在提交…';
    try {
      const result = await api('/api/submit', { method: 'POST', body: JSON.stringify(data) });
      showToast(result.message, 'success');
      form.reset();
      await refreshState();
    } catch (error) {
      showToast(error.message, 'error');
      button.disabled = false; button.innerHTML = '提交审核 <span>→</span>';
    }
  });

  // ---------- 弹窗 ----------
  function showModal(id) { const node = document.getElementById(id); if (node) { node.classList.remove('hidden'); document.body.style.overflow = 'hidden'; } }
  function hideModal(id) { const node = document.getElementById(id); if (node) node.classList.add('hidden'); if (!$('.modal-backdrop:not(.hidden)')) document.body.style.overflow = ''; }
  $$('[data-close]').forEach(button => button.addEventListener('click', () => hideModal(button.dataset.close)));
  $$('.modal-backdrop').forEach(backdrop => backdrop.addEventListener('click', event => { if (event.target === backdrop && backdrop.id !== 'admin-modal') hideModal(backdrop.id); }));
  document.addEventListener('keydown', event => { if (event.key === 'Escape') $$('.modal-backdrop:not(.hidden)').forEach(modal => { if (modal.id !== 'admin-modal') hideModal(modal.id); }); });

  $('#refresh-button').addEventListener('click', () => refreshState(true));
  $('#open-admin').addEventListener('click', openAdmin);
  $('#open-admin-dev').addEventListener('click', openAdmin);
  async function openAdmin() {
    if (state.adminLoggedIn) { showModal('admin-modal'); await loadAdminData(); }
    else showModal('admin-login-modal');
  }
  // 维护页右上角“开发者模式”：未登录走密码登录，仅真正的开发者可进
  const maintenanceDev = $('#maintenance-dev');
  if (maintenanceDev) maintenanceDev.addEventListener('click', openAdmin);

  $('#login-form').addEventListener('submit', async event => {
    event.preventDefault();
    const form = event.currentTarget;
    const button = form.querySelector('button[type="submit"]');
    const password = new FormData(form).get('password');
    button.disabled = true; button.textContent = '验证中…';
    try {
      const res = await api('/api/admin/login', { method: 'POST', body: JSON.stringify({ password }) });
      state.adminLoggedIn = true;
      adminToken = res?.token || '';
      try { sessionStorage.setItem('xh_admin_token', adminToken); } catch { /* 忽略 */ }
      form.reset(); hideModal('admin-login-modal'); showModal('admin-modal');
      await loadAdminData(); showToast('已进入开发者模式。', 'success');
    } catch (error) { showToast(error.message, 'error'); }
    finally { button.disabled = false; button.innerHTML = '安全登录 <span>→</span>'; }
  });

  // ---------- 开发者后台 ----------
  let adminRetry = 0;
  async function loadAdminData() {
    try {
      state.adminData = await api('/api/admin/state', { method: 'GET' });
      try { const b = await api('/api/admin/birthdays', { method: 'GET' }); state.adminData.birthdays = b.list || []; } catch {}
      adminRetry = 0;
      renderAdmin();
      await loadIps();
    } catch (error) {
      // 刚登录后第一次请求可能因 Cookie 尚未就位而瞬时 401：重试一次再判定
      if (state.adminLoggedIn && adminRetry < 1 && /登录|会话|登录开发者/.test(error.message)) {
        adminRetry += 1;
        await loadAdminData();
        return;
      }
      adminRetry = 0;
      showToast(error.message, 'error');
      if (/登录|会话|登录开发者/.test(error.message)) { state.adminLoggedIn = false; hideModal('admin-modal'); showModal('admin-login-modal'); }
    }
  }
  function selectAdminTab(tab) {
    state.adminTab = tab;
    const names = { overview: '总览面板', submissions: '投稿审核', songs: '作品管理' };
    $('#admin-current-tab').textContent = names[tab] || names.overview;
    $('#admin-title').textContent = ({ overview: '总览面板', submissions: '投稿审核中心', songs: '本周作品管理' })[tab] || '总览面板';
    $('#admin-page-desc').textContent = ({ overview: '审核投稿、上架作品、一键复制 BV 号。', submissions: '审核用户投稿，通过后才上架并计入复制。', songs: '管理本周全部作品，可删除。' })[tab] || '';
    $$('.admin-nav').forEach(button => button.classList.toggle('active', button.dataset.adminTab === tab));
    $$('.admin-view').forEach(view => view.classList.toggle('hidden', view.id !== `admin-view-${tab}`));
    $('.admin-shell').classList.remove('sidebar-open');
    state.adminSidebarOpen = false;
  }
  $$('.admin-nav').forEach(button => button.addEventListener('click', () => selectAdminTab(button.dataset.adminTab)));
  $('#admin-mobile-menu').addEventListener('click', () => { state.adminSidebarOpen = !state.adminSidebarOpen; $('.admin-shell').classList.toggle('sidebar-open', state.adminSidebarOpen); });
  $('#admin-refresh').addEventListener('click', loadAdminData);
  $('#admin-logout').addEventListener('click', async () => {
    try { await api('/api/admin/logout', { method: 'POST', body: JSON.stringify({}) }); } catch { /* 忽略 */ }
    adminToken = '';
    try { sessionStorage.removeItem('xh_admin_token'); } catch { /* 忽略 */ }
    state.adminLoggedIn = false; state.adminData = null; hideModal('admin-modal'); showToast('已退出开发者模式。');
  });

  function renderAdmin() {
    const data = state.adminData; if (!data) return;
    const s = data.summary || {};
    $('#admin-pending-badge').textContent = number(s.pending || 0);
    $('#submissions-count-pill').textContent = `${number(s.pending || 0)} 待处理`;
    $('#admin-kpi-grid').innerHTML = [
      ['已上架', number(s.approved), '审核通过的视频', '◈'],
      ['待审核', number(s.pending), '等待开发者处理', '⏳'],
      ['已拒绝', number(s.rejected), '未通过的投稿', '×'],
      ['本周周期', data.week || '—', '周一 00:00 清空', '⟳'],
    ].map(([label, value, desc, icon]) => `<article class="admin-kpi"><div class="admin-kpi-top"><span>${label}</span><span>${icon}</span></div><strong>${value}</strong><small>${desc}</small></article>`).join('');

    // 一键复制
    const bvList = String(data.bvList || '');
    const count = bvList ? bvList.split(',').filter(Boolean).length : 0;
    $('#copy-bv-count').textContent = `已上架 ${count} 个`;
    $('#bv-preview').textContent = bvList || '（暂无已上架作品）';
    $('#copy-bv').disabled = !count;

    renderAdminSubmissions(data.pending || []);
    renderAdminSongs(data.songs || []);
    renderAdminAnnouncements(data.announcements || []);
    renderAdminBans(data.bans || []);
    renderAdminBirthdays(data.birthdays || []);

    // 站点工具：维护状态 + 清除已拒绝
    const mnt = Boolean(data.maintenance);
    const mToggle = $('#maintenance-toggle'), mState = $('#maintenance-state'), mCount = $('#clear-rejected-count'), cRej = $('#clear-rejected');
    if (mToggle) { mToggle.textContent = mnt ? '关闭网站维护' : '开始网站维护'; mToggle.classList.toggle('button-primary', !mnt); }
    if (mState) mState.textContent = mnt ? '维护开启中' : '维护关闭';
    if (mCount) mCount.textContent = `已拒绝 ${number(s.rejected || 0)} 个`;
    if (cRej) cRej.disabled = !(s.rejected > 0);
  }

  // 一键复制
  $('#copy-bv').addEventListener('click', async () => {
    const bvList = String(state.adminData?.bvList || '').trim();
    if (!bvList) { showToast('本周还没有已上架的作品。', 'error'); return; }
    try { await copyText(bvList); showToast(`已复制 ${bvList.split(',').filter(Boolean).length} 个 BV 号。`, 'success'); }
    catch { showToast('复制失败，请手动选择上方文本复制。', 'error'); }
  });

  // 网站维护开关
  const mToggleBtn = $('#maintenance-toggle');
  if (mToggleBtn) mToggleBtn.addEventListener('click', async () => {
    const cur = Boolean(state.adminData?.maintenance);
    const button = $('#maintenance-toggle');
    button.disabled = true;
    try {
      const res = await api('/api/admin/maintenance', { method: 'POST', body: JSON.stringify({ on: !cur }) });
      showToast(res.message, 'success');
      state.adminData = { ...(state.adminData || {}), maintenance: res.maintenance };
      await loadAdminData();
      await refreshState();
    } catch (error) { showToast(error.message, 'error'); }
    finally { button.disabled = false; }
  });

  // 清除已拒绝投稿
  const clearRejBtn = $('#clear-rejected');
  if (clearRejBtn) clearRejBtn.addEventListener('click', async () => {
    const button = $('#clear-rejected');
    button.disabled = true;
    try {
      const res = await api('/api/admin/rejected', { method: 'DELETE' });
      showToast(`${res.message}（清除 ${res.cleared || 0} 条）`, 'success');
      await loadAdminData();
      await refreshState();
    } catch (error) { showToast(error.message, 'error'); }
    finally { button.disabled = false; }
  });

  function renderAdminSubmissions(pending) {
    const holder = $('#admin-submissions-list'); if (!holder) return;
    if (!pending.length) { holder.innerHTML = '<div class="empty-table">没有待审核的投稿。</div>'; return; }
    holder.innerHTML = pending.map(s => `<article class="submission-item">
      <span class="submission-cover"><span class="cover-fallback">♪</span></span>
      <div class="submission-copy"><strong>${escapeHtml(s.title)}</strong><p>${escapeHtml(s.artist || '未知创作者')}</p><small>BV：${escapeHtml(s.bvid)} · 提交：${fmtDate(s.createdAt)}</small></div>
      <div class="submission-actions"><button class="tiny-button approve" data-review="approve" data-id="${escapeHtml(s.id)}">通过</button><button class="tiny-button reject" data-review="reject" data-id="${escapeHtml(s.id)}">拒绝</button></div>
    </article>`).join('');
  }

  function renderAdminSongs(songs) {
    const holder = $('#admin-songs-table'); if (!holder) return;
    const query = ($('#admin-song-search')?.value || '').toLowerCase().trim();
    const list = songs.filter(s => `${s.title || ''} ${s.bvid || ''}`.toLowerCase().includes(query));
    if (!list.length) { holder.innerHTML = '<div class="empty-table">没有匹配的作品。</div>'; return; }
    const badge = st => ({ approved: '已上架', pending: '待审核', rejected: '已拒绝' }[st] || st);
    const cls = st => st === 'approved' ? 'new' : st === 'pending' ? 'down' : '';
    holder.innerHTML = `<table class="admin-table"><thead><tr><th>视频名 / 作者</th><th>BV 号</th><th>状态</th><th>提交</th><th>操作</th></tr></thead><tbody>${list.map(s => `
      <tr>
        <td><strong>${escapeHtml(s.title)}</strong><br><span style="color:#676a80;font-size:8px">${escapeHtml(s.artist || '未知创作者')}</span></td>
        <td>${escapeHtml(s.bvid)}</td>
        <td><span class="change-pill ${cls(s.status)}">${escapeHtml(badge(s.status))}</span></td>
        <td>${fmtDate(s.createdAt)}</td>
        <td><button class="inline-action danger" data-song-delete="${escapeHtml(s.id)}">删除</button></td>
      </tr>`).join('')}</tbody></table>`;
  }
  function renderAdminAnnouncements(list) {
    const holder = $('#admin-announcement-list'); if (!holder) return;
    const arr = Array.isArray(list) ? list : [];
    const count = $('#admin-announcement-count'); if (count) count.textContent = `${arr.length} 条`;
    if (!arr.length) { holder.innerHTML = '<div class="empty-table">还没有公告。</div>'; return; }
    holder.innerHTML = arr.map(a => `<div class="admin-announcement-row">
      <div class="admin-announcement-copy"><p>${escapeHtml(a.text)}</p><small>${fmtDate(a.createdAt)} · ${escapeHtml(a.author || '管理员')}</small></div>
      <button class="inline-action danger" data-announcement-delete="${escapeHtml(a.id)}">删除</button>
    </div>`).join('');
  }
  function renderAdminBans(bans) {
    const holder = $('#admin-ban-list'); if (!holder) return;
    const arr = Array.isArray(bans) ? bans : [];
    const count = $('#admin-ban-count'); if (count) count.textContent = `${arr.length} 条`;
    if (!arr.length) { holder.innerHTML = '<div class="empty-table">暂无被封禁的 IP。</div>'; return; }
    holder.innerHTML = arr.map(b => {
      const perm = !Number(b.until);
      return `<div class="admin-ban-row">
        <div class="admin-ban-copy"><code>${escapeHtml(b.ip)}</code><small>${perm ? '永久封禁' : '剩余 ' + fmtBanLeft(Number(b.until))}${b.reason ? ' · ' + escapeHtml(b.reason) : ''}</small></div>
        <button class="inline-action danger" data-ban-unban="${escapeHtml(b.ip)}">解封</button>
      </div>`;
    }).join('');
  }

  // 生日祝福管理：列出全部（含历史），显示完整网址，可复制/打开/关停/启用/删除
  function renderAdminBirthdays(list) {
    const holder = $('#admin-birthday-list'); if (!holder) return;
    const arr = Array.isArray(list) ? list : [];
    const count = $('#admin-birthday-count'); if (count) count.textContent = `${arr.length} 条`;
    if (!arr.length) { holder.innerHTML = '<div class="empty-table">暂无生日祝福。点击左侧「🎂 创建生日」生成。</div>'; return; }
    holder.innerHTML = arr.map(b => {
      const link = location.origin + '/birthday/' + b.token;
      const off = b.disabled === true || b.disabled === 'true';
      return `<div class="admin-bday-row${off ? ' is-off' : ''}" data-id="${escapeHtml(b.id)}">
        <div class="admin-bday-copy"><b>${escapeHtml(b.name || '未命名')}${off ? ' <span class="bday-off">已关停</span>' : ''}</b><code>${escapeHtml(b.token)}</code><small>${fmtDate(b.createdAt)} · ${escapeHtml(b.style || 'classic')} · ${b.visits || 0} 次打开</small></div>
        <div class="admin-bday-link" title="${escapeHtml(link)}">${escapeHtml(link)}</div>
        <div class="admin-bday-actions">
          <button class="inline-action" data-bday-copy="${escapeHtml(link)}">复制</button>
          <button class="inline-action" data-bday-open="${escapeHtml(link)}">打开</button>
          <button class="inline-action${off ? '' : ' danger'}" data-bday-off="${escapeHtml(b.id)}" data-off="${off ? 'false' : 'true'}">${off ? '启用' : '关停'}</button>
          <button class="inline-action danger" data-bday-del="${escapeHtml(b.id)}">删除</button>
        </div>
      </div>`;
    }).join('');
    holder.querySelectorAll('[data-bday-copy]').forEach(btn => btn.addEventListener('click', () => copyText(btn.dataset.bdayCopy)));
    holder.querySelectorAll('[data-bday-open]').forEach(btn => btn.addEventListener('click', () => window.open(btn.dataset.bdayOpen, '_blank')));
    holder.querySelectorAll('[data-bday-off]').forEach(btn => btn.addEventListener('click', async () => {
      const on = btn.dataset.off === 'true';
      try {
        await api('/api/admin/birthdays', { method: 'PATCH', body: JSON.stringify({ id: btn.dataset.bdayOff, disabled: on }) });
        showToast(on ? '已关停该网址' : '已启用该网址', 'success');
        await loadAdminData();
      } catch (e) { showToast(e.message, 'error'); }
    }));
    holder.querySelectorAll('[data-bday-del]').forEach(btn => btn.addEventListener('click', async () => {
      if (!confirm('确定删除这条生日祝福？')) return;
      try {
        await api('/api/admin/birthdays?id=' + encodeURIComponent(btn.dataset.bdayDel), { method: 'DELETE' });
        showToast('已删除生日祝福', 'success');
        await loadAdminData();
      } catch (e) { showToast(e.message, 'error'); }
    }));
  }

  // 访客公网 IP 列表：每个进入/投稿过的 IP + 其活动/投稿，点「封禁」自动填入表单
  function renderAdminIps(ips, bans) {
    const holder = $('#admin-ip-list'); if (!holder) return;
    const arr = Array.isArray(ips) ? ips : [];
    const bannedMap = {};
    (Array.isArray(bans) ? bans : []).forEach(b => { bannedMap[b.ip] = true; });
    if (!arr.length) { holder.innerHTML = '<div class="empty-table">暂无访客记录（用户进入后会显示公网 IP）。</div>'; return; }
    holder.innerHTML = arr.map(item => {
      const ip = item.ip;
      const lastAt = Number(item.lastAt || 0);
      const when = lastAt ? (item.active ? '🟢 刚进来' : timeAgo(lastAt)) : '—';
      const songs = (item.songs || []).map(s => {
        const label = s.status === 'approved' ? '通过' : s.status === 'pending' ? '待审' : '拒';
        return `<span class="ip-song"><b class="ip-song-status st-${s.status}">${label}</b>${escapeHtml(s.bvid)} · ${escapeHtml(s.artist)} · ${escapeHtml(s.title)}</span>`;
      }).join('');
      const banned = bannedMap[ip];
      return `<div class="admin-ip-row ${item.active ? 'is-active' : ''}">
        <div class="admin-ip-main">
          <div class="admin-ip-ip"><code>${escapeHtml(ip)}</code>${banned ? '<span class="state-pill">已封禁</span>' : ''}</div>
          <small>${when} · ${Number(item.requests || 0)} 次请求 · ${(item.songs || []).length} 条投稿</small>
        </div>
        <div class="admin-ip-songs">${songs || '<small class="ip-none">暂无投稿</small>'}</div>
        <div class="admin-ip-actions">
          ${banned ? `<button class="tiny-button" data-ban-unban="${escapeHtml(ip)}">解封</button>` : `<button class="tiny-button danger" data-ban-ip="${escapeHtml(ip)}">⛔ 封禁</button>`}
        </div>
      </div>`;
    }).join('');
  }

  function timeAgo(ms) {
    const diff = Math.max(0, Date.now() - ms);
    if (diff < 60000) return Math.floor(diff / 1000) + ' 秒前';
    if (diff < 3600000) return Math.floor(diff / 60000) + ' 分钟前';
    if (diff < 86400000) return Math.floor(diff / 3600000) + ' 小时前';
    return Math.floor(diff / 86400000) + ' 天前';
  }

  async function loadIps() {
    try {
      const data = await api('/api/admin/ips', { method: 'GET' });
      renderAdminIps(data.ips || [], (state.adminData && state.adminData.bans) || []);
    } catch (error) { /* 静默：列表可能为空 */ }
  }
  $('#admin-song-search').addEventListener('input', () => { if (state.adminData) renderAdminSongs(state.adminData.songs || []); });

  $('#admin-add-form').addEventListener('submit', async event => {
    event.preventDefault();
    const form = event.currentTarget; const button = form.querySelector('button[type="submit"]');
    const data = Object.fromEntries(new FormData(form).entries());
    button.disabled = true; button.textContent = '正在上架…';
    try {
      const result = await api('/api/admin/songs', { method: 'POST', body: JSON.stringify(data) });
      form.reset(); showToast(result.message, 'success'); await loadAdminData(); await refreshState();
    } catch (error) { showToast(error.message, 'error'); }
    finally { button.disabled = false; button.textContent = '＋ 直接上架'; }
  });

  $('#admin-submissions-list').addEventListener('click', async event => {
    const button = event.target.closest('[data-review]'); if (!button) return;
    const id = button.dataset.id; const action = button.dataset.review;
    // 拒绝：先弹「拒绝理由」，理由会发到投稿人收件箱
    if (action === 'reject') {
      state.rejectId = id;
      const reasonBox = $('#reject-reason'); if (reasonBox) reasonBox.value = '';
      showModal('reject-modal');
      return;
    }
    button.disabled = true;
    try {
      const result = await api(`/api/admin/submissions/${encodeURIComponent(id)}`, { method: 'POST', body: JSON.stringify({ action }) });
      showToast(result.message, 'success'); await loadAdminData(); await refreshState();
    } catch (error) { showToast(error.message, 'error'); button.disabled = false; }
  });

  // 拒绝理由确认：发送理由到投稿人收件箱并拒绝
  $('#reject-confirm').addEventListener('click', async () => {
    const id = state.rejectId; if (!id) { hideModal('reject-modal'); return; }
    const reason = ($('#reject-reason')?.value || '').trim();
    const btn = $('#reject-confirm'); btn.disabled = true;
    try {
      const result = await api(`/api/admin/submissions/${encodeURIComponent(id)}`, { method: 'POST', body: JSON.stringify({ action: 'reject', reason }) });
      showToast(result.message, 'success');
      state.rejectId = null; hideModal('reject-modal');
      await loadAdminData(); await refreshState();
    } catch (error) { showToast(error.message, 'error'); }
    finally { btn.disabled = false; }
  });

  $('#admin-songs-table').addEventListener('click', async event => {
    const button = event.target.closest('[data-song-delete]'); if (!button) return;
    if (!confirm('确定删除这个作品吗？')) return;
    button.disabled = true;
    try {
      const result = await api(`/api/admin/songs/${encodeURIComponent(button.dataset.songDelete)}`, { method: 'DELETE' });
      showToast(result.message, 'success'); await loadAdminData(); await refreshState();
    } catch (error) { showToast(error.message, 'error'); button.disabled = false; }
  });

  // ---------- 公告栏 ----------
  $('#admin-announcement-form').addEventListener('submit', async event => {
    event.preventDefault();
    const form = event.currentTarget;
    const text = form.querySelector('#admin-announcement-text').value.trim();
    if (!text) { showToast('公告内容不能为空。', 'error'); return; }
    const button = form.querySelector('button[type="submit"]');
    button.disabled = true; button.textContent = '发布中…';
    try {
      const result = await api('/api/admin/announcements', { method: 'POST', body: JSON.stringify({ text }) });
      showToast(result.message, 'success');
      form.reset();
      await loadAdminData(); await refreshState();
    } catch (error) { showToast(error.message, 'error'); }
    finally { button.disabled = false; button.textContent = '＋ 发布公告'; }
  });

  $('#admin-announcement-list').addEventListener('click', async event => {
    const button = event.target.closest('[data-announcement-delete]'); if (!button) return;
    if (!confirm('确定删除这条公告吗？')) return;
    button.disabled = true;
    try {
      const result = await api(`/api/admin/announcements/${encodeURIComponent(button.dataset.announcementDelete)}`, { method: 'DELETE' });
      showToast(result.message, 'success'); await loadAdminData(); await refreshState();
    } catch (error) { showToast(error.message, 'error'); button.disabled = false; }
  });

  // ---------- IP 封禁 ----------
  $('#admin-ban-form').addEventListener('submit', async event => {
    event.preventDefault();
    const form = event.currentTarget;
    const ip = form.querySelector('[name="ip"]').value.trim();
    const seconds = Number(form.querySelector('[name="seconds"]').value) || 0;
    const permanent = Boolean(form.querySelector('[name="permanent"]').checked);
    const reason = form.querySelector('[name="reason"]').value.trim();
    if (!ip) { showToast('请输入要封禁的 IP。', 'error'); return; }
    if (!permanent && !(seconds > 0)) { showToast('请选择封禁时效（秒）或勾选永久。', 'error'); return; }
    const button = form.querySelector('button[type="submit"]');
    button.disabled = true; button.textContent = '封禁中…';
    try {
      const result = await api('/api/admin/bans', { method: 'POST', body: JSON.stringify({ ip, seconds, permanent, reason }) });
      showToast(result.message, 'success');
      form.reset(); form.querySelector('[name="seconds"]').value = '3600';
      await loadAdminData();
    } catch (error) { showToast(error.message, 'error'); }
    finally { button.disabled = false; button.textContent = '⛔ 封禁此 IP'; }
  });

  // 秒时效快捷预设
  document.querySelectorAll('.ban-presets button').forEach(btn => {
    btn.addEventListener('click', () => {
      const form = $('#admin-ban-form'); if (!form) return;
      const inp = form.querySelector('[name="seconds"]');
      if (inp) inp.value = btn.dataset.sec;
      const perm = form.querySelector('[name="permanent"]'); if (perm) perm.checked = false;
    });
  });

  // 封禁页上的「开发者模式」：让开发者（含自封）进入后台自我解封
  const banDev = $('#ban-dev');
  if (banDev) banDev.addEventListener('click', () => {
    state.banDevSession = true;
    hideBanScreen();
    showModal('admin-login-modal');
  });

  $('#admin-ban-list').addEventListener('click', async event => {
    const button = event.target.closest('[data-ban-unban]'); if (!button) return;
    const ip = button.dataset.banUnban;
    if (!confirm(`确定解除 ${ip} 的封禁吗？`)) return;
    button.disabled = true;
    try {
      const result = await api(`/api/admin/bans/${encodeURIComponent(ip)}`, { method: 'DELETE' });
      showToast(result.message, 'success'); await loadAdminData();
    } catch (error) { showToast(error.message, 'error'); button.disabled = false; }
  });

  // 选中访客 IP → 填入封禁表单并定位（也可直接点表单里的「封禁此 IP」完成）
  $('#admin-ip-list').addEventListener('click', event => {
    const button = event.target.closest('[data-ban-ip]'); if (!button) return;
    const ip = button.dataset.banIp;
    const form = $('#admin-ban-form'); if (!form) return;
    const ipInput = form.querySelector('[name="ip"]');
    if (ipInput) { ipInput.value = ip; ipInput.focus(); ipInput.select(); }
    form.scrollIntoView({ behavior: 'smooth', block: 'center' });
    showToast(`已选中 ${ip}，选好时效后点「⛔ 封禁此 IP」即可封号。`);
  });

  // 模拟封禁预览（仅开发者本地查看，不真实封禁任何 IP）
  const simToggle = $('#ban-simulate-toggle');
  if (simToggle) simToggle.addEventListener('click', () => {
    const seconds = Number($('#ban-simulate-seconds').value) || 60;
    if (state.simUntil) {
      state.simUntil = 0; hideBanScreen();
      simToggle.textContent = '▶ 模拟封禁预览';
      showToast('已结束模拟封禁预览。');
      return;
    }
    state.simUntil = Date.now() + seconds * 1000;
    showBanScreen({ until: state.simUntil, reason: '模拟封禁预览（仅开发者可见，非真实封禁）' }, true);
    simToggle.textContent = '■ 结束模拟封禁';
  });
  const exitPreview = $('#ban-exit-preview');
  if (exitPreview) exitPreview.addEventListener('click', () => {
    if (state.simUntil) { state.simUntil = 0; hideBanScreen(); const t = $('#ban-simulate-toggle'); if (t) t.textContent = '▶ 模拟封禁预览'; showToast('已结束模拟封禁预览。'); }
  });

  // ---------- 收件箱（右上角 📬：投稿审核结果等消息） ----------
  function renderInbox(messages) {
    const holder = $('#inbox-list'); if (!holder) return;
    const arr = Array.isArray(messages) ? messages : [];
    const unread = arr.filter(m => !m.read).length;
    const badge = $('#inbox-badge');
    if (badge) { badge.textContent = unread > 99 ? '99+' : String(unread); badge.classList.toggle('hidden', unread === 0); }
    if (!arr.length) { holder.innerHTML = '<div class="empty-table">收件箱是空的，暂无消息。</div>'; return; }
    holder.innerHTML = arr.map(m => `<article class="inbox-item ${m.read ? 'is-read' : ''}">
      <div class="inbox-head"><strong>${escapeHtml(m.title)}</strong>${m.read ? '' : '<span class="inbox-dot"></span>'}<small>${fmtDate(m.createdAt)}</small></div>
      <p>${escapeHtml(m.body)}</p>
    </article>`).join('');
  }

  async function loadInbox() {
    try {
      const data = await api('/api/inbox', { method: 'GET' });
      renderInbox(data.messages || []);
      return data.messages || [];
    } catch (error) { return []; }
  }

  // 进入网页时：若有未读消息，全屏提示
  function maybeShowInboxAlert(messages) {
    const arr = Array.isArray(messages) ? messages : [];
    const unread = arr.filter(m => !m.read);
    if (!unread.length) return;
    if (sessionStorage.getItem('inboxAlertDismissed') === '1') return; // 本会话已稍后
    const el = $('#inbox-alert'); if (!el) return;
    const count = $('#inbox-alert-count'), preview = $('#inbox-alert-preview');
    if (count) count.textContent = String(unread.length > 99 ? '99+' : unread.length);
    if (preview) {
      const latest = unread[0];
      preview.textContent = `${latest.title}：${latest.body}`;
      preview.classList.toggle('is-empty', !latest.body);
    }
    el.classList.remove('hidden');
  }

  const openInbox = $('#open-inbox');
  if (openInbox) openInbox.addEventListener('click', async () => {
    showModal('inbox-modal');
    await loadInbox();
  });
  const inboxAlertLater = $('#inbox-alert-later');
  if (inboxAlertLater) inboxAlertLater.addEventListener('click', () => {
    sessionStorage.setItem('inboxAlertDismissed', '1');
    hideBanScreen(); // 通用隐藏遮罩（收件箱提示复用同层逻辑）
    $('#inbox-alert')?.classList.add('hidden');
  });
  const inboxAlertView = $('#inbox-alert-view');
  if (inboxAlertView) inboxAlertView.addEventListener('click', async () => {
    $('#inbox-alert')?.classList.add('hidden');
    showModal('inbox-modal');
    try { await api('/api/inbox/read', { method: 'POST', body: JSON.stringify({ id: '*' }) }); } catch (error) {}
    await loadInbox();
  });
  const inboxClear = $('#inbox-clear');
  if (inboxClear) inboxClear.addEventListener('click', async () => {
    try {
      await api('/api/inbox/read', { method: 'POST', body: JSON.stringify({ id: '*' }) });
      showToast('已全部标记为已读。', 'success');
      await loadInbox();
    } catch (error) { showToast(error.message, 'error'); }
  });

  // ---------- 体验优化：BV 输入去空格，仅规范前缀为 BV，保留其余大小写（B站BV区分大小写） ----------
  $$('input[name="bvid"]').forEach(input => input.addEventListener('input', () => {
    const raw = input.value.replace(/\s+/g, '');
    let cleaned = raw;
    if (/^bv/i.test(raw)) cleaned = 'BV' + raw.slice(2); // bv1xx411c7mD → BV1xx411c7mD（前缀大写，其余保留）
    if (cleaned !== input.value) input.value = cleaned;
  }));

  // ---------- 版本号 + 更新日志（左上角） ----------
  const versionChip = $('#version-chip');
  if (versionChip) versionChip.addEventListener('click', () => showModal('changelog-modal'));

  // ---------- 快捷按键 ----------
  const quickAnnouncement = $('#quick-announcement');
  if (quickAnnouncement) quickAnnouncement.addEventListener('click', () => {
    const board = $('#announcement-board');
    if (board) { board.classList.remove('hidden'); board.scrollIntoView({ behavior: 'smooth', block: 'start' }); }
  });
  const quickGames = $('#quick-games');
  if (quickGames) quickGames.addEventListener('click', () => showModal('games-modal'));
  const quickInbox = $('#quick-inbox');
  if (quickInbox) quickInbox.addEventListener('click', async () => { showModal('inbox-modal'); await loadInbox(); });

  // ---------- 创建生日祝福 ----------
  const openBirthday = $('#open-birthday');
  if (openBirthday) openBirthday.addEventListener('click', () => {
    $('#birthday-result')?.classList.add('hidden');
    $('#birthday-link').textContent = '';
    state.birthdayTheme = null;
    const up = $('#birthday-upload'); if (up) up.value = '';
    const ust = $('#birthday-upload-status'); if (ust) { ust.textContent = ''; ust.className = 'ai-status'; }
    const bst = $('#birthday-bg-status'); if (bst) { bst.textContent = ''; bst.className = 'ai-status'; }
    const bu = $('#birthday-bg-upload'); if (bu) bu.value = '';
    const iu = $('#birthday-image-url'); if (iu) iu.value = '';
    showModal('birthday-modal');
  });
  // 风格选择 + 颜色联动
  const BDAY_STYLES = {
    classic: { bg: '#f2eee2', paper: '#fffdf7', accent: '#e23b2e', secondary: '#ffb800' },
    starry:  { bg: '#0d1124', paper: '#1a2140', accent: '#ffcf4d', secondary: '#7aa2ff' },
    pastel:  { bg: '#fdeef3', paper: '#fff8fa', accent: '#ff7ba9', secondary: '#ffd166' },
    forest:  { bg: '#10251a', paper: '#16301f', accent: '#ffd166', secondary: '#7ec8a3' },
    ocean:   { bg: '#0e2a38', paper: '#12384a', accent: '#ffd166', secondary: '#4fc3f7' },
    neon:    { bg: '#120a20', paper: '#1c1030', accent: '#ff4ea0', secondary: '#4df3ff' },
  };
  function applyStyleColors(style) {
    const s = BDAY_STYLES[style] || BDAY_STYLES.classic;
    const set = (id, v) => { const el = $(id); if (el) el.value = v; };
    set('#c-bg', s.bg); set('#c-paper', s.paper); set('#c-accent', s.accent); set('#c-secondary', s.secondary);
  }
  state.birthdayStyle = 'classic';
  $$('#birthday-style-picker .style-opt').forEach(btn => btn.addEventListener('click', () => {
    $$('#birthday-style-picker .style-opt').forEach(b => b.classList.remove('is-active'));
    btn.classList.add('is-active');
    state.birthdayStyle = btn.dataset.style;
    applyStyleColors(btn.dataset.style);
  }));
  applyStyleColors('classic');
  state.birthdayTheme = null;
  function compressImage(dataUrl) {
    return new Promise(resolve => {
      const img = new Image();
      img.onload = () => {
        const max = 480; const ratio = Math.min(1, max / Math.max(img.width, img.height));
        const c = document.createElement('canvas');
        c.width = Math.round(img.width * ratio); c.height = Math.round(img.height * ratio);
        c.getContext('2d').drawImage(img, 0, 0, c.width, c.height);
        try { resolve(c.toDataURL('image/jpeg', 0.8)); } catch { resolve(''); }
      };
      img.onerror = () => resolve('');
      img.src = dataUrl;
    });
  }
  function bindImageUpload(inputId, statusId, key, msg) {
    const el = $(inputId);
    if (!el) return;
    el.addEventListener('change', async () => {
      const file = el.files && el.files[0];
      const st = $(statusId);
      if (!file) return;
      if (!file.type.startsWith('image/')) { st.textContent = '⚠ 请选择图片文件'; st.className = 'ai-status err'; return; }
      if (file.size > 6 * 1024 * 1024) { st.textContent = '⚠ 图片过大（≤6MB）'; st.className = 'ai-status err'; return; }
      st.textContent = '处理中…'; st.className = 'ai-status';
      try {
        const dataUrl = await new Promise((res, rej) => { const fr = new FileReader(); fr.onload = () => res(fr.result); fr.onerror = rej; fr.readAsDataURL(file); });
        const compressed = await compressImage(dataUrl);
        if (!compressed) throw new Error('图片处理失败');
        if (!state.birthdayTheme) state.birthdayTheme = {};
        state.birthdayTheme[key] = compressed;
        st.textContent = msg; st.className = 'ai-status';
      } catch (e) { st.textContent = '⚠ ' + (e.message || '处理失败'); st.className = 'ai-status err'; }
    });
  }
  bindImageUpload('#birthday-upload', '#birthday-upload-status', 'image', '✅ 已上传，将作为贺图（请确保你对该图有使用权）');
  bindImageUpload('#birthday-bg-upload', '#birthday-bg-status', 'bgImage', '✅ 已导入，将作为祝福页底图');
  const birthdayCreate = $('#birthday-create');
  if (birthdayCreate) birthdayCreate.addEventListener('click', async () => {
    const name = $('#birthday-name').value.trim();
    const message = $('#birthday-message').value.trim();
    if (!name) { showToast('请填写寿星名字', 'error'); return; }
    birthdayCreate.disabled = true; birthdayCreate.textContent = '生成中…';
    try {
      // 组装主题：用户自定义颜色（默认选中风格）+ 贺图/底图/图片网址
      const theme = {};
      const val = id => ($(id) ? $(id).value : '');
      const col = { bg: val('#c-bg'), paper: val('#c-paper'), accent: val('#c-accent'), secondary: val('#c-secondary') };
      const hasColor = Object.values(col).some(v => /^#[0-9a-fA-F]{6}$/.test(v));
      if (hasColor) theme.palette = col;
      const urlImg = val('#birthday-image-url').trim();
      if (urlImg && /^https?:\/\/\S+\.(png|jpe?g|webp|gif|avif)(\?\S*)?$/i.test(urlImg)) theme.image = urlImg;
      if (state.birthdayTheme) {
        if (state.birthdayTheme.image) theme.image = state.birthdayTheme.image;
        if (state.birthdayTheme.bgImage) theme.bgImage = state.birthdayTheme.bgImage;
      }
      const body = { name, message, style: state.birthdayStyle };
      if (theme.palette || theme.image || theme.bgImage) body.theme = theme;
      const res = await api('/api/admin/birthdays', { method: 'POST', body: JSON.stringify(body) });
      const link = location.origin + '/birthday/' + res.token;
      $('#birthday-link').textContent = link;
      $('#birthday-result').classList.remove('hidden');
      state.birthdayLink = link;
      showToast('生日祝福已生成，可转发链接');
    } catch (error) { showToast(error.message, 'error'); }
    finally { birthdayCreate.disabled = false; birthdayCreate.textContent = '生成生日祝福'; }
  });
  const birthdayCopy = $('#birthday-copy');
  if (birthdayCopy) birthdayCopy.addEventListener('click', async () => {
    const link = $('#birthday-link').textContent;
    if (!link) return;
    try { await navigator.clipboard.writeText(link); showToast('链接已复制'); }
    catch { showToast('复制失败，请手动复制', 'error'); }
  });
  const birthdayOpen = $('#birthday-open');
  if (birthdayOpen) birthdayOpen.addEventListener('click', () => {
    const link = $('#birthday-link').textContent;
    if (link) window.open(link, '_blank');
  });

  // ---------- 启动 ----------
  refreshState();
  loadInbox().then(maybeShowInboxAlert); // 进入网页：有未读消息则全屏提示
})();

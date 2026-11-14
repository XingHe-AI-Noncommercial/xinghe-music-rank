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
  };

  // ---------- 本地预览数据（后端未连接时展示） ----------
  const demoTracks = [
    { id: 'd1', bvid: 'BV1xx411c7mD', artist: 'Luna / 虚构企划', title: '玻璃海的来信', createdAt: new Date(Date.now() - 3600e3).toISOString() },
    { id: 'd2', bvid: 'BV1Kz4y1D7mE', artist: '青空研究所', title: '凌晨四点的星尘', createdAt: new Date(Date.now() - 7200e3).toISOString() },
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
      renderPage();
      setConnection(false);
      if (showError) showToast(`当前显示本地预览：${error.message}`, 'error');
    } finally {
      state.loading = false;
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
    $('#metric-rejected').textContent = number(summary.rejected || 0);
    $('#metric-submit').textContent = submit.submittedToday ? '0' : '1';
    $('#metric-submit-sub').textContent = submit.submittedToday
      ? '今天已投过（每天每 IP 1 个）'
      : '今天还可投 1 个';
    $('#week-chip').textContent = `本周周期：${data.week || '—'} 起`;
    $('#list-total').textContent = `${number(data.songs?.length || 0)} 个`;
    renderList();
    renderSubmitStatus(submit);
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
      const biliUrl = song.biliUrl || `https://www.bilibili.com/video/${song.bvid}`;
      return `<article class="track-card lite-card">
        <span class="lite-rank">${String(index + 1).padStart(2, '0')}</span>
        <div class="track-info">
          <a class="track-title" href="${escapeHtml(biliUrl)}" target="_blank" rel="noopener noreferrer">${escapeHtml(song.title)}</a>
          <span class="track-artist">${escapeHtml(song.artist || '未知创作者')}</span>
          <span class="track-bv">${escapeHtml(song.bvid || '')}</span>
        </div>
        <a class="track-open" href="${escapeHtml(biliUrl)}" target="_blank" rel="noopener noreferrer" title="跳转 B 站播放">▶</a>
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

  $('#login-form').addEventListener('submit', async event => {
    event.preventDefault();
    const form = event.currentTarget;
    const button = form.querySelector('button[type="submit"]');
    const password = new FormData(form).get('password');
    button.disabled = true; button.textContent = '验证中…';
    try {
      await api('/api/admin/login', { method: 'POST', body: JSON.stringify({ password }) });
      state.adminLoggedIn = true; form.reset(); hideModal('admin-login-modal'); showModal('admin-modal');
      await loadAdminData(); showToast('已进入开发者模式。', 'success');
    } catch (error) { showToast(error.message, 'error'); }
    finally { button.disabled = false; button.innerHTML = '安全登录 <span>→</span>'; }
  });

  // ---------- 开发者后台 ----------
  async function loadAdminData() {
    try {
      state.adminData = await api('/api/admin/state', { method: 'GET' });
      renderAdmin();
    } catch (error) {
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
  }

  // 一键复制
  $('#copy-bv').addEventListener('click', async () => {
    const bvList = String(state.adminData?.bvList || '').trim();
    if (!bvList) { showToast('本周还没有已上架的作品。', 'error'); return; }
    try { await copyText(bvList); showToast(`已复制 ${bvList.split(',').filter(Boolean).length} 个 BV 号。`, 'success'); }
    catch { showToast('复制失败，请手动选择上方文本复制。', 'error'); }
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
    const id = button.dataset.id; const action = button.dataset.review; button.disabled = true;
    try {
      const result = await api(`/api/admin/submissions/${encodeURIComponent(id)}`, { method: 'POST', body: JSON.stringify({ action }) });
      showToast(result.message, 'success'); await loadAdminData(); await refreshState();
    } catch (error) { showToast(error.message, 'error'); button.disabled = false; }
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

  // ---------- 启动 ----------
  refreshState();
})();

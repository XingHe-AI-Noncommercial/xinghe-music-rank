(() => {
  'use strict';

  const $ = (selector, root = document) => root.querySelector(selector);
  const $$ = (selector, root = document) => Array.from(root.querySelectorAll(selector));

  const state = {
    data: null,
    realMode: false,
    loading: false,
    collectionSearch: '',
    vocadb: { items: [], loading: false, timer: null },
    adminData: null,
    adminLoggedIn: false,
    adminTab: 'overview',
    adminSidebarOpen: false,
  };

  // ---------- 本地预览数据（后端未连接时展示） ----------
  const demoVocaDB = [
    { id: 'd1', title: '玻璃海的来信', artist: 'Luna / 虚构企划', coverUrl: '', bvid: 'BV1xx411c7mD', biliUrl: 'https://www.bilibili.com/video/BV1xx411c7mD' },
    { id: 'd2', title: '凌晨四点的星尘', artist: '青空研究所', coverUrl: '', bvid: 'BV1Kz4y1D7mE', biliUrl: 'https://www.bilibili.com/video/BV1Kz4y1D7mE' },
    { id: 'd3', title: '把月亮调成静音', artist: 'NOVA', coverUrl: '', bvid: 'BV1GJ411x7h7', biliUrl: 'https://www.bilibili.com/video/BV1GJ411x7h7' },
    { id: 'd4', title: '再见之前的蓝色', artist: 'Mizuki', coverUrl: '', bvid: '', biliUrl: '' },
    { id: 'd5', title: '透明的夏天', artist: 'Echo Field', coverUrl: '', bvid: 'BV1N7411Z7bP', biliUrl: 'https://www.bilibili.com/video/BV1N7411Z7bP' },
    { id: 'd6', title: '第七颗流星', artist: '白昼梦工厂', coverUrl: '', bvid: '', biliUrl: '' },
  ];
  const demoTracks = [
    { id: 't1', title: '玻璃海的来信', artist: 'Luna / 虚构企划', coverUrl: '', bvid: 'BV1xx411c7mD', biliUrl: 'https://www.bilibili.com/video/BV1xx411c7mD', votes: 42, createdAt: new Date(Date.now() - 86400000).toISOString() },
    { id: 't2', title: '凌晨四点的星尘', artist: '青空研究所', coverUrl: '', bvid: 'BV1Kz4y1D7mE', biliUrl: 'https://www.bilibili.com/video/BV1Kz4y1D7mE', votes: 31, createdAt: new Date(Date.now() - 2 * 86400000).toISOString() },
    { id: 't3', title: '把月亮调成静音', artist: 'NOVA', coverUrl: '', bvid: 'BV1GJ411x7h7', biliUrl: 'https://www.bilibili.com/video/BV1GJ411x7h7', votes: 18, createdAt: new Date(Date.now() - 3 * 86400000).toISOString() },
    { id: 't5', title: '透明的夏天', artist: 'Echo Field', coverUrl: '', bvid: 'BV1N7411Z7bP', biliUrl: 'https://www.bilibili.com/video/BV1N7411Z7bP', votes: 9, createdAt: new Date(Date.now() - 4 * 86400000).toISOString() },
  ];

  // ---------- 基础工具 ----------
  function escapeHtml(value) {
    return String(value ?? '').replace(/[&<>"']/g, ch => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[ch]));
  }
  function number(value) { return Number(value || 0).toLocaleString('zh-CN'); }
  function fmtDateTime(value) {
    if (!value) return '—';
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) return String(value).slice(0, 10);
    return new Intl.DateTimeFormat('zh-CN', { timeZone: 'Asia/Shanghai', year: 'numeric', month: '2-digit', day: '2-digit' }).format(date);
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
    if (!response.ok || payload?.ok === false) throw new Error(payload?.error || `请求失败（${response.status}）。`);
    return payload;
  }
  function coverHtml(url, cls = '') {
    const u = String(url || '').trim();
    if (u) return `<img class="cover-img ${cls}" src="${escapeHtml(u)}" alt="" loading="lazy" referrerpolicy="no-referrer">`;
    return `<span class="cover-fallback ${cls}">♪</span>`;
  }

  // ---------- 数据加载 ----------
  function seedPreview(reason) {
    return {
      ok: true, preview: true, reason: reason || '',
      songs: demoTracks,
      summary: { songCount: demoTracks.length, pendingCount: 2, totalVotes: 100, cacheCount: 0 },
      voting: { dailyVotes: 30, songCap: 15, totalUsed: 4, totalRemaining: 26, songVotes: { t1: 3, t2: 1 } },
    };
  }
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
    tag.title = connected ? '已连接数据库，显示真实收藏列表' : '后端暂未连通：以下为本地示例数据，不是真实收藏';
  }

  // ---------- 页面渲染 ----------
  function renderPage() {
    const data = state.data || seedPreview();
    const voting = data.voting || { dailyVotes: 30, songCap: 15, totalRemaining: 0, songVotes: {} };
    $('#week-label').textContent = state.realMode ? '实时收录' : '本地预览';
    $('#metric-songs').textContent = number(data.summary?.songCount ?? data.songs?.length ?? 0);
    $('#metric-pending').textContent = number(data.summary?.pendingCount || 0);
    $('#metric-votes').textContent = number(data.summary?.totalVotes || 0);
    $('#metric-remain').textContent = `${number(voting.totalRemaining)}`;
    $('#metric-remain-sub').textContent = `今日可投 / 上限 ${number(voting.dailyVotes)}`;
    $('#current-year').textContent = String(new Date().getFullYear());
    $('#collection-total').textContent = `${number(data.songs?.length || 0)} 首`;
    renderVotingBanner(voting);
    renderCollection();
  }

  function renderVotingBanner(voting) {
    const totalRemaining = Number(voting.totalRemaining || 0);
    $('#voting-title').textContent = `今日剩余 ${number(totalRemaining)} 票`;
    $('#voting-desc').textContent = totalRemaining > 0
      ? `每人每天 ${voting.dailyVotes} 票，同一首歌每天最多 ${voting.songCap} 票；北京时间 00:00 重置。`
      : '你今天的票已用完，明天（北京时间 00:00）重置后再来。';
    $('#voting-banner').classList.toggle('is-closed', totalRemaining <= 0);
    $('#voting-banner').classList.toggle('is-open', totalRemaining > 0);
  }

  function voteLimit(song, data) {
    const voting = data.voting || { songCap: 15, totalRemaining: 0, songVotes: {} };
    const songUsed = Number(voting.songVotes?.[song.id] || 0);
    const songRemain = Math.max(0, Number(voting.songCap || 15) - songUsed);
    const totalRemain = Number(voting.totalRemaining || 0);
    return { songUsed, songRemain, totalRemain, max: Math.min(songRemain, totalRemain) };
  }

  function trackCard(song, data) {
    const v = voteLimit(song, data);
    const disabled = v.max <= 0;
    const hint = disabled
      ? (v.totalRemain <= 0 ? '今日票已用完' : `今日已达单曲上限（${v.songUsed}/${data.voting?.songCap}）`)
      : `今日已投 ${v.songUsed} 票 / 单曲上限 ${data.voting?.songCap}`;
    return `<div class="track-card" data-song-card="${escapeHtml(song.id)}">
      <a class="track-cover-link" href="${escapeHtml(song.biliUrl || '#')}" target="_blank" rel="noopener noreferrer" title="跳转 B 站播放 ${escapeHtml(song.title)}">
        <div class="track-cover">${coverHtml(song.coverUrl)}</div>
        <span class="track-play" aria-hidden="true">▶</span>
      </a>
      <div class="track-info">
        <a class="track-title" href="${escapeHtml(song.biliUrl || '#')}" target="_blank" rel="noopener noreferrer" title="${escapeHtml(song.title)}">${escapeHtml(song.title)}</a>
        <span class="track-artist">${escapeHtml(song.artist || '未知创作者')}</span>
        <span class="track-bv">${escapeHtml(song.bvid || '')}</span>
      </div>
      <div class="track-votes-row">
        <span class="track-votes"><strong>${number(song.votes)}</strong> 票</span>
        <div class="vote-control">
          <input class="vote-amount" type="number" min="1" max="${Math.max(1, v.max)}" value="1" aria-label="投票数量" data-song="${escapeHtml(song.id)}">
          <button class="vote-btn" data-vote="${escapeHtml(song.id)}" ${disabled ? 'disabled' : ''} title="${escapeHtml(hint)}">投票</button>
        </div>
        <span class="track-vote-hint">${escapeHtml(hint)}</span>
      </div>
    </div>`;
  }

  function renderCollection() {
    const data = state.data || seedPreview();
    const filter = state.collectionSearch.trim().toLowerCase();
    const songs = (data.songs || []).filter(s => `${s.title || ''} ${s.artist || ''}`.toLowerCase().includes(filter));
    $('#ranking-count').textContent = filter ? `找到 ${songs.length} 首` : `共 ${number(data.songs?.length || 0)} 首`;
    $('#empty-search').classList.toggle('hidden', songs.length !== 0);
    const grid = $('#collection-grid');
    if (!songs.length) { grid.innerHTML = ''; return; }
    grid.innerHTML = songs.map(song => trackCard(song, data)).join('');
  }

  // ---------- VocaDB 搜索（500ms 防抖） ----------
  function setVocadbStatus(text, type = '') {
    const node = $('#vocadb-status');
    node.textContent = text;
    node.className = `search-status ${type}`;
  }
  function renderVocadbResults(items) {
    const holder = $('#vocadb-results');
    if (!items.length) {
      holder.innerHTML = state.realMode
        ? '<div class="vocadb-empty">没有匹配的 VocaDB 曲目，试试其他关键词。</div>'
        : '<div class="vocadb-empty">本地预览没有更多结果；连接数据库后即可调用 VocaDB。</div>';
      return;
    }
    holder.innerHTML = items.map(item => {
      const hasBili = Boolean(item.bvid);
      const cls = hasBili ? 'vocadb-card' : 'vocadb-card is-unavailable';
      const badge = hasBili ? `<span class="vocadb-bv">${escapeHtml(item.bvid)}</span>` : '<span class="vocadb-nobv">无B站源</span>';
      return `<button class="${cls}" data-vocadb-index="${escapeHtml(item.id)}" type="button" ${hasBili ? '' : 'disabled'} title="${hasBili ? '点击提交审核' : '该曲目没有可用的 B 站视频源，无法收录'}">
        <span class="vocadb-cover">${coverHtml(item.coverUrl)}</span>
        <span class="vocadb-copy"><strong>${escapeHtml(item.title)}</strong><small>${escapeHtml(item.artist)}</small></span>
        <span class="vocadb-pick">${hasBili ? '提交 →' : '×'}</span>
        ${badge}
      </button>`;
    }).join('');
  }
  function runSearch(q) {
    if (!state.realMode) {
      const items = demoVocaDB.filter(it => `${it.title} ${it.artist}`.toLowerCase().includes(q.toLowerCase()));
      state.vocadb.items = items;
      renderVocadbResults(items);
      setVocadbStatus(`预览模式：本地返回 ${items.length} 条（连接数据库后调用 VocaDB 接口）。`);
      return;
    }
    if (state.vocadb.loading) return;
    state.vocadb.loading = true;
    setVocadbStatus('正在检索 VocaDB…');
    api(`/api/search?q=${encodeURIComponent(q)}`, { method: 'GET' })
      .then(data => {
        state.vocadb.items = data.items || [];
        renderVocadbResults(state.vocadb.items);
        setVocadbStatus(data.cached
          ? `已从缓存返回 ${state.vocadb.items.length} 条结果。`
          : `VocaDB 返回 ${state.vocadb.items.length} 条结果。`);
      })
      .catch(error => {
        state.vocadb.items = [];
        renderVocadbResults([]);
        setVocadbStatus(error.message, 'error');
      })
      .finally(() => { state.vocadb.loading = false; });
  }

  // ---------- 弹窗 ----------
  function showModal(id) { const node = document.getElementById(id); if (node) { node.classList.remove('hidden'); document.body.style.overflow = 'hidden'; } }
  function hideModal(id) { const node = document.getElementById(id); if (node) node.classList.add('hidden'); if (!$('.modal-backdrop:not(.hidden)')) document.body.style.overflow = ''; }

  // ---------- 选中 VocaDB 曲目 → 提交（封面/BV 自动带出） ----------
  let selectedItem = null;
  function fillSubmitForm(item = null) {
    selectedItem = item;
    const selected = $('#submit-selected');
    if (item) {
      selected.classList.remove('hidden');
      selected.innerHTML = `<span class="selected-cover">${coverHtml(item.coverUrl, 'small')}</span><span class="selected-copy"><strong>${escapeHtml(item.title)}</strong><small>${escapeHtml(item.artist)}</small></span>`;
      $('#submit-bvid').textContent = item.bvid || '—';
      $('#submit-bili').textContent = item.biliUrl || '—';
    } else {
      selected.classList.add('hidden');
      selected.innerHTML = '';
      $('#submit-bvid').textContent = '—';
      $('#submit-bili').textContent = '—';
    }
  }

  // ---------- 事件绑定 ----------
  $('#vocadb-search').addEventListener('input', event => {
    clearTimeout(state.vocadb.timer);
    const q = event.target.value.trim();
    if (!q) { state.vocadb.items = []; renderVocadbResults([]); setVocadbStatus('输入关键词，从 VocaDB 曲库检索（自动匹配 B 站源与封面）。'); return; }
    setVocadbStatus('正在检索…');
    state.vocadb.timer = setTimeout(() => runSearch(q), 500);
  });

  $('#vocadb-results').addEventListener('click', event => {
    const card = event.target.closest('[data-vocadb-index]');
    if (!card || card.disabled) return;
    const item = state.vocadb.items.find(it => it.id === card.dataset.vocadbIndex);
    if (!item || !item.bvid) return;
    fillSubmitForm(item);
    showModal('submit-modal');
  });

  $('#collection-search').addEventListener('input', event => { state.collectionSearch = event.target.value; renderCollection(); });
  $('#refresh-button').addEventListener('click', () => refreshState(true));

  // 提交审核
  $('#submit-form').addEventListener('submit', async event => {
    event.preventDefault();
    if (!selectedItem) { showToast('请先从 VocaDB 选择一首曲目。', 'error'); return; }
    const button = event.currentTarget.querySelector('button[type="submit"]');
    button.disabled = true; button.textContent = '正在提交…';
    try {
      const result = await api('/api/submit', {
        method: 'POST',
        body: JSON.stringify({
          title: selectedItem.title,
          artist: selectedItem.artist,
          coverUrl: selectedItem.coverUrl,
          bvid: selectedItem.bvid,
          biliUrl: selectedItem.biliUrl,
        }),
      });
      showToast(result.message || '已提交，等待审核。', 'success');
      hideModal('submit-modal');
      $('#vocadb-search').value = '';
      state.vocadb.items = []; renderVocadbResults([]); setVocadbStatus('输入关键词，从 VocaDB 曲库检索（自动匹配 B 站源与封面）。');
      await refreshState();
      if (state.adminLoggedIn) await loadAdminData();
    } catch (error) { showToast(error.message, 'error'); }
    finally { button.disabled = false; button.innerHTML = '提交审核 <span>→</span>'; }
  });

  // 投票
  $('#collection-grid').addEventListener('click', async event => {
    const button = event.target.closest('[data-vote]');
    if (!button) return;
    if (!state.realMode) { showToast('目前是本地预览模式，请先完成 Cloudflare D1 配置。', 'error'); return; }
    const songId = button.dataset.vote;
    const input = $(`input[data-song="${CSS.escape(songId)}"]`);
    const amount = Math.max(1, Math.floor(Number(input?.value || 1)));
    button.disabled = true;
    try {
      const result = await api('/api/vote', { method: 'POST', body: JSON.stringify({ songId, amount }) });
      showToast(result.message, 'success');
      await refreshState();
    } catch (error) { showToast(error.message, 'error'); button.disabled = false; }
  });

  $('#open-submit').addEventListener('click', () => {
    showModal('submit-modal');
    // 未选择曲目时提示
    if (!selectedItem) showToast('请先在「提交歌曲」搜索并选择一首 VocaDB 曲目。', 'normal');
  });
  $('#open-admin').addEventListener('click', async () => {
    if (state.adminLoggedIn) { showModal('admin-modal'); await loadAdminData(); }
    else showModal('admin-login-modal');
  });
  $$('[data-close]').forEach(button => button.addEventListener('click', () => hideModal(button.dataset.close)));
  $$('.modal-backdrop').forEach(backdrop => backdrop.addEventListener('click', event => { if (event.target === backdrop && backdrop.id !== 'admin-modal') hideModal(backdrop.id); }));
  document.addEventListener('keydown', event => { if (event.key === 'Escape') $$('.modal-backdrop:not(.hidden)').forEach(modal => { if (modal.id !== 'admin-modal') hideModal(modal.id); }); });

  $('#login-form').addEventListener('submit', async event => {
    event.preventDefault();
    const form = event.currentTarget;
    const button = form.querySelector('button[type="submit"]');
    const password = new FormData(form).get('password');
    button.disabled = true; button.textContent = '验证中…';
    try {
      await api('/api/admin/login', { method: 'POST', body: JSON.stringify({ password }) });
      state.adminLoggedIn = true; form.reset(); hideModal('admin-login-modal'); showModal('admin-modal');
      await loadAdminData(); showToast('已安全登录管理后台。', 'success');
    } catch (error) { showToast(error.message, 'error'); }
    finally { button.disabled = false; button.innerHTML = '安全登录 <span>→</span>'; }
  });

  // ---------- 管理后台 ----------
  async function loadAdminData() {
    try {
      state.adminData = await api('/api/admin/state', { method: 'GET' });
      renderAdmin();
    } catch (error) {
      showToast(error.message, 'error');
      if (/登录|会话/.test(error.message)) { state.adminLoggedIn = false; hideModal('admin-modal'); showModal('admin-login-modal'); }
    }
  }
  function selectAdminTab(tab) {
    state.adminTab = tab;
    const names = { overview: '总览面板', submissions: '投稿审核', songs: '歌曲管理', import: '批量导入' };
    $('#admin-current-tab').textContent = names[tab] || names.overview;
    $('#admin-title').textContent = ({ overview: '总览面板', submissions: '投稿审核中心', songs: '歌曲管理', import: '批量导入' })[tab] || '总览面板';
    $('#admin-page-desc').textContent = ({ overview: '查看收录与审核状态，快速添加歌曲。', submissions: '审核用户提交的歌曲，通过后才上榜。', songs: '管理所有收藏歌曲，可删除。', import: '用 .json 或 .txt 文件批量导入（直接通过）。' })[tab] || '';
    $$('.admin-nav').forEach(button => button.classList.toggle('active', button.dataset.adminTab === tab));
    $$('.admin-view').forEach(view => view.classList.toggle('hidden', view.id !== `admin-view-${tab}`));
    $('.admin-shell').classList.remove('sidebar-open');
    state.adminSidebarOpen = false;
  }
  $$('.admin-nav').forEach(button => button.addEventListener('click', () => selectAdminTab(button.dataset.adminTab)));
  $('#admin-mobile-menu').addEventListener('click', () => { state.adminSidebarOpen = !state.adminSidebarOpen; $('.admin-shell').classList.toggle('sidebar-open', state.adminSidebarOpen); });
  $('#admin-refresh').addEventListener('click', loadAdminData);
  $('#admin-logout').addEventListener('click', async () => {
    try { await api('/api/admin/logout', { method: 'POST', body: JSON.stringify({}) }); } catch { /* 清理过期会话仍有用 */ }
    state.adminLoggedIn = false; state.adminData = null; hideModal('admin-modal'); showToast('已退出管理后台。');
  });

  function renderAdmin() {
    const data = state.adminData; if (!data) return;
    const s = data.summary || {};
    $('#admin-pending-badge').textContent = number(s.pending || 0);
    $('#submissions-count-pill').textContent = `${number(s.pending || 0)} 待处理`;
    $('#admin-kpi-grid').innerHTML = [
      ['已收录', number(s.approved), '审核通过的歌曲', '♫'],
      ['待审核', number(s.pending), '等待管理员处理', '⏳'],
      ['总票数', number(s.totalVotes), '累计投出的票', '✧'],
      ['已拒绝', number(s.rejected), '未通过的投稿', '×'],
    ].map(([label, value, desc, icon]) => `<article class="admin-kpi"><div class="admin-kpi-top"><span>${label}</span><span>${icon}</span></div><strong>${value}</strong><small>${desc}</small></article>`).join('');
    renderAdminSubmissions(data.pending || []);
    renderAdminSongs(data.songs || []);
  }

  function renderAdminSubmissions(pending) {
    const holder = $('#admin-submissions-list'); if (!holder) return;
    if (!pending.length) { holder.innerHTML = '<div class="empty-table">没有待审核的投稿。新的投稿会显示在这里。</div>'; return; }
    holder.innerHTML = pending.map(s => `<article class="submission-item">
      <span class="submission-cover">${coverHtml(s.coverUrl, 'small')}</span>
      <div class="submission-copy"><strong>${escapeHtml(s.title)}</strong><p>${escapeHtml(s.artist || '未知创作者')}</p><small>BV：${escapeHtml(s.bvid)} · 提交：${fmtDateTime(s.createdAt)}</small></div>
      <div class="submission-actions"><button class="tiny-button approve" data-review="approve" data-id="${escapeHtml(s.id)}">通过</button><button class="tiny-button reject" data-review="reject" data-id="${escapeHtml(s.id)}">拒绝</button></div>
    </article>`).join('');
  }

  function renderAdminSongs(songs) {
    const holder = $('#admin-songs-table'); if (!holder) return;
    const query = ($('#admin-song-search')?.value || '').toLowerCase().trim();
    const list = songs.filter(s => `${s.title || ''} ${s.bvid || ''}`.toLowerCase().includes(query));
    if (!list.length) { holder.innerHTML = '<div class="empty-table">没有匹配的歌曲。</div>'; return; }
    const statusBadge = st => ({ approved: '已通过', pending: '待审核', rejected: '已拒绝' }[st] || st);
    const statusCls = st => st === 'approved' ? 'new' : st === 'pending' ? 'down' : '';
    holder.innerHTML = `<table class="admin-table"><thead><tr><th>封面</th><th>歌名 / 歌手</th><th>B 站 BV 号</th><th>票数</th><th>状态</th><th>收录时间</th><th>操作</th></tr></thead><tbody>${list.map(song => `
      <tr>
        <td><span class="admin-thumb">${coverHtml(song.coverUrl, 'tiny')}</span></td>
        <td><strong>${escapeHtml(song.title)}</strong><br><span style="color:#676a80;font-size:8px">${escapeHtml(song.artist || '未知创作者')}</span></td>
        <td>${escapeHtml(song.bvid)}</td>
        <td><strong>${number(song.votes)}</strong></td>
        <td><span class="change-pill ${statusCls(song.status)}">${escapeHtml(statusBadge(song.status))}</span></td>
        <td>${fmtDateTime(song.createdAt)}</td>
        <td><button class="inline-action danger" data-song-delete="${escapeHtml(song.id)}">删除</button></td>
      </tr>`).join('')}</tbody></table>`;
  }
  $('#admin-song-search').addEventListener('input', () => { if (state.adminData) renderAdminSongs(state.adminData.songs || []); });

  $('#admin-add-form').addEventListener('submit', async event => {
    event.preventDefault();
    const form = event.currentTarget; const button = form.querySelector('button[type="submit"]');
    button.disabled = true; button.textContent = '正在添加…';
    try {
      const result = await api('/api/admin/songs', { method: 'POST', body: JSON.stringify(Object.fromEntries(new FormData(form).entries())) });
      form.reset(); showToast(result.message, 'success'); await loadAdminData(); await refreshState();
    } catch (error) { showToast(error.message, 'error'); }
    finally { button.disabled = false; button.textContent = '＋ 直接收录'; }
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
    if (!confirm('确定删除这首歌曲吗？相关票数会一并清除。')) return;
    button.disabled = true;
    try {
      const result = await api(`/api/admin/songs/${encodeURIComponent(button.dataset.songDelete)}`, { method: 'DELETE' });
      showToast(result.message, 'success'); await loadAdminData(); await refreshState();
    } catch (error) { showToast(error.message, 'error'); button.disabled = false; }
  });

  // ---------- 批量导入 ----------
  $('#import-file').addEventListener('change', event => {
    const file = event.target.files?.[0];
    const label = $('#import-file-name');
    if (!file) { label.textContent = '选择 .json / .txt 文件'; return; }
    label.textContent = file.name;
    const reader = new FileReader();
    reader.onload = () => {
      const text = String(reader.result || '');
      $('#import-content').value = text;
      const ext = file.name.split('.').pop().toLowerCase();
      if (ext === 'json' || ext === 'txt') $('#import-format').value = ext;
      else $('#import-format').value = 'auto';
      $('#import-result').classList.add('hidden');
    };
    reader.readAsText(file, 'utf-8');
  });
  $('#import-content').addEventListener('input', () => $('#import-result').classList.add('hidden'));

  $('#import-run').addEventListener('click', async () => {
    const content = ($('#import-content').value || '').trim();
    if (!content) { showToast('请先选择文件或粘贴内容。', 'error'); return; }
    let format = $('#import-format').value;
    if (format === 'auto') format = /^[\s]*[\[{]/.test(content) ? 'json' : 'txt';
    const button = $('#import-run');
    button.disabled = true; button.textContent = '正在导入…';
    try {
      const result = await api('/api/admin/import', { method: 'POST', body: JSON.stringify({ format, content }) });
      showToast(result.message, 'success');
      const box = $('#import-result');
      box.classList.remove('hidden');
      box.innerHTML = `<strong>${escapeHtml(result.message)}</strong>${result.errors?.length ? `<ul>${result.errors.slice(0, 20).map(e => `<li>${escapeHtml(e.title)}：${escapeHtml(e.error)}</li>`).join('')}</ul>` : ''}`;
      await loadAdminData(); await refreshState();
    } catch (error) { showToast(error.message, 'error'); }
    finally { button.disabled = false; button.textContent = '⇪ 开始导入'; }
  });

  // ---------- 启动 ----------
  refreshState();
})();

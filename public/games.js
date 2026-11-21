// ============================================================================
// 星河音浪榜 · 小游戏（经典合集）
// 纯原生 JS，无需后端。贪吃蛇 / 2048 / 俄罗斯方块 / 扫雷 / 五子棋 / 记忆翻牌 / 井字棋 / 猜数字
// ============================================================================
(() => {
  'use strict';
  const $ = (s, r = document) => r.querySelector(s);
  const $$ = (s, r = document) => Array.from(r.querySelectorAll(s));
  const clamp = (v, a, b) => Math.max(a, Math.min(b, v));

  // ---------- 弹窗工具 ----------
  function showModal(id) { const n = document.getElementById(id); if (n) { n.classList.remove('hidden'); document.body.style.overflow = 'hidden'; } }
  function hideModal(id) { const n = document.getElementById(id); if (n) n.classList.add('hidden'); if (!$('.modal-backdrop:not(.hidden)')) document.body.style.overflow = ''; }
  $$('[data-close]').forEach(b => b.addEventListener('click', () => hideModal(b.dataset.close)));
  document.addEventListener('keydown', e => {
    if (e.key === 'Escape') $$('.modal-backdrop:not(.hidden)').forEach(m => hideModal(m.id));
    if (e.key === 'ArrowLeft' || e.key === 'ArrowRight' || e.key === 'ArrowUp' || e.key === 'ArrowDown' || e.key === ' ') e.preventDefault();
  });

  // ---------- 单个游戏舞台 ----------
  let activeGame = null; // { stop() }
  function openGame(id, title, desc, render) {
    $('#game-title').textContent = title;
    $('#game-desc').textContent = desc || '';
    const stage = $('#game-stage');
    if (activeGame) { try { activeGame.stop(); } catch {} }
    stage.innerHTML = '';
    showModal('game-modal');
    activeGame = render(stage);
  }
  function closeGame() {
    if (activeGame) { try { activeGame.stop(); } catch {} activeGame = null; }
    hideModal('game-modal');
  }
  $('#game-close').addEventListener('click', closeGame);
  const gameModal = $('#game-modal');
  gameModal.addEventListener('click', e => { if (e.target === gameModal) closeGame(); });
  // 重新开始按钮（各游戏自行绑定 #game-restart）

  // 触屏滑动方向
  function bindSwipe(el, handler) {
    let sx = 0, sy = 0, active = false;
    el.addEventListener('touchstart', e => { sx = e.touches[0].clientX; sy = e.touches[0].clientY; active = true; }, { passive: true });
    el.addEventListener('touchend', e => {
      if (!active) return; active = false;
      const dx = e.changedTouches[0].clientX - sx, dy = e.changedTouches[0].clientY - sy;
      if (Math.abs(dx) < 20 && Math.abs(dy) < 20) return;
      if (Math.abs(dx) > Math.abs(dy)) handler(dx > 0 ? 'right' : 'left');
      else handler(dy > 0 ? 'down' : 'up');
    }, { passive: true });
  }

  function btn(text, id) {
    const b = document.createElement('button');
    b.className = 'game-btn'; b.textContent = text;
    if (id) b.id = id;
    return b;
  }
  function restartBtn(stage, fn) {
    const b = btn('↻ 重新开始', 'game-restart');
    b.addEventListener('click', fn);
    stage.appendChild(b);
  }
  function status(stage) {
    const s = document.createElement('div');
    s.className = 'game-status';
    stage.appendChild(s);
    return s;
  }

  // ============================================================
  // 贪吃蛇
  // ============================================================
  function openSnake(stage) {
    const N = 18, cell = Math.floor(300 / N);
    const cvs = document.createElement('canvas'); cvs.width = N * cell; cvs.height = N * cell; cvs.className = 'game-canvas';
    const ctx = cvs.getContext('2d');
    const st = status(stage);
    let snake, dir, nextDir, food, score, timer, over = false;
    function reset() {
      snake = [{ x: 8, y: 9 }, { x: 7, y: 9 }, { x: 6, y: 9 }];
      dir = 'right'; nextDir = 'right'; score = 0; over = false;
      spawnFood(); if (timer) clearInterval(timer);
      st.textContent = '得分：0';
      draw();
    }
    function spawnFood() {
      do { food = { x: Math.floor(Math.random() * N), y: Math.floor(Math.random() * N) }; } while (snake.some(s => s.x === food.x && s.y === food.y));
    }
    function draw() {
      ctx.fillStyle = '#0c0e16'; ctx.fillRect(0, 0, cvs.width, cvs.height);
      ctx.fillStyle = 'rgba(255,255,255,.04)';
      for (let i = 0; i < N; i++) for (let j = 0; j < N; j++) if ((i + j) % 2) ctx.fillRect(i * cell, j * cell, cell, cell);
      ctx.fillStyle = '#ff5d7e';
      ctx.beginPath(); ctx.arc(food.x * cell + cell / 2, food.y * cell + cell / 2, cell / 2 - 2, 0, Math.PI * 2); ctx.fill();
      snake.forEach((s, i) => {
        ctx.fillStyle = i === 0 ? '#7ed9ff' : '#3f8cff';
        const pad = i === 0 ? 1 : 2;
        ctx.fillRect(s.x * cell + pad, s.y * cell + pad, cell - pad * 2, cell - pad * 2);
      });
      if (over) { ctx.fillStyle = 'rgba(0,0,0,.6)'; ctx.fillRect(0, 0, cvs.width, cvs.height); ctx.fillStyle = '#fff'; ctx.font = 'bold 20px sans-serif'; ctx.textAlign = 'center'; ctx.fillText('游戏结束', cvs.width / 2, cvs.height / 2); }
    }
    function step() {
      if (over) return;
      dir = nextDir;
      const head = { x: snake[0].x, y: snake[0].y };
      if (dir === 'up') head.y--; if (dir === 'down') head.y++; if (dir === 'left') head.x--; if (dir === 'right') head.x++;
      if (head.x < 0 || head.y < 0 || head.x >= N || head.y >= N || snake.some(s => s.x === head.x && s.y === head.y)) { over = true; draw(); return; }
      snake.unshift(head);
      if (head.x === food.x && head.y === food.y) { score += 10; st.textContent = `得分：${score}`; spawnFood(); }
      else snake.pop();
      draw();
    }
    function dirOf(k) {
      if ((k === 'ArrowUp' || k === 'w') && dir !== 'down') nextDir = 'up';
      if ((k === 'ArrowDown' || k === 's') && dir !== 'up') nextDir = 'down';
      if ((k === 'ArrowLeft' || k === 'a') && dir !== 'right') nextDir = 'left';
      if ((k === 'ArrowRight' || k === 'd') && dir !== 'left') nextDir = 'right';
    }
    const key = e => dirOf(e.key);
    document.addEventListener('keydown', key);
    bindSwipe(cvs, d => { const m = { up: 'up', down: 'down', left: 'left', right: 'right' }[d]; if (m) nextDir = m; });
    stage.appendChild(cvs); stage.appendChild(st); restartBtn(stage, reset);
    reset(); timer = setInterval(step, 120);
    return { stop() { clearInterval(timer); document.removeEventListener('keydown', key); } };
  }

  // ============================================================
  // 2048
  // ============================================================
  function open2048(stage) {
    const st = status(stage);
    const wrap = document.createElement('div'); wrap.className = 'g2048-wrap';
    const grid = document.createElement('div'); grid.className = 'g2048-grid';
    const score = document.createElement('div'); score.className = 'game-status'; score.textContent = '得分：0';
    let board, over = false;
    function reset() { board = [[0,0,0,0],[0,0,0,0],[0,0,0,0],[0,0,0,0]]; over = false; spawn(); spawn(); render(); }
    function spawn() {
      const empty = [];
      for (let i = 0; i < 4; i++) for (let j = 0; j < 4; j++) if (!board[i][j]) empty.push([i, j]);
      if (!empty.length) return;
      const [i, j] = empty[Math.floor(Math.random() * empty.length)];
      board[i][j] = Math.random() < 0.9 ? 2 : 4;
    }
    function render() {
      grid.innerHTML = '';
      for (let i = 0; i < 4; i++) for (let j = 0; j < 4; j++) {
        const v = board[i][j];
        const c = document.createElement('div');
        c.className = 'g2048-tile' + (v ? ' v' + v : '');
        c.textContent = v || '';
        grid.appendChild(c);
      }
      let s = 0; board.forEach(r => r.forEach(v => s += v));
      score.textContent = `得分：${s}`;
    }
    function slide(row) {
      const arr = row.filter(v => v);
      for (let i = 0; i < arr.length - 1; i++) if (arr[i] === arr[i + 1]) { arr[i] *= 2; arr[i + 1] = 0; i++; }
      const out = arr.filter(v => v);
      while (out.length < 4) out.push(0);
      return out;
    }
    function move(d) {
      if (over) return;
      let changed = false;
      const rotated = d === 'up' || d === 'down';
      const reverse = d === 'right' || d === 'down';
      const get = (i, j) => rotated ? board[j][i] : board[i][j];
      const set = (i, j, v) => { if (rotated) board[j][i] = v; else board[i][j] = v; };
      for (let i = 0; i < 4; i++) {
        let row = []; for (let j = 0; j < 4; j++) row.push(get(i, j));
        if (reverse) row.reverse();
        const old = row.slice();
        row = slide(row);
        if (reverse) row.reverse();
        if (row.some((v, j) => v !== old[j])) changed = true;
        for (let j = 0; j < 4; j++) set(i, j, row[j]);
      }
      if (changed) { spawn(); render(); checkOver(); }
    }
    function checkOver() {
      for (let i = 0; i < 4; i++) for (let j = 0; j < 4; j++) {
        if (!board[i][j]) return;
        if (i < 3 && board[i][j] === board[i + 1][j]) return;
        if (j < 3 && board[i][j] === board[i][j + 1]) return;
      }
      over = true; st.textContent = '无法移动，游戏结束！';
    }
    const key = e => { const m = { ArrowUp: 'up', ArrowDown: 'down', ArrowLeft: 'left', ArrowRight: 'right' }[e.key]; if (m) move(m); };
    document.addEventListener('keydown', key);
    bindSwipe(grid, move);
    wrap.appendChild(score); wrap.appendChild(grid);
    stage.appendChild(wrap); restartBtn(stage, reset);
    reset();
    return { stop() { document.removeEventListener('keydown', key); } };
  }

  // ============================================================
  // 俄罗斯方块
  // ============================================================
  function openTetris(stage) {
    const W = 10, H = 20, cell = 16;
    const cvs = document.createElement('canvas'); cvs.width = W * cell; cvs.height = H * cell; cvs.className = 'game-canvas';
    const ctx = cvs.getContext('2d');
    const st = status(stage);
    const SHAPES = [
      [[1,1,1,1]],
      [[1,1],[1,1]],
      [[0,1,0],[1,1,1]],
      [[1,0,0],[1,1,1]],
      [[0,0,1],[1,1,1]],
      [[0,1,1],[1,1,0]],
      [[1,1,0],[0,1,1]],
    ];
    const COLORS = ['#7ed9ff', '#ffd166', '#c084fc', '#ff6b9d', '#6ee7b7', '#fca5a5', '#93c5fd'];
    let board, cur, x, y, score, timer, over = false;
    function reset() {
      board = Array.from({ length: H }, () => Array(W).fill(0));
      score = 0; over = false; spawn(); if (timer) clearInterval(timer);
      st.textContent = '得分：0';
      draw();
    }
    function spawn() {
      cur = SHAPES[Math.floor(Math.random() * SHAPES.length)];
      x = Math.floor((W - cur[0].length) / 2); y = 0;
      if (collide(0, 0, cur)) { over = true; draw(); }
    }
    function collide(dx, dy, shape) {
      return shape.some((row, i) => row.some((v, j) => {
        if (!v) return false;
        const nx = x + j + dx, ny = y + i + dy;
        return nx < 0 || nx >= W || ny >= H || (ny >= 0 && board[ny][nx]);
      }));
    }
    function merge() {
      cur.forEach((row, i) => row.forEach((v, j) => { if (v && y + i >= 0) board[y + i][x + j] = 1; }));
      let cleared = 0;
      for (let i = H - 1; i >= 0; i--) {
        if (board[i].every(v => v)) { board.splice(i, 1); board.unshift(Array(W).fill(0)); cleared++; i++; }
      }
      if (cleared) { score += [0, 100, 300, 500, 800][cleared]; st.textContent = `得分：${score}`; }
      spawn();
    }
    function rotate() {
      const rot = cur[0].map((_, j) => cur.map(row => row[j]).reverse());
      if (!collide(0, 0, rot)) cur = rot;
    }
    function step(dy = 1) {
      if (over) return;
      if (!collide(0, dy, cur)) y += dy;
      else if (dy > 0) { merge(); draw(); }
      draw();
    }
    function hardDrop() { while (!collide(0, 1, cur)) y++; merge(); draw(); }
    function draw() {
      ctx.fillStyle = '#0c0e16'; ctx.fillRect(0, 0, cvs.width, cvs.height);
      ctx.strokeStyle = 'rgba(255,255,255,.04)';
      for (let i = 0; i < W; i++) for (let j = 0; j < H; j++) ctx.strokeRect(i * cell, j * cell, cell, cell);
      for (let i = 0; i < H; i++) for (let j = 0; j < W; j++) if (board[i][j]) { ctx.fillStyle = '#3f8cff'; ctx.fillRect(j * cell + 1, i * cell + 1, cell - 2, cell - 2); }
      if (cur) { ctx.fillStyle = '#ffd166'; cur.forEach((row, i) => row.forEach((v, j) => { if (v) ctx.fillRect((x + j) * cell + 1, (y + i) * cell + 1, cell - 2, cell - 2); })); }
      if (over) { ctx.fillStyle = 'rgba(0,0,0,.6)'; ctx.fillRect(0, 0, cvs.width, cvs.height); ctx.fillStyle = '#fff'; ctx.font = 'bold 18px sans-serif'; ctx.textAlign = 'center'; ctx.fillText('游戏结束', cvs.width / 2, cvs.height / 2); }
    }
    const key = e => {
      if (e.key === 'ArrowLeft') { if (!collide(-1, 0, cur)) x--; }
      else if (e.key === 'ArrowRight') { if (!collide(1, 0, cur)) x++; }
      else if (e.key === 'ArrowDown') step(1);
      else if (e.key === 'ArrowUp') rotate();
      else if (e.key === ' ') hardDrop();
      draw();
    };
    document.addEventListener('keydown', key);
    bindSwipe(cvs, d => {
      if (d === 'left') { if (!collide(-1, 0, cur)) x--; }
      if (d === 'right') { if (!collide(1, 0, cur)) x++; }
      if (d === 'down') step(1);
      if (d === 'up') rotate();
      draw();
    });
    stage.appendChild(cvs); stage.appendChild(st); restartBtn(stage, reset);
    reset(); timer = setInterval(() => step(1), 480);
    return { stop() { clearInterval(timer); document.removeEventListener('keydown', key); } };
  }

  // ============================================================
  // 扫雷
  // ============================================================
  function openMine(stage) {
    const N = 9, MINES = 10;
    const wrap = document.createElement('div'); wrap.className = 'mine-grid';
    const st = status(stage);
    let cells, revealed, flagged, started, over = false, win = false, flagMode = false;
    function reset() {
      cells = Array.from({ length: N }, () => Array(N).fill(null));
      revealed = 0; flagged = 0; started = false; over = false; win = false; flagMode = false;
      flagBtn.textContent = '🚩 插旗模式：关';
      flagBtn.classList.remove('on');
      st.textContent = `💣 ${MINES} · 已翻开 0/${N * N - MINES}`;
      wrap.innerHTML = '';
      for (let i = 0; i < N; i++) for (let j = 0; j < N; j++) {
        const c = document.createElement('button'); c.className = 'mine-cell'; c.dataset.i = i; c.dataset.j = j;
        wrap.appendChild(c);
      }
    }
    function plant(safeI, safeJ) {
      let placed = 0;
      while (placed < MINES) {
        const i = Math.floor(Math.random() * N), j = Math.floor(Math.random() * N);
        if ((i === safeI && j === safeJ) || cells[i][j] === 'M') continue;
        cells[i][j] = 'M'; placed++;
      }
      for (let i = 0; i < N; i++) for (let j = 0; j < N; j++) if (cells[i][j] !== 'M') cells[i][j] = count(i, j);
    }
    function count(i, j) {
      let n = 0;
      for (let di = -1; di <= 1; di++) for (let dj = -1; dj <= 1; dj++) {
        const ni = i + di, nj = j + dj;
        if (ni >= 0 && nj >= 0 && ni < N && nj < N && cells[ni][nj] === 'M') n++;
      }
      return n;
    }
    function cellEl(i, j) { return wrap.querySelector(`[data-i="${i}"][data-j="${j}"]`); }
    function reveal(i, j) {
      const el = cellEl(i, j); if (!el || el.classList.contains('revealed') || el.classList.contains('flagged')) return;
      const v = cells[i][j];
      el.classList.add('revealed');
      if (v === 'M') { el.textContent = '💣'; el.classList.add('boom'); over = true; lose(); return; }
      if (v > 0) { el.textContent = v; el.classList.add('c' + v); }
      else { el.textContent = ''; for (let di = -1; di <= 1; di++) for (let dj = -1; dj <= 1; dj++) reveal(i + di, j + dj); }
      revealed++;
      st.textContent = `💣 ${MINES - flagged} · 已翻开 ${revealed}/${N * N - MINES}`;
      if (revealed === N * N - MINES) { win = true; st.textContent = '🎉 胜利！'; }
    }
    function lose() {
      for (let i = 0; i < N; i++) for (let j = 0; j < N; j++) if (cells[i][j] === 'M') { const el = cellEl(i, j); if (!el.classList.contains('revealed')) { el.textContent = '💣'; el.classList.add('revealed'); } }
      st.textContent = '💥 踩雷了！';
    }
    function toggleFlag(i, j) {
      const el = cellEl(i, j); if (el.classList.contains('revealed')) return;
      el.classList.toggle('flagged');
      flagged += el.classList.contains('flagged') ? 1 : -1;
      el.textContent = el.classList.contains('flagged') ? '🚩' : '';
      st.textContent = `💣 ${MINES - flagged} · 已翻开 ${revealed}/${N * N - MINES}`;
    }
    const flagBtn = btn('🚩 插旗模式：关', 'mine-flag-toggle');
    flagBtn.addEventListener('click', () => { flagMode = !flagMode; flagBtn.textContent = `🚩 插旗模式：${flagMode ? '开' : '关'}`; flagBtn.classList.toggle('on', flagMode); });
    wrap.addEventListener('click', e => {
      const el = e.target.closest('.mine-cell'); if (!el || over || win) return;
      const i = +el.dataset.i, j = +el.dataset.j;
      if (flagMode) { toggleFlag(i, j); return; }
      if (!started) { started = true; plant(i, j); }
      reveal(i, j);
    });
    wrap.addEventListener('contextmenu', e => {
      e.preventDefault();
      const el = e.target.closest('.mine-cell'); if (!el || over || win) return;
      toggleFlag(+el.dataset.i, +el.dataset.j);
    });
    stage.appendChild(st); stage.appendChild(flagBtn); stage.appendChild(wrap); restartBtn(stage, reset);
    reset();
    return { stop() { wrap.onclick = null; wrap.oncontextmenu = null; flagBtn.onclick = null; } };
  }

  // ============================================================
  // 五子棋（9×9，双人）
  // ============================================================
  function openGomoku(stage) {
    const N = 9;
    const wrap = document.createElement('div'); wrap.className = 'gomoku-board';
    const st = status(stage);
    let board, turn, over = false, moves = 0;
    function reset() {
      board = Array.from({ length: N }, () => Array(N).fill(0));
      turn = 1; over = false; moves = 0;
      st.textContent = '● 黑方先手（点击交叉点落子）';
      wrap.innerHTML = '';
      for (let i = 0; i < N; i++) for (let j = 0; j < N; j++) {
        const c = document.createElement('button'); c.className = 'gomoku-cell'; c.dataset.i = i; c.dataset.j = j;
        wrap.appendChild(c);
      }
    }
    function win(i, j) {
      const v = board[i][j];
      for (const [di, dj] of [[1,0],[0,1],[1,1],[1,-1]]) {
        let n = 1;
        for (let k = 1; k < 5; k++) { const ni = i + di * k, nj = j + dj * k; if (ni < 0 || nj < 0 || ni >= N || nj >= N || board[ni][nj] !== v) break; n++; }
        for (let k = 1; k < 5; k++) { const ni = i - di * k, nj = j - dj * k; if (ni < 0 || nj < 0 || ni >= N || nj >= N || board[ni][nj] !== v) break; n++; }
        if (n >= 5) return true;
      }
      return false;
    }
    wrap.addEventListener('click', e => {
      const el = e.target.closest('.gomoku-cell'); if (!el || over) return;
      const i = +el.dataset.i, j = +el.dataset.j;
      if (board[i][j]) return;
      board[i][j] = turn; moves++;
      el.textContent = turn === 1 ? '●' : '○';
      el.classList.add(turn === 1 ? 'black' : 'white');
      if (win(i, j)) { st.textContent = turn === 1 ? '🎉 黑方胜！' : '🎉 白方胜！'; over = true; return; }
      if (moves === N * N) { st.textContent = '🤝 平局'; over = true; return; }
      turn = 3 - turn;
      st.textContent = turn === 1 ? '● 轮到黑方' : '○ 轮到白方';
    });
    stage.appendChild(st); stage.appendChild(wrap); restartBtn(stage, reset);
    reset();
    return { stop() { wrap.onclick = null; } };
  }

  // ============================================================
  // 记忆翻牌（4×4）
  // ============================================================
  function openMemory(stage) {
    const EMOJI = ['🍎','🍌','🍇','🍓','🍊','🥝','🍒','🍉'];
    const wrap = document.createElement('div'); wrap.className = 'memory-grid';
    const st = status(stage);
    let deck, first = null, lock = false, matched = 0, moves = 0;
    function reset() {
      deck = [...EMOJI, ...EMOJI].map(v => ({ v, flipped: false, done: false })).sort(() => Math.random() - 0.5);
      first = null; lock = false; matched = 0; moves = 0;
      st.textContent = `步数：0 · 已配对 0/8`;
      wrap.innerHTML = '';
      deck.forEach((c, idx) => {
        const el = document.createElement('button'); el.className = 'memory-card'; el.dataset.idx = idx;
        wrap.appendChild(el);
      });
    }
    function render() {
      $$('.memory-card', wrap).forEach((el, idx) => {
        const c = deck[idx];
        el.classList.toggle('flipped', c.flipped || c.done);
        el.classList.toggle('done', c.done);
        el.textContent = (c.flipped || c.done) ? c.v : '?';
      });
    }
    function flip(idx) {
      if (lock) return;
      const c = deck[idx]; if (c.flipped || c.done) return;
      c.flipped = true; moves++;
      if (first === null) { first = idx; render(); return; }
      const a = deck[first];
      if (a.v === c.v) { a.done = true; c.done = true; matched++; st.textContent = `步数：${moves} · 已配对 ${matched}/8`; first = null; if (matched === 8) st.textContent = `🎉 胜利！共 ${moves} 步`; render(); return; }
      lock = true; render();
      setTimeout(() => { a.flipped = false; c.flipped = false; first = null; lock = false; render(); }, 650);
      st.textContent = `步数：${moves} · 已配对 ${matched}/8`;
    }
    wrap.addEventListener('click', e => { const el = e.target.closest('.memory-card'); if (el) flip(+el.dataset.idx); });
    stage.appendChild(st); stage.appendChild(wrap); restartBtn(stage, reset);
    reset(); render();
    return { stop() { wrap.onclick = null; } };
  }

  // ============================================================
  // 井字棋（3×3）
  // ============================================================
  function openTicTac(stage) {
    const wrap = document.createElement('div'); wrap.className = 'tictac-grid';
    const st = status(stage);
    let board, turn, over = false;
    function reset() {
      board = Array(9).fill(0); turn = 1; over = false;
      st.textContent = '✕ 先手';
      wrap.innerHTML = '';
      for (let i = 0; i < 9; i++) { const c = document.createElement('button'); c.className = 'tictac-cell'; c.dataset.i = i; wrap.appendChild(c); }
    }
    const lines = [[0,1,2],[3,4,5],[6,7,8],[0,3,6],[1,4,7],[2,5,8],[0,4,8],[2,4,6]];
    function check() {
      for (const [a, b, c] of lines) if (board[a] && board[a] === board[b] && board[b] === board[c]) return board[a];
      return board.every(v => v) ? -1 : 0;
    }
    wrap.addEventListener('click', e => {
      const el = e.target.closest('.tictac-cell'); if (!el || over) return;
      const i = +el.dataset.i; if (board[i]) return;
      board[i] = turn;
      el.textContent = turn === 1 ? '✕' : '○';
      el.classList.add(turn === 1 ? 'black' : 'white');
      const r = check();
      if (r === 1) { st.textContent = '🎉 ✕ 胜！'; over = true; return; }
      if (r === 2) { st.textContent = '🎉 ○ 胜！'; over = true; return; }
      if (r === -1) { st.textContent = '🤝 平局'; over = true; return; }
      turn = 3 - turn; st.textContent = turn === 1 ? '✕ 轮到' : '○ 轮到';
    });
    stage.appendChild(st); stage.appendChild(wrap); restartBtn(stage, reset);
    reset();
    return { stop() { wrap.onclick = null; } };
  }

  // ============================================================
  // 猜数字（1-100）
  // ============================================================
  function openGuess(stage) {
    const st = status(stage);
    const form = document.createElement('form'); form.className = 'guess-form';
    const input = document.createElement('input'); input.type = 'number'; input.min = 1; input.max = 100; input.placeholder = '1-100';
    const btn = document.createElement('button'); btn.type = 'submit'; btn.className = 'game-btn'; btn.textContent = '猜';
    form.appendChild(input); form.appendChild(btn);
    let target, attempts = 0, over = false;
    function reset() { target = Math.floor(Math.random() * 100) + 1; attempts = 0; over = false; st.textContent = `我已经想好一个 1-100 的数，共猜 ${attempts} 次`; input.value = ''; }
    form.addEventListener('submit', e => {
      e.preventDefault();
      if (over) return;
      const v = Number(input.value);
      if (!v) { st.textContent = '请输入 1-100 的整数'; return; }
      attempts++;
      if (v === target) { st.textContent = `🎉 猜中了！答案 ${target}，用了 ${attempts} 次`; over = true; }
      else if (v < target) st.textContent = `⬆ 小了，再猜（已猜 ${attempts} 次）`;
      else st.textContent = `⬇ 大了，再猜（已猜 ${attempts} 次）`;
      input.value = '';
    });
    stage.appendChild(st); stage.appendChild(form); restartBtn(stage, reset);
    reset();
    return { stop() { form.onsubmit = null; } };
  }

  // ============================================================
  // 打砖块
  // ============================================================
  function openBreakout(stage) {
    const W = 300, H = 400;
    const cvs = document.createElement('canvas'); cvs.width = W; cvs.height = H; cvs.className = 'game-canvas';
    const ctx = cvs.getContext('2d');
    const st = status(stage);
    let paddle, ball, bricks, score, over, won, timer, keys = {};
    function reset() {
      paddle = { x: W / 2 - 30, w: 60, y: H - 24, h: 10 };
      ball = { x: W / 2, y: H - 44, dx: 3, dy: -3, r: 6 };
      bricks = []; const cols = 8, rows = 5, bw = (W - 20) / cols;
      for (let r = 0; r < rows; r++) for (let c = 0; c < cols; c++) bricks.push({ x: 10 + c * bw, y: 34 + r * 18, w: bw - 4, h: 14, alive: true });
      score = 0; over = false; won = false;
      st.textContent = '得分：0 · ← → 或左右滑动控制挡板';
      if (timer) clearInterval(timer);
      draw();
    }
    function draw() {
      ctx.fillStyle = '#0c0e16'; ctx.fillRect(0, 0, W, H);
      bricks.forEach(b => { if (b.alive) { ctx.fillStyle = '#ff6b9d'; ctx.fillRect(b.x, b.y, b.w, b.h); } });
      ctx.fillStyle = '#7ed9ff'; ctx.fillRect(paddle.x, paddle.y, paddle.w, paddle.h);
      ctx.fillStyle = '#fff'; ctx.beginPath(); ctx.arc(ball.x, ball.y, ball.r, 0, Math.PI * 2); ctx.fill();
      if (over) { ctx.fillStyle = 'rgba(0,0,0,.6)'; ctx.fillRect(0, 0, W, H); ctx.fillStyle = '#fff'; ctx.font = 'bold 20px sans-serif'; ctx.textAlign = 'center'; ctx.fillText('游戏结束', W / 2, H / 2); }
      if (won) { ctx.fillStyle = 'rgba(0,0,0,.6)'; ctx.fillRect(0, 0, W, H); ctx.fillStyle = '#6ee7b7'; ctx.font = 'bold 20px sans-serif'; ctx.textAlign = 'center'; ctx.fillText('通关！', W / 2, H / 2); }
    }
    function step() {
      if (over || won) return;
      if (keys.left) paddle.x -= 7; if (keys.right) paddle.x += 7;
      paddle.x = clamp(paddle.x, 0, W - paddle.w);
      ball.x += ball.dx; ball.y += ball.dy;
      if (ball.x < ball.r || ball.x > W - ball.r) ball.dx *= -1;
      if (ball.y < ball.r) ball.dy *= -1;
      if (ball.y > paddle.y - ball.r && ball.y < paddle.y + paddle.h && ball.x > paddle.x - ball.r && ball.x < paddle.x + paddle.w + ball.r && ball.dy > 0) ball.dy = -Math.abs(ball.dy) * 1.02;
      let hit = false;
      bricks.forEach(b => {
        if (!b.alive || hit) return;
        if (ball.x > b.x - ball.r && ball.x < b.x + b.w + ball.r && ball.y > b.y - ball.r && ball.y < b.y + b.h + ball.r) { b.alive = false; hit = true; ball.dy *= -1; score += 10; st.textContent = `得分：${score}`; }
      });
      if (ball.y > H + ball.r) { over = true; draw(); return; }
      if (bricks.every(b => !b.alive)) { won = true; draw(); return; }
      draw();
    }
    const key = e => { if (e.key === 'ArrowLeft' || e.key === 'a') keys.left = true; if (e.key === 'ArrowRight' || e.key === 'd') keys.right = true; };
    const keyUp = e => { if (e.key === 'ArrowLeft' || e.key === 'a') keys.left = false; if (e.key === 'ArrowRight' || e.key === 'd') keys.right = false; };
    document.addEventListener('keydown', key); document.addEventListener('keyup', keyUp);
    cvs.addEventListener('touchmove', e => { e.preventDefault(); const r = cvs.getBoundingClientRect(); paddle.x = clamp((e.touches[0].clientX - r.left) * (W / r.width) - paddle.w / 2, 0, W - paddle.w); }, { passive: false });
    stage.appendChild(cvs); stage.appendChild(st); restartBtn(stage, reset);
    reset(); timer = setInterval(step, 16);
    return { stop() { clearInterval(timer); document.removeEventListener('keydown', key); document.removeEventListener('keyup', keyUp); } };
  }

  // ============================================================
  // 打地鼠（30 秒限时）
  // ============================================================
  function openWhack(stage) {
    const wrap = document.createElement('div'); wrap.className = 'whack-grid';
    const st = status(stage);
    let cells, score, timer, moleTimer, timeLeft, over;
    function reset() {
      score = 0; timeLeft = 30; over = false;
      wrap.innerHTML = ''; cells = [];
      for (let i = 0; i < 9; i++) { const c = document.createElement('button'); c.className = 'whack-cell'; c.dataset.i = i; wrap.appendChild(c); cells.push(c); }
      st.textContent = '得分：0 · 时间 30 秒';
      if (timer) clearInterval(timer); if (moleTimer) clearInterval(moleTimer);
      timer = setInterval(() => {
        if (over) return;
        timeLeft--; st.textContent = `得分：${score} · 时间 ${timeLeft} 秒`;
        if (timeLeft <= 0) { over = true; clearInterval(timer); clearInterval(moleTimer); cells.forEach(c => c.classList.remove('mole')); st.textContent = `⏱ 结束！得分 ${score}`; }
      }, 1000);
      moleTimer = setInterval(() => {
        if (over) return;
        cells.forEach(c => c.classList.remove('mole'));
        if (Math.random() < 0.85) { cells[Math.floor(Math.random() * 9)].classList.add('mole'); }
      }, 800);
    }
    wrap.addEventListener('click', e => {
      const el = e.target.closest('.whack-cell'); if (!el || over) return;
      if (el.classList.contains('mole')) { el.classList.remove('mole'); score += 10; st.textContent = `得分：${score} · 时间 ${timeLeft} 秒`; }
    });
    stage.appendChild(st); stage.appendChild(wrap); restartBtn(stage, reset);
    reset();
    return { stop() { clearInterval(timer); clearInterval(moleTimer); } };
  }

  // ============================================================
  // 数字华容道（15 滑块）
  // ============================================================
  function openPuzzle(stage) {
    const wrap = document.createElement('div'); wrap.className = 'puzzle-grid';
    const st = status(stage);
    let tiles, moves;
    function isSolvable() {
      const arr = tiles.filter(v => v); let inv = 0;
      for (let i = 0; i < arr.length; i++) for (let j = i + 1; j < arr.length; j++) if (arr[i] > arr[j]) inv++;
      const blankRowFromBottom = 4 - Math.floor(tiles.indexOf(0) / 4);
      return (inv + blankRowFromBottom) % 2 === 0;
    }
    function reset() {
      tiles = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15, 0]; moves = 0;
      for (let i = tiles.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); [tiles[i], tiles[j]] = [tiles[j], tiles[i]]; }
      if (!isSolvable()) [tiles[0], tiles[1]] = [tiles[1], tiles[0]];
      st.textContent = '步数：0 · 点相邻数字滑动';
      render();
    }
    function render() {
      wrap.innerHTML = '';
      tiles.forEach((v, idx) => {
        const c = document.createElement('button'); c.className = 'puzzle-cell' + (v ? '' : ' blank'); c.textContent = v || ''; c.dataset.idx = idx;
        wrap.appendChild(c);
      });
      if (tiles.every((v, i) => v === (i + 1) % 16)) st.textContent = `🎉 完成！共 ${moves} 步`;
    }
    function slide(idx) {
      const blank = tiles.indexOf(0), r = Math.floor(idx / 4), c = idx % 4, br = Math.floor(blank / 4), bc = blank % 4;
      if ((Math.abs(r - br) + Math.abs(c - bc)) === 1) { [tiles[idx], tiles[blank]] = [tiles[blank], tiles[idx]]; moves++; st.textContent = `步数：${moves}`; render(); }
    }
    wrap.addEventListener('click', e => { const el = e.target.closest('.puzzle-cell'); if (el && !el.classList.contains('blank')) slide(+el.dataset.idx); });
    stage.appendChild(st); stage.appendChild(wrap); restartBtn(stage, reset);
    reset();
    return { stop() { wrap.onclick = null; } };
  }

  // ============================================================
  // 黑白棋（6×6，双人）
  // ============================================================
  function openReversi(stage) {
    const N = 6;
    const wrap = document.createElement('div'); wrap.className = 'reversi-grid';
    const st = status(stage);
    let board, turn, over;
    function dirs() { const d = []; for (let i = -1; i <= 1; i++) for (let j = -1; j <= 1; j++) if (i || j) d.push([i, j]); return d; }
    function valid(i, j) {
      if (board[i][j]) return null;
      const flips = [];
      for (const [di, dj] of dirs()) {
        let ni = i + di, nj = j + dj; const f = [];
        while (ni >= 0 && nj >= 0 && ni < N && nj < N && board[ni][nj] === 3 - turn) { f.push([ni, nj]); ni += di; nj += dj; }
        if (f.length && ni >= 0 && nj >= 0 && ni < N && nj < N && board[ni][nj] === turn) flips.push(...f);
      }
      return flips.length ? flips : null;
    }
    function reset() {
      board = Array.from({ length: N }, () => Array(N).fill(0));
      const m = N / 2; board[m - 1][m - 1] = 1; board[m][m] = 1; board[m - 1][m] = 2; board[m][m - 1] = 2;
      turn = 1; over = false;
      st.textContent = '● 黑先（点击落子翻转）';
      render();
    }
    function render() {
      wrap.innerHTML = '';
      for (let i = 0; i < N; i++) for (let j = 0; j < N; j++) {
        const c = document.createElement('button'); c.className = 'reversi-cell' + (board[i][j] ? (board[i][j] === 1 ? ' black' : ' white') : ''); c.dataset.i = i; c.dataset.j = j;
        wrap.appendChild(c);
      }
      let b = 0, w = 0; board.forEach(r => r.forEach(v => { if (v === 1) b++; if (v === 2) w++; }));
      if (over) st.textContent = `🎉 ${b > w ? '黑胜' : b < w ? '白胜' : '平局'}（${b} : ${w}）`;
      else st.textContent = `● ${b} · ○ ${w} · ${turn === 1 ? '黑' : '白'}方走`;
    }
    wrap.addEventListener('click', e => {
      const el = e.target.closest('.reversi-cell'); if (!el || over) return;
      const i = +el.dataset.i, j = +el.dataset.j;
      const flips = valid(i, j); if (!flips) return;
      board[i][j] = turn; flips.forEach(([a, b]) => board[a][b] = turn);
      let any = false; for (let a = 0; a < N; a++) for (let b = 0; b < N; b++) if (!board[a][b] && valid(a, b)) any = true;
      if (!any) over = true; else turn = 3 - turn;
      render();
    });
    stage.appendChild(st); stage.appendChild(wrap); restartBtn(stage, reset);
    reset();
    return { stop() { wrap.onclick = null; } };
  }

  // ============================================================
  // 石头剪刀布（对战电脑）
  // ============================================================
  function openRps(stage) {
    const wrap = document.createElement('div'); wrap.className = 'rps-wrap';
    const st = status(stage);
    let score = 0, ai = 0;
    const beats = { rock: 'scissors', paper: 'rock', scissors: 'paper' };
    const emoji = { rock: '✊', paper: '✋', scissors: '✌️' };
    function reset() { score = 0; ai = 0; st.textContent = `你 0 : 0 电脑 · 选一个出`; }
    function play(choice) {
      const opts = ['rock', 'paper', 'scissors'], a = opts[Math.floor(Math.random() * 3)];
      let result;
      if (beats[choice] === a) { score++; result = '你赢了'; }
      else if (choice === a) { result = '平局'; }
      else { ai++; result = '电脑赢了'; }
      st.textContent = `${emoji[choice]} ${result} ${emoji[a]} · 你 ${score} : ${ai} 电脑`;
    }
    [['rock', '石头'], ['paper', '布'], ['scissors', '剪刀']].forEach(([k, label]) => {
      const b = btn(`${emoji[k]} ${label}`); b.addEventListener('click', () => play(k)); wrap.appendChild(b);
    });
    stage.appendChild(st); stage.appendChild(wrap); restartBtn(stage, reset);
    reset();
    return { stop() { wrap.onclick = null; } };
  }

  // ============================================================
  // 21 点（对战电脑）
  // ============================================================
  function openBlackjack(stage) {
    const wrap = document.createElement('div'); wrap.className = 'bj-wrap';
    const st = status(stage);
    const result = document.createElement('div'); result.className = 'game-status';
    let deck, player, dealer, over = false;
    function newDeck() {
      const suits = ['♠', '♥', '♦', '♣'], vals = ['A', '2', '3', '4', '5', '6', '7', '8', '9', '10', 'J', 'Q', 'K'];
      deck = []; suits.forEach(s => vals.forEach(v => deck.push({ s, v })));
      for (let i = deck.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); [deck[i], deck[j]] = [deck[j], deck[i]]; }
    }
    function value(hand) {
      let total = 0, aces = 0;
      hand.forEach(c => { if (c.v === 'A') { aces++; total += 11; } else if (['J', 'Q', 'K'].includes(c.v)) total += 10; else total += Number(c.v); });
      while (total > 21 && aces > 0) { total -= 10; aces--; }
      return total;
    }
    function show() { result.textContent = `你 ${value(player)} · 庄 ${value(dealer)}`; }
    function reset() {
      newDeck(); player = [deck.pop(), deck.pop()]; dealer = [deck.pop()]; over = false;
      wrap.querySelectorAll('button').forEach(b => b.disabled = false);
      show(); st.textContent = '要牌或停牌';
    }
    function hit() {
      if (over) return;
      player.push(deck.pop());
      if (value(player) > 21) { over = true; show(); st.textContent = '💥 爆牌，庄赢！'; wrap.querySelectorAll('button').forEach(b => b.disabled = true); }
      else if (value(player) === 21) stand();
      else show();
    }
    function stand() {
      if (over) return; over = true;
      while (value(dealer) < 17) dealer.push(deck.pop());
      const p = value(player), d = value(dealer);
      st.textContent = d > 21 ? '🎉 庄爆牌，你赢了！' : d > p ? '庄赢。' : d === p ? '平局。' : '🎉 你赢了！';
      show(); wrap.querySelectorAll('button').forEach(b => b.disabled = true);
    }
    const hitBtn = btn('＋ 要牌'); hitBtn.addEventListener('click', hit);
    const standBtn = btn('■ 停牌'); standBtn.addEventListener('click', stand);
    wrap.appendChild(result); wrap.appendChild(hitBtn); wrap.appendChild(standBtn);
    stage.appendChild(st); stage.appendChild(wrap); restartBtn(stage, reset);
    reset();
    return { stop() { wrap.onclick = null; } };
  }

  // ---------- 游戏清单 ----------

  // ============================================================
  // 颜色记忆（Simon）· 原创
  // ============================================================
  function openSimon(stage) {
    const st = status(stage);
    const wrap = document.createElement('div'); wrap.className = 'simon-pads';
    const pads = ['c0','c1','c2','c3'].map((c, i) => { const b = document.createElement('button'); b.className = 'simon-pad ' + c; b.dataset.id = i; wrap.appendChild(b); return b; });
    let seq = [], step = 0, playing = false, score = 0;
    function flash(i, cb) { const b = pads[i]; b.classList.add('lit'); setTimeout(() => b.classList.remove('lit'), 320); if (cb) setTimeout(cb, 400); }
    function nextRound() {
      seq.push(Math.floor(Math.random() * 4)); step = 0; score = seq.length - 1; playing = true;
      st.textContent = `🎨 第 ${seq.length} 轮 · 记住顺序`;
      seq.forEach((c, i) => setTimeout(() => flash(c), 700 + i * 430));
      setTimeout(() => { playing = false; st.textContent = `🔁 你来重复（${seq.length} 个）`; }, 700 + seq.length * 430);
    }
    function tap(i) {
      if (playing) return;
      flash(i);
      if (i === seq[step]) { step++; if (step === seq.length) setTimeout(nextRound, 500); }
      else { st.textContent = `💥 错了！本轮得分 ${score}`; playing = true; setTimeout(() => { seq = []; nextRound(); }, 1200); }
    }
    pads.forEach((b, i) => b.addEventListener('click', () => tap(i)));
    stage.appendChild(st); stage.appendChild(wrap); restartBtn(stage, () => { seq = []; score = 0; nextRound(); });
    nextRound();
    return { stop() { pads.forEach(b => b.onclick = null); } };
  }

  // ============================================================
  // 速算大师 · 原创
  // ============================================================
  function openMath(stage) {
    const st = status(stage);
    const q = document.createElement('div'); q.className = 'math-q';
    const opts = document.createElement('div'); opts.className = 'math-opts';
    let score = 0, qn = 0, locked = false;
    function make() {
      const a = 1 + Math.floor(Math.random() * 20), b = 1 + Math.floor(Math.random() * 20), op = Math.random() < .5 ? '+' : '×';
      const ans = op === '+' ? a + b : a * b;
      q.textContent = `${a} ${op} ${b} = ?`;
      const set = new Set([ans]);
      while (set.size < 4) set.add(Math.max(1, ans + (Math.floor(Math.random() * 7) - 3)));
      const arr = [...set].sort(() => Math.random() - .5);
      opts.innerHTML = '';
      arr.forEach(v => { const b = document.createElement('button'); b.className = 'math-opt'; b.textContent = v; b.addEventListener('click', () => { if (locked) return; locked = true; if (v === ans) b.classList.add('correct'); else b.classList.add('wrong'); qn++; score += (v === ans ? 1 : 0); st.textContent = `✅ ${score} 分 · 第 ${qn} 题`; setTimeout(make, 700); }); opts.appendChild(b); });
      locked = false;
    }
    stage.appendChild(st); stage.appendChild(q); stage.appendChild(opts); restartBtn(stage, () => { score = 0; qn = 0; make(); });
    make();
    return { stop() { opts.onclick = null; } };
  }

  // ============================================================
  // 点灯 5×5 · 原创
  // ============================================================
  function openLights(stage) {
    const N = 5;
    const st = status(stage);
    const wrap = document.createElement('div'); wrap.className = 'lights-grid';
    let board, moves = 0, won = false;
    function cellEl(i, j) { return wrap.querySelector(`[data-i="${i}"][data-j="${j}"]`); }
    function draw() { for (let i = 0; i < N; i++) for (let j = 0; j < N; j++) cellEl(i, j).classList.toggle('on', board[i][j]); }
    function toggle(i, j) { if (i < 0 || j < 0 || i >= N || j >= N) return; board[i][j] = !board[i][j]; }
    function tapCell(i, j) { toggle(i, j); toggle(i - 1, j); toggle(i + 1, j); toggle(i, j - 1); toggle(i, j + 1); moves++; draw(); if (board.every(r => r.every(v => v))) { won = true; st.textContent = `🎉 通关！用了 ${moves} 步`; } }
    function reset() {
      board = Array.from({ length: N }, () => Array(N).fill(false)); moves = 0; won = false;
      for (let k = 0; k < N * N; k++) if (Math.random() < .5) { const i = Math.floor(Math.random() * N), j = Math.floor(Math.random() * N); tapCell(i, j); }
      if (board.every(r => r.every(v => v))) { reset(); return; }
      st.textContent = '💡 点亮所有格子（点一个，它和上下左右一起翻转）'; moves = 0; draw();
    }
    wrap.innerHTML = '';
    for (let i = 0; i < N; i++) for (let j = 0; j < N; j++) { const c = document.createElement('button'); c.className = 'light-cell'; c.dataset.i = i; c.dataset.j = j; c.addEventListener('click', () => { if (!won) tapCell(i, j); }); wrap.appendChild(c); }
    stage.appendChild(st); stage.appendChild(wrap); restartBtn(stage, reset);
    reset();
    return { stop() { wrap.onclick = null; } };
  }

  // ============================================================
  // 记忆数字 · 原创
  // ============================================================
  function openSeq(stage) {
    const st = status(stage);
    const disp = document.createElement('div'); disp.className = 'seq-display';
    const btns = document.createElement('div'); btns.className = 'seq-btns';
    for (let k = 0; k < 10; k++) { const b = document.createElement('button'); b.className = 'seq-btn'; b.textContent = k; b.dataset.k = k; b.disabled = true; btns.appendChild(b); }
    let seq = [], idx = 0, phase = 'show', score = 0;
    function showSeq() {
      const len = Math.min(8, 3 + Math.floor(score / 2));
      seq = Array.from({ length: len }, () => Math.floor(Math.random() * 10));
      phase = 'show'; idx = 0; st.textContent = `👀 记住这 ${len} 个数字`;
      disp.textContent = seq.join(' ');
      [...btns.children].forEach(b => b.disabled = true);
      setTimeout(() => { phase = 'input'; disp.textContent = '？'.repeat(seq.length); st.textContent = '✍️ 按顺序点数字'; [...btns.children].forEach(b => b.disabled = false); }, 1400);
    }
    function tap(k) {
      if (phase !== 'input') return;
      if (k === seq[idx]) { idx++; if (idx === seq.length) { score++; st.textContent = `✅ 得分 ${score}`; [...btns.children].forEach(b => b.disabled = true); setTimeout(showSeq, 700); } }
      else { st.textContent = `💥 错了！得分 ${score}`; [...btns.children].forEach(b => b.disabled = true); setTimeout(showSeq, 1100); }
    }
    [...btns.children].forEach(b => b.addEventListener('click', () => tap(+b.dataset.k)));
    stage.appendChild(st); stage.appendChild(disp); stage.appendChild(btns); restartBtn(stage, () => { score = 0; showSeq(); });
    showSeq();
    return { stop() { btns.onclick = null; } };
  }

  const GAMES = {
    snake:   { name: '贪吃蛇', desc: '经典街机 · 键盘/滑动', icon: '🐍', open: openSnake },
    simon:   { name: '颜色记忆', desc: '记住颜色顺序 · 反应力', icon: '🎨', open: openSimon },
    math:    { name: '速算大师', desc: '快速心算 · 选答案', icon: '➗', open: openMath },
    lights:  { name: '点灯 5×5', desc: '点亮全部格子', icon: '💡', open: openLights },
    seq:     { name: '记忆数字', desc: '记住数字序列', icon: '🔢', open: openSeq },
    g2048:   { name: '2048',   desc: '数字合并 · 键盘/滑动', icon: '🔢', open: open2048 },
    tetris:  { name: '俄罗斯方块', desc: '经典下落 · 键盘/滑动', icon: '🧩', open: openTetris },
    mine:    { name: '扫雷',   desc: '经典推理 · 点击/旗标', icon: '💣', open: openMine },
    gomoku:  { name: '五子棋', desc: '双人对弈 · 点击落子', icon: '⚫', open: openGomoku },
    memory:  { name: '记忆翻牌', desc: '翻牌配对 · 记忆考验', icon: '🃏', open: openMemory },
    tictac:  { name: '井字棋', desc: '双人对弈 · 经典三连', icon: '❌', open: openTicTac },
    guess:   { name: '猜数字', desc: '1-100 · 数值推理', icon: '🎯', open: openGuess },
    breakout: { name: '打砖块', desc: '挡板弹球 · 清空砖块', icon: '🧱', open: openBreakout },
    whack:   { name: '打地鼠', desc: '30 秒限时 · 点中得分', icon: '🐹', open: openWhack },
    puzzle:  { name: '数字华容道', desc: '15 滑块 · 滑到顺序', icon: '🀄', open: openPuzzle },
    reversi: { name: '黑白棋', desc: '双人对弈 · 翻转吃子', icon: '⚪', open: openReversi },
    rps:     { name: '石头剪刀布', desc: '对战电脑 · 经典', icon: '✊', open: openRps },
    blackjack:{ name: '21 点', desc: '对战电脑 · 要牌/停牌', icon: '♠️', open: openBlackjack },
  };

  // ---------- 选择面板 ----------
  function renderGames() {
    const grid = $('#games-grid');
    if (grid && !grid.childElementCount) {
      grid.innerHTML = Object.entries(GAMES).map(([id, g]) => `<button class="game-card" data-game="${id}"><span class="game-card-icon">${g.icon}</span><strong>${g.name}</strong><small>${g.desc}</small></button>`).join('');
    }
  }
  window.renderGames = renderGames;
  const openGamesBtn = $('#open-games');
  if (openGamesBtn) openGamesBtn.addEventListener('click', () => { renderGames(); location.hash = '#/games'; });
  const gridEl = $('#games-grid');
  if (gridEl) gridEl.addEventListener('click', e => {
    const b = e.target.closest('[data-game]'); if (!b) return;
    const g = GAMES[b.dataset.game]; if (!g) return;
    hideModal('games-modal');
    openGame(b.dataset.game, g.name, g.desc, g.open);
  });
})();

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
    let cells, revealed, flagged, started, over = false, win = false;
    function reset() {
      cells = Array.from({ length: N }, () => Array(N).fill(null));
      revealed = 0; flagged = 0; started = false; over = false; win = false;
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
    wrap.addEventListener('click', e => {
      const el = e.target.closest('.mine-cell'); if (!el || over || win) return;
      const i = +el.dataset.i, j = +el.dataset.j;
      if (!started) { started = true; plant(i, j); }
      reveal(i, j);
    });
    wrap.addEventListener('contextmenu', e => {
      e.preventDefault();
      const el = e.target.closest('.mine-cell'); if (!el || over || win) return;
      toggleFlag(+el.dataset.i, +el.dataset.j);
    });
    stage.appendChild(st); stage.appendChild(wrap); restartBtn(stage, reset);
    reset();
    return { stop() { wrap.onclick = null; wrap.oncontextmenu = null; } };
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

  // ---------- 游戏清单 ----------
  const GAMES = {
    snake:   { name: '贪吃蛇', desc: '经典街机 · 键盘/滑动', icon: '🐍', open: openSnake },
    g2048:   { name: '2048',   desc: '数字合并 · 键盘/滑动', icon: '🔢', open: open2048 },
    tetris:  { name: '俄罗斯方块', desc: '经典下落 · 键盘/滑动', icon: '🧩', open: openTetris },
    mine:    { name: '扫雷',   desc: '经典推理 · 点击/旗标', icon: '💣', open: openMine },
    gomoku:  { name: '五子棋', desc: '双人对弈 · 点击落子', icon: '⚫', open: openGomoku },
    memory:  { name: '记忆翻牌', desc: '翻牌配对 · 记忆考验', icon: '🃏', open: openMemory },
    tictac:  { name: '井字棋', desc: '双人对弈 · 经典三连', icon: '❌', open: openTicTac },
    guess:   { name: '猜数字', desc: '1-100 · 数值推理', icon: '🎯', open: openGuess },
  };

  // ---------- 选择面板 ----------
  const openGamesBtn = $('#open-games');
  if (openGamesBtn) openGamesBtn.addEventListener('click', () => {
    const grid = $('#games-grid');
    if (grid && !grid.childElementCount) {
      grid.innerHTML = Object.entries(GAMES).map(([id, g]) => `<button class="game-card" data-game="${id}"><span class="game-card-icon">${g.icon}</span><strong>${g.name}</strong><small>${g.desc}</small></button>`).join('');
    }
    showModal('games-modal');
  });
  const gridEl = $('#games-grid');
  if (gridEl) gridEl.addEventListener('click', e => {
    const b = e.target.closest('[data-game]'); if (!b) return;
    const g = GAMES[b.dataset.game]; if (!g) return;
    hideModal('games-modal');
    openGame(b.dataset.game, g.name, g.desc, g.open);
  });
})();

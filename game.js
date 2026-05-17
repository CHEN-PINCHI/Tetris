// ====== 常數 ======
const COLS = 10;
const ROWS = 20;

const SHAPES = {
  I: [[0,0,0,0],[1,1,1,1],[0,0,0,0],[0,0,0,0]],
  O: [[1,1],[1,1]],
  T: [[0,1,0],[1,1,1],[0,0,0]],
  S: [[0,1,1],[1,1,0],[0,0,0]],
  Z: [[1,1,0],[0,1,1],[0,0,0]],
  J: [[1,0,0],[1,1,1],[0,0,0]],
  L: [[0,0,1],[1,1,1],[0,0,0]],
};

const COLORS = {
  I: '#00f0f0', O: '#f0f000', T: '#a020f0',
  S: '#39ff14', Z: '#ff3333', J: '#3050ff', L: '#ff8800',
  G: '#5a5a6a', // 垃圾方塊
};

const TYPES = Object.keys(SHAPES);

const DROP_INTERVAL = [
  800, 720, 630, 550, 470, 380, 300, 220, 130, 100,
  80,  80,  80,  70,  70,  70,  50,  50,  50,  30,
];

// Tetris Battle 風攻擊表:消行數 → 送出的垃圾行數
//   1 行: 0   2 行: 1   3 行: 2   4 行 (Tetris): 4
const ATTACK_TABLE = [0, 0, 1, 2, 4];

// 操作對應(用 e.code,跨鍵盤一致)
const SINGLE_CONTROLS = {
  left: ['ArrowLeft'], right: ['ArrowRight'], down: ['ArrowDown'],
  rotate: ['ArrowUp', 'KeyX'], hardDrop: ['Space'],
  hold: ['ShiftLeft', 'ShiftRight', 'KeyC'],
};
const P1_CONTROLS = {
  left: ['KeyA'], right: ['KeyD'], down: ['KeyS'],
  rotate: ['KeyW'], hardDrop: ['Space'], hold: ['ShiftLeft', 'KeyQ'],
};
const P2_CONTROLS = {
  left: ['ArrowLeft'], right: ['ArrowRight'], down: ['ArrowDown'],
  rotate: ['ArrowUp'], hardDrop: ['Enter'], hold: ['Slash', 'ShiftRight'],
};

const DAS_MS = 150;
const ARR_MS = 40;

const $ = (id) => document.getElementById(id);

// ====== Game 類別 ======
class Game {
  constructor(config) {
    this.boardCanvas = $(config.boardId);
    this.boardCtx = this.boardCanvas.getContext('2d');
    this.nextCanvas = $(config.nextId);
    this.nextCtx = this.nextCanvas.getContext('2d');
    this.holdCanvas = $(config.holdId);
    this.holdCtx = this.holdCanvas.getContext('2d');
    this.scoreEl = $(config.scoreId);
    this.levelEl = config.levelId ? $(config.levelId) : null;
    this.linesEl = $(config.linesId);
    this.garbageFillEl = config.garbageFillId ? $(config.garbageFillId) : null;
    this.garbageBarEl = this.garbageFillEl ? this.garbageFillEl.parentElement : null;

    this.blockSize = config.blockSize || 30;
    this.previewSize = config.previewSize || 22;
    this.boardCanvas.width = COLS * this.blockSize;
    this.boardCanvas.height = ROWS * this.blockSize;

    this.controls = config.controls;
    this.opponent = null;
    this.onGameOver = config.onGameOver || (() => {});

    this.inputState = {
      leftHeld: false, rightHeld: false, downHeld: false,
      dasTimer: 0, arrTimer: 0,
    };

    this.reset();
  }

  reset() {
    this.board = Array.from({ length: ROWS }, () => Array(COLS).fill(0));
    this.bag = [];
    this.held = null;
    this.holdLocked = false;
    this.score = 0;
    this.level = 1;
    this.lines = 0;
    this.dropTimer = 0;
    this.combo = 0;
    this.pendingGarbage = 0;
    this.pendingGap = -1;
    this.gameOver = false;
    this.current = null;
    this.next = this.makePiece(this.nextType());
    this.spawn();
    this.updateStats();
    this.updateGarbageBar();
  }

  refillBag() {
    this.bag = [...TYPES];
    for (let i = this.bag.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [this.bag[i], this.bag[j]] = [this.bag[j], this.bag[i]];
    }
  }

  nextType() {
    if (this.bag.length === 0) this.refillBag();
    return this.bag.pop();
  }

  makePiece(type) {
    const shape = SHAPES[type].map(r => r.slice());
    return {
      type, shape,
      x: Math.floor((COLS - shape[0].length) / 2),
      y: type === 'I' ? -1 : 0,
    };
  }

  rotateShape(shape) {
    const n = shape.length;
    const out = Array.from({ length: n }, () => Array(n).fill(0));
    for (let y = 0; y < n; y++)
      for (let x = 0; x < n; x++)
        out[x][n - 1 - y] = shape[y][x];
    return out;
  }

  collides(piece, ox = 0, oy = 0, shape = piece.shape) {
    for (let y = 0; y < shape.length; y++) {
      for (let x = 0; x < shape[y].length; x++) {
        if (!shape[y][x]) continue;
        const nx = piece.x + x + ox;
        const ny = piece.y + y + oy;
        if (nx < 0 || nx >= COLS || ny >= ROWS) return true;
        if (ny >= 0 && this.board[ny][nx]) return true;
      }
    }
    return false;
  }

  spawn() {
    this.current = this.next;
    this.next = this.makePiece(this.nextType());
    this.holdLocked = false;
    if (this.collides(this.current)) this.endGame();
  }

  endGame() {
    this.gameOver = true;
    Audio.play('gameover');
    this.onGameOver(this);
  }

  // ====== 操作 ======
  move(dx) {
    if (!this.current || this.gameOver) return;
    if (!this.collides(this.current, dx, 0)) {
      this.current.x += dx;
      Audio.play('move');
    }
  }

  softDrop() {
    if (!this.current || this.gameOver) return;
    if (!this.collides(this.current, 0, 1)) {
      this.current.y++;
      this.score += 1;
      this.updateStats();
    } else {
      this.lockPiece();
    }
  }

  hardDrop() {
    if (!this.current || this.gameOver) return;
    let dist = 0;
    while (!this.collides(this.current, 0, dist + 1)) dist++;
    this.current.y += dist;
    this.score += dist * 2;
    Audio.play('drop');
    this.lockPiece();
  }

  tryRotate() {
    if (!this.current || this.gameOver) return;
    const rotated = this.rotateShape(this.current.shape);
    for (const k of [0, -1, 1, -2, 2]) {
      if (!this.collides(this.current, k, 0, rotated)) {
        this.current.shape = rotated;
        this.current.x += k;
        Audio.play('rotate');
        return;
      }
    }
  }

  holdPiece() {
    if (!this.current || this.gameOver || this.holdLocked) return;
    Audio.play('hold');
    if (this.held) {
      const prev = this.held;
      this.held = this.current.type;
      this.current = this.makePiece(prev);
    } else {
      this.held = this.current.type;
      this.spawn();
    }
    this.holdLocked = true;
  }

  // 把當前方塊寫入板面;若任一格落在板外則 game over
  merge() {
    for (let y = 0; y < this.current.shape.length; y++) {
      for (let x = 0; x < this.current.shape[y].length; x++) {
        if (this.current.shape[y][x]) {
          const ny = this.current.y + y;
          const nx = this.current.x + x;
          if (ny < 0) { this.endGame(); return; }
          this.board[ny][nx] = this.current.type;
        }
      }
    }
  }

  clearLines() {
    let cleared = 0;
    for (let y = ROWS - 1; y >= 0; y--) {
      if (this.board[y].every(c => c)) {
        this.board.splice(y, 1);
        this.board.unshift(Array(COLS).fill(0));
        cleared++;
        y++;
      }
    }
    if (cleared > 0) {
      const points = [0, 100, 300, 500, 800][cleared] * this.level;
      this.score += points;
      this.lines += cleared;
      this.level = Math.floor(this.lines / 10) + 1;
      Audio.play(cleared === 4 ? 'tetris' : 'clear');
      this.updateStats();
    }
    return cleared;
  }

  lockPiece() {
    this.merge();
    if (this.gameOver) return;
    const cleared = this.clearLines();
    let attack = ATTACK_TABLE[cleared] || 0;

    if (cleared > 0) {
      this.combo++;
      // 連消加成:每連 2 次多送 1 行
      if (this.combo >= 2) attack += Math.floor((this.combo - 1) / 2);
    } else {
      this.combo = 0;
      // 沒消行 → 落下對手送過來的垃圾
      this.applyPendingGarbage();
    }

    if (attack > 0 && this.opponent) {
      // 先抵銷自己待落下的垃圾
      const cancel = Math.min(attack, this.pendingGarbage);
      this.pendingGarbage -= cancel;
      attack -= cancel;
      this.updateGarbageBar();
      if (attack > 0) this.opponent.receiveGarbage(attack);
    }

    this.spawn();
  }

  receiveGarbage(lines) {
    if (lines <= 0) return;
    if (this.pendingGap === -1) {
      this.pendingGap = Math.floor(Math.random() * COLS);
    }
    this.pendingGarbage += lines;
    this.updateGarbageBar();
    if (this.garbageBarEl) {
      this.garbageBarEl.classList.remove('flash');
      void this.garbageBarEl.offsetWidth;
      this.garbageBarEl.classList.add('flash');
    }
  }

  applyPendingGarbage() {
    if (this.pendingGarbage <= 0) return;
    const gap = this.pendingGap;
    const n = this.pendingGarbage;
    // 檢查推上去後最上方是否有方塊 → top out
    for (let i = 0; i < n; i++) {
      if (this.board[i].some(c => c)) {
        // 推下去會頂出 → 直接 game over
        this.endGame();
        return;
      }
    }
    for (let i = 0; i < n; i++) {
      this.board.shift();
      const row = Array(COLS).fill('G');
      row[gap] = 0;
      this.board.push(row);
    }
    this.pendingGarbage = 0;
    this.pendingGap = -1;
    this.updateGarbageBar();
  }

  // ====== 繪圖 ======
  drawPixelBlock(ctx, px, py, size, color, alpha = 1) {
    ctx.globalAlpha = alpha;
    ctx.fillStyle = '#000';
    ctx.fillRect(px, py, size, size);
    ctx.fillStyle = color;
    ctx.fillRect(px + 2, py + 2, size - 4, size - 4);
    ctx.fillStyle = 'rgba(255,255,255,0.7)';
    ctx.fillRect(px + 2, py + 2, size - 4, 2);
    ctx.fillRect(px + 2, py + 2, 2, size - 4);
    ctx.fillStyle = 'rgba(0,0,0,0.45)';
    ctx.fillRect(px + 2, py + size - 4, size - 4, 2);
    ctx.fillRect(px + size - 4, py + 2, 2, size - 4);
    ctx.fillStyle = 'rgba(255,255,255,0.35)';
    ctx.fillRect(px + size / 2 - 2, py + size / 2 - 2, 4, 4);
    ctx.globalAlpha = 1;
  }

  drawCell(x, y, type, alpha = 1) {
    this.drawPixelBlock(this.boardCtx, x * this.blockSize, y * this.blockSize,
                        this.blockSize, COLORS[type], alpha);
  }

  drawBoard() {
    const ctx = this.boardCtx;
    ctx.fillStyle = '#000';
    ctx.fillRect(0, 0, this.boardCanvas.width, this.boardCanvas.height);
    ctx.strokeStyle = 'rgba(255,255,255,0.04)';
    for (let x = 0; x <= COLS; x++) {
      ctx.beginPath();
      ctx.moveTo(x * this.blockSize, 0);
      ctx.lineTo(x * this.blockSize, ROWS * this.blockSize);
      ctx.stroke();
    }
    for (let y = 0; y <= ROWS; y++) {
      ctx.beginPath();
      ctx.moveTo(0, y * this.blockSize);
      ctx.lineTo(COLS * this.blockSize, y * this.blockSize);
      ctx.stroke();
    }
    for (let y = 0; y < ROWS; y++)
      for (let x = 0; x < COLS; x++)
        if (this.board[y][x]) this.drawCell(x, y, this.board[y][x]);
  }

  drawGhost() {
    if (!this.current) return;
    let dist = 0;
    while (!this.collides(this.current, 0, dist + 1)) dist++;
    for (let y = 0; y < this.current.shape.length; y++) {
      for (let x = 0; x < this.current.shape[y].length; x++) {
        if (this.current.shape[y][x]) {
          const gy = this.current.y + y + dist;
          if (gy >= 0) this.drawCell(this.current.x + x, gy, this.current.type, 0.2);
        }
      }
    }
  }

  drawPiece() {
    if (!this.current) return;
    for (let y = 0; y < this.current.shape.length; y++) {
      for (let x = 0; x < this.current.shape[y].length; x++) {
        if (this.current.shape[y][x] && this.current.y + y >= 0) {
          this.drawCell(this.current.x + x, this.current.y + y, this.current.type);
        }
      }
    }
  }

  drawPreviewPiece(ctx, type, slotY) {
    const shape = SHAPES[type];
    const size = this.previewSize;
    const w = shape[0].length * size;
    const h = shape.length * size;
    const ox = (ctx.canvas.width - w) / 2;
    const oy = slotY + (size * 3 - h) / 2;
    for (let y = 0; y < shape.length; y++) {
      for (let x = 0; x < shape[y].length; x++) {
        if (shape[y][x]) {
          this.drawPixelBlock(ctx, ox + x * size, oy + y * size, size, COLORS[type]);
        }
      }
    }
  }

  drawNext() {
    const ctx = this.nextCtx;
    ctx.fillStyle = '#000';
    ctx.fillRect(0, 0, this.nextCanvas.width, this.nextCanvas.height);
    const slotH = this.nextCanvas.height / 3;
    this.drawPreviewPiece(ctx, this.next.type, 5);
    const peek = this.bag.slice(-2).reverse();
    for (let i = 0; i < peek.length && i < 2; i++) {
      this.drawPreviewPiece(ctx, peek[i], slotH * (i + 1) + 5);
    }
  }

  drawHold() {
    const ctx = this.holdCtx;
    ctx.fillStyle = '#000';
    ctx.fillRect(0, 0, this.holdCanvas.width, this.holdCanvas.height);
    if (!this.held) return;
    const shape = SHAPES[this.held];
    const size = this.previewSize;
    const w = shape[0].length * size;
    const h = shape.length * size;
    const ox = (this.holdCanvas.width - w) / 2;
    const oy = (this.holdCanvas.height - h) / 2;
    const alpha = this.holdLocked ? 0.4 : 1;
    for (let y = 0; y < shape.length; y++) {
      for (let x = 0; x < shape[y].length; x++) {
        if (shape[y][x]) {
          this.drawPixelBlock(ctx, ox + x * size, oy + y * size, size, COLORS[this.held], alpha);
        }
      }
    }
  }

  draw() {
    this.drawBoard();
    this.drawGhost();
    this.drawPiece();
    this.drawNext();
    this.drawHold();
  }

  updateStats() {
    if (this.scoreEl) this.scoreEl.textContent = this.score;
    if (this.levelEl) this.levelEl.textContent = this.level;
    if (this.linesEl) this.linesEl.textContent = this.lines;
  }

  updateGarbageBar() {
    if (!this.garbageFillEl) return;
    const pct = Math.min(100, (this.pendingGarbage / ROWS) * 100);
    this.garbageFillEl.style.height = pct + '%';
  }

  tick(delta) {
    if (this.gameOver) return;
    this.dropTimer += delta;
    const interval = DROP_INTERVAL[Math.min(this.level - 1, DROP_INTERVAL.length - 1)];
    if (this.dropTimer > interval) {
      this.dropTimer = 0;
      if (!this.collides(this.current, 0, 1)) this.current.y++;
      else this.lockPiece();
    }
    // DAS / ARR
    const now = performance.now();
    const s = this.inputState;
    if (s.leftHeld && now - s.dasTimer > DAS_MS && now - s.arrTimer > ARR_MS) {
      this.move(-1); s.arrTimer = now;
    }
    if (s.rightHeld && now - s.dasTimer > DAS_MS && now - s.arrTimer > ARR_MS) {
      this.move(1); s.arrTimer = now;
    }
    if (s.downHeld && now - s.arrTimer > 50) {
      this.softDrop(); s.arrTimer = now;
    }
  }

  // 把鍵碼分派到對應動作
  handleKeyDown(code) {
    if (this.gameOver) return false;
    const c = this.controls;
    if (c.left.includes(code)) {
      this.move(-1);
      this.inputState.leftHeld = true;
      this.inputState.dasTimer = performance.now();
      return true;
    }
    if (c.right.includes(code)) {
      this.move(1);
      this.inputState.rightHeld = true;
      this.inputState.dasTimer = performance.now();
      return true;
    }
    if (c.down.includes(code)) {
      this.softDrop();
      this.inputState.downHeld = true;
      return true;
    }
    if (c.rotate.includes(code)) { this.tryRotate(); return true; }
    if (c.hardDrop.includes(code)) { this.hardDrop(); return true; }
    if (c.hold.includes(code)) { this.holdPiece(); return true; }
    return false;
  }

  handleKeyUp(code) {
    const c = this.controls;
    if (c.left.includes(code)) this.inputState.leftHeld = false;
    if (c.right.includes(code)) this.inputState.rightHeld = false;
    if (c.down.includes(code)) this.inputState.downHeld = false;
  }
}

// ====== 控制器 ======
let mode = null;          // 'single' | 'battle'
let games = [];
let running = false;
let paused = false;
let muted = false;
let lastTime = 0;
let rafId = 0;

function startSingle() {
  mode = 'single';
  $('mode-select').classList.add('hidden');
  $('single-layout').classList.remove('hidden');
  $('battle-layout').classList.add('hidden');
  $('game-overlay').classList.add('hidden');
  games = [new Game({
    boardId: 'board-s', nextId: 'next-s', holdId: 'hold-s',
    scoreId: 'score-s', levelId: 'level-s', linesId: 'lines-s',
    blockSize: 30, previewSize: 22,
    controls: SINGLE_CONTROLS,
    onGameOver: (g) => endMatch(),
  })];
  beginLoop();
}

function startBattle() {
  mode = 'battle';
  $('mode-select').classList.add('hidden');
  $('single-layout').classList.add('hidden');
  $('battle-layout').classList.remove('hidden');
  $('game-overlay').classList.add('hidden');
  const g1 = new Game({
    boardId: 'board-1', nextId: 'next-1', holdId: 'hold-1',
    scoreId: 'score-1', linesId: 'lines-1',
    garbageFillId: 'garbage-1',
    blockSize: 24, previewSize: 18,
    controls: P1_CONTROLS,
    onGameOver: (g) => endMatch(g),
  });
  const g2 = new Game({
    boardId: 'board-2', nextId: 'next-2', holdId: 'hold-2',
    scoreId: 'score-2', linesId: 'lines-2',
    garbageFillId: 'garbage-2',
    blockSize: 24, previewSize: 18,
    controls: P2_CONTROLS,
    onGameOver: (g) => endMatch(g),
  });
  g1.opponent = g2;
  g2.opponent = g1;
  games = [g1, g2];
  beginLoop();
}

function beginLoop() {
  running = true;
  paused = false;
  Audio.init();
  Audio.startBgm();
  lastTime = performance.now();
  cancelAnimationFrame(rafId);
  rafId = requestAnimationFrame(mainLoop);
}

function mainLoop(time) {
  if (!running) return;
  const delta = time - lastTime;
  lastTime = time;
  if (!paused) {
    for (const g of games) g.tick(delta);
  }
  for (const g of games) g.draw();
  rafId = requestAnimationFrame(mainLoop);
}

function endMatch(loser) {
  if (!running) return;
  running = false;
  Audio.stopBgm();
  const overlay = $('game-overlay');
  const title = $('overlay-title');
  const text = $('overlay-text');
  if (mode === 'single') {
    title.textContent = 'GAME OVER';
    text.textContent = `分數: ${games[0].score}  消行: ${games[0].lines}`;
  } else {
    const winner = loser === games[0] ? games[1] : games[0];
    const winnerLabel = winner === games[0] ? 'PLAYER 1' : 'PLAYER 2';
    title.textContent = `${winnerLabel} WIN!`;
    text.textContent = `P1: ${games[0].score}  vs  P2: ${games[1].score}`;
  }
  overlay.classList.remove('hidden');
}

function togglePause() {
  if (!running || games.some(g => g.gameOver)) return;
  paused = !paused;
  if (paused) {
    Audio.stopBgm();
    const overlay = $('game-overlay');
    $('overlay-title').textContent = 'PAUSED';
    $('overlay-text').textContent = '按 P 或 Enter 繼續';
    overlay.classList.remove('hidden');
  } else {
    $('game-overlay').classList.add('hidden');
    Audio.startBgm();
    lastTime = performance.now();
  }
}

function toggleMute() {
  muted = !muted;
  Audio.setMuted(muted);
}

function backToMenu() {
  running = false;
  paused = false;
  cancelAnimationFrame(rafId);
  Audio.stopBgm();
  games = [];
  $('single-layout').classList.add('hidden');
  $('battle-layout').classList.add('hidden');
  $('game-overlay').classList.add('hidden');
  $('mode-select').classList.remove('hidden');
}

function restartMatch() {
  if (mode === 'single') startSingle();
  else if (mode === 'battle') startBattle();
  else backToMenu();
}

// ====== 鍵盤 ======
document.addEventListener('keydown', (e) => {
  // 防止瀏覽器預設 (Space 捲動、方向鍵捲動)
  if (['Space', 'ArrowLeft', 'ArrowRight', 'ArrowDown', 'ArrowUp', 'Slash'].includes(e.code)) {
    e.preventDefault();
  }

  // 全域熱鍵
  if (e.code === 'KeyP' && !e.repeat) { togglePause(); return; }
  if (e.code === 'KeyM' && !e.repeat) { toggleMute(); return; }
  // Enter 在暫停/結束時觸發,其餘狀況交給遊戲(P2 用 Enter 硬降)
  if (e.code === 'Enter' && !e.repeat) {
    if (paused) { togglePause(); return; }
    if (!running && mode && !$('game-overlay').classList.contains('hidden')) {
      restartMatch(); return;
    }
  }

  if (!running || paused || e.repeat) return;
  for (const g of games) g.handleKeyDown(e.code);
});

document.addEventListener('keyup', (e) => {
  for (const g of games) g.handleKeyUp(e.code);
});

// ====== 按鈕綁定 ======
$('btn-single').addEventListener('click', startSingle);
$('btn-battle').addEventListener('click', startBattle);
$('overlay-restart').addEventListener('click', restartMatch);
$('overlay-back').addEventListener('click', backToMenu);

document.querySelectorAll('[data-action]').forEach(btn => {
  btn.addEventListener('click', () => {
    const a = btn.dataset.action;
    if (a === 'pause') togglePause();
    else if (a === 'mute') toggleMute();
    else if (a === 'back') backToMenu();
  });
});

// ====== 音效:Web Audio API ======
const Audio = (() => {
  let ctx = null;
  let masterGain = null;
  let bgmTimer = null;
  let bgmIndex = 0;

  function init() {
    if (ctx) return;
    ctx = new (window.AudioContext || window.webkitAudioContext)();
    masterGain = ctx.createGain();
    masterGain.gain.value = muted ? 0 : 0.5;
    masterGain.connect(ctx.destination);
  }

  function blip(freq, duration, type = 'square', vol = 0.3) {
    if (!ctx || muted) return;
    const osc = ctx.createOscillator();
    const g = ctx.createGain();
    osc.type = type;
    osc.frequency.value = freq;
    g.gain.setValueAtTime(vol, ctx.currentTime);
    g.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + duration);
    osc.connect(g).connect(masterGain);
    osc.start();
    osc.stop(ctx.currentTime + duration);
  }

  function play(name) {
    if (!ctx) return;
    switch (name) {
      case 'move': blip(220, 0.04, 'square', 0.1); break;
      case 'rotate': blip(440, 0.06, 'square', 0.15); break;
      case 'drop': blip(150, 0.1, 'sawtooth', 0.2); break;
      case 'hold': blip(330, 0.08, 'triangle', 0.2); break;
      case 'clear':
        blip(523, 0.08); setTimeout(() => blip(659, 0.08), 60);
        setTimeout(() => blip(784, 0.12), 120); break;
      case 'tetris':
        [523, 659, 784, 1047].forEach((f, i) =>
          setTimeout(() => blip(f, 0.12, 'square', 0.25), i * 80));
        break;
      case 'gameover':
        [523, 466, 415, 349, 311].forEach((f, i) =>
          setTimeout(() => blip(f, 0.25, 'sawtooth', 0.25), i * 180));
        break;
    }
  }

  const BGM_NOTES = [
    659, 494, 523, 587, 523, 494, 440, 440, 523, 659, 587, 523,
    494, 494, 523, 587, 659, 523, 440, 440,
    587, 587, 698, 880, 784, 698, 659, 659, 523, 659, 587, 523,
    494, 494, 523, 587, 659, 523, 440, 440,
  ];

  function startBgm() {
    if (!ctx || muted) return;
    stopBgm();
    bgmIndex = 0;
    const interval = 250;
    bgmTimer = setInterval(() => {
      if (muted || paused) return;
      const freq = BGM_NOTES[bgmIndex % BGM_NOTES.length];
      const osc = ctx.createOscillator();
      const g = ctx.createGain();
      osc.type = 'triangle';
      osc.frequency.value = freq;
      g.gain.setValueAtTime(0.07, ctx.currentTime);
      g.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + interval / 1000);
      osc.connect(g).connect(masterGain);
      osc.start();
      osc.stop(ctx.currentTime + interval / 1000);
      bgmIndex++;
    }, interval);
  }

  function stopBgm() {
    if (bgmTimer) { clearInterval(bgmTimer); bgmTimer = null; }
  }

  function setMuted(m) {
    if (masterGain) masterGain.gain.value = m ? 0 : 0.5;
    if (m) stopBgm();
    else if (running && !paused) startBgm();
  }

  return { init, play, startBgm, stopBgm, setMuted };
})();

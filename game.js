// ====== 常數設定 ======
const COLS = 10;
const ROWS = 20;
const BLOCK = 30;

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
  I: '#00f0f0', O: '#f0f000', T: '#a000f0',
  S: '#00f000', Z: '#f00000', J: '#3050ff', L: '#f0a000',
};

const TYPES = Object.keys(SHAPES);

// 經典 NES 落下間隔(毫秒),依等級遞減
const DROP_INTERVAL = [
  800, 720, 630, 550, 470, 380, 300, 220, 130, 100,
  80,  80,  80,  70,  70,  70,  50,  50,  50,  30,
];

// ====== Canvas ======
const boardCanvas = document.getElementById('board');
const boardCtx = boardCanvas.getContext('2d');
const nextCanvas = document.getElementById('next');
const nextCtx = nextCanvas.getContext('2d');
const holdCanvas = document.getElementById('hold');
const holdCtx = holdCanvas.getContext('2d');

const scoreEl = document.getElementById('score');
const levelEl = document.getElementById('level');
const linesEl = document.getElementById('lines');
const overlay = document.getElementById('overlay');
const overlayTitle = document.getElementById('overlay-title');
const overlayText = document.getElementById('overlay-text');
const startBtn = document.getElementById('start-btn');
const pauseBtn = document.getElementById('pause-btn');
const muteBtn = document.getElementById('mute-btn');

// ====== 遊戲狀態 ======
let board, current, next, held, holdLocked;
let bag = [];
let score, level, lines;
let dropTimer, lastTime;
let running = false;
let paused = false;
let gameOver = false;
let muted = false;

// ====== 7-bag 隨機產生器 ======
function refillBag() {
  bag = [...TYPES];
  for (let i = bag.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [bag[i], bag[j]] = [bag[j], bag[i]];
  }
}
function nextType() {
  if (bag.length === 0) refillBag();
  return bag.pop();
}

// ====== 方塊 ======
function makePiece(type) {
  const shape = SHAPES[type].map(r => r.slice());
  return {
    type,
    shape,
    x: Math.floor((COLS - shape[0].length) / 2),
    y: type === 'I' ? -1 : 0,
  };
}

function rotate(shape, dir) {
  const n = shape.length;
  const out = Array.from({ length: n }, () => Array(n).fill(0));
  for (let y = 0; y < n; y++) {
    for (let x = 0; x < n; x++) {
      if (dir > 0) out[x][n - 1 - y] = shape[y][x];
      else out[n - 1 - x][y] = shape[y][x];
    }
  }
  return out;
}

function collides(piece, ox = 0, oy = 0, shape = piece.shape) {
  for (let y = 0; y < shape.length; y++) {
    for (let x = 0; x < shape[y].length; x++) {
      if (!shape[y][x]) continue;
      const nx = piece.x + x + ox;
      const ny = piece.y + y + oy;
      if (nx < 0 || nx >= COLS || ny >= ROWS) return true;
      if (ny >= 0 && board[ny][nx]) return true;
    }
  }
  return false;
}

function merge() {
  for (let y = 0; y < current.shape.length; y++) {
    for (let x = 0; x < current.shape[y].length; x++) {
      if (current.shape[y][x]) {
        const ny = current.y + y;
        const nx = current.x + x;
        if (ny < 0) {
          endGame();
          return;
        }
        board[ny][nx] = current.type;
      }
    }
  }
}

function clearLines() {
  let cleared = 0;
  for (let y = ROWS - 1; y >= 0; y--) {
    if (board[y].every(c => c)) {
      board.splice(y, 1);
      board.unshift(Array(COLS).fill(0));
      cleared++;
      y++;
    }
  }
  if (cleared > 0) {
    const points = [0, 100, 300, 500, 800][cleared] * level;
    score += points;
    lines += cleared;
    level = Math.floor(lines / 10) + 1;
    Audio.play(cleared === 4 ? 'tetris' : 'clear');
    updateStats();
  }
}

// ====== 操作 ======
function move(dx) {
  if (!current || !running || paused) return;
  if (!collides(current, dx, 0)) {
    current.x += dx;
    Audio.play('move');
  }
}

function softDrop() {
  if (!current || !running || paused) return;
  if (!collides(current, 0, 1)) {
    current.y++;
    score += 1;
    updateStats();
  } else {
    lockPiece();
  }
}

function hardDrop() {
  if (!current || !running || paused) return;
  let dist = 0;
  while (!collides(current, 0, dist + 1)) dist++;
  current.y += dist;
  score += dist * 2;
  Audio.play('drop');
  lockPiece();
}

function tryRotate() {
  if (!current || !running || paused) return;
  const rotated = rotate(current.shape, 1);
  // 簡單踢牆嘗試
  const kicks = [0, -1, 1, -2, 2];
  for (const k of kicks) {
    if (!collides(current, k, 0, rotated)) {
      current.shape = rotated;
      current.x += k;
      Audio.play('rotate');
      return;
    }
  }
}

function holdPiece() {
  if (!current || !running || paused || holdLocked) return;
  Audio.play('hold');
  if (held) {
    const prev = held;
    held = current.type;
    current = makePiece(prev);
  } else {
    held = current.type;
    spawn();
  }
  holdLocked = true;
}

function lockPiece() {
  merge();
  if (gameOver) return;
  clearLines();
  spawn();
}

function spawn() {
  current = next;
  next = makePiece(nextType());
  holdLocked = false;
  if (collides(current)) endGame();
}

// ====== 主迴圈 ======
function tick(time = 0) {
  if (!running) return;
  const delta = time - lastTime;
  lastTime = time;
  if (!paused) {
    dropTimer += delta;
    const interval = DROP_INTERVAL[Math.min(level - 1, DROP_INTERVAL.length - 1)];
    if (dropTimer > interval) {
      dropTimer = 0;
      if (!collides(current, 0, 1)) current.y++;
      else lockPiece();
    }
  }
  draw();
  requestAnimationFrame(tick);
}

// ====== 繪圖 ======
function drawPixelBlock(ctx, px, py, size, color, alpha = 1) {
  ctx.globalAlpha = alpha;
  // 黑色像素外框
  ctx.fillStyle = '#000';
  ctx.fillRect(px, py, size, size);
  // 主色填充(留 2px 外框)
  ctx.fillStyle = color;
  ctx.fillRect(px + 2, py + 2, size - 4, size - 4);
  // 左上高光
  ctx.fillStyle = 'rgba(255,255,255,0.7)';
  ctx.fillRect(px + 2, py + 2, size - 4, 2);
  ctx.fillRect(px + 2, py + 2, 2, size - 4);
  // 右下深色陰影
  ctx.fillStyle = 'rgba(0,0,0,0.45)';
  ctx.fillRect(px + 2, py + size - 4, size - 4, 2);
  ctx.fillRect(px + size - 4, py + 2, 2, size - 4);
  // 中心像素亮點
  ctx.fillStyle = 'rgba(255,255,255,0.35)';
  ctx.fillRect(px + size / 2 - 2, py + size / 2 - 2, 4, 4);
  ctx.globalAlpha = 1;
}

function drawCell(ctx, x, y, type, alpha = 1) {
  drawPixelBlock(ctx, x * BLOCK, y * BLOCK, BLOCK, COLORS[type], alpha);
}

function drawGhost() {
  if (!current) return;
  let dist = 0;
  while (!collides(current, 0, dist + 1)) dist++;
  for (let y = 0; y < current.shape.length; y++) {
    for (let x = 0; x < current.shape[y].length; x++) {
      if (current.shape[y][x]) {
        const gy = current.y + y + dist;
        if (gy >= 0) drawCell(boardCtx, current.x + x, gy, current.type, 0.2);
      }
    }
  }
}

function drawBoard() {
  boardCtx.fillStyle = '#0a0a1f';
  boardCtx.fillRect(0, 0, boardCanvas.width, boardCanvas.height);
  // 格線
  boardCtx.strokeStyle = 'rgba(255,255,255,0.04)';
  for (let x = 0; x <= COLS; x++) {
    boardCtx.beginPath();
    boardCtx.moveTo(x * BLOCK, 0);
    boardCtx.lineTo(x * BLOCK, ROWS * BLOCK);
    boardCtx.stroke();
  }
  for (let y = 0; y <= ROWS; y++) {
    boardCtx.beginPath();
    boardCtx.moveTo(0, y * BLOCK);
    boardCtx.lineTo(COLS * BLOCK, y * BLOCK);
    boardCtx.stroke();
  }
  for (let y = 0; y < ROWS; y++) {
    for (let x = 0; x < COLS; x++) {
      if (board[y][x]) drawCell(boardCtx, x, y, board[y][x]);
    }
  }
}

function drawPiece() {
  if (!current) return;
  for (let y = 0; y < current.shape.length; y++) {
    for (let x = 0; x < current.shape[y].length; x++) {
      if (current.shape[y][x] && current.y + y >= 0) {
        drawCell(boardCtx, current.x + x, current.y + y, current.type);
      }
    }
  }
}

function drawPreview(ctx, type, slot = 0) {
  if (!type) return;
  const shape = SHAPES[type];
  const size = 22;
  const w = shape[0].length * size;
  const h = shape.length * size;
  const ox = (ctx.canvas.width - w) / 2;
  const oy = slot * 90 + (90 - h) / 2 + 5;
  for (let y = 0; y < shape.length; y++) {
    for (let x = 0; x < shape[y].length; x++) {
      if (shape[y][x]) {
        drawPixelBlock(ctx, ox + x * size, oy + y * size, size, COLORS[type]);
      }
    }
  }
}

function drawNext() {
  nextCtx.fillStyle = '#0a0a1f';
  nextCtx.fillRect(0, 0, nextCanvas.width, nextCanvas.height);
  drawPreview(nextCtx, next.type, 0);
  // 從 bag 預覽接下來 2 個(不會破壞順序,只是偷看)
  const peek = bag.slice(-2).reverse();
  for (let i = 0; i < peek.length; i++) {
    drawPreview(nextCtx, peek[i], i + 1);
  }
}

function drawHold() {
  holdCtx.fillStyle = '#0a0a1f';
  holdCtx.fillRect(0, 0, holdCanvas.width, holdCanvas.height);
  if (!held) return;
  const shape = SHAPES[held];
  const size = 22;
  const w = shape[0].length * size;
  const h = shape.length * size;
  const ox = (holdCanvas.width - w) / 2;
  const oy = (holdCanvas.height - h) / 2;
  const alpha = holdLocked ? 0.4 : 1;
  for (let y = 0; y < shape.length; y++) {
    for (let x = 0; x < shape[y].length; x++) {
      if (shape[y][x]) {
        drawPixelBlock(holdCtx, ox + x * size, oy + y * size, size, COLORS[held], alpha);
      }
    }
  }
}

function draw() {
  drawBoard();
  drawGhost();
  drawPiece();
  drawNext();
  drawHold();
}

function updateStats() {
  scoreEl.textContent = score;
  levelEl.textContent = level;
  linesEl.textContent = lines;
}

// ====== 遊戲流程 ======
function reset() {
  board = Array.from({ length: ROWS }, () => Array(COLS).fill(0));
  bag = [];
  held = null;
  holdLocked = false;
  score = 0;
  level = 1;
  lines = 0;
  dropTimer = 0;
  lastTime = performance.now();
  gameOver = false;
  paused = false;
  next = makePiece(nextType());
  spawn();
  updateStats();
}

function startGame() {
  reset();
  running = true;
  overlay.classList.add('hidden');
  Audio.init();
  Audio.startBgm();
  requestAnimationFrame((t) => { lastTime = t; tick(t); });
}

function endGame() {
  gameOver = true;
  running = false;
  Audio.play('gameover');
  Audio.stopBgm();
  overlayTitle.textContent = '遊戲結束';
  overlayText.textContent = `最終分數: ${score}`;
  startBtn.textContent = '再玩一次';
  overlay.classList.remove('hidden');
}

function togglePause() {
  if (!running || gameOver) return;
  paused = !paused;
  if (paused) {
    overlayTitle.textContent = '暫停中';
    overlayText.textContent = '按 P 或 Enter 繼續';
    startBtn.textContent = '繼續';
    overlay.classList.remove('hidden');
    Audio.stopBgm();
  } else {
    overlay.classList.add('hidden');
    Audio.startBgm();
    lastTime = performance.now();
  }
}

// ====== 輸入 ======
let leftHeld = false, rightHeld = false, downHeld = false;
let dasTimer = 0, arrTimer = 0;
const DAS = 150, ARR = 40;

document.addEventListener('keydown', (e) => {
  if (e.repeat) return;
  switch (e.key) {
    case 'ArrowLeft': leftHeld = true; move(-1); dasTimer = performance.now(); break;
    case 'ArrowRight': rightHeld = true; move(1); dasTimer = performance.now(); break;
    case 'ArrowDown': downHeld = true; softDrop(); break;
    case 'ArrowUp': case 'x': case 'X': tryRotate(); break;
    case ' ': e.preventDefault(); hardDrop(); break;
    case 'Shift': case 'c': case 'C': holdPiece(); break;
    case 'p': case 'P': togglePause(); break;
    case 'm': case 'M': toggleMute(); break;
    case 'Enter':
      if (!running || gameOver) startGame();
      else if (paused) togglePause();
      break;
  }
});

document.addEventListener('keyup', (e) => {
  if (e.key === 'ArrowLeft') leftHeld = false;
  if (e.key === 'ArrowRight') rightHeld = false;
  if (e.key === 'ArrowDown') downHeld = false;
});

// DAS / ARR 處理(自動連續移動)
setInterval(() => {
  if (!running || paused) return;
  const now = performance.now();
  if (leftHeld && now - dasTimer > DAS) {
    if (now - arrTimer > ARR) { move(-1); arrTimer = now; }
  }
  if (rightHeld && now - dasTimer > DAS) {
    if (now - arrTimer > ARR) { move(1); arrTimer = now; }
  }
  if (downHeld && now - arrTimer > 50) { softDrop(); arrTimer = now; }
}, 16);

startBtn.addEventListener('click', () => {
  if (paused) togglePause();
  else startGame();
});
pauseBtn.addEventListener('click', togglePause);
muteBtn.addEventListener('click', toggleMute);

function toggleMute() {
  muted = !muted;
  Audio.setMuted(muted);
  muteBtn.textContent = muted ? '取消靜音 (M)' : '靜音 (M)';
}

// ====== 音效:Web Audio API 合成 ======
const Audio = (() => {
  let ctx = null;
  let masterGain = null;
  let bgmNodes = [];
  let bgmTimer = null;

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
        [523, 659, 784, 1047].forEach((f, i) => setTimeout(() => blip(f, 0.12, 'square', 0.25), i * 80));
        break;
      case 'gameover':
        [523, 466, 415, 349, 311].forEach((f, i) =>
          setTimeout(() => blip(f, 0.25, 'sawtooth', 0.25), i * 180));
        break;
    }
  }

  // 簡單的 BGM:循環一段原創音階(避免侵權)
  const BGM_NOTES = [
    659, 494, 523, 587, 523, 494, 440, 440, 523, 659, 587, 523,
    494, 494, 523, 587, 659, 523, 440, 440,
    587, 587, 698, 880, 784, 698, 659, 659, 523, 659, 587, 523,
    494, 494, 523, 587, 659, 523, 440, 440,
  ];
  let bgmIndex = 0;

  function startBgm() {
    if (!ctx || muted) return;
    stopBgm();
    bgmIndex = 0;
    const interval = 250;
    bgmTimer = setInterval(() => {
      if (muted) return;
      const freq = BGM_NOTES[bgmIndex % BGM_NOTES.length];
      const osc = ctx.createOscillator();
      const g = ctx.createGain();
      osc.type = 'triangle';
      osc.frequency.value = freq;
      g.gain.setValueAtTime(0.08, ctx.currentTime);
      g.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + interval / 1000);
      osc.connect(g).connect(masterGain);
      osc.start();
      osc.stop(ctx.currentTime + interval / 1000);
      bgmIndex++;
    }, interval);
  }

  function stopBgm() {
    if (bgmTimer) {
      clearInterval(bgmTimer);
      bgmTimer = null;
    }
  }

  function setMuted(m) {
    muted = m;
    if (masterGain) masterGain.gain.value = m ? 0 : 0.5;
    if (m) stopBgm();
    else if (running && !paused) startBgm();
  }

  return { init, play, startBgm, stopBgm, setMuted };
})();

// ====== 初始畫面 ======
function initialDraw() {
  boardCtx.fillStyle = '#0a0a1f';
  boardCtx.fillRect(0, 0, boardCanvas.width, boardCanvas.height);
  nextCtx.fillStyle = '#0a0a1f';
  nextCtx.fillRect(0, 0, nextCanvas.width, nextCanvas.height);
  holdCtx.fillStyle = '#0a0a1f';
  holdCtx.fillRect(0, 0, holdCanvas.width, holdCanvas.height);
}
initialDraw();

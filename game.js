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

// 每個方塊有 light/mid/dark 漸層三色,用於華麗風格的立體填充
const COLORS = {
  I: { mid: '#22d3ee', light: '#a5f3fc', dark: '#0e7490' },
  O: { mid: '#facc15', light: '#fef3c7', dark: '#a16207' },
  T: { mid: '#c026d3', light: '#f0abfc', dark: '#86198f' },
  S: { mid: '#4ade80', light: '#bbf7d0', dark: '#15803d' },
  Z: { mid: '#f43f5e', light: '#fda4af', dark: '#9f1239' },
  J: { mid: '#6366f1', light: '#c7d2fe', dark: '#3730a3' },
  L: { mid: '#fb923c', light: '#fed7aa', dark: '#c2410c' },
  G: { mid: '#71717a', light: '#a1a1aa', dark: '#3f3f46' },
};

const TYPES = Object.keys(SHAPES);

const DROP_INTERVAL = [
  800, 720, 630, 550, 470, 380, 300, 220, 130, 100,
  80,  80,  80,  70,  70,  70,  50,  50,  50,  30,
];

// 攻擊表:消行數 → 送出的垃圾行數
//   1 行: 1   2 行: 2   3 行: 3   4 行 (Tetris): 4
const ATTACK_TABLE = [0, 1, 2, 3, 4];

// 操作對應(用 e.code,跨鍵盤一致)
const SINGLE_CONTROLS = {
  left: ['ArrowLeft'], right: ['ArrowRight'], down: ['ArrowDown'],
  rotateCW:  ['ArrowUp', 'KeyX'],
  rotateCCW: ['KeyZ'],
  hardDrop: ['Space'],
  hold: ['ShiftLeft', 'ShiftRight', 'KeyC'],
};
const P1_CONTROLS = {
  left: ['KeyA'], right: ['KeyD'], down: ['KeyS'],
  rotateCW:  ['KeyW'],
  rotateCCW: ['KeyZ'],
  hardDrop: ['Space'],
  hold: ['ShiftLeft', 'KeyQ'],
};
const P2_CONTROLS = {
  left: ['ArrowLeft'], right: ['ArrowRight'], down: ['ArrowDown'],
  rotateCW:  ['ArrowUp'],
  rotateCCW: ['Period'],
  hardDrop: ['Enter'],
  hold: ['Slash', 'ShiftRight'],
};
const EMPTY_CONTROLS = {
  left: [], right: [], down: [], rotateCW: [], rotateCCW: [], hardDrop: [], hold: [],
};

const DAS_MS = 150;
const ARR_MS = 40;

// Lock delay:方塊碰底後延遲固定的時間 (ms);旋轉/平移會重置計時(最多 N 次)
const LOCK_DELAY = 1000;
const MAX_LOCK_RESETS = 15;

// ====== SRS (Super Rotation System) wall kick 表 ======
// 表示「從 rotation 狀態 from 旋轉到 to」時要嘗試的 (dx, dy) kick 偏移
// 標準 SRS 採 y-up,本專案 y-down,因此 y 已預先反轉
// rotation 狀態:0 = spawn, 1 = R (順轉一次), 2 = 倒立, 3 = L (反轉一次)
const KICKS_JLSTZ = {
  '01': [[0,0], [-1,0], [-1,-1], [0, 2], [-1, 2]],
  '10': [[0,0], [ 1,0], [ 1, 1], [0,-2], [ 1,-2]],
  '12': [[0,0], [ 1,0], [ 1, 1], [0,-2], [ 1,-2]],
  '21': [[0,0], [-1,0], [-1,-1], [0, 2], [-1, 2]],
  '23': [[0,0], [ 1,0], [ 1,-1], [0, 2], [ 1, 2]],
  '32': [[0,0], [-1,0], [-1, 1], [0,-2], [-1,-2]],
  '30': [[0,0], [-1,0], [-1, 1], [0,-2], [-1,-2]],
  '03': [[0,0], [ 1,0], [ 1,-1], [0, 2], [ 1, 2]],
};
const KICKS_I = {
  '01': [[0,0], [-2,0], [ 1,0], [-2, 1], [ 1,-2]],
  '10': [[0,0], [ 2,0], [-1,0], [ 2,-1], [-1, 2]],
  '12': [[0,0], [-1,0], [ 2,0], [-1,-2], [ 2, 1]],
  '21': [[0,0], [ 1,0], [-2,0], [ 1, 2], [-2,-1]],
  '23': [[0,0], [ 2,0], [-1,0], [ 2,-1], [-1, 2]],
  '32': [[0,0], [-2,0], [ 1,0], [-2, 1], [ 1,-2]],
  '30': [[0,0], [ 1,0], [-2,0], [ 1, 2], [-2,-1]],
  '03': [[0,0], [-1,0], [ 2,0], [-1,-2], [ 2, 1]],
};
function getKickTable(type, from, to) {
  if (type === 'O') return [[0, 0]];
  const key = '' + from + to;
  return type === 'I' ? KICKS_I[key] : KICKS_JLSTZ[key];
}

// AI 難度設定
//   thinkDelay : 出現新方塊到開始動作的延遲 (ms)
//   moveDelay  : 每個按鍵動作之間的間隔 (ms)
//   topRatio   : 從前 N% 的候選中隨機挑(0=永遠最佳)
//   useHold    : 是否會用 Hold
//   lookahead  : 是否評估下一塊(1-step lookahead)
//   maxLevel   : 限制 AI 的最大等級
const AI_DIFFICULTIES = {
  easy:   { name: '簡單', thinkDelay: 350, moveDelay: 140, topRatio: 0.18, useHold: false, lookahead: false, tetrisStyle: false, maxLevel: 2 },
  normal: { name: '一般', thinkDelay: 150, moveDelay: 65,  topRatio: 0.05, useHold: true,  lookahead: true,  tetrisStyle: false, maxLevel: 8 },
  hard:   { name: '困難', thinkDelay: 35,  moveDelay: 22,  topRatio: 0,    useHold: true,  lookahead: true,  tetrisStyle: true,  maxLevel: 12 },
};

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
    this.comboEl = config.comboId ? $(config.comboId) : null;
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
    this.effects = [];
    this.shake = 0;
    this.lockTimer = 0;
    this.lockResetCount = 0;
    this.lastActionIsRotate = false;
    this.lastRotationKicked = false;
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
      rotation: 0,
    };
  }

  rotateShape(shape, dir = 1) {
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
    this.lockTimer = 0;
    this.lockResetCount = 0;
    this.lastActionIsRotate = false;
    this.lastRotationKicked = false;
    if (this.collides(this.current)) this.endGame();
  }

  endGame() {
    this.gameOver = true;
    Audio.play('gameover');
    this.onGameOver(this);
  }

  // ====== 操作 ======
  // 成功移動/旋轉後,如果方塊已落地則重置 lock 計時(最多 MAX_LOCK_RESETS 次)
  resetLockIfGrounded() {
    if (this.collides(this.current, 0, 1)) {
      if (this.lockResetCount < MAX_LOCK_RESETS) {
        this.lockTimer = 0;
        this.lockResetCount++;
      }
    }
  }

  move(dx) {
    if (!this.current || this.gameOver) return;
    if (!this.collides(this.current, dx, 0)) {
      this.current.x += dx;
      this.lastActionIsRotate = false;
      this.resetLockIfGrounded();
      Audio.play('move');
    }
  }

  softDrop() {
    if (!this.current || this.gameOver) return;
    if (!this.collides(this.current, 0, 1)) {
      this.current.y++;
      this.score += 1;
      this.lastActionIsRotate = false;
      this.updateStats();
    }
    // 已落地時不立即固定 — 由 lock delay 處理
  }

  hardDrop() {
    if (!this.current || this.gameOver) return;
    let dist = 0;
    while (!this.collides(this.current, 0, dist + 1)) dist++;
    const startY = this.current.y;
    this.current.y += dist;
    this.score += dist * 2;
    Audio.play('drop');
    if (dist > 0) this.spawnDropEffect(this.current, startY, this.current.y);
    this.shake = Math.min(8, 2 + dist * 0.3);
    this.lockPiece();
  }

  tryRotate(dir = 1) {
    if (!this.current || this.gameOver) return;
    const fromRot = this.current.rotation | 0;
    const toRot = dir > 0 ? (fromRot + 1) % 4 : (fromRot + 3) % 4;
    const rotated = this.rotateShape(this.current.shape, dir);
    const kicks = getKickTable(this.current.type, fromRot, toRot);
    for (const [kx, ky] of kicks) {
      if (!this.collides(this.current, kx, ky, rotated)) {
        this.current.shape = rotated;
        this.current.x += kx;
        this.current.y += ky;
        this.current.rotation = toRot;
        this.lastActionIsRotate = true;
        this.lastRotationKicked = (kx !== 0 || ky !== 0);
        this.resetLockIfGrounded();
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

  clearLines(spinType) {
    // 先收集滿行(原 y 位置用於生特效)
    const fullRows = [];
    for (let y = 0; y < ROWS; y++) {
      if (this.board[y].every(c => c)) fullRows.push(y);
    }
    const cleared = fullRows.length;
    const centerX = this.boardCanvas.width / 2;

    if (cleared > 0) {
      for (const y of fullRows) this.spawnLineClearEffect(y, this.board[y].slice());
      // 重建 board:過濾非滿行,前方補等量空行
      const remaining = this.board.filter(row => !row.every(c => c));
      const newBoard = [];
      for (let i = 0; i < cleared; i++) newBoard.push(Array(COLS).fill(0));
      newBoard.push(...remaining);
      this.board = newBoard;

      // 計分:特殊轉採 guideline 較高分數
      let basePoints;
      if (spinType === 't-spin') {
        basePoints = [400, 800, 1200, 1600, 2000][cleared] || 0;
      } else if (spinType === 't-spin-mini') {
        basePoints = [100, 200, 400, 0, 0][cleared] || 0;
      } else if (spinType) {
        basePoints = [100, 400, 800, 1200, 1600][cleared] || 0;
      } else {
        basePoints = [0, 100, 300, 500, 800][cleared];
      }
      const points = basePoints * this.level;
      this.score += points;
      this.lines += cleared;
      this.level = Math.floor(this.lines / 10) + 1;
      Audio.play(cleared === 4 || spinType ? 'tetris' : 'clear');
      this.shake = Math.min(16, 3 + cleared * 1.8 + (spinType ? 4 : 0));

      // 大型文字飛字
      const centerY = (fullRows[0] + fullRows[fullRows.length - 1] + 1) / 2 * this.blockSize;
      this.spawnClearText(cleared, spinType, centerX, centerY);
      this.spawnScorePopup(points, centerX, centerY - this.blockSize);

      // 額外特效
      if (cleared === 4) {
        this.effects.push({ kind: 'boardFlash', life: 0, maxLife: 400 });
        this.spawnLightning(6);
      }
      if (spinType === 't-spin' && cleared >= 2) {
        this.effects.push({ kind: 'boardFlash', life: 0, maxLife: 480 });
        this.spawnLightning(7);
      } else if (spinType === 't-spin' && cleared === 1) {
        this.effects.push({ kind: 'boardFlash', life: 0, maxLife: 280 });
      }

      // 連消提示
      if (this.combo + 1 >= 2) {
        this.spawnComboText(this.combo + 1, centerX, centerY + this.blockSize * 1.2);
      }

      this.updateStats();
    } else if (spinType) {
      // 空消 spin(沒消行但有特殊轉)— 仍給分 + 飛字
      let basePoints;
      if (spinType === 't-spin') basePoints = 400;
      else if (spinType === 't-spin-mini') basePoints = 100;
      else basePoints = 100;
      const points = basePoints * this.level;
      this.score += points;
      Audio.play('hold');
      const cy = (this.current.y + 1) * this.blockSize;
      this.spawnClearText(0, spinType, centerX, cy);
      this.spawnScorePopup(points, centerX, cy - this.blockSize);
      this.updateStats();
    }
    return cleared;
  }

  // 偵測特殊轉 — 回傳 't-spin' | 't-spin-mini' | 's-spin' / 'z-spin' / 'l-spin' / 'j-spin' / 'i-spin' | null
  detectSpinType() {
    if (!this.lastActionIsRotate || !this.current) return null;
    const type = this.current.type;
    if (type === 'O') return null;
    if (type === 'T') return this._detectTSpin();
    // 非 T 方塊:採「需要 kick 才能完成的旋轉 + 已落地」當作 spin
    if (this.lastRotationKicked && this.collides(this.current, 0, 1)) {
      return type.toLowerCase() + '-spin';
    }
    return null;
  }

  // T-spin 3-corner 規則:T 的 3x3 邊角 4 格中至少 3 格被占據
  // 若朝向側的兩個邊角都被占據 → full T-spin;否則 → T-spin mini
  _detectTSpin() {
    const p = this.current;
    const cornerOccupied = (cx, cy) => {
      const nx = p.x + cx;
      const ny = p.y + cy;
      if (nx < 0 || nx >= COLS || ny >= ROWS) return true; // 牆視為已占
      if (ny < 0) return false;
      return !!this.board[ny][nx];
    };
    const c = [
      cornerOccupied(0, 0), // 左上
      cornerOccupied(2, 0), // 右上
      cornerOccupied(0, 2), // 左下
      cornerOccupied(2, 2), // 右下
    ];
    const total = c.filter(Boolean).length;
    if (total < 3) return null;
    // T 指向方向 → 朝向側的兩個邊角
    // rotation 0 = 朝上, 1 = 朝右, 2 = 朝下, 3 = 朝左
    const rot = p.rotation || 0;
    let frontA, frontB;
    if (rot === 0)      { frontA = 0; frontB = 1; }   // 上方兩角
    else if (rot === 1) { frontA = 1; frontB = 3; }   // 右方兩角
    else if (rot === 2) { frontA = 2; frontB = 3; }   // 下方兩角
    else                { frontA = 0; frontB = 2; }   // 左方兩角
    if (c[frontA] && c[frontB]) return 't-spin';
    return 't-spin-mini';
  }

  lockPiece() {
    const spinType = this.detectSpinType();
    this.merge();
    if (this.gameOver) return;
    const cleared = this.clearLines(spinType);
    let attack = ATTACK_TABLE[cleared] || 0;

    if (cleared > 0) {
      this.combo++;
      // 連消加成:每連 2 次多送 1 行
      if (this.combo >= 2) attack += Math.floor((this.combo - 1) / 2);
      // 連消加分:guideline 50 × combo × level
      if (this.combo >= 2) {
        const comboPoints = 50 * (this.combo - 1) * this.level;
        this.score += comboPoints;
        this.updateStats();
      }
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

  // ====== 特效 ======
  spawnParticle(x, y, color, opts = {}) {
    this.effects.push({
      kind: 'particle',
      x, y,
      vx: (Math.random() - 0.5) * (opts.spread || 6),
      vy: (opts.vy0 ?? -1) - Math.random() * (opts.upScale || 4),
      gravity: opts.gravity ?? 0.35,
      color,
      size: opts.size || 3 + Math.random() * 2,
      life: 0,
      maxLife: opts.maxLife || 700,
      kind2: opts.kind2 || 'circle',
    });
  }

  spawnDropEffect(piece, fromY, toY) {
    // 對佔據的每個欄位畫一條垂直殘影軌跡
    const cols = new Set();
    for (let y = 0; y < piece.shape.length; y++)
      for (let x = 0; x < piece.shape[y].length; x++)
        if (piece.shape[y][x]) cols.add(piece.x + x);
    this.effects.push({
      kind: 'dropTrail',
      cols: [...cols],
      fromY, toY,
      pieceType: piece.type,
      life: 0,
      maxLife: 350,
    });
    // 落地噴粒子
    const c = COLORS[piece.type];
    for (let y = 0; y < piece.shape.length; y++) {
      for (let x = 0; x < piece.shape[y].length; x++) {
        if (!piece.shape[y][x]) continue;
        // 只在該方塊「下緣是底/有其他方塊」時噴(視覺上才合理)
        const below = piece.y + y + 1;
        const isBottom =
          y + 1 >= piece.shape.length ||
          !piece.shape[y + 1][x];
        if (!isBottom) continue;
        const absX = piece.x + x;
        const baseY = (piece.y + y + 1) * this.blockSize;
        for (let i = 0; i < 5; i++) {
          this.spawnParticle(
            (absX + Math.random()) * this.blockSize,
            baseY,
            i % 2 ? c.light : c.mid,
            { spread: 5, upScale: 5, gravity: 0.4, size: 2 + Math.random() * 2, maxLife: 500 }
          );
        }
      }
    }
  }

  spawnClearText(cleared, spinType, x, y) {
    let p = null;
    if (spinType === 't-spin') {
      const tag = ['T-SPIN', 'T-SPIN SINGLE', 'T-SPIN DOUBLE', 'T-SPIN TRIPLE'][cleared] || 'T-SPIN';
      p = {
        text: tag,
        gradient: ['#fef3c7', '#fbbf24', '#f43f5e', '#c026d3', '#a78bfa'],
        glow: '#c026d3', size: 1.6 + cleared * 0.15,
      };
    } else if (spinType === 't-spin-mini') {
      const tag = ['T-SPIN MINI', 'MINI T-SPIN SINGLE', 'MINI T-SPIN DOUBLE'][cleared] || 'T-SPIN MINI';
      p = {
        text: tag,
        gradient: ['#f0abfc', '#c026d3', '#a78bfa'],
        glow: '#a78bfa', size: 1.35,
      };
    } else if (spinType) {
      // 'x-spin' → letter
      const letter = spinType.charAt(0).toUpperCase();
      const tag = cleared > 0
        ? `${letter}-SPIN ${['','SINGLE','DOUBLE','TRIPLE'][cleared] || ''}`
        : `${letter}-SPIN`;
      // 依方塊類型取漸層
      const c = COLORS[letter] || COLORS.T;
      p = {
        text: tag,
        gradient: [c.light, c.mid, c.dark, '#a78bfa'],
        glow: c.mid, size: 1.5 + cleared * 0.1,
      };
    } else {
      const presets = {
        1: { text: 'SINGLE',  gradient: ['#a5f3fc', '#22d3ee', '#0e7490'], glow: '#22d3ee', size: 1.5 },
        2: { text: 'DOUBLE',  gradient: ['#c7d2fe', '#a78bfa', '#6d28d9'], glow: '#a78bfa', size: 1.6 },
        3: { text: 'TRIPLE',  gradient: ['#fda4af', '#f43f5e', '#9f1239'], glow: '#f43f5e', size: 1.7 },
        4: { text: 'TETRIS!', gradient: ['#fef3c7', '#fbbf24', '#f43f5e', '#a78bfa', '#22d3ee'], glow: '#fbbf24', size: 2.0 },
      };
      p = presets[cleared];
    }
    if (!p) return;
    const isBig = !!spinType || cleared === 4;
    this.effects.push({
      kind: 'textBurst', text: p.text,
      x, y, fontSize: this.blockSize * p.size,
      gradient: p.gradient, glow: p.glow,
      startScale: 0.3, endScale: 1.0,
      weight: 900, outline: 5, outlineColor: 'rgba(0,0,0,0.85)',
      rise: 28,
      life: 0, maxLife: isBig ? 1500 : 1100,
    });
  }

  spawnScorePopup(points, x, y) {
    if (points <= 0) return;
    this.effects.push({
      kind: 'textBurst', text: `+${points}`,
      x, y, fontSize: this.blockSize * 0.9,
      color: '#fde68a', glow: '#fbbf24',
      startScale: 0.4, endScale: 1.0,
      weight: 700, outline: 3, outlineColor: 'rgba(0,0,0,0.7)',
      rise: 60,
      life: 0, maxLife: 900,
    });
  }

  spawnComboText(n, x, y) {
    // Combo 越大字越大、漸層越華麗
    const heat = Math.min(1, (n - 2) / 8);
    const size = 0.85 + heat * 0.6;
    const gradient = n >= 5
      ? ['#fef3c7', '#fbbf24', '#f43f5e', '#c026d3', '#22d3ee']
      : n >= 3
        ? ['#fde68a', '#fbbf24', '#f43f5e']
        : ['#fda4af', '#f43f5e'];
    this.effects.push({
      kind: 'textBurst', text: `COMBO ×${n}`,
      x, y, fontSize: this.blockSize * size,
      gradient, glow: n >= 5 ? '#fbbf24' : '#f43f5e',
      startScale: 0.4, endScale: 1.0,
      weight: 900, outline: 4, outlineColor: 'rgba(0,0,0,0.8)',
      rise: 50,
      life: 0, maxLife: 1200,
    });
  }

  spawnLightning(count) {
    const W = this.boardCanvas.width;
    const H = this.boardCanvas.height;
    for (let i = 0; i < count; i++) {
      const pts = [{ x: Math.random() * W, y: 0 }];
      let y = 0;
      while (y < H) {
        y += 12 + Math.random() * 22;
        const dx = (Math.random() - 0.5) * 36;
        pts.push({ x: Math.max(2, Math.min(W - 2, pts[pts.length - 1].x + dx)), y });
      }
      this.effects.push({
        kind: 'lightning', points: pts,
        life: 0, maxLife: 220 + Math.random() * 180,
      });
    }
  }

  spawnLineClearEffect(rowIdx, rowCells) {
    this.effects.push({
      kind: 'rowFlash',
      row: rowIdx,
      life: 0,
      maxLife: 320,
    });
    for (let x = 0; x < COLS; x++) {
      const t = rowCells[x];
      if (!t) continue;
      const c = COLORS[t];
      const cx = (x + 0.5) * this.blockSize;
      const cy = (rowIdx + 0.5) * this.blockSize;
      // 主色粒子(加量)
      for (let i = 0; i < 10; i++) {
        this.spawnParticle(cx, cy, i % 2 ? c.light : c.mid, {
          spread: 12, upScale: 8, gravity: 0.45,
          size: 3 + Math.random() * 4, maxLife: 850,
        });
      }
      // 白色火花
      for (let i = 0; i < 5; i++) {
        this.spawnParticle(cx, cy, '#ffffff', {
          spread: 16, upScale: 10, gravity: 0.55,
          size: 2 + Math.random() * 3, maxLife: 700, kind2: 'spark',
        });
      }
      // 金色火星
      for (let i = 0; i < 3; i++) {
        this.spawnParticle(cx, cy, '#fde68a', {
          spread: 18, upScale: 12, gravity: 0.5,
          size: 2 + Math.random() * 2, maxLife: 900, kind2: 'spark',
        });
      }
    }
  }

  updateEffects(delta) {
    const dt = delta / 16; // 以 60fps 為基準
    this.effects = this.effects.filter(e => {
      e.life += delta;
      if (e.life >= e.maxLife) return false;
      if (e.kind === 'particle') {
        e.x += e.vx * dt;
        e.y += e.vy * dt;
        e.vy += e.gravity * dt;
      }
      return true;
    });
    if (this.shake > 0) this.shake = Math.max(0, this.shake - dt * 0.6);
  }

  drawEffects(filter) {
    const ctx = this.boardCtx;
    for (const e of this.effects) {
      if (e.kind !== filter) continue;
      const t = e.life / e.maxLife;
      if (e.kind === 'particle') {
        const a = 1 - t;
        ctx.globalAlpha = a;
        ctx.fillStyle = e.color;
        if (e.kind2 === 'spark') {
          // 細長方形火花
          const s = e.size * (1 - t * 0.4);
          ctx.fillRect(e.x - s / 2, e.y - s / 2, s, s);
          ctx.shadowColor = e.color;
          ctx.shadowBlur = 8;
          ctx.fillRect(e.x - s / 2, e.y - s / 2, s, s);
          ctx.shadowBlur = 0;
        } else {
          ctx.beginPath();
          ctx.arc(e.x, e.y, e.size * (1 - t * 0.5), 0, Math.PI * 2);
          ctx.fill();
        }
      } else if (e.kind === 'rowFlash') {
        const a = (1 - t) * 0.9;
        const y = e.row * this.blockSize;
        const h = this.blockSize;
        const grad = ctx.createLinearGradient(0, y, this.boardCanvas.width, y);
        grad.addColorStop(0, 'rgba(255,255,255,0)');
        grad.addColorStop(0.5, `rgba(255,255,255,${a})`);
        grad.addColorStop(1, 'rgba(255,255,255,0)');
        ctx.fillStyle = grad;
        ctx.fillRect(0, y, this.boardCanvas.width, h);
        // 中線亮帶
        ctx.fillStyle = `rgba(255,255,255,${a * 0.6})`;
        ctx.fillRect(0, y + h * 0.45, this.boardCanvas.width, h * 0.1);
      } else if (e.kind === 'dropTrail') {
        const a = (1 - t) * 0.55;
        const c = COLORS[e.pieceType];
        const startY = e.fromY * this.blockSize;
        const endY = e.toY * this.blockSize;
        for (const col of e.cols) {
          const px = col * this.blockSize;
          const grad = ctx.createLinearGradient(0, startY, 0, endY);
          grad.addColorStop(0, 'rgba(255,255,255,0)');
          grad.addColorStop(0.7, c.mid);
          grad.addColorStop(1, c.light);
          ctx.globalAlpha = a;
          ctx.fillStyle = grad;
          ctx.fillRect(px + 3, startY, this.blockSize - 6, endY - startY);
          ctx.fillStyle = `rgba(255,255,255,${a * 0.8})`;
          ctx.fillRect(px + this.blockSize / 2 - 1, startY, 2, endY - startY);
        }
      } else if (e.kind === 'boardFlash') {
        const a = (1 - t) * 0.65;
        ctx.globalAlpha = a;
        const grad = ctx.createRadialGradient(
          this.boardCanvas.width / 2, this.boardCanvas.height / 2, 0,
          this.boardCanvas.width / 2, this.boardCanvas.height / 2,
          Math.max(this.boardCanvas.width, this.boardCanvas.height)
        );
        grad.addColorStop(0, 'rgba(255,255,255,1)');
        grad.addColorStop(0.6, 'rgba(255,200,255,0.6)');
        grad.addColorStop(1, 'rgba(255,255,255,0)');
        ctx.fillStyle = grad;
        ctx.fillRect(0, 0, this.boardCanvas.width, this.boardCanvas.height);
      } else if (e.kind === 'lightning') {
        const flash = t < 0.15 ? t / 0.15 : Math.max(0, 1 - (t - 0.15) / 0.85);
        ctx.globalAlpha = flash;
        ctx.strokeStyle = '#fff';
        ctx.lineWidth = 3;
        ctx.shadowColor = '#a78bfa';
        ctx.shadowBlur = 18;
        ctx.beginPath();
        ctx.moveTo(e.points[0].x, e.points[0].y);
        for (let i = 1; i < e.points.length; i++) ctx.lineTo(e.points[i].x, e.points[i].y);
        ctx.stroke();
        // 外層紫色光暈
        ctx.strokeStyle = 'rgba(167,139,250,0.6)';
        ctx.lineWidth = 8;
        ctx.stroke();
        ctx.shadowBlur = 0;
      } else if (e.kind === 'textBurst') {
        const popT = Math.min(1, t * 5);
        const scale = e.startScale + (1 - Math.pow(1 - popT, 3)) * (e.endScale - e.startScale);
        const a = t < 0.75 ? 1 : Math.max(0, (1 - t) * 4);
        const ty = e.y - (e.rise || 0) * t;
        ctx.save();
        ctx.translate(e.x, ty);
        ctx.scale(scale, scale);
        ctx.globalAlpha = a;
        ctx.font = `${e.weight || 900} ${e.fontSize}px Orbitron, "Microsoft JhengHei", sans-serif`;
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.lineJoin = 'round';
        ctx.miterLimit = 2;
        if (e.outline) {
          ctx.lineWidth = e.outline;
          ctx.strokeStyle = e.outlineColor || '#000';
          ctx.strokeText(e.text, 0, 0);
        }
        if (e.glow) {
          ctx.shadowColor = e.glow;
          ctx.shadowBlur = 28;
        }
        if (e.gradient) {
          const grad = ctx.createLinearGradient(0, -e.fontSize / 2, 0, e.fontSize / 2);
          e.gradient.forEach((color, i) => grad.addColorStop(i / (e.gradient.length - 1), color));
          ctx.fillStyle = grad;
        } else {
          ctx.fillStyle = e.color || '#fff';
        }
        ctx.fillText(e.text, 0, 0);
        ctx.shadowBlur = 0;
        ctx.restore();
      }
    }
    ctx.globalAlpha = 1;
  }

  // ====== 繪圖 ======
  // 華麗風方塊:漸層立體 + 圓角 + 鏡面高光
  drawGemBlock(ctx, px, py, size, type, alpha = 1) {
    const c = COLORS[type];
    const r = Math.max(2, size * 0.18);
    const inset = 1;
    ctx.save();
    ctx.globalAlpha = alpha;

    // 圓角矩形路徑
    ctx.beginPath();
    if (ctx.roundRect) {
      ctx.roundRect(px + inset, py + inset, size - inset * 2, size - inset * 2, r);
    } else {
      const x0 = px + inset, y0 = py + inset, w = size - inset * 2, h = size - inset * 2;
      ctx.moveTo(x0 + r, y0);
      ctx.arcTo(x0 + w, y0, x0 + w, y0 + h, r);
      ctx.arcTo(x0 + w, y0 + h, x0, y0 + h, r);
      ctx.arcTo(x0, y0 + h, x0, y0, r);
      ctx.arcTo(x0, y0, x0 + w, y0, r);
      ctx.closePath();
    }

    // 主漸層(上亮 → 中色 → 下暗)
    const grad = ctx.createLinearGradient(px, py, px, py + size);
    grad.addColorStop(0, c.light);
    grad.addColorStop(0.45, c.mid);
    grad.addColorStop(1, c.dark);
    ctx.fillStyle = grad;
    ctx.fill();

    // 邊緣外光
    ctx.strokeStyle = c.light;
    ctx.lineWidth = 1;
    ctx.stroke();

    // 左上反光(玻璃感)
    const shine = ctx.createRadialGradient(
      px + size * 0.3, py + size * 0.25, 0,
      px + size * 0.3, py + size * 0.25, size * 0.55
    );
    shine.addColorStop(0, 'rgba(255,255,255,0.55)');
    shine.addColorStop(1, 'rgba(255,255,255,0)');
    ctx.fillStyle = shine;
    ctx.fill();

    // 底部高光線(陶瓷釉感)
    ctx.beginPath();
    ctx.moveTo(px + size * 0.2, py + size * 0.78);
    ctx.quadraticCurveTo(px + size * 0.5, py + size * 0.92, px + size * 0.8, py + size * 0.78);
    ctx.strokeStyle = 'rgba(255,255,255,0.25)';
    ctx.lineWidth = 1.2;
    ctx.stroke();

    ctx.restore();
  }

  drawCell(x, y, type, alpha = 1) {
    this.drawGemBlock(this.boardCtx, x * this.blockSize, y * this.blockSize,
                      this.blockSize, type, alpha);
  }

  drawBoard() {
    const ctx = this.boardCtx;
    const W = this.boardCanvas.width;
    const H = this.boardCanvas.height;
    // 漸層底
    const bg = ctx.createRadialGradient(W / 2, H / 2, 0, W / 2, H / 2, Math.max(W, H));
    bg.addColorStop(0, '#1a0b2e');
    bg.addColorStop(1, '#06010f');
    ctx.fillStyle = bg;
    ctx.fillRect(0, 0, W, H);
    // 細格
    ctx.strokeStyle = 'rgba(180,160,255,0.06)';
    ctx.lineWidth = 1;
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
          this.drawGemBlock(ctx, ox + x * size, oy + y * size, size, type);
        }
      }
    }
  }

  drawNext() {
    const ctx = this.nextCtx;
    const bg = ctx.createLinearGradient(0, 0, 0, this.nextCanvas.height);
    bg.addColorStop(0, '#1a0b2e');
    bg.addColorStop(1, '#0d0420');
    ctx.fillStyle = bg;
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
    const bg = ctx.createLinearGradient(0, 0, 0, this.holdCanvas.height);
    bg.addColorStop(0, '#1a0b2e');
    bg.addColorStop(1, '#0d0420');
    ctx.fillStyle = bg;
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
          this.drawGemBlock(ctx, ox + x * size, oy + y * size, size, this.held, alpha);
        }
      }
    }
  }

  draw() {
    const ctx = this.boardCtx;
    ctx.save();
    if (this.shake > 0) {
      const dx = (Math.random() - 0.5) * this.shake * 2;
      const dy = (Math.random() - 0.5) * this.shake * 2;
      ctx.translate(dx, dy);
    }
    this.drawBoard();
    this.drawGhost();
    this.drawEffects('dropTrail');
    this.drawPiece();
    this.drawEffects('rowFlash');
    this.drawEffects('boardFlash');
    this.drawEffects('lightning');
    this.drawEffects('particle');
    this.drawEffects('textBurst');
    ctx.restore();
    this.drawNext();
    this.drawHold();
  }

  updateStats() {
    if (this.scoreEl) this.scoreEl.textContent = this.score;
    if (this.levelEl) this.levelEl.textContent = this.level;
    if (this.linesEl) this.linesEl.textContent = this.lines;
    if (this.comboEl) {
      const prev = this.comboEl.textContent | 0;
      this.comboEl.textContent = this.combo;
      const parent = this.comboEl.parentElement;
      if (this.combo > 1) {
        parent.classList.add('has-combo');
        if (this.combo !== prev) {
          // 重播脈動動畫
          this.comboEl.classList.remove('combo-anim');
          void this.comboEl.offsetWidth;
          this.comboEl.classList.add('combo-anim');
        }
      } else {
        parent.classList.remove('has-combo');
        this.comboEl.classList.remove('combo-anim');
      }
    }
  }

  updateGarbageBar() {
    if (!this.garbageFillEl) return;
    const pct = Math.min(100, (this.pendingGarbage / ROWS) * 100);
    this.garbageFillEl.style.height = pct + '%';
  }

  tick(delta) {
    this.updateEffects(delta);
    if (this.gameOver) return;

    const grounded = !!this.current && this.collides(this.current, 0, 1);
    if (grounded) {
      // 已落地 → 累積 lock 計時,時間到才固定
      this.lockTimer += delta;
      if (this.lockTimer >= LOCK_DELAY) {
        this.lockPiece();
        return;
      }
    } else {
      // 浮空 → 重置 lock 狀態
      this.lockTimer = 0;
      this.lockResetCount = 0;
    }

    // 重力下降(只在浮空時才需要)
    this.dropTimer += delta;
    const interval = DROP_INTERVAL[Math.min(this.level - 1, DROP_INTERVAL.length - 1)];
    if (this.dropTimer > interval) {
      this.dropTimer = 0;
      if (!grounded && !this.collides(this.current, 0, 1)) this.current.y++;
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
    if (c.rotateCW.includes(code))  { this.tryRotate(1);  return true; }
    if (c.rotateCCW.includes(code)) { this.tryRotate(-1); return true; }
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

// ====== AI 控制器 ======
class AIController {
  constructor(game, difficulty) {
    this.game = game;
    this.difficulty = difficulty;
    this.cfg = AI_DIFFICULTIES[difficulty];
    this.reset();
  }

  reset() {
    this.plan = null;
    this.lastPiece = null;
    this.thinkTimer = 0;
    this.actionTimer = 0;
    this.executedHold = false;
    this.rotationsDone = 0;
    this.stuckCount = 0;
  }

  tick(delta) {
    if (this.game.gameOver || !this.game.current) return;

    // 等級封頂
    if (this.cfg.maxLevel && this.game.level > this.cfg.maxLevel) {
      this.game.level = this.cfg.maxLevel;
    }

    // 偵測新方塊(每塊重新規劃)
    if (this.game.current !== this.lastPiece) {
      this.lastPiece = this.game.current;
      this.plan = null;
      this.thinkTimer = 0;
      this.actionTimer = 0;
      this.executedHold = false;
      this.rotationsDone = 0;
      this.stuckCount = 0;
    }

    if (!this.plan) {
      this.thinkTimer += delta;
      if (this.thinkTimer >= this.cfg.thinkDelay) {
        this.plan = this.computeBestPlacement();
        if (!this.plan) this.game.hardDrop();
      }
      return;
    }

    this.actionTimer += delta;
    if (this.actionTimer < this.cfg.moveDelay) return;
    this.actionTimer = 0;

    // 1) Hold
    if (this.plan.fromHold && !this.executedHold) {
      this.game.holdPiece();
      this.executedHold = true;
      this.lastPiece = this.game.current;
      this.rotationsDone = 0;
      this.stuckCount = 0;
      return;
    }

    // 2) 旋轉到目標方向
    if (this.rotationsDone < this.plan.rotation) {
      const before = this.game.current.shape;
      this.game.tryRotate();
      if (this.game.current.shape === before) {
        this.stuckCount++;
        if (this.stuckCount > 3) { this.game.hardDrop(); this.plan = null; }
      } else {
        this.rotationsDone++;
        this.stuckCount = 0;
      }
      return;
    }

    // 3) 移動到目標 x
    const cx = this.game.current.x;
    if (cx !== this.plan.x) {
      const dir = cx < this.plan.x ? 1 : -1;
      this.game.move(dir);
      if (this.game.current.x === cx) {
        this.stuckCount++;
        if (this.stuckCount > 3) { this.game.hardDrop(); this.plan = null; }
      } else {
        this.stuckCount = 0;
      }
      return;
    }

    // 4) 硬降 — 必須完整重置狀態,否則 rotationsDone/executedHold 會洩漏到下一塊
    this.game.hardDrop();
    this.plan = null;
    this.lastPiece = this.game.current;
    this.thinkTimer = 0;
    this.actionTimer = 0;
    this.executedHold = false;
    this.rotationsDone = 0;
    this.stuckCount = 0;
  }

  enumerateForPiece(type, board) {
    const out = [];
    let shape = SHAPES[type].map(r => r.slice());
    const seen = new Set();
    for (let rot = 0; rot < 4; rot++) {
      const key = shape.map(r => r.join('')).join('|');
      if (!seen.has(key)) {
        seen.add(key);
        for (let x = -2; x <= COLS + 2; x++) {
          const result = this.tryPlaceOnBoard(board, shape, x);
          if (result) {
            out.push({
              type, rotation: rot, x, fromHold: false,
              resultBoard: result.board,
              cleared: result.cleared,
            });
          }
        }
      }
      shape = this.rotateShape(shape);
    }
    return out;
  }

  bestFutureScore(type, board) {
    const futures = this.enumerateForPiece(type, board);
    if (futures.length === 0) return -1e6; // 連下一塊都放不下 → 慘
    let best = -Infinity;
    for (const f of futures) {
      const s = this.evaluate(f.resultBoard, f.cleared);
      if (s > best) best = s;
    }
    return best;
  }

  computeBestPlacement() {
    const board = this.game.board;
    const candidates = this.enumerateForPiece(this.game.current.type, board);

    // 加入 Hold 後的候選
    let holdSecondType = null;
    if (this.cfg.useHold) {
      const holdType = this.game.held || (this.game.next && this.game.next.type);
      if (holdType && holdType !== this.game.current.type) {
        const holdCands = this.enumerateForPiece(holdType, board);
        holdCands.forEach(c => { c.fromHold = true; });
        candidates.push(...holdCands);
        // 若 held 已存在,Hold 後下一塊仍是 next.type;
        // 若 held 空,Hold 會抽掉 next,再下一塊未知 → 不做 lookahead
        holdSecondType = this.game.held ? (this.game.next && this.game.next.type) : null;
      }
    }

    const secondTypeForCurrent = this.game.next ? this.game.next.type : null;

    for (const cand of candidates) {
      cand.base = this.evaluate(cand.resultBoard, cand.cleared);
      if (this.cfg.lookahead) {
        const secondType = cand.fromHold ? holdSecondType : secondTypeForCurrent;
        if (secondType) {
          cand.future = this.bestFutureScore(secondType, cand.resultBoard);
          cand.score = cand.base + cand.future;
        } else {
          cand.score = cand.base;
        }
      } else {
        cand.score = cand.base;
      }
    }

    if (candidates.length === 0) return null;
    candidates.sort((a, b) => b.score - a.score);
    if (this.cfg.topRatio <= 0) return candidates[0];
    const topK = Math.max(1, Math.floor(candidates.length * this.cfg.topRatio));
    return candidates[Math.floor(Math.random() * topK)];
  }

  rotateShape(shape) {
    const n = shape.length;
    const out = Array.from({ length: n }, () => Array(n).fill(0));
    for (let y = 0; y < n; y++)
      for (let x = 0; x < n; x++)
        out[x][n - 1 - y] = shape[y][x];
    return out;
  }

  collidesAt(board, shape, ox, oy) {
    for (let y = 0; y < shape.length; y++) {
      for (let x = 0; x < shape[y].length; x++) {
        if (!shape[y][x]) continue;
        const nx = ox + x;
        const ny = oy + y;
        if (nx < 0 || nx >= COLS) return true;
        if (ny >= ROWS) return true;
        if (ny >= 0 && board[ny][nx]) return true;
      }
    }
    return false;
  }

  tryPlaceOnBoard(board, shape, x) {
    let y = -shape.length;
    if (this.collidesAt(board, shape, x, y)) return null;
    while (!this.collidesAt(board, shape, x, y + 1)) y++;
    const newBoard = board.map(r => r.slice());
    for (let py = 0; py < shape.length; py++) {
      for (let px = 0; px < shape[py].length; px++) {
        if (shape[py][px]) {
          const ny = y + py;
          const nx = x + px;
          if (ny < 0) return null;
          if (nx < 0 || nx >= COLS || ny >= ROWS) return null;
          newBoard[ny][nx] = 'X';
        }
      }
    }
    let cleared = 0;
    const cleaned = newBoard.filter(row => {
      if (row.every(c => c)) { cleared++; return false; }
      return true;
    });
    while (cleaned.length < ROWS) cleaned.unshift(Array(COLS).fill(0));
    return { board: cleaned, cleared, dropY: y };
  }

  // 評估函式 — tetrisStyle 模式會學高手:預留最右欄當 Tetris 井
  evaluate(board, lines) {
    const tetrisStyle = this.cfg.tetrisStyle;
    const WELL_COL = COLS - 1;

    const heights = [];
    let holes = 0;
    for (let x = 0; x < COLS; x++) {
      let topY = -1;
      for (let y = 0; y < ROWS; y++) {
        if (board[y][x]) {
          if (topY === -1) topY = y;
        } else if (topY !== -1) {
          holes++;
        }
      }
      heights.push(topY === -1 ? 0 : ROWS - topY);
    }

    // 非井欄位的高度資訊
    const playHeights = tetrisStyle
      ? heights.filter((_, i) => i !== WELL_COL)
      : heights;
    const aggHeight = playHeights.reduce((a, b) => a + b, 0);
    const maxHeight = Math.max(...playHeights);

    // 凹凸度:tetrisStyle 模式跳過井
    let bumpiness = 0;
    for (let x = 1; x < COLS; x++) {
      if (tetrisStyle && (x === WELL_COL || x - 1 === WELL_COL)) continue;
      bumpiness += Math.abs(heights[x] - heights[x - 1]);
    }

    // 井懲罰(只算「非預留井」的深井)
    let wells = 0;
    for (let x = 0; x < COLS; x++) {
      if (tetrisStyle && x === WELL_COL) continue;
      const leftIsWell = tetrisStyle && (x - 1 === WELL_COL);
      const rightIsWell = tetrisStyle && (x + 1 === WELL_COL);
      const left  = (x === 0          || leftIsWell)  ? ROWS : heights[x - 1];
      const right = (x === COLS - 1   || rightIsWell) ? ROWS : heights[x + 1];
      const d = Math.max(0, Math.min(left, right) - heights[x]);
      wells += d * (d + 1) / 2;
    }

    // 行得分:tetrisStyle 大幅獎勵 4 行,小清打折
    let lineScore;
    if (tetrisStyle) {
      lineScore = lines === 4 ? 8.0
                : lines === 0 ? 0
                : lines * 0.15;  // 1~3 行只給一點點,避免亂消
    } else {
      lineScore = lines * 0.80;
    }

    // Tetris 井獎勵:預留井比其他欄低 0~4 格最理想
    let wellBonus = 0;
    if (tetrisStyle) {
      const otherMax = maxHeight; // 已是非井欄位的最高
      const depth = otherMax - heights[WELL_COL];
      if (depth >= 0 && depth <= 4) wellBonus = depth * 0.7;
      else if (depth > 4)           wellBonus = 4 * 0.7 - (depth - 4) * 0.6;
      else                          wellBonus = depth * 1.0; // 井被填高反而懲罰
    }

    const heightPanic = Math.max(0, maxHeight - 14);

    return lineScore
         - aggHeight   * 0.55
         - holes       * 1.40
         - bumpiness   * 0.30
         - wells       * 0.45
         - heightPanic * 3.00
         + wellBonus;
  }
}

// ====== 線上對戰:PeerJS 連線封裝(支援多人,host 端 star topology) ======
// ICE 伺服器設定 — STUN 給 P2P 直連使用;TURN 在雙方 NAT/防火牆嚴格時
// 自動 fallback 走中繼,確保總是能通。TURN 同時提供 UDP 與 TCP 兩種傳輸,
// UDP 被防火牆擋掉時會自動退到 TCP。
const ICE_SERVERS = {
  iceServers: [
    { urls: 'stun:stun.l.google.com:19302' },
    { urls: 'stun:stun1.l.google.com:19302' },
    {
      urls: 'turn:free.expressturn.com:3478',
      username: '000000002094566530',
      credential: 'QN0kvKv9uptzayAUziqPkDpOPjU=',
    },
    {
      urls: 'turn:free.expressturn.com:3478?transport=tcp',
      username: '000000002094566530',
      credential: 'QN0kvKv9uptzayAUziqPkDpOPjU=',
    },
  ],
};

class OnlineController {
  constructor() {
    this.peer = null;
    this.role = null;            // 'host' | 'join'
    this.code = null;            // 房間碼 (host 用)
    this.localId = null;         // 自己的 peer id
    this.conns = [];             // host: 所有 joiner 連線;joiner: [hostConn]
    this.hostConn = null;        // joiner: 跟 host 的連線
    this.onMessage = null;       // (msg) — msg.from 已被填上
    this.onPeerJoin = null;      // host only: (peerId)
    this.onPeerLeave = null;     // host only: (peerId)
    this.onReady = null;         // joiner: 與 host 連上
    this.onClose = null;         // joiner: host 斷線
  }

  generateCode() {
    // 避開易混淆字元 (0/O, 1/I, L)
    const chars = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789';
    let s = '';
    for (let i = 0; i < 6; i++) s += chars[Math.floor(Math.random() * chars.length)];
    return 'TETRIS-' + s;
  }

  hostRoom() {
    return new Promise((resolve, reject) => {
      this.role = 'host';
      this.code = this.generateCode();
      this.peer = new Peer(this.code, { debug: 3, config: ICE_SERVERS });
      let opened = false;
      this.peer.on('open', id => {
        this.localId = id;
        opened = true;
        resolve(this.code);
      });
      this.peer.on('error', err => {
        if (!opened) reject(err);
        else this._handleError(err);
      });
      this.peer.on('connection', conn => {
        // 4 人上限 — host + 3 joiner
        if (this.conns.length >= 3) {
          try { conn.close(); } catch {}
          return;
        }
        this.conns.push(conn);
        this._wireHostConn(conn);
      });
    });
  }

  _wireHostConn(conn) {
    conn.on('open', () => this.onPeerJoin && this.onPeerJoin(conn.peer));
    conn.on('data', data => this._routeFromPeer(data, conn));
    conn.on('close', () => {
      this.conns = this.conns.filter(c => c !== conn);
      this.onPeerLeave && this.onPeerLeave(conn.peer);
    });
    conn.on('error', err => this._handleError(err));
  }

  // host 收到 joiner 訊息:處理 + 視 target 決定要不要轉發
  _routeFromPeer(msg, fromConn) {
    if (!msg || typeof msg !== 'object') return;
    msg.from = fromConn.peer;
    if (msg.target) {
      if (msg.target === this.localId) {
        this.onMessage && this.onMessage(msg);
      } else {
        const c = this.conns.find(c => c.peer === msg.target);
        if (c && c.open) { try { c.send(msg); } catch {} }
      }
    } else {
      // broadcast:本地處理 + 轉發給其他 joiner
      this.onMessage && this.onMessage(msg);
      for (const c of this.conns) {
        if (c.peer === fromConn.peer) continue;
        if (c.open) { try { c.send(msg); } catch {} }
      }
    }
  }

  joinRoom(code) {
    return new Promise((resolve, reject) => {
      this.role = 'join';
      this.code = code;
      this.peer = new Peer(undefined, { debug: 3, config: ICE_SERVERS });
      this.peer.on('open', id => {
        this.localId = id;
        this.hostConn = this.peer.connect(code, { reliable: true, serialization: 'json' });
        this.conns = [this.hostConn];
        let opened = false;
        const t = setTimeout(() => {
          if (!opened) reject(new Error('連線逾時 — 房間可能不存在'));
        }, 15000);
        this.hostConn.on('open', () => {
          opened = true;
          clearTimeout(t);
          this._wireJoinerConn(this.hostConn);
          this.onReady && this.onReady();
          resolve();
        });
        this.hostConn.on('error', err => {
          if (!opened) { clearTimeout(t); reject(err); }
        });
      });
      this.peer.on('error', err => reject(err));
    });
  }

  _wireJoinerConn(conn) {
    conn.on('data', data => this.onMessage && this.onMessage(data));
    conn.on('close', () => this.onClose && this.onClose());
    conn.on('error', err => this._handleError(err));
  }

  // 廣播訊息 — host:送給所有 joiner;joiner:送給 host (host 會再轉發)
  send(msg) {
    if (!msg || typeof msg !== 'object') return;
    msg.from = this.localId;
    if (this.role === 'host') {
      for (const c of this.conns) {
        if (c.open) { try { c.send(msg); } catch {} }
      }
    } else if (this.hostConn && this.hostConn.open) {
      try { this.hostConn.send(msg); } catch {}
    }
  }

  // 指定目標送 — host:直接送;joiner:透過 host 轉發
  sendTo(targetId, msg) {
    if (!msg || typeof msg !== 'object') return;
    msg.from = this.localId;
    msg.target = targetId;
    if (this.role === 'host') {
      if (targetId === this.localId) return;
      const c = this.conns.find(c => c.peer === targetId);
      if (c && c.open) { try { c.send(msg); } catch {} }
    } else if (this.hostConn && this.hostConn.open) {
      try { this.hostConn.send(msg); } catch {}
    }
  }

  isReady() {
    if (this.role === 'host') return this.conns.some(c => c.open);
    return !!(this.hostConn && this.hostConn.open);
  }

  peerCount() {
    return this.conns.filter(c => c.open).length;
  }

  connectedPeerIds() {
    return this.conns.filter(c => c.open).map(c => c.peer);
  }

  _handleError(err) {
    console.error('[Online] error:', err);
  }

  close() {
    for (const c of this.conns) { try { c.close(); } catch {} }
    if (this.peer) { try { this.peer.destroy(); } catch {} }
    this.peer = null;
    this.conns = [];
    this.hostConn = null;
  }
}

// 對手顯示用的 Game — 只接收 state 快照繪圖,不跑自己的邏輯
class RemoteGame extends Game {
  constructor(config) {
    super({ ...config, controls: EMPTY_CONTROLS, onGameOver: () => {} });
    this.isRemote = true;
    this.bag = [];   // 不顯示「未來的方塊」
  }

  tick() { /* 對手畫面不跑本地邏輯 */ }
  handleKeyDown() { return false; }
  handleKeyUp() {}
  drawGhost() { /* 對手的 ghost 由對方算,本地不畫避免錯位 */ }

  applyState(s) {
    if (s.board) this.board = s.board;
    if (s.current) {
      this.current = {
        type: s.current.type,
        shape: s.current.shape,
        x: s.current.x,
        y: s.current.y,
        rotation: s.current.rotation || 0,
      };
    } else {
      this.current = null;
    }
    this.held = s.held || null;
    if (s.nextType) {
      this.next = { type: s.nextType, shape: SHAPES[s.nextType], x: 0, y: 0 };
    }
    this.score = s.score || 0;
    this.lines = s.lines || 0;
    this.combo = s.combo || 0;
    this.pendingGarbage = s.pendingGarbage || 0;
    this.updateStats();
    this.updateGarbageBar();
  }
}

// ====== 控制器 ======
let mode = null;          // 'single' | 'battle' | 'cpu' | 'online'
let cpuDifficulty = null; // 'easy' | 'normal' | 'hard'
let games = [];
let cpuAI = null;
let online = null;        // OnlineController 實例
let stateSendAccum = 0;   // 線上模式:state 快照節流計時
let roster = [];          // [{ peerId, slot, isLocal, alive }]
let mySlot = -1;
let localRematchReady = false;
let peerRematchReady = false;
let rematchVotes = new Set(); // 多人 rematch — 已投票的 peer id 集合
let countdownPhase = 0;     // 0=無倒數,3/2/1=顯示數字,-1=顯示 GO!
let countdownAccum = 0;
const STATE_SEND_INTERVAL = 50; // ms,每秒約 20 次快照
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
    comboId: 'combo-s',
    blockSize: 30, previewSize: 22,
    controls: SINGLE_CONTROLS,
    onGameOver: (g) => endMatch(),
  })];
  beginLoop();
}

function setupBattlePlayers(opts = {}) {
  const g1 = new Game({
    boardId: 'board-1', nextId: 'next-1', holdId: 'hold-1',
    scoreId: 'score-1', linesId: 'lines-1', comboId: 'combo-1',
    garbageFillId: 'garbage-1',
    blockSize: 24, previewSize: 18,
    controls: opts.p1Controls || P1_CONTROLS,
    onGameOver: (g) => endMatch(g),
  });
  const g2 = new Game({
    boardId: 'board-2', nextId: 'next-2', holdId: 'hold-2',
    scoreId: 'score-2', linesId: 'lines-2', comboId: 'combo-2',
    garbageFillId: 'garbage-2',
    blockSize: 24, previewSize: 18,
    controls: opts.aiMode ? EMPTY_CONTROLS : P2_CONTROLS,
    onGameOver: (g) => endMatch(g),
  });
  g1.opponent = g2;
  g2.opponent = g1;
  return [g1, g2];
}

function setBattlePauseButtonVisible(visible) {
  const btn = document.querySelector('.battle-toolbar [data-action="pause"]');
  if (btn) btn.style.display = visible ? '' : 'none';
}

function startBattle() {
  mode = 'battle';
  cpuAI = null;
  $('mode-select').classList.add('hidden');
  $('cpu-select').classList.add('hidden');
  $('single-layout').classList.add('hidden');
  $('battle-layout').classList.remove('hidden');
  $('game-overlay').classList.add('hidden');
  setBattlePauseButtonVisible(true);
  // 還原成雙人模式的標籤與按鍵提示
  document.querySelector('.p1 .player-label').textContent = 'PLAYER 1';
  document.querySelector('.p1 .control-hint').textContent =
    'A/D 左右 · S 軟降 · W 順轉 · Z 反轉 · Space 硬降 · LShift Hold';
  document.querySelector('.p2 .player-label').textContent = 'PLAYER 2';
  document.querySelector('.p2 .control-hint').textContent =
    '←/→ 左右 · ↓ 軟降 · ↑ 順轉 · . 反轉 · Enter 硬降 · / Hold';
  games = setupBattlePlayers({ aiMode: false });
  beginLoop();
}

function startCpu(difficulty) {
  mode = 'cpu';
  cpuDifficulty = difficulty;
  $('mode-select').classList.add('hidden');
  $('cpu-select').classList.add('hidden');
  $('single-layout').classList.add('hidden');
  $('battle-layout').classList.remove('hidden');
  $('game-overlay').classList.add('hidden');
  setBattlePauseButtonVisible(true);
  const diffName = AI_DIFFICULTIES[difficulty].name;
  // CPU 模式下 P1 用單人模式的方向鍵控制(P2 是 AI 不會搶按鍵)
  document.querySelector('.p1 .player-label').textContent = 'PLAYER 1';
  document.querySelector('.p1 .control-hint').textContent =
    '← → 移動 · ↓ 軟降 · ↑/X 順轉 · Z 反轉 · Space 硬降 · Shift/C Hold';
  document.querySelector('.p2 .player-label').textContent = `CPU · ${diffName}`;
  document.querySelector('.p2 .control-hint').textContent =
    `對手由電腦操作 · 難度:${diffName}`;
  games = setupBattlePlayers({ aiMode: true, p1Controls: SINGLE_CONTROLS });
  cpuAI = new AIController(games[1], difficulty);
  beginLoop();
}

// 由 host 觸發 (按下「開始遊戲」) 或 joiner 收到 host 的 'start' 訊息時呼叫
function prepareOnlineGameStart(rosterData) {
  mode = 'online';
  cpuAI = null;
  stateSendAccum = 0;
  localRematchReady = false;
  peerRematchReady = false;
  rematchVotes.clear();
  resetRematchButton();

  // 建立 roster (注入 isLocal/alive 欄位)
  roster = rosterData.map(p => ({
    peerId: p.peerId,
    slot: p.slot,
    isLocal: p.peerId === online.localId,
    alive: true,
  }));
  mySlot = roster.find(p => p.isLocal).slot;
  const playerCount = roster.length;

  $('mode-select').classList.add('hidden');
  $('online-select').classList.add('hidden');
  $('cpu-select').classList.add('hidden');
  $('single-layout').classList.add('hidden');
  $('battle-layout').classList.remove('hidden');
  $('game-overlay').classList.add('hidden');
  setBattlePauseButtonVisible(false);

  // 切換 battle-wrap 排版 class
  const wrap = document.querySelector('.battle-wrap');
  wrap.classList.remove('players-2', 'players-3', 'players-4');
  wrap.classList.add('players-' + playerCount);

  // 顯示對應數量的 player section,其餘隱藏
  for (let i = 1; i <= 4; i++) {
    const sec = document.querySelector('.player.p' + i);
    if (!sec) continue;
    if (i - 1 < playerCount) {
      sec.classList.remove('hidden');
      sec.classList.remove('eliminated');
    } else {
      sec.classList.add('hidden');
    }
  }

  // 為每個 slot 建立 Game (本地) 或 RemoteGame
  games = new Array(playerCount);
  let localGame = null;
  for (const p of roster) {
    const n = p.slot + 1;
    const cfg = {
      boardId: 'board-' + n, nextId: 'next-' + n, holdId: 'hold-' + n,
      scoreId: 'score-' + n, linesId: 'lines-' + n, comboId: 'combo-' + n,
      garbageFillId: 'garbage-' + n,
      blockSize: 24, previewSize: 18,
    };
    if (p.isLocal) {
      cfg.controls = SINGLE_CONTROLS;
      cfg.onGameOver = () => {
        const meP = roster.find(p => p.isLocal);
        meP.alive = false;
        applyEliminatedUI(meP.slot);
        online.send({ type: 'gameover' });
        checkWinnerOrEnd();
      };
      const g = new Game(cfg);
      games[p.slot] = g;
      localGame = g;
      // 設定 player-label
      document.querySelector('.player.p' + n + ' .player-label').textContent = 'YOU';
      document.querySelector('.player.p' + n + ' .control-hint').textContent =
        '← → 移動 · ↓ 軟降 · ↑/X 順轉 · Z 反轉 · Space 硬降 · Shift/C Hold';
    } else {
      games[p.slot] = new RemoteGame(cfg);
      document.querySelector('.player.p' + n + ' .player-label').textContent = '對手 ' + n;
      document.querySelector('.player.p' + n + ' .control-hint').textContent = '線上對手';
    }
  }

  // 本地遊戲攻擊路由:消行時隨機挑一個還活著的對手送 garbage
  localGame.opponent = {
    receiveGarbage: (n) => {
      const target = pickRandomTarget();
      if (target) online.sendTo(target, { type: 'garbage', lines: n });
    },
  };

  online.onMessage = (msg) => {
    if (!msg || !msg.type) return;
    if (msg.type === 'garbage' && msg.target === online.localId) {
      localGame.receiveGarbage(msg.lines | 0);
    } else if (msg.type === 'board') {
      const sender = roster.find(p => p.peerId === msg.from);
      if (sender && !sender.isLocal && games[sender.slot]) {
        games[sender.slot].applyState(msg.state);
      }
    } else if (msg.type === 'gameover') {
      const sender = roster.find(p => p.peerId === msg.from);
      if (sender && sender.alive) {
        sender.alive = false;
        applyEliminatedUI(sender.slot);
        if (games[sender.slot]) games[sender.slot].gameOver = true;
        checkWinnerOrEnd();
      }
    } else if (msg.type === 'rematch') {
      handlePeerRematch(msg.from);
    } else if (msg.type === 'peer-left') {
      // host 廣播某玩家離開 — joiner 端標記淘汰
      const p = roster.find(p => p.peerId === msg.peerId);
      if (p && p.alive) {
        p.alive = false;
        applyEliminatedUI(p.slot);
        if (games[p.slot]) games[p.slot].gameOver = true;
        checkWinnerOrEnd();
      }
    } else if (msg.type === 'start') {
      // host 廣播重新開始 (rematch)
      prepareOnlineGameStart(msg.roster);
    }
  };

  // host 端:遊戲中有玩家斷線 → 視為被淘汰,廣播給其他人
  if (online.role === 'host') {
    online.onPeerLeave = (peerId) => {
      const p = roster.find(p => p.peerId === peerId);
      if (p && p.alive) {
        p.alive = false;
        applyEliminatedUI(p.slot);
        if (games[p.slot]) games[p.slot].gameOver = true;
        online.send({ type: 'peer-left', peerId });
        checkWinnerOrEnd();
      }
    };
  } else {
    // joiner: host 斷線 → 全員結束
    online.onClose = () => {
      if (running) endMatchHostDisconnect();
      else {
        $('overlay-title').textContent = 'DISCONNECTED';
        $('overlay-text').textContent = '主機已斷線';
        $('overlay-restart').classList.add('hidden');
      }
    };
  }

  beginLoop();
}

function pickRandomTarget() {
  const alive = roster.filter(p => p.alive && !p.isLocal);
  if (alive.length === 0) return null;
  return alive[Math.floor(Math.random() * alive.length)].peerId;
}

function applyEliminatedUI(slot) {
  const sec = document.querySelector('.player.p' + (slot + 1));
  if (sec) sec.classList.add('eliminated');
}

function clearEliminatedUI() {
  for (let i = 1; i <= 4; i++) {
    const sec = document.querySelector('.player.p' + i);
    if (sec) sec.classList.remove('eliminated');
  }
}

function checkWinnerOrEnd() {
  const aliveList = roster.filter(p => p.alive);
  if (aliveList.length > 1) return; // 還有多人活著 — 繼續打
  // 結束 — 顯示勝負
  endMatchMultiplayer(aliveList[0] || null);
}

function endMatchMultiplayer(winner) {
  if (!running) return;
  running = false;
  Audio.stopBgm();
  const overlay = $('game-overlay');
  const title = $('overlay-title');
  const text = $('overlay-text');
  const restartBtn = $('overlay-restart');
  if (!winner) {
    title.textContent = 'DRAW';
    text.textContent = '所有人陣亡';
  } else if (winner.isLocal) {
    title.textContent = 'YOU WIN!';
    text.textContent = `恭喜!擊敗 ${roster.length - 1} 位對手`;
  } else {
    title.textContent = 'YOU LOSE';
    text.textContent = `玩家 ${winner.slot + 1} 獲勝`;
  }
  restartBtn.textContent = '再來一場';
  restartBtn.disabled = false;
  restartBtn.classList.remove('hidden');
  localRematchReady = false;
  peerRematchReady = false;
  rematchVotes.clear();
  overlay.classList.remove('hidden');
}

function endMatchHostDisconnect() {
  running = false;
  Audio.stopBgm();
  $('overlay-title').textContent = 'DISCONNECTED';
  $('overlay-text').textContent = '主機已斷線,遊戲中止';
  $('overlay-restart').classList.add('hidden');
  $('game-overlay').classList.remove('hidden');
}

function endMatchDisconnect() {
  running = false;
  Audio.stopBgm();
  const overlay = $('game-overlay');
  $('overlay-title').textContent = 'DISCONNECTED';
  $('overlay-text').textContent = '對手已斷線';
  $('overlay-restart').classList.add('hidden');
  overlay.classList.remove('hidden');
}

function resetRematchButton() {
  const btn = $('overlay-restart');
  btn.textContent = '再來一場';
  btn.disabled = false;
  btn.classList.remove('hidden');
}

function onlineRequestRematch() {
  if (mode !== 'online' || !online || !online.isReady()) return;
  if (rematchVotes.has(online.localId)) return;
  rematchVotes.add(online.localId);
  online.send({ type: 'rematch' });
  updateRematchButton();
  tryStartRematch();
}

function handlePeerRematch(fromId) {
  if (!fromId) return;
  rematchVotes.add(fromId);
  updateRematchButton();
  tryStartRematch();
}

function updateRematchButton() {
  const btn = $('overlay-restart');
  if (!online) return;
  const connectedPeers = online.connectedPeerIds();
  const totalNeeded = connectedPeers.length + 1;
  const got = rematchVotes.size;
  if (rematchVotes.has(online.localId)) {
    btn.textContent = `等待中 (${got}/${totalNeeded})`;
    btn.disabled = true;
  } else {
    btn.textContent = `再來一場 (${got}/${totalNeeded})`;
    btn.disabled = false;
  }
}

function tryStartRematch() {
  if (!online || online.role !== 'host') return;
  if (running) return; // 遊戲進行中不重啟
  const connectedPeers = online.connectedPeerIds();
  if (connectedPeers.length === 0) return;
  const allParticipants = [online.localId, ...connectedPeers];
  const allVoted = allParticipants.every(id => rematchVotes.has(id));
  if (!allVoted) return;
  // 建立新 roster (剔除中途斷線的)
  const newRoster = [{ peerId: online.localId, slot: 0 }];
  connectedPeers.forEach((id, i) => newRoster.push({ peerId: id, slot: i + 1 }));
  online.send({ type: 'start', roster: newRoster });
  prepareOnlineGameStart(newRoster);
}

function buildBoardSnapshot(g) {
  return {
    board: g.board,
    current: g.current ? {
      type: g.current.type,
      shape: g.current.shape,
      x: g.current.x, y: g.current.y,
      rotation: g.current.rotation || 0,
    } : null,
    held: g.held,
    nextType: g.next ? g.next.type : null,
    score: g.score,
    lines: g.lines,
    combo: g.combo,
    pendingGarbage: g.pendingGarbage,
  };
}

function beginLoop() {
  running = true;
  paused = false;
  Audio.init();
  Audio.startBgm();
  lastTime = performance.now();
  startCountdown();
  cancelAnimationFrame(rafId);
  rafId = requestAnimationFrame(mainLoop);
}

function startCountdown() {
  countdownPhase = 3;
  countdownAccum = 0;
  showCountdownText('3', false);
}

function isInCountdown() {
  return countdownPhase !== 0;
}

function showCountdownText(text, isGo) {
  const overlay = $('countdown-overlay');
  const num = $('countdown-num');
  num.textContent = text;
  num.classList.toggle('go', !!isGo);
  // 重啟 CSS 動畫
  num.style.animation = 'none';
  void num.offsetWidth;
  num.style.animation = '';
  overlay.classList.remove('hidden');
}

function hideCountdown() {
  $('countdown-overlay').classList.add('hidden');
  countdownPhase = 0;
  countdownAccum = 0;
}

function tickCountdown(delta) {
  countdownAccum += delta;
  const phaseDuration = countdownPhase > 0 ? 1000 : 450; // GO! 顯示時間短一點
  if (countdownAccum < phaseDuration) return;
  countdownAccum -= phaseDuration;
  if (countdownPhase > 1) {
    countdownPhase--;
    showCountdownText(String(countdownPhase), false);
  } else if (countdownPhase === 1) {
    countdownPhase = -1;
    showCountdownText('GO!', true);
  } else {
    hideCountdown();
    // 倒數結束後重設 lastTime,避免下一個 tick 帶入累積的 delta
    lastTime = performance.now();
  }
}

function mainLoop(time) {
  if (!running) return;
  const delta = time - lastTime;
  lastTime = time;

  if (isInCountdown()) {
    tickCountdown(delta);
    // 倒數期間遊戲邏輯凍結,但仍重繪 (特效不更新)
    for (const g of games) g.draw();
    rafId = requestAnimationFrame(mainLoop);
    return;
  }

  if (!paused) {
    for (const g of games) g.tick(delta);
    if (cpuAI) cpuAI.tick(delta);
    // 線上模式:節流廣播自己的快照給所有對手
    if (mode === 'online' && online && online.isReady() && mySlot >= 0) {
      stateSendAccum += delta;
      const myGame = games[mySlot];
      if (stateSendAccum >= STATE_SEND_INTERVAL && myGame && !myGame.gameOver) {
        stateSendAccum = 0;
        online.send({ type: 'board', state: buildBoardSnapshot(myGame) });
      }
    }
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
  const restartBtn = $('overlay-restart');
  restartBtn.classList.remove('hidden');
  if (mode === 'single') {
    title.textContent = 'GAME OVER';
    text.textContent = `分數: ${games[0].score}  消行: ${games[0].lines}`;
  } else if (mode === 'cpu') {
    const youWin = loser === games[1];
    const diffName = AI_DIFFICULTIES[cpuDifficulty].name;
    title.textContent = youWin ? 'YOU WIN!' : `CPU WIN`;
    text.textContent = youWin
      ? `擊敗 ${diffName} CPU · 你 ${games[0].score} 分,對手 ${games[1].score}`
      : `不敵 ${diffName} CPU · 你 ${games[0].score} 分,對手 ${games[1].score}`;
  } else if (mode === 'online') {
    // 線上模式採多人勝負判定 — 此 fallback 通常不會走到 (endMatchMultiplayer 已處理)
    const aliveList = roster.filter(p => p.alive);
    endMatchMultiplayer(aliveList[0] || null);
    return;
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
  if (isInCountdown()) return;     // 倒數中不可暫停
  if (mode === 'online') return;   // 線上模式無法單方面暫停
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
  hideCountdown();
  cancelAnimationFrame(rafId);
  Audio.stopBgm();
  games = [];
  cpuAI = null;
  roster = [];
  mySlot = -1;
  rematchVotes.clear();
  clearEliminatedUI();
  // 還原 battle-wrap class 與 player section 顯示
  const wrap = document.querySelector('.battle-wrap');
  if (wrap) wrap.classList.remove('players-2', 'players-3', 'players-4');
  document.querySelectorAll('.player.p3, .player.p4').forEach(el => el.classList.add('hidden'));
  document.querySelectorAll('.player.p1, .player.p2').forEach(el => el.classList.remove('hidden'));
  if (online) {
    online.close();
    online = null;
  }
  localRematchReady = false;
  peerRematchReady = false;
  resetRematchButton();
  $('single-layout').classList.add('hidden');
  $('battle-layout').classList.add('hidden');
  $('game-overlay').classList.add('hidden');
  $('cpu-select').classList.add('hidden');
  $('online-select').classList.add('hidden');
  resetOnlineLobby();
  $('mode-select').classList.remove('hidden');
}

function resetOnlineLobby() {
  $('online-pick').classList.remove('hidden');
  $('online-host-panel').classList.add('hidden');
  $('online-join-panel').classList.add('hidden');
  $('host-code').textContent = '建立中...';
  $('host-status').textContent = '正在建立房間...';
  $('host-status').className = 'online-status';
  $('host-player-list').innerHTML = '';
  $('host-start').disabled = true;
  $('join-status').textContent = '';
  $('join-status').className = 'online-status';
  const joinInput = $('join-code');
  if (joinInput) joinInput.value = '';
}

function restartMatch() {
  if (mode === 'single') startSingle();
  else if (mode === 'battle') startBattle();
  else if (mode === 'cpu') startCpu(cpuDifficulty);
  else if (mode === 'online') onlineRequestRematch();
  else backToMenu();
}

// ====== 鍵盤 ======
document.addEventListener('keydown', (e) => {
  // 在輸入框/文字區內不攔截,以免影響打字
  const tag = e.target && e.target.tagName;
  if (tag === 'INPUT' || tag === 'TEXTAREA') return;

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
      if (mode === 'online') onlineRequestRematch();
      else restartMatch();
      return;
    }
  }

  if (!running || paused || isInCountdown() || e.repeat) return;
  for (const g of games) g.handleKeyDown(e.code);
});

document.addEventListener('keyup', (e) => {
  for (const g of games) g.handleKeyUp(e.code);
});

// ====== 按鈕綁定 ======
$('btn-single').addEventListener('click', startSingle);
$('btn-battle').addEventListener('click', startBattle);
$('btn-cpu').addEventListener('click', () => {
  $('mode-select').classList.add('hidden');
  $('cpu-select').classList.remove('hidden');
});
$('cpu-back').addEventListener('click', () => {
  $('cpu-select').classList.add('hidden');
  $('mode-select').classList.remove('hidden');
});
document.querySelectorAll('.diff-btn').forEach(btn => {
  btn.addEventListener('click', () => startCpu(btn.dataset.diff));
});
$('overlay-restart').addEventListener('click', () => {
  if (mode === 'online') onlineRequestRematch();
  else restartMatch();
});
$('overlay-back').addEventListener('click', backToMenu);

// ===== 線上對戰大廳按鈕 =====
$('btn-online').addEventListener('click', () => {
  $('mode-select').classList.add('hidden');
  resetOnlineLobby();
  $('online-select').classList.remove('hidden');
});
$('online-back').addEventListener('click', () => {
  if (online) { online.close(); online = null; }
  $('online-select').classList.add('hidden');
  $('mode-select').classList.remove('hidden');
});
$('online-host').addEventListener('click', async () => {
  if (typeof Peer === 'undefined') {
    $('host-status').textContent = '無法載入 PeerJS — 請檢查網路';
    $('host-status').className = 'online-status err';
    $('online-pick').classList.add('hidden');
    $('online-host-panel').classList.remove('hidden');
    return;
  }
  $('online-pick').classList.add('hidden');
  $('online-host-panel').classList.remove('hidden');
  $('host-code').textContent = '建立中...';
  $('host-status').textContent = '正在建立房間...';
  $('host-status').className = 'online-status';
  $('host-start').disabled = true;
  online = new OnlineController();
  online.onPeerJoin = (peerId) => {
    refreshHostPlayerList();
    const total = online.peerCount() + 1;
    $('host-status').textContent = `已加入 ${total} 人(最多 4 人)— 點「開始遊戲」開局`;
    $('host-status').className = 'online-status ok';
    $('host-start').disabled = total < 2;
  };
  online.onPeerLeave = (peerId) => {
    refreshHostPlayerList();
    const total = online.peerCount() + 1;
    $('host-status').textContent = total >= 2
      ? `已加入 ${total} 人 — 點「開始遊戲」開局`
      : '等待對手加入...';
    $('host-status').className = 'online-status';
    $('host-start').disabled = total < 2;
  };
  try {
    const code = await online.hostRoom();
    $('host-code').textContent = code;
    $('host-status').textContent = '等待對手加入...';
    refreshHostPlayerList();
  } catch (err) {
    $('host-status').textContent = '建立失敗:' + (err.message || err.type || '未知錯誤');
    $('host-status').className = 'online-status err';
    online = null;
  }
});

function refreshHostPlayerList() {
  const ul = $('host-player-list');
  ul.innerHTML = '';
  const meLi = document.createElement('li');
  meLi.textContent = '玩家 1 (你 · 房主)';
  meLi.className = 'you';
  ul.appendChild(meLi);
  if (online) {
    online.conns.forEach((c, i) => {
      if (!c.open) return;
      const li = document.createElement('li');
      li.textContent = '玩家 ' + (i + 2);
      ul.appendChild(li);
    });
  }
}

$('host-start').addEventListener('click', () => {
  if (!online || online.role !== 'host') return;
  const peerIds = online.connectedPeerIds();
  if (peerIds.length === 0) return;
  // 建立 roster:host 為 slot 0,joiner 依連線順序填入 slot 1, 2, 3
  const rosterData = [{ peerId: online.localId, slot: 0 }];
  peerIds.forEach((id, i) => rosterData.push({ peerId: id, slot: i + 1 }));
  // 廣播 start 給所有 joiner
  online.send({ type: 'start', roster: rosterData });
  // host 自己也開始
  prepareOnlineGameStart(rosterData);
});
$('copy-code').addEventListener('click', async () => {
  const code = $('host-code').textContent;
  if (!code || code === '建立中...') return;
  try {
    await navigator.clipboard.writeText(code);
    const btn = $('copy-code');
    const prev = btn.textContent;
    btn.textContent = '已複製';
    setTimeout(() => { btn.textContent = prev; }, 1200);
  } catch {
    // 複製失敗就讓使用者自己選取
    const el = $('host-code');
    const range = document.createRange();
    range.selectNodeContents(el);
    const sel = window.getSelection();
    sel.removeAllRanges();
    sel.addRange(range);
  }
});
$('online-join').addEventListener('click', () => {
  $('online-pick').classList.add('hidden');
  $('online-join-panel').classList.remove('hidden');
  $('join-status').textContent = '';
  $('join-status').className = 'online-status';
  $('join-code').focus();
});
async function doJoin() {
  if (typeof Peer === 'undefined') {
    $('join-status').textContent = '無法載入 PeerJS — 請檢查網路';
    $('join-status').className = 'online-status err';
    return;
  }
  let code = $('join-code').value.trim().toUpperCase();
  if (!code) {
    $('join-status').textContent = '請輸入房間碼';
    $('join-status').className = 'online-status err';
    return;
  }
  if (!code.startsWith('TETRIS-')) code = 'TETRIS-' + code;
  $('join-status').textContent = '連線中...';
  $('join-status').className = 'online-status';
  online = new OnlineController();
  try {
    await online.joinRoom(code);
    $('join-status').textContent = '已連線!等待房主開始遊戲...';
    $('join-status').className = 'online-status ok';
    // 大廳期間先設一個臨時 handler 等待 host 發送 start
    online.onMessage = (msg) => {
      if (!msg || !msg.type) return;
      if (msg.type === 'start' && Array.isArray(msg.roster)) {
        prepareOnlineGameStart(msg.roster);
      }
    };
    online.onClose = () => {
      $('join-status').textContent = '主機已關閉房間';
      $('join-status').className = 'online-status err';
      if (online) { online.close(); online = null; }
    };
  } catch (err) {
    const msg = (err && (err.message || err.type)) || '未知錯誤';
    let friendly = msg;
    if (msg.includes('peer-unavailable') || msg.includes('Could not connect')) {
      friendly = '找不到該房間 — 確認房間碼是否正確且對方還在等待';
    } else if (msg.includes('逾時')) {
      friendly = msg;
    }
    $('join-status').textContent = '連線失敗:' + friendly;
    $('join-status').className = 'online-status err';
    if (online) { online.close(); online = null; }
  }
}
$('join-go').addEventListener('click', doJoin);
$('join-code').addEventListener('keydown', (e) => {
  if (e.code === 'Enter') { e.preventDefault(); doJoin(); }
});

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

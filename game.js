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
    this.effects = [];
    this.shake = 0;
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
    const startY = this.current.y;
    this.current.y += dist;
    this.score += dist * 2;
    Audio.play('drop');
    if (dist > 0) this.spawnDropEffect(this.current, startY, this.current.y);
    this.shake = Math.min(8, 2 + dist * 0.3);
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
    // 先收集滿行(原 y 位置用於生特效)
    const fullRows = [];
    for (let y = 0; y < ROWS; y++) {
      if (this.board[y].every(c => c)) fullRows.push(y);
    }
    const cleared = fullRows.length;
    if (cleared > 0) {
      for (const y of fullRows) this.spawnLineClearEffect(y, this.board[y].slice());
      // 重建 board:過濾非滿行,前方補等量空行
      const remaining = this.board.filter(row => !row.every(c => c));
      const newBoard = [];
      for (let i = 0; i < cleared; i++) newBoard.push(Array(COLS).fill(0));
      newBoard.push(...remaining);
      this.board = newBoard;

      const points = [0, 100, 300, 500, 800][cleared] * this.level;
      this.score += points;
      this.lines += cleared;
      this.level = Math.floor(this.lines / 10) + 1;
      Audio.play(cleared === 4 ? 'tetris' : 'clear');
      this.shake = Math.min(14, 3 + cleared * 1.8);

      // 大型文字飛字
      const centerX = this.boardCanvas.width / 2;
      const centerY = (fullRows[0] + fullRows[fullRows.length - 1] + 1) / 2 * this.blockSize;
      this.spawnClearText(cleared, centerX, centerY);
      this.spawnScorePopup(points, centerX, centerY - this.blockSize);

      // Tetris 額外效果:全板閃光 + 閃電
      if (cleared === 4) {
        this.effects.push({ kind: 'boardFlash', life: 0, maxLife: 400 });
        this.spawnLightning(6);
      }

      // 連消提示
      if (this.combo + 1 >= 2) {
        this.spawnComboText(this.combo + 1, centerX, centerY + this.blockSize * 1.2);
      }

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

  spawnClearText(cleared, x, y) {
    const presets = {
      1: { text: 'SINGLE',  gradient: ['#a5f3fc', '#22d3ee', '#0e7490'], glow: '#22d3ee', size: 1.5 },
      2: { text: 'DOUBLE',  gradient: ['#c7d2fe', '#a78bfa', '#6d28d9'], glow: '#a78bfa', size: 1.6 },
      3: { text: 'TRIPLE',  gradient: ['#fda4af', '#f43f5e', '#9f1239'], glow: '#f43f5e', size: 1.7 },
      4: { text: 'TETRIS!', gradient: ['#fef3c7', '#fbbf24', '#f43f5e', '#a78bfa', '#22d3ee'], glow: '#fbbf24', size: 2.0 },
    };
    const p = presets[cleared];
    if (!p) return;
    this.effects.push({
      kind: 'textBurst', text: p.text,
      x, y, fontSize: this.blockSize * p.size,
      gradient: p.gradient, glow: p.glow,
      startScale: 0.3, endScale: 1.0,
      weight: 900, outline: 5, outlineColor: 'rgba(0,0,0,0.85)',
      rise: 24,
      life: 0, maxLife: cleared === 4 ? 1500 : 1100,
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
    this.effects.push({
      kind: 'textBurst', text: `COMBO ×${n}`,
      x, y, fontSize: this.blockSize * 0.75,
      color: '#fda4af', glow: '#f43f5e',
      startScale: 0.5, endScale: 1.0,
      weight: 700, outline: 3, outlineColor: 'rgba(0,0,0,0.7)',
      rise: 40,
      life: 0, maxLife: 1000,
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
  }

  updateGarbageBar() {
    if (!this.garbageFillEl) return;
    const pct = Math.min(100, (this.pendingGarbage / ROWS) * 100);
    this.garbageFillEl.style.height = pct + '%';
  }

  tick(delta) {
    this.updateEffects(delta);
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

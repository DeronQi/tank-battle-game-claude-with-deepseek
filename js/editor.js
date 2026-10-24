import {
  ARENA,
  BASE,
  BASE_RING_CELLS,
  ENEMY_SPAWNS,
  GRID,
  PLAYER_SPAWNS,
  TILE,
  TILE_TYPE,
} from './config.js';
import {
  BUILTIN_LEVELS,
  cloneGrid,
  createEmptyGrid,
  generateRandomLevel,
  gridFromRows,
  isProtectedCell,
  isSpawnCell,
  normalizeLevel,
} from './levels.js';
import { paintBase, paintTile, paintTree } from './renderer.js';

const TOOL_TYPES = {
  erase: TILE_TYPE.EMPTY,
  brick: TILE_TYPE.BRICK,
  steel: TILE_TYPE.STEEL,
  tree: TILE_TYPE.TREE,
  water: TILE_TYPE.WATER,
  ice: TILE_TYPE.ICE,
};

const TOOL_COLORS = {
  erase: 'rgba(157, 200, 184, 0.7)',
  brick: '#d0814a',
  steel: '#b8c7d6',
  tree: '#4caf63',
  water: '#56bde7',
  ice: '#bfe9f7',
};

function isSpawnZone(c, r) {
  const zones = [
    ...PLAYER_SPAWNS.map(({ c, r }) => ({ c, r })),
    ...ENEMY_SPAWNS.map(({ c, r }) => ({ c, r })),
  ];
  return zones.some((zone) => Math.abs(zone.c - c) <= 1 && Math.abs(zone.r - r) <= 1);
}

export class LevelEditor {
  constructor({ canvas, onToast }) {
    this.canvas = canvas;
    this.ctx = canvas.getContext('2d');
    this.onToast = onToast;
    this.dpr = Math.min(2, window.devicePixelRatio || 1);
    this.active = false;
    this.tool = 'brick';
    this.grid = this.blankGrid();
    this.name = '我的关卡';
    this.painting = false;
    this.paintValue = TILE_TYPE.BRICK;
    this.hover = null;
    this.time = 0;
    this.resize();
    window.addEventListener('resize', () => this.resize());
    this.bindEvents();
  }

  resize() {
    this.dpr = Math.min(2, window.devicePixelRatio || 1);
    this.canvas.width = Math.floor(ARENA * this.dpr);
    this.canvas.height = Math.floor(ARENA * this.dpr);
  }

  bindEvents() {
    const getCell = (event) => {
      const rect = this.canvas.getBoundingClientRect();
      const x = ((event.clientX - rect.left) / rect.width) * ARENA;
      const y = ((event.clientY - rect.top) / rect.height) * ARENA;
      return { c: Math.floor(x / TILE), r: Math.floor(y / TILE) };
    };

    this.canvas.addEventListener('contextmenu', (event) => event.preventDefault());
    this.canvas.addEventListener('pointerdown', (event) => {
      if (!this.active) return;
      this.canvas.setPointerCapture(event.pointerId);
      const cell = getCell(event);
      this.painting = true;
      this.paintValue = event.button === 2 ? TILE_TYPE.EMPTY : TOOL_TYPES[this.tool];
      this.paintAt(cell.c, cell.r, this.paintValue);
    });
    this.canvas.addEventListener('pointermove', (event) => {
      if (!this.active) return;
      const cell = getCell(event);
      this.hover = cell;
      if (this.painting) this.paintAt(cell.c, cell.r, this.paintValue);
    });
    window.addEventListener('pointerup', () => {
      this.painting = false;
    });
    this.canvas.addEventListener('pointerleave', () => {
      this.hover = null;
    });
  }

  blankGrid() {
    const grid = createEmptyGrid();
    for (const { c, r } of BASE_RING_CELLS) grid[r][c] = TILE_TYPE.BRICK;
    return grid;
  }

  open(level = null) {
    this.active = true;
    if (level) {
      this.loadLevel(level);
    } else if (!this.grid) {
      this.grid = this.blankGrid();
    }
    this.render();
  }

  close() {
    this.active = false;
    this.painting = false;
  }

  setTool(tool) {
    if (!(tool in TOOL_TYPES)) return;
    this.tool = tool;
  }

  paintAt(c, r, value) {
    if (c < 0 || c >= GRID || r < 0 || r >= GRID) return;
    if (isProtectedCell(c, r) || isSpawnZone(c, r)) {
      if (this.onToast) this.onToast('基地与出生点区域已锁定');
      return;
    }
    this.grid[r][c] = value;
    this.render();
  }

  clear() {
    this.grid = this.blankGrid();
    this.render();
    if (this.onToast) this.onToast('已清空地图');
  }

  randomize(stage = 1) {
    const level = generateRandomLevel(stage, '编辑器随机地图');
    this.grid = cloneGrid(level.grid);
    this.render();
    if (this.onToast) this.onToast('已生成随机地图');
  }

  loadLevel(level) {
    const normalized = normalizeLevel(level);
    this.grid = cloneGrid(normalized.grid);
    this.name = normalized.name;
    this.render();
  }

  loadBuiltin() {
    this.loadLevel(BUILTIN_LEVELS[0]);
    if (this.onToast) this.onToast('已载入经典首关');
  }

  getLevel({ name, enemyCount, enemyMix } = {}) {
    return normalizeLevel({
      name: (name || this.name || '我的关卡').slice(0, 24),
      grid: cloneGrid(this.grid),
      enemyCount,
      enemyMix,
    });
  }

  render() {
    if (!this.active) return;
    this.time += 1 / 60;
    const ctx = this.ctx;
    ctx.setTransform(this.dpr, 0, 0, this.dpr, 0, 0);
    ctx.imageSmoothingEnabled = false;
    ctx.fillStyle = '#07110f';
    ctx.fillRect(0, 0, ARENA, ARENA);

    for (let r = 0; r < GRID; r += 1) {
      for (let c = 0; c < GRID; c += 1) {
        paintTile(ctx, c * TILE, r * TILE, this.grid[r][c], this.time);
      }
    }
    for (let r = 0; r < GRID; r += 1) {
      for (let c = 0; c < GRID; c += 1) {
        if (this.grid[r][c] === TILE_TYPE.TREE) {
          paintTree(ctx, c * TILE, r * TILE, this.time);
        }
      }
    }

    paintBase(
      ctx,
      {
        x: BASE.col * TILE,
        y: BASE.row * TILE,
        w: BASE.w * TILE,
      },
      this.time,
      false,
    );

    this.drawSpawnZones(ctx);
    this.drawGrid(ctx);
    this.drawHover(ctx);
  }

  drawSpawnZones(ctx) {
    ctx.save();
    for (let i = 0; i < PLAYER_SPAWNS.length; i += 1) {
      const spawn = PLAYER_SPAWNS[i];
      const x = spawn.c * TILE + TILE / 2;
      const y = spawn.r * TILE + TILE / 2;
      ctx.strokeStyle = i === 0 ? 'rgba(237, 205, 85, 0.9)' : 'rgba(126, 200, 120, 0.9)';
      ctx.lineWidth = 2;
      ctx.setLineDash([4, 4]);
      ctx.beginPath();
      ctx.arc(x, y, 15, 0, Math.PI * 2);
      ctx.stroke();
      ctx.setLineDash([]);
      ctx.fillStyle = i === 0 ? '#efd45a' : '#86cf7e';
      ctx.font = 'bold 11px "Courier New", monospace';
      ctx.textAlign = 'center';
      ctx.fillText(`P${i + 1}`, x, y + 4);
    }

    for (const spawn of ENEMY_SPAWNS) {
      const x = spawn.c * TILE + TILE / 2;
      const y = spawn.r * TILE + TILE / 2;
      ctx.strokeStyle = 'rgba(255, 118, 96, 0.85)';
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.moveTo(x - 7, y - 7);
      ctx.lineTo(x + 7, y + 7);
      ctx.moveTo(x + 7, y - 7);
      ctx.lineTo(x - 7, y + 7);
      ctx.stroke();
      ctx.beginPath();
      ctx.arc(x, y, 12, 0, Math.PI * 2);
      ctx.stroke();
    }

    ctx.fillStyle = 'rgba(8, 16, 15, 0.55)';
    ctx.strokeStyle = 'rgba(255, 255, 255, 0.12)';
    for (let r = 0; r < GRID; r += 1) {
      for (let c = 0; c < GRID; c += 1) {
        if (!isProtectedCell(c, r) && !isSpawnZone(c, r)) continue;
        if (isProtectedCell(c, r) && !isSpawnCell(c, r)) continue;
        ctx.fillRect(c * TILE, r * TILE, TILE, TILE);
        ctx.strokeRect(c * TILE + 0.5, r * TILE + 0.5, TILE - 1, TILE - 1);
      }
    }
    ctx.restore();
  }

  drawGrid(ctx) {
    ctx.save();
    ctx.strokeStyle = 'rgba(136, 198, 174, 0.12)';
    ctx.lineWidth = 1;
    for (let i = 0; i <= GRID; i += 1) {
      ctx.beginPath();
      ctx.moveTo(i * TILE + 0.5, 0);
      ctx.lineTo(i * TILE + 0.5, ARENA);
      ctx.stroke();
      ctx.beginPath();
      ctx.moveTo(0, i * TILE + 0.5);
      ctx.lineTo(ARENA, i * TILE + 0.5);
      ctx.stroke();
    }
    ctx.restore();
  }

  drawHover(ctx) {
    if (!this.hover) return;
    const { c, r } = this.hover;
    if (c < 0 || c >= GRID || r < 0 || r >= GRID) return;
    ctx.save();
    ctx.strokeStyle = TOOL_COLORS[this.tool] || '#ffffff';
    ctx.lineWidth = 2;
    ctx.strokeRect(c * TILE + 2, r * TILE + 2, TILE - 4, TILE - 4);
    ctx.fillStyle = 'rgba(255, 255, 255, 0.05)';
    ctx.fillRect(c * TILE + 2, r * TILE + 2, TILE - 4, TILE - 4);
    ctx.restore();
  }
}

export { TOOL_TYPES };

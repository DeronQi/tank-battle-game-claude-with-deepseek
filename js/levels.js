import {
  BASE_CELLS,
  BASE_RING_CELLS,
  CHAR_TO_TILE,
  ENEMY_SPAWNS,
  GRID,
  PLAYER_SPAWNS,
  TILE_TO_CHAR,
  TILE_TYPE,
} from './config.js';

const BUILTIN_ROWS = [
  '...............',
  '..BB..BBB..BB..',
  '..BB..B.B..BB..',
  '......B.B......',
  '.TT...B.B...TT.',
  '.TT...S.S...TT.',
  '......B.B......',
  '.BB..WWWWW..BB.',
  '.BB..W...W..BB.',
  '.....W...W.....',
  '..BB.BB.BB.BB..',
  '..BB.......BB..',
  '.....BB.BB.....',
  '......B..B.....',
  '......B..B.....',
];

export const BUILTIN_LEVELS = [
  {
    id: 'classic-1',
    name: '经典首关',
    grid: BUILTIN_ROWS,
    enemyCount: 12,
    enemyMix: { basic: 0.62, fast: 0.25, power: 0.13, armor: 0 },
  },
];

const SPAWN_CLEAR_ZONES = [
  ...PLAYER_SPAWNS.map((s) => ({ c: s.c, r: s.r, radius: 1 })),
  ...ENEMY_SPAWNS.map((s) => ({ c: s.c, r: s.r, radius: 1 })),
];

const PROTECTED_CELLS = new Set([
  ...BASE_CELLS.map(({ c, r }) => `${c},${r}`),
  ...BASE_RING_CELLS.map(({ c, r }) => `${c},${r}`),
]);

const SPAWN_CELLS = new Set(SPAWN_CLEAR_ZONES.map(({ c, r }) => `${c},${r}`));

function isInSpawnClearZone(c, r) {
  return SPAWN_CLEAR_ZONES.some(
    (zone) =>
      Math.abs(c - zone.c) <= zone.radius &&
      Math.abs(r - zone.r) <= zone.radius,
  );
}

export function isProtectedCell(c, r) {
  return PROTECTED_CELLS.has(`${c},${r}`);
}

export function isSpawnCell(c, r) {
  return SPAWN_CELLS.has(`${c},${r}`);
}

export function createEmptyGrid(value = TILE_TYPE.EMPTY) {
  return Array.from({ length: GRID }, () => Array(GRID).fill(value));
}

export function cloneGrid(grid) {
  return grid.map((row) => row.slice());
}

export function gridFromRows(rows) {
  return Array.from({ length: GRID }, (_, r) => {
    const source = rows?.[r] ?? '';
    return Array.from({ length: GRID }, (_, c) => {
      const ch = typeof source === 'string' ? source[c] : source?.[c];
      return typeof ch === 'number' ? ch : (CHAR_TO_TILE[ch] ?? TILE_TYPE.EMPTY);
    });
  });
}

export function gridToRows(grid) {
  return grid.map((row) => row.map((v) => TILE_TO_CHAR[v] ?? '.').join(''));
}

export function normalizeLevel(raw = {}) {
  let grid;
  if (Array.isArray(raw.grid) && raw.grid.every((row) => typeof row === 'string')) {
    grid = gridFromRows(raw.grid);
  } else if (Array.isArray(raw.grid)) {
    grid = Array.from({ length: GRID }, (_, r) =>
      Array.from({ length: GRID }, (_, c) => {
        const value = raw.grid?.[r]?.[c];
        return typeof value === 'number' ? value : (CHAR_TO_TILE[value] ?? TILE_TYPE.EMPTY);
      }),
    );
  } else {
    grid = createEmptyGrid();
  }

  for (const { c, r } of BASE_CELLS) grid[r][c] = TILE_TYPE.EMPTY;
  for (const { c, r } of BASE_RING_CELLS) {
    if (grid[r][c] === TILE_TYPE.EMPTY) grid[r][c] = TILE_TYPE.BRICK;
  }
  for (const zone of SPAWN_CLEAR_ZONES) {
    for (let dr = -zone.radius; dr <= zone.radius; dr += 1) {
      for (let dc = -zone.radius; dc <= zone.radius; dc += 1) {
        const c = zone.c + dc;
        const r = zone.r + dr;
        if (c >= 0 && c < GRID && r >= 0 && r < GRID) grid[r][c] = TILE_TYPE.EMPTY;
      }
    }
  }
  for (const { c, r } of BASE_CELLS) grid[r][c] = TILE_TYPE.EMPTY;

  const enemyCount = Math.max(4, Math.min(30, Math.round(Number(raw.enemyCount) || 12)));
  const rawMix = raw.enemyMix ?? {};
  const mix = {
    basic: Math.max(0, Number(rawMix.basic) || 0),
    fast: Math.max(0, Number(rawMix.fast) || 0),
    power: Math.max(0, Number(rawMix.power) || 0),
    armor: Math.max(0, Number(rawMix.armor) || 0),
  };
  const total = mix.basic + mix.fast + mix.power + mix.armor;
  if (total <= 0) {
    mix.basic = 0.62;
    mix.fast = 0.25;
    mix.power = 0.13;
    mix.armor = 0;
  } else {
    for (const key of Object.keys(mix)) mix[key] /= total;
  }

  return {
    id: typeof raw.id === 'string' ? raw.id : null,
    name: String(raw.name || '未命名关卡').slice(0, 24),
    grid,
    enemyCount,
    enemyMix: mix,
  };
}

export function serializeLevel(level) {
  const normalized = normalizeLevel(level);
  return {
    version: 1,
    name: normalized.name,
    grid: gridToRows(normalized.grid),
    enemyCount: normalized.enemyCount,
    enemyMix: normalized.enemyMix,
  };
}

export function deserializeLevel(data) {
  if (typeof data === 'string') {
    let parsed;
    try {
      parsed = JSON.parse(data);
    } catch {
      throw new Error('JSON 格式无效');
    }
    return deserializeLevel(parsed);
  }
  if (!data || typeof data !== 'object') throw new Error('关卡数据为空');
  if (!Array.isArray(data.grid) || data.grid.length !== GRID) {
    throw new Error('关卡必须是 15 × 15 网格');
  }
  return normalizeLevel(data);
}

export function createEnemyQueue(level, stage = 1) {
  const normalized = normalizeLevel(level);
  const queue = [];
  const entries = Object.entries(normalized.enemyMix).filter(([, w]) => w > 0);
  const fallback = [['basic', 1]];
  const source = entries.length ? entries : fallback;

  for (let i = 0; i < normalized.enemyCount; i += 1) {
    let roll = Math.random();
    let picked = source[source.length - 1][0];
    for (const [kind, weight] of source) {
      if (roll < weight) {
        picked = kind;
        break;
      }
      roll -= weight;
    }
    queue.push(picked);
  }

  if (stage > 2) {
    const bonus = Math.min(3, Math.floor((stage - 2) / 2));
    for (let i = 0; i < bonus && queue.length > 5; i += 1) {
      queue[i] = i % 2 === 0 ? 'fast' : 'armor';
    }
  }
  return queue;
}

export function mixForStage(stage) {
  const t = Math.max(0, Math.min(1, (stage - 1) / 12));
  const basic = Math.max(0.18, 0.7 - t * 0.48);
  const fast = 0.16 + t * 0.1;
  const power = 0.11 + t * 0.16;
  const armor = Math.max(0, (stage - 2) * 0.035 + t * 0.14);
  const total = basic + fast + power + armor;
  return { basic: basic / total, fast: fast / total, power: power / total, armor: armor / total };
}

function inBounds(c, r) {
  return c >= 0 && c < GRID && r >= 0 && r < GRID;
}

function isNearReserved(c, r, pad = 0) {
  if (!inBounds(c, r)) return true;
  if (isProtectedCell(c, r)) return true;
  for (const zone of SPAWN_CLEAR_ZONES) {
    if (
      Math.abs(c - zone.c) <= zone.radius + pad &&
      Math.abs(r - zone.r) <= zone.radius + pad
    ) {
      return true;
    }
  }
  return false;
}

function put(grid, c, r, value, mirror = true) {
  if (!inBounds(c, r) || isNearReserved(c, r)) return;
  grid[r][c] = value;
  if (mirror) {
    const mc = GRID - 1 - c;
    if (!isNearReserved(mc, r)) grid[r][mc] = value;
  }
}

function addStructure(grid, c, r, w, h, value, mirror = true) {
  for (let dr = 0; dr < h; dr += 1) {
    for (let dc = 0; dc < w; dc += 1) put(grid, c + dc, r + dr, value, mirror);
  }
}

function addWaterPond(grid) {
  const left = Math.random() < 0.5;
  const c = left ? 2 + Math.floor(Math.random() * 3) : 8 + Math.floor(Math.random() * 3);
  const r = 4 + Math.floor(Math.random() * 5);
  addStructure(grid, c, r, 2, 2 + Math.floor(Math.random() * 2), TILE_TYPE.WATER, false);
}

function addTreeGrove(grid) {
  const c = 1 + Math.floor(Math.random() * 5);
  const r = 2 + Math.floor(Math.random() * 8);
  for (let dr = 0; dr < 2; dr += 1) {
    for (let dc = 0; dc < 2; dc += 1) {
      if (Math.random() < 0.75) put(grid, c + dc, r + dr, TILE_TYPE.TREE);
    }
  }
}

export function generateRandomLevel(stage = 1, name) {
  const grid = createEmptyGrid();
  const t = Math.min(1, stage / 18);
  const mirror = Math.random() < 0.8;

  for (const { c, r } of BASE_RING_CELLS) {
    if (inBounds(c, r)) grid[r][c] = TILE_TYPE.BRICK;
  }

  const horizontalWalls = 4 + Math.floor(Math.random() * 4);
  for (let i = 0; i < horizontalWalls; i += 1) {
    const len = 2 + Math.floor(Math.random() * 4);
    const c = 1 + Math.floor(Math.random() * 7);
    const r = 1 + Math.floor(Math.random() * 11);
    const value = Math.random() < 0.12 + t * 0.14 ? TILE_TYPE.STEEL : TILE_TYPE.BRICK;
    addStructure(grid, c, r, len, 1, value, mirror);
  }

  const verticalWalls = 3 + Math.floor(Math.random() * 4);
  for (let i = 0; i < verticalWalls; i += 1) {
    const len = 2 + Math.floor(Math.random() * 4);
    const c = 1 + Math.floor(Math.random() * 7);
    const r = 1 + Math.floor(Math.random() * 9);
    const value = Math.random() < 0.1 + t * 0.12 ? TILE_TYPE.STEEL : TILE_TYPE.BRICK;
    addStructure(grid, c, r, 1, len, value, mirror);
  }

  const blocks = 5 + Math.floor(Math.random() * 5);
  for (let i = 0; i < blocks; i += 1) {
    const c = 1 + Math.floor(Math.random() * 7);
    const r = 1 + Math.floor(Math.random() * 11);
    const w = 1 + Math.floor(Math.random() * 2);
    const h = 1 + Math.floor(Math.random() * 3);
    const value =
      Math.random() < 0.16 + t * 0.16 ? TILE_TYPE.STEEL : TILE_TYPE.BRICK;
    addStructure(grid, c, r, w, h, value, mirror);
  }

  addWaterPond(grid);
  if (Math.random() < 0.7) addWaterPond(grid);
  addTreeGrove(grid);
  if (Math.random() < 0.8) addTreeGrove(grid);

  if (Math.random() < 0.45) {
    const r = 2 + Math.floor(Math.random() * 9);
    addStructure(grid, 0, r, 2, 2, TILE_TYPE.ICE, false);
  }

  ensureReachability(grid);

  for (let c = 5; c <= 10; c += 1) {
    for (let r = 11; r <= 12; r += 1) {
      if (inBounds(c, r)) grid[r][c] = TILE_TYPE.BRICK;
    }
  }

  for (const { c, r } of BASE_CELLS) grid[r][c] = TILE_TYPE.EMPTY;
  for (const { c, r } of BASE_RING_CELLS) {
    if (grid[r][c] === TILE_TYPE.EMPTY || grid[r][c] === TILE_TYPE.TREE) {
      grid[r][c] = TILE_TYPE.BRICK;
    }
  }
  for (const zone of SPAWN_CLEAR_ZONES) {
    for (let dr = -zone.radius; dr <= zone.radius; dr += 1) {
      for (let dc = -zone.radius; dc <= zone.radius; dc += 1) {
        const c = zone.c + dc;
        const r = zone.r + dr;
        if (inBounds(c, r)) grid[r][c] = TILE_TYPE.EMPTY;
      }
    }
  }

  const count = Math.min(24, 10 + stage * 2 + Math.floor(Math.random() * 3));
  const level = normalizeLevel({
    name: name || `随机战场 ${String(stage).padStart(2, '0')}`,
    grid,
    enemyCount: count,
    enemyMix: mixForStage(stage),
  });
  for (const c of [5, 10]) {
    for (let r = 11; r < GRID; r += 1) {
      if (isInSpawnClearZone(c, r)) continue;
      if (!BASE_CELLS.some((cell) => cell.c === c && cell.r === r)) {
        level.grid[r][c] = TILE_TYPE.BRICK;
      }
    }
  }
  return level;
}

function isStaticPassable(grid, c, r) {
  if (!inBounds(c, r)) return false;
  const tile = grid[r][c];
  return tile !== TILE_TYPE.STEEL && tile !== TILE_TYPE.WATER;
}

function reachableSet(grid, start) {
  const seen = new Set();
  if (!isStaticPassable(grid, start.c, start.r)) return seen;
  const queue = [start];
  seen.add(`${start.c},${start.r}`);
  while (queue.length) {
    const { c, r } = queue.shift();
    for (const [dc, dr] of [[0, -1], [1, 0], [0, 1], [-1, 0]]) {
      const nc = c + dc;
      const nr = r + dr;
      const key = `${nc},${nr}`;
      if (seen.has(key) || !isStaticPassable(grid, nc, nr)) continue;
      seen.add(key);
      queue.push({ c: nc, r: nr });
    }
  }
  return seen;
}

function carveCorridor(grid, from, to) {
  let c = from.c;
  let r = from.r;
  const horizontalFirst = Math.random() < 0.5;
  const step = () => {
    if (horizontalFirst) {
      if (c !== to.c) c += Math.sign(to.c - c);
      else if (r !== to.r) r += Math.sign(to.r - r);
    } else if (r !== to.r) r += Math.sign(to.r - r);
    else if (c !== to.c) c += Math.sign(to.c - c);
    const value = grid[r]?.[c];
    if (value === TILE_TYPE.STEEL || value === TILE_TYPE.WATER) {
      grid[r][c] = TILE_TYPE.EMPTY;
    }
  };
  let guard = 0;
  while ((c !== to.c || r !== to.r) && guard < 80) {
    step();
    guard += 1;
  }
}

function ensureReachability(grid) {
  const starts = [
    ...ENEMY_SPAWNS.map(({ c, r }) => ({ c, r })),
    ...PLAYER_SPAWNS.map(({ c, r }) => ({ c, r })),
  ];
  const targets = BASE_RING_CELLS.map(({ c, r }) => ({ c, r }));

  for (const start of starts) {
    for (let attempt = 0; attempt < 3; attempt += 1) {
      const seen = reachableSet(grid, start);
      if (targets.some(({ c, r }) => seen.has(`${c},${r}`))) break;
      const target = targets[Math.floor(Math.random() * targets.length)];
      carveCorridor(grid, start, target);
    }
  }

  const baseSeen = reachableSet(grid, { c: 7, r: 12 });
  for (const start of starts) {
    if (!baseSeen.has(`${start.c},${start.r}`)) {
      carveCorridor(grid, start, { c: 7, r: 12 });
    }
  }
}

const STORAGE_KEY = 'tank-battle-custom-levels-v1';

export function loadSavedLevels() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return parsed.map((item) => normalizeLevel(item));
  } catch {
    return [];
  }
}

export function saveSavedLevels(levels) {
  const serializable = levels.map((level) => ({
    ...serializeLevel(level),
    id: level.id,
  }));
  localStorage.setItem(STORAGE_KEY, JSON.stringify(serializable));
}

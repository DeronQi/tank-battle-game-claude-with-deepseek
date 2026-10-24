export const GRID = 15;
export const TILE = 40;
export const ARENA = GRID * TILE;

export const TILE_TYPE = Object.freeze({
  EMPTY: 0,
  BRICK: 1,
  STEEL: 2,
  TREE: 3,
  WATER: 4,
  ICE: 5,
});

export const CHAR_TO_TILE = {
  '.': TILE_TYPE.EMPTY,
  B: TILE_TYPE.BRICK,
  S: TILE_TYPE.STEEL,
  T: TILE_TYPE.TREE,
  W: TILE_TYPE.WATER,
  I: TILE_TYPE.ICE,
};

export const TILE_TO_CHAR = {
  [TILE_TYPE.EMPTY]: '.',
  [TILE_TYPE.BRICK]: 'B',
  [TILE_TYPE.STEEL]: 'S',
  [TILE_TYPE.TREE]: 'T',
  [TILE_TYPE.WATER]: 'W',
  [TILE_TYPE.ICE]: 'I',
};

export const DIRS = Object.freeze({
  up: { x: 0, y: -1, angle: 0 },
  right: { x: 1, y: 0, angle: Math.PI / 2 },
  down: { x: 0, y: 1, angle: Math.PI },
  left: { x: -1, y: 0, angle: -Math.PI / 2 },
});

export const DIR_ORDER = ['up', 'right', 'down', 'left'];

export const BASE = Object.freeze({ col: 7, row: 13, w: 2, h: 2 });

export const BASE_CELLS = (() => {
  const cells = [];
  for (let r = BASE.row; r < BASE.row + BASE.h; r += 1) {
    for (let c = BASE.col; c < BASE.col + BASE.w; c += 1) {
      cells.push({ c, r });
    }
  }
  return cells;
})();

export const BASE_RING_CELLS = (() => {
  const cells = [];
  for (let r = BASE.row - 1; r <= BASE.row + BASE.h - 1; r += 1) {
    for (let c = BASE.col - 1; c <= BASE.col + BASE.w; c += 1) {
      if (c >= BASE.col && c < BASE.col + BASE.w && r >= BASE.row) continue;
      cells.push({ c, r });
    }
  }
  return cells;
})();

export const PLAYER_SPAWNS = [
  { c: 3, r: 13, x: 3 * TILE + TILE / 2, y: 13 * TILE + TILE / 2 },
  { c: 11, r: 13, x: 11 * TILE + TILE / 2, y: 13 * TILE + TILE / 2 },
];

export const ENEMY_SPAWNS = [
  { c: 0, r: 0, x: TILE / 2, y: TILE / 2 },
  { c: 7, r: 0, x: 7 * TILE + TILE / 2, y: TILE / 2 },
  { c: 14, r: 0, x: 14 * TILE + TILE / 2, y: TILE / 2 },
];

export const ENEMY_TYPES = {
  basic: {
    name: '普通',
    speed: 76,
    hp: 1,
    fireDelay: 1.8,
    bulletSpeed: 220,
    score: 100,
    color: '#c9ccd6',
    accent: '#7b8191',
  },
  fast: {
    name: '快速',
    speed: 122,
    hp: 1,
    fireDelay: 1.65,
    bulletSpeed: 248,
    score: 200,
    color: '#e8eef8',
    accent: '#6fa7c9',
  },
  power: {
    name: '火力',
    speed: 84,
    hp: 1,
    fireDelay: 1.0,
    bulletSpeed: 298,
    score: 300,
    color: '#8fd18b',
    accent: '#3d7b49',
  },
  armor: {
    name: '装甲',
    speed: 68,
    hp: 4,
    fireDelay: 1.45,
    bulletSpeed: 258,
    score: 400,
    color: '#d8b77a',
    accent: '#8d5a3a',
  },
};

export const POWERUP_TYPE = Object.freeze({
  STAR: 'star',
  HELMET: 'helmet',
  GRENADE: 'grenade',
  CLOCK: 'clock',
  SHOVEL: 'shovel',
  LIFE: 'life',
});

export const POWERUP_DEFS = {
  star: { label: '火力升级', color: '#ffd45e' },
  helmet: { label: '无敌护盾', color: '#8fe9ff' },
  grenade: { label: '全屏爆破', color: '#ff7d6e' },
  clock: { label: '时间冻结', color: '#c8a7ff' },
  shovel: { label: '钢铁基地', color: '#a5b4c8' },
  life: { label: '额外生命', color: '#ff9ac7' },
};

export const MATCH_CONFIG = {
  playerLives: 3,
  playerSpeed: 122,
  maxEnemiesOnScreen: 4,
  respawnDelay: 1.25,
  stageClearDelay: 2.8,
  autoNextDelay: 3.2,
  baseShovelTime: 18,
  freezeTime: 7,
  shieldTime: 8,
  powerupLife: 18,
  powerupChance: 0.24,
  bulletBaseSpeed: 360,
};

export const PLAYER_ACCENTS = [
  { body: '#e8c94a', track: '#7a6420', accent: '#fff0a8', name: 'P1' },
  { body: '#79b978', track: '#365d39', accent: '#c7f0bf', name: 'P2' },
];

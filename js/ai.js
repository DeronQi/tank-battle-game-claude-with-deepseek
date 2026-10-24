import {
  BASE_CELLS,
  DIRS,
  ENEMY_SPAWNS,
  GRID,
  TILE,
  TILE_TYPE,
} from './config.js';
import { directionBetween, segmentIntersectsRect } from './entities.js';

const CARDINALS = ['up', 'right', 'down', 'left'];
const BASE_CELL_KEYS = new Set(BASE_CELLS.map(({ c, r }) => `${c},${r}`));

function emptyControls() {
  return {
    up: false,
    right: false,
    down: false,
    left: false,
    fire: false,
    preferred: null,
    aim: null,
  };
}

function cellKey(c, r) {
  return `${c},${r}`;
}

function isCardinalPassable(game, c, r) {
  if (c < 0 || c >= GRID || r < 0 || r >= GRID) return false;
  const tile = game.tileAt(c, r);
  if (tile === TILE_TYPE.STEEL || tile === TILE_TYPE.WATER) return false;
  if (BASE_CELL_KEYS.has(cellKey(c, r))) return false;
  return true;
}

function cellCenter(c, r) {
  return { x: c * TILE + TILE / 2, y: r * TILE + TILE / 2 };
}

function nearestCellAround(c, r) {
  const candidates = [{ c, r }];
  for (const [dc, dr] of [[0, -1], [1, 0], [0, 1], [-1, 0]]) {
    candidates.push({ c: c + dc, r: r + dr });
  }
  return candidates;
}

export function findPath(game, start, goal) {
  const startPassable = isCardinalPassable(game, start.c, start.r);
  if (!startPassable) return null;

  const goals = [];
  if (isCardinalPassable(game, goal.c, goal.r)) goals.push(goal);
  else goals.push(...nearestCellAround(goal.c, goal.r).filter(({ c, r }) => isCardinalPassable(game, c, r)));
  const goalKeys = new Set(goals.map(({ c, r }) => cellKey(c, r)));
  if (!goalKeys.size) return null;

  const prev = new Map();
  const visited = new Set([cellKey(start.c, start.r)]);
  const queue = [{ c: start.c, r: start.r }];
  let found = null;

  while (queue.length) {
    const current = queue.shift();
    const key = cellKey(current.c, current.r);
    if (goalKeys.has(key)) {
      found = current;
      break;
    }
    for (const [dc, dr] of [[0, -1], [1, 0], [0, 1], [-1, 0]]) {
      const nc = current.c + dc;
      const nr = current.r + dr;
      const nk = cellKey(nc, nr);
      if (visited.has(nk) || !isCardinalPassable(game, nc, nr)) continue;
      visited.add(nk);
      prev.set(nk, key);
      queue.push({ c: nc, r: nr });
    }
  }

  if (!found) return null;
  const path = [];
  let key = cellKey(found.c, found.r);
  while (key) {
    const [c, r] = key.split(',').map(Number);
    path.push({ c, r });
    if (key === cellKey(start.c, start.r)) break;
    key = prev.get(key) ?? null;
  }
  path.reverse();
  return path;
}

function distance(a, b) {
  return Math.hypot(a.x - b.x, a.y - b.y);
}

function manhattanCells(a, b) {
  return Math.abs(a.c - b.c) + Math.abs(a.r - b.r);
}

function rayHitsOwnBase(game, tank, target) {
  if (!game.base.alive || tank.faction !== 'player') return false;
  return segmentIntersectsRect(tank.x, tank.y, target.x, target.y, game.base.box);
}

function lineClear(game, from, to) {
  const dx = to.x - from.x;
  const dy = to.y - from.y;
  const distanceToTarget = Math.hypot(dx, dy);
  const steps = Math.max(1, Math.ceil(distanceToTarget / 7));
  for (let i = 1; i < steps; i += 1) {
    const t = i / steps;
    const c = Math.floor((from.x + dx * t) / TILE);
    const r = Math.floor((from.y + dy * t) / TILE);
    if (c < 0 || c >= GRID || r < 0 || r >= GRID) return false;
    const tile = game.tileAt(c, r);
    if (tile === TILE_TYPE.BRICK || tile === TILE_TYPE.STEEL) return false;
  }
  return true;
}

function dirToPoint(from, to) {
  const dx = to.x - from.x;
  const dy = to.y - from.y;
  if (Math.abs(dx) >= Math.abs(dy)) return dx > 0 ? 'right' : 'left';
  return dy > 0 ? 'down' : 'up';
}

function canMoveDir(game, tank, dir, distance = 10) {
  const vector = DIRS[dir];
  return game.canTankMove(tank, tank.x + vector.x * distance, tank.y + vector.y * distance);
}

class BasePilot {
  constructor(game, tank) {
    this.game = game;
    this.tank = tank;
    this.controls = emptyControls();
    this.thinkTimer = Math.random() * 0.2;
    this.path = null;
    this.pathIndex = 0;
    this.target = null;
    this.targetType = null;
    this.stuckTimer = 0;
    this.stuckCheckTimer = 0;
    this.lastX = tank.x;
    this.lastY = tank.y;
    this.evadeDir = null;
    this.evadeTimer = 0;
    this.wanderTimer = 0;
    this.wanderDir = null;
    this.goalCell = null;
    this.fallbackDir = null;
    this.fallbackTimer = 0;
    this.brawlDir = null;
    this.brawlTimer = 0;
    this.targetLockTimer = 0;
    this.baseDefenseMode = false;
    this.lastAcceptedDir = null;
    this.reversalGuardTimer = 0;
  }

  resetPath() {
    this.path = null;
    this.pathIndex = 0;
    this.thinkTimer = 0;
  }

  update(dt) {
    this.thinkTimer -= dt;
    this.evadeTimer = Math.max(0, this.evadeTimer - dt);
    this.wanderTimer = Math.max(0, this.wanderTimer - dt);
    this.fallbackTimer = Math.max(0, this.fallbackTimer - dt);
    this.brawlTimer = Math.max(0, this.brawlTimer - dt);
    this.targetLockTimer = Math.max(0, this.targetLockTimer - dt);
    this.reversalGuardTimer = Math.max(0, this.reversalGuardTimer - dt);
    this.stuckCheckTimer -= dt;
    if (!this.tank.alive || this.tank.eliminated) {
      this.controls = emptyControls();
      return this.controls;
    }

    if (this.thinkTimer <= 0) {
      this.replan();
      this.thinkTimer = this.planInterval();
    }

    if (this.stuckCheckTimer <= 0) {
      const moved = Math.hypot(this.tank.x - this.lastX, this.tank.y - this.lastY);
      if (moved < 2.5 && this.isTryingToMove()) this.stuckTimer += 0.7;
      else this.stuckTimer = Math.max(0, this.stuckTimer - 0.4);
      this.lastX = this.tank.x;
      this.lastY = this.tank.y;
      this.stuckCheckTimer = 0.7;
      if (this.stuckTimer > 1.2) {
        this.stuckTimer = 0;
        this.resetPath();
        this.wanderTimer = 0.5;
        this.wanderDir = CARDINALS[Math.floor(Math.random() * 4)];
      }
    }

    if (this.wanderTimer > 0 && this.wanderDir) {
      this.controls = emptyControls();
      this.controls[this.wanderDir] = true;
      this.controls.preferred = this.wanderDir;
      this.controls.aim = this.wanderDir;
      return this.controls;
    }

    this.controls = this.stabilizeMovement(this.computeControls(dt));
    return this.controls;
  }

  stabilizeMovement(controls) {
    if (!controls || controls.fire || this.evadeTimer > 0) return controls;
    const dir = controls.up
      ? 'up'
      : controls.right
        ? 'right'
        : controls.down
          ? 'down'
          : controls.left
            ? 'left'
            : null;
    if (!dir) return controls;

    const opposite =
      (dir === 'up' && this.lastAcceptedDir === 'down') ||
      (dir === 'down' && this.lastAcceptedDir === 'up') ||
      (dir === 'left' && this.lastAcceptedDir === 'right') ||
      (dir === 'right' && this.lastAcceptedDir === 'left');

    if (
      opposite &&
      this.tank.moving &&
      this.reversalGuardTimer > 0 &&
      this.lastAcceptedDir &&
      canMoveDir(this.game, this.tank, this.lastAcceptedDir, 8)
    ) {
      const held = this.lastAcceptedDir;
      controls.up = held === 'up';
      controls.right = held === 'right';
      controls.down = held === 'down';
      controls.left = held === 'left';
      controls.preferred = held;
      controls.aim = held;
      return controls;
    }

    if (dir !== this.lastAcceptedDir) {
      this.reversalGuardTimer = 0.25;
    }
    this.lastAcceptedDir = dir;
    return controls;
  }

  planInterval() {
    return 0.28 + Math.random() * 0.18;
  }

  isTryingToMove() {
    return this.controls.up || this.controls.down || this.controls.left || this.controls.right;
  }

  replan() {
    const priorityGoal = this.getPriorityGoal();
    let goal;
    if (priorityGoal) {
      goal = priorityGoal;
      this.baseDefenseMode = true;
      this.targetLockTimer = 0;
    } else {
      this.baseDefenseMode = false;
      const canKeepTarget =
        this.target &&
        this.targetLockTimer > 0 &&
        ((this.targetType === 'enemy' && this.target.alive && this.target.spawnTimer <= 0) ||
          (this.targetType === 'player' &&
            this.target.alive &&
            !this.target.eliminated) ||
          (this.targetType === 'powerup' && this.target.alive) ||
          (this.targetType === 'base' && this.game.base.alive));

      if (canKeepTarget) {
        let c;
        let r;
        if (this.targetType === 'base') {
          c = 7;
          r = 12;
        } else if (this.targetType === 'powerup') {
          c = Math.floor(this.target.x / TILE);
          r = Math.floor(this.target.y / TILE);
        } else {
          c = this.target.cell.c;
          r = this.target.cell.r;
        }
        goal = { c, r, target: this.target, type: this.targetType };
      } else {
        goal = this.pickGoal();
        if (goal && goal.type !== 'guard') {
          this.targetLockTimer = 0.7 + Math.random() * 0.3;
        } else {
          this.targetLockTimer = 0;
        }
      }
    }

    if (!goal) {
      this.path = null;
      this.target = null;
      this.targetType = null;
      this.goalCell = null;
      return;
    }
    this.goalCell = { c: goal.c, r: goal.r };
    const start = { c: Math.floor(this.tank.x / TILE), r: Math.floor(this.tank.y / TILE) };
    this.path = findPath(this.game, start, { c: goal.c, r: goal.r });
    this.pathIndex = 0;
    this.target = goal.target;
    this.targetType = goal.type;
  }

  getPriorityGoal() {
    return null;
  }

  pickGoal() {
    const enemies = this.game.enemies.filter((enemy) => enemy.alive && enemy.spawnTimer <= 0);
    const base = this.game.base;

    if (this.targetType === 'powerup' && !this.game.powerups.some((p) => p.alive)) {
      this.targetType = null;
    }

    if (enemies.length) {
      const baseThreat = enemies
        .filter((enemy) => {
          const ec = enemy.cell;
          return Math.abs(ec.c - 7) + Math.abs(ec.r - 12) <= 7;
        })
        .sort((a, b) => distance(a, base.center) - distance(b, base.center))[0];
      if (baseThreat) return { c: baseThreat.cell.c, r: baseThreat.cell.r, target: baseThreat, type: 'enemy' };

      const nearbyEnemy = enemies
        .map((enemy) => ({ enemy, dist: manhattanCells(this.tank.cell, enemy.cell) }))
        .sort((a, b) => a.dist - b.dist)[0];
      if (nearbyEnemy && nearbyEnemy.dist <= 2) {
        return {
          c: nearbyEnemy.enemy.cell.c,
          r: nearbyEnemy.enemy.cell.r,
          target: nearbyEnemy.enemy,
          type: 'enemy',
        };
      }
    }

    const powerup = this.pickPowerup();
    const nearPowerup =
      powerup &&
      (!enemies.length || powerup.dist <= 4 || (this.tank.powerLevel < 2 && powerup.dist <= 6));
    if (nearPowerup) {
      return {
        c: Math.floor(powerup.powerup.x / TILE),
        r: Math.floor(powerup.powerup.y / TILE),
        target: powerup.powerup,
        type: 'powerup',
      };
    }

    if (enemies.length) {
      const threat = enemies
        .map((enemy) => {
          const toBase = manhattanCells(enemy.cell, { c: 7, r: 12 });
          const toTank = manhattanCells(this.tank.cell, enemy.cell);
          return { enemy, score: toBase + toTank * 0.35 };
        })
        .sort((a, b) => a.score - b.score)[0];
      return { c: threat.enemy.cell.c, r: threat.enemy.cell.r, target: threat.enemy, type: 'enemy' };
    }

    if (powerup) {
      return {
        c: Math.floor(powerup.powerup.x / TILE),
        r: Math.floor(powerup.powerup.y / TILE),
        target: powerup.powerup,
        type: 'powerup',
      };
    }

    return this.guardGoal();
  }

  guardGoal() {
    const candidates = [
      { c: 5, r: 10 },
      { c: 9, r: 10 },
      { c: 7, r: 9 },
      { c: 3, r: 11 },
      { c: 11, r: 11 },
    ];
    const openCells = candidates.filter(({ c, r }) => {
      const tile = this.game.tileAt(c, r);
      return (
        tile !== TILE_TYPE.BRICK &&
        tile !== TILE_TYPE.STEEL &&
        tile !== TILE_TYPE.WATER
      );
    });
    const pool = openCells.length ? openCells : candidates;
    const pick = pool
      .map((cell) => ({ cell, dist: manhattanCells(this.tank.cell, cell) }))
      .sort((a, b) => a.dist - b.dist)[0].cell;
    return { c: pick.c, r: pick.r, target: null, type: 'guard' };
  }

  pickPowerup() {
    const options = this.game.powerups.filter((p) => p.alive);
    if (!options.length) return null;
    const chosen = options
      .map((powerup) => ({
        powerup,
        dist:
          Math.abs(powerup.x - this.tank.x) / TILE +
          Math.abs(powerup.y - this.tank.y) / TILE,
        value: powerup.type === 'life' || powerup.type === 'grenade' ? -2 : 0,
      }))
      .sort((a, b) => a.dist + a.value - (b.dist + b.value))[0];
    return chosen;
  }

  findAlignedShot() {
    const targetable = this.game.enemies.filter((enemy) => enemy.alive && enemy.spawnTimer <= 0);
    let best = null;
    for (const enemy of targetable) {
      const dir = directionBetween(this.tank, enemy, 17);
      if (!dir) continue;
      if (rayHitsOwnBase(this.game, this.tank, enemy)) continue;
      if (!lineClear(this.game, this.tank, enemy)) continue;
      const dist = distance(this.tank, enemy);
      if (!best || dist < best.dist) best = { dir, enemy, dist };
    }
    if (best) return { dir: best.dir, target: best.enemy };
    return null;
  }

  findWallShot() {
    if (!this.path || this.pathIndex >= this.path.length) return null;
    let index = this.pathIndex;
    let next = this.path[index];
    if (!next) return null;
    const tankCell = this.tank.cell;
    while (next && next.c === tankCell.c && next.r === tankCell.r) {
      index += 1;
      next = this.path[index];
    }
    if (!next) return null;
    const tile = this.game.tileAt(next.c, next.r);
    if (tile !== TILE_TYPE.BRICK) return null;
    const center = cellCenter(next.c, next.r);
    const dir = dirToPoint(this.tank, center);
    const aligned =
      (dir === 'left' || dir === 'right')
        ? Math.abs(this.tank.y - center.y) < 22
        : Math.abs(this.tank.x - center.x) < 22;
    if (!aligned) return null;
    if (rayHitsOwnBase(this.game, this.tank, center)) return null;
    return { dir };
  }

  checkBulletEvasion() {
    for (const bullet of this.game.bullets) {
      if (!bullet.alive || bullet.faction !== 'enemy') continue;
      const dx = this.tank.x - bullet.x;
      const dy = this.tank.y - bullet.y;
      const distanceToTank = Math.hypot(dx, dy);
      if (distanceToTank > 155) continue;
      const dot = dx * bullet.dx + dy * bullet.dy;
      if (dot <= 0) continue;
      const perpendicular = Math.abs(dx * bullet.dy - dy * bullet.dx);
      if (perpendicular > 29) continue;
      const timeToImpact = dot / bullet.speed;
      if (timeToImpact > 0.65) continue;

      const options =
        bullet.dx !== 0 ? ['up', 'down'] : ['left', 'right'];
      options.sort(() => Math.random() - 0.5);
      for (const dir of options) {
        if (canMoveDir(this.game, this.tank, dir, 14)) {
          return dir;
        }
      }
    }
    return null;
  }

  computeControls(dt) {
    const sacrifice = this.getBaseSacrificeControls?.();
    if (sacrifice) return sacrifice;

    const holdForBase = this.isBaseInDanger();

    if (!holdForBase && this.evadeTimer > 0 && this.evadeDir) {
      const controls = emptyControls();
      controls[this.evadeDir] = true;
      controls.preferred = this.evadeDir;
      controls.aim = this.evadeDir;
      return controls;
    }

    if (!holdForBase) {
      const evade = this.checkBulletEvasion();
      if (evade) {
        this.evadeDir = evade;
        this.evadeTimer = 0.22;
        const controls = emptyControls();
        controls[evade] = true;
        controls.preferred = evade;
        controls.aim = evade;
        return controls;
      }
    }

    const shot = this.findAlignedShot();
    if (shot) {
      if (this.canTakeShot(shot.dir)) {
        return this.shotControls(shot.dir);
      }
      if (!this.tank.moving || shot.dir === this.tank.dir) {
        const waiting = emptyControls();
        waiting.aim = shot.dir;
        waiting.fire = true;
        return waiting;
      }
    }

    const wallShot = this.findWallShot();
    if (wallShot) {
      if (this.canTakeShot(wallShot.dir)) {
        return this.shotControls(wallShot.dir);
      }
      if (!this.tank.moving || wallShot.dir === this.tank.dir) {
        const waiting = emptyControls();
        waiting.aim = wallShot.dir;
        waiting.fire = true;
        return waiting;
      }
    }

    if (this.path && this.path.length > 1) {
      const controls = this.followPath();
      if (this.hasMovement(controls)) return controls;
      if (this.path) {
        const closeQuarters = this.closeQuartersControls();
        if (closeQuarters) return closeQuarters;
        this.controls = emptyControls();
        return this.controls;
      }
    }

    const closeQuarters = this.closeQuartersControls();
    if (closeQuarters) return closeQuarters;

    const fallback = this.fallbackControls();
    if (fallback) return fallback;

    this.controls = emptyControls();
    return this.controls;
  }

  hasMovement(controls) {
    return Boolean(
      controls && (controls.up || controls.right || controls.down || controls.left),
    );
  }

  isBaseInDanger() {
    return false;
  }

  canTakeShot(dir) {
    if (this.tank.fireTimer > 0.001) return false;
    if (!this.tank.moving) return true;
    return dir === this.tank.dir;
  }

  shotControls(dir) {
    const controls = emptyControls();
    controls.fire = true;
    controls.aim = dir;
    if (dir === this.tank.dir && canMoveDir(this.game, this.tank, dir, 8)) {
      controls[dir] = true;
      controls.preferred = dir;
    }
    return controls;
  }

  movementControls(dir) {
    const controls = emptyControls();
    controls[dir] = true;
    controls.preferred = dir;
    controls.aim = dir;
    return controls;
  }

  fallbackControls() {
    const point =
      this.target ??
      (this.goalCell ? cellCenter(this.goalCell.c, this.goalCell.r) : null);
    if (!point) return null;

    if (this.fallbackTimer > 0 && this.fallbackDir) {
      const horizontal = this.fallbackDir === 'left' || this.fallbackDir === 'right';
      const remaining = horizontal
        ? (point.x - this.tank.x) * (this.fallbackDir === 'right' ? 1 : -1)
        : (point.y - this.tank.y) * (this.fallbackDir === 'down' ? 1 : -1);
      if (remaining > 8 && canMoveDir(this.game, this.tank, this.fallbackDir, 8)) {
        return this.movementControls(this.fallbackDir);
      }
      this.fallbackTimer = 0;
    }

    const dx = point.x - this.tank.x;
    const dy = point.y - this.tank.y;
    if (Math.hypot(dx, dy) < 14) return null;

    const horizontal = dx >= 0 ? 'right' : 'left';
    const vertical = dy >= 0 ? 'down' : 'up';
    const candidates = [];
    if (Math.abs(dx) >= Math.abs(dy)) {
      if (Math.abs(dx) > 8) candidates.push(horizontal);
      if (Math.abs(dy) > 8) candidates.push(vertical);
    } else {
      if (Math.abs(dy) > 8) candidates.push(vertical);
      if (Math.abs(dx) > 8) candidates.push(horizontal);
    }

    const dir = candidates.find((candidate) =>
      canMoveDir(this.game, this.tank, candidate, 8),
    );
    if (!dir) return null;

    this.fallbackDir = dir;
    this.fallbackTimer = 0.38;
    return this.movementControls(dir);
  }

  closeQuartersControls() {
    const target = this.target;
    if (!target) return null;
    const dx = target.x - this.tank.x;
    const dy = target.y - this.tank.y;
    if (Math.hypot(dx, dy) > 150) return null;
    if (this.targetType !== 'powerup' && !lineClear(this.game, this.tank, target)) {
      return null;
    }

    if (this.brawlTimer > 0 && this.brawlDir) {
      const horizontal = this.brawlDir === 'left' || this.brawlDir === 'right';
      const remaining = horizontal
        ? (target.x - this.tank.x) * (this.brawlDir === 'right' ? 1 : -1)
        : (target.y - this.tank.y) * (this.brawlDir === 'down' ? 1 : -1);
      if (remaining > 8 && canMoveDir(this.game, this.tank, this.brawlDir, 8)) {
        return this.movementControls(this.brawlDir);
      }
      this.brawlTimer = 0;
    }

    const absX = Math.abs(dx);
    const absY = Math.abs(dy);
    const directions = [];
    const pushDirection = (value, positive, negative) => {
      if (value > 8) directions.push(positive);
      else if (value < -8) directions.push(negative);
    };
    if (absX < absY - 2) {
      pushDirection(dx, 'right', 'left');
      pushDirection(dy, 'down', 'up');
    } else {
      pushDirection(dy, 'down', 'up');
      pushDirection(dx, 'right', 'left');
    }

    for (const dir of directions) {
      if (canMoveDir(this.game, this.tank, dir, 8)) {
        this.brawlDir = dir;
        this.brawlTimer = 0.2;
        return this.movementControls(dir);
      }
    }

    const safeFireDir = directions.find((dir) => {
      const vector = DIRS[dir];
      return !rayHitsOwnBase(this.game, this.tank, {
        x: this.tank.x + vector.x * 200,
        y: this.tank.y + vector.y * 200,
      });
    });
    if (safeFireDir) {
      const controls = emptyControls();
      controls.fire = true;
      controls.aim = safeFireDir;
      return controls;
    }
    return null;
  }

  followPath() {
    const current = this.tank.cell;
    let currentIndex = -1;
    for (let i = 0; i < this.path.length; i += 1) {
      const cell = this.path[i];
      if (cell.c === current.c && cell.r === current.r) {
        currentIndex = i;
        break;
      }
    }
    if (currentIndex === -1) {
      this.path = null;
      return emptyControls();
    }
    if (currentIndex > this.pathIndex) this.pathIndex = currentIndex;

    if (this.pathIndex === currentIndex) {
      if (this.path.length <= this.pathIndex + 1) {
        this.path = null;
        return null;
      }
      const nextCell = this.path[this.pathIndex + 1];
      const dc = nextCell.c - current.c;
      const dr = nextCell.r - current.r;
      const nextDir = dc > 0 ? 'right' : dc < 0 ? 'left' : dr > 0 ? 'down' : 'up';
      if (nextDir === this.tank.dir) this.pathIndex += 1;
    }

    let cell = this.path[this.pathIndex];
    let center = cellCenter(cell.c, cell.r);
    let offX = center.x - this.tank.x;
    let offY = center.y - this.tank.y;

    if (Math.hypot(offX, offY) <= 5) {
      this.pathIndex += 1;
      if (this.pathIndex >= this.path.length) {
        this.path = null;
        return null;
      }
      cell = this.path[this.pathIndex];
      if (cell.c === current.c && cell.r === current.r) {
        const alignDir =
          Math.abs(offX) > Math.abs(offY)
            ? offX > 0
              ? 'right'
              : 'left'
            : offY > 0
              ? 'down'
              : 'up';
        if (canMoveDir(this.game, this.tank, alignDir, 8)) {
          return this.movementControls(alignDir);
        }
        return emptyControls();
      }
    } else {
      let alignDir =
        Math.abs(offX) > Math.abs(offY)
          ? offX > 0
            ? 'right'
            : 'left'
          : offY > 0
            ? 'down'
            : 'up';
      if (!canMoveDir(this.game, this.tank, alignDir, 8)) {
        const secondaryOffset =
          alignDir === 'left' || alignDir === 'right' ? offY : offX;
        if (Math.abs(secondaryOffset) <= 8) return emptyControls();
        alignDir =
          alignDir === 'left' || alignDir === 'right'
            ? offY > 0
              ? 'down'
              : 'up'
            : offX > 0
              ? 'right'
              : 'left';
      }
      if (canMoveDir(this.game, this.tank, alignDir, 8)) {
        return this.movementControls(alignDir);
      }
      return emptyControls();
    }

    const dc = cell.c - current.c;
    const dr = cell.r - current.r;
    const dir = dc > 0 ? 'right' : dc < 0 ? 'left' : dr > 0 ? 'down' : 'up';
    if (!canMoveDir(this.game, this.tank, dir, 8)) {
      return emptyControls();
    }
    return this.movementControls(dir);
  }
}

export class PlayerAI extends BasePilot {
  planInterval() {
    return 0.26 + Math.random() * 0.14;
  }

  getPriorityGoal() {
    if (!this.game.base.alive) return null;
    const threat = this.pickBaseThreat();
    if (!threat) return null;
    return {
      c: threat.cell.c,
      r: threat.cell.r,
      target: threat,
      type: 'enemy',
    };
  }

  pickBaseThreat() {
    const base = this.game.base;
    if (!base.alive) return null;
    const enemies = this.game.enemies.filter(
      (enemy) => enemy.alive && enemy.spawnTimer <= 0,
    );
    if (!enemies.length) return null;

    const bullet = this.findExposedBaseBullet();
    if (bullet?.owner?.alive) return bullet.owner;

    let best = null;
    for (const enemy of enemies) {
      const cell = enemy.cell;
      const distanceToBase = manhattanCells(cell, { c: 7, r: 12 });
      const targetingBase =
        enemy.aiPilot?.targetType === 'base' || enemy.aiPilot?.aggression === 'base';
      const lineDanger =
        Boolean(directionBetween(enemy, base.center, 38)) &&
        lineClear(this.game, enemy, base.center);
      if (!(distanceToBase <= 7 || (targetingBase && distanceToBase <= 10) || lineDanger)) {
        continue;
      }
      const score =
        (14 - distanceToBase) * 2 +
        (targetingBase ? 10 : 0) +
        (lineDanger ? 16 : 0);
      if (!best || score > best.score) best = { enemy, score };
    }
    return best?.enemy ?? null;
  }

  findExposedBaseBullet() {
    const base = this.game.base;
    if (!base.alive) return null;
    const center = base.center;
    let best = null;
    for (const bullet of this.game.bullets) {
      if (!bullet.alive || bullet.faction !== 'enemy') continue;
      const vx = center.x - bullet.x;
      const vy = center.y - bullet.y;
      const forward = vx * bullet.dx + vy * bullet.dy;
      if (forward <= 0) continue;
      const perpendicular = Math.abs(vx * bullet.dy - vy * bullet.dx);
      if (perpendicular > 44) continue;
      const timeToBase = forward / bullet.speed;
      if (timeToBase > 1.4) continue;
      if (!lineClear(this.game, bullet, center)) continue;
      if (!best || timeToBase < best.time) best = { bullet, time: timeToBase };
    }
    return best?.bullet ?? null;
  }

  getBaseSacrificeControls() {
    const bullet = this.findExposedBaseBullet();
    if (!bullet) return null;
    const base = this.game.base;
    const center = base.center;
    const blockX = center.x - bullet.dx * 65;
    const blockY = center.y - bullet.dy * 65;
    if (
      blockX <= 0 ||
      blockX >= GRID * TILE ||
      blockY <= 0 ||
      blockY >= GRID * TILE
    ) {
      return null;
    }

    const ahead = (blockX - bullet.x) * bullet.dx + (blockY - bullet.y) * bullet.dy;
    if (ahead <= 0) return null;
    const bulletTime = ahead / bullet.speed;
    const dx = blockX - this.tank.x;
    const dy = blockY - this.tank.y;
    const travelDistance = Math.hypot(dx, dy);
    if (travelDistance > 95) return null;
    if (travelDistance / this.tank.speedNow > bulletTime - 0.04) return null;

    const aimDir = directionBetween(this.tank, bullet, 26);
    if (Math.abs(dx) <= 10 && Math.abs(dy) <= 10) {
      const controls = emptyControls();
      if (aimDir) {
        controls.aim = aimDir;
        controls.fire = true;
      }
      return controls;
    }

    const horizontal = dx >= 0 ? 'right' : 'left';
    const vertical = dy >= 0 ? 'down' : 'up';
    const candidates =
      Math.abs(dx) >= Math.abs(dy)
        ? [horizontal, vertical]
        : [vertical, horizontal];
    for (const dir of candidates) {
      if (canMoveDir(this.game, this.tank, dir, 8)) {
        return this.movementControls(dir);
      }
    }
    return null;
  }

  isBaseInDanger() {
    const base = this.game.base;
    if (!base.alive) return false;
    if (this.findExposedBaseBullet()) return true;

    for (const enemy of this.game.enemies) {
      if (!enemy.alive || enemy.spawnTimer > 0) continue;
      const cell = enemy.cell;
      const distanceToBase = manhattanCells(cell, { c: 7, r: 12 });
      if (distanceToBase <= 5) return true;
      const targetingBase =
        enemy.aiPilot?.targetType === 'base' || enemy.aiPilot?.aggression === 'base';
      if (
        distanceToBase <= 8 &&
        targetingBase &&
        Boolean(directionBetween(enemy, base.center, 38)) &&
        lineClear(this.game, enemy, base.center)
      ) {
        return true;
      }
    }
    return false;
  }
}

export class EnemyAI extends BasePilot {
  constructor(game, tank) {
    super(game, tank);
    this.aggression = Math.random() < 0.12 ? 'base' : 'players';
    this.wanderBias = Math.random();
  }

  planInterval() {
    return 0.45 + Math.random() * 0.35;
  }

  pickGoal() {
    const players = this.game.players.filter((p) => p.alive && !p.eliminated);
    const base = this.game.base;
    if (!base.alive && !players.length) return null;

    const goBase =
      base.alive &&
      (!players.length ||
        this.aggression === 'base' ||
        (distance(this.tank, base.center) < 110 && Math.random() < 0.12));

    if (goBase) {
      const baseCell = { c: 7, r: 12 };
      return { c: baseCell.c, r: baseCell.r, target: base, type: 'base' };
    }

    if (players.length) {
      const closest = players
        .map((player) => ({
          player,
          dist: manhattanCells(this.tank.cell, player.cell),
        }))
        .sort((a, b) => a.dist - b.dist)[0];
      return {
        c: closest.player.cell.c,
        r: closest.player.cell.r,
        target: closest.player,
        type: 'player',
      };
    }

    const spawn = ENEMY_SPAWNS[Math.floor(Math.random() * ENEMY_SPAWNS.length)];
    return { c: spawn.c, r: spawn.r, target: null, type: 'roam' };
  }

  findAlignedShot() {
    const players = this.game.players.filter((p) => p.alive && !p.eliminated && !p.invulnerable);
    let best = null;
    for (const player of players) {
      const dir = directionBetween(this.tank, player, 15);
      if (!dir) continue;
      if (!lineClear(this.game, this.tank, player)) continue;
      const dist = distance(this.tank, player);
      if (!best || dist < best.dist) best = { dir, dist };
    }

    if (this.game.base.alive) {
      const baseDir = directionBetween(this.tank, this.game.base.center, 26);
      const baseDist = distance(this.tank, this.game.base.center);
      if (
        baseDir &&
        baseDist < 250 &&
        lineClear(this.game, this.tank, this.game.base.center)
      ) {
        if (!best || baseDist < best.dist) best = { dir: baseDir, dist: baseDist };
      }
    }

    return best ? { dir: best.dir } : null;
  }

  checkBulletEvasion() {
    return null;
  }
}

export function createPilot(game, tank, isEnemy = false) {
  return isEnemy ? new EnemyAI(game, tank) : new PlayerAI(game, tank);
}

import {
  DIRS,
  MATCH_CONFIG,
  PLAYER_ACCENTS,
  TILE,
  TILE_TYPE,
} from './config.js';

export const TANK_SIZE = 34;
export const BULLET_RADIUS = 4;

export function rectsOverlap(a, b) {
  return a.x < b.x + b.w && a.x + a.w > b.x && a.y < b.y + b.h && a.y + a.h > b.y;
}

export function pointInRect(x, y, rect) {
  return x >= rect.x && x <= rect.x + rect.w && y >= rect.y && y <= rect.y + rect.h;
}

export function segmentIntersectsRect(x1, y1, x2, y2, rect) {
  const minX = Math.min(x1, x2);
  const maxX = Math.max(x1, x2);
  const minY = Math.min(y1, y2);
  const maxY = Math.max(y1, y2);
  if (maxX < rect.x || minX > rect.x + rect.w || maxY < rect.y || minY > rect.y + rect.h) {
    return false;
  }
  if (x1 === x2) return x1 >= rect.x && x1 <= rect.x + rect.w;
  if (y1 === y2) return y1 >= rect.y && y1 <= rect.y + rect.h;

  const dx = x2 - x1;
  const dy = y2 - y1;
  for (let i = 0; i <= 40; i += 1) {
    const t = i / 40;
    if (pointInRect(x1 + dx * t, y1 + dy * t, rect)) return true;
  }
  return false;
}

export class Tank {
  constructor(game, options) {
    this.game = game;
    this.x = options.x;
    this.y = options.y;
    this.dir = options.dir ?? (options.faction === 'player' ? 'up' : 'down');
    this.faction = options.faction;
    this.playerIndex = options.playerIndex ?? null;
    this.enemyKind = options.enemyKind ?? null;
    this.size = TANK_SIZE;
    this.alive = true;
    this.spawnTimer = options.spawnTimer ?? 0;
    this.shieldTimer = options.shieldTimer ?? 0;
    this.fireTimer = options.fireDelay ?? 0.2;
    this.powerLevel = options.powerLevel ?? 0;
    this.lives = options.lives ?? MATCH_CONFIG.playerLives;
    this.isAI = Boolean(options.isAI);
    this.aiPilot = null;
    this.eliminated = false;
    this.respawnTimer = 0;
    this.lastMoveDir = this.dir;
    this.iceCheckTimer = 0;
    this.onIce = false;
    this.stuckTimer = 0;
    this.anim = 0;
    this.moving = false;

    if (this.faction === 'player') {
      this.speed = MATCH_CONFIG.playerSpeed;
      this.hp = 1;
      this.maxHp = 1;
      this.fireDelay = 0.3;
      this.maxBullets = 1;
      this.accent = PLAYER_ACCENTS[this.playerIndex] ?? PLAYER_ACCENTS[0];
    } else {
      const cfg = options.enemyConfig;
      this.speed = cfg.speed;
      this.hp = cfg.hp;
      this.maxHp = cfg.hp;
      this.fireDelay = cfg.fireDelay;
      this.maxBullets = 1;
      this.bulletSpeed = cfg.bulletSpeed;
      this.scoreValue = cfg.score;
      this.enemyConfig = cfg;
    }
  }

  get box() {
    return {
      x: this.x - this.size / 2,
      y: this.y - this.size / 2,
      w: this.size,
      h: this.size,
    };
  }

  get collisionBox() {
    const inset = 3;
    return {
      x: this.x - this.size / 2 + inset,
      y: this.y - this.size / 2 + inset,
      w: this.size - inset * 2,
      h: this.size - inset * 2,
    };
  }

  get cell() {
    return { c: Math.floor(this.x / TILE), r: Math.floor(this.y / TILE) };
  }

  get invulnerable() {
    return this.shieldTimer > 0 || this.spawnTimer > 0;
  }

  get frozen() {
    return this.faction === 'enemy' && this.game.enemyFreezeTimer > 0;
  }

  get speedNow() {
    let speed = this.speed;
    if (this.powerLevel >= 1) speed += 4;
    if (this.onIce) speed *= 1.18;
    return speed;
  }

  resetForRespawn(x, y) {
    this.x = x;
    this.y = y;
    this.dir = 'up';
    this.hp = this.maxHp;
    this.alive = true;
    this.eliminated = false;
    this.spawnTimer = 0.9;
    this.shieldTimer = MATCH_CONFIG.shieldTime;
    this.fireTimer = 0.4;
    this.powerLevel = 0;
    this.updatePowerStats();
    this.onIce = false;
  }

  updatePowerStats() {
    if (this.powerLevel <= 0) {
      this.fireDelay = 0.3;
      this.maxBullets = 1;
      this.bulletSpeed = MATCH_CONFIG.bulletBaseSpeed;
    } else if (this.powerLevel === 1) {
      this.fireDelay = 0.26;
      this.maxBullets = 2;
      this.bulletSpeed = MATCH_CONFIG.bulletBaseSpeed + 30;
    } else if (this.powerLevel === 2) {
      this.fireDelay = 0.23;
      this.maxBullets = 2;
      this.bulletSpeed = MATCH_CONFIG.bulletBaseSpeed + 60;
    } else {
      this.fireDelay = 0.2;
      this.maxBullets = 3;
      this.bulletSpeed = MATCH_CONFIG.bulletBaseSpeed + 90;
    }
  }

  upgrade() {
    this.powerLevel = Math.min(3, this.powerLevel + 1);
    this.updatePowerStats();
  }

  update(dt, controls = {}) {
    if (!this.alive) return;
    this.anim += dt;
    this.spawnTimer = Math.max(0, this.spawnTimer - dt);
    this.shieldTimer = Math.max(0, this.shieldTimer - dt);
    this.fireTimer = Math.max(0, this.fireTimer - dt);
    if (this.spawnTimer > 0) return;
    if (this.frozen) {
      this.moving = false;
      return;
    }

    let moveDir = null;
    if (controls.preferred && controls[controls.preferred]) {
      moveDir = controls.preferred;
    } else {
      for (const dir of ['up', 'right', 'down', 'left']) {
        if (controls[dir]) {
          moveDir = dir;
          break;
        }
      }
    }

    if (controls.aim && DIRS[controls.aim]) this.dir = controls.aim;
    if (moveDir) {
      if (this.dir !== moveDir) {
        this.dir = moveDir;
        this.snapToLane(moveDir);
      }
      this.lastMoveDir = moveDir;
      this.move(moveDir, dt);
      this.moving = true;
    } else {
      this.moving = false;
    }

    this.iceCheckTimer -= dt;
    if (this.iceCheckTimer <= 0) {
      this.iceCheckTimer = 0.12;
      const cell = this.cell;
      this.onIce = this.game.tileAt(cell.c, cell.r) === TILE_TYPE.ICE;
    }

    if (controls.fire) this.tryFire();
  }

  snapToLane(dir) {
    const { x: dx, y: dy } = DIRS[dir];
    if (dx !== 0) {
      const target = Math.round((this.y - TILE / 2) / TILE) * TILE + TILE / 2;
      if (Math.abs(target - this.y) <= 10 && this.game.canTankMove(this, this.x, target)) {
        this.y = target;
      }
    } else if (dy !== 0) {
      const target = Math.round((this.x - TILE / 2) / TILE) * TILE + TILE / 2;
      if (Math.abs(target - this.x) <= 10 && this.game.canTankMove(this, target, this.y)) {
        this.x = target;
      }
    }
  }

  move(dir, dt) {
    const vector = DIRS[dir];
    const distance = this.speedNow * dt;
    const steps = Math.max(1, Math.ceil(distance / 5));
    const stepDistance = distance / steps;
    for (let i = 0; i < steps; i += 1) {
      const nx = this.x + vector.x * stepDistance;
      const ny = this.y + vector.y * stepDistance;
      if (this.game.canTankMove(this, nx, ny)) {
        this.x = nx;
        this.y = ny;
      } else {
        break;
      }
    }
  }

  tryFire() {
    if (this.fireTimer > 0 || this.spawnTimer > 0 || !this.alive || this.frozen) return false;
    const active = this.game.bullets.filter(
      (bullet) => bullet.alive && bullet.owner === this && bullet.faction === this.faction,
    );
    if (active.length >= this.maxBullets) return false;

    const vector = DIRS[this.dir];
    const offset = this.size / 2 + 7;
    this.game.spawnBullet(this, {
      x: this.x + vector.x * offset,
      y: this.y + vector.y * offset,
      dir: this.dir,
      speed: this.faction === 'player' ? this.bulletSpeed : this.enemyConfig.bulletSpeed,
      power: this.powerLevel >= 2 ? 2 : 1,
      faction: this.faction,
      owner: this,
    });
    this.fireTimer = this.fireDelay;
    if (this.faction === 'player') this.game.audio.shoot(true);
    else this.game.audio.shoot(false);
    return true;
  }

  damage(amount = 1) {
    if (!this.alive || this.invulnerable) return false;
    this.hp -= amount;
    if (this.hp <= 0) {
      this.alive = false;
      return true;
    }
    return false;
  }
}

export class Bullet {
  constructor(options) {
    this.x = options.x;
    this.y = options.y;
    this.dir = options.dir;
    this.speed = options.speed;
    this.power = options.power;
    this.faction = options.faction;
    this.owner = options.owner;
    this.alive = true;
    this.age = 0;
    this.maxAge = 3.2;
    this.dx = DIRS[options.dir].x;
    this.dy = DIRS[options.dir].y;
  }

  get box() {
    return {
      x: this.x - BULLET_RADIUS,
      y: this.y - BULLET_RADIUS,
      w: BULLET_RADIUS * 2,
      h: BULLET_RADIUS * 2,
    };
  }

  update(dt) {
    if (!this.alive) return;
    this.age += dt;
    if (this.age > this.maxAge) {
      this.alive = false;
      return;
    }
    this.x += this.dx * this.speed * dt;
    this.y += this.dy * this.speed * dt;
  }
}

export class PowerUp {
  constructor(type, x, y) {
    this.type = type;
    this.x = x;
    this.y = y;
    this.life = MATCH_CONFIG.powerupLife;
    this.age = 0;
    this.alive = true;
    this.size = 30;
  }

  get box() {
    return {
      x: this.x - this.size / 2,
      y: this.y - this.size / 2,
      w: this.size,
      h: this.size,
    };
  }

  update(dt) {
    this.age += dt;
    this.life -= dt;
    if (this.life <= 0) this.alive = false;
  }
}

export class Base {
  constructor() {
    this.col = 7;
    this.row = 13;
    this.alive = true;
    this.shieldTimer = 0;
  }

  get x() {
    return this.col * TILE;
  }

  get y() {
    return this.row * TILE;
  }

  get w() {
    return TILE * 2;
  }

  get h() {
    return TILE * 2;
  }

  get center() {
    return { x: this.x + this.w / 2, y: this.y + this.h / 2 };
  }

  get box() {
    return { x: this.x, y: this.y, w: this.w, h: this.h };
  }
}

export function directionBetween(from, to, tolerance = 18) {
  const dx = to.x - from.x;
  const dy = to.y - from.y;
  if (Math.abs(dy) <= tolerance && Math.abs(dx) > 2) return dx > 0 ? 'right' : 'left';
  if (Math.abs(dx) <= tolerance && Math.abs(dy) > 2) return dy > 0 ? 'down' : 'up';
  return null;
}

import {
  ARENA,
  BASE_CELLS,
  BASE_RING_CELLS,
  DIRS,
  ENEMY_SPAWNS,
  ENEMY_TYPES,
  GRID,
  MATCH_CONFIG,
  PLAYER_ACCENTS,
  PLAYER_SPAWNS,
  POWERUP_DEFS,
  POWERUP_TYPE,
  TILE,
  TILE_TYPE,
} from './config.js';
import {
  Base,
  Bullet,
  PowerUp,
  Tank,
  pointInRect,
  rectsOverlap,
} from './entities.js';
import { BUILTIN_LEVELS, createEnemyQueue, generateRandomLevel, normalizeLevel } from './levels.js';
import { createPilot } from './ai.js';

const BASE_CELL_KEYS = new Set(BASE_CELLS.map(({ c, r }) => `${c},${r}`));

function randomChoice(items) {
  return items[Math.floor(Math.random() * items.length)];
}

function weightedPowerup() {
  const entries = [
    [POWERUP_TYPE.STAR, 26],
    [POWERUP_TYPE.HELMET, 18],
    [POWERUP_TYPE.GRENADE, 14],
    [POWERUP_TYPE.CLOCK, 12],
    [POWERUP_TYPE.SHOVEL, 10],
    [POWERUP_TYPE.LIFE, 8],
  ];
  const total = entries.reduce((sum, [, weight]) => sum + weight, 0);
  let roll = Math.random() * total;
  for (const [type, weight] of entries) {
    if (roll < weight) return type;
    roll -= weight;
  }
  return POWERUP_TYPE.STAR;
}

export class Game {
  constructor({ audio, input }) {
    this.audio = audio;
    this.input = input;
    this.state = 'menu';
    this.mode = '1p';
    this.playerCount = 1;
    this.aiFlags = [false, false];
    this.aiMode = false;

    this.stage = 1;
    this.currentLevel = normalizeLevel(BUILTIN_LEVELS[0]);
    this.map = this.currentLevel.grid.map((row) => row.slice());
    this.base = new Base();
    this.players = [];
    this.enemies = [];
    this.bullets = [];
    this.powerups = [];
    this.particles = [];
    this.floatTexts = [];
    this.scores = [0, 0];
    this.enemyQueue = [];
    this.spawnTimer = 0;
    this.spawnIndex = 0;
    this.introTimer = 0;
    this.stateTimer = 0;
    this.enemyFreezeTimer = 0;
    this.shovelTimer = 0;
    this.notice = null;
    this.time = 0;
    this.killCount = 0;
    this.shake = 0;
    this.gameOverReason = null;
    this.lastSessionMode = '1p';
    this.onStateChange = null;
    this.onHudChange = null;
  }

  setModeFlags(mode) {
    this.mode = mode;
    this.playerCount = mode === '2p' || mode === 'ai2' ? 2 : 1;
    this.aiMode = mode === 'ai1' || mode === 'ai2';
    this.aiFlags = [
      mode === 'ai1' || mode === 'ai2',
      mode === 'ai2',
    ];
    this.lastSessionMode = mode;
  }

  startNewSession(mode = '1p', level = null) {
    this.setModeFlags(mode);
    this.stage = 1;
    this.scores = [0, 0];
    this.gameOverReason = null;
    const startLevel = level ? normalizeLevel(level) : normalizeLevel(BUILTIN_LEVELS[0]);
    this.startStage(startLevel, 1);
  }

  startCustomLevel(level, mode = '1p') {
    this.startNewSession(mode, level);
  }

  startStage(level, stageNumber) {
    this.currentLevel = normalizeLevel(level);
    this.map = this.currentLevel.grid.map((row) => row.slice());
    this.stage = stageNumber;
    this.base = new Base();
    this.enemies = [];
    this.bullets = [];
    this.powerups = [];
    this.particles = [];
    this.floatTexts = [];
    this.enemyQueue = createEnemyQueue(this.currentLevel, this.stage);
    this.spawnTimer = 0.6;
    this.spawnIndex = 0;
    this.introTimer = 1.35;
    this.stateTimer = 0;
    this.enemyFreezeTimer = 0;
    this.shovelTimer = 0;
    this.notice = null;
    this.killCount = 0;
    this.shake = 0;
    this.gameOverReason = null;
    this.players = [];

    for (let i = 0; i < this.playerCount; i += 1) {
      const spawn = PLAYER_SPAWNS[i];
      const tank = new Tank(this, {
        x: spawn.x,
        y: spawn.y,
        dir: 'up',
        faction: 'player',
        playerIndex: i,
        lives: MATCH_CONFIG.playerLives,
        shieldTimer: 2.4,
        spawnTimer: 0.65,
        isAI: this.aiFlags[i],
      });
      tank.updatePowerStats();
      if (tank.isAI) tank.aiPilot = createPilot(this, tank, false);
      this.players.push(tank);
    }

    this.state = 'playing';
    this.audio.spawn();
    this.emitState();
  }

  nextStage() {
    if (this.aiMode) {
      this.stage += 1;
      const level = generateRandomLevel(this.stage);
      this.startStage(level, this.stage);
    } else {
      this.stage += 1;
      const level = generateRandomLevel(this.stage);
      this.startStage(level, this.stage);
    }
  }

  retryStage() {
    this.startStage(this.currentLevel, this.stage);
  }

  goToMenu() {
    this.state = 'menu';
    this.emitState();
  }

  togglePause() {
    if (this.state === 'playing') {
      this.state = 'paused';
      this.emitState();
    } else if (this.state === 'paused') {
      this.state = 'playing';
      this.emitState();
    }
  }

  pause() {
    if (this.state === 'playing') {
      this.state = 'paused';
      this.emitState();
    }
  }

  resume() {
    if (this.state === 'paused') {
      this.state = 'playing';
      this.emitState();
    }
  }

  emitState() {
    if (typeof this.onStateChange === 'function') this.onStateChange(this.state, this);
  }

  emitHud() {
    if (typeof this.onHudChange === 'function') this.onHudChange(this);
  }

  get levelLabel() {
    return this.currentLevel?.name ?? '未知战场';
  }

  get remainingEnemies() {
    return this.enemyQueue.length + this.enemies.filter((enemy) => enemy.alive).length;
  }

  tileAt(c, r) {
    if (c < 0 || c >= GRID || r < 0 || r >= GRID) return TILE_TYPE.STEEL;
    return this.map[r][c];
  }

  isBaseCell(c, r) {
    return BASE_CELL_KEYS.has(`${c},${r}`);
  }

  baseBox() {
    return this.base.box;
  }

  canTankMove(tank, nx, ny) {
    const half = tank.size / 2 - 3;
    if (nx - half < 0 || ny - half < 0 || nx + half > ARENA || ny + half > ARENA) {
      return false;
    }

    const left = nx - half;
    const right = nx + half;
    const top = ny - half;
    const bottom = ny + half;
    const c0 = Math.floor(left / TILE);
    const c1 = Math.floor((right - 0.01) / TILE);
    const r0 = Math.floor(top / TILE);
    const r1 = Math.floor((bottom - 0.01) / TILE);

    for (let r = r0; r <= r1; r += 1) {
      for (let c = c0; c <= c1; c += 1) {
        if (c < 0 || c >= GRID || r < 0 || r >= GRID) return false;
        const tile = this.map[r][c];
        if (
          tile === TILE_TYPE.BRICK ||
          tile === TILE_TYPE.STEEL ||
          tile === TILE_TYPE.WATER ||
          this.isBaseCell(c, r)
        ) {
          return false;
        }
      }
    }

    const prospective = { x: left, y: top, w: half * 2, h: half * 2 };
    for (const other of [...this.players, ...this.enemies]) {
      if (other === tank || !other.alive) continue;
      if (rectsOverlap(prospective, other.collisionBox)) return false;
    }
    return true;
  }

  spawnBullet(owner, options) {
    this.bullets.push(
      new Bullet({
        ...options,
        owner,
        faction: options.faction ?? owner.faction,
      }),
    );
  }

  update(dt) {
    if (this.state === 'menu') return;
    this.time += dt;
    this.shake = Math.max(0, this.shake - dt * 16);
    this.updateParticles(dt);

    if (this.state === 'playing') {
      if (this.introTimer > 0) {
        this.introTimer = Math.max(0, this.introTimer - dt);
        this.updatePowerups(dt);
        return;
      }
      this.updateTimers(dt);
      this.updateEnemySpawning(dt);
      this.updatePlayers(dt);
      this.updateEnemies(dt);
      this.updateBullets(dt);
      this.updatePowerups(dt);
      this.updateRespawns(dt);
      this.cleanupEntities();
      this.checkVictoryOrDefeat();
      if (this.notice) {
        this.notice.timer -= dt;
        if (this.notice.timer <= 0) this.notice = null;
      }
      this.emitHud();
      return;
    }

    if (this.state === 'stage-clear' || this.state === 'game-over') {
      if (this.notice) {
        this.notice.timer -= dt;
        if (this.notice.timer <= 0) this.notice = null;
      }
      if (this.aiMode) {
        this.stateTimer -= dt;
        if (this.stateTimer <= 0) {
          if (this.state === 'stage-clear') this.nextStage();
          else this.autoAdvanceAfterFailure();
        }
      }
      this.emitHud();
    }
  }

  updateTimers(dt) {
    this.enemyFreezeTimer = Math.max(0, this.enemyFreezeTimer - dt);
    if (this.shovelTimer > 0) {
      this.shovelTimer = Math.max(0, this.shovelTimer - dt);
      if (this.shovelTimer === 0) {
        for (const { c, r } of BASE_RING_CELLS) {
          if (r >= 0 && r < GRID && c >= 0 && c < GRID) this.map[r][c] = TILE_TYPE.BRICK;
        }
        this.showNotice('钢铁护墙已失效');
      }
    }
  }

  updateEnemySpawning(dt) {
    if (!this.enemyQueue.length) return;
    this.spawnTimer -= dt;
    if (this.spawnTimer > 0) return;
    const activeCount = this.enemies.filter((enemy) => enemy.alive).length;
    if (activeCount >= MATCH_CONFIG.maxEnemiesOnScreen) {
      this.spawnTimer = 0.25;
      return;
    }

    const candidates = ENEMY_SPAWNS.filter((spawn) => {
      return ![...this.players, ...this.enemies].some((tank) => {
        return tank.alive && Math.hypot(tank.x - spawn.x, tank.y - spawn.y) < TANK_MIN_SPAWN_DISTANCE;
      });
    });
    if (!candidates.length) {
      this.spawnTimer = 0.3;
      return;
    }

    const spawn = randomChoice(candidates);
    const kind = this.enemyQueue.shift();
    const baseConfig = ENEMY_TYPES[kind] ?? ENEMY_TYPES.basic;
    const difficulty = Math.min(12, this.stage - 1);
    const config = {
      ...baseConfig,
      speed: baseConfig.speed * (1 + difficulty * 0.008),
      fireDelay: Math.max(0.36, baseConfig.fireDelay * (1 - difficulty * 0.012)),
      score: baseConfig.score + this.stage * 10,
    };
    const enemy = new Tank(this, {
      x: spawn.x,
      y: spawn.y,
      dir: 'down',
      faction: 'enemy',
      enemyKind: kind,
      enemyConfig: config,
      spawnTimer: 0.85,
      fireDelay: 1.15,
    });
    enemy.aiPilot = createPilot(this, enemy, true);
    this.enemies.push(enemy);
    this.audio.spawn();
    this.spawnBurst(spawn.x, spawn.y, '#d7f5ff', 8);
    this.spawnTimer = Math.max(0.65, 1.45 - this.stage * 0.035) + Math.random() * 0.4;
    this.spawnIndex += 1;
    this.emitHud();
  }

  updatePlayers(dt) {
    for (let i = 0; i < this.players.length; i += 1) {
      const player = this.players[i];
      if (!player.alive) continue;
      let controls;
      if (player.isAI) {
        controls = player.aiPilot.update(dt) || {};
      } else {
        controls = this.input.controlsForPlayer(i) || {};
      }
      player.update(dt, controls);
    }
  }

  updateEnemies(dt) {
    for (const enemy of this.enemies) {
      if (!enemy.alive) continue;
      const controls = enemy.aiPilot.update(dt) || enemy.aiPilot.controls;
      enemy.update(dt, controls);
    }
  }

  updateBullets(dt) {
    for (const bullet of this.bullets) {
      if (!bullet.alive) continue;
      bullet.update(dt);
      if (!bullet.alive) continue;

      if (
        bullet.x < -BULLET_MARGIN ||
        bullet.y < -BULLET_MARGIN ||
        bullet.x > ARENA + BULLET_MARGIN ||
        bullet.y > ARENA + BULLET_MARGIN
      ) {
        bullet.alive = false;
        continue;
      }

      if (this.checkBulletTiles(bullet)) continue;

      if (
        this.base.alive &&
        pointInRect(bullet.x, bullet.y, this.base.box)
      ) {
        bullet.alive = false;
        this.destroyBase();
        continue;
      }

      if (this.checkBulletTanks(bullet)) continue;
      this.checkBulletVsBullets(bullet);
    }
  }

  checkBulletTiles(bullet) {
    const cellC = Math.floor(bullet.x / TILE);
    const cellR = Math.floor(bullet.y / TILE);
    if (cellC < 0 || cellC >= GRID || cellR < 0 || cellR >= GRID) return false;
    const tile = this.map[cellR][cellC];
    if (tile === TILE_TYPE.BRICK) {
      this.map[cellR][cellC] = TILE_TYPE.EMPTY;
      bullet.alive = false;
      this.audio.brick();
      this.brickBurst(cellC, cellR);
      this.showFloat('+墙', bullet.x, bullet.y, '#d7a15b', 0.5);
      return true;
    }
    if (tile === TILE_TYPE.STEEL) {
      bullet.alive = false;
      if (bullet.power >= 2) {
        this.map[cellR][cellC] = TILE_TYPE.EMPTY;
        this.spawnBurst(bullet.x, bullet.y, '#e2edf9', 12);
        this.audio.steel();
      } else {
        this.spawnBurst(bullet.x, bullet.y, '#b8c8d8', 6);
        this.audio.steel();
      }
      return true;
    }
    return false;
  }

  checkBulletTanks(bullet) {
    for (const tank of [...this.players, ...this.enemies]) {
      if (!tank.alive || tank.faction === bullet.faction) continue;
      if (!rectsOverlap(bullet.box, tank.collisionBox)) continue;
      if (tank.invulnerable) {
        bullet.alive = false;
        this.spawnBurst(bullet.x, bullet.y, '#bff3ff', 6);
        this.audio.steel();
        return true;
      }
      bullet.alive = false;
      if (tank.faction === 'enemy') {
        const dead = tank.damage(bullet.power >= 2 ? 2 : 1);
        if (dead) {
          this.killEnemy(tank, bullet.owner?.playerIndex ?? null, true);
        } else {
          this.spawnBurst(bullet.x, bullet.y, '#ffd98a', 7);
          this.audio.explode(false);
        }
      } else {
        const dead = tank.damage(1);
        if (dead) this.killPlayer(tank);
      }
      return true;
    }
    return false;
  }

  checkBulletVsBullets(bullet) {
    for (const other of this.bullets) {
      if (other === bullet || !other.alive || !bullet.alive) continue;
      if (other.faction === bullet.faction) continue;
      if (!rectsOverlap(bullet.box, other.box)) continue;
      bullet.alive = false;
      other.alive = false;
      this.spawnBurst(bullet.x, bullet.y, '#ffe8a8', 5);
      this.audio.steel();
      break;
    }
  }

  updatePowerups(dt) {
    for (const powerup of this.powerups) {
      if (!powerup.alive) continue;
      powerup.update(dt);
      if (!powerup.alive) continue;
      for (const player of this.players) {
        if (!player.alive) continue;
        if (!rectsOverlap(powerup.box, player.collisionBox)) continue;
        powerup.alive = false;
        this.collectPowerup(powerup, player);
        break;
      }
    }
    this.powerups = this.powerups.filter((powerup) => powerup.alive);
  }

  updateRespawns(dt) {
    for (const player of this.players) {
      if (player.alive || player.eliminated) continue;
      player.respawnTimer -= dt;
      if (player.respawnTimer > 0) continue;
      const spawn = PLAYER_SPAWNS[player.playerIndex];
      const blocked = [...this.players, ...this.enemies].some((tank) => {
        return (
          tank !== player &&
          tank.alive &&
          Math.hypot(tank.x - spawn.x, tank.y - spawn.y) < TANK_MIN_SPAWN_DISTANCE
        );
      });
      if (blocked) {
        player.respawnTimer = 0.3;
        continue;
      }
      player.resetForRespawn(spawn.x, spawn.y);
      if (player.isAI && player.aiPilot) player.aiPilot.resetPath();
      this.spawnBurst(spawn.x, spawn.y, '#d7f5ff', 10);
      this.audio.spawn();
    }
  }

  cleanupEntities() {
    this.bullets = this.bullets.filter((bullet) => bullet.alive);
    this.enemies = this.enemies.filter((enemy) => enemy.alive);
  }

  updateParticles(dt) {
    for (const particle of this.particles) {
      particle.life -= dt;
      particle.x += particle.vx * dt;
      particle.y += particle.vy * dt;
      particle.vy += particle.gravity * dt;
      particle.vx *= 0.985;
    }
    this.particles = this.particles.filter((particle) => particle.life > 0);
    for (const text of this.floatTexts) {
      text.life -= dt;
      text.y -= 26 * dt;
    }
    this.floatTexts = this.floatTexts.filter((text) => text.life > 0);
  }

  killEnemy(enemy, playerIndex = null, allowDrop = true) {
    if (!enemy.alive && enemy._countedDeath) return;
    enemy._countedDeath = true;
    enemy.alive = false;
    enemy.hp = 0;
    this.audio.explode(true);
    this.addExplosion(enemy.x, enemy.y, 24, enemy.enemyKind === 'armor' ? '#ffbf75' : '#ffd36c');
    this.shake = Math.max(this.shake, 4.5);

    const points = enemy.scoreValue ?? 100;
    if (playerIndex != null && this.scores[playerIndex] != null) {
      this.scores[playerIndex] += points;
      this.showFloat(`+${points}`, enemy.x, enemy.y - 14, PLAYER_ACCENTS[playerIndex].accent);
    } else {
      this.scores[0] += points;
    }
    this.killCount += 1;
    if (allowDrop) this.maybeDropPowerup(enemy.x, enemy.y);
  }

  killPlayer(player) {
    if (player.lives <= 0) return;
    player.lives -= 1;
    this.audio.playerHit();
    this.addExplosion(player.x, player.y, 30, '#ffb36b');
    this.shake = Math.max(this.shake, 7);
    if (player.lives > 0) {
      player.respawnTimer = MATCH_CONFIG.respawnDelay;
      this.showNotice(`${PLAYER_ACCENTS[player.playerIndex].name} 剩余 ${player.lives} 条命`);
    } else {
      player.eliminated = true;
      this.showNotice(`${PLAYER_ACCENTS[player.playerIndex].name} 已退出战斗`);
    }
    this.emitHud();
  }

  destroyBase() {
    if (!this.base.alive) return;
    this.base.alive = false;
    this.audio.explode(true);
    this.audio.gameOver();
    this.shake = 12;
    this.addExplosion(this.base.center.x, this.base.center.y, 60, '#ff9b5e');
    for (let i = 0; i < 5; i += 1) {
      this.addExplosion(
        this.base.x + Math.random() * this.base.w,
        this.base.y + Math.random() * this.base.h,
        24,
        i % 2 ? '#ffd36c' : '#ff6c5e',
      );
    }
    this.endGame('base');
  }

  endGame(reason) {
    if (this.state === 'game-over' || this.state === 'menu') return;
    this.state = 'game-over';
    this.gameOverReason = reason;
    this.stateTimer = MATCH_CONFIG.autoNextDelay;
    if (reason === 'players') this.audio.gameOver();
    this.showNotice(reason === 'base' ? '基地被摧毁' : '全部坦克损毁');
    this.emitState();
    this.emitHud();
  }

  autoAdvanceAfterFailure() {
    this.stage += 1;
    const level = generateRandomLevel(this.stage);
    this.startStage(level, this.stage);
  }

  completeStage() {
    if (this.state !== 'playing') return;
    this.state = 'stage-clear';
    this.stateTimer = MATCH_CONFIG.stageClearDelay;
    this.audio.stageClear();
    for (const player of this.players) {
      if (player.alive) {
        this.scores[player.playerIndex] += 500;
        this.addExplosion(player.x, player.y, 14, '#fff0a8');
      }
    }
    this.emitState();
    this.emitHud();
  }

  checkVictoryOrDefeat() {
    if (!this.base.alive) {
      this.endGame('base');
      return;
    }
    if (this.players.length && this.players.every((player) => player.eliminated)) {
      this.endGame('players');
      return;
    }
    if (!this.enemyQueue.length && !this.enemies.some((enemy) => enemy.alive)) {
      this.completeStage();
    }
  }

  maybeDropPowerup(x, y) {
    if (this.powerups.length >= 2) return;
    if (this.killCount % 6 !== 0 && Math.random() > MATCH_CONFIG.powerupChance) return;
    const cellC = Math.floor(x / TILE);
    const cellR = Math.floor(y / TILE);
    const center = { x: cellC * TILE + TILE / 2, y: cellR * TILE + TILE / 2 };
    if (this.isBaseCell(cellC, cellR)) return;
    const tile = this.tileAt(cellC, cellR);
    if (tile === TILE_TYPE.STEEL || tile === TILE_TYPE.WATER) return;
    if (this.powerups.some((powerup) => Math.hypot(powerup.x - center.x, powerup.y - center.y) < TILE)) {
      return;
    }
    const type = weightedPowerup();
    this.powerups.push(new PowerUp(type, center.x, center.y));
    this.showNotice(`发现道具：${POWERUP_DEFS[type].label}`);
    this.spawnBurst(center.x, center.y, POWERUP_DEFS[type].color, 10);
  }

  collectPowerup(powerup, player) {
    this.audio.powerup();
    const def = POWERUP_DEFS[powerup.type];
    this.showFloat(def.label, powerup.x, powerup.y - 8, def.color, 1.1);
    switch (powerup.type) {
      case POWERUP_TYPE.STAR:
        player.upgrade();
        this.showNotice(`${PLAYER_ACCENTS[player.playerIndex].name} 火力升至 ${player.powerLevel} 级`);
        break;
      case POWERUP_TYPE.HELMET:
        player.shieldTimer = Math.max(player.shieldTimer, MATCH_CONFIG.shieldTime);
        this.audio.shield();
        this.showNotice(`${PLAYER_ACCENTS[player.playerIndex].name} 获得 ${MATCH_CONFIG.shieldTime} 秒护盾`);
        break;
      case POWERUP_TYPE.GRENADE:
        this.detonateAllEnemies(player.playerIndex);
        break;
      case POWERUP_TYPE.CLOCK:
        this.enemyFreezeTimer = MATCH_CONFIG.freezeTime;
        this.audio.freeze();
        this.showNotice(`敌军冻结 ${MATCH_CONFIG.freezeTime} 秒`);
        break;
      case POWERUP_TYPE.SHOVEL:
        this.shovelTimer = MATCH_CONFIG.baseShovelTime;
        this.armBaseWalls();
        this.showNotice('基地外围已换成钢铁');
        break;
      case POWERUP_TYPE.LIFE:
        player.lives += 1;
        this.showNotice(`${PLAYER_ACCENTS[player.playerIndex].name} 增加 1 条命`);
        break;
      default:
        break;
    }
    this.emitHud();
  }

  detonateAllEnemies(playerIndex) {
    const living = this.enemies.filter((enemy) => enemy.alive);
    if (!living.length) {
      this.showNotice('全屏爆破：场上没有敌人');
      return;
    }
    this.shake = 9;
    for (const enemy of living) this.killEnemy(enemy, playerIndex, false);
    this.showNotice(`全屏爆破！消灭 ${living.length} 辆敌军`);
  }

  armBaseWalls() {
    for (const { c, r } of BASE_RING_CELLS) {
      if (r >= 0 && r < GRID && c >= 0 && c < GRID) this.map[r][c] = TILE_TYPE.STEEL;
    }
  }

  showNotice(text) {
    this.notice = { text, timer: 2.4 };
    this.emitHud();
  }

  showFloat(text, x, y, color = '#ffffff', life = 0.8) {
    this.floatTexts.push({ text, x, y, color, life, maxLife: life });
  }

  addExplosion(x, y, count = 18, color = '#ffd36c') {
    for (let i = 0; i < count; i += 1) {
      const angle = Math.random() * Math.PI * 2;
      const speed = 30 + Math.random() * 160;
      this.particles.push({
        x,
        y,
        vx: Math.cos(angle) * speed,
        vy: Math.sin(angle) * speed - 20,
        gravity: 130,
        life: 0.35 + Math.random() * 0.7,
        maxLife: 1.05,
        size: 2 + Math.random() * 4,
        color: Math.random() < 0.5 ? color : '#ff7a52',
      });
    }
  }

  spawnBurst(x, y, color = '#ffffff', count = 8) {
    for (let i = 0; i < count; i += 1) {
      const angle = Math.random() * Math.PI * 2;
      const speed = 15 + Math.random() * 60;
      this.particles.push({
        x,
        y,
        vx: Math.cos(angle) * speed,
        vy: Math.sin(angle) * speed,
        gravity: 0,
        life: 0.18 + Math.random() * 0.3,
        maxLife: 0.48,
        size: 1.5 + Math.random() * 2.5,
        color,
      });
    }
  }

  brickBurst(c, r) {
    const x = c * TILE + TILE / 2;
    const y = r * TILE + TILE / 2;
    for (let i = 0; i < 9; i += 1) {
      this.particles.push({
        x: x + (Math.random() - 0.5) * TILE * 0.8,
        y: y + (Math.random() - 0.5) * TILE * 0.8,
        vx: (Math.random() - 0.5) * 110,
        vy: -20 - Math.random() * 90,
        gravity: 280,
        life: 0.3 + Math.random() * 0.35,
        maxLife: 0.65,
        size: 2 + Math.random() * 3,
        color: Math.random() < 0.5 ? '#c1733c' : '#8e4d28',
      });
    }
  }

  getModeLabel() {
    if (this.mode === 'ai1') return 'AI 单坦克演示';
    if (this.mode === 'ai2') return 'AI 双坦克演示';
    if (this.mode === '2p') return '双人合作';
    return '单人闯关';
  }
}

const TANK_MIN_SPAWN_DISTANCE = 38;
const BULLET_MARGIN = 16;

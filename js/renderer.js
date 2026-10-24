import {
  ARENA,
  DIRS,
  GRID,
  POWERUP_DEFS,
  POWERUP_TYPE,
  TILE,
  TILE_TYPE,
} from './config.js';

const GROUND_A = '#0b1512';
const GROUND_B = '#0d1915';

function hash2(c, r) {
  let h = c * 374761393 + r * 668265263;
  h = (h ^ (h >> 13)) * 1274126177;
  return Math.abs(h % 1000) / 1000;
}

function roundedRect(ctx, x, y, w, h, radius) {
  const r = Math.min(radius, w / 2, h / 2);
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + w, y, x + w, y + h, r);
  ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r);
  ctx.arcTo(x, y, x + w, y, r);
  ctx.closePath();
}

export function paintTile(ctx, x, y, type, time = 0) {
  if (type === TILE_TYPE.EMPTY || type === TILE_TYPE.TREE) {
    const shade = (Math.floor(x / TILE) + Math.floor(y / TILE)) % 2 === 0 ? GROUND_A : GROUND_B;
    ctx.fillStyle = shade;
    ctx.fillRect(x, y, TILE, TILE);
    const h = hash2(Math.floor(x / TILE), Math.floor(y / TILE));
    ctx.fillStyle = `rgba(115, 161, 132, ${0.05 + h * 0.05})`;
    ctx.fillRect(x + 7 + h * 22, y + 8 + h * 18, 2, 2);
    ctx.fillRect(x + 26 - h * 12, y + 28 - h * 8, 2, 2);
    ctx.strokeStyle = 'rgba(124, 175, 145, 0.055)';
    ctx.lineWidth = 1;
    ctx.strokeRect(x + 0.5, y + 0.5, TILE - 1, TILE - 1);
    return;
  }

  if (type === TILE_TYPE.BRICK) {
    ctx.fillStyle = '#3b2318';
    ctx.fillRect(x, y, TILE, TILE);
    const brickW = 10;
    const brickH = 10;
    for (let row = 0; row < 4; row += 1) {
      const offset = row % 2 === 0 ? 0 : -brickW / 2;
      for (let col = -1; col < 5; col += 1) {
        const bx = x + col * brickW + offset + 1;
        const by = y + row * brickH + 1;
        if (bx + brickW - 2 <= x || bx >= x + TILE) continue;
        const clipX = Math.max(x, bx);
        const clipW = Math.min(x + TILE, bx + brickW - 2) - clipX;
        ctx.fillStyle = row % 2 === 0 ? '#a75c31' : '#944d29';
        ctx.fillRect(clipX, by, clipW, brickH - 2);
        ctx.fillStyle = 'rgba(255, 197, 138, 0.18)';
        ctx.fillRect(clipX, by, clipW, 1);
        ctx.fillStyle = 'rgba(50, 24, 16, 0.3)';
        ctx.fillRect(clipX, by + brickH - 3, clipW, 1);
      }
    }
    return;
  }

  if (type === TILE_TYPE.STEEL) {
    ctx.fillStyle = '#596776';
    ctx.fillRect(x, y, TILE, TILE);
    ctx.fillStyle = '#748596';
    ctx.fillRect(x + 2, y + 2, TILE - 4, TILE - 4);
    ctx.fillStyle = '#95a7b7';
    ctx.fillRect(x + 4, y + 4, TILE - 8, 2);
    ctx.fillRect(x + 4, y + 4, 2, TILE - 8);
    ctx.fillStyle = '#3d4b58';
    ctx.fillRect(x + 4, y + TILE - 7, TILE - 8, 3);
    ctx.fillRect(x + TILE - 7, y + 6, 3, TILE - 10);
    ctx.fillStyle = '#c9d6e0';
    for (const [px, py] of [[6, 6], [TILE - 9, 6], [6, TILE - 9], [TILE - 9, TILE - 9]]) {
      ctx.fillRect(x + px, y + py, 3, 3);
    }
    ctx.strokeStyle = 'rgba(24, 32, 40, 0.55)';
    ctx.strokeRect(x + 0.5, y + 0.5, TILE - 1, TILE - 1);
    return;
  }

  if (type === TILE_TYPE.WATER) {
    ctx.fillStyle = '#123a55';
    ctx.fillRect(x, y, TILE, TILE);
    ctx.fillStyle = '#1a5072';
    ctx.fillRect(x, y + 2, TILE, TILE - 4);
    const phase = time * 2.2 + (x + y) * 0.03;
    ctx.strokeStyle = 'rgba(110, 208, 240, 0.45)';
    ctx.lineWidth = 1.5;
    for (let i = 0; i < 3; i += 1) {
      const wy = y + 9 + i * 11;
      ctx.beginPath();
      for (let px = 0; px <= TILE; px += 4) {
        const py = wy + Math.sin(phase + px * 0.22 + i) * 2.2;
        if (px === 0) ctx.moveTo(x + px, py);
        else ctx.lineTo(x + px, py);
      }
      ctx.stroke();
    }
    ctx.fillStyle = 'rgba(210, 247, 255, 0.2)';
    ctx.fillRect(x + 5, y + 6, 7, 1);
    return;
  }

  if (type === TILE_TYPE.ICE) {
    const gradient = ctx.createLinearGradient(x, y, x + TILE, y + TILE);
    gradient.addColorStop(0, '#a8d3e6');
    gradient.addColorStop(1, '#7badc4');
    ctx.fillStyle = gradient;
    ctx.fillRect(x, y, TILE, TILE);
    ctx.strokeStyle = 'rgba(232, 252, 255, 0.55)';
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(x + 6, y + 30);
    ctx.lineTo(x + 17, y + 18);
    ctx.lineTo(x + 26, y + 24);
    ctx.lineTo(x + 35, y + 7);
    ctx.moveTo(x + 10, y + 8);
    ctx.lineTo(x + 16, y + 16);
    ctx.lineTo(x + 10, y + 26);
    ctx.stroke();
    ctx.fillStyle = 'rgba(255, 255, 255, 0.16)';
    ctx.fillRect(x + 2, y + 2, TILE - 4, 4);
    return;
  }
}

export function paintTree(ctx, x, y, time = 0) {
  const sway = Math.sin(time * 1.6 + x * 0.05 + y * 0.03) * 1.5;
  ctx.save();
  ctx.translate(sway, 0);
  ctx.fillStyle = '#17472a';
  ctx.beginPath();
  ctx.arc(x + 12, y + 22, 11, 0, Math.PI * 2);
  ctx.arc(x + 27, y + 20, 12, 0, Math.PI * 2);
  ctx.arc(x + 19, y + 12, 12, 0, Math.PI * 2);
  ctx.arc(x + 20, y + 28, 12, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = '#24623a';
  ctx.beginPath();
  ctx.arc(x + 13, y + 18, 7, 0, Math.PI * 2);
  ctx.arc(x + 27, y + 17, 8, 0, Math.PI * 2);
  ctx.arc(x + 20, y + 10, 8, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = '#378249';
  ctx.beginPath();
  ctx.arc(x + 17, y + 13, 4, 0, Math.PI * 2);
  ctx.arc(x + 26, y + 20, 3.5, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = '#55a55f';
  ctx.fillRect(x + 15, y + 9, 3, 2);
  ctx.fillRect(x + 24, y + 16, 3, 2);
  ctx.fillStyle = 'rgba(7, 20, 12, 0.55)';
  ctx.fillRect(x + 4, y + 36, TILE - 8, 3);
  ctx.restore();
}

export function paintBase(ctx, base, time = 0, destroyed = false) {
  const x = base.x;
  const y = base.y;
  const size = base.w;
  if (destroyed) {
    ctx.fillStyle = '#1a1c1e';
    ctx.fillRect(x + 8, y + 12, size - 16, size - 20);
    ctx.fillStyle = '#383c40';
    ctx.fillRect(x + 14, y + 28, 16, 22);
    ctx.fillRect(x + 42, y + 22, 15, 18);
    ctx.fillRect(x + 28, y + 48, 9, 20);
    ctx.fillStyle = '#6f4e34';
    ctx.fillRect(x + 20, y + 20, 7, 9);
    ctx.fillRect(x + 48, y + 44, 8, 7);
    ctx.fillStyle = 'rgba(255, 124, 70, 0.72)';
    for (let i = 0; i < 3; i += 1) {
      const fx = x + 24 + i * 16;
      const fh = 10 + Math.sin(time * 7 + i * 1.7) * 5;
      ctx.beginPath();
      ctx.moveTo(fx, y + 66);
      ctx.quadraticCurveTo(fx + 8, y + 66 - fh, fx + 4, y + 52 - fh);
      ctx.quadraticCurveTo(fx - 7, y + 58, fx, y + 66);
      ctx.fill();
    }
    return;
  }

  ctx.save();
  ctx.translate(x + size / 2, y + size / 2);
  ctx.fillStyle = 'rgba(0, 0, 0, 0.35)';
  ctx.beginPath();
  ctx.ellipse(0, 26, 30, 9, 0, 0, Math.PI * 2);
  ctx.fill();

  ctx.fillStyle = '#102b2c';
  roundedRect(ctx, -35, -33, 70, 68, 7);
  ctx.fill();
  ctx.strokeStyle = '#35676b';
  ctx.lineWidth = 2;
  roundedRect(ctx, -35, -33, 70, 68, 7);
  ctx.stroke();

  const wingGradient = ctx.createLinearGradient(0, -25, 0, 30);
  wingGradient.addColorStop(0, '#eaf2f4');
  wingGradient.addColorStop(0.6, '#b8c9ce');
  wingGradient.addColorStop(1, '#7d969e');
  ctx.fillStyle = wingGradient;
  ctx.strokeStyle = '#3e5960';
  ctx.lineWidth = 1.5;

  const leftWing = [
    [-4, -16],
    [-13, -24],
    [-20, -23],
    [-18, -14],
    [-30, -12],
    [-26, -1],
    [-34, 6],
    [-23, 12],
    [-26, 22],
    [-14, 18],
    [-9, 25],
    [-4, 18],
  ];
  const drawWing = (points) => {
    ctx.beginPath();
    points.forEach(([px, py], index) => {
      if (index === 0) ctx.moveTo(px, py);
      else ctx.lineTo(px, py);
    });
    ctx.closePath();
    ctx.fill();
    ctx.stroke();
    ctx.strokeStyle = 'rgba(56, 84, 90, 0.7)';
    for (let i = 1; i <= 3; i += 1) {
      ctx.beginPath();
      ctx.moveTo(-7 - i * 4, -14 + i * 5);
      ctx.lineTo(-22 - i * 3, -4 + i * 7);
      ctx.stroke();
    }
    ctx.strokeStyle = '#3e5960';
  };
  drawWing(leftWing);
  drawWing(leftWing.map(([px, py]) => [-px, py]));

  ctx.fillStyle = '#dce9ec';
  ctx.beginPath();
  ctx.ellipse(0, -2, 9, 18, 0, 0, Math.PI * 2);
  ctx.fill();
  ctx.stroke();
  ctx.fillStyle = '#f2f7f8';
  ctx.beginPath();
  ctx.arc(0, -21, 9, 0, Math.PI * 2);
  ctx.fill();
  ctx.stroke();
  ctx.fillStyle = '#e8b84d';
  ctx.beginPath();
  ctx.moveTo(0, -27);
  ctx.lineTo(-7, -21);
  ctx.lineTo(0, -16);
  ctx.closePath();
  ctx.fill();
  ctx.fillStyle = '#223437';
  ctx.fillRect(-4, -24, 3, 3);
  ctx.fillRect(2, -24, 3, 3);
  ctx.fillStyle = 'rgba(255, 255, 255, 0.6)';
  ctx.fillRect(-15, 12, 8, 2);
  ctx.fillRect(7, 12, 8, 2);
  ctx.restore();
}

function drawStar(ctx, x, y, radius, points = 5) {
  ctx.beginPath();
  for (let i = 0; i < points * 2; i += 1) {
    const angle = -Math.PI / 2 + (i * Math.PI) / points;
    const rad = i % 2 === 0 ? radius : radius * 0.45;
    const px = x + Math.cos(angle) * rad;
    const py = y + Math.sin(angle) * rad;
    if (i === 0) ctx.moveTo(px, py);
    else ctx.lineTo(px, py);
  }
  ctx.closePath();
}

function drawTank(ctx, tank, time) {
  const angle = DIRS[tank.dir]?.angle ?? 0;
  const isPlayer = tank.faction === 'player';
  const accent = isPlayer
    ? tank.accent
    : {
        body: tank.enemyConfig?.color ?? '#c9ccd6',
        track: tank.enemyConfig?.accent ?? '#7b8191',
        accent: '#f5f7fb',
      };

  ctx.save();
  ctx.translate(tank.x, tank.y);
  ctx.fillStyle = 'rgba(0, 0, 0, 0.35)';
  ctx.beginPath();
  ctx.ellipse(0, 15, 17, 6, 0, 0, Math.PI * 2);
  ctx.fill();

  if (tank.spawnTimer > 0) {
    const pulse = (Math.sin(time * 18) + 1) / 2;
    ctx.strokeStyle = `rgba(134, 246, 255, ${0.45 + pulse * 0.5})`;
    ctx.lineWidth = 2;
    const r = 17 + pulse * 4;
    for (let i = 0; i < 4; i += 1) {
      const a = i * Math.PI / 2 + time * 2;
      ctx.beginPath();
      ctx.arc(0, 0, r, a + 0.15, a + 0.9);
      ctx.stroke();
    }
    ctx.globalAlpha = 0.55;
  }

  ctx.rotate(angle);
  const flash =
    !isPlayer &&
    tank.hp < tank.maxHp &&
    Math.floor(time * 9) % 2 === 0;
  const bodyColor = flash ? '#ff8a70' : accent.body;
  const trackColor = accent.track;

  ctx.fillStyle = trackColor;
  roundedRect(ctx, -16, -17, 8, 34, 2);
  ctx.fill();
  roundedRect(ctx, 8, -17, 8, 34, 2);
  ctx.fill();

  const treadOffset = tank.moving ? (tank.anim * 26) % 6 : 0;
  ctx.fillStyle = 'rgba(15, 20, 24, 0.72)';
  for (let i = 0; i < 6; i += 1) {
    const ty = -15 + ((i * 6 + treadOffset) % 32);
    ctx.fillRect(-15, ty, 6, 2);
    ctx.fillRect(9, ty, 6, 2);
  }

  ctx.fillStyle = '#1b252b';
  roundedRect(ctx, -10, -16, 20, 32, 3);
  ctx.fill();
  ctx.fillStyle = bodyColor;
  roundedRect(ctx, -8, -15, 16, 29, 3);
  ctx.fill();
  ctx.fillStyle = 'rgba(255, 255, 255, 0.2)';
  ctx.fillRect(-6, -13, 12, 2);
  ctx.fillStyle = 'rgba(20, 30, 35, 0.28)';
  ctx.fillRect(-6, 8, 12, 4);

  ctx.fillStyle = accent.accent;
  ctx.fillRect(-2, -23, 4, 14);
  ctx.fillStyle = bodyColor;
  ctx.beginPath();
  ctx.arc(0, 0, 8, 0, Math.PI * 2);
  ctx.fill();
  ctx.strokeStyle = 'rgba(26, 36, 40, 0.75)';
  ctx.lineWidth = 2;
  ctx.stroke();
  ctx.fillStyle = accent.accent;
  ctx.beginPath();
  ctx.arc(0, 0, 3.2, 0, Math.PI * 2);
  ctx.fill();

  if (tank.enemyKind === 'armor') {
    ctx.strokeStyle = 'rgba(255, 232, 180, 0.7)';
    ctx.lineWidth = 1.5;
    ctx.strokeRect(-11.5, -16.5, 23, 33);
    ctx.fillStyle = 'rgba(255, 232, 180, 0.6)';
    ctx.fillRect(-15, -19, 3, 3);
    ctx.fillRect(12, -19, 3, 3);
  }

  if (tank.faction === 'enemy' && tank.enemyKind === 'power') {
    ctx.fillStyle = 'rgba(60, 160, 90, 0.85)';
    ctx.fillRect(-5, -12, 10, 2);
  }

  ctx.restore();

  if (tank.shieldTimer > 0) {
    const alpha = 0.35 + Math.sin(time * 7) * 0.12;
    ctx.save();
    ctx.translate(tank.x, tank.y);
    ctx.rotate(time * 0.9);
    ctx.strokeStyle = `rgba(120, 237, 255, ${alpha + 0.25})`;
    ctx.lineWidth = 2;
    ctx.setLineDash([7, 6]);
    ctx.beginPath();
    ctx.arc(0, 0, 24, 0, Math.PI * 2);
    ctx.stroke();
    ctx.setLineDash([]);
    ctx.strokeStyle = `rgba(199, 252, 255, ${alpha})`;
    ctx.beginPath();
    ctx.arc(0, 0, 20.5, 0, Math.PI * 2);
    ctx.stroke();
    ctx.restore();
  }

  if (isPlayer && tank.powerLevel > 0) {
    const startX = tank.x - (tank.powerLevel - 1) * 5;
    for (let i = 0; i < tank.powerLevel; i += 1) {
      ctx.fillStyle = '#ffe16a';
      ctx.strokeStyle = 'rgba(90, 64, 12, 0.8)';
      ctx.lineWidth = 1;
      drawStar(ctx, startX + i * 10, tank.y - 27, 4.5);
      ctx.fill();
      ctx.stroke();
    }
  }

  if (!isPlayer && tank.maxHp > 1) {
    const pipWidth = 7;
    const total = tank.maxHp * (pipWidth + 2);
    for (let i = 0; i < tank.maxHp; i += 1) {
      ctx.fillStyle = i < tank.hp ? '#ffd36c' : 'rgba(255, 255, 255, 0.16)';
      ctx.fillRect(tank.x - total / 2 + i * (pipWidth + 2), tank.y - 25, pipWidth, 3);
    }
  }
}

function drawBullet(ctx, bullet, time) {
  const isPlayer = bullet.faction === 'player';
  const core = isPlayer ? '#fff4b0' : '#ffb277';
  const glow = isPlayer ? 'rgba(255, 224, 105, 0.4)' : 'rgba(255, 122, 82, 0.4)';
  const tail = 13;
  ctx.strokeStyle = glow;
  ctx.lineWidth = 5;
  ctx.lineCap = 'round';
  ctx.beginPath();
  ctx.moveTo(bullet.x - bullet.dx * tail, bullet.y - bullet.dy * tail);
  ctx.lineTo(bullet.x, bullet.y);
  ctx.stroke();
  ctx.fillStyle = core;
  ctx.beginPath();
  ctx.arc(bullet.x, bullet.y, 4, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = 'rgba(255, 255, 255, 0.9)';
  ctx.beginPath();
  ctx.arc(bullet.x - bullet.dx * 1.2, bullet.y - bullet.dy * 1.2, 1.7, 0, Math.PI * 2);
  ctx.fill();
}

function drawPowerup(ctx, powerup, time) {
  const bob = Math.sin(time * 3 + powerup.x * 0.02) * 2;
  const fade = powerup.life < 4 ? 0.45 + Math.abs(Math.sin(time * 8)) * 0.55 : 1;
  const def = POWERUP_DEFS[powerup.type];
  ctx.save();
  ctx.globalAlpha = fade;
  ctx.translate(powerup.x, powerup.y + bob);
  ctx.fillStyle = 'rgba(4, 10, 12, 0.85)';
  roundedRect(ctx, -16, -16, 32, 32, 5);
  ctx.fill();
  ctx.strokeStyle = def.color;
  ctx.lineWidth = 2;
  roundedRect(ctx, -16, -16, 32, 32, 5);
  ctx.stroke();
  const glow = ctx.createRadialGradient(0, 0, 2, 0, 0, 25);
  glow.addColorStop(0, `${def.color}55`);
  glow.addColorStop(1, `${def.color}00`);
  ctx.fillStyle = glow;
  ctx.fillRect(-25, -25, 50, 50);
  drawPowerupIcon(ctx, powerup.type, def.color, time);
  ctx.restore();
}

function drawPowerupIcon(ctx, type, color, time) {
  ctx.save();
  ctx.strokeStyle = color;
  ctx.fillStyle = color;
  ctx.lineWidth = 2;
  if (type === POWERUP_TYPE.STAR) {
    drawStar(ctx, 0, 0, 10);
    ctx.fill();
    ctx.strokeStyle = 'rgba(103, 72, 8, 0.7)';
    ctx.lineWidth = 1;
    ctx.stroke();
  } else if (type === POWERUP_TYPE.HELMET) {
    ctx.beginPath();
    ctx.arc(0, 1, 9, Math.PI, 0);
    ctx.lineTo(9, 7);
    ctx.lineTo(-9, 7);
    ctx.closePath();
    ctx.fill();
    ctx.fillStyle = '#0b2026';
    ctx.fillRect(-9, 6, 18, 3);
    ctx.fillRect(-2, -8, 4, 4);
  } else if (type === POWERUP_TYPE.GRENADE) {
    ctx.beginPath();
    ctx.arc(0, 3, 9, 0, Math.PI * 2);
    ctx.fill();
    ctx.strokeStyle = color;
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(2, -6);
    ctx.lineTo(7, -11);
    ctx.stroke();
    ctx.fillStyle = '#ffe58a';
    ctx.beginPath();
    ctx.arc(7, -11, 2.3, 0, Math.PI * 2);
    ctx.fill();
  } else if (type === POWERUP_TYPE.CLOCK) {
    ctx.beginPath();
    ctx.arc(0, 0, 10, 0, Math.PI * 2);
    ctx.stroke();
    ctx.beginPath();
    ctx.moveTo(0, 0);
    ctx.lineTo(0, -6);
    ctx.moveTo(0, 0);
    ctx.lineTo(5, 2);
    ctx.stroke();
    ctx.fillStyle = 'rgba(255, 255, 255, 0.5)';
    ctx.fillRect(-1, -11, 2, 2);
  } else if (type === POWERUP_TYPE.SHOVEL) {
    ctx.save();
    ctx.rotate(Math.PI / 4);
    ctx.fillRect(-2, -10, 4, 14);
    ctx.beginPath();
    ctx.moveTo(-8, 4);
    ctx.lineTo(8, 4);
    ctx.lineTo(5, 12);
    ctx.lineTo(-5, 12);
    ctx.closePath();
    ctx.fill();
    ctx.restore();
  } else if (type === POWERUP_TYPE.LIFE) {
    ctx.beginPath();
    ctx.moveTo(0, 9);
    ctx.bezierCurveTo(-13, 0, -9, -10, -2, -7);
    ctx.bezierCurveTo(0, -6, 0, -4, 0, -4);
    ctx.bezierCurveTo(0, -4, 0, -6, 2, -7);
    ctx.bezierCurveTo(9, -10, 13, 0, 0, 9);
    ctx.fill();
    ctx.fillStyle = 'rgba(255, 255, 255, 0.55)';
    ctx.fillRect(-5, -5, 3, 3);
  }
  ctx.restore();
}

function drawBanner(ctx, text, x, y, color = '#f6f0d8') {
  ctx.save();
  ctx.font = 'bold 15px "Courier New", monospace';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  const width = Math.max(160, ctx.measureText(text).width + 34);
  ctx.fillStyle = 'rgba(4, 9, 10, 0.78)';
  roundedRect(ctx, x - width / 2, y - 15, width, 30, 4);
  ctx.fill();
  ctx.strokeStyle = 'rgba(129, 196, 180, 0.45)';
  ctx.lineWidth = 1;
  roundedRect(ctx, x - width / 2, y - 15, width, 30, 4);
  ctx.stroke();
  ctx.fillStyle = color;
  ctx.fillText(text, x, y + 1);
  ctx.restore();
}

export class Renderer {
  constructor(canvas, game) {
    this.canvas = canvas;
    this.game = game;
    this.ctx = canvas.getContext('2d');
    this.dpr = Math.min(2, window.devicePixelRatio || 1);
    this.resize();
    window.addEventListener('resize', () => this.resize());
  }

  resize() {
    this.dpr = Math.min(2, window.devicePixelRatio || 1);
    this.canvas.width = Math.floor(ARENA * this.dpr);
    this.canvas.height = Math.floor(ARENA * this.dpr);
    this.canvas.style.aspectRatio = '1 / 1';
  }

  render() {
    const ctx = this.ctx;
    const game = this.game;
    ctx.setTransform(this.dpr, 0, 0, this.dpr, 0, 0);
    ctx.imageSmoothingEnabled = false;

    const background = ctx.createLinearGradient(0, 0, ARENA, ARENA);
    background.addColorStop(0, '#07110f');
    background.addColorStop(0.55, '#091411');
    background.addColorStop(1, '#06100e');
    ctx.fillStyle = background;
    ctx.fillRect(0, 0, ARENA, ARENA);

    ctx.save();
    if (game.shake > 0.2) {
      const amount = game.shake;
      ctx.translate((Math.random() - 0.5) * amount, (Math.random() - 0.5) * amount);
    }

    this.drawMap(ctx);
    paintBase(ctx, game.base, game.time, !game.base.alive);
    this.drawPowerups(ctx);
    this.drawTanks(ctx);
    this.drawTrees(ctx);
    this.drawBullets(ctx);
    this.drawParticles(ctx);
    this.drawFloats(ctx);
    this.drawModeEffects(ctx);
    ctx.restore();

    this.drawOverlay(ctx);
    this.drawVignette(ctx);
  }

  drawMap(ctx) {
    const { map, time } = this.game;
    for (let r = 0; r < GRID; r += 1) {
      for (let c = 0; c < GRID; c += 1) {
        const type = map[r][c];
        paintTile(ctx, c * TILE, r * TILE, type, time);
      }
    }
  }

  drawTrees(ctx) {
    const { map, time } = this.game;
    for (let r = 0; r < GRID; r += 1) {
      for (let c = 0; c < GRID; c += 1) {
        if (map[r][c] === TILE_TYPE.TREE) paintTree(ctx, c * TILE, r * TILE, time);
      }
    }
  }

  drawPowerups(ctx) {
    for (const powerup of this.game.powerups) drawPowerup(ctx, powerup, this.game.time);
  }

  drawTanks(ctx) {
    for (const enemy of this.game.enemies) {
      if (enemy.alive) drawTank(ctx, enemy, this.game.time);
    }
    for (const player of this.game.players) {
      if (player.alive) drawTank(ctx, player, this.game.time);
    }
  }

  drawBullets(ctx) {
    for (const bullet of this.game.bullets) {
      if (bullet.alive) drawBullet(ctx, bullet, this.game.time);
    }
  }

  drawParticles(ctx) {
    for (const particle of this.game.particles) {
      const alpha = Math.max(0, Math.min(1, particle.life / Math.max(0.01, particle.maxLife)));
      ctx.globalAlpha = alpha;
      ctx.fillStyle = particle.color;
      ctx.fillRect(particle.x - particle.size / 2, particle.y - particle.size / 2, particle.size, particle.size);
    }
    ctx.globalAlpha = 1;
  }

  drawFloats(ctx) {
    for (const text of this.game.floatTexts) {
      const alpha = Math.max(0, Math.min(1, text.life / 0.5));
      ctx.globalAlpha = alpha;
      ctx.font = 'bold 12px "Courier New", monospace';
      ctx.textAlign = 'center';
      ctx.fillStyle = 'rgba(0, 0, 0, 0.65)';
      ctx.fillText(text.text, text.x + 1, text.y + 1);
      ctx.fillStyle = text.color;
      ctx.fillText(text.text, text.x, text.y);
    }
    ctx.globalAlpha = 1;
  }

  drawModeEffects(ctx) {
    const game = this.game;
    if (game.enemyFreezeTimer > 0) {
      ctx.fillStyle = 'rgba(104, 188, 255, 0.075)';
      ctx.fillRect(0, 0, ARENA, ARENA);
      ctx.save();
      ctx.strokeStyle = 'rgba(144, 220, 255, 0.25)';
      ctx.lineWidth = 2;
      ctx.setLineDash([12, 10]);
      ctx.lineDashOffset = -game.time * 20;
      ctx.strokeRect(4, 4, ARENA - 8, ARENA - 8);
      ctx.restore();
      for (let i = 0; i < 7; i += 1) {
        const x = (i * 97 + game.time * 12) % ARENA;
        const y = (i * 61 + Math.sin(game.time + i) * 20 + 40) % ARENA;
        ctx.strokeStyle = 'rgba(190, 240, 255, 0.14)';
        ctx.beginPath();
        ctx.moveTo(x - 6, y);
        ctx.lineTo(x + 6, y);
        ctx.moveTo(x, y - 6);
        ctx.lineTo(x, y + 6);
        ctx.stroke();
      }
    }
  }

  drawOverlay(ctx) {
    const game = this.game;
    if (game.introTimer > 0 && game.state === 'playing') {
      const progress = 1 - game.introTimer / 1.35;
      const fade = Math.min(1, progress * 4, game.introTimer * 3);
      ctx.save();
      ctx.globalAlpha = Math.max(0, Math.min(1, fade));
      const overlay = ctx.createLinearGradient(0, 220, 0, 380);
      overlay.addColorStop(0, 'rgba(4, 12, 11, 0)');
      overlay.addColorStop(0.5, 'rgba(4, 12, 11, 0.88)');
      overlay.addColorStop(1, 'rgba(4, 12, 11, 0)');
      ctx.fillStyle = overlay;
      ctx.fillRect(0, 220, ARENA, 160);
      ctx.textAlign = 'center';
      ctx.fillStyle = '#f5eccd';
      ctx.font = 'bold 44px "Courier New", monospace';
      ctx.fillText(`STAGE ${String(game.stage).padStart(2, '0')}`, ARENA / 2, 305);
      ctx.font = 'bold 14px "Courier New", monospace';
      ctx.fillStyle = '#9fd8c7';
      ctx.fillText(game.levelLabel, ARENA / 2, 336);
      ctx.strokeStyle = 'rgba(140, 215, 190, 0.6)';
      ctx.beginPath();
      ctx.moveTo(200, 352);
      ctx.lineTo(400, 352);
      ctx.stroke();
      ctx.restore();
    }

    if (game.notice && game.state !== 'menu') {
      drawBanner(ctx, game.notice.text, ARENA / 2, 26);
    }

    if (game.enemyFreezeTimer > 0 && game.state === 'playing') {
      drawBanner(
        ctx,
        `敌军冻结 ${game.enemyFreezeTimer.toFixed(1)}s`,
        ARENA / 2,
        55,
        '#bfe9ff',
      );
    }
    if (game.shovelTimer > 0 && game.state === 'playing') {
      drawBanner(
        ctx,
        `钢铁基地 ${Math.ceil(game.shovelTimer)}s`,
        ARENA - 112,
        26,
        '#d7e3ef',
      );
    }
  }

  drawVignette(ctx) {
    const gradient = ctx.createRadialGradient(ARENA / 2, ARENA / 2, ARENA * 0.3, ARENA / 2, ARENA / 2, ARENA * 0.75);
    gradient.addColorStop(0, 'rgba(0, 0, 0, 0)');
    gradient.addColorStop(1, 'rgba(0, 0, 0, 0.45)');
    ctx.fillStyle = gradient;
    ctx.fillRect(0, 0, ARENA, ARENA);
    ctx.strokeStyle = 'rgba(138, 204, 180, 0.18)';
    ctx.lineWidth = 2;
    ctx.strokeRect(1, 1, ARENA - 2, ARENA - 2);
  }
}

export { drawStar, roundedRect };

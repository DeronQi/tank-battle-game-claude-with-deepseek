import { AudioManager } from './audio.js';
import { InputManager } from './input.js';
import { Game } from './game.js';
import { Renderer } from './renderer.js';
import { LevelEditor } from './editor.js';
import {
  deserializeLevel,
  loadSavedLevels,
  saveSavedLevels,
  serializeLevel,
} from './levels.js';

const $ = (selector) => document.querySelector(selector);

const els = {
  startScreen: $('#start-screen'),
  editorScreen: $('#editor-screen'),
  helpModal: $('#help-modal'),
  gameOverlay: $('#game-overlay'),
  toast: $('#toast'),
  modeChip: $('#mode-chip'),
  soundBtn: $('#sound-btn'),
  helpBtn: $('#help-btn'),
  homeBtn: $('#home-btn'),
  pauseBtn: $('#pause-btn'),
  hudMenuBtn: $('#hud-menu-btn'),
  hudStage: $('#hud-stage'),
  hudLevel: $('#hud-level'),
  hudMode: $('#hud-mode'),
  hudEnemies: $('#hud-enemies'),
  hudEnemyIcons: $('#hud-enemy-icons'),
  hudPlayers: $('#hud-players'),
  hudEffects: $('#hud-effects'),
  hudScoreTotal: $('#hud-score-total'),
  controlP2: $('#control-p2'),
  controlAiNote: $('#control-ai-note'),
  humanControls: document.querySelectorAll('.human-control-row'),
  boardHint: $('#board-hint'),
  boardHint2: $('#board-hint-2'),
  boardSepP2: $('#board-sep-p2'),
  editorCanvas: $('#editor-canvas'),
  editorName: $('#editor-name'),
  editorCount: $('#editor-count'),
  mixBasic: $('#mix-basic'),
  mixFast: $('#mix-fast'),
  mixPower: $('#mix-power'),
  mixArmor: $('#mix-armor'),
  savedLevels: $('#saved-levels'),
  levelJson: $('#level-json'),
  toolGrid: $('#tool-grid'),
};

const audio = new AudioManager();
const input = new InputManager();
const game = new Game({ audio, input });
const renderer = new Renderer($('#game-canvas'), game);

let toastTimer = null;
let helpOpen = false;

function showToast(message) {
  els.toast.textContent = message;
  els.toast.classList.remove('hidden');
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => els.toast.classList.add('hidden'), 2400);
}

const editor = new LevelEditor({
  canvas: els.editorCanvas,
  onToast: showToast,
});

const MODE_LABELS = {
  '1p': '单人闯关',
  '2p': '双人合作',
  ai1: 'AI 演示 · 1P',
  ai2: 'AI 演示 · 2P',
};

function updateSoundLabel() {
  els.soundBtn.textContent = audio.muted ? '♪ 音效关' : '♪ 音效开';
  els.soundBtn.setAttribute('aria-pressed', audio.muted ? 'false' : 'true');
}

function setStartVisible(visible) {
  els.startScreen.classList.toggle('hidden', !visible);
}

function updateInputEnabled() {
  const inGame = game.state === 'playing' || game.state === 'paused';
  input.setEnabled(inGame && !helpOpen && !editor.active);
}

function syncTopBar() {
  if (editor.active) {
    els.modeChip.textContent = '关卡编辑器';
    return;
  }
  if (game.state === 'menu') {
    els.modeChip.textContent = '等待出击';
    return;
  }
  els.modeChip.textContent = MODE_LABELS[game.mode] ?? game.getModeLabel();
}

function scoreText(value) {
  return String(Math.max(0, value)).padStart(6, '0');
}

function totalScore() {
  return game.scores.reduce((sum, value) => sum + value, 0);
}

function playerStatus(player) {
  if (player.eliminated) return '<span class="dead">已退出</span>';
  if (!player.alive) return '<span class="dead">等待重生</span>';
  if (player.isAI) return '<span class="ai">AI 自主作战</span>';
  return '<span class="alive">作战中</span>';
}

function playerCardHTML(player, index) {
  const accent = index === 0 ? 'p1' : 'p2';
  const lives = Math.max(0, player.lives);
  const slots = Math.max(3, Math.min(5, lives));
  const lifeBlocks = Array.from({ length: slots }, (_, i) => {
    return `<i class="life-block ${i < lives ? '' : 'lost'}"></i>`;
  }).join('');
  const stars = Array.from({ length: 3 }, (_, i) => {
    return `<span class="power-star ${i < player.powerLevel ? 'lit' : ''}">★</span>`;
  }).join('');
  const shield =
    player.shieldTimer > 0 ? `<span style="color:var(--cyan)">护盾 ${player.shieldTimer.toFixed(1)}s</span>` : '';
  return `
    <div class="player-hud ${accent} ${player.eliminated ? 'eliminated' : ''}">
      <div class="player-hud-head">
        <b>P${index + 1}</b>
        ${player.isAI ? '<span class="player-tag">AI</span>' : ''}
        <span class="player-score">${scoreText(game.scores[index])}</span>
      </div>
      <div class="player-hud-main">
        <div class="player-lives"><span>×${lives}</span>${lifeBlocks}</div>
        <div class="player-power">${stars}</div>
      </div>
      <div class="player-status"><span>${playerStatus(player)}</span>${shield}</div>
    </div>
  `;
}

let lastHudKey = '';
let lastEnemyIconKey = '';

function syncHud() {
  const stage = String(game.stage).padStart(2, '0');
  const total = game.currentLevel?.enemyCount ?? 0;
  const remaining = game.remainingEnemies;
  const players = game.players;
  const hudKey = [
    stage,
    game.currentLevel?.name,
    game.mode,
    remaining,
    total,
    game.state,
    players.map((p) => `${p.lives}|${p.powerLevel}|${p.alive}|${p.eliminated}|${p.shieldTimer.toFixed(1)}`).join(','),
    game.scores.join(','),
    game.enemyFreezeTimer.toFixed(1),
    game.shovelTimer.toFixed(1),
  ].join('~');

  if (hudKey !== lastHudKey) {
    lastHudKey = hudKey;
    els.hudStage.textContent = stage;
    els.hudLevel.textContent = game.currentLevel?.name ?? '未知战场';
    els.hudMode.textContent = MODE_LABELS[game.mode] ?? game.getModeLabel();
    els.hudEnemies.textContent = String(remaining).padStart(2, '0');
    els.hudPlayers.innerHTML = players.length
      ? players.map((player, index) => playerCardHTML(player, index)).join('')
      : '<div class="empty-effect">等待玩家出击</div>';
    els.hudScoreTotal.textContent = `SCORE ${scoreText(totalScore())}`;

    const effects = [];
    if (game.state === 'paused') effects.push('<span class="effect-chip gold">战场暂停</span>');
    if (game.enemyFreezeTimer > 0) {
      effects.push(`<span class="effect-chip">敌军冻结 ${game.enemyFreezeTimer.toFixed(1)}s</span>`);
    }
    if (game.shovelTimer > 0) {
      effects.push(`<span class="effect-chip gold">钢铁基地 ${Math.ceil(game.shovelTimer)}s</span>`);
    }
    for (const player of players) {
      if (player.shieldTimer > 0) {
        effects.push(
          `<span class="effect-chip">P${player.playerIndex + 1} 护盾 ${player.shieldTimer.toFixed(1)}s</span>`,
        );
      }
    }
    els.hudEffects.innerHTML = effects.length
      ? effects.join('')
      : '<span class="empty-effect">战场平静</span>';

    if (remaining !== game.currentLevel?.enemyCount || total) {
      const iconKey = `${remaining}/${total}`;
      if (iconKey !== lastEnemyIconKey) {
        lastEnemyIconKey = iconKey;
        els.hudEnemyIcons.innerHTML = Array.from({ length: total }, (_, index) => {
          return `<i class="enemy-mini ${index < remaining ? '' : 'cleared'}"></i>`;
        }).join('');
      }
    }
  }

  const isTwoPlayer = game.playerCount === 2;
  els.humanControls.forEach((row) => row.classList.toggle('hidden', game.aiMode));
  els.controlAiNote.classList.toggle('hidden', !game.aiMode);
  els.controlP2.classList.toggle('hidden', game.aiMode || !isTwoPlayer);
  if (game.aiMode) {
    els.boardHint.textContent = 'AI 坦克正在自主寻路、走位与开火';
    els.boardHint2.textContent = '演示模式 · 成功或失败后自动进入下一关';
    els.boardHint2.classList.remove('hidden');
    els.boardSepP2.classList.remove('hidden');
  } else if (game.playerCount === 1) {
    els.boardHint.textContent = 'P1 · W A S D 移动 / J 射击';
    els.boardHint2.classList.add('hidden');
    els.boardSepP2.classList.add('hidden');
  } else {
    els.boardHint.textContent = 'P1 · W A S D 移动 / J 射击';
    els.boardHint2.textContent = 'P2 · 方向键移动 / 空格射击';
    els.boardHint2.classList.remove('hidden');
    els.boardSepP2.classList.remove('hidden');
  }
  els.pauseBtn.disabled = !(game.state === 'playing' || game.state === 'paused');
  els.pauseBtn.classList.toggle('hidden', game.state === 'menu');
  syncTopBar();
}

function overlayStatsHTML() {
  return `
    <div class="overlay-stats">
      <div class="overlay-stat"><span>STAGE</span><b>${String(game.stage).padStart(2, '0')}</b></div>
      <div class="overlay-stat"><span>TOTAL SCORE</span><b>${scoreText(totalScore())}</b></div>
    </div>
  `;
}

function renderOverlayForState(state) {
  if (state === 'playing' || state === 'menu') {
    els.gameOverlay.classList.add('hidden');
    els.gameOverlay.innerHTML = '';
    return;
  }

  let html = '';
  if (state === 'paused') {
    html = `
      <div class="overlay-card">
        <div class="overlay-kicker">PAUSED · SYSTEM HOLD</div>
        <h2 class="overlay-title">战场暂停</h2>
        <p class="overlay-desc">${game.levelLabel} · ${MODE_LABELS[game.mode] ?? ''}<br />按 ESC 或 P 可继续战斗</p>
        <div class="overlay-actions">
          <button type="button" class="overlay-btn primary" data-overlay-action="resume">继续战斗</button>
          <button type="button" class="overlay-btn" data-overlay-action="retry">重开本关</button>
          <button type="button" class="overlay-btn ghost" data-overlay-action="menu">返回主菜单</button>
        </div>
      </div>
    `;
  } else if (state === 'stage-clear') {
    const auto = game.aiMode;
    html = `
      <div class="overlay-card">
        <div class="overlay-kicker">AREA SECURED · STAGE CLEAR</div>
        <h2 class="overlay-title green">关卡完成</h2>
        <p class="overlay-desc">${game.levelLabel} 已肃清。${auto ? '随机地形正在生成，AI 演示继续推进。' : '下一关将随机生成全新战场。'}</p>
        ${overlayStatsHTML()}
        ${
          auto
            ? `<p class="overlay-countdown" id="overlay-countdown">AI 演示将在 <b>${Math.max(1, Math.ceil(game.stateTimer))}</b> 秒后进入下一关</p>
               <div class="overlay-actions"><button type="button" class="overlay-btn ghost" data-overlay-action="menu">结束演示</button></div>`
            : `<div class="overlay-actions">
                 <button type="button" class="overlay-btn primary" data-overlay-action="next">进入下一关</button>
                 <button type="button" class="overlay-btn ghost" data-overlay-action="menu">返回主菜单</button>
               </div>`
        }
      </div>
    `;
  } else if (state === 'game-over') {
    const baseLost = game.gameOverReason === 'base';
    const auto = game.aiMode;
    html = `
      <div class="overlay-card">
        <div class="overlay-kicker">${baseLost ? 'BASE DESTROYED' : 'ALL TANKS LOST'}</div>
        <h2 class="overlay-title red">${baseLost ? '基地沦陷' : '全军覆没'}</h2>
        <p class="overlay-desc">${
          baseLost
            ? '指挥中心被击毁，防线彻底崩溃。'
            : '所有作战坦克均已损毁，战斗结束。'
        }${auto ? ' AI 演示将自动开启下一关。' : '调整策略，再次出击。'}</p>
        ${overlayStatsHTML()}
        ${
          auto
            ? `<p class="overlay-countdown" id="overlay-countdown">AI 演示将在 <b>${Math.max(1, Math.ceil(game.stateTimer))}</b> 秒后开启下一关</p>
               <div class="overlay-actions"><button type="button" class="overlay-btn ghost" data-overlay-action="menu">结束演示</button></div>`
            : `<div class="overlay-actions">
                 <button type="button" class="overlay-btn primary" data-overlay-action="retry">重新挑战</button>
                 <button type="button" class="overlay-btn" data-overlay-action="next">随机下一关</button>
                 <button type="button" class="overlay-btn ghost" data-overlay-action="menu">返回主菜单</button>
               </div>`
        }
      </div>
    `;
  }

  els.gameOverlay.innerHTML = html;
  els.gameOverlay.classList.remove('hidden');
}

function handleGameState(state) {
  if (state === 'menu') {
    setStartVisible(!editor.active);
  } else {
    setStartVisible(false);
  }
  if (state === 'playing' && document.activeElement instanceof HTMLElement) {
    document.activeElement.blur();
  }
  updateInputEnabled();
  renderOverlayForState(state);
  syncHud();
}

game.onStateChange = handleGameState;

function startMode(mode) {
  audio.unlock();
  audio.click();
  editor.close();
  els.editorScreen.classList.add('hidden');
  setStartVisible(false);
  game.startNewSession(mode);
  updateInputEnabled();
}

function startCustomLevel(level, mode) {
  audio.unlock();
  audio.click();
  editor.close();
  els.editorScreen.classList.add('hidden');
  setStartVisible(false);
  game.startCustomLevel(level, mode);
  updateInputEnabled();
}

function returnToMenu() {
  audio.click();
  editor.close();
  els.editorScreen.classList.add('hidden');
  els.helpModal.classList.add('hidden');
  helpOpen = false;
  game.goToMenu();
  setStartVisible(true);
  updateInputEnabled();
  syncTopBar();
  syncHud();
}

document.querySelectorAll('[data-start-mode]').forEach((button) => {
  button.addEventListener('click', () => startMode(button.dataset.startMode));
});

els.homeBtn.addEventListener('click', () => {
  if (!editor.active) returnToMenu();
});
els.hudMenuBtn.addEventListener('click', returnToMenu);

els.pauseBtn.addEventListener('click', () => {
  if (game.state === 'playing' || game.state === 'paused') {
    audio.click();
    game.togglePause();
    els.pauseBtn.blur();
  }
});

input.onPause(() => {
  if (game.state === 'playing' || game.state === 'paused') {
    audio.click();
    game.togglePause();
  }
});

els.gameOverlay.addEventListener('click', (event) => {
  const button = event.target.closest('[data-overlay-action]');
  if (!button) return;
  const action = button.dataset.overlayAction;
  audio.click();
  if (action === 'resume') game.resume();
  else if (action === 'retry') game.retryStage();
  else if (action === 'next') game.nextStage();
  else if (action === 'menu') returnToMenu();
});

els.soundBtn.addEventListener('click', () => {
  audio.unlock();
  audio.toggleMuted();
  updateSoundLabel();
  if (!audio.muted) audio.click();
  els.soundBtn.blur();
});

function openHelp() {
  audio.unlock();
  if (game.state === 'playing') game.pause();
  helpOpen = true;
  els.helpModal.classList.remove('hidden');
  updateInputEnabled();
}

function closeHelp() {
  helpOpen = false;
  els.helpModal.classList.add('hidden');
  updateInputEnabled();
}

els.helpBtn.addEventListener('click', openHelp);
$('#menu-help-btn').addEventListener('click', openHelp);
$('#help-close-btn').addEventListener('click', closeHelp);
els.helpModal.addEventListener('click', (event) => {
  if (event.target === els.helpModal) closeHelp();
});

document.addEventListener('keydown', (event) => {
  if (event.code === 'Escape' && helpOpen) {
    event.preventDefault();
    closeHelp();
  }
});

/* ---------------- Editor ---------------- */

function setEditorTool(tool) {
  editor.setTool(tool);
  document.querySelectorAll('.tool-btn').forEach((button) => {
    button.classList.toggle('active', button.dataset.tool === tool);
  });
}

els.toolGrid.addEventListener('click', (event) => {
  const button = event.target.closest('.tool-btn');
  if (!button) return;
  setEditorTool(button.dataset.tool);
  audio.click();
});

function readEditorLevel() {
  const mixValues = {
    basic: Number(els.mixBasic.value) || 0,
    fast: Number(els.mixFast.value) || 0,
    power: Number(els.mixPower.value) || 0,
    armor: Number(els.mixArmor.value) || 0,
  };
  const count = Math.max(4, Math.min(30, Number(els.editorCount.value) || 14));
  return editor.getLevel({
    name: els.editorName.value.trim() || '我的关卡',
    enemyCount: count,
    enemyMix: mixValues,
  });
}

function applyLevelToFields(level) {
  els.editorName.value = level.name;
  els.editorCount.value = String(level.enemyCount);
  els.mixBasic.value = String(Math.round(level.enemyMix.basic * 100));
  els.mixFast.value = String(Math.round(level.enemyMix.fast * 100));
  els.mixPower.value = String(Math.round(level.enemyMix.power * 100));
  els.mixArmor.value = String(Math.round(level.enemyMix.armor * 100));
}

function openEditor() {
  audio.unlock();
  audio.click();
  setStartVisible(false);
  els.helpModal.classList.add('hidden');
  helpOpen = false;
  editor.open();
  game.goToMenu();
  els.editorScreen.classList.remove('hidden');
  input.setEnabled(false);
  syncTopBar();
  refreshSavedLevels();
}

function closeEditor() {
  editor.close();
  els.editorScreen.classList.add('hidden');
  setStartVisible(true);
  updateInputEnabled();
  syncTopBar();
}

$('#open-editor-btn').addEventListener('click', openEditor);
$('#editor-close-btn').addEventListener('click', closeEditor);

$('#editor-random-btn').addEventListener('click', () => {
  editor.randomize(4);
  audio.click();
});
$('#editor-clear-btn').addEventListener('click', () => {
  editor.clear();
  audio.click();
});
$('#editor-builtin-btn').addEventListener('click', () => {
  editor.loadBuiltin();
  audio.click();
});

$('#editor-play-1p').addEventListener('click', () => {
  startCustomLevel(readEditorLevel(), '1p');
});
$('#editor-play-2p').addEventListener('click', () => {
  startCustomLevel(readEditorLevel(), '2p');
});

function refreshSavedLevels(selectedId = null) {
  const levels = loadSavedLevels();
  if (!levels.length) {
    els.savedLevels.innerHTML = '<option value="">暂无保存关卡</option>';
    return;
  }
  els.savedLevels.innerHTML = levels
    .map((level) => {
      const id = level.id ?? level.name;
      return `<option value="${escapeHTML(id)}" ${id === selectedId ? 'selected' : ''}>${escapeHTML(level.name)} · ${level.enemyCount} 辆</option>`;
    })
    .join('');
}

function escapeHTML(value) {
  return String(value)
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;');
}

$('#editor-save-btn').addEventListener('click', () => {
  const level = readEditorLevel();
  const levels = loadSavedLevels();
  const existingIndex = levels.findIndex((item) => item.name === level.name);
  const id = existingIndex >= 0 ? levels[existingIndex].id : `custom-${Date.now()}`;
  const saved = { ...level, id };
  if (existingIndex >= 0) levels[existingIndex] = saved;
  else levels.unshift(saved);
  if (levels.length > 24) levels.length = 24;
  saveSavedLevels(levels);
  refreshSavedLevels(id);
  showToast(existingIndex >= 0 ? '关卡已更新' : '关卡已保存');
  audio.click();
});

$('#editor-load-btn').addEventListener('click', () => {
  const id = els.savedLevels.value;
  if (!id) return;
  const level = loadSavedLevels().find((item) => (item.id ?? item.name) === id);
  if (!level) return;
  editor.loadLevel(level);
  applyLevelToFields(level);
  showToast(`已载入「${level.name}」`);
  audio.click();
});

$('#editor-delete-btn').addEventListener('click', () => {
  const id = els.savedLevels.value;
  if (!id) return;
  const levels = loadSavedLevels();
  const target = levels.find((item) => (item.id ?? item.name) === id);
  if (!target) return;
  if (!window.confirm(`确定删除关卡「${target.name}」吗？`)) return;
  saveSavedLevels(levels.filter((item) => (item.id ?? item.name) !== id));
  refreshSavedLevels();
  showToast('关卡已删除');
  audio.click();
});

async function copyText(text) {
  try {
    await navigator.clipboard.writeText(text);
    return true;
  } catch {
    try {
      const helper = document.createElement('textarea');
      helper.value = text;
      helper.style.position = 'fixed';
      helper.style.opacity = '0';
      document.body.appendChild(helper);
      helper.select();
      const ok = document.execCommand('copy');
      helper.remove();
      return ok;
    } catch {
      return false;
    }
  }
}

$('#editor-export-btn').addEventListener('click', async () => {
  const json = JSON.stringify(serializeLevel(readEditorLevel()), null, 2);
  els.levelJson.value = json;
  const copied = await copyText(json);
  showToast(copied ? '关卡 JSON 已复制到剪贴板' : 'JSON 已生成，请手动复制');
  audio.click();
});

$('#editor-import-btn').addEventListener('click', () => {
  const text = els.levelJson.value.trim();
  if (!text) {
    showToast('请先粘贴关卡 JSON');
    return;
  }
  try {
    const level = deserializeLevel(text);
    editor.loadLevel(level);
    applyLevelToFields(level);
    showToast('关卡 JSON 导入成功');
    audio.click();
  } catch (error) {
    showToast(`导入失败：${error.message}`);
  }
});

$('#editor-download-btn').addEventListener('click', () => {
  const level = readEditorLevel();
  const json = JSON.stringify(serializeLevel(level), null, 2);
  const blob = new Blob([json], { type: 'application/json;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = `${level.name.replace(/[\\/:*?"<>|]/g, '_') || 'tank-level'}.json`;
  document.body.appendChild(link);
  link.click();
  link.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
  showToast('关卡 JSON 已下载');
  audio.click();
});

document.addEventListener('pointerdown', () => audio.unlock(), { once: true });
document.addEventListener('keydown', () => audio.unlock(), { once: true });
document.addEventListener('visibilitychange', () => {
  if (document.hidden && game.state === 'playing') game.pause();
});
window.addEventListener('blur', () => {
  if (game.state === 'playing') game.pause();
});

updateSoundLabel();
syncHud();
syncTopBar();
renderOverlayForState(game.state);
refreshSavedLevels();

let lastFrame = performance.now();

function frame(now) {
  const dt = Math.min(0.033, Math.max(0, (now - lastFrame) / 1000));
  lastFrame = now;

  game.update(dt);
  renderer.render();
  if (editor.active) editor.render();
  syncHud();

  if (
    game.aiMode &&
    (game.state === 'stage-clear' || game.state === 'game-over')
  ) {
    const countdown = $('#overlay-countdown');
    if (countdown) {
      const remaining = Math.max(0, Math.ceil(game.stateTimer));
      const b = countdown.querySelector('b');
      if (b && b.textContent !== String(remaining)) b.textContent = String(remaining);
    }
  }

  requestAnimationFrame(frame);
}

requestAnimationFrame(frame);

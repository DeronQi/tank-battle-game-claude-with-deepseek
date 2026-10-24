const PLAYER_BINDINGS = [
  {
    up: ['KeyW'],
    right: ['KeyD'],
    down: ['KeyS'],
    left: ['KeyA'],
    fire: ['KeyJ'],
  },
  {
    up: ['ArrowUp'],
    right: ['ArrowRight'],
    down: ['ArrowDown'],
    left: ['ArrowLeft'],
    fire: ['Space', 'Numpad0', 'Slash'],
  },
];

const BLOCKED_DEFAULT = new Set([
  'ArrowUp',
  'ArrowDown',
  'ArrowLeft',
  'ArrowRight',
  'Space',
  'Slash',
  'KeyW',
  'KeyA',
  'KeyS',
  'KeyD',
]);

const DIR_KEYS = {
  up: 'up',
  right: 'right',
  down: 'down',
  left: 'left',
};

export class InputManager {
  constructor() {
    this.keys = new Set();
    this.lastDirection = [null, null];
    this.enabled = false;
    this.pauseListeners = new Set();
    this.keyListeners = new Set();

    window.addEventListener('keydown', (event) => this.onKeyDown(event), { passive: false });
    window.addEventListener('keyup', (event) => this.onKeyUp(event));
    window.addEventListener('blur', () => this.keys.clear());
  }

  isTypingTarget(target) {
    const tag = target?.tagName;
    return tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT' || target?.isContentEditable;
  }

  onKeyDown(event) {
    if (this.isTypingTarget(event.target)) return;

    if (this.enabled && BLOCKED_DEFAULT.has(event.code)) event.preventDefault();
    if (event.repeat) return;
    if (event.code === 'Escape' || event.code === 'KeyP') {
      if (this.enabled) {
        event.preventDefault();
        for (const listener of this.pauseListeners) listener();
      }
      return;
    }

    this.keys.add(event.code);

    for (let pid = 0; pid < PLAYER_BINDINGS.length; pid += 1) {
      for (const [dir, codes] of Object.entries(DIR_KEYS)) {
        if (PLAYER_BINDINGS[pid][dir].some((code) => code === event.code)) {
          this.lastDirection[pid] = dir;
        }
      }
    }

    if (this.enabled) {
      for (const listener of this.keyListeners) listener(event.code);
    }
  }

  onKeyUp(event) {
    this.keys.delete(event.code);
  }

  setEnabled(value) {
    this.enabled = Boolean(value);
    if (!value) this.keys.clear();
  }

  onPause(listener) {
    this.pauseListeners.add(listener);
    return () => this.pauseListeners.delete(listener);
  }

  onKey(listener) {
    this.keyListeners.add(listener);
    return () => this.keyListeners.delete(listener);
  }

  down(codes) {
    return codes.some((code) => this.keys.has(code));
  }

  controlsForPlayer(index) {
    const binding = PLAYER_BINDINGS[index];
    if (!binding) return null;
    const controls = {
      up: this.down(binding.up),
      right: this.down(binding.right),
      down: this.down(binding.down),
      left: this.down(binding.left),
      fire: this.down(binding.fire),
      preferred: this.lastDirection[index],
    };
    const any = controls.up || controls.right || controls.down || controls.left;
    if (!any) controls.preferred = null;
    return controls;
  }

  static bindingLabels() {
    return [
      { move: 'W A S D', fire: 'J' },
      { move: '方向键', fire: '空格 / 0 / /' },
    ];
  }
}

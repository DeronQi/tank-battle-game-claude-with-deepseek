export class AudioManager {
  constructor() {
    this.ctx = null;
    this.master = null;
    this.muted = localStorage.getItem('tank-battle-muted') === '1';
    this.noiseBuffer = null;
  }

  unlock() {
    if (!this.ctx) {
      const AudioCtx = window.AudioContext || window.webkitAudioContext;
      if (!AudioCtx) return;
      this.ctx = new AudioCtx();
      this.master = this.ctx.createGain();
      this.master.gain.value = this.muted ? 0 : 0.3;
      this.master.connect(this.ctx.destination);
      this.noiseBuffer = this.createNoiseBuffer();
    }
    if (this.ctx.state === 'suspended') this.ctx.resume();
  }

  createNoiseBuffer() {
    const length = this.ctx.sampleRate * 0.5;
    const buffer = this.ctx.createBuffer(1, length, this.ctx.sampleRate);
    const data = buffer.getChannelData(0);
    for (let i = 0; i < length; i += 1) data[i] = Math.random() * 2 - 1;
    return buffer;
  }

  setMuted(muted) {
    this.muted = muted;
    localStorage.setItem('tank-battle-muted', muted ? '1' : '0');
    if (this.master) {
      this.master.gain.setTargetAtTime(muted ? 0 : 0.3, this.ctx.currentTime, 0.02);
    }
  }

  toggleMuted() {
    this.setMuted(!this.muted);
    return this.muted;
  }

  get ready() {
    return this.ctx && this.master && !this.muted;
  }

  tone(freq, duration, options = {}) {
    if (!this.ready) return;
    const {
      type = 'square',
      volume = 0.12,
      slideTo = null,
      delay = 0,
      attack = 0.005,
    } = options;
    const now = this.ctx.currentTime + delay;
    const osc = this.ctx.createOscillator();
    const gain = this.ctx.createGain();
    osc.type = type;
    osc.frequency.setValueAtTime(freq, now);
    if (slideTo != null) {
      osc.frequency.exponentialRampToValueAtTime(Math.max(20, slideTo), now + duration);
    }
    gain.gain.setValueAtTime(0.0001, now);
    gain.gain.linearRampToValueAtTime(volume, now + attack);
    gain.gain.exponentialRampToValueAtTime(0.0001, now + duration);
    osc.connect(gain);
    gain.connect(this.master);
    osc.start(now);
    osc.stop(now + duration + 0.02);
  }

  noise(duration, options = {}) {
    if (!this.ready) return;
    const { volume = 0.18, delay = 0, filter = 1200, type = 'lowpass' } = options;
    const now = this.ctx.currentTime + delay;
    const source = this.ctx.createBufferSource();
    source.buffer = this.noiseBuffer;
    const filterNode = this.ctx.createBiquadFilter();
    filterNode.type = type;
    filterNode.frequency.setValueAtTime(filter, now);
    const gain = this.ctx.createGain();
    gain.gain.setValueAtTime(volume, now);
    gain.gain.exponentialRampToValueAtTime(0.0001, now + duration);
    source.connect(filterNode);
    filterNode.connect(gain);
    gain.connect(this.master);
    source.start(now);
    source.stop(now + duration + 0.02);
  }

  shoot(player = true) {
    this.tone(player ? 280 : 190, 0.07, {
      type: 'square',
      volume: player ? 0.1 : 0.05,
      slideTo: player ? 120 : 90,
    });
  }

  brick() {
    this.noise(0.1, { volume: 0.12, filter: 2200 });
  }

  steel() {
    this.tone(1200, 0.06, { type: 'triangle', volume: 0.07, slideTo: 500 });
  }

  explode(big = false) {
    this.noise(big ? 0.5 : 0.26, {
      volume: big ? 0.32 : 0.2,
      filter: big ? 700 : 1100,
    });
    this.tone(big ? 90 : 140, big ? 0.36 : 0.2, {
      type: 'sawtooth',
      volume: big ? 0.15 : 0.08,
      slideTo: 40,
    });
  }

  powerup() {
    [523, 659, 784, 1046].forEach((freq, i) => {
      this.tone(freq, 0.13, { type: 'square', volume: 0.08, delay: i * 0.065 });
    });
  }

  playerHit() {
    this.tone(160, 0.4, { type: 'sawtooth', volume: 0.12, slideTo: 50 });
    this.noise(0.35, { volume: 0.18, filter: 800 });
  }

  spawn() {
    this.tone(440, 0.08, { type: 'triangle', volume: 0.06 });
    this.tone(660, 0.08, { type: 'triangle', volume: 0.06, delay: 0.06 });
  }

  stageClear() {
    [392, 523, 659, 784, 1046].forEach((freq, i) => {
      this.tone(freq, 0.22, { type: 'square', volume: 0.09, delay: i * 0.11 });
    });
  }

  gameOver() {
    [330, 294, 262, 196].forEach((freq, i) => {
      this.tone(freq, 0.28, { type: 'triangle', volume: 0.1, delay: i * 0.18 });
    });
  }

  click() {
    this.tone(680, 0.035, { type: 'square', volume: 0.04 });
  }

  freeze() {
    this.tone(900, 0.5, { type: 'sine', volume: 0.07, slideTo: 160 });
  }

  shield() {
    this.tone(540, 0.35, { type: 'sine', volume: 0.07, slideTo: 880 });
  }
}

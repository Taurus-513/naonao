(function (root) {
  const defaults = { fps: 8, scale: 1, startPosition: 'bottom-center', followCursor: false,
    blinkIntervalMs: [3000, 8000], blinkDurationMs: 120, idleVariants: true,
    sleepEnabled: true, alwaysOnTop: true, frameDisplayScale: { idle: { '4': 1.06 }, 'idle-tilt': Object.fromEntries(Array.from({length:8}, (_, i) => [String(i + 1), 1.09])) },
    sleepFrameDurationMs: 900, pettedFrameDurationMs: 300, draggedFrameDurationMs: 240, alertFrameDurationMs: 500 };
  const priority = ['idle', 'sleep', 'alert', 'petted', 'dragged'];
  const semantics = { idle: 1, blink: 2, sleep: 2, alert: 3, variant: 4 };
  class PetModel {
    constructor(config = defaults, random = Math.random) {
      this.config = config; this.random = random; this.active = new Map(); this.entered = new Map();
      this.blinkStarted = 0; this.variantStarted = 0; this.wakeFromEntry = null; this.wakeStarted = 0; this.wakeUntil = 0;
      this.time = 0; this.blinkUntil = 0; this.variantUntil = 0; this.near = false;
      this.nextBlink = this.range(config.blinkIntervalMs);
      this.nextEvent = this.range([20000, 40000]); this.nextVariant = this.range([7000, 15000]);
    }
    range([a, b]) { return a + this.random() * (b - a); }
    get state() { return [...priority].reverse().find(s => this.active.has(s)) || 'idle'; }
    get stateElapsed() { return this.time - (this.entered.get(this.state) ?? this.time); }
    enter(state, duration = Infinity) {
      if (!priority.includes(state)) throw new Error('Unknown state: ' + state);
      if (state !== 'idle') { this.wakeUntil = 0; this.active.set(state, this.time + duration); this.entered.set(state, this.time); }
      this.blinkUntil = 0; this.variantUntil = 0;
    }
    leave(state) {
      if (state === 'sleep' && this.state === 'sleep') {
        const elapsed = this.stateElapsed;
        this.wakeFromEntry = elapsed < 800 ? Math.min(7, Math.floor(elapsed / 100)) : null;
        this.wakeStarted = this.time;
        this.wakeUntil = this.time + (this.wakeFromEntry === null ? 800 : (this.wakeFromEntry + 1) * 100);
        this.blinkUntil = 0; this.variantUntil = 0;
      }
      this.active.delete(state); this.entered.delete(state);
    }
    proximity(near) {
      this.near = near;
      if (near) this.leave('sleep'); else this.leave('alert');
    }
    tick(dt) {
      const previousState = this.state;
      this.time += dt;
      for (const [state, until] of this.active) if (until <= this.time) this.leave(state);
      if (previousState !== 'idle' && this.state === 'idle') this.nextEvent = this.time + this.range([20000, 40000]);
      if (this.time >= this.nextBlink) {
        if (this.state === 'idle' && this.variantUntil > this.time) {
          this.nextBlink = this.variantUntil + 300;
        } else {
          if (this.state === 'idle' && this.wakeUntil <= this.time) { this.blinkStarted = this.time; this.blinkUntil = this.time + this.config.blinkDurationMs + 120; }
          this.nextBlink = this.time + this.range(this.config.blinkIntervalMs);
        }
      }
      if (this.time >= this.nextEvent) {
        if (this.state === 'idle' && this.wakeUntil <= this.time) {
          if (this.config.sleepEnabled && !this.near && this.random() < .5)
            this.enter('sleep', this.range([20000, 60000]));
          else this.enter('alert', 2500);
        }
        this.nextEvent = this.time + this.range([20000, 40000]);
      }
      if (this.time >= this.nextVariant) {
        if (this.state === 'idle' && this.blinkUntil > this.time) {
          this.nextVariant = this.blinkUntil + 300;
        } else {
          if (this.state === 'idle' && this.config.idleVariants && this.wakeUntil <= this.time) { this.variantStarted = this.time; this.variantUntil = this.time + 1800; }
          this.nextVariant = this.time + this.range([7000, 15000]);
        }
      }
    }
    get frame() {
      if (this.state === 'sleep') return semantics.sleep;
      if (this.state === 'alert') return semantics.alert;
      if (this.state !== 'idle') return semantics.idle;
      if (this.blinkUntil > this.time) return semantics.blink;
      return this.variantUntil > this.time ? semantics.variant : semantics.idle;
    }
  }
  const api = { defaults, priority, semantics, PetModel };
  if (typeof module !== 'undefined') module.exports = api; else root.PetLogic = api;
})(typeof window !== 'undefined' ? window : globalThis);

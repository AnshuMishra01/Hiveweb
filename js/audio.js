// HIVEMIND - Procedural Audio Engine (Web Audio API, zero external files)
// All sounds generated mathematically at runtime

let ctx = null;
let masterGain = null;
let muted = false;

function ensureCtx() {
  if (!ctx) {
    ctx = new (window.AudioContext || window.webkitAudioContext)();
    masterGain = ctx.createGain();
    masterGain.gain.value = 0.35;
    masterGain.connect(ctx.destination);
  }
  if (ctx.state === 'suspended') ctx.resume();
  return ctx;
}

export function toggleMute() {
  muted = !muted;
  if (masterGain) masterGain.gain.value = muted ? 0 : 0.35;
  return muted;
}

export function isMuted() { return muted; }

// ── Utility ────────────────────────────────────────────

function playTone(freq, duration, type = 'sine', volume = 0.3, delay = 0) {
  const ac = ensureCtx();
  const t = ac.currentTime + delay;

  const osc = ac.createOscillator();
  const gain = ac.createGain();

  osc.type = type;
  osc.frequency.setValueAtTime(freq, t);

  gain.gain.setValueAtTime(0, t);
  gain.gain.linearRampToValueAtTime(volume, t + 0.01);
  gain.gain.exponentialRampToValueAtTime(0.001, t + duration);

  osc.connect(gain);
  gain.connect(masterGain);

  osc.start(t);
  osc.stop(t + duration + 0.05);
}

function playNoise(duration, volume = 0.1, delay = 0) {
  const ac = ensureCtx();
  const t = ac.currentTime + delay;

  const bufferSize = ac.sampleRate * duration;
  const buffer = ac.createBuffer(1, bufferSize, ac.sampleRate);
  const data = buffer.getChannelData(0);
  for (let i = 0; i < bufferSize; i++) {
    data[i] = (Math.random() * 2 - 1) * Math.max(0, 1 - i / bufferSize);
  }

  const source = ac.createBufferSource();
  source.buffer = buffer;

  const gain = ac.createGain();
  gain.gain.setValueAtTime(volume, t);
  gain.gain.exponentialRampToValueAtTime(0.001, t + duration);

  const filter = ac.createBiquadFilter();
  filter.type = 'highpass';
  filter.frequency.value = 800;

  source.connect(filter);
  filter.connect(gain);
  gain.connect(masterGain);
  source.start(t);
}

// ── Game Sounds ────────────────────────────────────────

export function playMove() {
  playTone(220, 0.08, 'square', 0.08);
  playTone(330, 0.06, 'sine', 0.05, 0.02);
}

export function playBlocked() {
  playTone(110, 0.12, 'sawtooth', 0.06);
  playNoise(0.06, 0.04);
}

export function playUndo() {
  playTone(440, 0.06, 'sine', 0.1);
  playTone(330, 0.06, 'sine', 0.08, 0.06);
}

export function playReset() {
  playTone(330, 0.06, 'triangle', 0.08);
  playTone(220, 0.08, 'triangle', 0.06, 0.06);
  playTone(165, 0.1, 'triangle', 0.04, 0.12);
}

export function playAgentLand() {
  // Single agent reaches its target
  playTone(523, 0.1, 'sine', 0.12);
  playTone(659, 0.08, 'sine', 0.08, 0.08);
}

export function playWin() {
  // Victory fanfare - ascending arpeggio
  const notes = [523, 659, 784, 1047];
  notes.forEach((n, i) => {
    playTone(n, 0.2, 'sine', 0.15, i * 0.1);
    playTone(n * 0.5, 0.25, 'triangle', 0.06, i * 0.1);
  });
  // Shimmer
  playTone(1047, 0.5, 'sine', 0.08, 0.4);
  playTone(1319, 0.4, 'sine', 0.05, 0.45);
}

export function playLoseLife() {
  playTone(330, 0.15, 'sawtooth', 0.1);
  playTone(220, 0.2, 'sawtooth', 0.08, 0.12);
  playTone(165, 0.3, 'sawtooth', 0.06, 0.25);
  playNoise(0.15, 0.06, 0.1);
}

export function playGameOver() {
  const notes = [440, 370, 311, 220];
  notes.forEach((n, i) => {
    playTone(n, 0.3, 'sawtooth', 0.1, i * 0.15);
    playTone(n * 0.5, 0.4, 'triangle', 0.05, i * 0.15);
  });
  playNoise(0.4, 0.05, 0.5);
}

export function playClick() {
  playTone(660, 0.04, 'square', 0.06);
}

export function playPortal() {
  // Sci-fi whoosh
  const ac = ensureCtx();
  const t = ac.currentTime;
  const osc = ac.createOscillator();
  const gain = ac.createGain();

  osc.type = 'sine';
  osc.frequency.setValueAtTime(200, t);
  osc.frequency.exponentialRampToValueAtTime(1200, t + 0.15);
  osc.frequency.exponentialRampToValueAtTime(400, t + 0.3);

  gain.gain.setValueAtTime(0.1, t);
  gain.gain.exponentialRampToValueAtTime(0.001, t + 0.35);

  osc.connect(gain);
  gain.connect(masterGain);
  osc.start(t);
  osc.stop(t + 0.4);
}

export function playLevelStart() {
  playTone(330, 0.08, 'sine', 0.08);
  playTone(440, 0.08, 'sine', 0.08, 0.08);
}

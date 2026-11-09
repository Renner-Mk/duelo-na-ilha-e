// Sons sintetizados com Web Audio (sem arquivos). Preset curtos estilo arcade.
let ctx = null;
let muted = false;
try { muted = localStorage.getItem('duelo:mudo') === '1'; } catch { /* sem armazenamento */ }

export function unlock() {
  if (!ctx) {
    try { ctx = new (window.AudioContext || window.webkitAudioContext)(); } catch { ctx = null; }
  }
  if (ctx && ctx.state === 'suspended') ctx.resume();
}
export function toggleMute() {
  muted = !muted;
  try { localStorage.setItem('duelo:mudo', muted ? '1' : '0'); } catch { /* sem armazenamento */ }
  return muted;
}
export const isMuted = () => muted;

function tone(f0, f1, dur, type = 'square', vol = 0.14, delay = 0) {
  if (!ctx || muted) return;
  const t = ctx.currentTime + delay;
  const o = ctx.createOscillator();
  const g = ctx.createGain();
  o.type = type;
  o.frequency.setValueAtTime(f0, t);
  o.frequency.exponentialRampToValueAtTime(Math.max(20, f1), t + dur);
  g.gain.setValueAtTime(vol, t);
  g.gain.exponentialRampToValueAtTime(0.001, t + dur);
  o.connect(g).connect(ctx.destination);
  o.start(t);
  o.stop(t + dur + 0.02);
}

function noise(dur, vol = 0.2, delay = 0) {
  if (!ctx || muted) return;
  const t = ctx.currentTime + delay;
  const buf = ctx.createBuffer(1, Math.max(1, (ctx.sampleRate * dur) | 0), ctx.sampleRate);
  const d = buf.getChannelData(0);
  for (let i = 0; i < d.length; i++) d[i] = (Math.random() * 2 - 1) * (1 - i / d.length);
  const s = ctx.createBufferSource();
  const g = ctx.createGain();
  s.buffer = buf;
  g.gain.value = vol;
  s.connect(g).connect(ctx.destination);
  s.start(t);
}

export const sfx = {
  tap: () => tone(520, 620, 0.05, 'triangle', 0.1),
  select: () => tone(440, 760, 0.09, 'triangle', 0.12),
  confirm: () => tone(620, 780, 0.07, 'square', 0.09),
  move: () => tone(260, 520, 0.1, 'sine', 0.16),
  telegraph: () => tone(900, 600, 0.16, 'sawtooth', 0.08),
  punch: () => { noise(0.1, 0.25); tone(180, 50, 0.14, 'square', 0.2); },
  hit: () => tone(300, 90, 0.18, 'sawtooth', 0.14),
  bonk: () => { tone(120, 40, 0.2, 'square', 0.22); noise(0.06, 0.2); },
  hook: () => { tone(300, 1200, 0.16, 'sawtooth', 0.09); tone(1200, 300, 0.18, 'triangle', 0.09, 0.16); },
  pull: () => tone(700, 250, 0.14, 'triangle', 0.14),
  place: () => { tone(200, 60, 0.15, 'square', 0.18); noise(0.05, 0.15, 0.08); },
  rockBreak: () => { noise(0.22, 0.28); tone(150, 40, 0.22, 'sawtooth', 0.12); },
  whiff: () => noise(0.12, 0.08),
  spring: () => { tone(200, 900, 0.12, 'sine', 0.18); tone(900, 300, 0.2, 'triangle', 0.12, 0.1); },
  fall: () => tone(700, 60, 0.7, 'sine', 0.16),
  win: () => [523, 659, 784, 1047].forEach((f, i) => tone(f, f, 0.18, 'square', 0.12, i * 0.12)),
  draw: () => [440, 392, 349].forEach((f, i) => tone(f, f, 0.2, 'triangle', 0.14, i * 0.15)),
};

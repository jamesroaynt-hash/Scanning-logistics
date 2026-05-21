/**
 * Audio feedback for scans.
 * Uses the Web Audio API so we ship zero audio assets and get
 * instant, latency-free beeps — important when scanning fast.
 */
let ctx;

function getCtx() {
  if (!ctx) {
    ctx = new (window.AudioContext || window.webkitAudioContext)();
  }
  // Browsers suspend audio until a user gesture; resume on demand.
  if (ctx.state === 'suspended') ctx.resume();
  return ctx;
}

function tone(freq, duration, type = 'sine', when = 0) {
  const audio = getCtx();
  const osc = audio.createOscillator();
  const gain = audio.createGain();
  osc.type = type;
  osc.frequency.value = freq;
  osc.connect(gain);
  gain.connect(audio.destination);

  const start = audio.currentTime + when;
  gain.gain.setValueAtTime(0.0001, start);
  gain.gain.exponentialRampToValueAtTime(0.25, start + 0.01);
  gain.gain.exponentialRampToValueAtTime(0.0001, start + duration);

  osc.start(start);
  osc.stop(start + duration);
}

export const sounds = {
  /** Pleasant rising two-tone confirm. */
  success() {
    tone(880, 0.12, 'sine', 0);
    tone(1320, 0.16, 'sine', 0.1);
  },
  /** Harsh low buzz for "not found". */
  error() {
    tone(220, 0.3, 'sawtooth', 0);
    tone(180, 0.3, 'sawtooth', 0.12);
  },
  /** Soft warble for duplicate scan. */
  warning() {
    tone(660, 0.1, 'triangle', 0);
    tone(520, 0.14, 'triangle', 0.1);
  },
};

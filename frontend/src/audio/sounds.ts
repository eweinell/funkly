/**
 * Sound-Inventar (UI-SPEZIFIKATION.md §7): PTT-Klick, Squelch-Tail,
 * Leerlaufrauschen, Kanalwechsel-Beep, CH70-Fehlerton, DSC-Alarm, Klappen-Klack.
 * Alles synthetisch ueber Web Audio API — keine Asset-Dateien.
 *
 * Dieses Modul teilt sich den AudioContext mit radioFx.ts nicht (radioFx nutzt
 * einen eigenen, gekapselten Context) — beide oeffnen jeweils einen lazily
 * erzeugten Singleton-Context, das ist fuer kurze UI-Sounds unproblematisch.
 */

let ctx: AudioContext | undefined;

function getCtx(): AudioContext {
  if (!ctx) ctx = new AudioContext();
  return ctx;
}

/** Muss nach der ersten Nutzergeste aufgerufen werden (iOS-Regel, §6). */
export async function unlockAudio(): Promise<void> {
  const ac = getCtx();
  if (ac.state === "suspended") await ac.resume();
}

function tone(freq: number, durationMs: number, opts: { type?: OscillatorType; gain?: number; delayMs?: number } = {}) {
  const ac = getCtx();
  const osc = ac.createOscillator();
  const gain = ac.createGain();
  osc.type = opts.type ?? "sine";
  osc.frequency.value = freq;
  const t0 = ac.currentTime + (opts.delayMs ?? 0) / 1000;
  const g = opts.gain ?? 0.15;
  gain.gain.setValueAtTime(0, t0);
  gain.gain.linearRampToValueAtTime(g, t0 + 0.008);
  gain.gain.setValueAtTime(g, t0 + durationMs / 1000 - 0.02);
  gain.gain.linearRampToValueAtTime(0, t0 + durationMs / 1000);
  osc.connect(gain).connect(ac.destination);
  osc.start(t0);
  osc.stop(t0 + durationMs / 1000 + 0.02);
}

/** Klick beim Druecken der Sprechtaste. */
export function pttClick(): void {
  tone(1400, 18, { type: "square", gain: 0.12 });
}

/** Kurzer Squelch-Burst-Tail beim Loslassen/Ende einer Uebertragung. */
export function squelchTail(): void {
  const ac = getCtx();
  const dur = 0.16;
  const buf = ac.createBuffer(1, Math.floor(ac.sampleRate * dur), ac.sampleRate);
  const data = buf.getChannelData(0);
  for (let i = 0; i < data.length; i++) data[i] = (Math.random() * 2 - 1) * (1 - i / data.length);
  const src = ac.createBufferSource();
  src.buffer = buf;
  const bandpass = ac.createBiquadFilter();
  bandpass.type = "bandpass";
  bandpass.frequency.value = 1200;
  bandpass.Q.value = 0.7;
  const gain = ac.createGain();
  gain.gain.value = 0.5;
  src.connect(bandpass).connect(gain).connect(ac.destination);
  src.start();
}

let idleNoiseNode: { src: AudioBufferSourceNode; gain: GainNode } | undefined;

/** Leises Leerlaufrauschen ("offener Kanal") waehrend der Latenz-Lücke bis die
 *  Antwort beginnt (Latenz-Kaschierung, §7). Lauft bis stopIdleNoise(). */
export function startIdleNoise(level = 0.02): void {
  stopIdleNoise();
  const ac = getCtx();
  const buf = ac.createBuffer(1, ac.sampleRate * 2, ac.sampleRate);
  const data = buf.getChannelData(0);
  for (let i = 0; i < data.length; i++) data[i] = Math.random() * 2 - 1;
  const src = ac.createBufferSource();
  src.buffer = buf;
  src.loop = true;
  const bandpass = ac.createBiquadFilter();
  bandpass.type = "bandpass";
  bandpass.frequency.value = 1000;
  bandpass.Q.value = 0.5;
  const gain = ac.createGain();
  gain.gain.value = level;
  src.connect(bandpass).connect(gain).connect(ac.destination);
  src.start();
  idleNoiseNode = { src, gain };
}

export function stopIdleNoise(): void {
  if (!idleNoiseNode) return;
  try {
    idleNoiseNode.gain.gain.linearRampToValueAtTime(0, getCtx().currentTime + 0.08);
    idleNoiseNode.src.stop(getCtx().currentTime + 0.1);
  } catch {
    /* schon gestoppt */
  }
  idleNoiseNode = undefined;
}

/** Beep beim Kanalwechsel. */
export function channelBeep(): void {
  tone(880, 60, { gain: 0.14 });
}

/** Fehlerton bei gesperrtem PTT auf Kanal 70 (nur DSC). */
export function ch70ErrorTone(): void {
  tone(220, 90, { type: "square", gain: 0.16 });
  tone(180, 110, { type: "square", gain: 0.16, delayMs: 110 });
}

/** Auffaelliger DSC-Alarm-Zweiton (Distress-Alert/Ack, eingehender Alert). */
export function dscAlarm(repeats = 3): void {
  for (let i = 0; i < repeats; i++) {
    tone(1050, 140, { gain: 0.2, delayMs: i * 320 });
    tone(1400, 140, { gain: 0.2, delayMs: i * 320 + 160 });
  }
}

/** Klack beim Oeffnen/Schliessen der Distress-Klappe. */
export function flapClack(): void {
  tone(140, 30, { type: "square", gain: 0.22 });
}

/** Aufsteigender Warnton waehrend des 3-Sekunden-Countdowns der Distress-Taste. */
export function countdownTick(step: 0 | 1 | 2): void {
  tone(500 + step * 180, 100, { gain: 0.14 });
}

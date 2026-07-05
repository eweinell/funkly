/**
 * Wiedergabe der Gegenstelle mit Funkgeraete-Klang:
 * Bandpass ~300-3000 Hz, leichtes Grundrauschen, Squelch-Tail am Ende.
 */

let ctx: AudioContext | undefined;

function getCtx(): AudioContext {
  if (!ctx) ctx = new AudioContext();
  return ctx;
}

export interface RadioFxOptions {
  volume?: number; // 0..1
  noise?: number; // 0..1 Grundrauschen
}

export async function playRadio(audioBase64: string, opts: RadioFxOptions = {}): Promise<void> {
  const ac = getCtx();
  if (ac.state === "suspended") await ac.resume();

  const raw = atob(audioBase64);
  const bytes = new Uint8Array(raw.length);
  for (let i = 0; i < raw.length; i++) bytes[i] = raw.charCodeAt(i);
  const buffer = await ac.decodeAudioData(bytes.buffer.slice(0));

  const volume = opts.volume ?? 0.9;
  const noiseLevel = (opts.noise ?? 0.4) * 0.03;

  const src = ac.createBufferSource();
  src.buffer = buffer;

  const highpass = ac.createBiquadFilter();
  highpass.type = "highpass";
  highpass.frequency.value = 300;
  const lowpass = ac.createBiquadFilter();
  lowpass.type = "lowpass";
  lowpass.frequency.value = 3000;

  // leichte Kompression/Saettigung wie ein uebersteuerter Funklautsprecher
  const shaper = ac.createWaveShaper();
  shaper.curve = makeSaturationCurve(2.5);

  const gain = ac.createGain();
  gain.gain.value = volume;

  src.connect(highpass).connect(lowpass).connect(shaper).connect(gain).connect(ac.destination);

  // Grundrauschen waehrend der Uebertragung + kurzer Squelch-Tail
  const tailSeconds = 0.18;
  const noiseSrc = ac.createBufferSource();
  noiseSrc.buffer = makeNoiseBuffer(ac, buffer.duration + tailSeconds);
  const noiseGain = ac.createGain();
  const t0 = ac.currentTime;
  noiseGain.gain.setValueAtTime(noiseLevel, t0);
  // Squelch-Burst nach Ende der Sprache, dann hartes Schliessen
  noiseGain.gain.setValueAtTime(noiseLevel, t0 + buffer.duration);
  noiseGain.gain.linearRampToValueAtTime(noiseLevel * 6 + 0.02, t0 + buffer.duration + 0.05);
  noiseGain.gain.setValueAtTime(0, t0 + buffer.duration + tailSeconds);
  noiseSrc.connect(highpass);
  noiseSrc.connect(noiseGain).connect(ac.destination);

  return new Promise<void>((resolve) => {
    noiseSrc.onended = () => resolve();
    src.start();
    noiseSrc.start();
    noiseSrc.stop(t0 + buffer.duration + tailSeconds);
  });
}

function makeNoiseBuffer(ac: AudioContext, seconds: number): AudioBuffer {
  const length = Math.max(1, Math.floor(ac.sampleRate * seconds));
  const buf = ac.createBuffer(1, length, ac.sampleRate);
  const data = buf.getChannelData(0);
  for (let i = 0; i < length; i++) data[i] = Math.random() * 2 - 1;
  return buf;
}

function makeSaturationCurve(amount: number): Float32Array {
  const n = 1024;
  const curve = new Float32Array(n);
  for (let i = 0; i < n; i++) {
    const x = (i / (n - 1)) * 2 - 1;
    curve[i] = Math.tanh(amount * x) / Math.tanh(amount);
  }
  return curve;
}

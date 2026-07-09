/**
 * PTT-Aufnahme: Mikrofon -> AudioWorklet -> PCM16 @ 16 kHz mono.
 * start() beim Druecken der Sprechtaste, stop() beim Loslassen liefert die Chunks.
 *
 * Der AudioContext laeuft bewusst mit seiner NATIVEN Samplerate: Firefox liefert
 * aus einem MediaStreamAudioSourceNode keine Samples, wenn die Context-Rate von
 * der Stream-Rate abweicht (typisch 48 kHz). Das Resampling auf die von Amazon
 * Transcribe erwarteten 16 kHz passiert deshalb hier in JS.
 */

const TARGET_RATE = 16000;

const WORKLET_SOURCE = `
class PcmCapture extends AudioWorkletProcessor {
  process(inputs) {
    const ch = inputs[0] && inputs[0][0];
    if (ch && ch.length) {
      const copy = new Float32Array(ch);
      this.port.postMessage(copy.buffer, [copy.buffer]);
    }
    return true;
  }
}
registerProcessor("pcm-capture", PcmCapture);
`;

let workletUrl: string | undefined;
function getWorkletUrl(): string {
  if (!workletUrl) {
    workletUrl = URL.createObjectURL(new Blob([WORKLET_SOURCE], { type: "application/javascript" }));
  }
  return workletUrl;
}

/** Lineare Interpolation von srcRate auf TARGET_RATE, dann Float32 -> PCM16. */
function resampleToPcm16(input: Float32Array, srcRate: number): Int16Array {
  const ratio = srcRate / TARGET_RATE;
  const outLength = Math.floor(input.length / ratio);
  const out = new Int16Array(outLength);
  for (let i = 0; i < outLength; i++) {
    const pos = i * ratio;
    const i0 = Math.floor(pos);
    const i1 = Math.min(i0 + 1, input.length - 1);
    const frac = pos - i0;
    const sample = input[i0] * (1 - frac) + input[i1] * frac;
    const s = Math.max(-1, Math.min(1, sample));
    out[i] = s < 0 ? s * 0x8000 : s * 0x7fff;
  }
  return out;
}

export class PttRecorder {
  private ctx?: AudioContext;
  private stream?: MediaStream;
  private source?: MediaStreamAudioSourceNode;
  private node?: AudioWorkletNode;
  private sink?: GainNode;
  private chunks: Float32Array[] = [];
  private srcRate = TARGET_RATE;

  get recording(): boolean {
    return !!this.ctx;
  }

  async start(): Promise<void> {
    if (this.ctx) return;
    this.chunks = [];
    this.stream = await navigator.mediaDevices.getUserMedia({
      audio: { echoCancellation: true, noiseSuppression: true, channelCount: 1 },
    });
    this.ctx = new AudioContext();
    this.srcRate = this.ctx.sampleRate;
    if (this.ctx.state === "suspended") await this.ctx.resume();
    await this.ctx.audioWorklet.addModule(getWorkletUrl());
    this.source = this.ctx.createMediaStreamSource(this.stream);
    this.node = new AudioWorkletNode(this.ctx, "pcm-capture");
    this.node.port.onmessage = (e: MessageEvent<ArrayBuffer>) => {
      this.chunks.push(new Float32Array(e.data));
    };
    // Der Renderer zieht den Graphen von ctx.destination rueckwaerts: ohne Pfad
    // dorthin laeuft process() nie. Gain 0, damit das Mikrofon nicht mithoerbar wird.
    this.sink = this.ctx.createGain();
    this.sink.gain.value = 0;
    this.source.connect(this.node).connect(this.sink).connect(this.ctx.destination);

    const track = this.stream.getAudioTracks()[0];
    console.debug("[ptt] start", {
      ctxRate: this.ctx.sampleRate,
      ctxState: this.ctx.state,
      track: track?.label,
      trackRate: track?.getSettings().sampleRate,
      trackMuted: track?.muted,
      trackEnabled: track?.enabled,
    });
  }

  /** Beendet die Aufnahme und liefert PCM16-Chunks (16 kHz mono). */
  async stop(): Promise<Int16Array[]> {
    const raw = this.chunks;
    const srcRate = this.srcRate;
    this.source?.disconnect();
    this.node?.disconnect();
    this.sink?.disconnect();
    this.stream?.getTracks().forEach((t) => t.stop());
    await this.ctx?.close().catch(() => undefined);
    this.ctx = undefined;
    this.stream = undefined;
    this.source = undefined;
    this.node = undefined;
    this.sink = undefined;
    this.chunks = [];

    const total = raw.reduce((n, c) => n + c.length, 0);
    if (total === 0) {
      console.warn("[ptt] stop: worklet lieferte KEINE Samples (process() lief nicht)");
      return [];
    }
    const merged = new Float32Array(total);
    let offset = 0;
    for (const c of raw) {
      merged.set(c, offset);
      offset += c.length;
    }
    let peak = 0;
    for (let i = 0; i < merged.length; i++) {
      const a = Math.abs(merged[i]);
      if (a > peak) peak = a;
    }
    const pcm = resampleToPcm16(merged, srcRate);
    console.debug("[ptt] stop", {
      srcRate,
      srcSamples: total,
      srcSeconds: +(total / srcRate).toFixed(2),
      peak: +peak.toFixed(4),
      outSamples: pcm.length,
      outSeconds: +(pcm.length / TARGET_RATE).toFixed(2),
    });
    if (peak < 0.001) console.warn("[ptt] stop: Samples vorhanden, aber Stille (falsches Eingabegeraet?)");
    return [pcm];
  }
}

/** Gesamtdauer der Aufnahme in Sekunden. */
export function durationSeconds(chunks: Int16Array[]): number {
  const samples = chunks.reduce((n, c) => n + c.length, 0);
  return samples / TARGET_RATE;
}

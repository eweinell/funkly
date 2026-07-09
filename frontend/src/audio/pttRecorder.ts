/**
 * PTT-Aufnahme: Mikrofon -> AudioWorklet -> PCM16 @ 16 kHz mono.
 * start() beim Druecken der Sprechtaste, stop() beim Loslassen liefert die Chunks.
 *
 * Der AudioContext laeuft bewusst mit seiner NATIVEN Samplerate: Firefox liefert
 * aus einem MediaStreamAudioSourceNode keine Samples, wenn die Context-Rate von
 * der Stream-Rate abweicht (typisch 48 kHz). Das Resampling auf die von Amazon
 * Transcribe erwarteten 16 kHz passiert deshalb hier in JS.
 *
 * Live-Streaming (BRIEFING-STT-ECHTZEIT.md Schritt 3): start() nimmt optional
 * einen onPcm-Callback, der schon WAEHREND der Aufnahme mit resampelten PCM16-
 * Frames gefuettert wird (statt erst in stop() einmalig). Das Resampling laeuft
 * dazu ueber den zustandsbehafteten Resampler aus resample.ts, der chunkweise
 * aufgerufen sample-genau dasselbe liefert wie der fruehere Ein-Schuss-Aufruf
 * ueber den Gesamtpuffer (s. frontend/scripts/test-resampler.mjs).
 */

import { TARGET_RATE, createStreamResampler, StreamResampler } from "./resample";

/** Worklet-Bloecke (~128 Samples/2.7 ms bei 48 kHz) werden zu Frames dieser
 *  Groesse (100 ms bei 16 kHz) gebuendelt, bevor onPcm() sie weiterreicht - sonst
 *  entstuenden pro Sekunde ~375 Stream-Events statt zehn. */
const LIVE_FRAME_SAMPLES = 1600;

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

/** Haengt b hinter a und gibt einen neuen Int16Array zurueck (Kopie). Generisch
 *  ueber ArrayBufferLike, weil TypedArray#slice() in dieser TS-Lib-Version
 *  Int16Array<ArrayBufferLike> zurueckgibt statt des engeren Int16Array<ArrayBuffer>. */
function concatInt16(a: Int16Array<ArrayBufferLike>, b: Int16Array<ArrayBufferLike>): Int16Array<ArrayBufferLike> {
  if (a.length === 0) return b;
  if (b.length === 0) return a;
  const out = new Int16Array(a.length + b.length);
  out.set(a, 0);
  out.set(b, a.length);
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

  // Live-Resampling-Zustand fuer die Dauer einer Aufnahme.
  private resampler?: StreamResampler;
  private onPcm?: (frame: Int16Array) => void;
  private liveBuffer: Int16Array<ArrayBufferLike> = new Int16Array(0);
  private resampled: Int16Array<ArrayBufferLike>[] = [];

  get recording(): boolean {
    return !!this.ctx;
  }

  /**
   * @param onPcm optionaler Callback: erhaelt waehrend der Aufnahme fortlaufend
   *   ~100-ms-PCM16-Frames (16 kHz mono), sobald sie resampelt vorliegen. Ohne
   *   Callback verhaelt sich start()/stop() wie zuvor (Puffern bis stop()).
   */
  async start(onPcm?: (frame: Int16Array) => void): Promise<void> {
    if (this.ctx) return;
    this.chunks = [];
    this.resampled = [];
    this.liveBuffer = new Int16Array(0);
    this.onPcm = onPcm;
    this.stream = await navigator.mediaDevices.getUserMedia({
      audio: { echoCancellation: true, noiseSuppression: true, channelCount: 1 },
    });
    this.ctx = new AudioContext();
    this.srcRate = this.ctx.sampleRate;
    this.resampler = createStreamResampler(this.srcRate);
    if (this.ctx.state === "suspended") await this.ctx.resume();
    await this.ctx.audioWorklet.addModule(getWorkletUrl());
    this.source = this.ctx.createMediaStreamSource(this.stream);
    this.node = new AudioWorkletNode(this.ctx, "pcm-capture");
    this.node.port.onmessage = (e: MessageEvent<ArrayBuffer>) => {
      const raw = new Float32Array(e.data);
      this.chunks.push(raw);
      this.feedResampler(raw);
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

  /** Resampelt einen rohen Worklet-Block und buendelt das Ergebnis zu ~100-ms-
   *  Frames, bevor onPcm() (falls gesetzt) sie erhaelt. Sammelt die Frames
   *  zusaetzlich in `resampled`, damit stop() daraus die Gesamtausgabe ohne
   *  einen zweiten (Ein-Schuss-)Resampling-Durchlauf zusammensetzen kann. */
  private feedResampler(raw: Float32Array): void {
    const out = this.resampler!.push(raw);
    this.liveBuffer = concatInt16(this.liveBuffer, out);
    while (this.liveBuffer.length >= LIVE_FRAME_SAMPLES) {
      const frame = this.liveBuffer.slice(0, LIVE_FRAME_SAMPLES);
      this.liveBuffer = this.liveBuffer.slice(LIVE_FRAME_SAMPLES);
      this.resampled.push(frame);
      this.onPcm?.(frame);
    }
  }

  /** Beendet die Aufnahme und liefert PCM16-Chunks (16 kHz mono). Ist ein
   *  onPcm-Callback gesetzt, wird auch der letzte (kuerzer als 100 ms lange)
   *  Rest ueber ihn ausgeliefert - sonst gingen die letzten Silben eines
   *  Live-Streams verloren. */
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

    // Letztes, evtl. unvollstaendiges Rest-Frame plus den geklemmten Tail-Sample
    // des Resamplers (s. resample.ts) einsammeln, bevor der Resampler-Zustand
    // fuer die naechste Aufnahme verworfen wird.
    const tail = concatInt16(this.liveBuffer, this.resampler?.flush() ?? new Int16Array(0));
    this.liveBuffer = new Int16Array(0);
    if (tail.length > 0) {
      this.resampled.push(tail);
      this.onPcm?.(tail);
    }
    const pcm = this.resampled;
    this.resampled = [];
    this.resampler = undefined;
    this.onPcm = undefined;

    const total = raw.reduce((n, c) => n + c.length, 0);
    if (total === 0) {
      console.warn("[ptt] stop: worklet lieferte KEINE Samples (process() lief nicht)");
      return [];
    }
    let peak = 0;
    for (const c of raw) {
      for (let i = 0; i < c.length; i++) {
        const a = Math.abs(c[i]);
        if (a > peak) peak = a;
      }
    }
    const outSamples = pcm.reduce((n, c) => n + c.length, 0);
    console.debug("[ptt] stop", {
      srcRate,
      srcSamples: total,
      srcSeconds: +(total / srcRate).toFixed(2),
      peak: +peak.toFixed(4),
      outSamples,
      outSeconds: +(outSamples / TARGET_RATE).toFixed(2),
    });
    if (peak < 0.001) console.warn("[ptt] stop: Samples vorhanden, aber Stille (falsches Eingabegeraet?)");
    return pcm;
  }
}

/** Gesamtdauer der Aufnahme in Sekunden. */
export function durationSeconds(chunks: Int16Array[]): number {
  const samples = chunks.reduce((n, c) => n + c.length, 0);
  return samples / TARGET_RATE;
}

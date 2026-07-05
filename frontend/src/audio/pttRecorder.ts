/**
 * PTT-Aufnahme: Mikrofon -> AudioWorklet -> PCM16 @ 16 kHz mono.
 * start() beim Druecken der Sprechtaste, stop() beim Loslassen liefert die Chunks.
 */

const WORKLET_SOURCE = `
class PcmCapture extends AudioWorkletProcessor {
  process(inputs) {
    const ch = inputs[0] && inputs[0][0];
    if (ch && ch.length) {
      const out = new Int16Array(ch.length);
      for (let i = 0; i < ch.length; i++) {
        const s = Math.max(-1, Math.min(1, ch[i]));
        out[i] = s < 0 ? s * 0x8000 : s * 0x7fff;
      }
      this.port.postMessage(out.buffer, [out.buffer]);
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

export class PttRecorder {
  private ctx?: AudioContext;
  private stream?: MediaStream;
  private source?: MediaStreamAudioSourceNode;
  private node?: AudioWorkletNode;
  private chunks: Int16Array[] = [];

  get recording(): boolean {
    return !!this.ctx;
  }

  async start(): Promise<void> {
    if (this.ctx) return;
    this.chunks = [];
    this.stream = await navigator.mediaDevices.getUserMedia({
      audio: { echoCancellation: true, noiseSuppression: true, channelCount: 1 },
    });
    this.ctx = new AudioContext({ sampleRate: 16000 });
    await this.ctx.audioWorklet.addModule(getWorkletUrl());
    this.source = this.ctx.createMediaStreamSource(this.stream);
    this.node = new AudioWorkletNode(this.ctx, "pcm-capture");
    this.node.port.onmessage = (e: MessageEvent<ArrayBuffer>) => {
      this.chunks.push(new Int16Array(e.data));
    };
    this.source.connect(this.node);
  }

  /** Beendet die Aufnahme und liefert PCM16-Chunks (16 kHz mono). */
  async stop(): Promise<Int16Array[]> {
    const chunks = this.chunks;
    this.source?.disconnect();
    this.node?.disconnect();
    this.stream?.getTracks().forEach((t) => t.stop());
    await this.ctx?.close().catch(() => undefined);
    this.ctx = undefined;
    this.stream = undefined;
    this.source = undefined;
    this.node = undefined;
    this.chunks = [];
    return chunks;
  }
}

/** Gesamtdauer der Aufnahme in Sekunden. */
export function durationSeconds(chunks: Int16Array[]): number {
  const samples = chunks.reduce((n, c) => n + c.length, 0);
  return samples / 16000;
}

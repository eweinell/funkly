/**
 * Lineare Interpolation von einer Quell-Samplerate auf TARGET_RATE (16 kHz), dann
 * Float32 -> PCM16. Ausgelagert aus pttRecorder.ts, damit sowohl der Recorder als
 * auch das Testskript (test-resampler.mjs) dieselbe Implementierung verwenden.
 *
 * Zwei Varianten mit identischer Kernrechnung:
 * - `resampleToPcm16()`: Ein-Schuss ueber den kompletten Puffer. Frueher der einzige
 *   Pfad (bis zur Live-Umstellung); bleibt als Referenz fuer den Aequivalenztest
 *   (frontend/scripts/test-resampler.mjs) bestehen.
 * - `createStreamResampler()`: zustandsbehaftet, chunkweise aufrufbar fuer die
 *   Echtzeit-Uebertragung (Paket STT-Echtzeit, Ausnahme von der Audio-Leitplanke
 *   fuer pttRecorder.ts/transcribe.ts, s. BRIEFING-STT-ECHTZEIT.md Schritt 1).
 */

export const TARGET_RATE = 16000;

function quantize(sample: number): number {
  const s = Math.max(-1, Math.min(1, sample));
  return s < 0 ? s * 0x8000 : s * 0x7fff;
}

/** Ein-Schuss-Resampler ueber den kompletten Puffer (Referenzimplementierung). */
export function resampleToPcm16(input: Float32Array, srcRate: number): Int16Array {
  const ratio = srcRate / TARGET_RATE;
  const outLength = Math.floor(input.length / ratio);
  const out = new Int16Array(outLength);
  for (let i = 0; i < outLength; i++) {
    const pos = i * ratio;
    const i0 = Math.floor(pos);
    const i1 = Math.min(i0 + 1, input.length - 1);
    const frac = pos - i0;
    const sample = input[i0] * (1 - frac) + input[i1] * frac;
    out[i] = quantize(sample);
  }
  return out;
}

/**
 * Zustandsbehafteter Resampler: chunkweise aufgerufen liefert er sample-genau
 * dieselbe Ausgabe wie resampleToPcm16() ueber den entsprechenden Gesamtpuffer.
 *
 * Zustand ueber Chunk-Grenzen hinweg:
 * - `carry`: das letzte Eingangssample des Vorgaenger-Chunks, als Stuetzstelle
 *   fuer die erste Interpolation des naechsten Chunks (sonst fehlt i1 an der
 *   Chunk-Grenze).
 * - `pos`: der Phasenakkumulator (Fliesskommazahl), gemessen relativ zu `carry`
 *   als lokalem Index 0. Er wird NICHT pro Chunk zurueckgesetzt, sondern nach
 *   jedem Aufruf um die Chunklaenge-1 verschoben (Wechsel des Bezugsrahmens auf
 *   den neuen `carry`).
 *
 * Da der Downsampling-Ratio (srcRate/16000) stets > 1 ist, kann pro push()-Aufruf
 * hoechstens ein Ausgabesample "pendent" bleiben (wartet auf das erste Sample des
 * naechsten Chunks als Stuetzstelle) - das loest der naechste push()-Aufruf sofort.
 * Erst beim allerletzten Chunk gibt es keine weitere Stuetzstelle mehr: flush()
 * bildet dann exakt das Clamp-Verhalten von resampleToPcm16() nach (i1 auf den
 * letzten gueltigen Index geklemmt, also auf `carry` selbst).
 */
export interface StreamResampler {
  /** Resampelt so viel wie moeglich aus `chunk` + Restzustand, puffert den Rest. */
  push(chunk: Float32Array): Int16Array;
  /** Schliesst den Strom ab (kein weiterer Chunk kommt) und liefert die letzten,
   *  geklemmten Ausgabesamples (0 oder 1 Stueck). */
  flush(): Int16Array;
}

export function createStreamResampler(srcRate: number): StreamResampler {
  const ratio = srcRate / TARGET_RATE;
  let carry: number | undefined;
  let pos = 0;
  let totalConsumed = 0;
  let emitted = 0;

  function push(chunk: Float32Array): Int16Array {
    if (chunk.length === 0) return new Int16Array(0);
    const bufLen = carry !== undefined ? chunk.length + 1 : chunk.length;
    const at = (i: number): number => (carry !== undefined ? (i === 0 ? carry! : chunk[i - 1]) : chunk[i]);

    const out: number[] = [];
    while (true) {
      const i0 = Math.floor(pos);
      const i1 = i0 + 1;
      if (i1 > bufLen - 1) break;
      const frac = pos - i0;
      const sample = at(i0) * (1 - frac) + at(i1) * frac;
      out.push(sample);
      pos += ratio;
      emitted++;
    }

    carry = at(bufLen - 1);
    pos -= bufLen - 1;
    totalConsumed += chunk.length;

    const result = new Int16Array(out.length);
    for (let i = 0; i < out.length; i++) result[i] = quantize(out[i]);
    return result;
  }

  function flush(): Int16Array {
    const target = Math.floor(totalConsumed / ratio);
    const remaining = Math.max(0, target - emitted);
    const out = new Int16Array(remaining);
    // Kein weiteres Sample kommt mehr: jede noch fehlende Ausgabe klemmt auf
    // `carry` (das letzte je empfangene Eingangssample) - siehe Erlaeuterung oben.
    const value = quantize(carry ?? 0);
    for (let i = 0; i < remaining; i++) out[i] = value;
    emitted += remaining;
    return out;
  }

  return { push, flush };
}

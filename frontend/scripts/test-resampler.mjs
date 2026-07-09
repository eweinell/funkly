// Aequivalenztest fuer den zustandsbehafteten Resampler (BRIEFING-STT-ECHTZEIT.md, Schritt 1).
//
// Vergleicht: derselbe synthetische Sinus, einmal komplett in einem Rutsch durch
// resampleToPcm16() (Ein-Schuss-Referenz), einmal in viele kleine, unregelmaessig
// grosse Chunks zerlegt durch createStreamResampler() (chunkweise, wie spaeter vom
// Recorder live gefuettert) - beide Ergebnisse muessen sample-genau uebereinstimmen.
//
// Ausfuehren: node frontend/scripts/test-resampler.mjs
// (Node >= 22.6 stript TS-Typannotationen nativ, kein Build-Schritt noetig.)

import { resampleToPcm16, createStreamResampler } from "../src/audio/resample.ts";

function makeSine(seconds, srcRate, freqHz) {
  const n = Math.round(seconds * srcRate);
  const out = new Float32Array(n);
  for (let i = 0; i < n; i++) {
    out[i] = 0.6 * Math.sin((2 * Math.PI * freqHz * i) / srcRate);
  }
  return out;
}

function assertEqual(a, b, label) {
  if (a.length !== b.length) {
    throw new Error(`${label}: Laenge weicht ab (chunked=${a.length}, oneShot=${b.length})`);
  }
  let maxDiff = 0;
  let diffCount = 0;
  for (let i = 0; i < a.length; i++) {
    const d = Math.abs(a[i] - b[i]);
    if (d > 0) diffCount++;
    if (d > maxDiff) maxDiff = d;
  }
  console.log(`  ${label}: ${a.length} Samples, ${diffCount} abweichend, maxDiff=${maxDiff}`);
  if (maxDiff > 1) {
    throw new Error(`${label}: maxDiff=${maxDiff} > 1 (int16-Rundungstoleranz) - FEHLGESCHLAGEN`);
  }
}

function runCase(label, srcRate, seconds, freqHz, chunkSizes) {
  console.log(`\n${label} (srcRate=${srcRate}, seconds=${seconds}, freq=${freqHz}Hz)`);
  const input = makeSine(seconds, srcRate, freqHz);

  const oneShot = resampleToPcm16(input, srcRate);

  const resampler = createStreamResampler(srcRate);
  const chunkedParts = [];
  let offset = 0;
  let chunkIdx = 0;
  while (offset < input.length) {
    const size = Math.min(chunkSizes[chunkIdx % chunkSizes.length], input.length - offset);
    chunkIdx++;
    const chunk = input.subarray(offset, offset + size);
    offset += size;
    chunkedParts.push(resampler.push(chunk));
  }
  chunkedParts.push(resampler.flush());

  const chunkedTotalLen = chunkedParts.reduce((n, p) => n + p.length, 0);
  const chunked = new Int16Array(chunkedTotalLen);
  let w = 0;
  for (const p of chunkedParts) {
    chunked.set(p, w);
    w += p.length;
  }

  assertEqual(chunked, oneShot, label);
}

let failed = false;
try {
  // Realistische Worklet-Blockgroesse bei 48 kHz: 128 Samples (~2.7 ms).
  runCase("48kHz, gleichmaessige 128er-Bloecke", 48000, 3.7, 440, [128]);
  // Unregelmaessige Chunkgroessen (wie echte Worklet-Callbacks leicht schwanken koennten).
  runCase("48kHz, unregelmaessige Chunkgroessen", 48000, 2.3, 523.25, [128, 256, 64, 200, 1]);
  // Sehr kleine 1-Sample-Chunks als Extremfall.
  runCase("48kHz, 1-Sample-Chunks (Extremfall)", 48000, 0.05, 300, [1]);
  // Andere Quell-Samplerate (z. B. 44.1 kHz Hardware).
  runCase("44.1kHz, 100ms-Frames (960 Samples)", 44100, 4.0, 880, [960]);
  // Ratio nahe 1 wird in der Praxis nicht vorkommen (Browser liefern 44.1/48 kHz),
  // aber als Grenzfall fuer den Algorithmus mitgetestet.
  runCase("24kHz, 128er-Bloecke", 24000, 1.0, 300, [128]);

  console.log("\nAlle Faelle bestanden: chunkweiser Resampler == Ein-Schuss-Referenz (Toleranz <=1 LSB).");
} catch (e) {
  failed = true;
  console.error("\nFEHLGESCHLAGEN:", e.message);
}

process.exit(failed ? 1 : 0);

import {
  TranscribeStreamingClient,
  StartStreamTranscriptionCommand,
} from "@aws-sdk/client-transcribe-streaming";
import { api, Language } from "../api";

interface CachedCreds {
  client: TranscribeStreamingClient;
  expiresAt: number;
}

let cached: CachedCreds | undefined;

async function getClient(): Promise<TranscribeStreamingClient> {
  const now = Date.now();
  if (cached && cached.expiresAt - now > 120_000) return cached.client;
  const { region, credentials } = await api.sttCredentials();
  const client = new TranscribeStreamingClient({
    region,
    credentials: {
      accessKeyId: credentials.accessKeyId,
      secretAccessKey: credentials.secretAccessKey,
      sessionToken: credentials.sessionToken,
    },
  });
  cached = { client, expiresAt: new Date(credentials.expiration).getTime() };
  return client;
}

/** PCM16-Chunks in ~100-ms-Frames (3200 Bytes) buendeln. */
function toFrames(chunks: Int16Array[], frameBytes = 3200): Uint8Array[] {
  const total = chunks.reduce((n, c) => n + c.byteLength, 0);
  const merged = new Uint8Array(total);
  let offset = 0;
  for (const c of chunks) {
    merged.set(new Uint8Array(c.buffer, c.byteOffset, c.byteLength), offset);
    offset += c.byteLength;
  }
  const frames: Uint8Array[] = [];
  for (let i = 0; i < merged.length; i += frameBytes) {
    frames.push(merged.slice(i, i + frameBytes));
  }
  return frames;
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

/** ~1 s Stille (10 Frames a 100 ms) als Nachlauf hinter dem Clip. */
const TAIL_SILENCE_FRAMES = 10;

/** Aufgenommenen PTT-Clip zu Amazon Transcribe streamen, finales Transkript zurueckgeben. */
export async function transcribeClip(chunks: Int16Array[], language: Language): Promise<string> {
  const client = await getClient();
  const frames = toFrames(chunks);
  const languageCode = language === "de" ? "de-DE" : "en-GB";
  console.debug("[stt] senden", { frames: frames.length, bytes: frames.reduce((n, f) => n + f.length, 0), languageCode });

  // Transcribe erwartet einen Echtzeit-Strom. Wird der komplette Clip auf einmal
  // hineingekippt und sofort das Stream-Ende signalisiert, schliesst der Service
  // die Session teils, bevor ein finales Ergebnis (IsPartial=false) entsteht.
  // Deshalb die Frames gepaced senden (~4x Echtzeit) statt in einem Rutsch.
  //
  // Das Ende einer Aeusserung erkennt Transcribe an nachfolgender Stille. Endet
  // der Strom direkt hinter dem letzten Sprach-Frame, bleibt das letzte Segment
  // unfinalisiert - deshalb ein Nachlauf aus Stille-Frames.
  const silence = new Uint8Array(3200);
  async function* audioStream() {
    for (const frame of frames) {
      yield { AudioEvent: { AudioChunk: frame } };
      await sleep(25);
    }
    for (let i = 0; i < TAIL_SILENCE_FRAMES; i++) {
      yield { AudioEvent: { AudioChunk: silence } };
      await sleep(25);
    }
  }

  const res = await client.send(
    new StartStreamTranscriptionCommand({
      LanguageCode: languageCode,
      MediaEncoding: "pcm",
      MediaSampleRateHertz: 16000,
      AudioStream: audioStream(),
    })
  );

  // Transcribe liefert je Segment erst Zwischenergebnisse (IsPartial=true), die
  // spaeter durch die finale Fassung ersetzt werden. Beide tragen dieselbe
  // ResultId. Wir merken uns pro Segment die zuletzt gesehene Fassung, statt nur
  // die finalen einzusammeln: sonst geht ein am Stream-Ende noch unfinalisiertes
  // Segment (typisch: das Ende der Meldung) verloren, sobald irgendein anderes
  // Segment bereits final war.
  const segments = new Map<string, { text: string; partial: boolean }>();
  let events = 0;
  for await (const event of res.TranscriptResultStream ?? []) {
    events++;
    const results = event.TranscriptEvent?.Transcript?.Results ?? [];
    for (const r of results) {
      const alt = r.Alternatives?.[0]?.Transcript ?? "";
      if (!alt) continue;
      segments.set(r.ResultId ?? String(segments.size), { text: alt, partial: !!r.IsPartial });
    }
  }

  const parts = [...segments.values()];
  const final = parts
    .map((p) => p.text.trim())
    .filter(Boolean)
    .join(" ");
  console.debug("[stt] empfangen", {
    events,
    final,
    segments: parts.length,
    unfinalized: parts.filter((p) => p.partial).length,
  });
  return final;
}

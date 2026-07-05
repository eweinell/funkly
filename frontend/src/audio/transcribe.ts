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

/** Aufgenommenen PTT-Clip zu Amazon Transcribe streamen, finales Transkript zurueckgeben. */
export async function transcribeClip(chunks: Int16Array[], language: Language): Promise<string> {
  const client = await getClient();
  const frames = toFrames(chunks);

  async function* audioStream() {
    for (const frame of frames) {
      yield { AudioEvent: { AudioChunk: frame } };
    }
  }

  const res = await client.send(
    new StartStreamTranscriptionCommand({
      LanguageCode: language === "de" ? "de-DE" : "en-GB",
      MediaEncoding: "pcm",
      MediaSampleRateHertz: 16000,
      AudioStream: audioStream(),
    })
  );

  let text = "";
  for await (const event of res.TranscriptResultStream ?? []) {
    const results = event.TranscriptEvent?.Transcript?.Results ?? [];
    for (const r of results) {
      if (!r.IsPartial) text += (r.Alternatives?.[0]?.Transcript ?? "") + " ";
    }
  }
  return text.trim();
}

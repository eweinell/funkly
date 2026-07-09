import {
  TranscribeStreamingClient,
  StartStreamTranscriptionCommand,
} from "@aws-sdk/client-transcribe-streaming";
import type { TranscriptResultStream } from "@aws-sdk/client-transcribe-streaming";
import { api, Language } from "../api";
import { PcmQueue } from "./pcmQueue";

interface CachedCreds {
  client: TranscribeStreamingClient;
  expiresAt: number;
}

let cached: CachedCreds | undefined;
let inFlight: Promise<TranscribeStreamingClient> | undefined;

async function getClient(): Promise<TranscribeStreamingClient> {
  const now = Date.now();
  if (cached && cached.expiresAt - now > 120_000) return cached.client;
  // Mehrere gleichzeitige Aufrufer (Vorwaerm-Timer + ein laufender PTT-Zyklus)
  // sollen nicht je eigene STS-Credentials ziehen - auf den bereits laufenden
  // Abruf warten statt einen zweiten anzustossen.
  if (inFlight) return inFlight;
  inFlight = (async () => {
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
  })();
  try {
    return await inFlight;
  } finally {
    inFlight = undefined;
  }
}

/**
 * Waermt den Credential-Cache vor, damit der erste `pttDown` nach dem Laden eines
 * Szenarios nicht auf den STS-Roundtrip wartet (der saesse sonst zwischen
 * Tastendruck und erstem Audio-Frame - die ersten Silben waeren weg,
 * s. BRIEFING-STT-ECHTZEIT.md Schritt 5).
 *
 * Haelt den Cache zusaetzlich ueber die Dauer der Session frisch: Credentials
 * gelten 900 s, getClient() erneuert erst unter 120 s Restlaufzeit. Ohne
 * periodisches Nachfassen koennte die Restlaufzeit genau dann unter die Schwelle
 * fallen, wenn eine PTT-Aufnahme laeuft (bzw. direkt bevor eine neue beginnt) -
 * der Roundtrip waere wieder in der kritischen Latenz. Der Timer laeuft alle 60 s
 * (idempotent, ein einziger pro Modul-Lebensdauer) und ruft lediglich getClient()
 * auf, das selbst entscheidet, ob eine Erneuerung noetig ist.
 */
let warmupTimer: ReturnType<typeof setInterval> | undefined;
export function warmupTranscribeClient(): void {
  getClient().catch((e) => console.warn("[stt] Vorwaermen fehlgeschlagen", e));
  if (warmupTimer !== undefined) return;
  warmupTimer = setInterval(() => {
    getClient().catch((e) => console.warn("[stt] Erneuerung fehlgeschlagen", e));
  }, 60_000);
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

/** Audiodauer eines Frames (3200 Bytes PCM16 @ 16 kHz). */
const FRAME_MS = 100;

/** ~1 s Stille als Nachlauf hinter dem Clip. */
const TAIL_SILENCE_FRAMES = 10;

/**
 * Sammelt TranscriptResultStream-Events in eine ResultId-Segment-Map. Transcribe
 * liefert je Segment erst Zwischenergebnisse (IsPartial=true), die spaeter durch
 * die finale Fassung ersetzt werden - beide tragen dieselbe ResultId. Wir merken
 * uns pro Segment nur die zuletzt gesehene Fassung, statt nur die finalen
 * einzusammeln: sonst geht ein am Stream-Ende noch unfinalisiertes Segment
 * (typisch: das Ende der Meldung) verloren, sobald irgendein anderes Segment
 * bereits final war.
 */
async function collectTranscript(
  stream: AsyncIterable<TranscriptResultStream> | undefined
): Promise<{ events: number; final: string; segments: number; unfinalized: number }> {
  const segments = new Map<string, { text: string; partial: boolean }>();
  let events = 0;
  for await (const event of stream ?? []) {
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
  return { events, final, segments: parts.length, unfinalized: parts.filter((p) => p.partial).length };
}

/**
 * Live-Session fuer die Echtzeit-Uebertragung (BRIEFING-STT-ECHTZEIT.md Schritt 2):
 * der Transcribe-Stream oeffnet bereits beim Druecken der Sprechtaste und wird
 * waehrend der Aufnahme fortlaufend mit PCM16-Frames gefuettert, statt erst nach
 * dem Loslassen mit dem fertigen Clip. Das kuenstliche Pacing entfaellt fuer den
 * Sprachteil ersatzlos - die Aufnahme *ist* bereits Echtzeit; nur der
 * Stille-Nachlauf in finish() wartet weiterhin FRAME_MS je Frame.
 */
export interface TranscribeSession {
  /** Reicht einen PCM16-Frame (16 kHz mono) an den laufenden Stream weiter. Nach
   *  finish()/abort() ein No-op. */
  pushPcm(chunk: Int16Array): void;
  /** Schiebt den Stille-Nachlauf nach, schliesst den Stream und liefert das
   *  finale Transkript. */
  finish(): Promise<string>;
  /** Bricht den Stream sofort ab (kein Nachlauf, kein Warten auf Ergebnisse).
   *  Muss in jedem Fall aufgerufen werden, in dem die Session nicht reibungslos
   *  per finish() endet - ein offen gelassener Stream laeuft (und kostet) weiter. */
  abort(): void;
}

export async function startTranscription(language: Language): Promise<TranscribeSession> {
  const client = await getClient();
  const languageCode = language === "de" ? "de-DE" : "en-GB";
  const queue = new PcmQueue();
  const controller = new AbortController();
  const silence = new Uint8Array(3200);

  let closed = false;

  async function* audioStream() {
    for await (const frame of queue) {
      yield { AudioEvent: { AudioChunk: frame } };
    }
  }

  console.debug("[stt] Session gestartet", { languageCode });

  const resultPromise = (async () => {
    const res = await client.send(
      new StartStreamTranscriptionCommand({
        LanguageCode: languageCode,
        MediaEncoding: "pcm",
        MediaSampleRateHertz: 16000,
        AudioStream: audioStream(),
      }),
      { abortSignal: controller.signal }
    );
    return collectTranscript(res.TranscriptResultStream);
  })();
  // Wird die Session per abort() verworfen, wartet niemand mehr auf resultPromise -
  // ein Fehler (z. B. durch den AbortController) darf dann nicht als unhandled
  // rejection auffallen.
  resultPromise.catch(() => undefined);

  function pushPcm(chunk: Int16Array): void {
    if (closed) return;
    queue.push(new Uint8Array(chunk.buffer, chunk.byteOffset, chunk.byteLength));
  }

  async function finish(): Promise<string> {
    if (closed) return "";
    closed = true;
    // Stille-Nachlauf: ohne ihn erkennt Transcribe das Ende der Aeusserung nicht
    // und laesst das letzte Segment unfinalisiert (s. collectTranscript oben).
    for (let i = 0; i < TAIL_SILENCE_FRAMES; i++) {
      queue.push(silence);
      await sleep(FRAME_MS);
    }
    queue.close();
    try {
      const { events, final, segments, unfinalized } = await resultPromise;
      console.debug("[stt] Session beendet", { events, final, segments, unfinalized });
      return final;
    } catch (e) {
      console.warn("[stt] Session-Ergebnis fehlgeschlagen", e);
      return "";
    }
  }

  function abort(): void {
    if (closed) return;
    closed = true;
    queue.close();
    controller.abort();
    console.debug("[stt] Session abgebrochen");
  }

  return { pushPcm, finish, abort };
}

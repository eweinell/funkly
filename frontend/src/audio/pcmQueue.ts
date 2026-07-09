/**
 * Verbindet synchrone Producer (AudioWorklet-Callbacks) mit einem async-iterierbaren
 * Consumer (der Transcribe-`AudioStream`-Generator). `push()` wird aus dem
 * Worklet-Message-Handler aufgerufen, der Consumer haengt in `for await` und wird per
 * gespeichertem Resolver geweckt, sobald neue Daten da sind oder die Queue schliesst.
 *
 * Bewusst keine Backpressure-Logik: PCM-Frames sind klein (~3 KB je 100 ms) und ein
 * PTT-Zyklus dauert Sekunden, nicht Minuten - ein unbegrenztes Array ist hier
 * einfacher und ausreichend, statt eine Ringpuffer-/Kapazitaetsgrenze zu erfinden,
 * die niemand braucht.
 */
export class PcmQueue {
  private items: Uint8Array[] = [];
  private closed = false;
  private waiting?: () => void;

  push(frame: Uint8Array): void {
    if (this.closed) return;
    this.items.push(frame);
    this.wake();
  }

  /** Keine weiteren push()-Aufrufe erwartet; laufende/kuenftige Iteration endet,
   *  sobald die bereits gepufferten Frames abgearbeitet sind. */
  close(): void {
    if (this.closed) return;
    this.closed = true;
    this.wake();
  }

  private wake(): void {
    const w = this.waiting;
    this.waiting = undefined;
    w?.();
  }

  async *[Symbol.asyncIterator](): AsyncGenerator<Uint8Array> {
    for (;;) {
      if (this.items.length > 0) {
        yield this.items.shift()!;
        continue;
      }
      if (this.closed) return;
      await new Promise<void>((resolve) => {
        this.waiting = resolve;
      });
    }
  }
}

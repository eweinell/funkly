import { IcM330Mic } from "./IcM330Mic";
import { IcM330Radio } from "./IcM330Radio";
import { IcM330LcdProps } from "./IcM330Lcd";
import { IcM330Handlers, withDevFallback } from "./types";
import styles from "./IcM330Skin.module.css";

/**
 * Zweiter Geräte-Skin: ICOM IC-M330 (Festeinbau) mit separatem Handmikrofon.
 * Rein präsentational: `handlers` verdrahtet die Bedienelemente an die Session
 * (das tut `components/radio/IcM330Panel.tsx`), `lcd` speist die Anzeige. Ohne
 * `handlers` loggen die Tasten nur in die Konsole (types.ts) — praktisch für
 * Layout-Reviews des Skins.
 */
export function IcM330Skin({
  handlers,
  lcd,
  transmitting,
}: {
  handlers?: Partial<IcM330Handlers>;
  lcd?: IcM330LcdProps;
  transmitting?: boolean;
}) {
  const h = withDevFallback(handlers);

  return (
    <div className={styles.skin}>
      <div className={styles.micRow}>
        <IcM330Mic handlers={h} transmitting={transmitting} />
      </div>
      <IcM330Radio handlers={h} lcd={lcd} />
    </div>
  );
}

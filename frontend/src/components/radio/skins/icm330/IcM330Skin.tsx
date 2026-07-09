import { IcM330Mic } from "./IcM330Mic";
import { IcM330Radio } from "./IcM330Radio";
import { IcM330LcdProps } from "./IcM330Lcd";
import { IcM330Handlers, withDevFallback } from "./types";
import styles from "./IcM330Skin.module.css";

/**
 * Zweiter Geräte-Skin: ICOM IC-M330 (Festeinbau) mit separatem Handmikrofon.
 * NOCH NICHT VERDRAHTET — ohne `handlers` loggen alle Tasten nur in die
 * Konsole (types.ts). Verdrahtung später: Handler-Objekt aus dem
 * SessionContext bauen (pttDown/pttUp, setChannel, DSC …) und hereinreichen;
 * LCD-Inhalte über `lcd` (IcM330LcdProps) aus dem Session-State speisen.
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

/** Geraete-Skin des Funkgeraets. `classic` ist der generische Trainer-Aufbau, `icm330` das ICOM-Nachbau-Bedienteil. */
export type RadioSkin = "classic" | "icm330";

const STORAGE_KEY = "funkly.skin";

function isSkin(value: string | null): value is RadioSkin {
  return value === "classic" || value === "icm330";
}

/** `?skin=icm330` gewinnt (Direktlink z. B. fuer Layout-Reviews), sonst die letzte Wahl. */
export function loadSkin(): RadioSkin {
  const fromQuery = new URLSearchParams(window.location.search).get("skin");
  if (isSkin(fromQuery)) return fromQuery;
  try {
    const stored = window.localStorage.getItem(STORAGE_KEY);
    if (isSkin(stored)) return stored;
  } catch {
    /* Privatmodus ohne localStorage */
  }
  return "classic";
}

export function saveSkin(skin: RadioSkin): void {
  try {
    window.localStorage.setItem(STORAGE_KEY, skin);
  } catch {
    /* Privatmodus ohne localStorage */
  }
}

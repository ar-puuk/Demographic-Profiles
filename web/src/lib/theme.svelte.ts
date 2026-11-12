// Light, dark or follow the system. The choice is kept per viewer; the resolved mode drives CSS (data-theme) and
// is reactive, so charts and the map redraw when it changes.
export type Pref = "light" | "dark" | "system";
const KEY = "utah-profiles-theme";

function stored(): Pref {
  try {
    const v = localStorage.getItem(KEY);
    if (v === "light" || v === "dark" || v === "system") return v;
  } catch { /* storage blocked: fall back to the system setting */ }
  return "system";
}

const media = typeof matchMedia === "function" ? matchMedia("(prefers-color-scheme: dark)") : null;

class Theme {
  pref = $state<Pref>(stored());
  systemDark = $state(media?.matches ?? false);
  resolved = $derived<"light" | "dark">(this.pref === "system" ? (this.systemDark ? "dark" : "light") : this.pref);

  constructor() {
    media?.addEventListener("change", (e) => { this.systemDark = e.matches; this.apply(); });
    this.apply();
  }
  apply() {
    const mode = this.pref === "system" ? (this.systemDark ? "dark" : "light") : this.pref;
    document.documentElement.dataset.theme = mode;
  }
  set(pref: Pref) {
    this.pref = pref;
    try { localStorage.setItem(KEY, pref); } catch { /* ignore */ }
    this.apply();
  }
  cycle() {
    this.set(this.pref === "system" ? "light" : this.pref === "light" ? "dark" : "system");
  }
}

export const theme = new Theme();

// Colours the charts read from CSS variables, so they follow the theme without a second palette in code.
export function palette() {
  const css = getComputedStyle(document.documentElement);
  const get = (name: string, fallback: string) => css.getPropertyValue(name).trim() || fallback;
  return {
    accent: get("--accent", "#1B2A47"),
    selected: get("--sel", "#0072B2"),
    compare: get("--cmp", "#BD4B00"),
    male: get("--male", "#0072B2"),
    female: get("--female", "#CC79A7"),
    c3: get("--c3", "#00735A"),
    c4: get("--c4", "#A86F00"),
    ink: get("--text", "#131A27"),
    ink2: get("--muted", "#566074"),
    surface: get("--surface", "#FFFFFF"),
    grid: get("--grid", "#E3E7EE"),
  };
}
export type Palette = ReturnType<typeof palette>;

import { useSyncExternalStore } from "react";

export const themes = ["system", "light", "dark"] as const;
/** Studio's color scheme as someone chose it: the system's, or always light or dark. */
export type Theme = (typeof themes)[number];

const storageKey = "pakshi-theme";
const darkQuery = "(prefers-color-scheme: dark)";

/**
 * Sets Studio's color scheme from the stored choice before the page first
 * paints, so it never shows in the wrong one. The system's scheme is known
 * only in the browser, so the server can't render the right one itself.
 */
export const themeScript = `try{var t=localStorage.getItem("${storageKey}")}catch(e){}document.documentElement.classList.toggle("dark",t==="dark"||t!=="light"&&matchMedia("${darkQuery}").matches)`;

const isTheme = (value: string | null): value is Theme => themes.some((theme) => theme === value);

const storedTheme = (): Theme => {
  try {
    const stored = localStorage.getItem(storageKey);
    return isTheme(stored) ? stored : "system";
  } catch {
    return "system";
  }
};

const systemDark = () => matchMedia(darkQuery).matches;

const resolve = (theme: Theme, dark: boolean) =>
  theme === "system" ? (dark ? "dark" : "light") : theme;

const apply = () =>
  document.documentElement.classList.toggle(
    "dark",
    resolve(storedTheme(), systemDark()) === "dark",
  );

const listeners = new Set<() => void>();

/** Follows a new choice in this tab or another one, and the system's scheme as it changes. */
const subscribe = (onChange: () => void) => {
  const media = matchMedia(darkQuery);
  const update = () => {
    apply();
    onChange();
  };
  listeners.add(onChange);
  media.addEventListener("change", update);
  window.addEventListener("storage", update);
  return () => {
    listeners.delete(onChange);
    media.removeEventListener("change", update);
    window.removeEventListener("storage", update);
  };
};

const setTheme = (theme: Theme) => {
  localStorage.setItem(storageKey, theme);
  apply();
  for (const listener of listeners) listener();
};

/**
 * The color scheme chosen for Studio in this browser, the scheme it shows
 * now, and a way to choose another. Studio follows the system until someone
 * chooses light or dark.
 */
export function useTheme() {
  const theme = useSyncExternalStore(subscribe, storedTheme, (): Theme => "system");
  const dark = useSyncExternalStore(subscribe, systemDark, () => false);
  return { theme, resolved: resolve(theme, dark), setTheme };
}

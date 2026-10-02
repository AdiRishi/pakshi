import { type CanvasColors, presenceColorCount } from "@repo/editor";

const themeValue = (name: string) =>
  getComputedStyle(document.documentElement).getPropertyValue(name).trim();

/** The colors the editor's canvas draws with, read from Studio's theme so they match Studio. */
export const canvasColors = (): CanvasColors => ({
  accent: themeValue("--ring"),
  warning: themeValue("--warning-foreground"),
  presence: Array.from({ length: presenceColorCount }, (_, index) =>
    themeValue(`--presence-${index + 1}`),
  ),
});

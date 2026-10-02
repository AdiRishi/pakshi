import { type CanvasColors, presenceColorCount } from "@repo/editor";

const themeValue = (name: string) =>
  getComputedStyle(document.documentElement).getPropertyValue(name).trim();

/** The colors the editor's canvas draws with, read from Studio's theme so they match Studio. */
export const canvasColors = (): CanvasColors => ({
  accent: themeValue("--canvas-accent"),
  warning: themeValue("--canvas-warning"),
  presence: Array.from({ length: presenceColorCount }, (_, index) =>
    themeValue(`--presence-${index + 1}`),
  ),
});

import type { ResolvedTheme, SurfaceColors } from "./theme.ts";

interface SurfacePalette {
  readonly background: string;
  readonly foreground: string;
  readonly muted: string;
  readonly mutedForeground: string;
  readonly primary: string;
  readonly primaryForeground: string;
  readonly border: string;
  readonly destructive: string;
}

const surface = (palette: SurfacePalette): SurfaceColors => ({
  background: palette.background,
  foreground: palette.foreground,
  card: palette.background,
  "card-foreground": palette.foreground,
  popover: palette.background,
  "popover-foreground": palette.foreground,
  primary: palette.primary,
  "primary-foreground": palette.primaryForeground,
  secondary: palette.muted,
  "secondary-foreground": palette.foreground,
  muted: palette.muted,
  "muted-foreground": palette.mutedForeground,
  accent: palette.muted,
  "accent-foreground": palette.foreground,
  destructive: palette.destructive,
  border: palette.border,
  input: palette.border,
  ring: palette.primary,
});

/** Deep harbour blue on warm white, with a serif display face. */
export const harbour = {
  schema: "pakshi.theme/1",
  colors: {
    light: {
      default: surface({
        background: "oklch(0.99 0.004 85)",
        foreground: "oklch(0.23 0.03 250)",
        muted: "oklch(0.955 0.008 85)",
        mutedForeground: "oklch(0.45 0.03 250)",
        primary: "oklch(0.47 0.13 252)",
        primaryForeground: "oklch(0.99 0.004 85)",
        border: "oklch(0.89 0.012 85)",
        destructive: "oklch(0.53 0.2 27)",
      }),
      muted: surface({
        background: "oklch(0.955 0.012 85)",
        foreground: "oklch(0.23 0.03 250)",
        muted: "oklch(0.92 0.014 85)",
        mutedForeground: "oklch(0.43 0.03 250)",
        primary: "oklch(0.46 0.13 252)",
        primaryForeground: "oklch(0.99 0.004 85)",
        border: "oklch(0.86 0.015 85)",
        destructive: "oklch(0.52 0.2 27)",
      }),
      brand: surface({
        background: "oklch(0.4 0.12 252)",
        foreground: "oklch(0.99 0.004 85)",
        muted: "oklch(0.45 0.12 252)",
        mutedForeground: "oklch(0.9 0.03 252)",
        primary: "oklch(0.99 0.004 85)",
        primaryForeground: "oklch(0.33 0.11 252)",
        border: "oklch(0.52 0.11 252)",
        destructive: "oklch(0.86 0.09 27)",
      }),
      inverse: surface({
        background: "oklch(0.22 0.03 250)",
        foreground: "oklch(0.97 0.006 85)",
        muted: "oklch(0.28 0.03 250)",
        mutedForeground: "oklch(0.8 0.02 250)",
        primary: "oklch(0.8 0.1 240)",
        primaryForeground: "oklch(0.2 0.04 250)",
        border: "oklch(0.36 0.03 250)",
        destructive: "oklch(0.75 0.14 27)",
      }),
    },
    dark: {
      default: surface({
        background: "oklch(0.19 0.02 250)",
        foreground: "oklch(0.95 0.006 85)",
        muted: "oklch(0.24 0.022 250)",
        mutedForeground: "oklch(0.76 0.02 250)",
        primary: "oklch(0.76 0.11 245)",
        primaryForeground: "oklch(0.18 0.03 250)",
        border: "oklch(0.32 0.022 250)",
        destructive: "oklch(0.7 0.17 27)",
      }),
      muted: surface({
        background: "oklch(0.23 0.022 250)",
        foreground: "oklch(0.95 0.006 85)",
        muted: "oklch(0.28 0.024 250)",
        mutedForeground: "oklch(0.78 0.02 250)",
        primary: "oklch(0.78 0.11 245)",
        primaryForeground: "oklch(0.18 0.03 250)",
        border: "oklch(0.35 0.024 250)",
        destructive: "oklch(0.72 0.17 27)",
      }),
      brand: surface({
        background: "oklch(0.33 0.1 252)",
        foreground: "oklch(0.97 0.006 85)",
        muted: "oklch(0.38 0.1 252)",
        mutedForeground: "oklch(0.88 0.03 252)",
        primary: "oklch(0.97 0.006 85)",
        primaryForeground: "oklch(0.3 0.1 252)",
        border: "oklch(0.45 0.1 252)",
        destructive: "oklch(0.84 0.09 27)",
      }),
      inverse: surface({
        background: "oklch(0.95 0.006 85)",
        foreground: "oklch(0.22 0.03 250)",
        muted: "oklch(0.91 0.01 85)",
        mutedForeground: "oklch(0.44 0.03 250)",
        primary: "oklch(0.46 0.13 252)",
        primaryForeground: "oklch(0.99 0.004 85)",
        border: "oklch(0.85 0.012 85)",
        destructive: "oklch(0.52 0.2 27)",
      }),
    },
  },
  fonts: {
    heading: "ui-serif, Georgia, 'Times New Roman', serif",
    body: "system-ui, -apple-system, 'Segoe UI', Roboto, sans-serif",
  },
  typeScale: "major-third",
  headingWeight: 600,
  radius: "medium",
  shadow: "soft",
  density: "comfortable",
  imageCorners: "rounded",
  motion: true,
} as const satisfies ResolvedTheme;

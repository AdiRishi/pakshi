import { Schema, SchemaGetter } from "effect";

import { addedSurfaces } from "./palette.ts";
import { CurrentResolvedTheme, FirstResolvedTheme, upgradeStyle } from "./theme.ts";
import type { ResolvedTheme as Resolved } from "./theme.ts";

/**
 * A theme with its palette generated: what snapshots carry and pages render
 * with. Every value is one `themeCss` can write into a declaration. A theme
 * of the first schema reads with the surfaces it lacked generated from its
 * own colors.
 */
export const ResolvedTheme = Schema.Union([
  CurrentResolvedTheme,
  FirstResolvedTheme.pipe(
    Schema.decodeTo(CurrentResolvedTheme, {
      decode: SchemaGetter.transform((first) => {
        const upgraded = upgradeStyle(first);
        const added = addedSurfaces(first.colors, upgraded.cards);
        return {
          ...upgraded,
          schema: "pakshi.theme/2" as const,
          colors: {
            light: { ...first.colors.light, ...added.light },
            dark: { ...first.colors.dark, ...added.dark },
          },
        };
      }),
      encode: SchemaGetter.forbidden(() => "Themes are written in the current schema"),
    }),
  ),
]);
export type ResolvedTheme = Resolved;

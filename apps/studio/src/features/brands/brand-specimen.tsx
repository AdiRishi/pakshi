import {
  type ColorScheme,
  fontCatalog,
  type ResolvedTheme,
  scopedThemeVariables,
  type Surface,
  themeFontFaces,
} from "@repo/tokens";
import { cn } from "cn";
import { MoonIcon, SunIcon } from "lucide-react";
import { type ReactNode, useId } from "react";

import { schemeTitles, surfaceTitles } from "./surfaces";

/** The addresses of a brand's logo, and of its logo for dark backgrounds when it has one. */
interface SpecimenLogo {
  readonly light: string;
  readonly onDark: string | null;
}

const surfaces = ["default", "muted", "brand", "inverse"] as const satisfies ReadonlyArray<Surface>;

/** The fonts a theme sets headings and text in, by name. */
const fontPairing = (fonts: ResolvedTheme["fonts"]) =>
  fonts.heading === fonts.body
    ? `Headings and text in ${fontCatalog[fonts.body].family}`
    : `Headings in ${fontCatalog[fonts.heading].family}, text in ${fontCatalog[fonts.body].family}`;

const headingFont =
  "font-(family-name:--theme-font-heading) [font-weight:var(--theme-heading-weight)]";

/** A brand's logo on one color scheme's page background. */
function LogoHalf(props: { readonly scope: string; readonly src: string }) {
  return (
    <div data-brand-theme={props.scope} className="flex h-14 items-center bg-background px-5">
      <img src={props.src} alt="" className="h-7 w-auto max-w-full object-contain object-left" />
    </div>
  );
}

/** A color scheme's four surfaces, each shaped by the theme's corners and shadow. */
function Palette(props: { readonly scope: string; readonly scheme: ColorScheme }) {
  const Icon = props.scheme === "light" ? SunIcon : MoonIcon;
  return (
    <div
      data-brand-theme={props.scope}
      title={`${schemeTitles[props.scheme]} mode colors`}
      className="flex items-center gap-2 bg-background px-3 py-3 text-muted-foreground"
    >
      <Icon className="size-3.5 shrink-0" />
      <div className="grid flex-1 grid-cols-[repeat(4,minmax(0,--spacing(7)))] gap-1.5">
        {surfaces.map((surface) => (
          <span
            key={surface}
            data-surface={surface}
            title={`${schemeTitles[props.scheme]} mode, ${surfaceTitles[surface]}`}
            className={cn(
              "flex aspect-square items-center justify-center rounded-(--theme-radius) border bg-background text-xs text-foreground shadow-(--theme-shadow)",
              headingFont,
            )}
          >
            Aa
          </span>
        ))}
      </div>
    </div>
  );
}

/**
 * A brand at a glance, drawn with its own theme as its sites render it: its
 * logos in light and dark, its name on its brand color in its heading font,
 * the fonts it uses, and each color scheme's surfaces in its corners and
 * shadow. It loads the theme's fonts itself.
 */
export function BrandSpecimen(props: {
  readonly theme: ResolvedTheme;
  readonly logo: SpecimenLogo | null;
  /** The brand's name, in the element the place it shows in needs. */
  readonly name: ReactNode;
  readonly className?: string;
}) {
  const id = useId();
  const scope = (scheme: ColorScheme) => `${id}-${scheme}`;
  const { theme } = props;
  const css = [
    themeFontFaces(theme),
    ...(["light", "dark"] as const).map((scheme) =>
      scopedThemeVariables(theme, scheme, `[data-brand-theme="${scope(scheme)}"]`),
    ),
  ].join("\n");
  return (
    <div
      className={cn(
        "grid grid-cols-2 overflow-clip",
        props.logo === null ? "grid-rows-[1fr_auto]" : "grid-rows-[auto_1fr_auto]",
        props.className,
      )}
    >
      <style>{css}</style>
      {props.logo !== null && (
        <>
          <LogoHalf scope={scope("light")} src={props.logo.light} />
          <LogoHalf scope={scope("dark")} src={props.logo.onDark ?? props.logo.light} />
        </>
      )}
      <div data-brand-theme={scope("light")} className="col-span-2 grid">
        <div
          data-surface="brand"
          className="flex min-h-28 flex-col justify-end gap-1.5 bg-background px-5 pt-6 pb-5 text-foreground"
        >
          <div className={cn("line-clamp-2 text-3xl leading-tight text-balance", headingFont)}>
            {props.name}
          </div>
          <p className="font-(family-name:--theme-font-body) text-sm text-muted-foreground">
            {fontPairing(theme.fonts)}
          </p>
        </div>
      </div>
      <Palette scope={scope("light")} scheme="light" />
      <Palette scope={scope("dark")} scheme="dark" />
    </div>
  );
}

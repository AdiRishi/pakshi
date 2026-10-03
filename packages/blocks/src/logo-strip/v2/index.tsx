import { cx } from "class-variance-authority";
import type { ReactNode } from "react";

import { type BlockComponentProps, defineBlock } from "../../block.tsx";
import { Media, SiteImage, Text, useHref } from "../../components.tsx";
import { choice, link, list, media, optional, text } from "../../fields.ts";
import { Marquee } from "../../kit/marquee.tsx";
import { Section } from "../../kit/section.tsx";
import placeholder from "./fixtures/placeholder.json" with { type: "json" };

const props = {
  heading: optional(text({ title: "Caption", max: 80 })),
  logos: list({
    title: "Logos",
    item: {
      logo: media({ title: "Logo" }),
      link: optional(link({ title: "Link" })),
    },
    min: 2,
    max: 12,
  }),
  color: choice({ title: "Logo colors", options: ["mono", "original"] }),
};

type Variant = "row" | "grid" | "marquee" | "split";
type LogoStrip = BlockComponentProps<typeof props, Variant>["props"];
type Logo = LogoStrip["logos"][number];

/*
 * Single-color logos sit back as grays on a light surface and turn white on a
 * dark one, so logos of every color read as one set; each comes up to full
 * strength under the pointer. The surface says whether it's dark through
 * `--theme-on-dark`, which a style query reads.
 */
const colors = {
  mono: "logo-ink opacity-60 transition-opacity hover:opacity-100",
  original: "",
} as const satisfies Record<LogoStrip["color"], string>;

const logoClass = (strip: LogoStrip) =>
  cx("h-10 w-auto max-w-44 object-contain md:h-12 md:max-w-52", colors[strip.color]);

/** Columns of the grid on a large screen, indexed by how many logos there are, so rows come out even. */
const gridColumns = [
  undefined,
  undefined,
  "lg:grid-cols-2",
  "lg:grid-cols-3",
  "lg:grid-cols-4",
  "lg:grid-cols-5",
  "lg:grid-cols-3",
  "lg:grid-cols-4",
  "lg:grid-cols-4",
  "lg:grid-cols-3",
  "lg:grid-cols-5",
  "lg:grid-cols-4",
  "lg:grid-cols-4",
] as const;

const LogoLink = ({
  link: target,
  children,
}: {
  readonly link: NonNullable<Logo["link"]>;
  readonly children: ReactNode;
}) => (
  <a
    href={useHref(target)}
    className="rounded-sm focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-ring"
  >
    {children}
  </a>
);

const LogoImage = ({ strip, item }: { readonly strip: LogoStrip; readonly item: Logo }) => {
  const image = (
    <Media
      field={["logos", item.id, "logo"]}
      value={item.logo}
      sizes="13rem"
      className={logoClass(strip)}
    />
  );
  return item.link ? <LogoLink link={item.link}>{image}</LogoLink> : image;
};

const Caption = ({
  strip,
  className,
}: {
  readonly strip: LogoStrip;
  readonly className?: string;
}) =>
  strip.heading ? (
    <Text
      field="heading"
      as="h2"
      value={strip.heading}
      className={cx("text-body font-body font-medium text-muted-foreground", className)}
    />
  ) : null;

const LogoStripBlock = ({ props: strip, variant }: BlockComponentProps<typeof props, Variant>) => {
  switch (variant) {
    case "row":
      return (
        <Section spacing="flush" className="py-16 md:py-24">
          <div className="page-width flex flex-col items-center gap-10">
            <Caption strip={strip} className="text-center" />
            <ul className="grid w-full grid-cols-2 items-center justify-items-center gap-x-6 gap-y-8 sm:flex sm:flex-wrap sm:justify-center sm:gap-x-14 lg:justify-between">
              {strip.logos.map((item) => (
                <li key={item.id} className="flex">
                  <LogoImage strip={strip} item={item} />
                </li>
              ))}
            </ul>
          </div>
        </Section>
      );
    case "grid":
      return (
        <Section spacing="flush" className="py-16 md:py-24">
          <div className="page-width flex flex-col gap-10">
            <Caption strip={strip} />
            <ul
              className={cx(
                "grid grid-cols-2 ps-px pt-px sm:grid-cols-3",
                gridColumns[strip.logos.length],
              )}
            >
              {strip.logos.map((item) => (
                <li
                  key={item.id}
                  className="-ms-px -mt-px flex items-center justify-center border border-foreground/10 px-6 py-10 md:py-12"
                >
                  <LogoImage strip={strip} item={item} />
                </li>
              ))}
            </ul>
          </div>
        </Section>
      );
    case "marquee":
      return (
        <Section spacing="flush" className="py-16 md:py-24">
          <div className="flex flex-col items-center gap-10">
            <Caption strip={strip} className="page-width text-center" />
            <div className="w-full">
              <Marquee
                className="gap-16 pe-16 md:gap-24 md:pe-24"
                items={strip.logos.map((item) => (
                  <LogoImage key={item.id} strip={strip} item={item} />
                ))}
                copies={strip.logos.map((item) => (
                  <SiteImage
                    key={item.id}
                    value={item.logo}
                    sizes="13rem"
                    className={logoClass(strip)}
                  />
                ))}
              />
            </div>
          </div>
        </Section>
      );
    case "split":
      return (
        <Section spacing="flush" className="py-16 md:py-24">
          <div className="page-width flex flex-col gap-8 lg:flex-row lg:items-center lg:gap-16">
            <Caption strip={strip} className="max-w-xs shrink-0 text-balance lg:w-1/4" />
            <ul className="flex flex-1 flex-wrap items-center gap-x-12 gap-y-8 lg:justify-between">
              {strip.logos.map((item) => (
                <li key={item.id} className="flex">
                  <LogoImage strip={strip} item={item} />
                </li>
              ))}
            </ul>
          </div>
        </Section>
      );
  }
};

export default defineBlock({
  type: "logo-strip",
  version: 2,
  title: "Logo strip",
  placement: "section",
  props,
  variants: ["row", "grid", "marquee", "split"],
  surfaces: ["default", "muted", "tint", "brand", "accent", "inverse"],
  slots: {},
  agent: {
    purpose:
      "Logos of partners, sponsors or funders, under a short caption such as Supported by. Each logo's alt text is the organisation's name",
    avoid: [
      "photos that aren't logos",
      "a single logo",
      "a caption longer than a short line",
      "a moving row of fewer than four logos",
    ],
  },
  placeholder,
  component: LogoStripBlock,
});

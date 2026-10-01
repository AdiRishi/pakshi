import type { ReactNode } from "react";

import { type BlockComponentProps, defineBlock } from "../../block.tsx";
import { Media, Root, Text, useHref } from "../../components.tsx";
import { link, list, media, optional, type PropsOf, text } from "../../fields.ts";
import placeholder from "./fixtures/placeholder.json" with { type: "json" };

const props = {
  heading: optional(text({ title: "Heading", max: 80 })),
  logos: list({
    title: "Logos",
    item: {
      logo: media({ title: "Logo" }),
      link: optional(link({ title: "Link" })),
    },
    min: 2,
    max: 12,
  }),
};

type Logo = PropsOf<typeof props>["logos"][number];

const LogoLink = ({
  link: target,
  children,
}: {
  readonly link: NonNullable<Logo["link"]>;
  readonly children: ReactNode;
}) => (
  <a
    href={useHref(target)}
    className="rounded-sm transition-opacity hover:opacity-80 focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-ring"
  >
    {children}
  </a>
);

const LogoStrip = ({
  props: strip,
  variant,
}: BlockComponentProps<typeof props, "row" | "grid">) => (
  <Root className="py-section bg-background px-6 text-foreground">
    <div className="mx-auto flex max-w-6xl flex-col items-center gap-10">
      {strip.heading && (
        <Text
          field="heading"
          as="h2"
          value={strip.heading}
          className="text-heading text-center text-balance text-muted-foreground"
        />
      )}
      <ul
        className={
          variant === "row"
            ? "flex flex-wrap items-center justify-center gap-x-12 gap-y-8"
            : "grid w-full grid-cols-2 items-center justify-items-center gap-8 sm:grid-cols-3 lg:grid-cols-4"
        }
      >
        {strip.logos.map((item) => {
          const image = (
            <Media
              field={["logos", item.id, "logo"]}
              value={item.logo}
              sizes="10rem"
              className="h-12 w-40 object-contain"
            />
          );
          return (
            <li key={item.id} className="flex">
              {item.link ? <LogoLink link={item.link}>{image}</LogoLink> : image}
            </li>
          );
        })}
      </ul>
    </div>
  </Root>
);

export default defineBlock({
  type: "logo-strip",
  version: 1,
  title: "Logo strip",
  placement: "section",
  props,
  variants: ["row", "grid"],
  surfaces: ["default", "muted", "brand", "inverse"],
  slots: {},
  interactive: false,
  agent: {
    purpose:
      "Logos of partners, sponsors or funders. Each logo's alt text is the organisation's name",
    avoid: ["photos that aren't logos", "a single logo"],
  },
  placeholder,
  component: LogoStrip,
});

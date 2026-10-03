import { cx } from "class-variance-authority";

import { type BlockComponentProps, defineBlock } from "../../block.tsx";
import { FormView, Media, RichText, Text, useHref } from "../../components.tsx";
import { choice, cta, form, link, list, media, optional, richText, text } from "../../fields.ts";
import { Actions } from "../../kit/actions.tsx";
import { Frame, frameImageClass } from "../../kit/frame.tsx";
import { Icon } from "../../kit/icon.tsx";
import { Heading } from "../../kit/intro.tsx";
import { BorderBeam } from "../../kit/magic/border-beam.tsx";
import { ShinyText } from "../../kit/magic/shiny-text.tsx";
import { Section } from "../../kit/section.tsx";
import placeholder from "./fixtures/placeholder.json" with { type: "json" };

const props = {
  badge: optional(text({ title: "Announcement", max: 60 })),
  badgeLink: optional(link({ title: "Announcement link" })),
  kicker: optional(text({ title: "Line above the heading", max: 40 })),
  heading: text({ title: "Heading", min: 3, max: 90 }),
  headingRest: optional(text({ title: "Rest of the heading", max: 140 })),
  body: optional(richText({ title: "Text", marks: ["bold", "italic", "link"] })),
  actions: list({ title: "Buttons", item: { button: cta({ title: "Button" }) }, min: 0, max: 2 }),
  points: list({
    title: "Points",
    item: { point: text({ title: "Point", max: 60 }) },
    min: 0,
    max: 4,
  }),
  signup: optional(form({ title: "Sign-up form" })),
  proof: optional(text({ title: "Proof line", max: 80 })),
  proofImages: optional(
    list({ title: "Proof photos", item: { photo: media({ title: "Photo" }) }, min: 0, max: 5 }),
  ),
  image: optional(media({ title: "Image" })),
  align: choice({ title: "Alignment", options: ["center", "start"] }),
  mediaSide: choice({ title: "Image side", options: ["end", "start"] }),
  height: choice({ title: "Height", options: ["auto", "tall", "screen"] }),
  frame: choice({ title: "Image style", options: ["plain", "framed", "browser", "phone"] }),
  backdrop: choice({
    title: "Backdrop",
    options: ["none", "glow", "arc", "grid", "dots", "stripes", "noise"],
  }),
};

type Variant = "stacked" | "split" | "cover" | "editorial" | "panel";
type Hero = BlockComponentProps<typeof props, Variant>["props"];

const heights = {
  auto: "min-h-130",
  tall: "min-h-180",
  screen: "min-h-svh",
} as const satisfies Record<Hero["height"], string>;

/** A short line in a pill above the heading, which links on when it has somewhere to go. */
const Badge = ({ hero }: { readonly hero: Hero }) => {
  const href = useHref(hero.badgeLink ?? "#");
  if (!hero.badge) return null;
  const pill =
    "inline-flex items-center gap-2 rounded-full border border-foreground/12 bg-background/70 px-4 py-1.5 text-small backdrop-blur-sm";
  const words = (
    <ShinyText className="text-foreground/75">
      <Text field="badge" as="span" value={hero.badge} />
    </ShinyText>
  );
  return hero.badgeLink === undefined ? (
    <p className={pill}>{words}</p>
  ) : (
    <a
      href={href}
      className={cx(
        pill,
        "group/badge transition-colors hover:border-foreground/25 hover:bg-background focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring",
      )}
    >
      {words}
      <Icon
        name="arrow-right"
        className="size-3.5 text-muted-foreground transition-transform group-hover/badge:translate-x-0.5 motion-reduce:transition-none"
      />
    </a>
  );
};

/** The short line above the heading, which a band of light crosses now and then. */
const Kicker = ({ hero }: { readonly hero: Hero }) =>
  hero.kicker ? (
    <p className="kicker">
      <ShinyText className="text-primary/85">
        <Text field="kicker" as="span" value={hero.kicker} />
      </ShinyText>
    </p>
  ) : null;

const Points = ({ hero, center }: { readonly hero: Hero; readonly center: boolean }) =>
  hero.points.length === 0 ? null : (
    <ul
      className={cx(
        "flex flex-wrap gap-x-6 gap-y-2 text-small text-muted-foreground",
        center && "justify-center",
      )}
    >
      {hero.points.map((item) => (
        <li key={item.id} className="flex items-center gap-2">
          <Icon name="circle-check" className="size-4 shrink-0 text-primary" />
          <Text field={["points", item.id, "point"]} as="span" value={item.point} />
        </li>
      ))}
    </ul>
  );

/** A line of proof, such as how many people use it, beside a few of their faces. */
const Proof = ({ hero, center }: { readonly hero: Hero; readonly center: boolean }) =>
  hero.proof === undefined ? null : (
    <div className={cx("flex items-center gap-3", center && "justify-center")}>
      {hero.proofImages !== undefined && hero.proofImages.length > 0 && (
        <ul className="flex -space-x-2.5">
          {hero.proofImages.map((item) => (
            <li key={item.id}>
              <Media
                field={["proofImages", item.id, "photo"]}
                value={item.photo}
                sizes="2.25rem"
                className="size-9 rounded-full object-cover ring-2 ring-background"
              />
            </li>
          ))}
        </ul>
      )}
      <Text field="proof" as="p" value={hero.proof} className="text-small text-muted-foreground" />
    </div>
  );

/** The hero's words and buttons, centred or set to the start. */
const Copy = ({
  hero,
  center,
  half = false,
  className,
}: {
  readonly hero: Hero;
  readonly center: boolean;
  /** Whether the words share the width with a picture. */
  readonly half?: boolean;
  readonly className?: string;
}) => (
  <div
    className={cx(
      "flex flex-col gap-6",
      center ? "mx-auto max-w-4xl items-center text-center" : "max-w-3xl items-start",
      className,
    )}
  >
    <Badge hero={hero} />
    <div className={cx("flex flex-col gap-4", center && "items-center")}>
      <Kicker hero={hero} />
      <Heading
        as="h1"
        heading={hero.heading}
        headingRest={hero.headingRest}
        size={half ? "display-half" : "display"}
      />
    </div>
    {hero.body && (
      <RichText
        field="body"
        value={hero.body}
        className={cx(
          "text-lead max-w-2xl text-muted-foreground [&_a]:text-primary [&_a]:underline [&_p+p]:mt-4",
          center && "mx-auto",
        )}
      />
    )}
    {hero.signup === undefined ? (
      <Actions
        actions={hero.actions}
        size="lg"
        align={center ? "center" : "start"}
        className="mt-2"
      />
    ) : (
      <FormView
        field="signup"
        value={hero.signup}
        layout="inline"
        className={cx("mt-2 w-full max-w-md", center && "mx-auto")}
      />
    )}
    <Points hero={hero} center={center} />
    <Proof hero={hero} center={center} />
  </div>
);

const showcases = new Set<Hero["frame"]>(["framed", "browser"]);

/**
 * The hero's image, plain, on a tray, in a browser window or on a phone. A
 * screenshot on a tray or in a window gets a glow beneath it and a beam of
 * light round its edge.
 */
const Picture = ({
  hero,
  className,
  sizes,
}: {
  readonly hero: Hero;
  readonly className: string;
  readonly sizes: string;
}) => {
  if (hero.image === undefined) return null;
  const showcase = showcases.has(hero.frame);
  const picture = (
    <Frame kind={hero.frame} className={cx(showcase && "relative")}>
      <Media
        field="image"
        value={hero.image}
        priority
        sizes={hero.frame === "phone" ? "19rem" : sizes}
        className={cx(
          frameImageClass(hero.frame),
          hero.frame !== "phone" && className,
          hero.frame === "plain" && "outline-1 -outline-offset-1 outline-foreground/10",
        )}
      />
      {showcase && <BorderBeam duration={10} />}
    </Frame>
  );
  return showcase ? (
    <div className="relative">
      <div
        aria-hidden
        className="absolute -inset-x-4 top-1/3 -bottom-12 -z-10 rounded-full bg-primary/30 blur-3xl"
      />
      {picture}
    </div>
  ) : (
    picture
  );
};

/**
 * The opening of a page: an announcement, the heading, a sentence or two and
 * one main button or a sign-up form, over, beside, on or under a picture.
 */
const Hero = ({ props: hero, variant }: BlockComponentProps<typeof props, Variant>) => {
  const center = hero.align === "center";
  switch (variant) {
    case "stacked":
      return (
        <Section backdrop={hero.backdrop}>
          <div className="page-width flex flex-col gap-16 md:gap-20">
            <Copy hero={hero} center={center} />
            <Picture hero={hero} className="aspect-video" sizes="(min-width: 90rem) 88rem, 100vw" />
          </div>
        </Section>
      );
    case "split":
      return (
        <Section backdrop={hero.backdrop}>
          <div className="page-width grid items-center gap-12 md:grid-cols-2 lg:gap-20">
            <Copy hero={hero} center={false} half />
            <div className={hero.mediaSide === "start" ? "md:order-first" : undefined}>
              <Picture
                hero={hero}
                className="aspect-square lg:aspect-4/5"
                sizes="(min-width: 48rem) 50vw, 100vw"
              />
            </div>
          </div>
        </Section>
      );
    case "editorial":
      return (
        <Section backdrop={hero.backdrop}>
          <div className="page-width flex flex-col gap-16 md:gap-20">
            <div className="flex flex-col gap-10">
              <div className="flex flex-col items-start gap-4">
                <Badge hero={hero} />
                <Kicker hero={hero} />
                <Heading
                  as="h1"
                  heading={hero.heading}
                  headingRest={hero.headingRest}
                  size="jumbo"
                  className="max-w-6xl"
                />
              </div>
              <div className="grid items-end gap-8 md:grid-cols-2">
                <div className="flex flex-col gap-6">
                  {hero.body && (
                    <RichText
                      field="body"
                      value={hero.body}
                      className="text-lead max-w-xl text-muted-foreground [&_a]:text-primary [&_a]:underline [&_p+p]:mt-4"
                    />
                  )}
                  <Points hero={hero} center={false} />
                </div>
                {hero.signup === undefined ? (
                  <Actions actions={hero.actions} size="lg" className="md:justify-end" />
                ) : (
                  <FormView
                    field="signup"
                    value={hero.signup}
                    layout="inline"
                    className="w-full max-w-md md:justify-self-end"
                  />
                )}
              </div>
            </div>
            <Picture hero={hero} className="aspect-video" sizes="(min-width: 90rem) 88rem, 100vw" />
          </div>
        </Section>
      );
    case "cover":
      return (
        <Section
          spacing="flush"
          className={cx("flex", heights[hero.height], center ? "items-center" : "items-end")}
        >
          {hero.image && (
            <Media
              field="image"
              value={hero.image}
              priority
              sizes="100vw"
              className="absolute inset-0 -z-20 size-full object-cover"
            />
          )}
          <div
            aria-hidden
            className={cx(
              "absolute inset-0 -z-10",
              center
                ? "bg-background/55"
                : "bg-linear-to-t from-background/90 via-background/55 to-background/35",
            )}
          />
          <div className="page-width py-section">
            <Copy hero={hero} center={center} />
          </div>
        </Section>
      );
    case "panel":
      return (
        <Section spacing="flush" className="grid md:grid-cols-2">
          {hero.image && (
            <div
              className={cx(
                "relative min-h-90 md:min-h-full",
                hero.mediaSide === "end" && "md:order-last",
              )}
            >
              <Media
                field="image"
                value={hero.image}
                priority
                sizes="(min-width: 48rem) 50vw, 100vw"
                className="absolute inset-0 size-full object-cover"
              />
            </div>
          )}
          <div
            className={cx(
              "flex items-center px-gutter py-section md:px-16 lg:px-24",
              heights[hero.height],
            )}
          >
            <Copy hero={hero} center={false} half />
          </div>
        </Section>
      );
  }
};

export default defineBlock({
  type: "hero",
  version: 4,
  title: "Hero",
  placement: "section",
  props,
  variants: ["stacked", "split", "cover", "editorial", "panel"],
  surfaces: ["default", "muted", "tint", "brand", "accent", "inverse"],
  slots: {},
  agent: {
    purpose:
      "Opening of a page: what it is, in a heading and a sentence or two, with one main button and at most one more",
    avoid: [
      "more than one per page",
      "a second button that competes with the first",
      "a heading longer than a short sentence; put the rest in the rest of the heading or the text",
    ],
  },
  placeholder,
  component: Hero,
});

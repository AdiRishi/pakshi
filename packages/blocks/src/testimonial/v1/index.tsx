import { type BlockComponentProps, defineBlock } from "../../block.tsx";
import { Media, Root, Text } from "../../components.tsx";
import { media, optional, text } from "../../fields.ts";
import placeholder from "./fixtures/placeholder.json" with { type: "json" };

const props = {
  quote: text({ title: "Quote", min: 3, max: 320, multiline: true }),
  name: text({ title: "Name", max: 80 }),
  role: optional(text({ title: "Role", max: 80 })),
  avatar: optional(media({ title: "Photo" })),
  logo: optional(media({ title: "Logo" })),
};

/*
 * A logo is drawn in one ink, the way a wall of them reads as a set: dark on
 * a light surface and light on a dark one, which the surface's
 * --theme-on-dark says. A browser without style queries leaves it dark.
 */
const logoInk = "h-8 w-auto self-start object-contain logo-ink opacity-75";

/** The first letters of someone's first and last names, such as "PS" for Priya Shah. */
const initials = (name: string) => {
  const words = name.trim().split(/\s+/);
  const last = words.length > 1 ? words.at(-1) : undefined;
  return `${words[0]?.charAt(0) ?? ""}${last?.charAt(0) ?? ""}`.toUpperCase();
};

/**
 * One person's words, with their name and role under them beside their photo,
 * or their initials on a disc of the brand's color when there's no photo.
 * The section it sits in sets it on a card or under a line.
 */
const Testimonial = ({ props: item }: BlockComponentProps<typeof props, "default">) => (
  <Root as="li" className="flex">
    <figure className="flex flex-1 flex-col gap-6">
      {item.logo && <Media field="logo" value={item.logo} sizes="8rem" className={logoInk} />}
      <blockquote className="flex-1">
        <Text
          field="quote"
          as="p"
          value={item.quote}
          className="text-body text-pretty whitespace-pre-line text-foreground"
        />
      </blockquote>
      <figcaption className="flex items-center gap-3">
        {item.avatar ? (
          <Media
            field="avatar"
            value={item.avatar}
            sizes="2.75rem"
            className="size-11 shrink-0 rounded-full object-cover ring-2 ring-background"
          />
        ) : (
          <span
            aria-hidden
            className="text-small grid size-11 shrink-0 place-items-center rounded-full bg-primary/12 font-semibold text-primary"
          >
            {initials(item.name)}
          </span>
        )}
        <div className="flex min-w-0 flex-col">
          <Text field="name" as="p" value={item.name} className="text-small font-semibold" />
          {item.role && (
            <Text
              field="role"
              as="p"
              value={item.role}
              className="text-small text-muted-foreground"
            />
          )}
        </div>
      </figcaption>
    </figure>
  </Root>
);

export default defineBlock({
  type: "testimonial",
  version: 1,
  title: "Testimonial",
  placement: "item",
  props,
  variants: ["default"],
  agent: {
    purpose:
      "One person's words in a testimonials section: a sentence or a short paragraph, their name and role, and their photo or their organisation's logo if you have them",
    avoid: ["words or names nobody gave you", "a photo of anyone other than the person quoted"],
  },
  placeholder,
  component: Testimonial,
});

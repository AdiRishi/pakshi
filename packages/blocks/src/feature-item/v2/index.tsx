import { type BlockComponentProps, defineBlock } from "../../block.tsx";
import { Cta, Media, Root, Text } from "../../components.tsx";
import { cta, icon, media, optional, text } from "../../fields.ts";
import { buttonClass } from "../../kit/button.ts";
import { Icon } from "../../kit/icon.tsx";
import placeholder from "./fixtures/placeholder.json" with { type: "json" };

const props = {
  icon: optional(icon({ title: "Icon" })),
  image: optional(media({ title: "Image" })),
  title: text({ title: "Title", max: 60 }),
  body: text({ title: "Text", max: 280, multiline: true }),
  link: optional(cta({ title: "Link" })),
};

const FeatureItem = ({ props: item }: BlockComponentProps<typeof props, "default">) => (
  <Root as="li" className="flex flex-col gap-5">
    {item.image && (
      <Media
        field="image"
        value={item.image}
        sizes="(min-width: 64rem) 33vw, (min-width: 40rem) 50vw, 100vw"
        className="rounded-image aspect-3/2 w-full object-cover outline-1 -outline-offset-1 outline-foreground/10"
      />
    )}
    {item.icon && (
      <span className="inline-flex size-11 shrink-0 items-center justify-center rounded-lg bg-primary/10 text-primary ring-1 ring-primary/15 ring-inset">
        <Icon name={item.icon} className="size-5" />
      </span>
    )}
    <div className="flex flex-1 flex-col gap-2">
      <Text field="title" as="h3" value={item.title} className="text-heading" />
      <Text
        field="body"
        as="p"
        value={item.body}
        className="text-body whitespace-pre-line text-muted-foreground"
      />
      {item.link && (
        <Cta
          field="link"
          value={item.link}
          className={buttonClass({ variant: "link", size: "sm", className: "mt-2 self-start" })}
        />
      )}
    </div>
  </Root>
);

export default defineBlock({
  type: "feature-item",
  version: 2,
  title: "Feature",
  placement: "item",
  props,
  variants: ["default"],
  agent: {
    purpose:
      "One point in a feature grid: a short title and a sentence or two, with an icon or a picture if it helps",
    avoid: ["both an icon and a picture on one feature"],
  },
  placeholder,
  component: FeatureItem,
});

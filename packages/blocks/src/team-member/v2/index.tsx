import { cx } from "class-variance-authority";

import { type BlockComponentProps, defineBlock } from "../../block.tsx";
import { Media, Root, Text, useHref } from "../../components.tsx";
import { link, media, optional, text } from "../../fields.ts";
import { Icon } from "../../kit/icon.tsx";
import placeholder from "./fixtures/placeholder.json" with { type: "json" };

const props = {
  image: optional(media({ title: "Photo" })),
  name: text({ title: "Name", max: 80 }),
  role: text({ title: "Role", max: 80 }),
  bio: optional(text({ title: "Short bio", max: 240, multiline: true })),
  link: optional(link({ title: "Profile link" })),
};

type Member = BlockComponentProps<typeof props, "default">["props"];

/*
 * A team grid marks its layout with `data-team`: a portrait with the words
 * under it (the default, and what a person shows on their own), a row with
 * a small round photo, or the words over the bottom of a tall portrait.
 */
const card = cx(
  "relative isolate flex flex-col gap-2",
  "in-data-[team=list]:grid in-data-[team=list]:grid-cols-[auto_minmax(0,1fr)] in-data-[team=list]:items-start in-data-[team=list]:gap-x-5 in-data-[team=list]:gap-y-3 in-data-[team=list]:border-t in-data-[team=list]:border-border in-data-[team=list]:py-7",
  "md:in-data-[team=list]:grid-cols-[auto_minmax(0,2fr)_minmax(0,3fr)] md:in-data-[team=list]:gap-x-10",
  "in-data-[team=overlay]:aspect-3/4 in-data-[team=overlay]:justify-end in-data-[team=overlay]:gap-0 in-data-[team=overlay]:overflow-hidden in-data-[team=overlay]:rounded-image in-data-[team=overlay]:bg-muted in-data-[team=overlay]:p-5 md:in-data-[team=overlay]:p-6",
);

const picture = cx(
  "mb-2 aspect-4/5 w-full rounded-image bg-foreground/5 object-cover",
  "in-data-[team=list]:mb-0 in-data-[team=list]:size-14 in-data-[team=list]:rounded-full md:in-data-[team=list]:size-16",
  "in-data-[team=overlay]:absolute in-data-[team=overlay]:inset-0 in-data-[team=overlay]:-z-20 in-data-[team=overlay]:mb-0 in-data-[team=overlay]:size-full in-data-[team=overlay]:rounded-none",
);

/** The first letters of a name's first and last words, such as "RH" for Ruth Hollis. */
const initials = (name: string) => {
  const words = name.trim().split(/\s+/);
  return [words[0], words.length > 1 ? words.at(-1) : undefined]
    .map((word) => word?.charAt(0) ?? "")
    .join("")
    .toUpperCase();
};

const Name = ({ member }: { readonly member: Member }) => {
  const href = useHref(member.link ?? "#");
  const words = <Text field="name" as="span" value={member.name} />;
  return (
    <h3 className="text-heading in-data-[team=list]:text-lead in-data-[team=list]:font-heading">
      {member.link === undefined ? (
        words
      ) : (
        <a
          href={href}
          className="group/link inline-flex items-baseline gap-1.5 rounded-sm decoration-1 underline-offset-4 hover:underline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring"
        >
          {words}
          <Icon
            name="arrow-up-right"
            className="size-4 shrink-0 self-center text-muted-foreground transition-transform group-hover/link:translate-x-0.5 group-hover/link:-translate-y-0.5"
          />
        </a>
      )}
    </h3>
  );
};

const TeamMember = ({ props: member }: BlockComponentProps<typeof props, "default">) => (
  <Root as="li" className={card}>
    {member.image ? (
      <Media
        field="image"
        value={member.image}
        sizes="(min-width: 64rem) 25vw, (min-width: 48rem) 50vw, 80vw"
        className={picture}
      />
    ) : (
      <span
        aria-hidden
        className={cx(
          picture,
          "flex items-center justify-center font-heading text-title text-muted-foreground",
          "in-data-[team=list]:text-body",
        )}
      >
        {initials(member.name)}
      </span>
    )}
    <span
      aria-hidden
      className="absolute inset-x-0 bottom-0 -z-10 hidden h-3/5 bg-linear-to-t from-background via-background/85 via-35% to-transparent in-data-[team=overlay]:block"
    />
    <div className="flex flex-col gap-1">
      <Name member={member} />
      <Text field="role" as="p" value={member.role} className="text-body text-muted-foreground" />
    </div>
    {member.bio && (
      <Text
        field="bio"
        as="p"
        value={member.bio}
        className={cx(
          "text-small whitespace-pre-line text-muted-foreground",
          "in-data-[team=list]:col-start-2 in-data-[team=list]:text-body md:in-data-[team=list]:col-start-3 md:in-data-[team=list]:row-start-1",
          "in-data-[team=overlay]:mt-3 in-data-[team=overlay]:text-foreground/80",
        )}
      />
    )}
  </Root>
);

export default defineBlock({
  type: "team-member",
  version: 2,
  title: "Team member",
  placement: "item",
  props,
  variants: ["default"],
  agent: {
    purpose:
      "One person in a team: their name, their role, a photo of them, and perhaps a sentence about them or a link to their profile",
    avoid: ["photos of anyone other than the person named", "a bio longer than two sentences"],
  },
  placeholder,
  component: TeamMember,
});

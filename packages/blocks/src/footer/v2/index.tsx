import { cx } from "class-variance-authority";

import { type BlockComponentProps, defineBlock } from "../../block.tsx";
import {
  FormView,
  type ResolvedMenuItem,
  Root,
  Text,
  useHref,
  useLogo,
  useMenu,
  useSiteName,
} from "../../components.tsx";
import { form, icon, link, list, optional, text } from "../../fields.ts";
import type { IconName } from "../../icon-names.ts";
import { Icon } from "../../kit/icon.tsx";

const props = {
  note: optional(text({ title: "Note", max: 240, multiline: true })),
  social: optional(
    list({
      title: "Social links",
      item: { icon: icon({ title: "Network" }), link: link({ title: "Profile" }) },
      min: 0,
      max: 8,
    }),
  ),
  newsletterHeading: optional(text({ title: "Sign-up heading", max: 80 })),
  newsletter: optional(form({ title: "Sign-up form" })),
  legal: optional(text({ title: "Small print", max: 240, multiline: true })),
};

type Variant = "columns" | "simple" | "centered" | "wordmark";
type Footer = BlockComponentProps<typeof props, Variant>["props"];

const focus = "focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring";
const quietLink = cx(
  "rounded-sm text-small text-muted-foreground transition-colors hover:text-foreground",
  focus,
);

/** A network's name from its icon's, such as "Linkedin" for linkedin, for screen readers. */
const networkName = (name: IconName) => name.charAt(0).toUpperCase() + name.slice(1);

const SocialLink = ({ item }: { readonly item: NonNullable<Footer["social"]>[number] }) => {
  const href = useHref(item.link);
  return (
    <li>
      <a
        href={href}
        aria-label={networkName(item.icon)}
        className={cx(
          "inline-flex size-9 items-center justify-center rounded-full border border-border text-foreground transition-colors hover:bg-foreground/5",
          focus,
        )}
      >
        <Icon name={item.icon} className="size-4" />
      </a>
    </li>
  );
};

const Social = ({ footer, center }: { readonly footer: Footer; readonly center?: boolean }) =>
  footer.social === undefined || footer.social.length === 0 ? null : (
    <ul
      aria-label="Social links"
      className={cx("flex flex-wrap gap-2", center && "justify-center")}
    >
      {footer.social.map((item) => (
        <SocialLink key={item.id} item={item} />
      ))}
    </ul>
  );

const Brand = ({ className }: { readonly className?: string }) => {
  const name = useSiteName();
  const logo = useLogo();
  return (
    <a
      href="/"
      className={cx(
        "inline-block rounded-sm font-heading text-lead font-semibold",
        focus,
        className,
      )}
    >
      {logo === null ? (
        name
      ) : (
        <>
          <img
            src={logo.light.src}
            width={logo.light.width}
            height={logo.light.height}
            alt={name}
            className={cx("h-8 w-auto", logo.onDark !== null && "on-light-only")}
          />
          {logo.onDark !== null && (
            <img
              src={logo.onDark.src}
              width={logo.onDark.width}
              height={logo.onDark.height}
              alt={name}
              className="on-dark-only h-8 w-auto"
            />
          )}
        </>
      )}
    </a>
  );
};

/**
 * The main menu as columns: each item with children heads a column of them,
 * and the items without any share the first column.
 */
const Columns = ({ items }: { readonly items: ReadonlyArray<ResolvedMenuItem> }) => {
  const single = items.filter((item) => item.children.length === 0);
  const groups = items.filter((item) => item.children.length > 0);
  if (items.length === 0) return null;
  return (
    <nav
      aria-label="Site"
      className="grid grid-cols-2 gap-x-8 gap-y-10 sm:grid-cols-3 lg:grid-cols-4"
    >
      {single.length > 0 && (
        <ul className="flex flex-col gap-3">
          {single.map((item) => (
            <li key={item.id}>
              <a href={item.href} className={cx(quietLink, "text-body text-foreground")}>
                {item.label}
              </a>
            </li>
          ))}
        </ul>
      )}
      {groups.map((group) => (
        <div key={group.id} className="flex flex-col gap-4">
          <a href={group.href} className={cx("rounded-sm text-small font-semibold", focus)}>
            {group.label}
          </a>
          <ul className="flex flex-col gap-3">
            {group.children.map((child) => (
              <li key={child.id}>
                <a href={child.href} className={quietLink}>
                  {child.label}
                </a>
              </li>
            ))}
          </ul>
        </div>
      ))}
    </nav>
  );
};

/** The footer menu's links, such as Privacy and Contact, in a row. */
const LegalLinks = ({ center }: { readonly center?: boolean }) => {
  const menu = useMenu("footer");
  return menu.length === 0 ? null : (
    <nav aria-label="Footer">
      <ul className={cx("flex flex-wrap gap-x-6 gap-y-2", center && "justify-center")}>
        {menu.map((item) => (
          <li key={item.id}>
            <a href={item.href} className={quietLink}>
              {item.label}
            </a>
          </li>
        ))}
      </ul>
    </nav>
  );
};

const Note = ({ footer, className }: { readonly footer: Footer; readonly className?: string }) =>
  footer.note ? (
    <Text
      field="note"
      as="p"
      value={footer.note}
      className={cx("max-w-sm text-small whitespace-pre-line text-muted-foreground", className)}
    />
  ) : null;

const Legal = ({ footer }: { readonly footer: Footer }) =>
  footer.legal ? (
    <Text
      field="legal"
      as="p"
      value={footer.legal}
      className="text-small whitespace-pre-line text-muted-foreground"
    />
  ) : null;

const Newsletter = ({ footer }: { readonly footer: Footer }) =>
  footer.newsletter === undefined ? null : (
    <div className="flex w-full max-w-md flex-col gap-3">
      {footer.newsletterHeading && (
        <Text
          field="newsletterHeading"
          as="p"
          value={footer.newsletterHeading}
          className="font-semibold"
        />
      )}
      <FormView field="newsletter" value={footer.newsletter} layout="inline" />
    </div>
  );

const FooterBlock = ({ props: footer, variant }: BlockComponentProps<typeof props, Variant>) => {
  const name = useSiteName();
  const menu = useMenu("main");
  switch (variant) {
    case "simple":
      return (
        <Root as="footer" className="bg-background py-12 text-foreground">
          <div className="page-width flex flex-col gap-8">
            <div className="flex flex-wrap items-center justify-between gap-6">
              <Brand />
              <LegalLinks />
              <Social footer={footer} />
            </div>
            {(footer.note || footer.legal || footer.newsletter) && (
              <div className="flex flex-wrap items-end justify-between gap-6">
                <div className="flex flex-col gap-2">
                  <Note footer={footer} />
                  <Legal footer={footer} />
                </div>
                <Newsletter footer={footer} />
              </div>
            )}
          </div>
        </Root>
      );
    case "centered":
      return (
        <Root as="footer" className="bg-background py-16 text-foreground">
          <div className="page-width flex flex-col items-center gap-8 text-center">
            <Brand />
            <Note footer={footer} className="mx-auto" />
            <Newsletter footer={footer} />
            <LegalLinks center />
            <Social footer={footer} center />
            <Legal footer={footer} />
          </div>
        </Root>
      );
    case "columns":
    case "wordmark":
      return (
        <Root as="footer" className="overflow-hidden bg-background pt-20 pb-10 text-foreground">
          <div className="page-width flex flex-col gap-16">
            <div className="grid gap-12 lg:grid-cols-[minmax(0,1fr)_minmax(0,2fr)]">
              <div className="flex flex-col items-start gap-6">
                <Brand />
                <Note footer={footer} />
                <Newsletter footer={footer} />
                <Social footer={footer} />
              </div>
              <Columns items={menu} />
            </div>
            <div className="flex flex-col gap-4 border-t border-border pt-8 md:flex-row md:items-center md:justify-between">
              <Legal footer={footer} />
              <LegalLinks />
            </div>
          </div>
          {variant === "wordmark" && (
            <p aria-hidden className="page-width wordmark mt-16 text-foreground">
              {name}
            </p>
          )}
        </Root>
      );
  }
};

export default defineBlock({
  type: "footer",
  version: 2,
  title: "Footer",
  placement: "footer",
  props,
  variants: ["columns", "simple", "centered", "wordmark"],
  surfaces: ["default", "muted", "tint", "brand", "accent", "inverse"],
  agent: {
    purpose:
      "The bottom of every page: the site's menu as columns, a short note, social links, an optional sign-up form and small print",
    avoid: ["a note longer than a sentence or two"],
  },
  changes:
    "Lays the main menu out as columns, and adds social links, a sign-up form, small print, and centered and big-name layouts.",
  migrate: (previous) => previous,
  component: FooterBlock,
});
